import fs from "fs";
import path from "path";
import { Phrase } from "../models/Phrase.js";
import { User } from "../models/User.js";
import { Company } from "../models/Company.js";
import { Project } from "../models/Project.js";
import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { s3Client, BUCKET_NAME } from "../config/s3.js";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

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
    const { companyId, projectName, phrases } = req.body;
    if (!Array.isArray(phrases)) {
      return res.status(400).json({ error: "Phrases must be an array" });
    }

    // Natively index new unique companies seamlessly during the bulk ingest
    if (companyId && companyId.trim()) {
      const trimmed = companyId.trim();
      await Company.findOneAndUpdate(
        { name: trimmed },
        { name: trimmed },
        { upsert: true }
      );
    }

    // Natively index new unique projects
    if (projectName && projectName.trim()) {
      const trimmedProject = projectName.trim();
      await Project.findOneAndUpdate(
        { name: trimmedProject },
        { $setOnInsert: { name: trimmedProject, languageRates: [] } },
        { upsert: true }
      );
    }

    let inserted = 0;
    let updated = 0;

    for (const p of phrases) {
      // Flexibly map the phrase ID or auto-generate one
      const givenId = p.id || p.phraseId || p._id || p.phrase_id || `auto_${Date.now()}_${Math.random().toString(36).substring(2,7)}`;
      
      // Flexibly map the text content
      const text = p.text || p.sentence || p.content || p.phrase || p.transcript;
      if (!text) continue; // We strictly need at least some text to be read

      const existing = await Phrase.findOne({ phraseId: String(givenId) });
      const doc = {
        companyId: companyId ? companyId.trim() : null,
        projectName: projectName ? projectName.trim() : null,
        language: p.language || p.lang || "english",
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
      };

      if (existing) {
        // Only update if it's still pending (don't overwrite already recorded)
        if (existing.status === "pending") {
          await Phrase.updateOne({ _id: existing._id }, { $set: doc });
          updated++;
        }
      } else {
        await Phrase.create({ phraseId: String(givenId), ...doc });
        inserted++;
      }
    }

    res.json({ success: true, inserted, updated });
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
      baseQuery.projectName = projectName;
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
    const companyLimits = Object.fromEntries(companies.map(c => [c.name, (c.maxContributionMinutes || 195) * 60]));

    // Check Company-specific contribution limit & Test Phrase status
    const companyStats = await Phrase.aggregate([
      { $match: { contributorId: user._id, status: { $in: ["recorded", "approved"] }, companyId: { $ne: null } } },
      { $group: { 
          _id: "$companyId", 
          totalDuration: { $sum: "$duration" },
          approvedCount: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
          recordedCount: { $sum: { $cond: [{ $eq: ["$status", "recorded"] }, 1, 0] } }
      }}
    ]);

    const maxedOutCompanies = [];
    const waitingTestCompanies = [];

    for (const c of companyStats) {
        // Find company limit, default to 11700 (3h 15m) if company not explicitly in DB
        const limitSecs = companyLimits[c._id] || 11700;
        if (c.totalDuration >= limitSecs) maxedOutCompanies.push(c._id);
        if (c.approvedCount === 0 && c.recordedCount > 0) waitingTestCompanies.push(c._id);
    }

    const blockedCompanies = [...new Set([...maxedOutCompanies, ...waitingTestCompanies])];

    if (baseQuery.companyId && blockedCompanies.includes(baseQuery.companyId)) {
      if (maxedOutCompanies.includes(baseQuery.companyId)) {
        return res.json({ phrase: null, message: `You have reached the maximum contribution time limit for company: ${baseQuery.companyId}.` });
      } else {
        return res.json({ phrase: null, message: `Your test phrase for company ${baseQuery.companyId} is currently under review by QA. Please wait for approval before contributing further.` });
      }
    } else if (!baseQuery.companyId && blockedCompanies.length > 0) {
      baseQuery.companyId = { $nin: blockedCompanies };
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

    res.json({ phrase });
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

    // Enforce Project-specific limits and detect Test Phrases
    let isTestPhrase = false;
    if (phrase.projectName) {
      const projectStats = await Phrase.aggregate([
        { $match: { contributorId: req.user._id, projectName: phrase.projectName, status: { $in: ["recorded", "approved"] } } },
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
        return res.status(400).json({ error: `You have reached the 3-hour maximum contribution limit for project: ${phrase.projectName}.` });
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
      .sort({ recordedAt: 1 });
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
      await phrase.save();
    } else if (action === "reject") {
      // 1. Permanently delete the submitted payload to harvest S3 space.
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

      // 2. Freeze the current rejected phrase to permanently maintain the history log
      const originalPhraseId = phrase.phraseId;
      phrase.status = "rejected";
      phrase.phraseId = `${originalPhraseId}_rejected_${Date.now()}`;
      phrase.qaId = req.user._id;
      phrase.audioFile = null; // Ghost the old pointer securely
      phrase.qaComment = comment || null;
      phrase.reviewedAt = new Date();
      await phrase.save();

      // 2. Spawn a pristine clone mapping to the core phraseId to re-enter the queue
      const phraseObj = phrase.toObject();
      delete phraseObj._id;
      delete phraseObj.createdAt;
      delete phraseObj.updatedAt;
      
      const newPhrase = new Phrase({
        ...phraseObj,
        phraseId: originalPhraseId,
        status: "pending",
        contributorId: null,
        lockedAt: null,
        lockedBy: null,
        audioFile: null,
        duration: 0,
        qaId: null,
        qaComment: null,
        recordedAt: null,
        reviewedAt: null
      });
      await newPhrase.save();
    } else {
      return res.status(400).json({ error: "Invalid action" });
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
      
      s3Doc.Body.pipe(res);
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
      .sort({ createdAt: -1 });
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
