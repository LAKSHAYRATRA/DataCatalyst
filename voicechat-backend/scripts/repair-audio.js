import "dotenv/config";
import mongoose from "mongoose";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { fileURLToPath } from "url";
import { CallSession } from "../src/models/CallSession.js"; // Adjust path if needed

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tempDir = path.join(__dirname, "../recordings");

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;

async function getSampleRate(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const audioStream = metadata.streams.find((s) => s.codec_type === "audio");
      if (audioStream && audioStream.sample_rate) {
        resolve(parseInt(audioStream.sample_rate, 10));
      } else {
        resolve(null);
      }
    });
  });
}

async function repairFile(s3Key) {
  if (!s3Key) return;
  console.log(`\nInspecting: ${s3Key}`);
  const fileName = path.basename(s3Key);
  const localTempPath = path.join(tempDir, `temp_${fileName}`);
  const fixedTempPath = path.join(tempDir, `fixed_${fileName}`);

  try {
    // 1. Download from S3
    console.log(`  -> Downloading...`);
    const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key }));
    await pipeline(Body, fs.createWriteStream(localTempPath));

    // 2. Check sample rate
    const sampleRate = await getSampleRate(localTempPath);
    console.log(`  -> Detected Sample Rate: ${sampleRate} Hz`);

    if (sampleRate !== 22050) {
      console.log(`  -> File is not 22050 Hz (it is ${sampleRate} Hz). Skipping repair.`);
      return;
    }

    // 3. Repair audio (correcting the pitch and stretching)
    console.log(`  -> Repairing file (speeding back up to 48000 Hz)...`);
    await new Promise((resolve, reject) => {
      ffmpeg(localTempPath)
        .audioFilters("asetrate=48000") // This changes the playback speed mapping!
        .outputOptions(["-sample_fmt s32"]) // Preserve high depth
        .save(fixedTempPath)
        .on("end", resolve)
        .on("error", reject);
    });

    // 4. Upload back to S3, overwriting the old stretched file
    console.log(`  -> Uploading repaired file back to S3...`);
    const uploader = new Upload({
      client: s3Client,
      params: {
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: fs.createReadStream(fixedTempPath),
        ContentType: "audio/flac",
      },
    });
    await uploader.done();
    console.log(`  -> Successfully repaired and replaced!`);
  } catch (err) {
    if (err.name === "NoSuchKey") {
      console.log(`  -> File not found on S3. Skipping.`);
    } else {
      console.error(`  -> Failed to process ${s3Key}:`, err);
    }
  } finally {
    // Clean up temp files
    if (fs.existsSync(localTempPath)) fs.unlinkSync(localTempPath);
    if (fs.existsSync(fixedTempPath)) fs.unlinkSync(fixedTempPath);
  }
}

async function run() {
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected. Fetching past calls...");

  // Fetch all calls that have recordings
  const calls = await CallSession.find({
    $or: [
      { recordingAFile: { $exists: true, $ne: null } },
      { recordingBFile: { $exists: true, $ne: null } },
      { mixedRecordingFile: { $exists: true, $ne: null } },
    ],
  });

  console.log(`Found ${calls.length} calls with recordings to check.`);

  for (const call of calls) {
    console.log(`\nProcessing Call: ${call.callId}`);
    if (call.recordingAFile) await repairFile(call.recordingAFile);
    if (call.recordingBFile) await repairFile(call.recordingBFile);
    if (call.mixedRecordingFile) await repairFile(call.mixedRecordingFile);
  }

  console.log("\nFinished repairing all files!");
  mongoose.disconnect();
}

run().catch(console.error);
