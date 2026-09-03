import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { CallSession } from "../models/CallSession.js";
import { Feedback } from "../models/Feedback.js";
import { Language } from "../models/Language.js";
import { ScriptedLanguage } from "../models/ScriptedLanguage.js";
import { Phrase } from "../models/Phrase.js";
import { Company } from "../models/Company.js";
import { Counter } from "../models/Counter.js";
import { isNonEmptyString } from "../util/validators.js";
import { getSingleUserPayout } from "../services/payouts.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { s3Client, BUCKET_NAME } from "../config/s3.js";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { generateSignedAgreementPdf, AGREEMENT_VERSION } from "../services/agreementPdf.js";
import { sendIntroSubmissionEmail, sendAgreementSignedEmail, sendProjectApplicationReceivedEmail } from "../util/emailService.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const RECORDINGS_DIR = process.env.RECORDINGS_DIR || "recordings";

// ─── GET /api/user/status ─────────────────────────────────────────────────────
export function getUserStatus(req, res) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  res.json({
    accountStatus: req.user.accountStatus || "pending_intro",
    rejectionReason: req.user.rejectionReason || null,
    isDisabled: !!req.user.isDisabled,
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

    const timestamp = Date.now();
    const baseFileName = `${req.user._id}_${timestamp}.flac`;
    const s3Key = `intros/${baseFileName}`;
    let recordingFileRef = s3Key;
    let s3Uploaded = false;

    if (process.env.AWS_ACCESS_KEY_ID && process.env.S3_BUCKET_NAME) {
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
        s3Uploaded = true;
      } catch (s3Err) {
        console.warn("S3 upload skipped/failed for intro recording, saving locally:", s3Err.message);
      }
    }

    if (!s3Uploaded) {
      const localDir = path.join(process.cwd(), "recordings", "intros");
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      const localFileName = baseFileName;
      const targetLocalPath = path.join(localDir, localFileName);
      fs.copyFileSync(flacPath, targetLocalPath);
      recordingFileRef = `local:${localFileName}`;
    }

    try { fs.unlinkSync(req.file.path); } catch (e) {}
    try { fs.unlinkSync(flacPath); } catch (e) {}

    await User.updateOne(
      { _id: req.user._id },
      {
        accountStatus: "pending_approval",
        introRecordingFile: recordingFileRef,
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

    // Send confirmation email
    try {
      await sendIntroSubmissionEmail(
        req.user.email,
        req.user.firstname,
        req.user.lastname
      );
    } catch (mailErr) {
      console.error("Failed to send intro recording submission email:", mailErr.message);
    }

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
    
    if (req.user) {
      const userId = req.user._id;
      const languagesWithProgress = await Promise.all(
        langs.map(async (lang) => {
          const sessions = await CallSession.find({
            $or: [{ userA: userId }, { userB: userId }],
            language: lang.code,
            callActuallyStarted: true,
          }).select("actualCallDuration");
          
          const totalSeconds = sessions.reduce((sum, s) => sum + (s.actualCallDuration || 0), 0);
          return {
            ...lang,
            userDurationSeconds: totalSeconds,
          };
        })
      );
      return res.json({ languages: languagesWithProgress });
    }

    res.json({ languages: langs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ─── GET /api/scripted-languages ───────────────────────────────────────────────
export async function getScriptedLanguages(req, res) {
  try {
    const langs = await ScriptedLanguage.find({ enabled: true })
      .select("-companyName") // Strictly hidden from public/users
      .sort({ name: 1 })
      .lean();
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
    
    let applications = user?.languageApplications || [];

    const companies = await Company.find({}).select("name projectName _id enforceLufs userCustomizations hourlyPayout").lean();
    const companyInfoMap = new Map();
    for (const c of companies) {
      const info = {
        companyId: c._id.toString(),
        companyName: c.name,
        projectName: c.projectName || c.name,
        cleanName: c.name.replace(/_downloaded$/i, "").trim(),
        enforceLufs: c.enforceLufs !== false,
        userCustomizations: c.userCustomizations || [],
        hourlyPayout: c.hourlyPayout || 0
      };
      const keys = [
        c._id.toString().toLowerCase(),
        c.name.toLowerCase(),
        c.name.replace(/_downloaded$/i, "").trim().toLowerCase(),
        (c.projectName || "").toLowerCase().trim()
      ].filter(Boolean);

      for (const k of keys) {
        companyInfoMap.set(k, info);
      }
    }

    applications = applications.map(app => {
      const rawComp = String(app.companyId || "").trim().toLowerCase();
      const rawCleanComp = rawComp.replace(/_downloaded$/i, "").trim();
      const matchedInfo = companyInfoMap.get(rawComp) || companyInfoMap.get(rawCleanComp);

      return {
        ...app,
        projectName: matchedInfo?.projectName || app.projectName || app.companyId || "",
        companyName: matchedInfo?.companyName || app.companyId || "",
        cleanCompanyId: matchedInfo?.cleanName || rawCleanComp,
        matchedCompanyDbId: matchedInfo?.companyId || "",
        enforceLufs: matchedInfo ? (matchedInfo.enforceLufs !== false) : true,
        userCustomizations: matchedInfo?.userCustomizations || []
      };
    });

    res.json({ applications, isAdmin: !!req.user.isAdmin, isQA: !!req.user.isQA });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ─── POST /api/language-applications ─────────────────────────────────────────
export async function submitLanguageApplication(req, res) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  
  const uploadedFiles = req.files && req.files.length > 0 
    ? req.files 
    : (req.file ? [req.file] : []);

  if (uploadedFiles.length === 0) return res.status(400).json({ error: "no_file" });

  const applicationType = String(req.body?.applicationType || "phrase").trim();
  const languageCode = String(req.body?.languageCode || "").trim().toLowerCase();
  const companyId = String(req.body?.companyId || "").trim() || null;
  
  if (applicationType === "phrase" && !companyId) {
    return res.status(400).json({ error: "companyId is required for phrase applications" });
  }

  let samplesMetadata = [];
  try {
    if (req.body?.samplesMetadata) {
      samplesMetadata = JSON.parse(req.body.samplesMetadata);
    }
  } catch (e) {}

  try {
    let targetCompany = companyId;
    if (applicationType === "phrase") {
      try {
        if (targetCompany.match(/^[0-9a-fA-F]{24}$/)) {
          const companyDoc = await Company.findById(targetCompany);
          if (companyDoc) {
            targetCompany = companyDoc.name;
          }
        }
      } catch (e) {}

      const activePhrase = await Phrase.findOne({
        companyId: { $regex: new RegExp(`^${targetCompany}$`, "i") },
        language: { $regex: new RegExp(`^${languageCode}$`, "i") }
      });
      if (!activePhrase) {
        const companyExists = await Company.findOne({ name: { $regex: new RegExp(`^${targetCompany}$`, "i") } });
        if (!companyExists) {
          uploadedFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
          return res.status(400).json({ error: "No sample phrase available for this company and language." });
        }
      }
    }

    let lang;
    if (languageCode) {
      if (applicationType === "scripted_call") {
        lang = await ScriptedLanguage.findOne({
          $or: [
            { code: languageCode.toLowerCase() },
            { name: { $regex: new RegExp(`^${languageCode}$`, "i") } },
            mongoose.Types.ObjectId.isValid(languageCode) ? { _id: languageCode } : null
          ].filter(Boolean)
        });
        if (!lang) {
          uploadedFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
          return res.status(404).json({ error: "Scripted language not found or disabled" });
        }
      } else {
        const filter = applicationType === "call"
          ? { code: { $regex: new RegExp(`^${languageCode}$`, "i") }, enabled: true }
          : { code: { $regex: new RegExp(`^${languageCode}$`, "i") } };
        lang = await Language.findOne(filter);
        if (!lang) {
          if (applicationType === "phrase") {
            const formattedLangName = languageCode.charAt(0).toUpperCase() + languageCode.slice(1);
            lang = await Language.findOneAndUpdate(
              { code: languageCode.toLowerCase() },
              {
                $setOnInsert: {
                  code: languageCode.toLowerCase(),
                  name: formattedLangName,
                  hourlyPayout: 0,
                  enabled: true,
                  isPhrase: true
                }
              },
              { upsert: true, new: true }
            );
          } else {
            uploadedFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
            return res.status(404).json({
              error: "Language not found or disabled for calls"
            });
          }
        }
      }
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      uploadedFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
      return res.status(404).json({ error: "User not found" });
    }

    const existing = (user.languageApplications || []).find(
      (a) => String(a.languageCode || "").toLowerCase() === languageCode.toLowerCase() && 
             (applicationType === 'phrase' ? String(a.companyId || "").toLowerCase() === String(companyId || "").toLowerCase() : true) && 
             (a.applicationType || 'phrase') === applicationType
    );
    if (existing && existing.status === "pending") {
      uploadedFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
      return res.status(409).json({ error: "already_pending" });
    }
    if (existing && existing.status === "approved") {
      uploadedFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
      return res.status(409).json({ error: "already_approved" });
    }
    if (existing && existing.status === "blacklisted") {
      uploadedFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
      return res.status(403).json({ error: "blacklisted" });
    }

    // Generate speaker_id if not present
    if (!user.speaker_id) {
      const { seq } = await Counter.findOneAndUpdate(
        { _id: "speaker_id" },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );
      user.speaker_id = `spk_${seq}`;
      await user.save();
    }

    const companyFolder = targetCompany ? targetCompany.replace(/[^a-zA-Z0-9_\-\ ]/g, "").trim() : "No_Company";
    const sampleRecordingsList = [];
    let primaryRecordingRef = null;

    // Process each uploaded sample file
    for (let i = 0; i < uploadedFiles.length; i++) {
      const f = uploadedFiles[i];
      let flacPath = f.path.replace(/\.[^/.]+$/, "") + ".flac";
      if (flacPath === f.path) {
        flacPath = f.path + "_converted.flac";
      }

      try {
        await new Promise((resolve) => {
          ffmpeg(f.path)
            .audioChannels(1)
            .audioCodec('flac')
            .output(flacPath)
            .on("end", resolve)
            .on("error", (err) => {
              console.warn("FFmpeg conversion error in sample app:", err.message);
              resolve();
            })
            .run();
        });
      } catch (ffmpegErr) {
        console.warn("FFmpeg exception in sample, using original file:", ffmpegErr.message);
      }

      const finalAudioPath = fs.existsSync(flacPath) ? flacPath : f.path;
      const isFlac = finalAudioPath.endsWith(".flac");
      const ext = isFlac ? ".flac" : (path.extname(f.path) || ".wav");

      const meta = samplesMetadata[i] || {};
      const sampleLabel = uploadedFiles.length > 1 ? `__sample_${i + 1}` : "";
      const baseFileName = applicationType === "phrase"
        ? `${user.speaker_id}__${companyFolder}__${languageCode}${sampleLabel}${ext}`
        : applicationType === "scripted_call"
          ? `${user.speaker_id || user._id}__scripted__${languageCode}_${Date.now()}${sampleLabel}${ext}`
          : `${user._id}_${languageCode}_${Date.now()}${sampleLabel}${ext}`;
      
      let s3Key;
      if (applicationType === "phrase" && targetCompany) {
        s3Key = `phrases/${companyFolder}/phrase apps/${baseFileName}`;
      } else if (applicationType === "scripted_call") {
        s3Key = `scripted-call-apps/${baseFileName}`;
      } else {
        s3Key = `language-apps/${baseFileName}`;
      }

      let recordingFileRef = s3Key;
      let s3Uploaded = false;

      if (process.env.AWS_ACCESS_KEY_ID && process.env.S3_BUCKET_NAME) {
        try {
          const uploader = new Upload({
            client: s3Client,
            params: {
              Bucket: BUCKET_NAME,
              Key: s3Key,
              Body: fs.createReadStream(finalAudioPath),
              ContentType: isFlac ? "audio/flac" : "audio/wav",
            },
          });
          await Promise.race([
            uploader.done(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("S3 Upload Timeout")), 3000))
          ]);
          s3Uploaded = true;
        } catch (s3Err) {
          console.warn("S3 upload failed for sample, saving locally:", s3Err.message);
        }
      }

      if (!s3Uploaded) {
        const localDir = path.join(process.cwd(), "recordings", "language-apps");
        if (!fs.existsSync(localDir)) {
          fs.mkdirSync(localDir, { recursive: true });
        }
        const targetLocalPath = path.join(localDir, baseFileName);
        fs.copyFileSync(finalAudioPath, targetLocalPath);
        recordingFileRef = `local:${baseFileName}`;
      }

      try { fs.unlinkSync(f.path); } catch (e) {}
      if (finalAudioPath !== f.path) {
        try { fs.unlinkSync(finalAudioPath); } catch (e) {}
      }

      if (!primaryRecordingRef) {
        primaryRecordingRef = recordingFileRef;
      }

      sampleRecordingsList.push({
        sampleIndex: i,
        phraseId: meta.phraseId || `sample_${i + 1}`,
        text: meta.text || '',
        emotion: meta.emotion || '',
        style: meta.style || '',
        speed: meta.speed || '',
        intent: meta.intent || '',
        pitch: meta.pitch || '',
        volume: meta.volume || '',
        instructions: meta.instructions || '',
        tags: meta.tags || {},
        lufs: meta.lufs !== undefined ? meta.lufs : null,
        recordingFile: recordingFileRef
      });
    }

    if (existing) {
      existing.status = "pending";
      existing.recordingFile = primaryRecordingRef;
      existing.sampleRecordings = sampleRecordingsList;
      existing.appliedAt = new Date();
      existing.reviewedBy = null;
      existing.reviewedAt = null;
    } else {
      user.languageApplications.push({
        applicationType,
        companyId,
        languageCode,
        status: "pending",
        recordingFile: primaryRecordingRef,
        sampleRecordings: sampleRecordingsList,
        appliedAt: new Date(),
      });
    }

    await user.save();

    // Send application received email
    try {
      const languageName = lang?.name || languageCode;
      await sendProjectApplicationReceivedEmail(user.email, user.firstname, languageName, applicationType);
    } catch (mailErr) {
      console.error("Failed to send project application received email:", mailErr.message);
    }

    res.json({ ok: true, message: "Application submitted", sampleCount: sampleRecordingsList.length });
  } catch (err) {
    console.error("Language app error:", err);
    uploadedFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
    res.status(500).json({ error: err.message || "server error" });
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

  let recordingTarget = application.recordingFile;
  if (req.query.sampleIndex !== undefined && application.sampleRecordings && application.sampleRecordings.length > 0) {
    const sIdx = Number(req.query.sampleIndex);
    const foundSample = application.sampleRecordings.find(s => s.sampleIndex === sIdx) || application.sampleRecordings[sIdx];
    if (foundSample && foundSample.recordingFile) {
      recordingTarget = foundSample.recordingFile;
    }
  }

  if (!recordingTarget)
    return res.status(404).json({ error: "Recording not found" });

  const localDir = path.join(process.cwd(), "recordings", "language-apps");
  const exactLocalName = recordingTarget.startsWith("local:") 
    ? recordingTarget.replace("local:", "") 
    : path.basename(recordingTarget);
  
  let resolvedFilePath = null;
  const exactPath = path.join(localDir, exactLocalName);

  if (fs.existsSync(exactPath)) {
    resolvedFilePath = exactPath;
  } else {
    // Check if the directory exists and look for a timestamp-mismatched file
    if (fs.existsSync(localDir)) {
      const prefix = `${req.params.userId}_${requestedLanguageCode}_`;
      const files = fs.readdirSync(localDir);
      const matchingFiles = files.filter(f => f.startsWith(prefix) && f.endsWith(".flac"));
      
      if (matchingFiles.length > 0) {
        // Parse DB timestamp from filename (e.g. USER_LANG_TIMESTAMP.flac)
        const dbTsMatch = exactLocalName.match(/_(\d+)\.flac$/);
        const dbTs = dbTsMatch ? parseInt(dbTsMatch[1]) : 0;

        if (dbTs > 0) {
          let closestFile = null;
          let minDiff = Infinity;
          for (const f of matchingFiles) {
            const fTsMatch = f.match(/_(\d+)\.flac$/);
            const fTs = fTsMatch ? parseInt(fTsMatch[1]) : 0;
            const diff = Math.abs(fTs - dbTs);
            if (diff < minDiff) {
              minDiff = diff;
              closestFile = f;
            }
          }
          // If a file matches with a difference of up to 60 seconds (useful for long timeouts)
          if (closestFile && minDiff < 60000) {
            resolvedFilePath = path.join(localDir, closestFile);
            console.log(`Matched timestamp-fallback file: ${closestFile} for requested: ${exactLocalName}`);
          }
        }

        // If still not matched, fallback to the latest matching file
        if (!resolvedFilePath) {
          matchingFiles.sort((a, b) => {
            const aTs = parseInt(a.match(/_(\d+)\.flac$/)?.[1] || 0);
            const bTs = parseInt(b.match(/_(\d+)\.flac$/)?.[1] || 0);
            return bTs - aTs;
          });
          resolvedFilePath = path.join(localDir, matchingFiles[0]);
          console.log(`Matched latest-fallback file: ${matchingFiles[0]} for requested: ${exactLocalName}`);
        }
      }
    }
  }

  if (resolvedFilePath && fs.existsSync(resolvedFilePath)) {
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", "audio/flac");
    return fs.createReadStream(resolvedFilePath).pipe(res);
  }

  if (recordingTarget.startsWith("local:")) {
    return res.status(404).json({ error: "Local recording file not found" });
  }

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: recordingTarget, 
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

// ─── GET /api/language-applications/:userId/:appId/download-zip ───────────
export async function downloadApplicantSamplesZip(req, res) {
  try {
    const { userId, appId } = req.params;
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    const application = (user.languageApplications || []).find(a => String(a._id) === String(appId));
    if (!application) return res.status(404).json({ error: "Application not found" });

    const speakerId = user.speaker_id || `spk_${user._id}`;
    const company = application.companyId || "Call";
    const language = application.languageCode || "lang";
    const zipName = `${speakerId}_${company}_${language}_samples.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

    const archiverModule = await import("archiver");
    const archiverFn = archiverModule.default || archiverModule;
    let archive;
    if (typeof archiverFn === "function") {
      archive = archiverFn("zip", { zlib: { level: 9 } });
    } else if (archiverModule.ZipArchive) {
      archive = new archiverModule.ZipArchive({ zlib: { level: 9 } });
    } else {
      throw new Error("Could not initialize archiver engine");
    }
    archive.pipe(res);

    const localDir = path.join(process.cwd(), "recordings", "language-apps");

    const samples = application.sampleRecordings && application.sampleRecordings.length > 0
      ? application.sampleRecordings
      : [{ sampleIndex: 0, phraseId: "sample_1", recordingFile: application.recordingFile }];

    const pattern = req.query.namingPattern || req.query.pattern || "";
    const nameCounts = {};

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const recFile = sample.recordingFile || application.recordingFile;
      if (!recFile) continue;

      let entryBaseName = "";
      if (pattern) {
        entryBaseName = pattern
          .replace(/\{speakerId\}/gi, speakerId)
          .replace(/\{company\}/gi, company)
          .replace(/\{language\}/gi, language)
          .replace(/\{phraseId\}/gi, sample.phraseId || `sample_${i + 1}`)
          .replace(/\{id\}/gi, sample.phraseId || `sample_${i + 1}`)
          .replace(/\{emotion\}/gi, sample.emotion || sample.tags?.emotion || `sample_${i + 1}`)
          .replace(/\{style\}/gi, sample.style || sample.tags?.style || "")
          .replace(/\{intent\}/gi, sample.intent || sample.tags?.intent || "")
          .replace(/\{speed\}/gi, sample.speed || sample.tags?.speed || "")
          .replace(/\{pitch\}/gi, sample.pitch || sample.tags?.pitch || "")
          .replace(/\{volume\}/gi, sample.volume || sample.tags?.volume || "")
          .replace(/\{sampleIndex\}/gi, String(i + 1))
          .replace(/\{index\}/gi, String(i + 1));
      }

      if (!entryBaseName || entryBaseName.trim() === "") {
        const phraseName = String(sample.phraseId || `sample_${i + 1}`).replace(/[^a-zA-Z0-9_\-]/g, "_");
        entryBaseName = `${speakerId}_${company}_${language}_sample_${i + 1}_${phraseName}`;
      }

      // Remove invalid filename characters
      let cleanEntryName = entryBaseName.replace(/[^a-zA-Z0-9_\-]/g, "_").replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "");
      if (!cleanEntryName) cleanEntryName = `sample_${i + 1}`;

      // Disambiguate if duplicate names exist (e.g. multiple "shocked.wav")
      if (nameCounts[cleanEntryName] !== undefined) {
        nameCounts[cleanEntryName]++;
        cleanEntryName = `${cleanEntryName}_${nameCounts[cleanEntryName]}`;
      } else {
        nameCounts[cleanEntryName] = 1;
      }

      const entryName = `${cleanEntryName}.wav`;

      try {
        let buffer = null;
        if (recFile.startsWith("local:")) {
          const localPath = path.join(localDir, recFile.replace("local:", ""));
          if (fs.existsSync(localPath)) {
            buffer = fs.readFileSync(localPath);
          }
        } else if (process.env.AWS_ACCESS_KEY_ID && process.env.S3_BUCKET_NAME) {
          try {
            const cmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: recFile });
            const s3Res = await s3Client.send(cmd);
            const chunks = [];
            for await (const chunk of s3Res.Body) {
              chunks.push(chunk);
            }
            buffer = Buffer.concat(chunks);
          } catch (e) {
            console.warn("Failed to fetch S3 audio for applicant zip:", e.message);
          }
        }

        if (buffer) {
          archive.append(buffer, { name: entryName });
        }
      } catch (err) {
        console.error("Error adding sample to zip:", err);
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error("downloadApplicantSamplesZip error:", err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
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
    .populate("reviewedBy", "firstname lastname username email")
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
          ? s.recordingAReviewNote || s.reviewNotes || null
          : s.recordingBReviewNote || s.reviewNotes || null,
        reviewedBy: s.reviewedBy ? {
          id: s.reviewedBy._id?.toString(),
          name: `${s.reviewedBy.firstname || ""} ${s.reviewedBy.lastname || ""}`.trim() || s.reviewedBy.username || "QA Reviewer",
          email: s.reviewedBy.email || null,
        } : null,
        reviewedAt: s.reviewedAt || null,
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
  if (!allowedFile || path.basename(allowedFile) !== fileName) {
    return res.status(404).json({ error: "recording_not_found" });
  }

  // Use the full S3 key stored in the DB directly
  const awsKey = allowedFile;
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: awsKey });
    const s3Doc = await s3Client.send(command);
    const mimeType = fileName.endsWith(".ogg") ? "audio/ogg" : fileName.endsWith(".flac") ? "audio/flac" : "audio/webm";
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

  const [callDone, phraseDone, completedCallDone] = await Promise.all([
    CallSession.exists({
      $or: [{ userA: req.user._id }, { userB: req.user._id }],
      callActuallyStarted: true,
    }),
    Phrase.exists({
      contributorId: req.user._id,
      recordedAt: { $ne: null },
    }),
    CallSession.exists({
      $or: [{ userA: req.user._id }, { userB: req.user._id }],
      callActuallyStarted: true,
      endedAt: { $ne: null }
    }),
  ]);

  const hasContributed = !!(callDone || phraseDone);
  const hasCompletedCall = !!completedCallDone;

  const needsPanReminder =
    verificationStatus === "rejected" ||
    (!panSubmitted && hasContributed);

  const needsUpiReminder = hasCompletedCall && !req.user.upiId;

  res.json({
    panSubmitted,
    verificationStatus,
    rejectionReason,
    needsPanReminder,
    needsUpiReminder,
    upiId: req.user.upiId || null,
    hasCompletedCall,
  });
}

// ─── POST /api/user/upi ───────────────────────────────────────────────────────
export async function updateUpiId(req, res) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  const upiId = String(req.body?.upiId || "").trim();
  if (!upiId) {
    return res.status(400).json({ error: "UPI ID is required" });
  }
  const upiRegex = /^[\w.\-_]{2,256}@[a-zA-Z]{2,64}$/;
  if (!upiRegex.test(upiId)) {
    return res.status(400).json({ error: "Invalid UPI ID format (e.g. username@upi or mobile@bank)" });
  }

  req.user.upiId = upiId;
  await req.user.save();
  return res.json({ success: true, upiId: req.user.upiId });
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
  const timestamp = Date.now();
  const s3Key = `kyc/${req.user._id}_pan_${timestamp}.${ext}`;
  let recordingFileRef = s3Key;
  let s3Uploaded = false;

  if (process.env.AWS_ACCESS_KEY_ID && process.env.S3_BUCKET_NAME) {
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
      s3Uploaded = true;
    } catch (err) {
      console.warn("[kyc] PAN card S3 upload failed, saving locally:", err.message);
    }
  }

  if (!s3Uploaded) {
    const localDir = path.join(process.cwd(), "recordings", "kyc");
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    const localFileName = `${req.user._id}_pan_${timestamp}.${ext}`;
    const targetLocalPath = path.join(localDir, localFileName);
    fs.writeFileSync(targetLocalPath, req.file.buffer);
    recordingFileRef = `local:${localFileName}`;
  }

  const previousKey = req.user.kyc?.panCardS3Key;

  try {
    await User.updateOne(
      { _id: req.user._id },
      {
        $set: {
          "kyc.panNumber": panNumber,
          "kyc.panCardS3Key": recordingFileRef,
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

  const timestampVal = Date.now();
  const s3Key = `contributor-agreements/${req.user._id}_${timestampVal}.pdf`;
  let recordingFileRef = s3Key;
  let s3Uploaded = false;

  if (process.env.AWS_ACCESS_KEY_ID && process.env.S3_BUCKET_NAME) {
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
      s3Uploaded = true;
    } catch (err) {
      console.warn("[contributorAgreement] S3 upload failed, saving locally:", err.message);
    }
  }

  if (!s3Uploaded) {
    const localDir = path.join(process.cwd(), "recordings", "agreements");
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    const localFileName = `${req.user._id}_${timestampVal}.pdf`;
    const targetLocalPath = path.join(localDir, localFileName);
    fs.writeFileSync(targetLocalPath, pdfBytes);
    recordingFileRef = `local:${localFileName}`;
  }

  const signerName = `${req.user.firstname || ""} ${req.user.lastname || ""}`.trim();
  const assignedDoc = req.user.contributorAgreement?.assignedAgreementDoc || "default";
  const savedVersion = assignedDoc === "datacatalyst-voice-dataset-consent-agreement"
    ? "v2.0-NoCloning"
    : AGREEMENT_VERSION;

  try {
    await User.updateOne(
      { _id: req.user._id },
      {
        $set: {
          "contributorAgreement.signed": true,
          "contributorAgreement.signedAt": new Date(timestamp),
          "contributorAgreement.s3Key": recordingFileRef,
          "contributorAgreement.signerName": signerName,
          "contributorAgreement.signerIp": ip,
          "contributorAgreement.agreementVersion": savedVersion,
          "contributorAgreement.pdfHash": pdfHash,
          "contributorAgreement.adminReviewStatus": "pending",
          "contributorAgreement.adminReviewedAt": null,
          "contributorAgreement.adminReviewedBy": null,
          "contributorAgreement.adminReviewReason": null,
        },
      }
    );

    // Send confirmation email with PDF attachment
    try {
      await sendAgreementSignedEmail(req.user.email, req.user.firstname, recordingFileRef, pdfBytes);
    } catch (mailErr) {
      console.error("Failed to send agreement signed email:", mailErr.message);
    }
  } catch (err) {
    console.error("[contributorAgreement] DB update failed:", err);
    return res.status(500).json({ error: "db_update_failed", s3Key: recordingFileRef });
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
  // Serve local files directly
  if (ca.s3Key.startsWith("local:")) {
    const localFileName = ca.s3Key.replace("local:", "");
    const localFilePath = path.join(process.cwd(), "recordings", "agreements", localFileName);
    if (fs.existsSync(localFilePath)) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="Voclara-Contributor-Agreement-${ca.agreementVersion || "signed"}.pdf"`
      );
      return fs.createReadStream(localFilePath).pipe(res);
    }
    return res.status(404).json({ error: "Local agreement file not found" });
  }

  // Fallback: check if S3 key filename exists locally in recordings/agreements
  const baseName = path.basename(ca.s3Key);
  const fallbackPath = path.join(process.cwd(), "recordings", "agreements", baseName);
  if (fs.existsSync(fallbackPath)) {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Voclara-Contributor-Agreement-${ca.agreementVersion || "signed"}.pdf"`
    );
    return fs.createReadStream(fallbackPath).pipe(res);
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

// PATCH /api/user/profile-completion
export async function updateProfileCompletion(req, res) {
  try {
    const { accent, dialect } = req.body;
    if (!isNonEmptyString(accent) || !isNonEmptyString(dialect)) {
      return res.status(400).json({ error: "Accent and Dialect are required." });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { accent: accent.trim(), dialect: dialect.trim() } },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      message: "Profile updated successfully",
      user: {
        id: user._id.toString(),
        firstname: user.firstname,
        lastname: user.lastname,
        username: user.username,
        email: user.email,
        mobileNumber: user.mobileNumber || user.phone || "",
        phone: user.mobileNumber || user.phone || "",
        isAdmin: user.isAdmin,
        isQA: user.isQA,
        accountStatus: user.accountStatus,
        accent: user.accent,
        dialect: user.dialect,
        contributorAgreement: user.contributorAgreement
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// PATCH /api/user/mobile-number
export async function updateMobileNumber(req, res) {
  try {
    const rawNumber = String(req.body?.mobileNumber || req.body?.phone || "").trim();
    if (!rawNumber) {
      return res.status(400).json({ error: "Mobile number is required." });
    }

    const digitsOnly = rawNumber.replace(/[^0-9]/g, "");
    if (digitsOnly.length < 10 || digitsOnly.length > 15) {
      return res.status(400).json({ error: "Please enter a valid 10-digit mobile number." });
    }

    const cleanNumber = rawNumber.startsWith("+") ? `+${digitsOnly}` : digitsOnly;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { mobileNumber: cleanNumber, phone: cleanNumber } },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: "User not found" });

    const ca = user.contributorAgreement || {};
    res.json({
      message: "Mobile number updated successfully",
      user: {
        id: user._id.toString(),
        firstname: user.firstname || "",
        lastname: user.lastname || "",
        username: user.username || "",
        email: user.email,
        mobileNumber: user.mobileNumber || user.phone || "",
        phone: user.mobileNumber || user.phone || "",
        isAdmin: user.isAdmin || false,
        isQA: user.isQA || false,
        qaLanguageCode: user.qaLanguageCode || user.qaLanguageCodes?.[0] || null,
        qaLanguageCodes: user.qaLanguageCodes || [],
        perCallPayrate: user.perCallPayrate !== undefined ? user.perCallPayrate : 0,
        hourlyPhrasePayrate: user.hourlyPhrasePayrate !== undefined ? user.hourlyPhrasePayrate : 0,
        dailyCallLimit: user.dailyCallLimit,
        accountStatus: user.accountStatus || "pending_intro",
        isDisabled: !!user.isDisabled,
        accent: user.accent || null,
        dialect: user.dialect || null,
        languageApplications: (user.languageApplications || []).map(a => ({
          companyId: a.companyId,
          languageCode: a.languageCode,
          applicationType: a.applicationType || "call",
          status: a.status
        })),
        contributorAgreement: {
          signed: !!ca.signed,
          agreementVersion: ca.agreementVersion || null,
          signedAt: ca.signedAt || null,
          adminReviewStatus: ca.adminReviewStatus || null,
          adminReviewReason: ca.adminReviewReason || null,
          assignedAgreementDoc: ca.assignedAgreementDoc || "default",
        },
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ─── POST /api/language-applications/noise-gate (and /audio-config) ─────────
export async function updateUserNoiseGate(req, res) {
  try {
    const { applicationType, companyId, languageCode, noiseGateDb, notch5kEnabled, deHissMode, deEsserMode } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const rawVal = parseInt(noiseGateDb);
    const gateValue = isNaN(rawVal) ? (user.noiseGateDb || 0) : Math.min(0, Math.max(-60, rawVal));
    const notchVal = notch5kEnabled !== undefined ? !!notch5kEnabled : (user.notch5kEnabled || false);
    const deHissVal = ["off", "14k", "12k", "10k", "8k"].includes(deHissMode) ? deHissMode : (user.deHissMode || "off");
    const deEsserVal = ["off", "light", "medium", "strong"].includes(deEsserMode) ? deEsserMode : (user.deEsserMode || "off");

    user.noiseGateDb = gateValue;
    user.notch5kEnabled = notchVal;
    user.deHissMode = deHissVal;
    user.deEsserMode = deEsserVal;

    if (!user.languageApplications) {
      user.languageApplications = [];
    }

    const type = applicationType || "phrase";
    const reqLang = String(languageCode || "").toLowerCase().trim();

    // Resolve company identifiers if companyId is provided
    let companyIdentifiers = [];
    if (companyId) {
      let company = null;
      if (mongoose.Types.ObjectId.isValid(companyId)) {
        company = await Company.findById(companyId).lean();
      }
      if (!company) {
        const escaped = String(companyId).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        company = await Company.findOne({
          $or: [
            { name: { $regex: new RegExp(`^${escaped}$`, "i") } },
            { projectName: { $regex: new RegExp(`^${escaped}$`, "i") } }
          ]
        }).lean();
      }
      if (company) {
        const cName = company.name;
        const pName = company.projectName || company.name;
        const bName = cName.replace(/_downloaded$/, "").trim();
        companyIdentifiers = [cName, pName, bName, `${bName}_downloaded`, String(company._id)];
      } else {
        companyIdentifiers = [companyId, String(companyId).replace(/_downloaded$/, "").trim()];
      }
    }

    let updatedApp = false;
    user.languageApplications.forEach(app => {
      const appType = app.applicationType || "phrase";
      if (appType !== type) return;

      const appLang = String(app.languageCode || "").toLowerCase().trim();
      if (reqLang && appLang && appLang !== reqLang) return;

      if (type === "phrase" && companyIdentifiers.length > 0) {
        const appComp = String(app.companyId || "").replace(/_downloaded$/, "").trim().toLowerCase();
        const matchesComp = companyIdentifiers.some(id => id.replace(/_downloaded$/, "").trim().toLowerCase() === appComp);
        if (!matchesComp) return;
      }

      app.noiseGateDb = gateValue;
      app.notch5kEnabled = notchVal;
      app.deHissMode = deHissVal;
      app.deEsserMode = deEsserVal;
      updatedApp = true;
    });

    if (!updatedApp && reqLang) {
      user.languageApplications.push({
        applicationType: type,
        companyId: companyId || null,
        languageCode: reqLang,
        status: "approved",
        noiseGateDb: gateValue,
        notch5kEnabled: notchVal,
        deHissMode: deHissVal,
        deEsserMode: deEsserVal,
        appliedAt: new Date()
      });
    }

    user.markModified("languageApplications");
    await user.save();

    res.json({
      success: true,
      message: "Audio configurations updated successfully.",
      noiseGateDb: gateValue,
      notch5kEnabled: notchVal,
      deHissMode: deHissVal,
      deEsserMode: deEsserVal
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export const updateUserAudioConfig = updateUserNoiseGate;

