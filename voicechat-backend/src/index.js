import "dotenv/config";

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
import http from "http";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";
import multer from "multer";
import multerS3 from "multer-s3";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

// --- Async Route Error Handling Patch ---
// express.Router.Layer was removed in Express 4.19+ / 5.x; skip the monkey-patch
// on those versions since they already propagate async rejections to next(err).
if (express.Router.Layer) {
  const Layer = express.Router.Layer;
  const origHandle = Layer.prototype.handle_request;
  Layer.prototype.handle_request = function handle(req, res, next) {
    const fnReturn = origHandle.apply(this, arguments);
    if (fnReturn && fnReturn.catch) {
      fnReturn.catch(err => next(err));
    }
  };
}
// ----------------------------------------

import { s3Client, BUCKET_NAME } from "./config/s3.js";
import { Upload } from "@aws-sdk/lib-storage";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { pipeline } from "stream/promises";
import { Server } from "socket.io";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { createAdapter } from "@socket.io/redis-adapter";
import { pubClient, subClient, redis } from "./config/redis.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

import { connectDb } from "./db.js";
import { requireAuth, verifyToken } from "./auth.js";
import { requireSignedAgreement } from "./middleware/requireSignedAgreement.js";
import { User } from "./models/User.js";
import { CallSession } from "./models/CallSession.js";
import { Subtopic } from "./models/Subtopic.js";
import { Language } from "./models/Language.js";
import { updateLimitAndBlacklist } from "./services/limitService.js";

// ─── Controllers ──────────────────────────────────────────────────────────────
import {
  checkEmail,
  sendOtp,
  verifyOtp,
  signup,
  loginInitiate,
  makeLogin,
  logout,
  getMe,
  legacyMe,
  forgotPassword,
  resetPassword,
} from "./controllers/authController.js";

import {
  getUserStatus,
  uploadIntroRecording,
  getLanguages,
  getScriptedLanguages,
  getMyLanguageApplications,
  submitLanguageApplication,
  streamLanguageRecording,
  downloadApplicantSamplesZip,
  getTodayCallCount,
  getCallHistory,
  getMyPayout,
  submitFeedback,
  streamRecording,
  getContributorAgreementStatus,
  signContributorAgreement,
  downloadContributorAgreement,
  getKycStatus,
  uploadPanCard,
  updateUpiId,
  updateProfileCompletion,
  updateUserNoiseGate,
} from "./controllers/userController.js";

import {
  analyzeSpeech,
  checkNoise,
  downloadSpeedTest,
  uploadSpeedTest,
} from "./controllers/testController.js";

// ─── External routes ──────────────────────────────────────────────────────────
import adminRoutes from "./routes/admin.js";
import topicsRoutes from "./routes/topics.js";
import scriptedTopicsRoutes from "./routes/scriptedTopics.js";
import supportRoutes from "./routes/support.js";
import phrasesRoutes from "./routes/phrases.js";
import projectsRoutes from "./routes/projects.js";
import turnRoutes from "./routes/turn.js";

// ─── Config ───────────────────────────────────────────────────────────────────
function parseMaxCallMs(value, fallbackMs) {
  if (value == null) return fallbackMs;
  const raw = String(value).trim();
  if (!raw) return fallbackMs;
  if (/^\d+$/.test(raw)) return Number(raw);
  if (/^\d+(\s*\*\s*\d+)+$/.test(raw)) {
    return raw
      .split("*")
      .map((x) => Number(x.trim()))
      .reduce((a, b) => a * b, 1);
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallbackMs;
}

const PORT = Number(process.env.PORT || 3001);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const RECORDINGS_DIR = process.env.RECORDINGS_DIR || "recordings";
const MONGODB_URI = process.env.MONGODB_URI || "";
const JWT_SECRET = process.env.JWT_SECRET || "";
const MAX_CALL_MS = parseMaxCallMs(process.env.MAX_CALL_MS, 20 * 60 * 1000);

if (!JWT_SECRET) throw new Error("JWT_SECRET is required");

// ─── Express setup ────────────────────────────────────────────────────────────
const app = express();

// Trust the NGINX reverse proxy for correct IP rate limiting
app.set("trust proxy", 1);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      const allowedOrigins = [
        FRONTEND_ORIGIN,
        "https://voclara.com",
        "https://www.voclara.com",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000"
      ];
      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith(".netlify.app") ||
        origin.endsWith(".amplifyapp.com") ||
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:")
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    exposedHeaders: ["Content-Disposition"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

// Application Security Routing Shields
app.use(helmet()); 
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20000,
  message: { error: "Global Speed Limit exceeded. Please try again later." },
  validate: { default: false }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 50,
  message: { error: "Security Lockout: Wait 15 minutes before sending another OTP." },
  keyGenerator: (req) => req.body?.email || req.ip,
  validate: { default: false }
});
app.use("/api/", globalLimiter); // Protect generic /api hooks

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

// ─── Multer: noise check (memory, ≤5 MB) ─────────────────────────────────────
const noiseUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("audio/")) return cb(null, true);
    cb(new Error("Only audio files are allowed"));
  },
});

// ─── Multer: intro recording ──────────────────────────────────────────────────
const introUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(process.cwd(), "recordings", "temp");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, `intro_${req.user._id}_${Date.now()}.wav`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("audio/")) return cb(null, true);
    cb(new Error("Only audio files are allowed"));
  },
});

// ─── Multer: KYC PAN card (memory, ≤5 MB, JPG/PNG only) ─────────────────────
const panUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpe?g|png)$/.test(file.mimetype)) return cb(null, true);
    cb(new Error("Only JPG or PNG images are allowed"));
  },
});

// ─── Multer: language application recording ───────────────────────────────────
const langUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(process.cwd(), "recordings", "temp");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, `lang_${req.user?._id || 'user'}_${Date.now()}.wav`);
    }
  }),
  limits: { fileSize: 60 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, true);
  },
});

// Routes
app.get("/health", (req, res) => res.json({ ok: true }));

// Auth
app.post("/api/auth/check-email", authLimiter, checkEmail);
app.post("/api/auth/send-otp", authLimiter, sendOtp);
app.post("/api/auth/verify-otp", authLimiter, verifyOtp);
app.post("/api/auth/signup", authLimiter, signup);
app.post("/api/auth/login/initiate", authLimiter, loginInitiate);
// login handler needs io — wired after server/io are created (see below)
app.post("/api/auth/logout", logout);
app.get("/api/auth/me", requireAuth(JWT_SECRET), getMe);
app.get("/api/me", requireAuth(JWT_SECRET), legacyMe);
app.post("/api/auth/forgot-password", authLimiter, forgotPassword);
app.post("/api/auth/reset-password", authLimiter, resetPassword);

// Test / speed
app.post("/api/test/analyze-speech", analyzeSpeech);
app.post(
  "/api/test/check-noise",
  noiseUpload.single("audio"),
  checkNoise
);
app.get("/api/test/download", downloadSpeedTest);
app.post(
  "/api/test/upload",
  express.raw({ type: "application/octet-stream", limit: "15mb" }),
  uploadSpeedTest
);

// User
app.get("/api/user/status", requireAuth(JWT_SECRET), getUserStatus);
app.post(
  "/api/user/intro-recording",
  requireAuth(JWT_SECRET),
  introUpload.single("recording"),
  uploadIntroRecording
);

// KYC — PAN card collection & UPI
app.get("/api/user/kyc/status", requireAuth(JWT_SECRET), getKycStatus);
app.post(
  "/api/user/kyc/pan",
  requireAuth(JWT_SECRET),
  panUpload.single("panCard"),
  uploadPanCard
);
app.post("/api/user/upi", requireAuth(JWT_SECRET), updateUpiId);
app.patch("/api/user/profile-completion", requireAuth(JWT_SECRET), updateProfileCompletion);

// Contributor Agreement
app.get("/api/user/contributor-agreement/status", requireAuth(JWT_SECRET), getContributorAgreementStatus);
app.post("/api/user/contributor-agreement/sign", requireAuth(JWT_SECRET), signContributorAgreement);
app.get("/api/user/contributor-agreement/download", requireAuth(JWT_SECRET), downloadContributorAgreement);

// Languages
app.get("/api/public/languages", getLanguages);
app.get("/api/languages", requireAuth(JWT_SECRET), getLanguages);
app.get("/api/scripted-languages", getScriptedLanguages);
app.get(
  "/api/language-applications/my",
  requireAuth(JWT_SECRET),
  getMyLanguageApplications
);
app.post(
  "/api/language-applications",
  requireAuth(JWT_SECRET),
  requireSignedAgreement,
  langUpload.any(),
  submitLanguageApplication
);
app.get(
  "/api/language-applications/:userId/:appId/recording",
  requireAuth(JWT_SECRET),
  streamLanguageRecording
);
app.get(
  "/api/language-applications/:userId/:appId/download-zip",
  requireAuth(JWT_SECRET),
  downloadApplicantSamplesZip
);
app.post(
  "/api/language-applications/noise-gate",
  requireAuth(JWT_SECRET),
  updateUserNoiseGate
);

// Calls / history / payouts / feedback
app.get("/api/calls/today-count", requireAuth(JWT_SECRET), getTodayCallCount);
app.get("/api/history", requireAuth(JWT_SECRET), getCallHistory);
app.get("/api/payouts/me", requireAuth(JWT_SECRET), getMyPayout);
app.post("/api/feedback", requireAuth(JWT_SECRET), submitFeedback);
app.get(
  "/api/recordings/:callId/:fileName",
  requireAuth(JWT_SECRET),
  streamRecording
);

// Admin / topics / support (external route modules)
app.use("/api/admin", adminRoutes);
app.use("/api/topics", topicsRoutes);
app.use("/api/scripted-topics", scriptedTopicsRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/phrases", phrasesRoutes);
app.use("/api/projects", projectsRoutes);
app.use("/api/turn", turnRoutes);

// ─── HTTP + Socket.IO server ──────────────────────────────────────────────────
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true,
  },
  maxHttpBufferSize: 20 * 1024 * 1024,
  adapter: createAdapter(pubClient, subClient),
});

// Wire login route now that io exists
app.post("/api/auth/login", authLimiter, makeLogin(io));

// --- Global Express Error Handler ---
app.use((err, req, res, next) => {
  console.error("Global Express Error:", err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
});
// ------------------------------------

// ─── Socket middleware ────────────────────────────────────────────────────────
io.use((socket, next) => {
  const cookies = socket.handshake.headers.cookie;
  let token = null;

  if (cookies) {
    const cookieArray = cookies.split(";").map((c) => c.trim());
    const vcTokenCookie = cookieArray.find((c) => c.startsWith("vc_token="));
    if (vcTokenCookie) token = vcTokenCookie.split("=")[1];
  }

  if (!token) token = socket.handshake.auth?.token;

  if (!token || !JWT_SECRET) {
    next(new Error("unauthorized"));
    return;
  }

  try {
    const payload = verifyToken(token, JWT_SECRET);
    socket.data.userId = payload.sub;
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

// ─── Socket helpers ───────────────────────────────────────────────────────────
const waitingQueue = [];
const calls = new Map();
const activeStreams = new Map();

function removeFromQueue(socketId) {
  const idx = waitingQueue.findIndex((id) => id === socketId);
  if (idx >= 0) waitingQueue.splice(idx, 1);
}

function getCallIdForSocket(socket) {
  return socket.data.callId || null;
}

function getPeerId(socket) {
  return socket.data.peerId || null;
}

async function cleanupRecording(socket, endedAt, callIdOverride) {
  const callId = callIdOverride || socket.data.callId || getCallIdForSocket(socket);
  const streamKey = `${callId}_${socket.data.userId}`;
  const streamObj = activeStreams.get(streamKey);
  const stream = streamObj?.stream;
  const tempPath = streamObj?.tempLocalPath || socket.data.tempLocalPath;
  const filePath = streamObj?.filePath || socket.data.recordFilePath;
  const isRecording = socket.data.recording;

  socket.data.recording = false;
  socket.data.tempLocalPath = null;
  socket.data.recordFilePath = null;
  
  if (streamObj) {
    activeStreams.delete(streamKey);
  }

  if (isRecording && tempPath && filePath) {
    if (streamObj && streamObj.fd) {
      try {
        fs.closeSync(streamObj.fd);
      } catch {}
    }
    if (stream) {
      try {
        stream.end();
      } catch {}
    }
    
    // Give OS disk IO small boundary to flush end bits
    await new Promise(r => setTimeout(r, 100));

    return new Promise(async (resolve) => {
      try {
        let finalUploadPath = tempPath;
        if (tempPath.endsWith(".pcm")) {
          try {
            let session = await CallSession.findOne({ callId });
            const inMemCall = calls.get(callId);
            const now = endedAt || inMemCall?.endedAt || new Date();

            // Atomically freeze session.endedAt so both speakers use the exact same master end timestamp
            if (session && !session.endedAt) {
              const updatedSession = await CallSession.findOneAndUpdate(
                { _id: session._id, $or: [{ endedAt: null }, { endedAt: { $exists: false } }] },
                { $set: { endedAt: now } },
                { new: true }
              );
              if (updatedSession) session = updatedSession;
            }

            // Determine master call start and end timestamps unconditionally
            const callStartObj = session?.actualCallStartedAt || session?.startedAt || inMemCall?.actualCallStartedAt || inMemCall?.startedAt;
            const callEndObj = session?.endedAt || inMemCall?.endedAt || now;

            const callStartTime = callStartObj ? new Date(callStartObj).getTime() : 0;
            const callEndTime = new Date(callEndObj).getTime();
            const rawDurationSec = callStartTime > 0 ? Math.max(0, (callEndTime - callStartTime) / 1000) : 0;

            const currentSize = fs.existsSync(tempPath) ? fs.statSync(tempPath).size : 0;
            const currentSizeSec = currentSize > 0 ? (currentSize / 192000) : 0;

            // Check peer stream size and chunk count to guarantee both files expand to the longer speaker
            let peerSizeSec = 0;
            let peerSeqSec = 0;
            try {
              const isA = session 
                ? (String(session.userA) === String(socket.data.userId))
                : (inMemCall && String(inMemCall.userAId) === String(socket.data.userId));
              const peerUserId = isA ? (session?.userB || inMemCall?.userBId) : (session?.userA || inMemCall?.userAId);
              if (peerUserId) {
                const peerStream = activeStreams.get(`${callId}_${peerUserId}`);
                if (peerStream) {
                  peerSeqSec = peerStream.maxSeq >= 0 ? (peerStream.maxSeq + 1) * 0.5 : 0;
                  if (peerStream.tempLocalPath && fs.existsSync(peerStream.tempLocalPath)) {
                    peerSizeSec = fs.statSync(peerStream.tempLocalPath).size / 192000;
                  }
                }
              }
            } catch {}

            // Compute master duration across all sources without ever clipping or truncating real speech!
            const streamSeqDuration = (streamObj?.maxSeq !== undefined && streamObj.maxSeq >= 0 ? (streamObj.maxSeq + 1) * 0.5 : 0);
            const totalCallDurationSec = Math.max(rawDurationSec, streamSeqDuration, currentSizeSec, peerSeqSec, peerSizeSec, 1);

            const sampleRate = 48000;
            const bytesPerSample = 4; // float32
            const bytesPerSec = sampleRate * bytesPerSample; // 192,000 bytes/sec
            const targetSizeBytes = Math.round(totalCallDurationSec * bytesPerSec);

            if (fs.existsSync(tempPath) && currentSize < targetSizeBytes) {
              const endSilenceSize = targetSizeBytes - currentSize;
              if (streamObj) streamObj.paddedBytes = endSilenceSize;
              const fdEnd = fs.openSync(tempPath, "a");
              const silenceChunk = Buffer.alloc(Math.min(endSilenceSize, 1024 * 1024), 0);
              let remaining = endSilenceSize;
              while (remaining > 0) {
                const toWrite = Math.min(remaining, silenceChunk.length);
                fs.writeSync(fdEnd, silenceChunk, 0, toWrite);
                remaining -= toWrite;
              }
              fs.closeSync(fdEnd);
              console.log(`[Audio Alignment] Padded ${endSilenceSize} bytes to ${tempPath} to reach master size ${targetSizeBytes} (${totalCallDurationSec}s)`);
            }
          } catch (padErr) {
            console.error("Error padding PCM file for alignment:", padErr);
          }

          const flacPath = tempPath.replace(".pcm", ".flac");
          const recordSampleRate = 48000;
          await new Promise((res, rej) => {
            ffmpeg()
              .input(tempPath)
              .inputOptions([
                '-f', 'f32le',
                '-ar', String(recordSampleRate),
                '-ac', '1',
              ])
              .outputOptions(['-sample_fmt s32'])  // FLAC stores s32 as 24-bit integers
              .output(flacPath)
              .on('end', res)
              .on('error', rej)
              .run();
          });
          finalUploadPath = flacPath;
        }

        const upload = new Upload({
          client: s3Client,
          params: {
            Bucket: BUCKET_NAME,
            Key: filePath,
            Body: fs.createReadStream(finalUploadPath),
            ContentType: `audio/${filePath.split('.').pop()}`,
          },
        });
        await upload.done();

        // Generate Comprehensive Recording Audit Log
        const auditEntry = {
          timestamp: new Date().toISOString(),
          callId,
          userId: socket.data.userId,
          fileName: streamObj?.fileName || filePath.split('/').pop(),
          s3Key: filePath,
          realtimeChunksReceived: streamObj?.realtimeCount || (streamObj?.receivedSeqs ? streamObj.receivedSeqs.size : 0),
          uniqueChunksCovered: streamObj?.receivedSeqs ? streamObj.receivedSeqs.size : 0,
          maxSequenceIndex: streamObj?.maxSeq || 0,
          missingRangesDetected: streamObj?.missingRangesIdentified || [],
          missingChunksPatchedViaSack: streamObj?.patchedCount || 0,
          silenceBytesPadded: streamObj?.paddedBytes || 0,
          silenceSecondsPadded: Math.round(((streamObj?.paddedBytes || 0) / 192000) * 100) / 100,
          finalFileSizeBytes: fs.existsSync(finalUploadPath) ? fs.statSync(finalUploadPath).size : 0,
          finalDurationSeconds: totalCallDurationSec
        };

        console.log(`[Recording Audit Log] Call ${callId} (${socket.data.userId}):`, JSON.stringify(auditEntry));

        // 1. Save audit log into MongoDB CallSession
        CallSession.updateOne(
          { callId },
          { $push: { recordingAuditLogs: auditEntry } }
        ).catch(err => console.error("Error saving audit log to MongoDB:", err));

        // 2. Save audit log to local recordings/ directory
        try {
          const recordingsDir = path.join(process.cwd(), "recordings");
          if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });
          const auditFilePath = path.join(recordingsDir, `${callId}_audit.log`);
          fs.appendFileSync(auditFilePath, JSON.stringify(auditEntry, null, 2) + "\n---\n");
        } catch (localAuditErr) {
          console.error("Error writing local audit log:", localAuditErr);
        }

        // 3. Upload audit log alongside audio in S3 folder
        try {
          const auditKey = filePath.replace(/\/[^\/]+$/, `/recording_audit_${socket.data.userId}.json`);
          const auditUpload = new Upload({
            client: s3Client,
            params: {
              Bucket: BUCKET_NAME,
              Key: auditKey,
              Body: JSON.stringify(auditEntry, null, 2),
              ContentType: "application/json",
            },
          });
          await auditUpload.done();
        } catch (auditS3Err) {
          console.error("Error uploading audit log to S3:", auditS3Err);
        }

        // S3 upload succeeded - clean up temp local files
        if (fs.existsSync(tempPath)) fs.unlink(tempPath, () => {});
        if (tempPath.endsWith(".pcm")) {
          const flacPath = tempPath.replace(".pcm", ".flac");
          if (fs.existsSync(flacPath)) fs.unlink(flacPath, () => {});
        }

        resolve(filePath);
      } catch (e) {
        console.error("Failed to push call recording directly to AWS S3. Saving local fallback:", e);

        // FIX FOR #5: If S3 upload fails, preserve the local FLAC/PCM file as local fallback backup!
        try {
          const callsLocalDir = path.join(process.cwd(), "recordings", "calls");
          if (!fs.existsSync(callsLocalDir)) fs.mkdirSync(callsLocalDir, { recursive: true });
          
          const localBackupName = `${callId}_${socket.data.userId || "user"}_${Date.now()}.${finalUploadPath.split('.').pop()}`;
          const localBackupPath = path.join(callsLocalDir, localBackupName);

          fs.copyFileSync(finalUploadPath, localBackupPath);
          console.log(`Saved local fallback call recording to: ${localBackupPath}`);
          resolve(`local:${localBackupName}`);
        } catch (backupErr) {
          console.error("Failed to save local fallback recording:", backupErr);
          resolve(null);
        } finally {
          if (fs.existsSync(tempPath)) fs.unlink(tempPath, () => {});
          if (fs.existsSync(tempPath + '.padded')) fs.unlink(tempPath + '.padded', () => {});
          if (tempPath.endsWith(".pcm")) {
            const flacPath = tempPath.replace(".pcm", ".flac");
            if (fs.existsSync(flacPath)) fs.unlink(flacPath, () => {});
          }
        }
      }
    });
  } else {
    if (stream) stream.end();
    if (tempPath && fs.existsSync(tempPath)) fs.unlink(tempPath, () => {});
    return Promise.resolve(null);
  }
}

async function cleanupCall(socket, reason) {
  const callId = getCallIdForSocket(socket);
  const peerId = getPeerId(socket);

  await cleanupRecording(socket, new Date());

  socket.data.callId = null;
  socket.data.peerId = null;
  socket.data.role = null;

  if (peerId && io.sockets.sockets.has(peerId)) {
    io.to(peerId).emit("peer_left", { reason: reason || "peer_left" });
    const peer = io.sockets.sockets.get(peerId);
    if (peer) {
      await cleanupRecording(peer, new Date());
      peer.data.callId = null;
      peer.data.peerId = null;
      peer.data.role = null;
    }
  }

  if (callId && calls.has(callId)) calls.delete(callId);
}

// --- CPU Protection FFMPEG Queue ---
let activeFfmpegWorkers = 0;
const MAX_FFMPEG = 2; // Maximum concurrent ffmpeg child processes natively on CPU
const ffmpegQueue = [];

function processFfmpegQueue() {
  if (activeFfmpegWorkers >= MAX_FFMPEG || ffmpegQueue.length === 0) return;
  activeFfmpegWorkers++;
  const task = ffmpegQueue.shift();
  task().finally(() => {
    activeFfmpegWorkers--;
    processFfmpegQueue();
  });
}

function mergeRecordings(callId, offsetA, offsetB) {
  return new Promise((resolve) => {
    ffmpegQueue.push(async () => {
      await executeMergeRecordings(callId, offsetA, offsetB);
      resolve();
    });
    processFfmpegQueue();
  });
}

async function executeMergeRecordings(callId, offsetA, offsetB) {
  const session = await CallSession.findOne({ callId });
  if (!session || !session.recordingAFile || !session.recordingBFile) return;

  const keyA = session.recordingAFile;
  const keyB = session.recordingBFile;

  // We mount streams inside Node's standard /temp/ OS architecture
    const awsExt = keyA.split('.').pop() || "webm";
    const localA = path.join(process.cwd(), "recordings", `${callId}_tmp_A.${awsExt}`);
    const localB = path.join(process.cwd(), "recordings", `${callId}_tmp_B.${awsExt}`);
    const localMixed = path.join(process.cwd(), "recordings", `${callId}_tmp_mixed.flac`);

    try {
      // 1. Pre-fetch audio endpoints from Amazon gracefully mapping them to local NVME temporarily
      const [streamA, streamB] = await Promise.all([
        s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: keyA })),
        s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: keyB }))
      ]);
      
      await Promise.all([
        pipeline(streamA.Body, fs.createWriteStream(localA)),
        pipeline(streamB.Body, fs.createWriteStream(localB))
      ]);

      // 2. Perform native Fluent-FFMPEG Concatenation securely!
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(localA)
          .input(localB)
          .complexFilter([
            `[0:a]adelay=${offsetA}|${offsetA}[a]`,
            `[1:a]adelay=${offsetB}|${offsetB}[b]`,
            `[a][b]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0`,
          ])
          .outputOptions(['-sample_fmt s32'])  // preserve 24-bit depth through the amix pipeline
          .save(localMixed)
          .on("end", resolve)
          .on("error", reject);
      });

    // 3. Upload exactly back to the targeted Amazon hierarchy recursively 
    const awsFolderRoot = keyA.split("/").slice(0, 2).join("/"); // e.g. calls/{callId}_{lang}_{topic}
    const finalMixedKey = `${awsFolderRoot}/combined.flac`;

    const uploader = new Upload({
      client: s3Client,
      params: {
        Bucket: BUCKET_NAME,
        Key: finalMixedKey,
        Body: fs.createReadStream(localMixed),
        ContentType: "audio/flac",
      },
    });
    await uploader.done();

    // 4. Trace the Database
    await CallSession.updateOne({ callId }, { $set: { mixedRecordingFile: finalMixedKey } });

  } catch (err) {
    console.error("FFMPEG / S3 Bridging error during merge:", err);
  } finally {
    // 5. Hard Drive Destruction: Never leave traces of calls floating locally!
    [localA, localB, localMixed].forEach(file => {
      if (fs.existsSync(file)) fs.unlink(file, () => {});
    });
  }
}

async function endCall(callId, reason) {
  const call = calls.get(callId);
  if (!call) return;
  calls.delete(callId);

  if (call.timer) {
    try { clearTimeout(call.timer); } catch { /* ignore */ }
  }
  if (call.disconnectTimers) {
    Object.values(call.disconnectTimers).forEach((t) => {
      try { clearTimeout(t); } catch { /* ignore */ }
    });
  }

  try {
    const endedAt = new Date();
    const session = await CallSession.findOne({ callId });
    if (session) {
      const started = session.actualCallStartedAt || session.startedAt;
      const actualCallDuration = Math.max(0, Math.floor((endedAt.getTime() - new Date(started).getTime()) / 1000));
      
      let callStatus = "pending";
      let recordingAStatus = "pending";
      let recordingBStatus = "pending";
      let recordingAReviewNote = null;
      let recordingBReviewNote = null;
      let reviewNotes = null;

      if (session.actualCallStartedAt && actualCallDuration < 540) {
        callStatus = "rejected";
        recordingAStatus = "rejected";
        recordingBStatus = "rejected";
        recordingAReviewNote = "Duration below 9 min limit";
        recordingBReviewNote = "Duration below 9 min limit";
        reviewNotes = "Duration below 9 min limit";
      }

      const canonicalDurationMin = actualCallDuration && Number.isFinite(actualCallDuration) && actualCallDuration > 0
        ? Math.round((actualCallDuration / 60) * 100) / 100
        : 0;

      const getDurationMin = (start) => {
        if (canonicalDurationMin > 0) return canonicalDurationMin;
        if (start) {
          const diffMs = endedAt.getTime() - new Date(start).getTime();
          if (Number.isFinite(diffMs) && diffMs > 0) return Math.round((diffMs / 60000) * 100) / 100;
        }
        return 0;
      };

      const recordingADurationMinutes = canonicalDurationMin || getDurationMin(session.recordingAStartedAt || session.actualCallStartedAt || session.startedAt);
      const recordingBDurationMinutes = canonicalDurationMin || getDurationMin(session.recordingBStartedAt || session.actualCallStartedAt || session.startedAt);

      await CallSession.updateOne(
        { callId },
        {
          $set: {
            endedAt,
            endReason: reason || "ended",
            callStatus,
            recordingAStatus,
            recordingBStatus,
            recordingAReviewNote,
            recordingBReviewNote,
            reviewNotes,
            actualCallDuration,
            recordingADurationMinutes,
            recordingBDurationMinutes
          }
        }
      );

      if (actualCallDuration < 900) {
        if (recordingAStatus === "rejected") {
          updateLimitAndBlacklist(session.userA.toString(), session.language, false).catch(console.error);
        }
        if (recordingBStatus === "rejected") {
          updateLimitAndBlacklist(session.userB.toString(), session.language, false).catch(console.error);
        }
      }
    } else {
      await CallSession.updateOne(
        { callId },
        {
          $set: {
            endedAt,
            endReason: reason || "ended",
            callStatus: "pending",
          },
        }
      );
    }
  } catch (err) {
    console.error("Error updating CallSession in endCall:", err);
  }

  // Emit call_ended INSTANTLY to both participants via socket room & user IDs (0.05s response time)
  io.to(`call_${callId}`).emit("call_ended", { callId, reason: reason || "ended" });
  if (call.userAId) io.to(`user_${call.userAId}`).emit("call_ended", { callId, reason: reason || "ended" });
  if (call.userBId) io.to(`user_${call.userBId}`).emit("call_ended", { callId, reason: reason || "ended" });

  const a = io.sockets.sockets.get(call.a);
  const b = io.sockets.sockets.get(call.b);

  if (a) {
    a.data.callId = null;
    a.data.peerId = null;
    a.data.role = null;
    a.leave(`call_${callId}`);
  }

  if (b) {
    b.data.callId = null;
    b.data.peerId = null;
    b.data.role = null;
    b.leave(`call_${callId}`);
  }

  // Give clients 20s grace window to complete SACK audit and missing chunk upload before fallback cleanup
  setTimeout(async () => {
    try {
      const socketA = call.a ? io.sockets.sockets.get(call.a) : null;
      const socketB = call.b ? io.sockets.sockets.get(call.b) : null;

      const dummyA = socketA || { data: { userId: call.userAId, callId } };
      const dummyB = socketB || { data: { userId: call.userBId, callId } };

      const cleanupPromises = [
        cleanupRecording(dummyA, endedAt, callId),
        cleanupRecording(dummyB, endedAt, callId)
      ];
      await Promise.allSettled(cleanupPromises);

      if (reason !== "negotiation_timeout") {
        mergeRecordings(callId, 0, 0).catch(console.error);
      }
    } catch (err) {
      console.error("Error in background call cleanup:", err);
    }
  }, 20000);
}

async function startActualCall(call) {
  call.rolesConfirmed = true;
  call.actualCallStartedAt = new Date();

  if (call.negotiationTimer) {
    clearTimeout(call.negotiationTimer);
    call.negotiationTimer = null;
  }

  const negotiationDuration = Math.floor(
    (call.actualCallStartedAt - call.negotiationStartedAt) / 1000
  );

  const updateFields = {
    topicId: call.selectedTopic,
    subtopicId: call.selectedSubtopic,
    topicSelectedBy: call.topicSelectedBy,
    topicSelectedAt: new Date(),
    enableCallRoles: Boolean(call.enableCallRoles),
    userARole: call.roleA || "",
    userBRole: call.roleB || "",
    negotiationEndedAt: call.actualCallStartedAt,
    rolesConfirmedAt: call.actualCallStartedAt,
    actualCallStartedAt: call.actualCallStartedAt,
    callActuallyStarted: true,
    negotiationDuration,
  };

  if (call.enableCallRoles) {
    if (call.roleA === "questioner" || call.roleA === call.role1) {
      updateFields.questionerUserId = call.userAId;
      updateFields.answererUserId = call.userBId;
    } else if (call.roleB === "questioner" || call.roleB === call.role1) {
      updateFields.questionerUserId = call.userBId;
      updateFields.answererUserId = call.userAId;
    }
  }

  await CallSession.updateOne(
    { callId: call.callId },
    { $set: updateFields }
  ).catch(() => {});

  io.to(call.a).emit("roles_confirmed", {
    yourRole: call.roleA,
    peerRole: call.roleB,
    topicId: call.selectedTopic,
    subtopicId: call.selectedSubtopic,
    enableCallRoles: Boolean(call.enableCallRoles),
  });

  io.to(call.b).emit("roles_confirmed", {
    yourRole: call.roleB,
    peerRole: call.roleA,
    topicId: call.selectedTopic,
    subtopicId: call.selectedSubtopic,
    enableCallRoles: Boolean(call.enableCallRoles),
  });
}

async function negotiationTimeout(callId) {
  const call = calls.get(callId);
  if (!call || call.rolesConfirmed) return;

  await CallSession.updateOne(
    { callId },
    {
      $set: {
        endedAt: new Date(),
        endReason: "negotiation_timeout",
        negotiationEndedAt: new Date(),
        negotiationDuration: 4 * 60,
      },
    }
  ).catch(() => {});

  io.to(call.a).emit("negotiation_timeout");
  io.to(call.b).emit("negotiation_timeout");

  calls.delete(callId);

  const socketA = io.sockets.sockets.get(call.a);
  const socketB = io.sockets.sockets.get(call.b);

  if (socketA) { socketA.data.callId = null; socketA.data.peerId = null; }
  if (socketB) { socketB.data.callId = null; socketB.data.peerId = null; }
}

// ─── Socket connection handler ────────────────────────────────────────────────
io.on("connection", (socket) => {
  socket.data.callId = null;
  socket.data.peerId = null;
  socket.data.role = null;
  socket.data.recordChunks = null;
  socket.data.recordStream = null;
  socket.data.tempLocalPath = null;
  socket.data.recordFileName = null;
  socket.data.recordFilePath = null;
  socket.data.recording = false;
  socket.data.systemCheckPassed = false;
  socket.data.username = null;

  User.findById(socket.data.userId)
    .select("firstname lastname currentSocketId")
    .then(async (u) => {
      if (!u) { socket.disconnect(); return; }

      if (u.currentSocketId && u.currentSocketId !== socket.id) {
        const oldSocket = io.sockets.sockets.get(u.currentSocketId);
        if (oldSocket) {
          oldSocket.emit("force_logout", { reason: "logged_in_elsewhere" });
          oldSocket.disconnect(true);
        }
      }

      u.currentSocketId = socket.id;
      await u.save();
      socket.data.username =
        `${u.firstname || ""} ${u.lastname || ""}`.trim() || "User";
    })
    .catch(() => { socket.disconnect(); });

  socket.on("system_check_status", ({ passed, language }) => {
    socket.data.systemCheckPassed = passed === true;
    socket.data.language = language || "english";
  });

  socket.on("find_match", async () => {
    try {
      if (getCallIdForSocket(socket)) return;

      if (!socket.data.systemCheckPassed) {
        socket.emit("error_message", { message: "system_check_required" });
        return;
      }

      // Check daily call limit
    try {
      const user = await User.findById(socket.data.userId);
      if (!user) {
        socket.emit("error_message", { message: "user_not_found" });
        return;
      }

      const dailyLimit =
        user.dailyCallLimit !== undefined ? user.dailyCallLimit : 3;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayCallCount = await CallSession.countDocuments({
        $or: [
          { userA: socket.data.userId },
          { userB: socket.data.userId },
        ],
        startedAt: { $gte: today },
        callActuallyStarted: true,
      });

      if (todayCallCount >= dailyLimit) {
        socket.emit("error_message", {
          message: "daily_limit_exceeded",
          limit: dailyLimit,
          count: todayCallCount,
        });
        return;
      }
    } catch (error) {
      console.error("Error checking call limit:", error);
      socket.emit("error_message", { message: "server_error" });
      return;
    }

    // Verify approved language application
    const userLanguage = socket.data.language || "english";
    try {
      const freshUser = await User.findById(socket.data.userId)
        .select("languageApplications")
        .lean();
      const reqLang = String(userLanguage).trim().toLowerCase();
      const langApp = freshUser?.languageApplications?.find(
        (a) => String(a.languageCode || "").trim().toLowerCase() === reqLang && a.status === "approved" && (!a.applicationType || a.applicationType === 'call')
      );
      if (!langApp) {
        socket.emit("error_message", {
          message: "language_not_approved",
          language: userLanguage,
        });
        return;
      }
    } catch (error) {
      console.error("Error checking language approval:", error);
      socket.emit("error_message", { message: "server_error" });
      return;
    }

    // Verify contribution duration limits for this language
    try {
      const languageDoc = await Language.findOne({ code: userLanguage });
      if (languageDoc && languageDoc.maxHoursPerContributor !== undefined && languageDoc.maxHoursPerContributor !== -1) {
        const sessions = await CallSession.find({
          $or: [{ userA: socket.data.userId }, { userB: socket.data.userId }],
          language: userLanguage,
          callActuallyStarted: true,
        }).select("actualCallDuration");
        
        const totalSeconds = sessions.reduce((sum, s) => sum + (s.actualCallDuration || 0), 0);
        const limitSeconds = languageDoc.maxHoursPerContributor * 3600;
        
        if (totalSeconds >= limitSeconds) {
          socket.emit("error_message", {
            message: "language_limit_reached",
            language: languageDoc.name,
          });
          return;
        }
      }
    } catch (error) {
      console.error("Error checking language contribution limit:", error);
      socket.emit("error_message", { message: "server_error" });
      return;
    }

    removeFromQueue(socket.id);

    // Find a peer with the same language
    let peerIndex = -1;
    for (let i = 0; i < waitingQueue.length; i++) {
      const peerId = waitingQueue[i];
      const peer = io.sockets.sockets.get(peerId);
      if (!peer || getCallIdForSocket(peer)) continue;
      if (!peer.data.systemCheckPassed) continue;
      if ((peer.data.language || "english") === userLanguage) {
        peerIndex = i;
        break;
      }
    }

    if (peerIndex === -1) {
      waitingQueue.push(socket.id);
      socket.emit("queue", { status: "waiting" });
      return;
    }

    const peerId = waitingQueue.splice(peerIndex, 1)[0];
    const peer = io.sockets.sockets.get(peerId);

    if (!peer || getCallIdForSocket(peer) || !peer.data.systemCheckPassed) {
      socket.emit("queue", { status: "waiting" });
      waitingQueue.push(socket.id);
      return;
    }

    const callId = crypto.randomUUID();

    socket.data.callId = callId;
    socket.data.peerId = peerId;
    socket.data.role = "offerer";
    socket.join(`call_${callId}`);
    if (socket.data.userId) socket.join(`user_${socket.data.userId}`);

    peer.data.callId = callId;
    peer.data.peerId = socket.id;
    peer.data.role = "answerer";
    peer.join(`call_${callId}`);
    if (peer.data.userId) peer.join(`user_${peer.data.userId}`);

    const now = new Date();
    const negotiationEndsAt = Date.now() + 4 * 60 * 1000;
    const targetLangCode = String(socket.data.language || peer.data.language || "english").trim().toLowerCase();

    let enableCallRoles = false;
    let role1 = "Role 1";
    let role2 = "Role 2";

    try {
      const langDoc = await Language.findOne({ code: targetLangCode }).lean();
      if (langDoc) {
        enableCallRoles = Boolean(langDoc.enableCallRoles);
        if (langDoc.role1) role1 = langDoc.role1;
        if (langDoc.role2) role2 = langDoc.role2;
      }
    } catch (langErr) {
      console.warn("Could not query Language for call roles config:", langErr);
    }

    calls.set(callId, {
      callId,
      a: socket.id,
      b: peerId,
      createdAt: Date.now(),
      userAId: socket.data.userId,
      userBId: peer.data.userId,
      negotiationStartedAt: now,
      negotiationTimer: setTimeout(() => negotiationTimeout(callId), 4 * 60 * 1000),
      claimedBy: null,
      selectedTopic: null,
      selectedSubtopic: null,
      topicSelectedBy: null,
      roleA: null,
      roleB: null,
      enableCallRoles,
      role1,
      role2,
      rolesConfirmed: false,
      actualCallStartedAt: null,
      language: targetLangCode,
      timer: null,
    });

    CallSession.create({
      callId,
      userA: socket.data.userId,
      userB: peer.data.userId,
      startedAt: now,
      negotiationStartedAt: now,
      language: targetLangCode,
      enableCallRoles,
    }).catch(() => {});

    socket.emit("matched", {
      callId,
      role: "offerer",
      peerId,
      peerUserId: peer.data.userId,
      peerUsername: peer.data.username,
      negotiationMode: true,
      negotiationEndsAt,
      enableCallRoles,
      role1,
      role2,
    });
    peer.emit("matched", {
      callId,
      role: "answerer",
      peerId: socket.id,
      peerUserId: socket.data.userId,
      peerUsername: socket.data.username,
      negotiationMode: true,
      negotiationEndsAt,
      enableCallRoles,
      role1,
      role2,
    });
    } catch (e) {
      console.error("Error in find_match:", e);
      socket.emit("error_message", { message: "server_error" });
    }
  });

  socket.on("signal", ({ callId, to, data }) => {
    if (!callId || !to || !data) return;
    if (getCallIdForSocket(socket) !== callId) return;
    if (getPeerId(socket) !== to) return;
    io.to(to).emit("signal", { callId, from: socket.id, data });
  });

  socket.on("rejoin_call", ({ callId }) => {
    if (!callId) return;
    const call = calls.get(callId);
    if (!call) {
      socket.emit("call_ended", { callId, reason: "call_not_found" });
      return;
    }

    const userIdStr = String(socket.data.userId);
    const isUserA = String(call.userAId) === userIdStr;
    const isUserB = String(call.userBId) === userIdStr;

    if (!isUserA && !isUserB) {
      socket.emit("error_message", { message: "not_a_participant" });
      return;
    }

    // Cancel disconnect timer for this user if active
    if (call.disconnectTimers && call.disconnectTimers[userIdStr]) {
      clearTimeout(call.disconnectTimers[userIdStr]);
      delete call.disconnectTimers[userIdStr];
      console.log(`[Disconnect Grace Window] User ${userIdStr} reconnected to call ${callId}. Disconnect timer cancelled.`);
    }

    // Update socket data and call participant references
    socket.data.callId = callId;
    socket.join(`call_${callId}`);

    if (isUserA) {
      call.a = socket.id;
      socket.data.peerId = call.b;
      socket.data.role = call.roleA;
      const peerSocketB = io.sockets.sockets.get(call.b);
      if (peerSocketB) {
        peerSocketB.data.peerId = socket.id;
      }
    } else {
      call.b = socket.id;
      socket.data.peerId = call.a;
      socket.data.role = call.roleB;
      const peerSocketA = io.sockets.sockets.get(call.a);
      if (peerSocketA) {
        peerSocketA.data.peerId = socket.id;
      }
    }

    const peerUserId = isUserA ? call.userBId : call.userAId;
    const myRole = isUserA ? call.roleA : call.roleB;
    const peerRole = isUserA ? call.roleB : call.roleA;

    socket.emit("rejoined_call", {
      callId,
      peerId: isUserA ? call.b : call.a,
      peerUserId,
      yourRole: myRole,
      peerRole,
      enableCallRoles: Boolean(call.enableCallRoles),
      role1: call.role1 || "Role 1",
      role2: call.role2 || "Role 2",
      selectedTopic: call.selectedTopic,
      selectedSubtopic: call.selectedSubtopic,
      rolesConfirmed: call.rolesConfirmed,
      actualCallStartedAt: call.actualCallStartedAt
    });

    const peerSocketId = isUserA ? call.b : call.a;
    if (peerSocketId) {
      io.to(peerSocketId).emit("peer_reconnected", {
        userId: socket.data.userId,
        newPeerSocketId: socket.id
      });
    }
  });

  socket.on("hangup", () => {
    const callId = getCallIdForSocket(socket);
    if (callId) endCall(callId, "hangup");
  });

  socket.on("record_start", ({ callId, mimeType, startTime, clientOffsetMs, sampleRate }) => {
    const currentCallId = getCallIdForSocket(socket);
    if (!currentCallId || currentCallId !== callId) return;

    const streamKey = `${callId}_${socket.data.userId}`;
    let streamObj = activeStreams.get(streamKey);

    if (streamObj) {
      // Re-using existing stream if socket reconnected and fired record_start again
      socket.data.recording = true;
      socket.emit("record_ready", { fileName: streamObj.fileName });
      return;
    }

    cleanupRecording(socket).then(() => {
      const call = calls.get(callId);

      let offset = 0;
      if (clientOffsetMs !== undefined) {
        offset = clientOffsetMs;
      } else if (call?.expectedActualStartTime) {
        // Fallback using server-side timestamps to avoid client-server clock drift
        offset = Math.max(0, Date.now() - call.expectedActualStartTime);
      }
      socket.data.recordOffsetMs = offset;

      socket.data.recordSampleRate = sampleRate || 48000;

      const streamKey = `${callId}_${socket.data.userId}`;
      let existingStreamObj = activeStreams.get(streamKey);

      if (existingStreamObj && existingStreamObj.stream) {
        // Reuse existing write stream so previous audio chunks are preserved!
        socket.data.tempLocalPath = existingStreamObj.tempLocalPath;
        socket.data.recordFileName = existingStreamObj.fileName;
        socket.data.recordFilePath = existingStreamObj.filePath;
        socket.data.recording = true;
        socket.emit("record_ready", { fileName: existingStreamObj.fileName });
        return;
      }

      let cleanTopic = "NoTopic";
      if (call && call.selectedTopic && call.selectedTopic.title) {
        cleanTopic = String(call.selectedTopic.title).replace(/[^a-zA-Z0-9_\-\ ]/g, "").replace(/\s+/g, "_").trim();
      }
      
      const cleanLanguage = String((socket.data.language || (call && call.language) || "english")).replace(/[^a-zA-Z0-9_\-\ ]/g, "").replace(/\s+/g, "_").trim();
      const folderName = `${callId}_${cleanLanguage}_${cleanTopic}`;

      const cleanMime = (mimeType || "").toLowerCase();
      const isPcm = cleanMime.includes("pcm") || cleanMime.includes("raw") || cleanMime.includes("audio/l16");
      let ext = "webm";
      if (isPcm) {
        ext = "flac";
      } else if (cleanMime.includes("mp4") || cleanMime.includes("m4a")) {
        ext = "mp4";
      } else if (cleanMime.includes("ogg")) {
        ext = "ogg";
      } else if (cleanMime.includes("wav")) {
        ext = "wav";
      }

      const fileName = (call && socket.data.userId === call.userAId) ? `speaker1.${ext}` : `speaker2.${ext}`;
      const filePath = `calls/${folderName}/${fileName}`; 

      const localFileExt = isPcm ? "pcm" : ext;
      const tempLocalPath = path.join(process.cwd(), "recordings", `${socket.id}_${Date.now()}.${localFileExt}`);

      socket.data.recordChunks = null;
      socket.data.tempLocalPath = tempLocalPath;
      socket.data.recordFileName = fileName;
      socket.data.recordFilePath = filePath; 
      socket.data.recording = true;

      const newStream = fs.createWriteStream(tempLocalPath);
      let fd = null;
      try {
        fd = fs.openSync(tempLocalPath, "w+");
      } catch (err) {
        console.error("Failed to open file descriptor for PCM stream:", err);
      }

      activeStreams.set(streamKey, {
        stream: newStream,
        fd,
        receivedSeqs: new Set(),
        maxSeq: 0,
        expectedSeq: 0,
        pendingChunks: new Map(),
        fileName,
        tempLocalPath,
        filePath,
        recordSampleRate: socket.data.recordSampleRate
      });

      socket.emit("record_ready", { fileName });

      if (call) {
        const now = new Date();
        CallSession.findOne({ callId }).select("recordingAStartedAt recordingBStartedAt actualCallStartedAt startedAt").then(existingSession => {
          const update = {};
          if (socket.data.userId === call.userAId) {
            update.recordingAFile = filePath;
            if (!existingSession?.recordingAStartedAt) {
              update.recordingAStartedAt = now;
            }
          } else {
            update.recordingBFile = filePath;
            if (!existingSession?.recordingBStartedAt) {
              update.recordingBStartedAt = now;
            }
          }
          if (Object.keys(update).length > 0) {
            return CallSession.updateOne({ callId }, { $set: update });
          }
        }).catch(() => {});
      }
    });
  });

  // SACK: Random-access chunk write at position seq * 96000
  socket.on("record_chunk", (payload, callback) => {
    try {
      if (!socket.data.recording) return;

      const { seq, data, callId } = payload;
      if (seq === undefined || data === undefined || !callId) return;

      const streamKey = `${callId}_${socket.data.userId}`;
      const streamObj = activeStreams.get(streamKey);
      if (!streamObj) return;

      let buf;
      if (Buffer.isBuffer(data)) buf = data;
      else if (data instanceof ArrayBuffer) buf = Buffer.from(data);
      else if (ArrayBuffer.isView(data))
        buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
      else return;

      // Random-access byte offset formula: seq * 96000
      const offset = seq * 96000;
      if (streamObj.fd) {
        try {
          fs.writeSync(streamObj.fd, buf, 0, buf.length, offset);
        } catch (wErr) {
          if (streamObj.stream) streamObj.stream.write(buf);
        }
      } else if (streamObj.stream) {
        streamObj.stream.write(buf);
      }

      if (streamObj.receivedSeqs) streamObj.receivedSeqs.add(seq);
      if (seq > (streamObj.maxSeq || 0)) streamObj.maxSeq = seq;

      if (callback) callback(seq);
    } catch (e) {
      console.error("Error writing record_chunk:", e);
    }
  });

  // SACK: Batch upload missing sequence ranges
  socket.on("upload_missing_chunks", (payload, callback) => {
    try {
      const { callId, chunks } = payload || {};
      if (!callId || !Array.isArray(chunks)) {
        if (callback) callback({ ok: false, error: "invalid_payload" });
        return;
      }

      const streamKey = `${callId}_${socket.data.userId}`;
      const streamObj = activeStreams.get(streamKey);
      if (!streamObj) {
        if (callback) callback({ ok: false, error: "stream_not_found" });
        return;
      }

      let patchedCount = 0;
      for (const chunkItem of chunks) {
        const { seq, data } = chunkItem;
        if (seq === undefined || !data) continue;

        let buf;
        if (Buffer.isBuffer(data)) buf = data;
        else if (data instanceof ArrayBuffer) buf = Buffer.from(data);
        else if (ArrayBuffer.isView(data))
          buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
        else continue;

        const offset = seq * 96000;
        if (streamObj.fd) {
          try {
            fs.writeSync(streamObj.fd, buf, 0, buf.length, offset);
          } catch {}
        }

        if (streamObj.receivedSeqs) streamObj.receivedSeqs.add(seq);
        if (seq > (streamObj.maxSeq || 0)) streamObj.maxSeq = seq;
        patchedCount++;
      }

      if (callback) callback({ ok: true, patchedCount });
    } catch (e) {
      console.error("Error processing upload_missing_chunks:", e);
      if (callback) callback({ ok: false, error: e.message });
    }
  });

  // SACK: End-of-call handshake to verify 100% chunk completeness across both speakers
  socket.on("verify_call_chunks", async (payload, callback) => {
    try {
      const { callId, clientMaxSeq } = payload || {};
      if (!callId) {
        if (callback) callback({ complete: true, totalChunks: 0 });
        return;
      }

      const streamKey = `${callId}_${socket.data.userId}`;
      const streamObj = activeStreams.get(streamKey);
      if (!streamObj || !streamObj.receivedSeqs) {
        if (callback) callback({ complete: true, totalChunks: 0 });
        return;
      }

      const call = calls.get(callId);
      let peerStreamObj = null;
      let callStart = call?.actualCallStartedAt;

      let peerUserId = null;
      if (call) {
        peerUserId = String(call.userAId) === String(socket.data.userId) ? call.userBId : call.userAId;
      } else {
        try {
          const session = await CallSession.findOne({ callId }).select("userA userB actualCallStartedAt").lean();
          if (session) {
            peerUserId = String(session.userA) === String(socket.data.userId) ? session.userB : session.userA;
            if (!callStart && session.actualCallStartedAt) {
              callStart = session.actualCallStartedAt;
            }
          }
        } catch {}
      }

      if (peerUserId) {
        peerStreamObj = activeStreams.get(`${callId}_${peerUserId}`);
      }

      // Calculate master target sequence based on client reported max, server stream max, peer stream max, and elapsed call duration
      let durationMaxSeq = 0;
      if (callStart) {
        const elapsedSec = Math.max(0, (Date.now() - new Date(callStart).getTime()) / 1000);
        durationMaxSeq = Math.max(0, Math.floor(elapsedSec * 2) - 1);
      }

      const targetMaxSeq = Math.max(
        streamObj.maxSeq || 0,
        peerStreamObj?.maxSeq || 0,
        clientMaxSeq !== undefined ? Number(clientMaxSeq) : 0,
        durationMaxSeq
      );

      const missingRanges = [];
      let rangeStart = null;

      for (let s = 0; s <= targetMaxSeq; s++) {
        if (!streamObj.receivedSeqs.has(s)) {
          if (rangeStart === null) rangeStart = s;
        } else {
          if (rangeStart !== null) {
            missingRanges.push({ start: rangeStart, end: s - 1 });
            rangeStart = null;
          }
        }
      }
      if (rangeStart !== null) {
        missingRanges.push({ start: rangeStart, end: targetMaxSeq });
      }

      if (missingRanges.length === 0) {
        if (callback) callback({ complete: true, totalChunks: targetMaxSeq + 1, receivedChunks: streamObj.receivedSeqs.size });
      } else {
        if (callback) callback({ complete: false, missingRanges, targetMaxSeq, totalChunks: targetMaxSeq + 1, receivedChunks: streamObj.receivedSeqs.size });
      }
    } catch (e) {
      console.error("Error in verify_call_chunks:", e);
      if (callback) callback({ complete: true, error: e.message });
    }
  });

  socket.on("record_stop", async (payload, callback) => {
    try {
      const callId = payload?.callId || socket.data.callId || getCallIdForSocket(socket);
      await cleanupRecording(socket, new Date(), callId);
      if (callback) callback({ ok: true });
    } catch (e) {
      console.error("Error in record_stop:", e);
      if (callback) callback({ ok: false, error: e.message });
    }
  });

  socket.on("topic_claim", async ({ topicId, subtopicId }) => {
    try {
      const callId = getCallIdForSocket(socket);
      const call = calls.get(callId);
      if (!call || call.rolesConfirmed) return;

      call.claimedBy = socket.id;
      call.selectedTopic = topicId;
      call.selectedSubtopic = subtopicId;
      call.topicSelectedBy = socket.data.userId;

      let instructions = "";
      if (subtopicId) {
        try {
          const sub = await Subtopic.findById(subtopicId).select("instructions").lean();
          instructions = sub?.instructions || "";
        } catch (e) {
          console.error("Error fetching subtopic instructions:", e);
        }
      }

      io.to(call.a).emit("topic_claimed", {
        topicId,
        subtopicId,
        instructions,
        byMe: call.a === socket.id,
      });
      io.to(call.b).emit("topic_claimed", {
        topicId,
        subtopicId,
        instructions,
        byMe: call.b === socket.id,
      });
    } catch (e) {
      console.error("Error in topic_claim:", e);
    }
  });

  socket.on("topic_selected", async ({ topicId, subtopicId }) => {
    try {
      const callId = getCallIdForSocket(socket);
      const call = calls.get(callId);
      if (!call || call.rolesConfirmed || !call.selectedTopic) return;

      io.to(call.a).emit("topic_selected", {
        topicId: call.selectedTopic,
        subtopicId: call.selectedSubtopic,
      });
      io.to(call.b).emit("topic_selected", {
        topicId: call.selectedTopic,
        subtopicId: call.selectedSubtopic,
      });
    } catch (e) {
      console.error("Error in topic_selected:", e);
    }
  });

  socket.on("role_selected", ({ role }) => {
    const callId = getCallIdForSocket(socket);
    const call = calls.get(callId);
    if (!call || !call.selectedTopic) return;

    const isUserA = call.a === socket.id;

    if (isUserA) {
      if (call.roleA) return;
      call.roleA = role;
    } else {
      if (call.roleB) return;
      call.roleB = role;
    }

    const peerId = getPeerId(socket);
    if (peerId) io.to(peerId).emit("peer_role_selected", { role });

    if (call.roleA && call.roleB) startActualCall(call);
  });

  socket.on("call_start_initiated", () => {
    const callId = getCallIdForSocket(socket);
    const call = calls.get(callId);
    if (!call) return;
    if (call.enableCallRoles && (!call.roleA || !call.roleB)) return;

    if (!call.rolesConfirmed) {
      startActualCall(call);
    }

    io.to(call.a).emit("call_start_initiated");
    io.to(call.b).emit("call_start_initiated");

    call.expectedActualStartTime = Date.now() + 5000;
    call.timer = setTimeout(
      () => endCall(call.callId, "timeout"),
      5000 + 20 * 60 * 1000
    );
  });

  socket.on("disconnect", () => {
    removeFromQueue(socket.id);
    const callId = getCallIdForSocket(socket);
    if (callId) {
      const call = calls.get(callId);
      if (call) {
        call.disconnectTimers = call.disconnectTimers || {};
        const userIdStr = String(socket.data.userId);

        if (!call.disconnectTimers[userIdStr]) {
          console.log(`[Disconnect Grace Window] Socket disconnected for user ${userIdStr} in call ${callId}. Starting 120s grace period.`);
          
          const peerId = (String(call.userAId) === userIdStr) ? call.b : call.a;
          if (peerId) {
            io.to(peerId).emit("peer_disconnected_temp", { userId: socket.data.userId });
          }

          call.disconnectTimers[userIdStr] = setTimeout(() => {
            console.log(`[Disconnect Grace Window] Grace period expired for user ${userIdStr} in call ${callId}. Ending call.`);
            endCall(callId, "disconnect_timeout");
          }, 120 * 1000);
        }
      } else {
        cleanupRecording(socket, new Date(), callId);
      }
    } else {
      cleanupRecording(socket, new Date(), callId);
    }

    if (socket.data.userId) {
      User.findById(socket.data.userId)
        .then((u) => {
          if (u && u.currentSocketId === socket.id) {
            u.currentSocketId = null;
            u.save().catch(() => {});
          }
        })
        .catch(() => {});
    }

    socket.data.callId = null;
    socket.data.peerId = null;
    socket.data.role = null;
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
await connectDb(MONGODB_URI);

// Dynamic QA payrate auto-migration & database cleanup on boot
try {
  await User.updateMany({}, { $unset: { qaPerCallPayrateUsd: "", qaHourlyPhrasePayrateUsd: "" } });
  await User.updateOne(
    { email: "vishh1231@gmail.com", $or: [{ hourlyPhrasePayrate: 0 }, { hourlyPhrasePayrate: { $exists: false } }] },
    { $set: { hourlyPhrasePayrate: 8.00 } }
  );
  console.log("QA Payrate auto-migration completed on boot.");

  // Auto-reset call aac512d3 segments to unreviewed
  const targetCallId = "aac512d3-5af2-4066-a5b5-ccba4539c718";
  const resSeg = await mongoose.connection.collection("transcriptionsegments").updateMany(
    { call_id: { $regex: targetCallId, $options: "i" } },
    { $set: { QAVerified: false, qa_verified_by: null, qa_notes: "" } }
  );
  await mongoose.connection.collection("transcriptioncalls").updateMany(
    { call_id: { $regex: targetCallId, $options: "i" } },
    { $set: { qa_verified_segments_count: 0, transcription_status: "IN_TRANSCRIPTION" } }
  );
  // Ensure scripted calls stay in pending until fully approved (never stuck in rejected)
  const resetScriptedCalls = await CallSession.updateMany(
    { callId: /^scripted_/, callStatus: "rejected" },
    { $set: { callStatus: "pending", recordingAStatus: "pending", recordingBStatus: "pending" } }
  );
  if (resetScriptedCalls.modifiedCount > 0) {
    console.log(`Reset ${resetScriptedCalls.modifiedCount} scripted calls from rejected to pending.`);
  }
} catch (e) {
  console.error("QA Payrate / Segment / Scripted Call reset error:", e.message);
}

import { startPurgeIntroRecordingsCron } from "./jobs/purgeIntroRecordings.js";
startPurgeIntroRecordingsCron();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend listening on http://0.0.0.0:${PORT}`);
  console.log(`CORS origin: ${FRONTEND_ORIGIN}`);
});
