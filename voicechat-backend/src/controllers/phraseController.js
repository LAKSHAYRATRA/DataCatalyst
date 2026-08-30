import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import os from "os";
import { Phrase } from "../models/Phrase.js";
import { PhraseRejection } from "../models/PhraseRejection.js";
import { Ambiguity } from "../models/Ambiguity.js";
import { QaFlag } from "../models/QaFlag.js";
import { User } from "../models/User.js";
import { Counter } from "../models/Counter.js";
import { Company } from "../models/Company.js";
import { Language } from "../models/Language.js";
import { Project } from "../models/Project.js";
import { GetObjectCommand, DeleteObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { s3Client, BUCKET_NAME } from "../config/s3.js";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { invokeAudioQC } from "../config/lambda.js";
import { getWavBuffer } from "../utils/ffmpeg-stream.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const PHRASE_RECORDINGS_DIR = path.join(process.cwd(), "recordings", "phrases");

// Ensure directory exists
if (!fs.existsSync(PHRASE_RECORDINGS_DIR)) {
  fs.mkdirSync(PHRASE_RECORDINGS_DIR, { recursive: true });
}

function calculateEbuR128LufsFromPcm(pcmSamples, sampleRate = 48000) {
  if (!pcmSamples || pcmSamples.length === 0) return null;

  const len = pcmSamples.length;
  const filtered = new Float32Array(len);

  // K-Weighting Stage 1: High Shelf Filter (48kHz)
  let f1_z1 = 0, f1_z2 = 0;
  const b0_1 = 1.53512485958697, b1_1 = -2.69169618940638, b2_1 = 1.19839281085285;
  const a1_1 = -1.69065929318241, a2_1 = 0.71623787421588;

  // K-Weighting Stage 2: High Pass RLB Filter
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
    if (ms <= 1e-12) return null;
    return parseFloat((LUFS_OFFSET + 10 * Math.log10(ms)).toFixed(1));
  }

  const blockMeanSquares = [];
  for (let start = 0; start + windowSize <= len; start += stepSize) {
    let sumSq = 0;
    for (let i = start; i < start + windowSize; i++) {
      sumSq += filtered[i] * filtered[i];
    }
    blockMeanSquares.push(sumSq / windowSize);
  }

  if (blockMeanSquares.length === 0) return null;

  const absGatedMs = blockMeanSquares.filter(ms => {
    if (ms <= 1e-12) return false;
    const l = LUFS_OFFSET + 10 * Math.log10(ms);
    return l > -70.0;
  });

  if (absGatedMs.length === 0) return null;

  const absAvgMs = absGatedMs.reduce((a, b) => a + b, 0) / absGatedMs.length;
  const absLufs = LUFS_OFFSET + 10 * Math.log10(absAvgMs);

  const relativeThresholdLufs = absLufs - 10.0;
  const relGatedMs = absGatedMs.filter(ms => {
    const l = LUFS_OFFSET + 10 * Math.log10(ms);
    return l >= relativeThresholdLufs;
  });

  if (relGatedMs.length === 0) return parseFloat(absLufs.toFixed(1));

  const finalAvgMs = relGatedMs.reduce((a, b) => a + b, 0) / relGatedMs.length;
  const finalLufs = LUFS_OFFSET + 10 * Math.log10(finalAvgMs);

  return parseFloat(finalLufs.toFixed(1));
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
    } else if (bitsPerSample === 32) {
      const totalSamples = Math.floor(dataBuffer.length / (4 * numChannels));
      pcmSamples = new Float32Array(totalSamples);
      for (let i = 0; i < totalSamples; i++) {
        let sample = 0;
        for (let ch = 0; ch < numChannels; ch++) {
          sample += dataBuffer.readFloatLE((i * numChannels + ch) * 4);
        }
        pcmSamples[i] = sample / numChannels;
      }
    } else {
      return null;
    }

    return calculateEbuR128LufsFromPcm(pcmSamples, sampleRate);
  } catch (err) {
    console.error("LUFS wav decode error:", err);
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
    console.error("LUFS calculation from audio file failed:", err);
    return null;
  } finally {
    if (fs.existsSync(tempWav)) try { fs.unlinkSync(tempWav); } catch {}
  }
}

export async function resolveCompanyDoc(identifier) {
  if (!identifier) return null;
  const raw = String(identifier).trim();
  if (!raw || raw === "Any") return null;
  const clean = raw.replace(/_downloaded$/i, "").trim();
  const cleanEscaped = clean.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  const rawEscaped = raw.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

  const conditions = [
    mongoose.Types.ObjectId.isValid(raw) ? { _id: raw } : null,
    mongoose.Types.ObjectId.isValid(clean) ? { _id: clean } : null,
    { name: { $regex: new RegExp(`^${cleanEscaped}(_downloaded)?$`, "i") } },
    { name: { $regex: new RegExp(`^${rawEscaped}$`, "i") } },
    { projectName: { $regex: new RegExp(`^${cleanEscaped}$`, "i") } },
    { projectName: { $regex: new RegExp(`^${rawEscaped}$`, "i") } }
  ].filter(Boolean);

  try {
    return await Company.findOne({ $or: conditions }).lean();
  } catch (e) {
    return null;
  }
}

/**
 * Admin: Upload JSON array of phrases
 */
export async function uploadPhrases(req, res) {
  try {
    const { companyId, projectName, language, phrases, metadataKeys, speakerId, assigned_speaker_id } = req.body;
    const batchSpeaker = speakerId ? String(speakerId).trim() : (assigned_speaker_id ? String(assigned_speaker_id).trim() : null);
    if (!companyId || !companyId.trim()) {
      return res.status(400).json({ error: "Company is required when uploading a phrase batch." });
    }
    if (!language || !language.trim()) {
      return res.status(400).json({ error: "Language is required when uploading a phrase batch." });
    }
    if (!Array.isArray(phrases)) {
      return res.status(400).json({ error: "Phrases must be an array" });
    }

    const validPhrases = phrases.filter(p => p && (p.text || p.sentence || p.content || p.phrase || p.transcript));
    if (validPhrases.length === 0) {
      return res.status(400).json({ error: "At least one phrase with valid text content is required to create a phrase project." });
    }

    const cleanLanguage = language.trim().toLowerCase();
    const formattedLangName = cleanLanguage.charAt(0).toUpperCase() + cleanLanguage.slice(1);

    // Auto-register language in Language collection if not present
    await Language.findOneAndUpdate(
      { code: cleanLanguage },
      { 
        $setOnInsert: { code: cleanLanguage, name: formattedLangName, hourlyPayout: 0, enabled: true },
        $set: { isPhrase: true }
      },
      { upsert: true }
    );

    // Resolve target company name (handling both ObjectId and name string)
    let targetCompanyName = companyId ? String(companyId).trim() : null;
    if (targetCompanyName) {
      let comp = null;
      if (targetCompanyName.match(/^[0-9a-fA-F]{24}$/)) {
        comp = await Company.findById(targetCompanyName);
      }
      if (!comp) {
        comp = await Company.findOne({ name: { $regex: new RegExp(`^${targetCompanyName}$`, "i") } });
      }
      if (comp) {
        targetCompanyName = comp.name;
        const compLangs = (comp.languages || []).map(l => String(l).toLowerCase());
        if (!compLangs.includes(cleanLanguage)) {
          comp.languages.push(cleanLanguage);
          await comp.save();
        }
      } else {
        const newComp = await Company.create({ name: targetCompanyName, languages: [cleanLanguage] });
        targetCompanyName = newComp.name;
      }
    }

    // Find the current highest freq index for this company
    const highestFreqPhrase = await Phrase.findOne({ companyId: targetCompanyName, language: cleanLanguage })
      .sort({ freq: -1 })
      .select("freq")
      .lean();
    let currentFreq = highestFreqPhrase && Number.isInteger(highestFreqPhrase.freq) ? highestFreqPhrase.freq : 0;

    // Fetch singlePhraseFrequency setting from Company config (default: 1)
    const companyConfig = await Company.findOne({ name: targetCompanyName }).select("singlePhraseFrequency").lean();
    const targetFreq = companyConfig && Number.isInteger(companyConfig.singlePhraseFrequency) && companyConfig.singlePhraseFrequency >= 1 ? companyConfig.singlePhraseFrequency : 1;

    // Scope existing phrase IDs and texts strictly to this target company and language
    const existingDocs = await Phrase.find({ companyId: targetCompanyName, language: cleanLanguage }).select("phraseId text").lean();
    const existingIds = new Set(existingDocs.map(d => d.phraseId));
    const existingTexts = new Set(existingDocs.map(d => d.text));

    let inserted = 0;
    let duplicates = 0;
    const seenBatchIds = new Set();
    const docsToInsert = [];

    const standardKeys = new Set([
      "id", "phraseid", "_id", "phrase_id", "sentence_id", "sentenceid",
      "text", "sentence", "content", "phrase", "transcript",
      "script_type", "scripttype",
      "speaker_id", "speakerid", "speaker",
      "emotion", "emotions", "style", "intent", "pitch", "speed", "volume", "events",
      "instructions", "instruction", "notes", "metadata"
    ]);

    for (const p of validPhrases) {
      const givenId = p.id || p.phraseId || p._id || p.phrase_id || p.sentence_id || p.sentenceId || `auto_${Date.now()}_${Math.random().toString(36).substring(2,7)}`;
      const cleanId = String(givenId).trim();
      const text = p.text || p.sentence || p.content || p.phrase || p.transcript;

      // Check intra-batch duplicate
      if (seenBatchIds.has(cleanId)) {
        duplicates++;
        continue;
      }
      seenBatchIds.add(cleanId);

      // Check DB duplicates by ID or identical text
      if (existingIds.has(cleanId) || (text && existingTexts.has(text))) {
        duplicates++;
        continue;
      }

      const tags = {};
      for (const [k, val] of Object.entries(p)) {
        const lowerK = k.toLowerCase();
        if (!standardKeys.has(lowerK) && val !== undefined && val !== null) {
          tags[k] = typeof val === "object" ? JSON.stringify(val) : String(val).trim();
        }
      }

      if (Array.isArray(metadataKeys)) {
        for (const key of metadataKeys) {
          const jsonKey = Object.keys(p).find(k => k.toLowerCase() === key.toLowerCase());
          if (jsonKey && p[jsonKey] !== undefined && p[jsonKey] !== null) {
            tags[key] = String(p[jsonKey]).trim();
          }
        }
      }

      // Generate targetFreq phrase copies (1 copy if freq=1, N copies if freq=N)
      for (let cIdx = 1; cIdx <= targetFreq; cIdx++) {
        currentFreq++;
        const copyPhraseId = cIdx === 1 ? cleanId : `${cleanId}_c${cIdx}`;

        const targetSpeaker = batchSpeaker ? String(batchSpeaker).trim() : null;

        docsToInsert.push({
          phraseId: copyPhraseId,
          companyId: targetCompanyName,
          projectName: projectName ? projectName.trim() : null,
          language: cleanLanguage,
          script_type: p.script_type || p.scriptType || null,
          assigned_speaker_id: targetSpeaker || null,
          speaker_id: targetSpeaker || null,
          text: text,
          emotion: p.emotion || p.emotions || null,
          style: p.style || null,
          intent: p.intent || null,
          pitch: p.pitch || null,
          speed: p.speed || null,
          volume: p.volume || null,
          events: p.events ? (Array.isArray(p.events) ? p.events.join(", ") : JSON.stringify(p.events)) : null,
          instructions: p.instructions || p.instruction || p.notes || p.metadata || null,
          freq: currentFreq,
          tags,
        });
      }
    }

    if (docsToInsert.length > 0) {
      await Phrase.insertMany(docsToInsert);
      inserted = docsToInsert.length;
    }

    res.json({ success: true, inserted, duplicates, updated: 0 });
  } catch (error) {
    console.error("uploadPhrases error:", error);
    res.status(500).json({ error: error.message || "Server Error (Backend Crash)" });
  }
}

/**
 * Contributor: Get an available phrase to record
 */
export async function getAvailablePhrase(req, res) {
  try {
    const { language, projectName } = req.query;
    const expiryTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago

    let resolvedProjectName = projectName;
    let compDoc = null;
    if (projectName && projectName !== "Any") {
      compDoc = await Company.findOne({
        $or: [
          { name: projectName },
          { projectName: projectName },
          { name: { $regex: new RegExp(`^${projectName}$`, "i") } },
          { projectName: { $regex: new RegExp(`^${projectName}$`, "i") } }
        ]
      }).lean();
      if (compDoc) {
        resolvedProjectName = compDoc.name;
      }
    }

    const baseQuery = {};
    if (language) {
      baseQuery.language = { $regex: new RegExp(`^${language}$`, "i") };
    }
    if (resolvedProjectName && resolvedProjectName !== "Any") {
      const coreComp = String(resolvedProjectName).replace(/_downloaded$/, "").trim();
      baseQuery.companyId = { $in: [resolvedProjectName, coreComp, `${coreComp}_downloaded`] };
    }

    // Check Limits
    const user = req.user;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const phrasesToday = await Phrase.countDocuments({ contributorId: user._id, recordedAt: { $gte: startOfDay } });
    if (user.dailyPhraseLimit !== -1 && phrasesToday >= (user.dailyPhraseLimit !== undefined ? user.dailyPhraseLimit : 1000)) {
      return res.json({ phrase: null, message: "Daily phrase limit reached. Come back tomorrow!" });
    }

    if (user.overallPhraseLimit !== -1) {
      const overallPhrases = await Phrase.countDocuments({ contributorId: user._id, recordedAt: { $exists: true } });
      if (overallPhrases >= user.overallPhraseLimit) {
        return res.json({ phrase: null, message: "Overall phrase limit reached." });
      }
    }

    // Fetch all companies to get their limits (defaulting to 195 mins = 11700 secs, -1 = unlimited)
    const companies = await Company.find({}).lean();
    const companyLimits = Object.fromEntries(
      companies.map(c => {
        let secs = 195 * 60;
        if (c.maxContributionMinutes !== undefined && c.maxContributionMinutes !== null) {
          const mins = Number(c.maxContributionMinutes);
          secs = mins === -1 || mins < 0 ? -1 : mins * 60;
        }
        return [c.name, secs];
      })
    );

    // Check Company-specific contribution limit & Test Phrase status (language-wise)
    const companyStats = await Phrase.aggregate([
      { $match: { contributorId: user._id, status: { $in: ["recorded", "approved"] }, companyId: { $ne: null } } },
      { $group: { 
          _id: { companyId: "$companyId", language: { $toLower: "$language" } }, 
          totalDuration: { $sum: "$duration" },
          approvedCount: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
          recordedCount: { $sum: { $cond: [{ $eq: ["$status", "recorded"] }, 1, 0] } }
      }}
    ]);

    const reqLang = (language || user.regionalLanguage || "english").trim().toLowerCase();
    
    // Build stats lookup map by companyId and language
    const statsMap = {};
    for (const c of companyStats) {
      if (c._id && c._id.companyId && c._id.language) {
        const compKey = String(c._id.companyId);
        const langKey = String(c._id.language).toLowerCase();
        statsMap[`${compKey}::${langKey}`] = {
          totalDuration: c.totalDuration || 0,
          approvedCount: c.approvedCount || 0,
          recordedCount: c.recordedCount || 0
        };
      }
    }

    const maxedOutCompanies = [];
    const waitingTestCompanies = [];

    const isAppApproved = (compId) => {
      const targetClean = String(compId || "").replace(/_downloaded$/, "").trim().toLowerCase();
      const compObj = companies.find(c => String(c.name || "").toLowerCase().trim() === targetClean || String(c._id) === targetClean);
      const identifiers = [
        targetClean,
        compObj?.name?.toLowerCase()?.trim(),
        compObj?.projectName?.toLowerCase()?.trim(),
        String(compObj?._id || "").toLowerCase()
      ].filter(Boolean);

      return (user.languageApplications || []).some(a => {
          const isPhrase = a.applicationType === "phrase" || !a.applicationType;
          if (!isPhrase || a.status !== "approved") return false;
          const aComp = String(a.companyId || "").replace(/_downloaded$/, "").trim().toLowerCase();
          const compMatches = identifiers.includes(aComp);
          const langMatches = !reqLang || String(a.languageCode || "").trim().toLowerCase() === reqLang;
          return compMatches && langMatches;
      });
    };

    const isAppRejected = (compId) => {
      const targetClean = String(compId || "").replace(/_downloaded$/, "").trim().toLowerCase();
      const compObj = companies.find(c => String(c.name || "").toLowerCase().trim() === targetClean || String(c._id) === targetClean);
      const identifiers = [
        targetClean,
        compObj?.name?.toLowerCase()?.trim(),
        compObj?.projectName?.toLowerCase()?.trim(),
        String(compObj?._id || "").toLowerCase()
      ].filter(Boolean);

      return (user.languageApplications || []).some(a => {
          const isPhrase = a.applicationType === "phrase" || !a.applicationType;
          if (!isPhrase || (a.status !== "rejected" && a.status !== "blocked")) return false;
          const aComp = String(a.companyId || "").replace(/_downloaded$/, "").trim().toLowerCase();
          const compMatches = identifiers.includes(aComp) || !aComp;
          const langMatches = !reqLang || String(a.languageCode || "").trim().toLowerCase() === reqLang;
          return compMatches && langMatches;
      });
    };

    const rejectedCompanyIds = (user.languageApplications || [])
      .filter(a => (a.applicationType === "phrase" || !a.applicationType) && (a.status === "rejected" || a.status === "blocked"))
      .map(a => String(a.companyId || "").replace(/_downloaded$/, "").trim().toLowerCase())
      .filter(Boolean);

    // Evaluate limits for ALL registered companies for the requested language
    for (const comp of companies) {
      const compId = comp.name;
      const key = `${compId}::${reqLang}`;
      const stats = statsMap[key] || { totalDuration: 0, approvedCount: 0, recordedCount: 0 };
      const limitSecs = companyLimits[compId] !== undefined ? companyLimits[compId] : 195 * 60;

      if (limitSecs !== -1 && stats.totalDuration >= limitSecs) {
        maxedOutCompanies.push(compId);
      }
      if (stats.approvedCount === 0 && stats.recordedCount > 0 && !isAppApproved(compId)) {
        waitingTestCompanies.push(compId);
      }
    }

    const blockedCompanies = [...new Set([...maxedOutCompanies, ...waitingTestCompanies, ...rejectedCompanyIds])];

    const activeCompanies = await Phrase.aggregate([
      { $match: { status: { $in: ["pending", "locked", "rejected"] } } },
      { $group: { _id: "$companyId", count: { $sum: 1 } } },
      { $match: { count: { $gte: 1 } } }
    ]);
    const activeNames = activeCompanies.map(c => c._id).filter(Boolean);
    const activeNamesSet = new Set(activeNames.map(n => String(n).toLowerCase()));

    const targetCompLower = String(resolvedProjectName || "").toLowerCase();
    const coreCompLower = targetCompLower.replace(/_downloaded$/, "").trim();
    const isProjectActive = activeNamesSet.has(targetCompLower) || activeNamesSet.has(coreCompLower) || activeNamesSet.has(`${coreCompLower}_downloaded`);

    if (!user.isAdmin && !user.isQA) {
      const userApprovedApps = (user.languageApplications || []).filter(a =>
        (a.applicationType === "phrase" || !a.applicationType) && a.status === "approved"
      );
      if (userApprovedApps.length === 0) {
        return res.json({ phrase: null, phrases: [], message: "You are not approved for any phrase projects yet. Please apply on the project application page first.", redirect: "/language-apply?type=phrase" });
      }
      if (compDoc) {
        if (compDoc.isHidden) {
          return res.json({ phrase: null, phrases: [], message: "This project has been completed and hidden. Please apply for active projects.", redirect: "/language-apply?type=phrase" });
        }
        const hiddenLangs = (compDoc.hiddenLanguages || []).map(l => String(l).toLowerCase().trim());
        if (hiddenLangs.includes(reqLang)) {
          return res.json({ phrase: null, phrases: [], message: "This language is currently hidden for this project. Please apply for other projects/languages.", redirect: "/language-apply?type=phrase" });
        }
      }
      if (resolvedProjectName && resolvedProjectName !== "Any" && !isAppApproved(resolvedProjectName)) {
        return res.json({ phrase: null, phrases: [], message: "You are not approved for this project and language. Please apply on the project application page first.", redirect: "/language-apply?type=phrase" });
      }
    }

    if (resolvedProjectName && resolvedProjectName !== "Any" && !isProjectActive) {
      return res.json({ phrase: null, phrases: [], message: "No phrases available (project is currently inactive or completed).", redirect: (!user.isAdmin && !user.isQA) ? "/language-apply?type=phrase" : null });
    }

    if (resolvedProjectName && blockedCompanies.includes(resolvedProjectName)) {
      if (maxedOutCompanies.includes(resolvedProjectName)) {
        return res.json({ phrase: null, phrases: [], message: "Project/Language limit reached, try some other project/Language", redirect: (!user.isAdmin && !user.isQA) ? "/language-apply?type=phrase" : null });
      } else if (rejectedCompanyIds.includes(String(resolvedProjectName).toLowerCase())) {
        return res.json({ phrase: null, phrases: [], message: "You are not approved for this company's phrases.", redirect: (!user.isAdmin && !user.isQA) ? "/language-apply?type=phrase" : null });
      } else {
        return res.json({ phrase: null, phrases: [], message: `Your test phrase for company ${resolvedProjectName} is currently under review by QA. Please wait for approval before contributing further.` });
      }
    } else {
      if (resolvedProjectName && resolvedProjectName !== "Any") {
        const coreComp = String(resolvedProjectName).replace(/_downloaded$/, "").trim();
        baseQuery.companyId = { $in: [resolvedProjectName, coreComp, `${coreComp}_downloaded`] };
      } else {
        // If user is not admin/QA, restrict "Any" query strictly to companies & languages they are approved for
        if (!user.isAdmin && !user.isQA) {
          const userApprovedApps = (user.languageApplications || []).filter(a =>
            (a.applicationType === "phrase" || !a.applicationType) && a.status === "approved"
          );
          const approvedCompNames = [...new Set(userApprovedApps.map(a => a.companyId).filter(Boolean))];
          baseQuery.companyId = { $in: approvedCompNames };
        } else {
          baseQuery.companyId = { $in: activeNames };
        }
        if (blockedCompanies.length > 0) {
          baseQuery.companyId.$nin = blockedCompanies;
        }
      }
    }

    // If refresh requested, release all currently locked phrases for this user back to pending
    if (req.query.refresh === "true") {
      await Phrase.updateMany(
        { status: "locked", lockedBy: req.user._id },
        { $set: { status: "pending" }, $unset: { lockedBy: "", lockedAt: "" } }
      );
    }

    // Ensure the contributor is never assigned a phrase they currently have recorded, locked, or approved
    const userRecordedDocs = await Phrase.find({
      contributorId: user._id,
      status: { $in: ["recorded", "approved", "locked"] }
    }).select("text phraseId").lean();

    const userDoneTexts = new Set();
    const userDoneBaseIds = new Set();

    const addDoneItem = (textVal, pidVal) => {
      if (textVal) {
        userDoneTexts.add(String(textVal).trim().toLowerCase());
        userDoneTexts.add(String(textVal).trim());
      }
      if (pidVal) {
        const cleanPId = String(pidVal).trim().toLowerCase();
        const baseId = cleanPId.replace(/_c\d+$/, "").trim();
        if (baseId) userDoneBaseIds.add(baseId);
        userDoneBaseIds.add(cleanPId);
      }
    };

    for (const d of userRecordedDocs) addDoneItem(d.text, d.phraseId);

    if (req.query.excludeBaseIds) {
      const extraBaseIds = String(req.query.excludeBaseIds).split(',').map(id => id.trim().toLowerCase()).filter(Boolean);
      for (const bId of extraBaseIds) {
        userDoneBaseIds.add(bId);
        const cleanBId = bId.replace(/_c\d+$/, "").trim();
        if (cleanBId) userDoneBaseIds.add(cleanBId);
      }
    }

    if (req.query.excludeTexts) {
      const extraTexts = String(req.query.excludeTexts).split(',').map(t => t.trim()).filter(Boolean);
      for (const txt of extraTexts) {
        userDoneTexts.add(txt.toLowerCase());
        userDoneTexts.add(txt);
      }
    }

    if (userDoneTexts.size > 0) {
      baseQuery.text = { $nin: Array.from(userDoneTexts) };
    }

    if (userDoneBaseIds.size > 0) {
      const norConditions = Array.from(userDoneBaseIds).map(id => {
        const escaped = id.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        return { phraseId: new RegExp(`^${escaped}(_c\\d+)?$`, "i") };
      });
      baseQuery.$nor = norConditions;
    }

    // Enforce Target Speaker ID restriction:
    // If a phrase is targeted to a specific speaker (assigned_speaker_id or speaker_id), only that exact contributor can receive it.
    // If assigned_speaker_id and speaker_id are unassigned (open pool), any approved contributor can receive it.
    const userSpkId = user.speaker_id ? String(user.speaker_id).trim() : null;
    const openPoolCondition = {
      $and: [
        { $or: [{ assigned_speaker_id: null }, { assigned_speaker_id: "" }, { assigned_speaker_id: { $exists: false } }] },
        { $or: [{ speaker_id: null }, { speaker_id: "" }, { speaker_id: { $exists: false } }] }
      ]
    };
    const speakerCondition = [openPoolCondition];
    if (userSpkId) {
      const escapedSpk = userSpkId.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      speakerCondition.push({ assigned_speaker_id: { $regex: new RegExp(`^${escapedSpk}$`, "i") } });
      speakerCondition.push({ speaker_id: { $regex: new RegExp(`^${escapedSpk}$`, "i") } });
    }
    baseQuery.$and = baseQuery.$and || [];
    baseQuery.$and.push({ $or: speakerCondition });

    // 1. Fetch any phrases already locked for this contributor that haven't expired
    let lockedPhrases = [];
    if (req.query.refresh !== "true" && !req.query.lastEmotion) {
      lockedPhrases = await Phrase.find({
        ...baseQuery,
        status: "locked",
        lockedBy: req.user._id,
        lockedAt: { $gte: expiryTime }
      }).limit(5);
    }

    const needed = 5 - lockedPhrases.length;

    if (needed > 0) {
      const existingIds = lockedPhrases.map(p => p._id);
      if (req.query.excludeIds) {
        const excludes = String(req.query.excludeIds).split(',').map(id => id.trim()).filter(Boolean);
        excludes.forEach(id => {
          if (mongoose.Types.ObjectId.isValid(id)) existingIds.push(new mongoose.Types.ObjectId(id));
        });
      }

      // Track batch base IDs and texts to ensure intra-queue deduplication
      const batchBaseIds = new Set(userDoneBaseIds);
      const batchTexts = new Set(userDoneTexts);

      for (const lp of lockedPhrases) {
        addDoneItem(lp.text, lp.phraseId);
        if (lp.phraseId) {
          const cleanPId = String(lp.phraseId).trim().toLowerCase();
          const baseId = cleanPId.replace(/_c\d+$/, "").trim();
          if (baseId) batchBaseIds.add(baseId);
          batchBaseIds.add(cleanPId);
        }
        if (lp.text) {
          batchTexts.add(String(lp.text).trim().toLowerCase());
          batchTexts.add(String(lp.text).trim());
        }
      }

      // Look up company's configured chronological tag (defaults to "emotion")
      let targetCompany = projectName && projectName !== "Any" ? projectName : null;
      if (!targetCompany && baseQuery.companyId && typeof baseQuery.companyId === 'string') {
        targetCompany = baseQuery.companyId;
      }
      const companyDoc = await resolveCompanyDoc(targetCompany);
      const chronoTag = (companyDoc?.chronologicalTag || "emotion").trim();

      // Get distinct values for the configured chronological tag (e.g. emotion, style, speed)
      const rawTagValues = await Phrase.distinct(chronoTag, {
        ...baseQuery,
        $or: [
          { status: "pending" },
          { status: "rejected" },
          { status: "locked", lockedAt: null },
          { status: "locked", lockedAt: { $lt: expiryTime } }
        ]
      });
      const tagValuesList = rawTagValues.filter(e => e && String(e).trim().length > 0);

      // Determine target tag value search priority
      let searchTagValues = tagValuesList;
      const lastTagVal = req.query.lastTagValue || req.query.lastEmotion;
      if (lastTagVal && tagValuesList.length > 0) {
        const lastIndex = tagValuesList.findIndex(e => String(e).toLowerCase() === String(lastTagVal).toLowerCase());
        const nextIndex = lastIndex >= 0 ? (lastIndex + 1) % tagValuesList.length : 0;
        searchTagValues = [
          ...tagValuesList.slice(nextIndex),
          ...tagValuesList.slice(0, nextIndex)
        ];
      }

      const matchBase = {
        ...baseQuery,
        _id: existingIds.length > 0 ? { $nin: existingIds } : undefined,
        $or: [
          { status: "pending" },
          { status: "rejected" },
          { status: "locked", lockedAt: null },
          { status: "locked", lockedAt: { $lt: expiryTime } }
        ]
      };
      if (!matchBase._id) delete matchBase._id;

      let candidates = [];

      const isCandidateValid = (cand) => {
        if (!cand) return false;
        const candText = cand.text ? String(cand.text).trim().toLowerCase() : "";
        const candPId = cand.phraseId ? String(cand.phraseId).trim().toLowerCase() : "";
        const candBaseId = candPId.replace(/_c\d+$/, "").trim();

        if (candText && batchTexts.has(candText)) return false;
        if (candBaseId && batchBaseIds.has(candBaseId)) return false;
        if (candPId && batchBaseIds.has(candPId)) return false;

        return true;
      };

      const addCandidate = (cand) => {
        if (!isCandidateValid(cand)) return false;
        const candText = cand.text ? String(cand.text).trim().toLowerCase() : "";
        const candPId = cand.phraseId ? String(cand.phraseId).trim().toLowerCase() : "";
        const candBaseId = candPId.replace(/_c\d+$/, "").trim();

        if (candText) {
          batchTexts.add(candText);
          batchTexts.add(String(cand.text).trim());
        }
        if (candBaseId) batchBaseIds.add(candBaseId);
        if (candPId) batchBaseIds.add(candPId);

        candidates.push(cand);
        return true;
      };

      if (searchTagValues.length > 0) {
        for (const tagVal of searchTagValues) {
          if (candidates.length >= needed) break;
          const tagQuery = { ...matchBase, [chronoTag]: tagVal };
          const tagPhrases = await Phrase.find(tagQuery)
            .limit(needed * 5)
            .lean();
          for (const p of tagPhrases) {
            if (candidates.length >= needed) break;
            addCandidate(p);
          }
        }
      }

      // Fallback for phrases without tag or if candidates < needed
      if (candidates.length < needed) {
        const foundIds = [...existingIds, ...candidates.map(c => c._id)];
        const fallbackQuery = {
          ...matchBase,
          _id: { $nin: foundIds }
        };
        const extraPhrases = await Phrase.find(fallbackQuery)
          .limit(needed * 5)
          .lean();
        for (const p of extraPhrases) {
          if (candidates.length >= needed) break;
          addCandidate(p);
        }
      }

      for (const p of candidates) {
        if (lockedPhrases.length >= 5) break;

        const query = { _id: p._id, status: p.status };
        if (p.status === "locked") {
          query.lockedAt = p.lockedAt;
        }

        const newlyLocked = await Phrase.findOneAndUpdate(
          query,
          {
            $set: {
              status: "locked",
              lockedAt: new Date(),
              lockedBy: req.user._id
            }
          },
          { new: true }
        );

        if (newlyLocked) {
          lockedPhrases.push(newlyLocked);
        }
      }
    }

    if (lockedPhrases.length === 0) {
      return res.json({ 
        phrase: null, 
        phrases: [], 
        message: "No phrases available to record for your account right now.",
        redirect: null
      });
    }

    const firstPhrase = lockedPhrases[0];
    const targetComp = firstPhrase?.companyId || req.query.projectName || projectName;
    const companyDoc = await resolveCompanyDoc(targetComp);
    const userCustomizations = companyDoc ? (companyDoc.userCustomizations || []) : [];
    const enforceLufs = companyDoc ? (companyDoc.enforceLufs !== false) : true;

    res.json({ phrase: firstPhrase, phrases: lockedPhrases, userCustomizations, enforceLufs });
  } catch (error) {
    console.error("getAvailablePhrase error:", error);
    res.status(500).json({ error: "Server error" });
  }
}

export async function unlockMyPhrases(req, res) {
  try {
    if (!req.user || !req.user._id) return res.status(401).json({ error: "Unauthorized" });

    const result = await Phrase.updateMany(
      { status: "locked", lockedBy: req.user._id },
      { $set: { status: "pending" }, $unset: { lockedBy: "", lockedAt: "" } }
    );

    res.json({ success: true, unlockedCount: result.modifiedCount });
  } catch (error) {
    console.error("unlockMyPhrases error:", error);
    res.status(500).json({ error: "Server error" });
  }
}

/**
 * Contributor: Check whether a specific phrase was successfully recorded.
 * Used by the client to verify upload success when the response is lost in transit
 * (e.g. S3 upload completes server-side but connection drops before res.json fires).
 */
export async function getPhraseStatus(req, res) {
  try {
    const phrase = await Phrase.findById(req.params.phraseId).select('status contributorId');
    if (!phrase) return res.status(404).json({ error: 'Phrase not found' });
    res.json({ status: phrase.status });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
}

/**
 * Contributor: Submit recording for a phrase
 */
export async function submitPhraseRecording(req, res) {
  try {
    const { phraseId } = req.body;
    if (!phraseId || !req.file) {
      return res.status(400).json({ error: "Missing phraseId or audio file" });
    }

    const phrase = await Phrase.findById(phraseId);
    if (!phrase) {
      // Clean up uploaded file if phrase not found
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: "Phrase not found" });
    }

    // Safety net against race conditions
    if (phrase.status === "recorded" || phrase.status === "approved") {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Phrase has already been successfully recorded." });
    }

    // Guard against collision lock stealing
    if (phrase.status === "locked" && phrase.lockedBy && phrase.lockedBy.toString() !== req.user._id.toString()) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Phrase is currently checked out by another contributor. Please refresh." });
    }

    // Verify speaker allocation if phrase is reserved for a specific speaker ID
    const targetSpk = phrase.assigned_speaker_id || phrase.speaker_id;
    if (targetSpk && String(targetSpk).trim()) {
      const userSpk = req.user.speaker_id ? String(req.user.speaker_id).trim().toLowerCase() : "";
      if (String(targetSpk).trim().toLowerCase() !== userSpk) {
        fs.unlinkSync(req.file.path);
        return res.status(403).json({ error: `This phrase is allocated to speaker ${targetSpk}. You cannot record it.` });
      }
    }

    // Enforce limits strictly at submission time
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const phrasesToday = await Phrase.countDocuments({ contributorId: req.user._id, recordedAt: { $gte: startOfDay } });
    if (req.user.dailyPhraseLimit !== -1 && phrasesToday >= (req.user.dailyPhraseLimit !== undefined ? req.user.dailyPhraseLimit : 1000)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Daily phrase limit reached. Come back tomorrow!" });
    }

    if (req.user.overallPhraseLimit !== -1) {
      const overallPhrases = await Phrase.countDocuments({ contributorId: req.user._id, recordedAt: { $exists: true } });
      if (overallPhrases >= req.user.overallPhraseLimit) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "Overall phrase limit reached." });
      }
    }

    // Enforce Project-specific limits and detect Test Phrases (language-wise)
    let isTestPhrase = false;
    if (phrase.projectName) {
      const projectStats = await Phrase.aggregate([
        { 
          $match: { 
            contributorId: req.user._id, 
            projectName: phrase.projectName, 
            language: { $regex: new RegExp(`^${phrase.language}$`, "i") },
            status: { $in: ["recorded", "approved"] } 
          } 
        },
        { $group: { 
            _id: null, 
            totalDuration: { $sum: "$duration" },
            approvedCount: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } }
        }}
      ]);
      const totalSecs = projectStats.length > 0 ? projectStats[0].totalDuration : 0;
      const approvedCount = projectStats.length > 0 ? projectStats[0].approvedCount : 0;

      if (totalSecs >= 10800) { // 3 hours = 10800 seconds
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: `You have reached the 3-hour maximum contribution limit for project: ${phrase.projectName} in ${phrase.language}.` });
      }

      if (approvedCount === 0) {
        isTestPhrase = true;
      }
    }

    // 1. Convert local WAV to FLAC (lossless — preserve native bit depth)
    // No -ar flag so FFmpeg doesn't run the resampler (which was silently downgrading
    // 24-bit to 16-bit). FFmpeg's FLAC encoder auto-selects s16 for 16-bit input
    // and s32 for 24-bit input, so file sizes stay appropriate for each source.
    const flacPath = req.file.path.replace(".wav", ".flac");
    await new Promise((res, rej) => {
        ffmpeg(req.file.path)
            .audioChannels(1)
            .audioCodec('flac')
            .outputOptions(['-sample_fmt s32'])  // FLAC packs s32 as 24-bit; prevents silent 16-bit downgrade
            .output(flacPath)
            .on("end", res)
            .on("error", rej)
            .run();
    });

    // 2. Upload FLAC to S3 (or fallback to local disk storage if S3 is unreachable)
    const companyFolder = phrase.companyId ? String(phrase.companyId).replace(/[^a-zA-Z0-9_\-\ ]/g, "").trim() : "No Company";
    const s3FileName = `${req.user._id}_${phraseId}_${Date.now()}.flac`;
    const s3Key = `phrases/${companyFolder}/${s3FileName}`;

    try {
      const uploader = new Upload({
          client: s3Client,
          params: {
              Bucket: BUCKET_NAME,
              Key: s3Key,
              Body: fs.createReadStream(flacPath),
              ContentType: "audio/flac",
          },
      });
      await uploader.done();
    } catch (s3Error) {
      console.warn("S3 upload unavailable for phrase recording, saving locally:", s3Error.message);
      const localDir = path.join(process.cwd(), "uploads", "phrases", companyFolder);
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      const localFilePath = path.join(localDir, s3FileName);
      try {
        fs.copyFileSync(flacPath, localFilePath);
      } catch (err) {
        console.error("Failed to save phrase recording locally:", err);
      }
    }

    // 3. Clean up local temp files
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    try { fs.unlinkSync(flacPath); } catch (e) {}

    phrase.status = "recorded";
    phrase.contributorId = req.user._id;

    // Generate/fetch speaker_id for the contributor
    const contributor = await User.findById(req.user._id);
    if (contributor) {
        if (!contributor.speaker_id) {
          const { seq } = await Counter.findOneAndUpdate(
            { _id: "speaker_id" },
            { $inc: { seq: 1 } },
            { upsert: true, new: true }
          );
          contributor.speaker_id = `spk_${seq}`;
          await contributor.save();
        }
      phrase.speaker_id = contributor.speaker_id;
    }
    
    // Calculate LUFS using Node.js EBU R128 BS.1770-4 gated loudness
    let lufsScore = null;
    if (req.body.lufs !== undefined && req.body.lufs !== null && req.body.lufs !== "") {
      lufsScore = parseFloat(req.body.lufs);
    } else if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        const wavBuf = fs.readFileSync(req.file.path);
        lufsScore = calculateLufsFromWavBuffer(wavBuf);
      } catch (err) {
        console.error("Failed to compute LUFS on phrase record:", err);
      }
    }

    phrase.lockedAt = null;
    phrase.lockedBy = null;
    phrase.audioFile = s3Key;
    phrase.recordedAt = new Date();
    phrase.duration = Number(req.body.duration) || 0; 
    phrase.lufs = lufsScore;
    if (lufsScore !== null && lufsScore !== undefined) {
      phrase.qcResult = phrase.qcResult || {};
      phrase.qcResult.freq = phrase.qcResult.freq || {};
      phrase.qcResult.freq.lufs = lufsScore;
      phrase.markModified('qcResult');
    }
    phrase.isTestPhrase = isTestPhrase;
    
    await phrase.save();

    res.json({ success: true, phrase });
  } catch (error) {
    console.error("submitPhraseRecording error:", error);
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(500).json({ error: "Server error" });
  }
}

/**
 * QA: Get queue of recordings
 */
export async function getQaQueue(req, res) {
  try {
    const requestedStatus = req.query.status || "recorded";
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);

    // Dynamic 5-Phrase Batch Queue Lock for QA reviewers
    if (requestedStatus === "recorded" && req.user && req.user.isQA && !req.user.isAdmin) {
      const allowedLangs = Array.isArray(req.user.qaLanguageCodes) && req.user.qaLanguageCodes.length > 0 
          ? req.user.qaLanguageCodes 
          : [req.user.qaLanguageCode];
      const langRegex = allowedLangs.map(l => new RegExp(`^${l}$`, "i"));

      // 1. Release expired QA locks (>15 mins old)
      await Phrase.updateMany(
        { qaLockedAt: { $lt: fifteenMinsAgo } },
        { $set: { qaLockedBy: null, qaLockedAt: null } }
      );

      // 2. Fetch phrases currently locked by THIS QA reviewer
      let lockedForMe = await Phrase.find({
        status: "recorded",
        language: { $in: langRegex },
        qaLockedBy: req.user._id,
        qaLockedAt: { $gte: fifteenMinsAgo }
      })
      .populate("contributorId", "firstname lastname username email speaker_id")
      .sort({ recordedAt: 1, createdAt: 1 });

      // 3. Replenish up to 5 phrases by locking additional available recorded phrases
      const neededCount = 5 - lockedForMe.length;
      if (neededCount > 0) {
        const currentlyLockedIds = lockedForMe.map(p => p._id);
        
        const availablePhrases = await Phrase.find({
          status: "recorded",
          language: { $in: langRegex },
          _id: { $nin: currentlyLockedIds },
          "firstQaReview.qaId": { $ne: req.user._id },
          $or: [
            { qaLockedBy: null },
            { qaLockedBy: req.user._id },
            { qaLockedAt: { $lt: fifteenMinsAgo } }
          ]
        })
        .sort({ recordedAt: 1, createdAt: 1 })
        .limit(neededCount);

        if (availablePhrases.length > 0) {
          const idsToLock = availablePhrases.map(p => p._id);
          const now = new Date();
          
          await Phrase.updateMany(
            { _id: { $in: idsToLock } },
            { $set: { qaLockedBy: req.user._id, qaLockedAt: now } }
          );

          // Re-fetch populated locked list
          lockedForMe = await Phrase.find({
            status: "recorded",
            language: { $in: langRegex },
            qaLockedBy: req.user._id,
            qaLockedAt: { $gte: fifteenMinsAgo }
          })
          .populate("contributorId", "firstname lastname username email speaker_id")
          .sort({ recordedAt: 1, createdAt: 1 });
        }
      }

      const companies = await Company.find({}).lean();
      const companyProjectMap = Object.fromEntries(
        companies.map(c => [c.name, c.projectName])
      );
      const companyAllowEditMap = Object.fromEntries(
        companies.map(c => [c.name, Boolean(c.allowPhraseTextEdit)])
      );

      const phrasesLean = lockedForMe.map(p => (typeof p.toObject === 'function' ? p.toObject() : p));
      for (const p of phrasesLean) {
        if (!p.projectName && p.companyId) {
          p.projectName = companyProjectMap[p.companyId] || p.companyId;
        }
        p.allowPhraseTextEdit = companyAllowEditMap[p.companyId] ?? false;
      }

      return res.json({ phrases: phrasesLean });
    }

    let query = {};
    if (requestedStatus === "edited") {
      if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ error: "Only admins can access edited phrases queue" });
      }
      query = { isEdited: true, editedPhraseStatus: { $nin: ["approved", "rejected"] } };
    } else {
      query = { status: requestedStatus };
    }

    if (req.user && req.user.isQA && !req.user.isAdmin) {
      const allowedLangs = Array.isArray(req.user.qaLanguageCodes) && req.user.qaLanguageCodes.length > 0 
          ? req.user.qaLanguageCodes 
          : [req.user.qaLanguageCode];
      query.language = { $in: allowedLangs.map(l => new RegExp(`^${l}$`, "i")) };
      
      // For approved and rejected tabs, only show phrases reviewed by THIS QA user
      if (requestedStatus === "approved" || requestedStatus === "rejected") {
        query.qaId = req.user._id;
      }
    }

    const phrases = await Phrase.find(query)
      .populate("contributorId", "firstname lastname username email speaker_id")
      .populate("editedBy", "firstname lastname username email")
      .sort({ editedAt: -1, recordedAt: -1, createdAt: -1 })
      .lean();

    // Map companyId to friendly projectName dynamically
    const companies = await Company.find({}).lean();
    const companyProjectMap = Object.fromEntries(
      companies.map(c => [c.name, c.projectName])
    );
    const companyAllowEditMap = Object.fromEntries(
      companies.map(c => [c.name, Boolean(c.allowPhraseTextEdit)])
    );

    for (const p of phrases) {
      if (!p.projectName && p.companyId) {
        p.projectName = companyProjectMap[p.companyId] || p.companyId;
      }
      p.allowPhraseTextEdit = companyAllowEditMap[p.companyId] ?? false;
    }

    res.json({ phrases });
  } catch (error) {
    console.error("getQaQueue error:", error);
    res.status(500).json({ error: "Server error" });
  }
}

/**
 * Update Phrase Text (QA & Admin)
 */
export async function updatePhraseText(req, res) {
  try {
    const { phraseId } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Text cannot be empty" });
    }

    const phrase = await Phrase.findById(phraseId);
    if (!phrase) return res.status(404).json({ error: "Phrase not found" });

    // Permission check: Admin can always edit; QA can edit if company setting is enabled
    if (phrase.companyId) {
      const companyDoc = await Company.findOne({ name: phrase.companyId }).lean();
      if (companyDoc && !companyDoc.allowPhraseTextEdit && !req.user.isAdmin) {
        return res.status(403).json({ error: "Text editing is disabled for this company project" });
      }
    }

    const newText = text.trim();
    if (newText !== phrase.text) {
      if (!phrase.originalText) {
        phrase.originalText = phrase.text; // Store pristine original text
      }
      phrase.text = newText;
      phrase.isEdited = true;
      phrase.editedBy = req.user._id;
      phrase.editedAt = new Date();
      phrase.editedPhraseStatus = "pending_admin";
      await phrase.save();
    }

    res.json({ success: true, message: "Phrase text updated successfully", phrase });
  } catch (error) {
    console.error("updatePhraseText error:", error);
    res.status(500).json({ error: error.message || "Failed to update phrase text" });
  }
}

/**
 * Admin: Review / Approve / Revert edited phrase text & flag conflicts for QA
 */
export async function reviewEditedPhrase(req, res) {
  try {
    const { phraseId } = req.params;
    const { action, adminText, adminNote } = req.body; // action: "approved" | "rejected"

    if (!["approved", "rejected"].includes(action)) {
      return res.status(400).json({ error: "Action must be 'approved' or 'rejected'" });
    }

    const phrase = await Phrase.findById(phraseId);
    if (!phrase) return res.status(404).json({ error: "Phrase not found" });

    // Store initial states for conflict detection
    const initialQaVerdict = phrase.status === "approved" || phrase.status === "rejected" ? phrase.status : "approved";
    const qaUserId = phrase.editedBy || phrase.qaId || phrase.firstQaReview?.qaId;
    const originalScriptText = phrase.originalText || phrase.text;
    const qaEditedScriptText = phrase.text;

    // Apply Admin further script edit if provided
    if (adminText && adminText.trim() && adminText.trim() !== phrase.text) {
      if (!phrase.originalText) phrase.originalText = phrase.text;
      phrase.text = adminText.trim();
      phrase.isEdited = true;
    }

    if (action === "approved") {
      phrase.status = "approved";
      phrase.editedPhraseStatus = "approved";
    } else {
      // Revert text to original on rejection
      if (phrase.originalText) {
        phrase.text = phrase.originalText;
      }
      phrase.status = "rejected";
      phrase.isEdited = false;
      phrase.editedPhraseStatus = "rejected";
    }

    await phrase.save();

    // Check conflict & create QaFlag for QA reviewer
    const isVerdictConflict = (initialQaVerdict !== action);
    const isAdminScriptModified = Boolean(adminText && adminText.trim() !== qaEditedScriptText);

    if (qaUserId && (isVerdictConflict || isAdminScriptModified)) {
      const defaultNote = isVerdictConflict
        ? (action === "approved"
            ? `Admin override: QA rejected phrase, but Admin updated script text to "${phrase.text}" and approved it.`
            : `Admin override: QA approved phrase script, but Admin rejected it upon quality review.`)
        : `Admin modified script text further to "${phrase.text}".`;

      await QaFlag.create({
        qaId: qaUserId,
        type: "phrase",
        itemId: phrase.phraseId || phrase._id.toString(),
        qaVerdict: initialQaVerdict,
        adminVerdict: action,
        isOverridden: isVerdictConflict,
        originalText: originalScriptText,
        qaText: qaEditedScriptText,
        adminText: phrase.text,
        note: adminNote && adminNote.trim() ? adminNote.trim() : defaultNote,
        resolvedBy: req.user._id
      });
    }

    res.json({ success: true, message: `Edited phrase ${action} successfully`, phrase });
  } catch (error) {
    console.error("reviewEditedPhrase error:", error);
    res.status(500).json({ error: error.message || "Failed to review edited phrase" });
  }
}

/**
 * Admin: Bulk approve all pending edited phrases waiting for admin review
 */
export async function approveAllEditedPhrases(req, res) {
  try {
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({ error: "Only admins can approve edited phrases" });
    }

    const { filterProject, filterLanguage } = req.body || {};

    const query = {
      isEdited: true,
      editedPhraseStatus: { $nin: ["approved", "rejected"] }
    };

    if (filterLanguage && filterLanguage !== "All") {
      query.language = new RegExp(`^${filterLanguage.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, "i");
    }

    let phrases = await Phrase.find(query);

    // If filterProject is provided and not "All", filter matching phrases by project / companyId
    if (filterProject && filterProject !== "All") {
      const companies = await Company.find({}).lean();
      const matchingCompanyNames = companies
        .filter(c => (c.projectName || c.name) === filterProject)
        .map(c => c.name);

      phrases = phrases.filter(p => {
        const projName = p.projectName || p.companyId;
        return projName === filterProject || matchingCompanyNames.includes(p.companyId);
      });
    }

    if (phrases.length === 0) {
      return res.json({ success: true, count: 0, message: "No pending edited phrases to approve" });
    }

    const phraseIds = phrases.map(p => p._id);

    await Phrase.updateMany(
      { _id: { $in: phraseIds } },
      {
        $set: {
          status: "approved",
          editedPhraseStatus: "approved"
        }
      }
    );

    res.json({
      success: true,
      count: phrases.length,
      message: `Successfully approved ${phrases.length} pending edited phrases`
    });
  } catch (error) {
    console.error("approveAllEditedPhrases error:", error);
    res.status(500).json({ error: error.message || "Failed to approve all edited phrases" });
  }
}

/**
 * QA: Pass or Reject a phrase
 */
export async function reviewPhrase(req, res) {
  try {
    const { phraseId } = req.params;
    const { action, comment } = req.body; // action: 'approve' | 'reject'

    const phrase = await Phrase.findById(phraseId);
    if (!phrase) return res.status(404).json({ error: "Not found" });

    // Validate Language
    if (req.user && req.user.isQA && !req.user.isAdmin) {
      const allowedLangs = Array.isArray(req.user.qaLanguageCodes) && req.user.qaLanguageCodes.length > 0 
          ? req.user.qaLanguageCodes 
          : [req.user.qaLanguageCode];
      
      const isAllowed = allowedLangs.some(l => 
        l && phrase.language && l.toLowerCase() === phrase.language.toLowerCase()
      );
      if (!isAllowed) {
        return res.status(403).json({ error: "Forbidden: You are not assigned to review this language." });
      }
    }

    const qaUser = req.user ? await User.findById(req.user._id).select("hourlyPhrasePayrate").lean() : null;
    const hourlyPhraseRate = Number(qaUser?.hourlyPhrasePayrate) || 0;
    const calcPhrasePayout = Math.round(((phrase.duration || 0) / 3600) * hourlyPhraseRate * 100) / 100;

    if (action === "approve") {
      phrase.status = "approved";
      phrase.qaId = req.user._id;
      phrase.qaComment = comment || null;
      phrase.qaPhrasePayoutUsd = calcPhrasePayout;
      phrase.reviewedAt = new Date();
      phrase.qaLockedBy = null;
      phrase.qaLockedAt = null;

      const contributor = await User.findById(phrase.contributorId);
      if (contributor) {
        if (!contributor.speaker_id) {
          const { seq } = await Counter.findOneAndUpdate(
            { _id: "speaker_id" },
            { $inc: { seq: 1 } },
            { upsert: true, new: true }
          );
          contributor.speaker_id = `spk_${seq}`;
          await contributor.save();
        }
        phrase.speaker_id = contributor.speaker_id;
      }

      await phrase.save();
    } else if (action === "reject") {
      // 1. Record rejection audit log before resetting phrase
      if (phrase.contributorId) {
        try {
          await PhraseRejection.create({
            phraseId: phrase.phraseId,
            companyId: phrase.companyId,
            language: phrase.language,
            contributorId: phrase.contributorId,
            qaId: req.user ? req.user._id : null,
            qaPhrasePayoutUsd: calcPhrasePayout,
            duration: phrase.duration || 0,
            comment: comment || null,
            text: phrase.text,
            rejectedAt: new Date()
          });
        } catch (rejErr) {
          console.error("Failed to log phrase rejection:", rejErr.message);
        }
      }

      // 2. Delete original audio file from S3 completely
      if (phrase.audioFile) {
        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: phrase.audioFile
          }));
        } catch (s3err) {
          console.error("Failed to delete rejected S3 Audio:", s3err);
        }
      }

      // 3. Reset the phrase document directly so it goes back to the recording pipeline
      phrase.status = "pending";
      phrase.contributorId = null;
      phrase.speaker_id = phrase.assigned_speaker_id || null;
      phrase.audioFile = null;
      phrase.duration = 0;
      phrase.recordedAt = null;
      phrase.reviewedAt = null;
      phrase.qaId = null;
      phrase.qaComment = null;
      phrase.qcResult = null;
      phrase.lockedAt = null;
      phrase.lockedBy = null;

      phrase.qaLockedBy = null;
      phrase.qaLockedAt = null;

      await phrase.save();
    } else {
      return res.status(400).json({ error: "Invalid action" });
    }

    // If this is a test phrase, automatically update the user's language application status
    if (phrase.isTestPhrase && phrase.contributorId) {
      const contributor = await User.findById(phrase.contributorId);
      if (contributor) {
        const app = contributor.languageApplications.find(a => 
          a.applicationType === "phrase" &&
          String(a.companyId || "").trim().toLowerCase() === String(phrase.companyId || "").trim().toLowerCase() &&
          String(a.languageCode || "").trim().toLowerCase() === String(phrase.language || "").trim().toLowerCase() &&
          a.status === "pending"
        );
        if (app) {
          app.status = action === "approve" ? "approved" : "rejected";
          app.reviewedAt = new Date();
          app.reviewedBy = req.user._id;
          await contributor.save();
        }
      }
    }

    // 2% Random Dual-QA Cross Audit & Ambiguity Mismatch Tracking
    try {
      if (phrase.needsSecondQaReview && phrase.firstQaReview && String(phrase.firstQaReview.qaId) !== String(req.user._id)) {
        // This is QA 2 doing the blind cross-review!
        const qa1Action = phrase.firstQaReview.action;
        const qa2Action = action;

        if (qa1Action !== qa2Action) {
          // Verdict Mismatch! Create Ambiguity for Admin
          const firstQaUser = await User.findById(phrase.firstQaReview.qaId).lean();
          await Ambiguity.create({
            itemType: "phrase",
            itemId: phrase._id,
            itemIdentifier: phrase.phraseId,
            language: phrase.language,
            companyId: phrase.companyId,
            qa1: phrase.firstQaReview.qaId,
            qa1Action,
            qa1Comment: phrase.firstQaReview.comment || null,
            qa2: req.user._id,
            qa2Action,
            qa2Comment: comment || null,
            audioFile: phrase.audioFile,
            scriptText: phrase.text,
            qaReviews: [
              {
                qaId: phrase.firstQaReview.qaId,
                qaName: firstQaUser ? `${firstQaUser.firstname || ""} ${firstQaUser.lastname || ""}`.trim() || firstQaUser.username : "QA 1 Reviewer",
                qaUsername: firstQaUser?.username || "",
                qaEmail: firstQaUser?.email || "",
                action: qa1Action,
                comment: phrase.firstQaReview.comment,
                reviewedAt: phrase.firstQaReview.reviewedAt
              },
              {
                qaId: req.user._id,
                qaName: `${req.user.firstname || ""} ${req.user.lastname || ""}`.trim() || req.user.username,
                qaUsername: req.user.username,
                qaEmail: req.user.email,
                action: qa2Action,
                comment: comment || null,
                reviewedAt: new Date()
              }
            ],
            status: "pending"
          });
        }
        phrase.needsSecondQaReview = false;
        await phrase.save();
      } else if (!phrase.needsSecondQaReview && Math.random() < 0.02) {
        // 2% chance to flag for Dual-QA Cross Audit
        phrase.needsSecondQaReview = true;
        phrase.firstQaReview = {
          qaId: req.user._id,
          action,
          comment: comment || null,
          reviewedAt: new Date()
        };
        await phrase.save();
      }
    } catch (ambErr) {
      console.error("Phrase Ambiguity dual-audit tracking error:", ambErr);
    }

    res.json({ success: true, phrase });
  } catch (error) {
    console.error("reviewPhrase error:", error);
    res.status(500).json({ error: "Server error" });
  }
}

/**
 * Admin: Bulk approve or reject a list of selected phrase IDs
 */
export async function bulkReviewPhrases(req, res) {
  try {
    const { phraseIds, action, comment } = req.body;
    if (!Array.isArray(phraseIds) || phraseIds.length === 0) {
      return res.status(400).json({ error: "No phrase IDs provided for bulk review." });
    }
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "Action must be 'approve' or 'reject'." });
    }

    const phrases = await Phrase.find({ _id: { $in: phraseIds } });
    if (phrases.length === 0) {
      return res.status(404).json({ error: "No matching phrases found." });
    }

    let processedCount = 0;
    const now = new Date();

    for (const phrase of phrases) {
      if (action === "approve") {
        phrase.status = "approved";
        phrase.qaId = req.user._id;
        phrase.qaComment = comment || "Bulk Admin Approval";
        phrase.reviewedAt = now;
        phrase.qaLockedBy = null;
        phrase.qaLockedAt = null;

        if (phrase.contributorId) {
          const contributor = await User.findById(phrase.contributorId);
          if (contributor) {
            if (!contributor.speaker_id) {
              const { seq } = await Counter.findOneAndUpdate(
                { _id: "speaker_id" },
                { $inc: { seq: 1 } },
                { upsert: true, new: true }
              );
              contributor.speaker_id = `spk_${seq}`;
              await contributor.save();
            }
            phrase.speaker_id = contributor.speaker_id;
          }
        }

        await phrase.save();
        processedCount++;
      } else if (action === "reject") {
        // Log rejection
        if (phrase.contributorId) {
          try {
            await PhraseRejection.create({
              phraseId: phrase.phraseId,
              companyId: phrase.companyId,
              language: phrase.language,
              contributorId: phrase.contributorId,
              qaId: req.user._id,
              duration: phrase.duration || 0,
              comment: comment || "Bulk Admin Rejection",
              text: phrase.text,
              rejectedAt: now
            });
          } catch (rejErr) {
            console.error("Failed to log bulk phrase rejection:", rejErr.message);
          }
        }

        // Delete audio from S3
        if (phrase.audioFile) {
          try {
            await s3Client.send(new DeleteObjectCommand({
              Bucket: BUCKET_NAME,
              Key: phrase.audioFile
            }));
          } catch (s3err) {
            console.error("Failed to delete rejected S3 Audio:", s3err);
          }
        }

        // Reset phrase
        phrase.status = "pending";
        phrase.contributorId = null;
        phrase.speaker_id = phrase.assigned_speaker_id || null;
        phrase.audioFile = null;
        phrase.duration = 0;
        phrase.recordedAt = null;
        phrase.reviewedAt = null;
        phrase.qaId = null;
        phrase.qaComment = null;
        phrase.qcResult = null;
        phrase.lockedAt = null;
        phrase.lockedBy = null;
        phrase.qaLockedBy = null;
        phrase.qaLockedAt = null;

        await phrase.save();
        processedCount++;
      }
    }

    res.json({
      success: true,
      message: `Successfully ${action === "approve" ? "approved" : "rejected"} ${processedCount} phrases.`,
      count: processedCount
    });
  } catch (error) {
    console.error("bulkReviewPhrases error:", error);
    res.status(500).json({ error: error.message || "Failed to bulk review phrases" });
  }
}

/**
 * Secure Audio Streaming (Prevents direct downloads)
 */
export async function streamPhraseAudio(req, res) {
  try {
    const { phraseId } = req.params;
    const phrase = await Phrase.findById(phraseId);

    if (!phrase || !phrase.audioFile) {
      return res.status(404).json({ error: "Audio not found" });
    }

    // Role verification: Allow Admin, QA, or the Contributor who recorded it
    const isQA = req.user.isQA;
    const isAdmin = req.user.isAdmin;
    const isOwner = phrase.contributorId?.toString() === req.user._id;

    if (!isQA && !isAdmin && !isOwner) {
      return res.status(403).json({ error: "Forbidden" });
    }

    try {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: phrase.audioFile, // The explicit AWS object prefix key saved previously
      });
      const s3Doc = await s3Client.send(command);

      res.setHeader("Content-Disposition", "inline");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Type", s3Doc.ContentType || "audio/flac");
      
      s3Doc.Body.on('error', (err) => {
          console.error('S3 Stream error (phrase recording):', err);
      }).pipe(res);
    } catch (error) {
      console.warn("AWS S3 GetObject failed for phrase audio, attempting local fallback:", error.message);
      
      const cleanKey = String(phrase.audioFile || "").replace(/^phrases\//, "");
      const possiblePaths = [
        path.join(process.cwd(), "uploads", phrase.audioFile),
        path.join(process.cwd(), "uploads", "phrases", cleanKey),
        path.join(process.cwd(), phrase.audioFile),
        path.join(process.cwd(), "uploads", path.basename(phrase.audioFile))
      ];

      let foundPath = possiblePaths.find(p => fs.existsSync(p));

      if (!foundPath) {
        const searchBase = path.join(process.cwd(), "uploads", "phrases");
        if (fs.existsSync(searchBase)) {
          const targetBase = path.basename(phrase.audioFile);
          const phraseIdStr = phrase._id.toString();
          const searchDir = (dir) => {
            const items = fs.readdirSync(dir);
            for (const item of items) {
              const full = path.join(dir, item);
              if (fs.statSync(full).isDirectory()) {
                const subFound = searchDir(full);
                if (subFound) return subFound;
              } else if (item === targetBase || item.includes(phraseIdStr)) {
                return full;
              }
            }
            return null;
          };
          foundPath = searchDir(searchBase);

          if (!foundPath) {
            const companyFolder = phrase.companyId ? String(phrase.companyId).replace(/[^a-zA-Z0-9_\-\ ]/g, "").trim() : "No Company";
            const compDir = path.join(searchBase, companyFolder);
            if (fs.existsSync(compDir)) {
              const files = fs.readdirSync(compDir)
                .map(f => ({ name: f, path: path.join(compDir, f), mtime: fs.statSync(path.join(compDir, f)).mtimeMs }))
                .sort((a, b) => b.mtime - a.mtime);
              if (files.length > 0) {
                foundPath = files[0].path;
              }
            }
          }
        }
      }

      if (foundPath && fs.existsSync(foundPath)) {
        const ext = path.extname(foundPath).toLowerCase();
        const mimeType = ext === ".flac" ? "audio/flac" : (ext === ".wav" ? "audio/wav" : "audio/webm");
        res.setHeader("Content-Disposition", "inline");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Type", mimeType);
        return fs.createReadStream(foundPath).pipe(res);
      }

      return res.status(404).json({ error: "Audio file missing on AWS S3 and local storage" });
    }
  } catch (error) {
    console.error("streamPhraseAudio error:", error);
    res.status(500).json({ error: "Server error" });
  }
}

/**
 * Admin: Get all phrases
 */
export async function getAllPhrasesAdmin(req, res) {
  try {
    const phrases = await Phrase.find()
      .populate("contributorId", "firstname lastname username")
      .populate("qaId", "firstname lastname username")
      .sort({ createdAt: -1 })
      .lean();

    // Map companyId to friendly projectName dynamically
    const companies = await Company.find({}).lean();
    const companyProjectMap = Object.fromEntries(
      companies.map(c => [c.name, c.projectName])
    );

    for (const p of phrases) {
      if (!p.projectName && p.companyId) {
        p.projectName = companyProjectMap[p.companyId] || p.companyId;
      }
    }

    res.json({ phrases });
  } catch (error) {
    console.error("getAllPhrasesAdmin error:", error);
    res.status(500).json({ error: "Server error" });
  }
}

/**
 * Contributor: Get my stats (Total approved duration and history)
 */
export async function getContributorStats(req, res) {
  try {
    const userId = req.user._id;

    // Query strictly by the logged-in user's ObjectId to prevent cross-account data leakage
    const phraseQuery = { contributorId: userId };

    const phrases = await Phrase.find(phraseQuery)
      .select("text language status duration recordedAt createdAt qaComment")
      .sort({ recordedAt: -1, createdAt: -1 })
      .lean();

    const formattedPhrases = phrases.map(p => ({
      ...p,
      recordedAt: p.recordedAt || p.createdAt
    }));

    const rejections = await PhraseRejection.find({ contributorId: userId })
      .sort({ rejectedAt: -1 })
      .lean();

    const rejectionItems = await Promise.all(rejections.map(async (r) => {
      let text = r.text;
      if (!text) {
        const origPhrase = await Phrase.findOne({ phraseId: r.phraseId }).select("text").lean();
        text = origPhrase?.text || "Phrase Recording";
      }
      return {
        _id: r._id,
        text,
        language: r.language,
        status: "rejected",
        duration: r.duration || 0,
        recordedAt: r.rejectedAt || r.createdAt,
        qaComment: r.comment
      };
    }));

    const history = [...formattedPhrases, ...rejectionItems].sort((a, b) => new Date(b.recordedAt || 0) - new Date(a.recordedAt || 0));

    const totalSeconds = formattedPhrases
      .filter((p) => p.status === "approved")
      .reduce((sum, p) => sum + (p.duration || 0), 0);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const phrasesToday = history.filter(p => p.recordedAt && new Date(p.recordedAt) >= startOfDay).length;

    res.json({ 
        totalSeconds, 
        history,
        dailyPhraseLimit: req.user.dailyPhraseLimit !== undefined ? req.user.dailyPhraseLimit : 1000,
        phrasesRecordedToday: phrasesToday,
        overallPhraseLimit: req.user.overallPhraseLimit !== undefined ? req.user.overallPhraseLimit : -1,
        totalPhrasesRecorded: history.length
    });
  } catch (error) {
    console.error("getContributorStats error:", error);
    res.status(500).json({ error: "Server error" });
  }
}

/**
 * GET /api/phrases/sample
 * Fetches the very first phrase for a given companyId and language to be used as a sample recording.
 */
export async function getSamplePhrase(req, res) {
  try {
    const { companyId, language } = req.query;
    if (!companyId) {
      return res.status(400).json({ error: "companyId is required" });
    }

    const targetCompany = companyId ? String(companyId).trim() : "";
    const companyDoc = await resolveCompanyDoc(targetCompany);
    const companyName = companyDoc ? companyDoc.name : targetCompany;

    const numberOfSamples = companyDoc?.numberOfSamples && Number(companyDoc.numberOfSamples) >= 1 ? Number(companyDoc.numberOfSamples) : 1;
    const userCustomizations = companyDoc ? (companyDoc.userCustomizations || []) : [];

    const compEscaped = companyName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const cleanEscaped = companyName.replace(/_downloaded$/i, "").trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

    const query = { 
      $or: [
        { companyId: { $regex: new RegExp(`^${compEscaped}$`, "i") } },
        { companyId: { $regex: new RegExp(`^${cleanEscaped}(_downloaded)?$`, "i") } }
      ]
    };
    if (language) {
      query.language = { $regex: new RegExp(`^${language.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, "i") };
    }

    // 1. Fetch any phrases explicitly designated as samples (isSample: true), ordered by sampleSlot
    let samplePhrases = await Phrase.find({ ...query, isSample: true })
      .select("phraseId text language emotion style speed intent pitch volume instructions tags isSample sampleSlot")
      .sort({ sampleSlot: 1, _id: 1 })
      .limit(numberOfSamples)
      .lean();

    // 2. If we need more sample phrases to reach numberOfSamples, pick from remaining phrases
    if (samplePhrases.length < numberOfSamples) {
      const needed = numberOfSamples - samplePhrases.length;
      const existingIds = samplePhrases.map(p => p._id);
      
      const remainingPhrases = await Phrase.aggregate([
        { $match: { ...query, _id: { $nin: existingIds } } },
        { $sample: { size: needed } },
        { $project: { phraseId: 1, text: 1, language: 1, emotion: 1, style: 1, speed: 1, intent: 1, pitch: 1, volume: 1, instructions: 1, tags: 1, isSample: 1, sampleSlot: 1 } }
      ]);

      if (remainingPhrases && remainingPhrases.length > 0) {
        samplePhrases = [...samplePhrases, ...remainingPhrases];
      }
    }

    // 3. Fallback: If still no phrases, query first available
    if (samplePhrases.length === 0) {
      const fallbackPhrases = await Phrase.find(query)
        .sort({ _id: 1 })
        .limit(numberOfSamples)
        .select("phraseId text language emotion style speed intent pitch volume instructions tags isSample sampleSlot")
        .lean();
      samplePhrases = fallbackPhrases || [];
    }

    if (!samplePhrases || samplePhrases.length === 0) {
      return res.status(404).json({ error: "No sample phrase found for this project and language." });
    }

    res.json({
      phrase: samplePhrases[0],
      phrases: samplePhrases,
      numberOfSamples,
      count: samplePhrases.length,
      userCustomizations,
      enforceLufs: companyDoc ? (companyDoc.enforceLufs !== false) : true
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/phrases/admin/approve-rejected
 * Admins can approve a rejected phrase from the S3 Library.
 */
export async function approveRejectedPhrase(req, res) {
  try {
    const { phraseId } = req.body; // Mongo _id
    
    const phrase = await Phrase.findById(phraseId);
    if (!phrase) return res.status(404).json({ error: "Phrase not found" });
    if (phrase.status !== "rejected") return res.status(400).json({ error: "Phrase is not rejected" });

    // Extract the original phraseId from the tagged ID
    const parts = phrase.phraseId.split("_rejected_");
    const originalPhraseId = parts[0];

    // 1. Check if another contributor already successfully recorded it
    const approvedClone = await Phrase.findOne({ phraseId: originalPhraseId, status: "approved" });
    if (approvedClone) {
      return res.status(400).json({ error: "Another contributor has already recorded and been approved for this phrase." });
    }

    // 2. Delete the pending/recorded clone that was spawned during rejection
    await Phrase.deleteMany({ phraseId: originalPhraseId, status: { $ne: "approved" } });

    // 3. Move the S3 file back to the active phrases folder
    let newAudioFile = phrase.audioFile;
    const oldAudioFile = phrase.audioFile;
    if (phrase.audioFile && phrase.audioFile.includes("_rejected")) {
      try {
        const companyFolder = phrase.companyId ? String(phrase.companyId).replace(/[^a-zA-Z0-9_\-\ ]/g, "").trim() : "No_Company";
        const newKey = `phrases/${companyFolder}/${phrase.audioFile.split("/").pop()}`;
        
        await s3Client.send(new CopyObjectCommand({
            Bucket: BUCKET_NAME,
            CopySource: `${BUCKET_NAME}/${phrase.audioFile}`,
            Key: newKey
        }));
        newAudioFile = newKey;
      } catch (s3err) {
        console.error("Failed to move S3 Audio back:", s3err);
      }
    }

    // 4. Update the phrase document to approved
    phrase.status = "approved";
    phrase.phraseId = originalPhraseId;
    phrase.audioFile = newAudioFile;
    phrase.qaComment = "Re-approved by Admin from S3 Library";
    phrase.reviewedAt = new Date();
    phrase.qaId = req.user._id;

    await phrase.save();

    // Only delete original file if copy AND save succeeded
    if (phrase.audioFile && phrase.audioFile !== oldAudioFile) {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: oldAudioFile
        }));
      } catch (s3err) {
        console.error("Failed to delete original S3 Audio after move:", s3err);
      }
    }

    res.json({ success: true, phrase });
  } catch (error) {
    console.error("approveRejectedPhrase error:", error);
    res.status(500).json({ error: "Server error" });
  }
}

/**
 * POST /api/phrases/qa/lufs/:phraseId
 * Calculate and return LUFS for a phrase recording directly in Node.js.
 */
export async function checkPhraseLufs(req, res) {
  let tempInputPath = null;
  try {
    const { phraseId } = req.params;
    const phrase = await Phrase.findById(phraseId);
    if (!phrase) return res.status(404).json({ error: "Phrase not found" });

    if (!phrase.audioFile) {
      return res.status(400).json({ error: "No audio file recorded for this phrase yet." });
    }

    if (phrase.lufs !== null && phrase.lufs !== undefined && req.query.force !== "true") {
      return res.json({ lufs: phrase.lufs, phraseId: phrase._id });
    }

    tempInputPath = path.join(os.tmpdir(), `phrase_lufs_${Date.now()}_${phraseId}.flac`);
    const cleanKey = String(phrase.audioFile || "").replace(/^phrases\//, "");
    const possiblePaths = [
      path.join(process.cwd(), "uploads", phrase.audioFile),
      path.join(process.cwd(), "uploads", "phrases", cleanKey),
      path.join(process.cwd(), "recordings", phrase.audioFile),
      path.join(process.cwd(), "recordings", "phrases", cleanKey),
      path.join(process.cwd(), phrase.audioFile)
    ];
    let localAudio = possiblePaths.find(p => fs.existsSync(p));

    if (localAudio) {
      fs.copyFileSync(localAudio, tempInputPath);
    } else {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: phrase.audioFile, 
      });
      const s3Response = await s3Client.send(command);
      const fileStream = fs.createWriteStream(tempInputPath);
      await new Promise((resolve, reject) => {
        s3Response.Body.pipe(fileStream);
        s3Response.Body.on("error", reject);
        fileStream.on("finish", resolve);
        fileStream.on("error", reject);
      });
    }

    const lufsScore = await calculateLufsFromAudioFile(tempInputPath);

    phrase.lufs = lufsScore;
    if (phrase.qcResult) {
      phrase.qcResult.freq = phrase.qcResult.freq || {};
      phrase.qcResult.freq.lufs = lufsScore;
      phrase.markModified('qcResult');
    }
    await phrase.save();

    res.json({ lufs: lufsScore, phraseId: phrase._id });
  } catch (err) {
    console.error("checkPhraseLufs error:", err);
    res.status(500).json({ error: err.message || "Failed to calculate LUFS" });
  } finally {
    if (tempInputPath && fs.existsSync(tempInputPath)) try { fs.unlinkSync(tempInputPath); } catch {}
  }
}

/**
 * POST /api/phrases/qa/trim/:phraseId
 * QA or Admins can trim long start and long end non-speech silences.
 */
export async function trimPhraseAudio(req, res) {
  let tempOutPath = null;
  try {
    const { phraseId } = req.params;
    const { startTrimSec = 0, endTrimSec } = req.body;

    const phrase = await Phrase.findById(phraseId);
    if (!phrase) return res.status(404).json({ error: "Phrase not found" });
    if (!phrase.audioFile) return res.status(400).json({ error: "No audio file recorded for this phrase." });

    const startSec = Math.max(0, Number(startTrimSec) || 0);
    const endSec = Number(endTrimSec);

    if (isNaN(endSec) || endSec <= startSec) {
      return res.status(400).json({ error: "Invalid trim range: endTrimSec must be greater than startTrimSec." });
    }

    const cleanKey = String(phrase.audioFile || "").replace(/^phrases\//, "");
    const possiblePaths = [
      path.join(process.cwd(), "uploads", phrase.audioFile),
      path.join(process.cwd(), "uploads", "phrases", cleanKey),
      path.join(process.cwd(), "recordings", phrase.audioFile),
      path.join(process.cwd(), "recordings", "phrases", cleanKey),
      path.join(process.cwd(), phrase.audioFile)
    ];
    let localAudio = possiblePaths.find(p => fs.existsSync(p));

    if (!localAudio) {
      const tempDownloadPath = path.join(os.tmpdir(), `phrase_trim_dl_${Date.now()}_${phraseId}.wav`);
      try {
        const s3Resp = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: phrase.audioFile }));
        const fileStream = fs.createWriteStream(tempDownloadPath);
        await new Promise((resolve, reject) => {
          s3Resp.Body.pipe(fileStream);
          s3Resp.Body.on("error", reject);
          fileStream.on("finish", resolve);
          fileStream.on("error", reject);
        });
        localAudio = tempDownloadPath;
      } catch (s3err) {
        return res.status(404).json({ error: "Audio file not found on local disk or S3." });
      }
    }

    // 1. Backup original audio file and metrics if not backed up yet
    if (!phrase.originalAudioFile && phrase.audioFile) {
      const companyFolder = phrase.companyId ? String(phrase.companyId).replace(/[^a-zA-Z0-9_\-\ ]/g, "").trim() : "No_Company";
      const origKey = `phrases/${companyFolder}/orig_${path.basename(phrase.audioFile)}`;
      const origLocalDir = path.join(process.cwd(), "uploads", "phrases", companyFolder);
      if (!fs.existsSync(origLocalDir)) fs.mkdirSync(origLocalDir, { recursive: true });
      const origLocalPath = path.join(process.cwd(), "uploads", origKey);
      
      try {
        fs.copyFileSync(localAudio, origLocalPath);
        phrase.originalAudioFile = origKey;
        phrase.originalDuration = phrase.duration || trimDuration;
        phrase.originalLufs = phrase.lufs;
        phrase.wasAudioTrimmed = true;
      } catch (bkErr) {
        console.warn("Failed to create local original audio backup:", bkErr.message);
      }
    }

    // Always cut from original raw untrimmed audio if available
    let sourceAudio = localAudio;
    if (phrase.originalAudioFile) {
      const origPath = path.join(process.cwd(), "uploads", phrase.originalAudioFile);
      if (fs.existsSync(origPath)) sourceAudio = origPath;
    }

    const trimDuration = parseFloat((endSec - startSec).toFixed(2));
    tempOutPath = path.join(os.tmpdir(), `trimmed_${Date.now()}_${phraseId}.wav`);

    await new Promise((resolve, reject) => {
      ffmpeg(sourceAudio)
        .setStartTime(startSec)
        .setDuration(trimDuration)
        .audioCodec("pcm_s16le")
        .audioFrequency(48000)
        .audioChannels(1)
        .output(tempOutPath)
        .on("end", resolve)
        .on("error", (err) => reject(new Error("FFmpeg trim failed: " + err.message)))
        .run();
    });

    fs.copyFileSync(tempOutPath, localAudio);

    if (phrase.audioFile && !fs.existsSync(path.join(process.cwd(), "uploads", phrase.audioFile))) {
      try {
        const fileStream = fs.createReadStream(localAudio);
        const upload = new Upload({
          client: s3Client,
          params: {
            Bucket: BUCKET_NAME,
            Key: phrase.audioFile,
            Body: fileStream,
            ContentType: "audio/wav",
          },
        });
        await upload.done();
      } catch (s3UpErr) {
        console.error("Failed to re-upload trimmed file to S3:", s3UpErr);
      }
    }

    const newLufs = await calculateLufsFromAudioFile(localAudio);

    phrase.duration = trimDuration;
    phrase.lufs = newLufs;
    phrase.wasAudioTrimmed = true;

    const { verdict } = req.body;
    const isQAOnly = req.user.isQA && !req.user.isAdmin;
    const isAdmin = Boolean(req.user.isAdmin);

    if (verdict === "approved" || verdict === "rejected") {
      phrase.status = verdict;
      phrase.reviewerId = req.user._id;
      phrase.reviewedAt = new Date();
      phrase.wasEdited = true;
    } else if (isQAOnly) {
      phrase.status = "edited";
      phrase.wasEdited = true;
      phrase.editedBy = req.user._id;
      phrase.editedAt = new Date();
    }

    if (phrase.qcResult) {
      phrase.qcResult.freq = phrase.qcResult.freq || {};
      phrase.qcResult.freq.lufs = newLufs;
      phrase.qcResult.duration = trimDuration;
      phrase.markModified("qcResult");
    }
    await phrase.save();

    res.json({
      message: "Phrase audio trimmed successfully",
      phraseId: phrase._id,
      duration: trimDuration,
      lufs: newLufs,
      phrase
    });
  } catch (err) {
    console.error("trimPhraseAudio error:", err);
    res.status(500).json({ error: err.message || "Failed to trim phrase audio." });
  } finally {
    if (tempOutPath && fs.existsSync(tempOutPath)) try { fs.unlinkSync(tempOutPath); } catch {}
  }
}

/**
 * POST /api/phrases/qa/revert-trim/:phraseId
 * Reverts a trimmed audio phrase back to its original untrimmed recording file & metrics.
 */
export async function revertTrimAudio(req, res) {
  try {
    const { phraseId } = req.params;
    const phrase = await Phrase.findById(phraseId);
    if (!phrase) return res.status(404).json({ error: "Phrase not found" });

    if (!phrase.wasAudioTrimmed || !phrase.originalAudioFile) {
      return res.status(400).json({ error: "This phrase has not been trimmed or has no original backup." });
    }

    const origLocalPath = path.join(process.cwd(), "uploads", phrase.originalAudioFile);
    const activeLocalPath = path.join(process.cwd(), "uploads", phrase.audioFile);

    if (fs.existsSync(origLocalPath) && fs.existsSync(activeLocalPath)) {
      fs.copyFileSync(origLocalPath, activeLocalPath);
    }

    phrase.duration = phrase.originalDuration || phrase.duration;
    phrase.lufs = phrase.originalLufs !== null ? phrase.originalLufs : phrase.lufs;
    phrase.wasAudioTrimmed = false;

    if (phrase.qcResult) {
      phrase.qcResult.freq = phrase.qcResult.freq || {};
      phrase.qcResult.freq.lufs = phrase.lufs;
      phrase.qcResult.duration = phrase.duration;
      phrase.markModified("qcResult");
    }

    await phrase.save();

    res.json({
      message: "Phrase audio reverted to original raw recording",
      duration: phrase.duration,
      lufs: phrase.lufs,
      phrase
    });
  } catch (err) {
    console.error("revertTrimAudio error:", err);
    res.status(500).json({ error: err.message || "Failed to revert phrase audio." });
  }
}

/**
 * POST /api/phrases/qa/analyze/:phraseId
 * Run Freq2 audio analysis on a phrase recording.
 */
export async function analyzePhrase(req, res) {
  let tempInputPath = null;
  let plotPath = null;
  try {
    const { phraseId } = req.params;
    const phrase = await Phrase.findById(phraseId);
    if (!phrase) return res.status(404).json({ error: "Phrase not found" });

    // Check if there is cached QC results
    if (phrase.qcResult && req.query.force !== "true") {
      if (phrase.qcResult.freq && (phrase.qcResult.freq.lufs === undefined || phrase.qcResult.freq.lufs === null)) {
        if (phrase.lufs !== null && phrase.lufs !== undefined) {
          phrase.qcResult.freq.lufs = phrase.lufs;
          await Phrase.updateOne({ _id: phraseId }, { $set: { "qcResult.freq.lufs": phrase.lufs } });
          return res.json(phrase.qcResult);
        }
        // If phrase.lufs is also missing/null, bypass cache so we recalculate LUFS
      } else {
        return res.json(phrase.qcResult);
      }
    }

    if (!phrase.audioFile) {
      return res.status(400).json({ error: "No audio file recorded for this phrase yet." });
    }

    let finalQC;

    const runLocalAnalysis = async () => {
      tempInputPath = path.join(os.tmpdir(), `phrase_input_${Date.now()}_${phraseId}.flac`);
      
      const cleanKey = String(phrase.audioFile || "").replace(/^phrases\//, "");
      const possiblePaths = [
        path.join(process.cwd(), "uploads", phrase.audioFile),
        path.join(process.cwd(), "uploads", "phrases", cleanKey),
        path.join(process.cwd(), "recordings", phrase.audioFile),
        path.join(process.cwd(), "recordings", "phrases", cleanKey),
        path.join(process.cwd(), phrase.audioFile)
      ];
      let localAudio = possiblePaths.find(p => fs.existsSync(p));

      if (localAudio) {
        fs.copyFileSync(localAudio, tempInputPath);
      } else {
        const command = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: phrase.audioFile, 
        });
        const s3Response = await s3Client.send(command);
        const fileStream = fs.createWriteStream(tempInputPath);
        await new Promise((resolve, reject) => {
          s3Response.Body.pipe(fileStream);
          s3Response.Body.on("error", reject);
          fileStream.on("finish", resolve);
          fileStream.on("error", reject);
        });
      }

      const PYTHON_BIN = process.env.YAMNET_PYTHON || "python";
      const freqScriptPath = path.resolve(process.cwd(), "..", "python scripts", "freq2.py");
      const freqResult = await new Promise((resolve, reject) => {
        const py = spawn(PYTHON_BIN, [
          freqScriptPath,
          tempInputPath,
          "--json"
        ]);
        let stdout = "";
        let stderr = "";
        py.stdout.on("data", (d) => { stdout += d.toString(); });
        py.stderr.on("data", (d) => { stderr += d.toString(); });
        py.on("close", (code) => {
          if (code !== 0) {
            console.error("[Freq QC] phrase failed:", stderr);
            reject(new Error(`Freq Script exited with code ${code}: ${stderr.slice(0, 300)}`));
            return;
          }
          try {
            const jsonLine = stdout.split("\n").find(l => l.trim().startsWith("{"));
            if (!jsonLine) throw new Error("No JSON object found in Freq Script output");
            resolve(JSON.parse(jsonLine.trim()));
          } catch (e) {
            reject(new Error("Failed to parse Freq Script output: " + e.message));
          }
        });
        py.on("error", reject);
      });

      let plotBase64 = "";
      if (freqResult.plot_path && fs.existsSync(freqResult.plot_path)) {
        plotPath = freqResult.plot_path;
        const plotBuffer = fs.readFileSync(plotPath);
        plotBase64 = plotBuffer.toString("base64");
      }

      let computedLufs = phrase.lufs;
      if (tempInputPath && fs.existsSync(tempInputPath)) {
        try {
          computedLufs = await calculateLufsFromAudioFile(tempInputPath);
        } catch (e) {
          console.error("Failed to decode FLAC for LUFS:", e);
        }
      }

      if (computedLufs !== null && computedLufs !== undefined) {
        phrase.lufs = computedLufs;
        await Phrase.updateOne({ _id: phraseId }, { $set: { lufs: computedLufs } });
      }

      return {
        freq: {
          noise_floor: freqResult.noise_floor_db,
          crest_factor: freqResult.crest_factor,
          bit_depth: freqResult.bit_verdict,
          processing_verdict: freqResult.processing_verdict,
          spectrogram_img: plotBase64 || null,
          lufs: computedLufs
        },
        analyzedAt: new Date()
      };
    };

    if (phrase.audioFile.startsWith("local:") || process.env.LOCAL_QC_FALLBACK === "true" || !process.env.AWS_ACCESS_KEY_ID) {
      finalQC = await runLocalAnalysis();
    } else {
      try {
        // Production: Invoke AWS Lambda Audio QC
        const lambdaResult = await invokeAudioQC({
          bucket: BUCKET_NAME,
          key: phrase.audioFile,
          skip_yamnet: true,
          return_base64_plot: true
        });

        let prodLufs = phrase.lufs;
        if (prodLufs === null || prodLufs === undefined) {
          try {
            tempInputPath = path.join(os.tmpdir(), `phrase_lufs_prod_${Date.now()}_${phraseId}.flac`);
            const s3Res = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: phrase.audioFile }));
            const ws = fs.createWriteStream(tempInputPath);
            await new Promise((res, rej) => {
              s3Res.Body.pipe(ws);
              s3Res.Body.on("error", rej);
              ws.on("finish", res);
              ws.on("error", rej);
            });
            prodLufs = await calculateLufsFromAudioFile(tempInputPath);
            if (prodLufs !== null && prodLufs !== undefined) {
              phrase.lufs = prodLufs;
              await Phrase.updateOne({ _id: phraseId }, { $set: { lufs: prodLufs } });
            }
          } catch (e) {
            console.error("Failed to compute prod LUFS:", e);
          }
        }

        finalQC = {
          freq: {
            noise_floor: lambdaResult.freq.noise_floor,
            crest_factor: lambdaResult.freq.crest_factor,
            bit_depth: lambdaResult.freq.bit_depth,
            processing_verdict: lambdaResult.freq.processing_verdict,
            spectrogram_img: lambdaResult.freq.spectrogram_img || null,
            lufs: prodLufs
          },
          analyzedAt: new Date()
        };
      } catch (lambdaErr) {
        console.warn("AWS Lambda Audio QC failed, falling back to local analysis:", lambdaErr.message);
        finalQC = await runLocalAnalysis();
      }
    }

    phrase.qcResult = finalQC;
    await Phrase.updateOne({ _id: phraseId }, { $set: { qcResult: finalQC } });

    res.json(finalQC);
  } catch (err) {
    console.error("Phrase QC Analysis failed:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (tempInputPath && fs.existsSync(tempInputPath)) try { fs.unlinkSync(tempInputPath); } catch {}
    if (plotPath && fs.existsSync(plotPath)) try { fs.unlinkSync(plotPath); } catch {}
  }
}

/**
 * GET /api/phrases/admin/download-zip/:phraseId
 * Downloads a ZIP bundle for a single phrase containing:
 * 1. audio.wav (or <phraseId>.wav)
 * 2. speaker_metadata.json
 * 3. utterance.json
 */
export async function downloadSinglePhraseZip(req, res) {
  try {
    const { phraseId } = req.params;
    const phrase = await Phrase.findById(phraseId).populate("contributorId").lean();
    if (!phrase) {
      return res.status(404).json({ error: "Phrase not found" });
    }

    if (!phrase.audioFile) {
      return res.status(400).json({ error: "No audio file recorded for this phrase." });
    }

    const contributor = phrase.contributorId || {};
    const speakerId = contributor.speaker_id || phrase.speaker_id || (contributor._id ? `spk_${contributor._id}` : "unknown");

    let age = "unknown";
    if (contributor.dob) {
      const dobDate = new Date(contributor.dob);
      const today = new Date();
      let calculatedAge = today.getFullYear() - dobDate.getFullYear();
      const m = today.getMonth() - dobDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) calculatedAge--;
      if (calculatedAge > 0) age = calculatedAge;
    }

    const speakerMetadata = {
      speaker_id: speakerId,
      firstname: contributor.firstname || "",
      lastname: contributor.lastname || "",
      username: contributor.username || "",
      email: contributor.email || "",
      gender: contributor.gender || "unknown",
      age: age,
      dob: contributor.dob || null,
      locality: contributor.locality || "",
      state: contributor.state || "",
      address: contributor.address || "",
      regionalLanguage: contributor.regionalLanguage || ""
    };

    const utteranceMetadata = {
      phrase_id: phrase.phraseId || phrase.id || String(phrase._id),
      text: phrase.text || "",
      language: phrase.language || "",
      project_name: phrase.projectName || phrase.companyId || "",
      company_id: phrase.companyId || "",
      speaker_id: speakerId,
      emotion: phrase.emotion || null,
      style: phrase.style || null,
      speed: phrase.speed || null,
      intent: phrase.intent || null,
      pitch: phrase.pitch || null,
      volume: phrase.volume || null,
      instructions: phrase.instructions || null,
      is_test_phrase: phrase.isTestPhrase || false,
      status: phrase.status || "pending",
      recorded_at: phrase.recordedAt || null,
      reviewed_at: phrase.reviewedAt || null,
      review_note: phrase.reviewNote || null,
      qc_result: phrase.qcResult || null
    };

    let wavBuffer = null;
    const cleanKey = (phrase.audioFile || "").replace(/^local:/, "").trim();
    const baseName = cleanKey.substring(cleanKey.lastIndexOf("/") + 1);
    const companyFolder = phrase.companyId ? String(phrase.companyId).replace(/[^a-zA-Z0-9_\-\ ]/g, "").trim() : "";

    const localCandidates = [
      path.join(process.cwd(), "uploads", cleanKey),
      path.join(process.cwd(), "uploads", "phrases", companyFolder, baseName),
      path.join(process.cwd(), "uploads", "phrases", cleanKey),
      path.join(process.cwd(), "recordings", "phrases", baseName),
      path.join(process.cwd(), "recordings", "temp", baseName),
      path.join(process.cwd(), "uploads", "phrases", baseName)
    ];

    for (const candidate of localCandidates) {
      if (candidate && fs.existsSync(candidate)) {
        try {
          const fileStream = fs.createReadStream(candidate);
          wavBuffer = await getWavBuffer(fileStream);
          if (wavBuffer) break;
        } catch (err) {
          console.warn("Failed to convert local audio file to WAV:", candidate, err.message);
        }
      }
    }

    if (!wavBuffer) {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: phrase.audioFile,
      });
      const s3Response = await s3Client.send(command);
      wavBuffer = await getWavBuffer(s3Response.Body);
    }

    const safePhraseId = (phrase.phraseId || String(phrase._id)).replace(/[^a-zA-Z0-9_\-]/g, "_");
    const filename = `${safePhraseId}_bundle.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    let ZipArchive;
    try {
      const archiverModule = await import("archiver");
      ZipArchive = archiverModule.ZipArchive || archiverModule.default?.ZipArchive;
      if (!ZipArchive) {
        const { createRequire } = await import("module");
        const require = createRequire(import.meta.url);
        ZipArchive = require("archiver").ZipArchive;
      }
    } catch (err) {
      console.error("Archiver package error:", err);
      return res.status(500).json({ error: "Server missing archiver dependency." });
    }

    const archive = new ZipArchive({ zlib: { level: 0 } });
    archive.on("error", (err) => {
      console.error("Archiver Error:", err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });

    archive.pipe(res);

    archive.append(wavBuffer, { name: `${safePhraseId}.wav` });
    archive.append(Buffer.from(JSON.stringify(speakerMetadata, null, 2)), { name: "speaker_metadata.json" });
    archive.append(Buffer.from(JSON.stringify(utteranceMetadata, null, 2)), { name: "utterance.json" });

    await archive.finalize();
  } catch (error) {
    console.error("downloadSinglePhraseZip error:", error);
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/phrases/admin/delete/:phraseId
 * Admin option to delete phrase or recording:
 * - mode: 'delete-whole' -> Permanently deletes phrase document and audio. Phrase is removed from workloads.
 * - mode: 'delete-recording' -> Deletes audio and resets phrase to status: 'pending', returning it to workloads.
 */
export async function deletePhraseAdmin(req, res) {
  try {
    const { phraseId } = req.params;
    const { mode } = req.body; // 'delete-whole' | 'delete-recording'

    const phrase = await Phrase.findById(phraseId);
    if (!phrase) {
      return res.status(404).json({ error: "Phrase not found" });
    }

    // 1. Delete S3 audio file if present
    if (phrase.audioFile) {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: phrase.audioFile
        }));
      } catch (s3err) {
        console.error("Failed to delete S3 audio file during phrase deletion:", s3err);
      }
    }

    if (mode === "delete-whole") {
      await Phrase.findByIdAndDelete(phraseId);
      return res.json({ success: true, mode: "delete-whole", message: "Phrase deleted permanently from workloads." });
    } else {
      // Default: delete-recording -> Reset phrase back to pending
      phrase.status = "pending";
      phrase.contributorId = null;
      phrase.speaker_id = null;
      phrase.audioFile = null;
      phrase.duration = 0;
      phrase.recordedAt = null;
      phrase.reviewedAt = null;
      phrase.qaId = null;
      phrase.qaComment = null;
      phrase.qcResult = null;
      phrase.lockedAt = null;
      phrase.lockedBy = null;

      await phrase.save();
      return res.json({ success: true, mode: "delete-recording", message: "Recording removed. Phrase returned to workloads." });
    }
  } catch (error) {
    console.error("deletePhraseAdmin error:", error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Admin: Clear all phrases for a company or all phrases
 */
export async function clearCompanyPhrases(req, res) {
  try {
    const { companyId } = req.body;
    const filter = companyId ? { companyId } : {};
    const result = await Phrase.deleteMany(filter);
    res.json({ success: true, deletedCount: result.deletedCount, message: `Deleted ${result.deletedCount} phrase documents.` });
  } catch (error) {
    console.error("clearCompanyPhrases error:", error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Admin: Remove duplicate phrases (keeps the first phrase per unique text/sentence)
 */
export async function deduplicateCompanyPhrases(req, res) {
  try {
    const { companyId } = req.body;
    const filter = companyId ? { companyId } : {};
    
    const allPhrases = await Phrase.find(filter).sort({ createdAt: 1, freq: 1 }).lean();
    const seenTexts = new Set();
    const seenIds = new Set();
    const idsToDelete = [];

    for (const p of allPhrases) {
      const textKey = (p.text || "").trim();
      const idKey = (p.phraseId || "").trim();

      if ((textKey && seenTexts.has(textKey)) || (idKey && seenIds.has(idKey))) {
        idsToDelete.push(p._id);
      } else {
        if (textKey) seenTexts.add(textKey);
        if (idKey) seenIds.add(idKey);
      }
    }

    if (idsToDelete.length > 0) {
      await Phrase.deleteMany({ _id: { $in: idsToDelete } });
    }

    res.json({ success: true, deletedCount: idsToDelete.length, message: `Removed ${idsToDelete.length} duplicate phrases.` });
  } catch (error) {
    console.error("deduplicateCompanyPhrases error:", error);
    res.status(500).json({ error: error.message });
  }
}
