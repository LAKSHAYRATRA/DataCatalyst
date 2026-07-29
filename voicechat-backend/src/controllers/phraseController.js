import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import os from "os";
import { Phrase } from "../models/Phrase.js";
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

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const PHRASE_RECORDINGS_DIR = path.join(process.cwd(), "recordings", "phrases");

// Ensure directory exists
if (!fs.existsSync(PHRASE_RECORDINGS_DIR)) {
  fs.mkdirSync(PHRASE_RECORDINGS_DIR, { recursive: true });
}

/**
 * Admin: Upload JSON array of phrases
 */
export async function uploadPhrases(req, res) {
  try {
    const { companyId, projectName, language, phrases, metadataKeys } = req.body;
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

    // Natively index new unique companies seamlessly during the bulk ingest
    let targetCompanyName = companyId ? companyId.trim() : null;
    if (targetCompanyName) {
      const companyDoc = await Company.findOneAndUpdate(
        { name: { $regex: new RegExp(`^${targetCompanyName}$`, "i") } },
        { 
          $setOnInsert: { name: targetCompanyName },
          $addToSet: { languages: cleanLanguage }
        },
        { upsert: true, new: true }
      );
      if (companyDoc && companyDoc.name) {
        targetCompanyName = companyDoc.name;
      }
    }

    // Find the current highest freq index for this company
    const highestFreqPhrase = await Phrase.findOne({ companyId: targetCompanyName })
      .sort({ freq: -1 })
      .select("freq")
      .lean();
    let currentFreq = highestFreqPhrase && Number.isInteger(highestFreqPhrase.freq) ? highestFreqPhrase.freq : 0;

    let inserted = 0;
    let duplicates = 0;
    const seenBatchIds = new Set();

    for (const p of validPhrases) {
      const givenId = p.id || p.phraseId || p._id || p.phrase_id || `auto_${Date.now()}_${Math.random().toString(36).substring(2,7)}`;
      const cleanId = String(givenId).trim();

      // Check intra-batch duplicate
      if (seenBatchIds.has(cleanId)) {
        duplicates++;
        continue;
      }
      seenBatchIds.add(cleanId);

      // Check database duplicate for this specific company
      const existing = await Phrase.findOne({ companyId: targetCompanyName, phraseId: cleanId });
      if (existing) {
        duplicates++;
        continue;
      }

      // Flexibly map the text content
      const text = p.text || p.sentence || p.content || p.phrase || p.transcript;

      const tags = {};
      const standardKeys = new Set([
        "id", "phraseid", "_id", "phrase_id",
        "text", "sentence", "content", "phrase", "transcript",
        "script_type", "scripttype",
        "speaker_id", "speakerid", "speaker",
        "emotion", "style", "intent", "pitch", "speed", "volume", "events",
        "instructions", "instruction", "notes", "metadata"
      ]);

      // Auto-extract all custom keys from the JSON object
      for (const [k, val] of Object.entries(p)) {
        const lowerK = k.toLowerCase();
        if (!standardKeys.has(lowerK) && val !== undefined && val !== null) {
          tags[k] = typeof val === "object" ? JSON.stringify(val) : String(val).trim();
        }
      }

      // Apply explicitly declared metadataKeys fallback/override
      if (Array.isArray(metadataKeys)) {
        for (const key of metadataKeys) {
          const jsonKey = Object.keys(p).find(k => k.toLowerCase() === key.toLowerCase());
          if (jsonKey && p[jsonKey] !== undefined && p[jsonKey] !== null) {
            tags[key] = String(p[jsonKey]).trim();
          }
        }
      }

      currentFreq++;
      const doc = {
        phraseId: cleanId,
        companyId: targetCompanyName,
        projectName: projectName ? projectName.trim() : null,
        language: cleanLanguage,
        script_type: p.script_type || p.scriptType || null,
        speaker_id: p.speaker_id || p.speakerId || p.speaker || null,
        text: text,
        emotion: p.emotion || null,
        style: p.style || null,
        intent: p.intent || null,
        pitch: p.pitch || null,
        speed: p.speed || null,
        volume: p.volume || null,
        events: p.events ? (Array.isArray(p.events) ? p.events.join(", ") : JSON.stringify(p.events)) : null,
        instructions: p.instructions || p.instruction || p.notes || p.metadata || null,
        freq: currentFreq,
        tags,
      };

      await Phrase.create(doc);
      inserted++;
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

    const baseQuery = {};
    if (language) {
      baseQuery.language = { $regex: new RegExp(`^${language}$`, "i") };
    }
    if (projectName && projectName !== "Any") {
      baseQuery.companyId = projectName;
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

    // Fetch all companies to get their limits (defaulting to 195 mins = 11700 secs)
    const companies = await Company.find({}).lean();
    const companyLimits = Object.fromEntries(
      companies.map(c => [
        c.name,
        c.maxContributionMinutes !== undefined && c.maxContributionMinutes !== null
          ? Number(c.maxContributionMinutes) * 60
          : 195 * 60
      ])
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
      return (user.languageApplications || []).some(a => 
          a.applicationType === "phrase" && 
          a.status === "approved" && 
          String(a.companyId || "").trim().toLowerCase() === String(compId).trim().toLowerCase() &&
          String(a.languageCode || "").trim().toLowerCase() === reqLang
      );
    };

    // Evaluate limits for ALL registered companies for the requested language
    for (const comp of companies) {
      const compId = comp.name;
      const key = `${compId}::${reqLang}`;
      const stats = statsMap[key] || { totalDuration: 0, approvedCount: 0, recordedCount: 0 };
      const limitSecs = companyLimits[compId] !== undefined ? companyLimits[compId] : 195 * 60;

      if (stats.totalDuration >= limitSecs) {
        maxedOutCompanies.push(compId);
      }
      if (stats.approvedCount === 0 && stats.recordedCount > 0 && !isAppApproved(compId)) {
        waitingTestCompanies.push(compId);
      }
    }

    const blockedCompanies = [...new Set([...maxedOutCompanies, ...waitingTestCompanies])];

    const activeCompanies = await Phrase.aggregate([
      { $match: { status: { $in: ["pending", "locked", "rejected"] } } },
      { $group: { _id: "$companyId", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ]);
    const activeNames = activeCompanies.map(c => c._id).filter(Boolean);

    if (projectName && projectName !== "Any" && !activeNames.includes(projectName)) {
      return res.json({ phrase: null, message: "No phrases available (project is currently inactive)." });
    }

    if (baseQuery.companyId && blockedCompanies.includes(baseQuery.companyId)) {
      if (maxedOutCompanies.includes(baseQuery.companyId)) {
        return res.json({ phrase: null, message: "Project/Language limit reached, try some other project/Language" });
      } else {
        return res.json({ phrase: null, message: `Your test phrase for company ${baseQuery.companyId} is currently under review by QA. Please wait for approval before contributing further.` });
      }
    } else {
      if (baseQuery.companyId) {
        if (Array.isArray(baseQuery.companyId.$nin)) {
          baseQuery.companyId = { $in: activeNames, $nin: baseQuery.companyId.$nin };
        } else {
          baseQuery.companyId = { $in: activeNames };
        }
      } else {
        baseQuery.companyId = { $in: activeNames };
        if (blockedCompanies.length > 0) {
          baseQuery.companyId.$nin = blockedCompanies;
        }
      }
    }

    // 1. First see if the user already has a locked phrase they haven't finished
    let phrase = await Phrase.findOne({
      ...baseQuery,
      status: "locked",
      lockedBy: req.user._id,
      lockedAt: { $gte: expiryTime }
    });

    // 2. If not, pick a random pending (or expired) phrase to prevent contention
    if (!phrase) {
      const randomPhrases = await Phrase.aggregate([
        { 
          $match: { 
            ...baseQuery, 
            $or: [
              { status: "pending" },
              { status: "locked", lockedAt: { $lt: expiryTime } }
            ] 
          } 
        },
        { $sample: { size: 5 } } // Pick a few to try locking
      ]);

      for (const p of randomPhrases) {
        const query = { _id: p._id, status: p.status };
        // CRITICAL: Prevent lock stealing for expired locks. If it was locked, we must ensure
        // no one else updated the lock timestamp since we read it from the aggregation pipeline.
        if (p.status === "locked") {
          query.lockedAt = p.lockedAt;
        }

        phrase = await Phrase.findOneAndUpdate(
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
        if (phrase) break; // Successfully locked one
      }
    }

    if (!phrase) {
      return res.json({ phrase: null, message: "No phrases available" });
    }

    const companyDoc = await Company.findOne({ name: phrase.companyId }).select("userCustomizations").lean();
    const userCustomizations = companyDoc ? companyDoc.userCustomizations : [];

    res.json({ phrase, userCustomizations });
  } catch (error) {
    console.error("getAvailablePhrase error:", error);
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

    // 2. Upload FLAC to S3
    const companyFolder = phrase.companyId ? String(phrase.companyId).replace(/[^a-zA-Z0-9_\-\ ]/g, "").trim() : "No Company";
    const s3Key = `phrases/${companyFolder}/${req.user._id}_${phraseId}_${Date.now()}.flac`;

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
    
    // Clear lock metadata since it is successfully recorded
    phrase.lockedAt = null;
    phrase.lockedBy = null;
    phrase.audioFile = s3Key;
    phrase.recordedAt = new Date();
    // Default duration to 0 if not provided, we can calculate via front-end
    phrase.duration = Number(req.body.duration) || 0; 
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
    const query = { status: "recorded" };
    if (req.user && req.user.isQA && !req.user.isAdmin) {
      const allowedLangs = Array.isArray(req.user.qaLanguageCodes) && req.user.qaLanguageCodes.length > 0 
          ? req.user.qaLanguageCodes 
          : [req.user.qaLanguageCode];
      query.language = { $in: allowedLangs.map(l => new RegExp(`^${l}$`, "i")) };
    }

    const phrases = await Phrase.find(query)
      .populate("contributorId", "firstname lastname username")
      .sort({ recordedAt: 1 })
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
    console.error("getQaQueue error:", error);
    res.status(500).json({ error: "Server error" });
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

    if (action === "approve") {
      phrase.status = "approved";
      phrase.qaId = req.user._id;
      phrase.qaComment = comment || null;
      phrase.reviewedAt = new Date();

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
      // 1. Delete original audio file from S3 completely
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

      // 2. Reset the phrase document directly so it goes back to the recording pipeline
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

    res.json({ success: true, phrase });
  } catch (error) {
    console.error("reviewPhrase error:", error);
    res.status(500).json({ error: "Server error" });
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
      res.setHeader("Content-Type", s3Doc.ContentType || "audio/webm");
      
      s3Doc.Body.on('error', (err) => {
          console.error('S3 Stream error (phrase recording):', err);
      }).pipe(res);
    } catch (error) {
      console.error("AWS S3 GetObject error:", error);
      return res.status(404).json({ error: "File missing on AWS S3" });
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

    const history = await Phrase.find({ contributorId: userId })
      .select("text language status duration recordedAt qaComment")
      .sort({ recordedAt: -1 });

    const totalSeconds = history
      .filter((p) => p.status === "approved")
      .reduce((sum, p) => sum + (p.duration || 0), 0);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const phrasesToday = history.filter(p => p.recordedAt >= startOfDay).length;

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

    let targetCompany = companyId.trim();
    // Resolve Company Name if companyId is a MongoDB ObjectId
    try {
      if (targetCompany.match(/^[0-9a-fA-F]{24}$/)) {
        const companyDoc = await Company.findById(targetCompany);
        if (companyDoc) {
          targetCompany = companyDoc.name;
        }
      }
    } catch (e) {
      // Fallback to query as-is
    }

    const query = { 
      companyId: targetCompany,
      status: { $in: ["pending", "locked", "rejected"] }
    };
    if (language) {
      query.language = language.trim().toLowerCase();
    }

    const phrase = await Phrase.findOne(query).sort({ _id: 1 }).select("phraseId text language emotion style speed intent pitch volume instructions tags").lean();

    if (!phrase) {
      return res.status(404).json({ error: "No sample phrase found for this project and language." });
    }

    const companyDoc = await Company.findOne({ name: targetCompany }).select("userCustomizations").lean();
    const userCustomizations = companyDoc ? companyDoc.userCustomizations : [];

    res.json({ phrase, userCustomizations });
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
      return res.json(phrase.qcResult);
    }

    if (!phrase.audioFile) {
      return res.status(400).json({ error: "No audio file recorded for this phrase yet." });
    }

    let finalQC;

    if (phrase.audioFile.startsWith("local:") || process.env.LOCAL_QC_FALLBACK === "true") {
      // Local fallback (development environment only)
      tempInputPath = path.join(os.tmpdir(), `phrase_input_${Date.now()}_${phraseId}.wav`);
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

      finalQC = {
        freq: {
          noise_floor: freqResult.noise_floor_db,
          crest_factor: freqResult.crest_factor,
          bit_depth: freqResult.bit_verdict,
          processing_verdict: freqResult.processing_verdict,
          spectrogram_img: plotBase64 || null
        },
        analyzedAt: new Date()
      };
    } else {
      // Production: Invoke AWS Lambda Audio QC
      const lambdaResult = await invokeAudioQC({
        bucket: BUCKET_NAME,
        key: phrase.audioFile,
        skip_yamnet: true,
        return_base64_plot: true
      });

      finalQC = {
        freq: {
          noise_floor: lambdaResult.freq.noise_floor,
          crest_factor: lambdaResult.freq.crest_factor,
          bit_depth: lambdaResult.freq.bit_depth,
          processing_verdict: lambdaResult.freq.processing_verdict,
          spectrogram_img: lambdaResult.freq.spectrogram_img || null
        },
        analyzedAt: new Date()
      };
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
