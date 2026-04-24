import fs from "fs";
import path from "path";
import { Phrase } from "../models/Phrase.js";
import { User } from "../models/User.js";
import { Company } from "../models/Company.js";
import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { s3Client, BUCKET_NAME } from "../config/s3.js";
import ffmpeg from "fluent-ffmpeg";

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
    const { companyId, phrases } = req.body;
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
        companyId: companyId || null,
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
        await Phrase.create({ phraseId: String(p.id), ...doc });
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
    const { language } = req.query;
    const expiryTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago

    const baseQuery = {};
    if (language) {
      baseQuery.language = { $regex: new RegExp(`^${language}$`, "i") };
    }

    // Atomically find a pending/expired phrase and lock it immediately
    const phrase = await Phrase.findOneAndUpdate(
      {
        ...baseQuery,
        $or: [
          { status: "pending" },
          { status: "locked", lockedAt: { $lt: expiryTime } },
          { status: "locked", lockedBy: req.user._id }
        ]
      },
      {
        $set: {
          status: "locked",
          lockedAt: new Date(),
          lockedBy: req.user._id
        }
      },
      { new: true, sort: { createdAt: 1 } }
    );

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

    // 1. Convert local WAV to FLAC
    const flacPath = req.file.path.replace(".wav", ".flac");
    await new Promise((res, rej) => {
        ffmpeg(req.file.path)
            .audioChannels(1)
            .audioFrequency(48000)
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

    res.json({ totalSeconds, history });
  } catch (error) {
    console.error("getContributorStats error:", error);
    res.status(500).json({ error: "Server error" });
  }
}
