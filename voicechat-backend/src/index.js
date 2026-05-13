import "dotenv/config";
import http from "http";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import multer from "multer";
import multerS3 from "multer-s3";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
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
import { User } from "./models/User.js";
import { CallSession } from "./models/CallSession.js";
import { Subtopic } from "./models/Subtopic.js";

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
  getMyLanguageApplications,
  submitLanguageApplication,
  streamLanguageRecording,
  getTodayCallCount,
  getCallHistory,
  getMyPayout,
  submitFeedback,
  streamRecording,
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
import supportRoutes from "./routes/support.js";
import phrasesRoutes from "./routes/phrases.js";
import projectsRoutes from "./routes/projects.js";

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

// Application Security Routing Shields
app.use(helmet()); 
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes span
  max: 150, // Permitted requests natively
  message: { error: "Global Speed Limit exceeded. Please try again later." },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 10, // 10 Requests MAX per 15 mins for OTP/Login per user
  message: { error: "Security Lockout: Wait 15 minutes before sending another OTP for this email." },
  keyGenerator: (req) => {
    // Isolate limit strictly to the specific email being requested bypassing NGINX proxy masking
    return req.body?.email || req.ip; 
  }
});
app.use("/api/", globalLimiter); // Protect generic /api hooks

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());
app.use(
  cors({
    origin: function (origin, callback) {
      const allowedOrigins = [
        FRONTEND_ORIGIN,
        "https://voclara.com",
        "https://www.voclara.com",
        "http://localhost:5173",
        "http://127.0.0.1:5173"
      ];
      // Allow if it's in the whitelist OR if it's a Netlify staging domain
      if (!origin || allowedOrigins.includes(origin) || origin.endsWith(".netlify.app")) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

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

// ─── Multer: language application recording ───────────────────────────────────
const langUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(process.cwd(), "recordings", "temp");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, `lang_${req.user._id}_${Date.now()}.wav`);
    }
  }),
  limits: { fileSize: 60 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("audio/")) return cb(null, true);
    cb(new Error("Only audio files are allowed"));
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

// Languages
app.get("/api/languages", requireAuth(JWT_SECRET), getLanguages);
app.get(
  "/api/language-applications/my",
  requireAuth(JWT_SECRET),
  getMyLanguageApplications
);
app.post(
  "/api/language-applications",
  requireAuth(JWT_SECRET),
  langUpload.single("recording"),
  submitLanguageApplication
);
app.get(
  "/api/language-applications/:userId/:languageCode/recording",
  requireAuth(JWT_SECRET),
  streamLanguageRecording
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
app.use("/api/support", supportRoutes);
app.use("/api/phrases", phrasesRoutes);
app.use("/api/projects", projectsRoutes);

// ─── HTTP + Socket.IO server ──────────────────────────────────────────────────
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true,
  },
  adapter: createAdapter(pubClient, subClient),
});

// Wire login route now that io exists
app.post("/api/auth/login", authLimiter, makeLogin(io));

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

async function cleanupRecording(socket) {
  const filePath = socket.data.recordFilePath;
  const isRecording = socket.data.recording;
  const tempPath = socket.data.tempLocalPath;
  const stream = socket.data.recordStream;

  socket.data.recordChunks = null;
  socket.data.recordStream = null;
  socket.data.recordFileName = null;
  socket.data.recordFilePath = null;
  socket.data.tempLocalPath = null;
  socket.data.recording = false;

  if (isRecording && tempPath && filePath) {
    if (stream) {
      stream.end();
    }
    
    // Give OS disk IO small boundary to flush end bits
    await new Promise(r => setTimeout(r, 100));

    return new Promise(async (resolve) => {
      try {
        let finalUploadPath = tempPath;
        if (tempPath.endsWith(".pcm")) {
          const flacPath = tempPath.replace(".pcm", ".flac");
          const recordSampleRate = socket.data.recordSampleRate || 48000;
          await new Promise((res, rej) => {
            ffmpeg()
              .input(tempPath)
              .inputFormat('s16le')
              .audioChannels(1)
              .audioFrequency(recordSampleRate)
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
        resolve(filePath);
      } catch (e) {
        console.error("Failed to push call recording directly to AWS S3:", e);
        resolve(null);
      } finally {
        if (fs.existsSync(tempPath)) {
          fs.unlink(tempPath, () => {});
        }
        if (tempPath.endsWith(".pcm")) {
            const flacPath = tempPath.replace(".pcm", ".flac");
            if (fs.existsSync(flacPath)) fs.unlink(flacPath, () => {});
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

  await cleanupRecording(socket);

  socket.data.callId = null;
  socket.data.peerId = null;
  socket.data.role = null;

  if (peerId && io.sockets.sockets.has(peerId)) {
    io.to(peerId).emit("peer_left", { reason: reason || "peer_left" });
    const peer = io.sockets.sockets.get(peerId);
    if (peer) {
      await cleanupRecording(peer);
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
          `[a][b]amix=inputs=2:duration=longest:dropout_transition=0,volume=2`,
        ])
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

  try {
    await CallSession.updateOne(
      { callId },
      {
        $set: {
          endedAt: new Date(),
          endReason: reason || "ended",
          callStatus: "pending",
        },
      }
    );
  } catch { /* ignore */ }

  const a = io.sockets.sockets.get(call.a);
  const b = io.sockets.sockets.get(call.b);

  const offsetA = a ? a.data.recordOffsetMs || 0 : 0;
  const offsetB = b ? b.data.recordOffsetMs || 0 : 0;

  const cleanupPromises = [];

  if (a) {
    cleanupPromises.push(cleanupRecording(a));
    a.data.callId = null;
    a.data.peerId = null;
    a.data.role = null;
    a.emit("call_ended", { callId, reason: reason || "ended", peerUserId: call.userBId });
  }

  if (b) {
    cleanupPromises.push(cleanupRecording(b));
    b.data.callId = null;
    b.data.peerId = null;
    b.data.role = null;
    b.emit("call_ended", { callId, reason: reason || "ended", peerUserId: call.userAId });
  }

  await Promise.allSettled(cleanupPromises);

  if (reason !== "negotiation_timeout") {
    mergeRecordings(callId, offsetA, offsetB).catch(console.error);
  }
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

  await CallSession.updateOne(
    { callId: call.callId },
    {
      $set: {
        topicId: call.selectedTopic,
        subtopicId: call.selectedSubtopic,
        topicSelectedBy: call.topicSelectedBy,
        topicSelectedAt: new Date(),
        questionerUserId:
          call.roleA === "questioner" ? call.userAId : call.userBId,
        answererUserId:
          call.roleA === "answerer" ? call.userAId : call.userBId,
        negotiationEndedAt: call.actualCallStartedAt,
        rolesConfirmedAt: call.actualCallStartedAt,
        actualCallStartedAt: call.actualCallStartedAt,
        callActuallyStarted: true,
        negotiationDuration,
      },
    }
  ).catch(() => {});

  io.to(call.a).emit("roles_confirmed", {
    yourRole: call.roleA,
    peerRole: call.roleB,
    topicId: call.selectedTopic,
    subtopicId: call.selectedSubtopic,
  });

  io.to(call.b).emit("roles_confirmed", {
    yourRole: call.roleB,
    peerRole: call.roleA,
    topicId: call.selectedTopic,
    subtopicId: call.selectedSubtopic,
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
      const langApp = freshUser?.languageApplications?.find(
        (a) => a.languageCode === userLanguage && a.status === "approved"
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

    peer.data.callId = callId;
    peer.data.peerId = socket.id;
    peer.data.role = "answerer";

    const now = new Date();
    const negotiationEndsAt = Date.now() + 4 * 60 * 1000;

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
      rolesConfirmed: false,
      actualCallStartedAt: null,
      language: socket.data.language || peer.data.language || "english",
      timer: null,
    });

    CallSession.create({
      callId,
      userA: socket.data.userId,
      userB: peer.data.userId,
      startedAt: now,
      negotiationStartedAt: now,
      language: socket.data.language || peer.data.language || "english",
    }).catch(() => {});

    socket.emit("matched", {
      callId,
      role: "offerer",
      peerId,
      peerUserId: peer.data.userId,
      peerUsername: peer.data.username,
      negotiationMode: true,
      negotiationEndsAt,
    });
    peer.emit("matched", {
      callId,
      role: "answerer",
      peerId: socket.id,
      peerUserId: socket.data.userId,
      peerUsername: socket.data.username,
      negotiationMode: true,
      negotiationEndsAt,
    });
  });

  socket.on("signal", ({ callId, to, data }) => {
    if (!callId || !to || !data) return;
    if (getCallIdForSocket(socket) !== callId) return;
    if (getPeerId(socket) !== to) return;
    io.to(to).emit("signal", { callId, from: socket.id, data });
  });

  socket.on("hangup", () => {
    const callId = getCallIdForSocket(socket);
    if (callId) endCall(callId, "hangup");
  });

  socket.on("record_start", ({ callId, mimeType, startTime, sampleRate }) => {
    const currentCallId = getCallIdForSocket(socket);
    if (!currentCallId || currentCallId !== callId) return;

    cleanupRecording(socket).then(() => {
      const call = calls.get(callId);

      socket.data.recordOffsetMs =
        call?.expectedActualStartTime
          ? Math.max(0, (startTime || Date.now()) - call.expectedActualStartTime)
          : 0;

      socket.data.recordSampleRate = sampleRate || 48000;

      const isPcm = mimeType === "audio/pcm";
      const ext = isPcm ? "flac" : (mimeType || "audio/webm").includes("ogg") ? "ogg" : "webm";
      
      let cleanTopic = "NoTopic";
      if (call && call.selectedTopic && call.selectedTopic.title) {
        cleanTopic = String(call.selectedTopic.title).replace(/[^a-zA-Z0-9_\-\ ]/g, "").replace(/\s+/g, "_").trim();
      }
      
      const cleanLanguage = String((socket.data.language || (call && call.language) || "english")).replace(/[^a-zA-Z0-9_\-\ ]/g, "").replace(/\s+/g, "_").trim();
      const folderName = `${callId}_${cleanLanguage}_${cleanTopic}`;

      // Assign filename implicitly mapping the user's role origin natively!
      const fileName = (call && socket.data.userId === call.userAId) ? `speaker1.${ext}` : `speaker2.${ext}`;
      const filePath = `calls/${folderName}/${fileName}`; // Systematic S3 Tier

      // Systematic S3 Tier
      const localFileExt = isPcm ? "pcm" : ext;
      const tempLocalPath = path.join(process.cwd(), "recordings", `${socket.id}_${Date.now()}.${localFileExt}`);

      socket.data.recordChunks = null;
      socket.data.tempLocalPath = tempLocalPath;
      socket.data.recordStream = fs.createWriteStream(tempLocalPath);
      socket.data.recordFileName = fileName;
      socket.data.recordFilePath = filePath; // S3 specific object path
      socket.data.recording = true;
      socket.emit("record_ready", { fileName });

      if (call) {
        const update =
          socket.data.userId === call.userAId
            ? { recordingAFile: filePath, recordingAStartedAt: new Date() }
            : { recordingBFile: filePath, recordingBStartedAt: new Date() };
        // We push filePath so the DB points entirely at the unified AWS block natively
        CallSession.updateOne({ callId }, { $set: update }).catch(() => {});
      }
    });
  });

  socket.on("record_chunk", (chunk) => {
    if (!socket.data.recording || !socket.data.recordStream) return;

    let buf;
    if (Buffer.isBuffer(chunk)) buf = chunk;
    else if (chunk instanceof ArrayBuffer) buf = Buffer.from(chunk);
    else if (ArrayBuffer.isView(chunk))
      buf = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    else return;

    socket.data.recordStream.write(buf);
  });

  socket.on("topic_claim", async ({ topicId, subtopicId }) => {
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
  });

  socket.on("topic_selected", async ({ topicId, subtopicId }) => {
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
    if (!call || !call.roleA || !call.roleB) return;

    io.to(call.a).emit("call_start_initiated");
    io.to(call.b).emit("call_start_initiated");

    call.expectedActualStartTime = Date.now() + 5000;
    call.timer = setTimeout(
      () => endCall(call.callId, "timeout"),
      5000 + 20 * 60 * 1000
    );
  });

  socket.on("record_stop", () => {
    cleanupRecording(socket);
  });

  socket.on("disconnect", () => {
    removeFromQueue(socket.id);
    const callId = getCallIdForSocket(socket);
    if (callId) endCall(callId, "disconnect");
    cleanupRecording(socket);

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

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend listening on http://0.0.0.0:${PORT}`);
  console.log(`CORS origin: ${FRONTEND_ORIGIN}`);
});
