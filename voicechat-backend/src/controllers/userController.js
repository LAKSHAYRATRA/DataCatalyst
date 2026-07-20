import path from "path";
import fs from "fs";
import { User } from "../models/User.js";
import { CallSession } from "../models/CallSession.js";
import { Feedback } from "../models/Feedback.js";
import { Language } from "../models/Language.js";
import { Phrase } from "../models/Phrase.js";
import { isNonEmptyString } from "../util/validators.js";
import { getSingleUserPayout } from "../services/payouts.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { s3Client, BUCKET_NAME } from "../config/s3.js";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { generateSignedAgreementPdf, AGREEMENT_VERSION } from "../services/agreementPdf.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

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

  const consentTos = req.body?.consent_tos === "true";
  const consentPrivacy = req.body?.consent_privacy === "true";
  const consentSample = req.body?.consent_sample === "true";
  if (!consentTos || !consentPrivacy || !consentSample) {
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.status(400).json({ error: "consent_required" });
  }
  const clientTs = req.body?.consent_timestamp;
  const consentAt = clientTs && !Number.isNaN(new Date(clientTs).getTime())
    ? new Date(clientTs)
    : new Date();

  try {
    const flacPath = req.file.path.replace(".wav", ".flac");
    await new Promise((resolve, reject) => {
      ffmpeg(req.file.path)
        .audioChannels(1)
        .audioCodec('flac')
        .outputOptions(['-sample_fmt s32'])
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
        introRecordingUploadedAt: new Date(),
        introReviewedAt: null,
        introConsent: {
          tos: true,
          privacy: true,
          sample: true,
          at: consentAt,
        },
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

  const applicationType = String(req.body?.applicationType || "phrase").trim();
  const languageCode = String(req.body?.languageCode || "").trim().toLowerCase();
  const companyId = String(req.body?.companyId || "").trim() || null;
  
  if (applicationType === "phrase" && !companyId) {
    return res.status(400).json({ error: "companyId is required for phrase applications" });
  }

  try {
    if (languageCode) {
      const lang = await Language.findOne({ code: languageCode, enabled: true });
      if (!lang) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        return res.status(404).json({ error: "Language not found or disabled" });
      }
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(404).json({ error: "User not found" });
    }

    const existing = user.languageApplications.find(
      (a) => a.languageCode === languageCode && (applicationType === 'phrase' ? a.companyId === companyId : true) && a.applicationType === applicationType
    );
    if (existing && existing.status === "pending") {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(409).json({ error: "already_pending" });
    }
    if (existing && existing.status === "approved") {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(409).json({ error: "already_approved" });
    }
    const flacPath = req.file.path.replace(".wav", ".flac");
    await new Promise((resolve, reject) => {
      ffmpeg(req.file.path)
        .audioChannels(1)
        .audioCodec('flac')
        .outputOptions(['-sample_fmt s32'])
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
        applicationType,
        companyId,
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

// ─── GET /api/language-applications/:userId/:appId/recording ───────────
export async function streamLanguageRecording(req, res) {
  const appId = String(req.params.appId || "").trim();

  const user = await User.findById(req.params.userId)
    .select("languageApplications")
    .lean();
  if (!user) return res.status(404).json({ error: "User not found" });

  const application = user.languageApplications.find(
    (a) => String(a._id) === appId
  );
  if (!application) return res.status(404).json({ error: "Application not found" });

  const requestedLanguageCode = String(application.languageCode).toLowerCase();
  
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

  if (!application.recordingFile)
    return res.status(404).json({ error: "Recording not found" });

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: application.recordingFile, 
    });
    const s3Doc = await s3Client.send(command);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", "audio/flac");
    s3Doc.Body.on('error', (err) => {
        console.error('S3 Stream error (intro recording):', err);
    }).pipe(res);
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
    s3Doc.Body.on('error', (err) => {
        console.error('S3 Stream error (call recording):', err);
    }).pipe(res);
  } catch (err) {
    return res.status(404).json({ error: "recording_not_found" });
  }
}

// ─── GET /api/user/kyc/status ─────────────────────────────────────────────────
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export async function getKycStatus(req, res) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const kyc = req.user.kyc || {};
  const panSubmitted = !!kyc.panCardS3Key;
  const verificationStatus = kyc.verificationStatus || null;
  const rejectionReason = verificationStatus === "rejected" ? kyc.rejectionReason || null : null;

  let hasContributed = false;
  if (!panSubmitted || verificationStatus === "rejected") {
    const [callDone, phraseDone] = await Promise.all([
      CallSession.exists({
        $or: [{ userA: req.user._id }, { userB: req.user._id }],
        callActuallyStarted: true,
      }),
      Phrase.exists({
        contributorId: req.user._id,
        recordedAt: { $ne: null },
      }),
    ]);
    hasContributed = !!(callDone || phraseDone);
  }

  const needsPanReminder =
    verificationStatus === "rejected" ||
    (!panSubmitted && hasContributed);

  res.json({
    panSubmitted,
    verificationStatus,
    rejectionReason,
    needsPanReminder,
  });
}

// ─── POST /api/user/kyc/pan ───────────────────────────────────────────────────
export async function uploadPanCard(req, res) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  if (!req.file) return res.status(400).json({ error: "no_file" });

  const panNumber = String(req.body?.panNumber || "").trim().toUpperCase();
  if (!PAN_REGEX.test(panNumber)) {
    return res.status(400).json({ error: "invalid_pan_format" });
  }

  const ext = req.file.mimetype === "image/png" ? "png" : "jpg";
  const s3Key = `kyc/${req.user._id}_pan_${Date.now()}.${ext}`;

  try {
    const uploader = new Upload({
      client: s3Client,
      params: {
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      },
    });
    await uploader.done();
  } catch (err) {
    console.error("[kyc] PAN card S3 upload failed:", err);
    return res.status(502).json({ error: "storage_unavailable" });
  }

  const previousKey = req.user.kyc?.panCardS3Key;

  try {
    await User.updateOne(
      { _id: req.user._id },
      {
        $set: {
          "kyc.panNumber": panNumber,
          "kyc.panCardS3Key": s3Key,
          "kyc.submittedAt": new Date(),
          "kyc.verificationStatus": "pending",
          "kyc.verifiedBy": null,
          "kyc.verifiedAt": null,
          "kyc.rejectionReason": null,
        },
      }
    );
  } catch (err) {
    console.error("[kyc] DB update failed:", err);
    return res.status(500).json({ error: "db_update_failed", s3Key });
  }

  if (previousKey && previousKey !== s3Key) {
    try {
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: previousKey }));
    } catch (err) {
      console.error("[kyc] failed to delete previous PAN card:", err.message);
    }
  }

  res.json({ ok: true });
}

// ─── GET /api/user/contributor-agreement/status ──────────────────────────────
export async function getContributorAgreementStatus(req, res) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const ca = req.user.contributorAgreement || {};
  res.json({
    signed: !!ca.signed,
    signedAt: ca.signedAt || null,
    agreementVersion: ca.agreementVersion || null,
    currentVersion: AGREEMENT_VERSION,
    needsSigning:
      req.user.accountStatus === "approved" &&
      (!ca.signed || ca.agreementVersion !== AGREEMENT_VERSION),
  });
}

// ─── POST /api/user/contributor-agreement/sign ──────────────────────────────
const REQUIRED_CHECKBOXES = [
  "age",
  "authority",
  "aiUse",
  "exclusivity",
  "participantsConsent",
  "paymentTerms",
  "biometricConsent",
];

export async function signContributorAgreement(req, res) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });

  if (req.user.accountStatus !== "approved") {
    return res.status(403).json({ error: "not_approved" });
  }

  const body = req.body || {};
  const checkboxes = body.checkboxes || {};
  for (const key of REQUIRED_CHECKBOXES) {
    if (checkboxes[key] !== true) {
      return res.status(400).json({ error: "checkbox_missing", key });
    }
  }

  const dataUrl = body.signatureDataUrl;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) {
    return res.status(400).json({ error: "invalid_signature_format" });
  }
  const base64 = dataUrl.slice("data:image/png;base64,".length);
  let sigBuf;
  try {
    sigBuf = Buffer.from(base64, "base64");
  } catch {
    return res.status(400).json({ error: "invalid_signature_base64" });
  }
  if (sigBuf.length < 200 || sigBuf.length > 2_000_000) {
    return res.status(400).json({ error: "signature_size_out_of_range" });
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  const timestamp = new Date().toISOString();

  let pdfBytes, pdfHash;
  try {
    const gen = await generateSignedAgreementPdf({
      user: req.user,
      signaturePngBuffer: sigBuf,
      signingMeta: { timestamp, ip },
    });
    pdfBytes = gen.pdfBytes;
    pdfHash = gen.hash;
  } catch (err) {
    console.error("[contributorAgreement] PDF generation failed:", err);
    return res.status(500).json({ error: "pdf_generation_failed" });
  }

  const s3Key = `contributor-agreements/${req.user._id}_${Date.now()}.pdf`;
  try {
    const uploader = new Upload({
      client: s3Client,
      params: {
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: pdfBytes,
        ContentType: "application/pdf",
      },
    });
    await uploader.done();
  } catch (err) {
    console.error("[contributorAgreement] S3 upload failed:", err);
    return res.status(502).json({ error: "storage_unavailable" });
  }

  const signerName = `${req.user.firstname || ""} ${req.user.lastname || ""}`.trim();
  try {
    await User.updateOne(
      { _id: req.user._id },
      {
        $set: {
          "contributorAgreement.signed": true,
          "contributorAgreement.signedAt": new Date(timestamp),
          "contributorAgreement.s3Key": s3Key,
          "contributorAgreement.signerName": signerName,
          "contributorAgreement.signerIp": ip,
          "contributorAgreement.agreementVersion": AGREEMENT_VERSION,
          "contributorAgreement.pdfHash": pdfHash,
          "contributorAgreement.adminReviewStatus": "pending",
          "contributorAgreement.adminReviewedAt": null,
          "contributorAgreement.adminReviewedBy": null,
          "contributorAgreement.adminReviewReason": null,
        },
      }
    );
  } catch (err) {
    console.error("[contributorAgreement] DB update failed:", err);
    return res.status(500).json({ error: "db_update_failed", s3Key });
  }

  res.json({
    ok: true,
    signedAt: timestamp,
    agreementVersion: AGREEMENT_VERSION,
  });
}

// ─── GET /api/user/contributor-agreement/download ───────────────────────────
export async function downloadContributorAgreement(req, res) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const ca = req.user.contributorAgreement;
  if (!ca || !ca.signed || !ca.s3Key) {
    return res.status(404).json({ error: "not_signed" });
  }
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: ca.s3Key });
    const s3Doc = await s3Client.send(command);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Voclara-Contributor-Agreement-${ca.agreementVersion || "signed"}.pdf"`
    );
    s3Doc.Body.on("error", (err) => {
      console.error("[contributorAgreement] S3 stream error:", err);
    }).pipe(res);
  } catch (err) {
    console.error("[contributorAgreement] Download failed:", err);
    return res.status(500).json({ error: "download_failed" });
  }
}
