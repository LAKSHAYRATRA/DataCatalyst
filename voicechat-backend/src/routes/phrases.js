import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import multerS3 from "multer-s3";
import { Phrase } from "../models/Phrase.js";
import { s3Client, BUCKET_NAME } from "../config/s3.js";
import { requireAuth } from "../auth.js";
import {
  uploadPhrases,
  getAvailablePhrase,
  submitPhraseRecording,
  getQaQueue,
  reviewPhrase,
  streamPhraseAudio,
  getAllPhrasesAdmin,
  getContributorStats,
} from "../controllers/phraseController.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is required");

const router = Router();

/**
 * Middleware checks
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) return res.status(403).json({ error: "Admin only" });
  next();
};

const requireQAOrAdmin = (req, res, next) => {
  if (!req.user || (!req.user.isAdmin && !req.user.isQA)) {
    return res.status(403).json({ error: "QA or Admin only" });
  }
  next();
};

/**
 * Multer Config for TTS Phrases
 */
const PHRASE_RECORDINGS_DIR = path.join(process.cwd(), "recordings", "phrases");
const phraseUpload = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: async (req, file, cb) => {
      try {
        const ext = file.mimetype.split("/")[1]?.split(";")[0] || "webm";
        const phraseId = req.body.phraseId || "unknown";
        let companyFolder = "No Company";

        if (phraseId && phraseId !== "unknown") {
            const phrase = await Phrase.findById(phraseId);
            if (phrase && phrase.companyId) {
                companyFolder = String(phrase.companyId).replace(/[^a-zA-Z0-9_\-\ ]/g, "").trim();
            }
        }
        cb(null, `phrases/${companyFolder}/${req.user._id}_${phraseId}_${Date.now()}.${ext}`);
      } catch (err) {
        // Fallback explicitly on network / db mismatch
        cb(null, `phrases/No Company/${req.user._id}_unknown_${Date.now()}.webm`);
      }
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("audio/")) return cb(null, true);
    cb(new Error("Only audio files are allowed"));
  },
});

/* -------------------------------------------------------------------------- */
/*                                 Admin Routes                               */
/* -------------------------------------------------------------------------- */
router.post("/admin/upload", requireAuth(JWT_SECRET), requireAdmin, uploadPhrases);
router.get("/admin/all", requireAuth(JWT_SECRET), requireAdmin, getAllPhrasesAdmin);

/* -------------------------------------------------------------------------- */
/*                                   QA Routes                                */
/* -------------------------------------------------------------------------- */
router.get("/qa/queue", requireAuth(JWT_SECRET), requireQAOrAdmin, getQaQueue);
router.post("/qa/review/:phraseId", requireAuth(JWT_SECRET), requireQAOrAdmin, reviewPhrase);

/* -------------------------------------------------------------------------- */
/*                              Contributor Routes                            */
/* -------------------------------------------------------------------------- */
router.get("/available", requireAuth(JWT_SECRET), getAvailablePhrase);
router.post("/record", requireAuth(JWT_SECRET), phraseUpload.single("recording"), submitPhraseRecording);
router.get("/my-stats", requireAuth(JWT_SECRET), getContributorStats);

/* -------------------------------------------------------------------------- */
/*                           Secure Audio Playback                            */
/* -------------------------------------------------------------------------- */
router.get("/:phraseId/audio", requireAuth(JWT_SECRET), streamPhraseAudio);

export default router;
