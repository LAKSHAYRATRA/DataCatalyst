import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import os from "os";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { Phrase } from "../src/models/Phrase.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "../src/config/s3.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/voicechat";

function calculateEbuR128LufsFromPcm(pcmSamples, sampleRate = 48000) {
  if (!pcmSamples || pcmSamples.length === 0) return null;
  const len = pcmSamples.length;
  const filtered = new Float32Array(len);
  let f1_z1 = 0, f1_z2 = 0;
  const b0_1 = 1.53512485958697, b1_1 = -2.69169618940638, b2_1 = 1.19839281085285;
  const a1_1 = -1.69065929318241, a2_1 = 0.71623787421588;
  let f2_z1 = 0, f2_z2 = 0;
  const b0_2 = 1.0, b1_2 = -2.0, b2_2 = 1.0;
  const a1_2 = -1.99004745483398, a2_2 = 0.99007225036621;

  for (let i = 0; i < len; i++) {
    const x = pcmSamples[i];
    const y1 = b0_1 * x + f1_z1;
    f1_z1 = b1_1 * x - a1_1 * y1 + f1_z2;
    f1_z2 = b2_1 * x - a2_1 * y1;
    const y2 = b0_2 * y1 + f2_z1;
    f2_z1 = b1_2 * y1 - a1_2 * y2 + f2_z2;
    f2_z2 = b2_2 * y1 - a2_2 * y2;
    filtered[i] = y2;
  }

  const LUFS_OFFSET = -4.391;
  const windowSize = Math.floor(sampleRate * 0.4);
  const stepSize = Math.floor(sampleRate * 0.1);

  if (len < windowSize) {
    let sumSq = 0;
    for (let i = 0; i < len; i++) sumSq += filtered[i] * filtered[i];
    const ms = sumSq / len;
    if (ms <= 1e-6) return null;
    return parseFloat((LUFS_OFFSET + 10 * Math.log10(ms)).toFixed(1));
  }

  const blockMeanSquares = [];
  for (let start = 0; start + windowSize <= len; start += stepSize) {
    let sumSq = 0;
    for (let i = start; i < start + windowSize; i++) sumSq += filtered[i] * filtered[i];
    blockMeanSquares.push(sumSq / windowSize);
  }

  if (blockMeanSquares.length === 0) return null;
  const absGatedMs = blockMeanSquares.filter(ms => ms > 1e-7 && (LUFS_OFFSET + 10 * Math.log10(ms)) > -70.0);
  if (absGatedMs.length === 0) return null;

  const absAvgMs = absGatedMs.reduce((a, b) => a + b, 0) / absGatedMs.length;
  const absLufs = LUFS_OFFSET + 10 * Math.log10(absAvgMs);
  const relThresh = absLufs - 10.0;
  const relGatedMs = absGatedMs.filter(ms => (LUFS_OFFSET + 10 * Math.log10(ms)) >= relThresh);

  if (relGatedMs.length === 0) return parseFloat(absLufs.toFixed(1));
  const finalAvgMs = relGatedMs.reduce((a, b) => a + b, 0) / relGatedMs.length;
  return parseFloat((LUFS_OFFSET + 10 * Math.log10(finalAvgMs)).toFixed(1));
}

function calculateLufsFromWavBuffer(wavBuffer) {
  try {
    if (!wavBuffer || wavBuffer.length < 44) return null;
    const numChannels = wavBuffer.readUInt16LE(22) || 1;
    const sampleRate = wavBuffer.readUInt32LE(24) || 48000;
    const bitsPerSample = wavBuffer.readUInt16LE(34) || 16;

    let offset = 12;
    while (offset < wavBuffer.length - 8) {
      const chunkId = wavBuffer.toString('ascii', offset, offset + 4);
      const chunkSize = wavBuffer.readUInt32LE(offset + 4);
      if (chunkId === 'data') {
        offset += 8;
        break;
      }
      offset += 8 + chunkSize;
    }

    if (offset >= wavBuffer.length) return null;
    const dataBuffer = wavBuffer.subarray(offset);
    let pcmSamples;

    if (bitsPerSample === 16) {
      const totalSamples = Math.floor(dataBuffer.length / (2 * numChannels));
      pcmSamples = new Float32Array(totalSamples);
      for (let i = 0; i < totalSamples; i++) {
        let sample = 0;
        for (let ch = 0; ch < numChannels; ch++) {
          sample += dataBuffer.readInt16LE((i * numChannels + ch) * 2);
        }
        pcmSamples[i] = (sample / numChannels) / 32768.0;
      }
    } else if (bitsPerSample === 24) {
      const totalSamples = Math.floor(dataBuffer.length / (3 * numChannels));
      pcmSamples = new Float32Array(totalSamples);
      for (let i = 0; i < totalSamples; i++) {
        let sample = 0;
        for (let ch = 0; ch < numChannels; ch++) {
          const idx = (i * numChannels + ch) * 3;
          const b0 = dataBuffer[idx];
          const b1 = dataBuffer[idx + 1];
          const b2 = dataBuffer[idx + 2];
          let val = (b2 << 16) | (b1 << 8) | b0;
          if (val & 0x800000) val |= 0xFF000000;
          sample += val;
        }
        pcmSamples[i] = (sample / numChannels) / 8388608.0;
      }
    } else return null;

    return calculateEbuR128LufsFromPcm(pcmSamples, sampleRate);
  } catch (err) {
    return null;
  }
}

async function calculateLufsFromAudioFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const tempWav = path.join(os.tmpdir(), `lufs_temp_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);
  try {
    await new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .format("wav")
        .outputOptions(["-ar 48000", "-acodec pcm_s16le", "-ac 1"])
        .on("error", reject)
        .on("end", resolve)
        .save(tempWav);
    });
    const wavBuf = fs.readFileSync(tempWav);
    return calculateLufsFromWavBuffer(wavBuf);
  } catch (err) {
    return null;
  } finally {
    if (fs.existsSync(tempWav)) try { fs.unlinkSync(tempWav); } catch {}
  }
}

async function backfill() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to DB for LUFS backfill...");
  const phrases = await Phrase.find({ status: { $in: ["recorded", "approved"] }, audioFile: { $ne: null } });
  console.log(`Found ${phrases.length} recorded/approved phrases.`);

  for (const phrase of phrases) {
    let localPath = null;
    const candidates = [
      path.join(process.cwd(), "uploads", phrase.audioFile),
      path.join(process.cwd(), "recordings", phrase.audioFile),
      path.join(process.cwd(), "uploads", "phrases", phrase.audioFile.replace(/^phrases\//, "")),
      path.join(process.cwd(), "recordings", "phrases", phrase.audioFile.replace(/^phrases\//, ""))
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) { localPath = c; break; }
    }

    let tempDownload = null;
    if (!localPath) {
      try {
        tempDownload = path.join(os.tmpdir(), `dl_${Date.now()}_${phrase._id}.flac`);
        const s3Res = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: phrase.audioFile }));
        const ws = fs.createWriteStream(tempDownload);
        await new Promise((res, rej) => {
          s3Res.Body.pipe(ws);
          s3Res.Body.on("error", rej);
          ws.on("finish", res);
          ws.on("error", rej);
        });
        localPath = tempDownload;
      } catch (err) {
        console.warn(`Could not download ${phrase.audioFile}:`, err.message);
      }
    }

    if (localPath && fs.existsSync(localPath)) {
      const lufs = await calculateLufsFromAudioFile(localPath);
      console.log(`Phrase ${phrase.phraseId} (${phrase._id}): LUFS = ${lufs}`);
      phrase.lufs = lufs;
      if (phrase.qcResult) {
        phrase.qcResult.freq = phrase.qcResult.freq || {};
        phrase.qcResult.freq.lufs = lufs;
        phrase.markModified('qcResult');
      }
      await phrase.save();
    }

    if (tempDownload && fs.existsSync(tempDownload)) {
      try { fs.unlinkSync(tempDownload); } catch {}
    }
  }

  console.log("Backfill completed!");
  await mongoose.disconnect();
}

backfill();
