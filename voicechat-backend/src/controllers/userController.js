import path from "path";
import fs from "fs";
import { User } from "../models/User.js";
import { CallSession } from "../models/CallSession.js";
import { Feedback } from "../models/Feedback.js";
import { Language } from "../models/Language.js";
import { isNonEmptyString } from "../util/validators.js";
import { getSingleUserPayout } from "../services/payouts.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { s3Client, BUCKET_NAME } from "../config/s3.js";
import ffmpeg from "fluent-ffmpeg";

const RECORDINGS_DIR = process.env.RECORDINGS_DIR || "recordings";

// ─── GET /api/user/status ─────────────────────────────────────────────────────
export function getUserStatus(req, res) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  res.json({
    accountStatus: req.user.accountStatus || "pending_intro",
    rejectionReason: req.user.rejectionReason || null,
  });
}

// ─── POST /api/user/intro-recording ──────────────────────────────────────────
export async function uploadIntroRecording(req, res) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  if (!req.file) return res.status(400).json({ error: "no_file" });

  const status = req.user.accountStatus;
  if (status !== "pending_intro" && status !== "rejected") {
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.status(409).json({ error: "already_submitted" });
  }

  try {
    const flacPath = req.file.path.replace(".wav", ".flac");
    await new Promise((resolve, reject) => {
      ffmpeg(req.file.path)
        .audioChannels(1)
        .audioCodec('flac')
        .output(flacPath)
        .on("end", resolve)
        .on("error", reject)
        .run();
    });

    const s3Key = `intros/${req.user._id}_${Date.now()}.flac`;

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

    try { fs.unlinkSync(req.file.path); } catch (e) {}
    try { fs.unlinkSync(flacPath); } catch (e) {}

    await User.updateOne(
      { _id: req.user._id },
      {
        accountStatus: "pending_approval",
        introRecordingFile: s3Key,
        rejectionReason: null,
      }
    );
    res.json({ ok: true, accountStatus: "pending_approval" });
  } catch (err) {
    console.error("Intro upload error:", err);
    try { if (req.file.path) fs.unlinkSync(req.file.path); } catch (e) {}
    res.status(500).json({ error: "server error" });
  }
}

// ─── GET /api/languages ───────────────────────────────────────────────────────
export async function getLanguages(req, res) {
  try {
    const langs = await Language.find({ enabled: true }).sort({ name: 1 }).lean();
    res.json({ languages: langs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ─── GET /api/language-applications/my ───────────────────────────────────────
export async function getMyLanguageApplications(req, res) {
  try {
    const user = await User.findById(req.user._id)
      .select("languageApplications")
      .lean();
    res.json({ applications: user?.languageApplications || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ─── POST /api/language-applications ─────────────────────────────────────────
export async function submitLanguageApplication(req, res) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  if (!req.file) return res.status(400).json({ error: "no_file" });

  const languageCode = String(req.body?.languageCode || "")
    .trim()
    .toLowerCase();
  if (!languageCode)
    return res.status(400).json({ error: "languageCode is required" });

  const lang = await Language.findOne({ code: languageCode, enabled: true });
  if (!lang)
    return res.status(404).json({ error: "Language not found or disabled" });

  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ error: "User not found" });

  const existing = user.languageApplications.find(
    (a) => a.languageCode === languageCode
  );
  if (existing && existing.status === "pending") {
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.status(409).json({ error: "already_pending" });
  }
  if (existing && existing.status === "approved") {
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.status(409).json({ error: "already_approved" });
  }

  try {
    const flacPath = req.file.path.replace(".wav", ".flac");
    await new Promise((resolve, reject) => {
      ffmpeg(req.file.path)
        .audioChannels(1)
        .audioCodec('flac')
        .output(flacPath)
        .on("end", resolve)
        .on("error", reject)
        .run();
    });

    const s3Key = `language-apps/${req.user._id}_${languageCode}_${Date.now()}.flac`;

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

    try { fs.unlinkSync(req.file.path); } catch (e) {}
    try { fs.unlinkSync(flacPath); } catch (e) {}

    if (existing) {
      existing.status = "pending";
      existing.recordingFile = s3Key;
      existing.appliedAt = new Date();
      existing.reviewedBy = null;
      existing.reviewedAt = null;
    } else {
      user.languageApplications.push({
        languageCode,
        status: "pending",
        recordingFile: s3Key,
        appliedAt: new Date(),
      });
    }

    await user.save();
    res.json({ ok: true, message: "Application submitted" });
  } catch (err) {
    console.error("Language app error:", err);
    try { if (req.file.path) fs.unlinkSync(req.file.path); } catch (e) {}
    res.status(500).json({ error: "server error" });
  }
}

// ─── GET /api/language-applications/:userId/:languageCode/recording ───────────
export async function streamLanguageRecording(req, res) {
  const requestedLanguageCode = String(req.params.languageCode || "")
    .trim()
    .toLowerCase();
  const qaLanguageCode = String(
    req.user?.qaLanguageCode || req.user?.qaLanguageCodes?.[0] || ""
  )
    .trim()
    .toLowerCase();
  const canReviewLanguage =
    req.user?.isAdmin ||
    (req.user?.isQA && qaLanguageCode === requestedLanguageCode);
  if (!canReviewLanguage) {
    return res.status(403).json({ error: "Language access required" });
  }

  const user = await User.findById(req.params.userId)
    .select("languageApplications")
    .lean();
  if (!user) return res.status(404).json({ error: "User not found" });

  const application = user.languageApplications.find(
    (a) => a.languageCode === requestedLanguageCode
  );
  if (!application?.recordingFile)
    return res.status(404).json({ error: "Recording not found" });

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: application.recordingFile, 
    });
    const s3Doc = await s3Client.send(command);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", s3Doc.ContentType || "audio/webm");
    s3Doc.Body.pipe(res);
  } catch (err) {
    return res.status(404).json({ error: "File not found on AWS S3" });
  }
}

// ─── GET /api/calls/today-count ───────────────────────────────────────────────
export async function getTodayCallCount(req, res) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = await CallSession.countDocuments({
      $or: [{ userA: req.userId }, { userB: req.userId }],
      startedAt: { $gte: today },
      callActuallyStarted: true,
    });

    const user = await User.findById(req.userId);
    const limit = user?.dailyCallLimit !== undefined ? user.dailyCallLimit : 50;
    const overallLimit = user?.overallCallLimit !== undefined ? user.overallCallLimit : -1;

    let remaining = Math.max(0, limit - count);

    if (overallLimit !== -1) {
        const overallCount = await CallSession.countDocuments({
            $or: [{ userA: req.userId }, { userB: req.userId }],
            callActuallyStarted: true,
        });
        const overallRemaining = Math.max(0, overallLimit - overallCount);
        remaining = Math.min(remaining, overallRemaining);
    }

    res.json({ count, limit, remaining, overallLimit });
  } catch {
    res.status(500).json({ error: "server_error" });
  }
}

// ─── GET /api/history ─────────────────────────────────────────────────────────
export async function getCallHistory(req, res) {
  const sessions = await CallSession.find({
    $or: [{ userA: req.userId }, { userB: req.userId }],
  })
    .sort({ startedAt: -1 })
    .populate("userA", "username")
    .populate("userB", "username")
    .populate("subtopicId", "title description")
    .lean();

  const currentUser = await User.findById(req.userId).select("isAdmin").lean();
  const isAdmin = currentUser?.isAdmin || false;

  res.json({
    sessions: sessions.map((s) => {
      const userA = s.userA;
      const userB = s.userB;
      const meIsA = userA?._id?.toString() === req.userId;
      const peer = meIsA ? userB : userA;

      const sessionData = {
        callId: s.callId,
        startedAt: s.startedAt,
        actualCallStartedAt: s.actualCallStartedAt || null,
        recordingAStartedAt: s.recordingAStartedAt || null,
        recordingBStartedAt: s.recordingBStartedAt || null,
        endedAt: s.endedAt || null,
        endReason: s.endReason || null,
        callStatus: meIsA
          ? s.recordingAStatus || "pending"
          : s.recordingBStatus || "pending",
        reviewNote: meIsA
          ? s.recordingAReviewNote || null
          : s.recordingBReviewNote || null,
        callActuallyStarted: s.callActuallyStarted || false,
        language: s.language || "english",
        subtopic: s.subtopicId
          ? { title: s.subtopicId.title, description: s.subtopicId.description }
          : null,
        peer: peer
          ? { id: peer._id.toString(), username: peer.username }
          : null,
      };

      if (isAdmin) {
        sessionData.recordingFile = meIsA
          ? s.recordingAFile || null
          : s.recordingBFile || null;
      }

      return sessionData;
    }),
  });
}

// ─── GET /api/payouts/me ──────────────────────────────────────────────────────
export async function getMyPayout(req, res) {
  try {
    const payout = await getSingleUserPayout(req.userId);
    if (!payout) {
      return res.json({
        summary: {
          user: { id: req.userId },
          totalCallsMade: 0,
          totalApprovedCalls: 0,
          pendingCalls: 0,
          rejectedCalls: 0,
          totalMoneyMadeUsd: 0,
          totalPaidOutUsd: 0,
          totalRemainingPayoutUsd: 0,
        },
        calls: [],
        payments: [],
      });
    }
    res.json(payout);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ─── POST /api/feedback ───────────────────────────────────────────────────────
export async function submitFeedback(req, res) {
  const callId = String(req.body?.callId || "");
  const toUserId = String(req.body?.toUserId || "");
  const ratingOverall = Number(req.body?.ratingOverall);
  const audioQuality = Number(req.body?.audioQuality);
  const wouldTalkAgain = Boolean(req.body?.wouldTalkAgain);
  const notes = String(req.body?.notes || "");

  if (!isNonEmptyString(callId) || !isNonEmptyString(toUserId)) {
    return res.status(400).json({ error: "invalid_input" });
  }

  const session = await CallSession.findOne({ callId }).lean();
  if (!session) return res.status(404).json({ error: "call_not_found" });

  const userAId = session.userA.toString();
  const userBId = session.userB.toString();
  const isParticipant = req.userId === userAId || req.userId === userBId;
  const isPeer = toUserId === userAId || toUserId === userBId;
  if (!isParticipant || !isPeer || toUserId === req.userId) {
    return res.status(403).json({ error: "forbidden" });
  }

  const fb = await Feedback.create({
    callId,
    fromUser: req.userId,
    toUser: toUserId,
    ratingOverall,
    audioQuality,
    wouldTalkAgain,
    notes,
  });

  res.json({ ok: true, id: fb._id.toString() });
}

// ─── GET /api/recordings/:callId/:fileName ────────────────────────────────────
export async function streamRecording(req, res) {
  const callId = String(req.params.callId || "");
  const fileName = path.basename(String(req.params.fileName || ""));

  if (!isNonEmptyString(callId) || !isNonEmptyString(fileName)) {
    return res.status(400).json({ error: "invalid_input" });
  }

  const session = await CallSession.findOne({ callId }).lean();
  if (!session) return res.status(404).json({ error: "call_not_found" });

  const userAId = session.userA.toString();
  const userBId = session.userB.toString();
  const isParticipant = req.userId === userAId || req.userId === userBId;
  if (!isParticipant) return res.status(403).json({ error: "forbidden" });

  const allowedFile =
    req.userId === userAId ? session.recordingAFile : session.recordingBFile;
  if (!allowedFile || allowedFile !== fileName) {
    return res.status(404).json({ error: "recording_not_found" });
  }

  const awsKey = `calls/${callId}/${fileName}`;
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: awsKey });
    const s3Doc = await s3Client.send(command);
    const mimeType = fileName.endsWith(".ogg") ? "audio/ogg" : "audio/webm";
    res.setHeader("Content-Type", s3Doc.ContentType || mimeType);
    s3Doc.Body.pipe(res);
  } catch (err) {
    return res.status(404).json({ error: "recording_not_found" });
  }
}
