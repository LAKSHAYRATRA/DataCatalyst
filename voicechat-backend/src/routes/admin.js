import express from "express";
import { Topic } from "../models/Topic.js";
import { Subtopic } from "../models/Subtopic.js";
import { CallSession } from "../models/CallSession.js";
import { Feedback } from "../models/Feedback.js";
import { User } from "../models/User.js";
import { Language } from "../models/Language.js";
import { PayoutPayment } from "../models/PayoutPayment.js";
import { isAdmin } from "../middleware/isAdmin.js";
import { isAdminOrQA } from "../middleware/isQA.js";
import { requireAuth } from "../auth.js";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { Phrase } from "../models/Phrase.js";
import { Company } from "../models/Company.js";
import { Counter } from "../models/Counter.js";
import { getPayoutOverview, getSingleUserPayout, getFinancesOverview } from "../services/payouts.js";
import { ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand, CopyObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "../config/s3.js";
import { streamS3ToWav, getWavStream, getWavBuffer } from "../utils/ffmpeg-stream.js";
import { sendAgreementRejectionEmail, sendIntroApprovalEmail, sendIntroRejectionEmail, sendIntroFinalDeletionEmail, sendAgreementApprovedEmail, sendProjectApplicationApprovedEmail, sendProjectApplicationRejectedEmail, sendUpiRequestEmail } from "../util/emailService.js";
import { updateLimitAndBlacklist } from "../services/limitService.js";
import { spawn } from "child_process";
import os from "os";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { invokeAudioQC } from "../config/lambda.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

router.get("/fix-speaker-ids", async (req, res) => {
    try {
        const usersToUpdate = await User.find({
            $or: [
                { speaker_id: { $exists: false } },
                { speaker_id: null },
                { speaker_id: "" }
            ]
        }).sort({ createdAt: 1 });

        let updatedCount = 0;
        for (const user of usersToUpdate) {
            const { seq } = await Counter.findOneAndUpdate(
                { _id: "speaker_id" },
                { $inc: { seq: 1 } },
                { upsert: true, new: true }
            );
            
            const speaker_id = `spk_${seq}`;
            
            await User.updateOne(
                { _id: user._id },
                { $set: { speaker_id } }
            );
            updatedCount++;
        }
        res.json({ success: true, updatedCount, totalUsersWithoutIdBefore: usersToUpdate.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get("/companies", requireAuth(JWT_SECRET), async (req, res) => {
    try {
        const allCompanies = await Company.find({}).sort({ name: 1 }).lean();

        // For admin management & batch upload selectors, return ALL companies
        if (req.query.forApply !== "true") {
            const companiesWithTags = await Promise.all(
                allCompanies.map(async (c) => {
                    const samplePhrases = await Phrase.find({ companyId: c.name })
                        .limit(100)
                        .select("tags emotion style intent pitch speed volume instructions script_type")
                        .lean();
                    const tagKeys = new Set();
                    const standardFields = ["emotion", "style", "intent", "pitch", "speed", "volume", "instructions", "script_type"];
                    for (const p of samplePhrases) {
                        if (p.tags) {
                            for (const k of Object.keys(p.tags)) {
                                tagKeys.add(k);
                            }
                        }
                        for (const f of standardFields) {
                            if (p[f] !== undefined && p[f] !== null && p[f] !== "") {
                                tagKeys.add(f);
                            }
                        }
                    }
                    return {
                        ...c,
                        availableTags: Array.from(tagKeys)
                    };
                })
            );
            return res.json({ companies: companiesWithTags });
        }

        // For contributor apply page (?forApply=true), aggregate active phrases and ONLY list companies with actual sample phrases
        const activeCombinations = await Phrase.aggregate([
            { $match: { status: { $in: ["pending", "locked", "rejected"] } } },
            { $group: { _id: { companyId: "$companyId", language: "$language" } } }
        ]);

        const companyActiveLangs = {};
        for (const combo of activeCombinations) {
            if (combo._id && combo._id.companyId && combo._id.language) {
                const comp = String(combo._id.companyId).trim().toLowerCase();
                const lang = String(combo._id.language).trim().toLowerCase();
                if (!companyActiveLangs[comp]) {
                    companyActiveLangs[comp] = new Set();
                }
                companyActiveLangs[comp].add(lang);
            }
        }

        const filteredCompanies = allCompanies.map(c => {
            const compKey = String(c.name || "").trim().toLowerCase();
            const activeLangs = companyActiveLangs[compKey];

            // If no sample phrases exist for this company, do NOT list it on the contributor apply page
            if (!activeLangs || activeLangs.size === 0) return null;

            return {
                ...c,
                languages: Array.from(activeLangs)
            };
        }).filter(Boolean);

        res.json({ companies: filteredCompanies });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get("/companies/:id", requireAuth(JWT_SECRET), async (req, res) => {
    try {
        const company = await Company.findById(req.params.id).lean();
        if (!company) return res.status(404).json({ error: "Company not found" });

        // Compute available tags for this company
        const samplePhrases = await Phrase.find({ companyId: company.name })
            .limit(100)
            .select("tags emotion style intent pitch speed volume instructions script_type")
            .lean();
        const tagKeys = new Set();
        const standardFields = ["emotion", "style", "intent", "pitch", "speed", "volume", "instructions", "script_type"];
        for (const p of samplePhrases) {
            if (p.tags) {
                for (const k of Object.keys(p.tags)) {
                    tagKeys.add(k);
                }
            }
            for (const f of standardFields) {
                if (p[f] !== undefined && p[f] !== null && p[f] !== "") {
                    tagKeys.add(f);
                }
            }
        }

        res.json({
            company: {
                ...company,
                availableTags: Array.from(tagKeys)
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

function getReviewerLanguageCodes(user) {
    if (!user?.isQA || user?.isAdmin) return [];
    if (user?.qaLanguageCode) {
        return [String(user.qaLanguageCode).trim().toLowerCase()].filter(Boolean);
    }
    return Array.isArray(user.qaLanguageCodes)
        ? user.qaLanguageCodes.map((code) => String(code).trim().toLowerCase()).filter(Boolean).slice(0, 1)
        : [];
}

function hasLanguageAccess(user, languageCode) {
    if (user?.isAdmin) return true;
    if (!user?.isQA) return false;
    const allowed = getReviewerLanguageCodes(user);
    return allowed.includes(String(languageCode || "").trim().toLowerCase());
}

async function listLanguageApplications(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const statusFilter = req.query.status;
        const typeFilter = req.query.type; // 'call' or 'phrase'
        const skip = (page - 1) * limit;
        const allowedLanguages = req.user.isAdmin ? null : getReviewerLanguageCodes(req.user);

        const users = await User.find({ "languageApplications.0": { $exists: true } })
            .select("firstname lastname email username languageApplications")
            .lean();

        let apps = [];
        users.forEach((u) => {
            u.languageApplications.forEach((app) => {
                const languageCode = String(app.languageCode || "").trim().toLowerCase();
                const appType = app.applicationType || 'phrase';
                if (statusFilter && app.status !== statusFilter) return;
                if (typeFilter && appType !== typeFilter) return;
                if (allowedLanguages && !allowedLanguages.includes(languageCode)) return;
                apps.push({
                    appId: app._id,
                    userId: u._id,
                    userFirstname: u.firstname,
                    userLastname: u.lastname,
                    userEmail: u.email,
                    username: u.username,
                    companyId: app.companyId,
                    ...app,
                });
            });
        });

        apps.sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));
        const total = apps.length;
        apps = apps.slice(skip, skip + limit);

        res.json({ applications: apps, total, page, pages: Math.ceil(total / limit) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

async function approveLanguageApplication(req, res) {
    try {
        const appId = req.params.appId;
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: "User not found" });
        const app = user.languageApplications.find((a) => String(a._id) === String(appId));
        if (!app) return res.status(404).json({ error: "Application not found" });
        
        const languageCode = String(app.languageCode || "").trim().toLowerCase();
        if (!hasLanguageAccess(req.user, languageCode)) {
            return res.status(403).json({ error: "Forbidden: language access required" });
        }
        app.status = "approved";
        app.reviewedBy = req.user._id;
        app.reviewedAt = new Date();
        await user.save();

        // Send project approved email
        try {
            const languageDoc = await Language.findOne({ code: languageCode });
            const languageName = languageDoc?.name || app.languageCode;
            await sendProjectApplicationApprovedEmail(user.email, user.firstname, languageName, app.applicationType);
        } catch (mailErr) {
            console.error("Failed to send project application approval email:", mailErr.message);
        }

        res.json({ message: "Application approved" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

async function rejectLanguageApplication(req, res) {
    try {
        const appId = req.params.appId;
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: "User not found" });
        const app = user.languageApplications.find((a) => String(a._id) === String(appId));
        if (!app) return res.status(404).json({ error: "Application not found" });

        const languageCode = String(app.languageCode || "").trim().toLowerCase();
        if (!hasLanguageAccess(req.user, languageCode)) {
            return res.status(403).json({ error: "Forbidden: language access required" });
        }
        app.status = "rejected";
        app.reviewedBy = req.user._id;
        app.reviewedAt = new Date();
        await user.save();

        // Send project rejected email
        try {
            const languageDoc = await Language.findOne({ code: languageCode });
            const languageName = languageDoc?.name || app.languageCode;
            await sendProjectApplicationRejectedEmail(user.email, user.firstname, languageName, app.applicationType);
        } catch (mailErr) {
            console.error("Failed to send project application rejection email:", mailErr.message);
        }

        res.json({ message: "Application rejected" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

async function analyzeLanguageApplication(req, res) {
    let tempInputPath = null;
    let yamnetWavPath = null;
    let freqWavPath = null;
    try {
        const userId = req.params.userId;
        const appId = req.params.appId;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: "User not found" });
        const app = user.languageApplications.find((a) => String(a._id) === String(appId));
        if (!app) return res.status(404).json({ error: "Application not found" });

        const languageCode = String(app.languageCode || "").trim().toLowerCase();
        if (!hasLanguageAccess(req.user, languageCode)) {
            return res.status(403).json({ error: "Forbidden: language access required" });
        }

        // Check if there is cached QC results
        if (app.qcResult && req.query.force !== "true") {
            return res.json(app.qcResult);
        }

        if (!app.recordingFile) {
            return res.status(404).json({ error: "Recording file not found" });
        }

        // 1. Resolve recording file path
        const localDir = path.join(process.cwd(), "recordings", "language-apps");
        const exactLocalName = app.recordingFile.startsWith("local:") 
          ? app.recordingFile.replace("local:", "") 
          : path.basename(app.recordingFile);
        
        let resolvedFilePath = null;
        const exactPath = path.join(localDir, exactLocalName);
        if (fs.existsSync(exactPath)) {
            resolvedFilePath = exactPath;
        } else {
            if (fs.existsSync(localDir)) {
                const prefix = `${userId}_${languageCode}_`;
                const files = fs.readdirSync(localDir);
                const matchingFiles = files.filter(f => f.startsWith(prefix) && f.endsWith(".flac"));
                if (matchingFiles.length > 0) {
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
                        if (closestFile && minDiff < 60000) {
                            resolvedFilePath = path.join(localDir, closestFile);
                        }
                    }
                    if (!resolvedFilePath) {
                        matchingFiles.sort((a, b) => {
                            const aTs = parseInt(a.match(/_(\d+)\.flac$/)?.[1] || 0);
                            const bTs = parseInt(b.match(/_(\d+)\.flac$/)?.[1] || 0);
                            return bTs - aTs;
                        });
                        resolvedFilePath = path.join(localDir, matchingFiles[0]);
                    }
                }
            }
        }

        let finalQC;

        if (resolvedFilePath && fs.existsSync(resolvedFilePath)) {
            // Local fallback (development environment only)
            tempInputPath = path.join(os.tmpdir(), `input_${Date.now()}_${userId}.flac`);
            fs.copyFileSync(resolvedFilePath, tempInputPath);

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
                        console.error("[Freq QC] failed:", stderr);
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
            if (app.recordingFile.startsWith("local:")) {
                return res.status(404).json({ error: "Local recording file not found" });
            }
            const lambdaResult = await invokeAudioQC({
                bucket: BUCKET_NAME,
                key: app.recordingFile,
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

        app.qcResult = finalQC;
        user.markModified("languageApplications");
        await user.save();

        res.json(finalQC);
    } catch (e) {
        console.error("Language application analysis failed:", e);
        res.status(500).json({ error: e.message });
    } finally {
        try { if (tempInputPath && fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath); } catch {}
        try { if (yamnetWavPath && fs.existsSync(yamnetWavPath)) fs.unlinkSync(yamnetWavPath); } catch {}
        try { if (freqWavPath && fs.existsSync(freqWavPath)) fs.unlinkSync(freqWavPath); } catch {}
        try { if (plotPath && fs.existsSync(plotPath)) fs.unlinkSync(plotPath); } catch {}
    }
}

// ===== QA CALL REVIEW (admin OR QA) — mounted BEFORE isAdmin so QA users can access =====
// Uses its own requireAuth + isAdminOrQA guard instead of relying on the parent isAdmin.
const qaCallRouter = express.Router();
qaCallRouter.use(requireAuth(JWT_SECRET));
qaCallRouter.use(isAdminOrQA);

// List calls for QA review with pagination
qaCallRouter.get("/calls", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const status = req.query.status;
        const skip = (page - 1) * limit;

        const filter = { callActuallyStarted: true };
        if (req.user.isQA && !req.user.isAdmin) {
            filter.callStatus = "pending";
            filter.language = { $in: getReviewerLanguageCodes(req.user) };
        } else if (status) {
            filter.callStatus = status;
        }

        const [calls, total] = await Promise.all([
            CallSession.find(filter)
                .populate("userA", "firstname lastname username email dob gender address locality regionalLanguage speaker_id")
                .populate("userB", "firstname lastname username email dob gender address locality regionalLanguage speaker_id")
                .populate("topicId", "title")
                .populate("subtopicId", "title description instructions")
                .populate("reviewedBy", "firstname lastname email")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            CallSession.countDocuments(filter),
        ]);

        res.json({ calls, total, page, pages: Math.ceil(total / limit) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Submit review — action is optional for notes-only updates
qaCallRouter.patch("/calls/:callId", async (req, res) => {
    const { action, notes } = req.body;
    if (action && !["approved", "rejected"].includes(action))
        return res.status(400).json({ error: "action must be 'approved' or 'rejected'" });
    try {
        const call = await CallSession.findOne({ callId: req.params.callId });
        if (!call) return res.status(404).json({ error: "Call not found" });
        if (!hasLanguageAccess(req.user, call.language)) {
            return res.status(403).json({ error: "Forbidden: language access required" });
        }

        if (action) call.callStatus = action;
        call.reviewedBy = req.user._id;
        call.reviewedAt = new Date();
        call.reviewNotes = notes !== undefined ? (notes || null) : call.reviewNotes;
        await call.save();

        res.json({ message: action ? `Call ${action}` : "Notes saved", callId: call.callId, callStatus: call.callStatus });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Helper: compute overall callStatus from individual recording statuses
function computeCallStatus(recordingAStatus, recordingBStatus) {
    if (recordingAStatus === "approved" && recordingBStatus === "approved") return "approved";
    if (recordingAStatus === "rejected" || recordingBStatus === "rejected") return "rejected";
    return "pending";
}

function roundCurrency(value) {
    return Math.round(value * 100) / 100;
}

function getRecordingDurationMinutes(call, side) {
    const minKey = side === "A" ? "recordingADurationMinutes" : "recordingBDurationMinutes";
    if (call && call[minKey] && Number(call[minKey]) > 0) return Number(call[minKey]);
    if (call && call.actualCallDuration && Number(call.actualCallDuration) > 0) {
        return roundCurrency(Number(call.actualCallDuration) / 60);
    }
    const startedAt = side === "A"
        ? (call?.recordingAStartedAt || call?.actualCallStartedAt || call?.startedAt)
        : (call?.recordingBStartedAt || call?.actualCallStartedAt || call?.startedAt);
    const endedAt = call?.endedAt;
    if (!startedAt || !endedAt) return 0;
    const diffMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
    if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;
    return roundCurrency(diffMs / 60000);
}

async function getLanguageHourlyPayout(languageCode) {
    const language = await Language.findOne({ code: String(languageCode || "").trim().toLowerCase() })
        .select("hourlyPayout")
        .lean();
    return Number(language?.hourlyPayout) || 0;
}

async function applyRecordingDecision(call, userId, action, reviewerId, note) {
    const normalizedNote = typeof note === "string" ? note.trim() : "";

    let side;
    if (call.userA.toString() === userId) {
        side = "A";
    } else if (call.userB.toString() === userId) {
        side = "B";
    } else {
        const error = new Error("User not part of this call");
        error.statusCode = 404;
        throw error;
    }

    const statusKey = side === "A" ? "recordingAStatus" : "recordingBStatus";
    const noteKey = side === "A" ? "recordingAReviewNote" : "recordingBReviewNote";
    const durationKey = side === "A" ? "recordingADurationMinutes" : "recordingBDurationMinutes";
    const payoutKey = side === "A" ? "recordingAPayoutUsd" : "recordingBPayoutUsd";

    call[statusKey] = action;
    call[noteKey] = normalizedNote || null;

    if (action === "approved") {
        const durationMinutes = getRecordingDurationMinutes(call, side);
        const hourlyPayout = await getLanguageHourlyPayout(call.language);
        call[durationKey] = durationMinutes;
        call[payoutKey] = roundCurrency((hourlyPayout * durationMinutes) / 60);
    } else {
        call[durationKey] = 0;
        call[payoutKey] = 0;
    }

    call.callStatus = computeCallStatus(call.recordingAStatus, call.recordingBStatus);
    call.reviewedBy = reviewerId;
    call.reviewedAt = new Date();
    return side;
}

// Approve specific user's recording (accessible to QA)
qaCallRouter.patch("/calls/:callId/approve/:userId", async (req, res) => {
    try {
        const { callId, userId } = req.params;
        const call = await CallSession.findOne({ callId });
        if (!call) return res.status(404).json({ error: "Call not found" });
        if (!hasLanguageAccess(req.user, call.language)) {
            return res.status(403).json({ error: "Forbidden: language access required" });
        }
        await applyRecordingDecision(call, userId, "approved", req.user._id, req.body?.note);
        await call.save();
        await updateLimitAndBlacklist(userId, call.language, true);

        res.json({ message: "Recording approved successfully", call });
    } catch (e) {
        res.status(e.statusCode || 500).json({ error: e.message });
    }
});

// Reject specific user's recording (accessible to QA)
qaCallRouter.patch("/calls/:callId/reject/:userId", async (req, res) => {
    try {
        const { callId, userId } = req.params;
        const call = await CallSession.findOne({ callId });
        if (!call) return res.status(404).json({ error: "Call not found" });
        if (!hasLanguageAccess(req.user, call.language)) {
            return res.status(403).json({ error: "Forbidden: language access required" });
        }
        await applyRecordingDecision(call, userId, "rejected", req.user._id, req.body?.note);
        await call.save();
        await updateLimitAndBlacklist(userId, call.language, false);

        res.json({ message: "Recording rejected successfully", call });
    } catch (e) {
        res.status(e.statusCode || 500).json({ error: e.message });
    }
});

// Stream generated spectrogram plot from S3
qaCallRouter.get("/calls/:callId/spectrogram/:userId", async (req, res) => {
    try {
        const { callId, userId } = req.params;
        const call = await CallSession.findOne({ callId }).lean();
        if (!call) return res.status(404).json({ error: "Call not found" });

        const isUserA = String(call.userA) === String(userId);
        const qcResult = isUserA ? call.recordingAQCResult : call.recordingBQCResult;
        
        if (!qcResult || !qcResult.spectrogramS3Key) {
            return res.status(404).json({ error: "Spectrogram not found" });
        }

        const s3Command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: qcResult.spectrogramS3Key
        });
        const s3Response = await s3Client.send(s3Command);
        res.setHeader("Content-Type", "image/png");
        s3Response.Body.pipe(res);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Run audio QC checks using YAMNet and freq2 python scripts
qaCallRouter.post("/calls/:callId/analyze/:userId", async (req, res) => {
    const { callId, userId } = req.params;
    let tempInputPath = "";
    let yamnetWavPath = "";
    let freqWavPath = "";
    let plotPath = "";

    try {
        const call = await CallSession.findOne({ callId });
        if (!call) return res.status(404).json({ error: "Call not found" });

        let recordingFile;
        if (call.userA.toString() === userId) {
            recordingFile = call.recordingAFile;
        } else if (call.userB.toString() === userId) {
            recordingFile = call.recordingBFile;
        } else {
            return res.status(404).json({ error: "User not part of this call" });
        }

        if (!recordingFile) {
            return res.status(404).json({ error: "Recording file not found on call session" });
        }

        // Check if language is configured as "noisy"
        const langDoc = await Language.findOne({ code: call.language?.toLowerCase() });
        const isNoisy = langDoc ? !!langDoc.noisy : false;

        let qcData;
        let plotBase64 = "";

        if (recordingFile.startsWith("local:") || process.env.LOCAL_QC_FALLBACK === "true") {
            // Local fallback (development environment only)
            const ext = path.extname(recordingFile) || ".wav";
            tempInputPath = path.join(os.tmpdir(), `input_${Date.now()}_${userId}${ext}`);

            const s3Command = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: recordingFile
            });
            const s3Response = await s3Client.send(s3Command);
            
            const fileStream = fs.createWriteStream(tempInputPath);
            await new Promise((resolve, reject) => {
                s3Response.Body.pipe(fileStream);
                s3Response.Body.on("error", reject);
                fileStream.on("finish", resolve);
                fileStream.on("error", reject);
            });

            let yamnetResult = {
                suspicion_rating: 0,
                rating_label: "Clean (YAMNet bypassed - noisy language config)",
                top_noise_events: "None",
                events: []
            };

            const conversions = [];
            if (!isNoisy) {
                yamnetWavPath = path.join(os.tmpdir(), `yamnet_${Date.now()}_${userId}.wav`);
                conversions.push(new Promise((resolve, reject) => {
                    ffmpeg(tempInputPath)
                        .audioChannels(1)
                        .audioFrequency(16000)
                        .toFormat("wav")
                        .on("end", resolve)
                        .on("error", reject)
                        .save(yamnetWavPath);
                }));
                await Promise.all(conversions);
            }

            const PYTHON_BIN = process.env.YAMNET_PYTHON || "python";
            const analyses = [];

            let yamnetPromise = Promise.resolve(yamnetResult);
            if (!isNoisy) {
                const yamnetScriptPath = path.resolve(process.cwd(), "..", "python scripts", "yamnet_noise_analyzer_v4.py");
                yamnetPromise = new Promise((resolve, reject) => {
                    const py = spawn(PYTHON_BIN, [
                        yamnetScriptPath,
                        "--input", yamnetWavPath,
                        "--threshold", "0.20",
                        "--json"
                    ]);
                    let stdout = "";
                    let stderr = "";
                    py.stdout.on("data", (d) => { stdout += d.toString(); });
                    py.stderr.on("data", (d) => { stderr += d.toString(); });
                    py.on("close", (code) => {
                        if (code !== 0) {
                            console.error("[YAMNet QC] failed:", stderr);
                            reject(new Error(`YAMNet exited with code ${code}: ${stderr.slice(0, 300)}`));
                            return;
                        }
                        try {
                            const jsonLine = stdout.split("\n").find(l => l.trim().startsWith("{"));
                            if (!jsonLine) throw new Error("No JSON object found in YAMNet output");
                            resolve(JSON.parse(jsonLine.trim()));
                        } catch (e) {
                            reject(new Error("Failed to parse YAMNet output: " + e.message));
                        }
                    });
                    py.on("error", reject);
                });
            }
            analyses.push(yamnetPromise);

            const freqScriptPath = path.resolve(process.cwd(), "..", "python scripts", "freq2.py");
            const freqPromise = new Promise((resolve, reject) => {
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
                        console.error("[Freq2 QC] failed:", stderr);
                        reject(new Error(`Freq2 exited with code ${code}: ${stderr.slice(0, 300)}`));
                        return;
                    }
                    try {
                        const jsonLine = stdout.split("\n").find(l => l.trim().startsWith("{"));
                        if (!jsonLine) throw new Error("No JSON object found in Freq2 output");
                        resolve(JSON.parse(jsonLine.trim()));
                    } catch (e) {
                        reject(new Error("Failed to parse Freq2 output: " + e.message));
                    }
                });
                py.on("error", reject);
            });
            analyses.push(freqPromise);

            const [resolvedYamnet, resolvedFreq] = await Promise.all(analyses);
            yamnetResult = resolvedYamnet;
            const freqResult = resolvedFreq;

            const spectrogramS3Key = `qc_plots/${callId}_${userId}_spectrogram.png`;
            if (freqResult.plot_path && fs.existsSync(freqResult.plot_path)) {
                plotPath = freqResult.plot_path;
                const plotBuffer = fs.readFileSync(plotPath);
                plotBase64 = plotBuffer.toString("base64");

                await s3Client.send(new PutObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: spectrogramS3Key,
                    Body: plotBuffer,
                    ContentType: "image/png"
                }));
            }

            qcData = {
                yamnet: yamnetResult,
                freq: freqResult,
                spectrogramS3Key: freqResult.plot_path ? spectrogramS3Key : null,
                analyzedAt: new Date()
            };
        } else {
            // Production: Invoke AWS Lambda Audio QC
            const lambdaResult = await invokeAudioQC({
                bucket: BUCKET_NAME,
                key: recordingFile,
                skip_yamnet: isNoisy,
                return_base64_plot: true
            });

            qcData = {
                yamnet: lambdaResult.yamnet,
                freq: {
                    noise_floor_db: lambdaResult.freq.noise_floor_db,
                    noise_floor: lambdaResult.freq.noise_floor,
                    crest_factor: lambdaResult.freq.crest_factor,
                    bit_verdict: lambdaResult.freq.bit_verdict,
                    bit_depth: lambdaResult.freq.bit_depth,
                    processing_verdict: lambdaResult.freq.processing_verdict,
                },
                spectrogramS3Key: lambdaResult.freq.spectrogram_s3_key || null,
                analyzedAt: new Date()
            };
            plotBase64 = lambdaResult.freq.spectrogram_img || "";
        }

        const isUserA = String(call.userA) === String(userId);
        const updateField = isUserA ? "recordingAQCResult" : "recordingBQCResult";

        await CallSession.updateOne(
            { callId },
            { $set: { [updateField]: qcData } }
        );

        res.json({
            ...qcData,
            spectrogram: plotBase64
        });

    } catch (err) {
        console.error("[QC Analysis error]:", err);
        res.status(500).json({ error: "Audio QC Analysis failed", details: err.message });
    } finally {
        if (tempInputPath && fs.existsSync(tempInputPath)) try { fs.unlinkSync(tempInputPath); } catch (e) {}
        if (yamnetWavPath && fs.existsSync(yamnetWavPath)) try { fs.unlinkSync(yamnetWavPath); } catch (e) {}
        if (freqWavPath && fs.existsSync(freqWavPath)) try { fs.unlinkSync(freqWavPath); } catch (e) {}
        if (plotPath && fs.existsSync(plotPath)) try { fs.unlinkSync(plotPath); } catch (e) {}
    }
});

qaCallRouter.get("/calls/:callId/recording/:userId", async (req, res) => {
    try {
        const { callId, userId } = req.params;
        const call = await CallSession.findOne({ callId });
        if (!call) return res.status(404).json({ error: "Call not found" });
        if (!hasLanguageAccess(req.user, call.language)) {
            return res.status(403).json({ error: "Forbidden: language access required" });
        }

        let recordingFile;
        if (call.userA.toString() === userId) {
            recordingFile = call.recordingAFile;
        } else if (call.userB.toString() === userId) {
            recordingFile = call.recordingBFile;
        } else {
            return res.status(404).json({ error: "User not part of this call" });
        }

        if (!recordingFile) {
            return res.status(404).json({ error: "Recording not available" });
        }

        try {
            const s3Params = {
                Bucket: BUCKET_NAME,
                Key: recordingFile
            };
            if (req.headers.range) {
                s3Params.Range = req.headers.range;
            }

            const command = new GetObjectCommand(s3Params);
            const response = await s3Client.send(command);
            
            if (response.ContentRange) {
                res.setHeader("Content-Range", response.ContentRange);
                res.status(206);
            }
            if (response.ContentLength) {
                res.setHeader("Content-Length", response.ContentLength);
            }
            const ext = path.extname(recordingFile).toLowerCase();
            const mimeType = ext === ".flac" ? "audio/flac" : ext === ".wav" ? "audio/wav" : ext === ".ogg" ? "audio/ogg" : "audio/webm";
            res.setHeader("Content-Type", (response.ContentType && response.ContentType !== "binary/octet-stream" && response.ContentType !== "application/octet-stream") ? response.ContentType : mimeType);
            res.setHeader("Content-Disposition", `inline; filename="${path.basename(recordingFile)}"`);
            res.setHeader("Accept-Ranges", "bytes");
            
            response.Body.on('error', (err) => {
                console.error('S3 Stream error (QA call recording):', err);
            }).pipe(res);
        } catch (s3error) {
            console.error("QA call recording streaming S3 error:", s3error);
            return res.status(404).json({ error: "Recording file not found in cloud storage" });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

qaCallRouter.get("/language-applications", listLanguageApplications);
qaCallRouter.patch("/language-applications/:userId/:appId/approve", approveLanguageApplication);
qaCallRouter.patch("/language-applications/:userId/:appId/reject", rejectLanguageApplication);
qaCallRouter.post("/language-applications/:userId/:appId/analyze", analyzeLanguageApplication);


// Mount QA router BEFORE isAdmin — this must stay here
router.use("/qa", qaCallRouter);

const sharedLanguageReviewRouter = express.Router();
sharedLanguageReviewRouter.use(requireAuth(JWT_SECRET));
sharedLanguageReviewRouter.use(isAdminOrQA);
sharedLanguageReviewRouter.get("/language-applications", listLanguageApplications);
sharedLanguageReviewRouter.patch("/language-applications/:userId/:appId/approve", approveLanguageApplication);
sharedLanguageReviewRouter.patch("/language-applications/:userId/:appId/reject", rejectLanguageApplication);
sharedLanguageReviewRouter.post("/language-applications/:userId/:appId/analyze", analyzeLanguageApplication);
router.use("/", sharedLanguageReviewRouter);

// All routes below this line require full admin access
router.use(requireAuth(JWT_SECRET));
router.use(isAdmin);

// ===== STATISTICS =====
router.get("/stats", async (req, res) => {
    try {
        const totalCalls = await CallSession.countDocuments();
        const completedCalls = await CallSession.countDocuments({ endReason: "completed" });
        const totalUsers = await User.countDocuments();
        const totalTopics = await Topic.countDocuments();

        // Average call duration
        const callsWithDuration = await CallSession.find({ actualCallDuration: { $exists: true, $ne: null } });
        const avgDuration = callsWithDuration.length > 0
            ? callsWithDuration.reduce((sum, call) => sum + (call.actualCallDuration || 0), 0) / callsWithDuration.length
            : 0;

        res.json({
            totalCalls,
            completedCalls,
            totalUsers,
            totalTopics,
            avgCallDuration: Math.round(avgDuration),
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get("/metadata/export", async (req, res) => {
    try {
        const [users, calls, languages, topics, subtopics, feedbackCount, payoutPayments] = await Promise.all([
            User.find()
                .select("firstname lastname username email isAdmin isQA qaLanguageCode qaLanguageCodes accountStatus dailyCallLimit regionalLanguage locality languageApplications accent dialect createdAt updatedAt")
                .lean(),
            CallSession.find()
                .select("callId userA userB startedAt endedAt endReason callActuallyStarted callStatus recordingAStatus recordingBStatus recordingAReviewNote recordingBReviewNote recordingADurationMinutes recordingBDurationMinutes recordingAPayoutUsd recordingBPayoutUsd language topicId subtopicId actualCallDuration negotiationDuration reviewedAt reviewedBy createdAt updatedAt")
                .populate("topicId", "title")
                .populate("subtopicId", "title description instructions")
                .lean(),
            Language.find().lean(),
            Topic.find().lean(),
            Subtopic.find().lean(),
            Feedback.countDocuments(),
            PayoutPayment.find().lean(),
        ]);

        const regularUsers = users.filter((user) => !user.isAdmin && !user.isQA);
        const qaUsers = users.filter((user) => user.isQA);
        const totalApprovedEarnedUsd = calls.reduce((sum, call) => sum + (Number(call.recordingAPayoutUsd) || 0) + (Number(call.recordingBPayoutUsd) || 0), 0);
        const totalPaidOutUsd = payoutPayments.reduce((sum, payment) => sum + (Number(payment.amountUsd) || 0), 0);
        const actualCalls = calls.filter((call) => call.callActuallyStarted);
        const approvedCalls = calls.filter((call) => call.callStatus === "approved");
        const rejectedCalls = calls.filter((call) => call.callStatus === "rejected");
        const pendingCalls = calls.filter((call) => call.callStatus === "pending");
        const completedCalls = calls.filter((call) => call.endReason === "completed");
        const avgActualCallDurationSeconds = actualCalls.length
            ? Math.round(actualCalls.reduce((sum, call) => sum + (Number(call.actualCallDuration) || 0), 0) / actualCalls.length)
            : 0;

        const languageStats = languages.map((language) => {
            const code = String(language.code || "").toLowerCase();
            const applications = users.flatMap((user) =>
                (user.languageApplications || [])
                    .filter((app) => String(app.languageCode || "").toLowerCase() === code)
                    .map((app) => ({ ...app, userId: String(user._id), username: user.username, email: user.email }))
            );
            const callsForLanguage = calls.filter((call) => String(call.language || "").toLowerCase() === code);
            return {
                id: String(language._id),
                name: language.name,
                code: language.code,
                hourlyPayout: language.hourlyPayout,
                enabled: language.enabled,
                applicants: applications.length,
                approvedApplications: applications.filter((app) => app.status === "approved").length,
                pendingApplications: applications.filter((app) => app.status === "pending").length,
                rejectedApplications: applications.filter((app) => app.status === "rejected").length,
                totalCalls: callsForLanguage.length,
                approvedCalls: callsForLanguage.filter((call) => call.callStatus === "approved").length,
            };
        });

        const metadata = {
            generatedAt: new Date().toISOString(),
            overview: {
                totalUsers: users.length,
                totalRegularUsers: regularUsers.length,
                totalAdmins: users.filter((user) => user.isAdmin).length,
                totalQAUsers: qaUsers.length,
                totalCalls: calls.length,
                totalActualCalls: actualCalls.length,
                totalCompletedCalls: completedCalls.length,
                totalTopics: topics.length,
                totalSubtopics: subtopics.length,
                totalLanguages: languages.length,
                totalFeedbackEntries: feedbackCount,
                totalPayoutPayments: payoutPayments.length,
            },
            userCounts: {
                pendingIntro: users.filter((user) => user.accountStatus === "pending_intro").length,
                pendingApproval: users.filter((user) => user.accountStatus === "pending_approval").length,
                approved: users.filter((user) => user.accountStatus === "approved").length,
                rejected: users.filter((user) => user.accountStatus === "rejected").length,
            },
            callCounts: {
                approved: approvedCalls.length,
                pending: pendingCalls.length,
                rejected: rejectedCalls.length,
                completed: completedCalls.length,
            },
            ratios: {
                actualCallCompletionRate: actualCalls.length ? Number((completedCalls.length / actualCalls.length).toFixed(4)) : 0,
                callApprovalRate: calls.length ? Number((approvedCalls.length / calls.length).toFixed(4)) : 0,
                callRejectionRate: calls.length ? Number((rejectedCalls.length / calls.length).toFixed(4)) : 0,
                userApprovalRate: regularUsers.length ? Number((users.filter((user) => user.accountStatus === "approved").length / regularUsers.length).toFixed(4)) : 0,
            },
            averages: {
                avgActualCallDurationSeconds,
                avgDailyCallLimit: regularUsers.length
                    ? Number((regularUsers.reduce((sum, user) => sum + (Number(user.dailyCallLimit) || 0), 0) / regularUsers.length).toFixed(2))
                    : 0,
            },
            payouts: {
                totalApprovedEarnedUsd: Math.round(totalApprovedEarnedUsd * 100) / 100,
                totalPaidOutUsd: Math.round(totalPaidOutUsd * 100) / 100,
                totalRemainingUsd: Math.round(Math.max(0, totalApprovedEarnedUsd - totalPaidOutUsd) * 100) / 100,
            },
            qaAssignments: qaUsers.map((user) => ({
                id: String(user._id),
                firstname: user.firstname,
                lastname: user.lastname,
                username: user.username,
                email: user.email,
                qaLanguageCode: user.qaLanguageCode || (Array.isArray(user.qaLanguageCodes) ? user.qaLanguageCodes[0] || null : null),
            })),
            languages: languageStats,
            users: users.map((user) => ({
                id: String(user._id),
                firstname: user.firstname,
                lastname: user.lastname,
                username: user.username,
                email: user.email,
                isAdmin: user.isAdmin,
                isQA: user.isQA,
                accountStatus: user.accountStatus,
                dailyCallLimit: user.dailyCallLimit,
                regionalLanguage: user.regionalLanguage || null,
                locality: user.locality || null,
                accent: user.accent || null,
                dialect: user.dialect || null,
                qaLanguageCode: user.qaLanguageCode || (Array.isArray(user.qaLanguageCodes) ? user.qaLanguageCodes[0] || null : null),
                languageApplications: (user.languageApplications || []).map((app) => ({
                    languageCode: app.languageCode,
                    status: app.status,
                    appliedAt: app.appliedAt,
                    reviewedAt: app.reviewedAt || null,
                })),
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            })),
            calls: calls.map((call) => ({
                id: String(call._id),
                callId: call.callId,
                userA: String(call.userA),
                userB: String(call.userB),
                language: call.language,
                topic: call.topicId?.title || null,
                subtopic: call.subtopicId?.title || null,
                startedAt: call.startedAt,
                endedAt: call.endedAt || null,
                endReason: call.endReason || null,
                callActuallyStarted: call.callActuallyStarted,
                callStatus: call.callStatus,
                recordingAStatus: call.recordingAStatus,
                recordingBStatus: call.recordingBStatus,
                recordingAReviewNote: call.recordingAReviewNote || null,
                recordingBReviewNote: call.recordingBReviewNote || null,
                recordingADurationMinutes: call.recordingADurationMinutes || 0,
                recordingBDurationMinutes: call.recordingBDurationMinutes || 0,
                recordingAPayoutUsd: call.recordingAPayoutUsd || 0,
                recordingBPayoutUsd: call.recordingBPayoutUsd || 0,
                actualCallDuration: call.actualCallDuration || 0,
                negotiationDuration: call.negotiationDuration || 0,
                reviewedAt: call.reviewedAt || null,
                reviewedBy: call.reviewedBy ? String(call.reviewedBy) : null,
                createdAt: call.createdAt,
                updatedAt: call.updatedAt,
            })),
            payoutPayments: payoutPayments.map((payment) => ({
                id: String(payment._id),
                userId: String(payment.userId),
                amountUsd: payment.amountUsd,
                note: payment.note || null,
                createdBy: String(payment.createdBy),
                paidAt: payment.paidAt,
                createdAt: payment.createdAt,
                updatedAt: payment.updatedAt,
            })),
        };

        const fileName = `voclara-metadata-${new Date().toISOString().slice(0, 10)}.json`;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename=\"${fileName}\"`);
        res.send(JSON.stringify(metadata, null, 2));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== PAYOUTS =====
router.get("/payouts/finances", async (req, res) => {
    try {
        const finances = await getFinancesOverview();
        res.json(finances);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get("/payouts/users", async (req, res) => {
    try {
        const { summaries } = await getPayoutOverview();
        let filtered = summaries;
        if (req.query.search) {
            const searchVal = String(req.query.search).trim().toLowerCase();
            filtered = summaries.filter(s => {
                const u = s.user;
                return (u.firstname || '').toLowerCase().includes(searchVal) ||
                       (u.lastname || '').toLowerCase().includes(searchVal) ||
                       (u.username || '').toLowerCase().includes(searchVal) ||
                       (u.email || '').toLowerCase().includes(searchVal);
            });
        }
        res.json({ users: filtered });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get("/payouts/users/:userId", async (req, res) => {
    try {
        const payout = await getSingleUserPayout(req.params.userId);
        if (!payout) return res.status(404).json({ error: "User not found" });
        res.json(payout);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post("/payouts/users/:userId/payments", async (req, res) => {
    try {
        const amountUsd = Number(req.body?.amountUsd);
        const note = String(req.body?.note || "").trim();
        if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
            return res.status(400).json({ error: "A valid payout amount is required" });
        }

        const payout = await getSingleUserPayout(req.params.userId);
        if (!payout) return res.status(404).json({ error: "User not found" });
        if (amountUsd > payout.summary.totalRemainingPayoutUsd) {
            return res.status(400).json({ error: "Amount exceeds remaining payout" });
        }

        const payment = await PayoutPayment.create({
            userId: req.params.userId,
            amountUsd: Math.round(amountUsd * 100) / 100,
            note: note || null,
            createdBy: req.user._id,
            paidAt: new Date(),
        });

        const refreshed = await getSingleUserPayout(req.params.userId);
        res.status(201).json({
            message: "Payout recorded successfully",
            payment: {
                id: String(payment._id),
                amountUsd: payment.amountUsd,
                note: payment.note,
                paidAt: payment.paidAt,
            },
            ...refreshed,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post("/payouts/users/clear-all", async (req, res) => {
    try {
        const { summaries } = await getPayoutOverview();
        const usersToPay = summaries.filter((s) => s.totalRemainingPayoutUsd > 0);

        if (usersToPay.length === 0) {
            return res.json({ message: "No pending payments to clear", success: true });
        }

        const payments = usersToPay.map((u) => ({
            userId: u.user.id,
            amountUsd: u.totalRemainingPayoutUsd,
            note: "Clear All Payments",
            createdBy: req.user._id,
            paidAt: new Date(),
        }));

        await PayoutPayment.insertMany(payments);
        res.json({ message: `Successfully cleared payments for ${usersToPay.length} users`, success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post("/payouts/users/:userId/send-upi-request-email", async (req, res) => {
    try {
        const payout = await getSingleUserPayout(req.params.userId);
        if (!payout) return res.status(404).json({ error: "User not found" });

        const user = payout.summary.user;
        const upiId = (user.upiId || "").trim();
        const remaining = Number(payout.summary.totalRemainingPayoutUsd) || 0;

        if (upiId) {
            return res.status(400).json({ error: "User already has a UPI ID entered." });
        }
        if (remaining <= 0.5) {
            return res.status(400).json({ error: "User remaining balance must be greater than $0.50 to send UPI request email." });
        }

        await sendUpiRequestEmail(user.email, user.firstname || user.username);
        res.json({ message: `UPI request email successfully sent to ${user.email}.`, success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post("/payouts/send-bulk-upi-requests", async (req, res) => {
    try {
        const { summaries } = await getPayoutOverview();
        const eligibleUsers = summaries.filter(s => {
            const upiId = (s.user.upiId || "").trim();
            const remaining = Number(s.totalRemainingPayoutUsd) || 0;
            return !upiId && remaining > 0.5;
        });

        if (eligibleUsers.length === 0) {
            return res.json({ message: "No eligible contributors found without UPI ID and balance > $0.50.", sentCount: 0 });
        }

        let sentCount = 0;
        for (const s of eligibleUsers) {
            try {
                await sendUpiRequestEmail(s.user.email, s.user.firstname || s.user.username);
                sentCount++;
            } catch (err) {
                console.error(`Failed to send UPI request email to ${s.user.email}:`, err);
            }
        }

        res.json({ message: `Successfully sent UPI request emails to ${sentCount} contributor(s).`, sentCount, success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== CALLS MANAGEMENT =====
router.get("/calls", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const query = {};
        if (req.query.status) {
            if (req.query.status === "logs" || req.query.status === "reviewed") {
                query.callStatus = { $in: ["approved", "rejected"] };
            } else if (["pending", "approved", "rejected"].includes(req.query.status)) {
                query.callStatus = req.query.status;
            } else {
                query.endReason = req.query.status;
            }
        }
        if (req.query.dateFrom || req.query.dateTo) {
            query.startedAt = {};
            if (req.query.dateFrom) query.startedAt.$gte = new Date(req.query.dateFrom);
            if (req.query.dateTo) query.startedAt.$lte = new Date(req.query.dateTo);
        }

        const total = await CallSession.countDocuments(query);
        const calls = await CallSession.find(query)
            .populate("userA", "firstname lastname username email dob gender address locality regionalLanguage speaker_id")
            .populate("userB", "firstname lastname username email dob gender address locality regionalLanguage speaker_id")
            .populate("topicId", "title")
            .populate("subtopicId", "title description instructions")
            .populate("questionerUserId", "firstname lastname username")
            .populate("answererUserId", "firstname lastname username")
            .populate("reviewedBy", "firstname lastname username email")
            .sort({ startedAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            calls,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== BULK DELETE ALL REJECTED CALLS S3 FILES =====
router.post("/calls/purge-rejected", async (req, res) => {
    try {
        const callsToPurge = await CallSession.find({
            recordingAStatus: "rejected",
            recordingBStatus: "rejected",
            $or: [
                { recordingAFile: { $ne: null } },
                { recordingBFile: { $ne: null } },
                { mixedRecordingFile: { $ne: null } }
            ]
        });

        let purgedCount = 0;

        for (const call of callsToPurge) {
            const keysToDelete = [call.recordingAFile, call.recordingBFile, call.mixedRecordingFile].filter(Boolean);
            
            for (const key of keysToDelete) {
                try {
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: BUCKET_NAME,
                        Key: key
                    }));
                } catch (err) {
                    console.error(`Failed to delete S3 file: ${key} for call ${call.callId}`, err);
                }
            }

            call.recordingAFile = null;
            call.recordingBFile = null;
            call.mixedRecordingFile = null;
            await call.save();
            purgedCount++;
        }

        res.json({ message: "Rejected calls purged successfully", purgedCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all approved calls that are NOT yet downloaded by the current admin
router.get("/calls/exportable", async (req, res) => {
    try {
        const query = {
            $or: [
                { recordingAStatus: "approved" },
                { recordingBStatus: "approved" }
            ],
            // Not downloaded by current admin
            downloadLogs: { 
                $not: { 
                    $elemMatch: { adminUserId: req.user._id } 
                } 
            }
        };

        const calls = await CallSession.find(query)
            .populate("userA", "firstname lastname username email dob gender address locality regionalLanguage speaker_id")
            .populate("userB", "firstname lastname username email dob gender address locality regionalLanguage speaker_id")
            .populate("topicId", "title")
            .populate("subtopicId", "title description instructions")
            .sort({ startedAt: -1 });

        res.json({ calls });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get("/calls/:callId/recording/:userId", async (req, res) => {
    try {
        const { callId, userId } = req.params;

        const call = await CallSession.findOne({ callId });
        if (!call) {
            return res.status(404).json({ error: "Call not found" });
        }

        // Determine which recording file to send
        let recordingFile;
        if (call.userA.toString() === userId) {
            recordingFile = call.recordingAFile;
        } else if (call.userB.toString() === userId) {
            recordingFile = call.recordingBFile;
        } else {
            return res.status(404).json({ error: "User not part of this call" });
        }

        if (!recordingFile) {
            return res.status(404).json({ error: "Recording not available" });
        }

        if (recordingFile.startsWith("local:")) {
            const localFileName = recordingFile.replace("local:", "");
            const localFilePath = path.join(process.cwd(), "recordings", "calls", localFileName);
            if (fs.existsSync(localFilePath)) {
                return res.sendFile(localFilePath);
            }
        }

        try {
            const s3Params = {
                Bucket: BUCKET_NAME,
                Key: recordingFile
            };
            if (req.headers.range) {
                s3Params.Range = req.headers.range;
            }

            const command = new GetObjectCommand(s3Params);
            const response = await s3Client.send(command);
            
            if (response.ContentRange) {
                res.setHeader("Content-Range", response.ContentRange);
                res.status(206);
            }
            if (response.ContentLength) {
                res.setHeader("Content-Length", response.ContentLength);
            }
            res.setHeader("Content-Type", response.ContentType || "audio/webm");
            res.setHeader("Content-Disposition", `inline; filename="${path.basename(recordingFile)}"`);
            res.setHeader("Accept-Ranges", "bytes");
            
            response.Body.on('error', (err) => {
                console.error('S3 Stream error (Admin call recording):', err);
            }).pipe(res);
        } catch (s3error) {
            console.error("Admin call recording streaming S3 error:", s3error);
            return res.status(404).json({ error: "Recording file not found in cloud storage" });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get("/calls/:callId/download-status", async (req, res) => {
    try {
        const call = await CallSession.findOne({ callId: req.params.callId }).select("callId downloadLogs").lean();
        if (!call) return res.status(404).json({ error: "Call not found" });

        const existingLog = (call.downloadLogs || []).find((log) => String(log.adminUserId) === String(req.user._id));
        res.json({
            callId: call.callId,
            hasDownloaded: Boolean(existingLog),
            downloadCount: existingLog?.downloadCount || 0,
            downloadedAt: existingLog?.downloadedAt || null,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post("/calls/:callId/download-log", async (req, res) => {
    try {
        const call = await CallSession.findOne({ callId: req.params.callId });
        if (!call) return res.status(404).json({ error: "Call not found" });

        const existingLog = (call.downloadLogs || []).find((log) => String(log.adminUserId) === String(req.user._id));
        if (existingLog) {
            existingLog.downloadCount = (Number(existingLog.downloadCount) || 0) + 1;
            existingLog.downloadedAt = new Date();
        } else {
            call.downloadLogs.push({
                adminUserId: req.user._id,
                downloadedAt: new Date(),
                downloadCount: 1,
            });
        }

        await call.save();
        const updatedLog = call.downloadLogs.find((log) => String(log.adminUserId) === String(req.user._id));
        res.status(201).json({
            message: "Download logged",
            callId: call.callId,
            downloadCount: updatedLog?.downloadCount || 1,
            downloadedAt: updatedLog?.downloadedAt || new Date(),
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== TOPICS MANAGEMENT =====
router.get("/topics", async (req, res) => {
    try {
        const topics = await Topic.find().sort({ createdAt: -1 });
        const topicsWithSubtopics = await Promise.all(
            topics.map(async (topic) => {
                const subtopics = await Subtopic.find({ topicId: topic._id }).sort({ createdAt: -1 });
                const subtopicsWithStatus = await Promise.all(
                    subtopics.map(async (sub) => {
                        const approvedCount = await CallSession.countDocuments({
                            subtopicId: sub._id,
                            callActuallyStarted: true,
                            callStatus: "approved"
                        });
                        const pendingCount = await CallSession.countDocuments({
                            subtopicId: sub._id,
                            callActuallyStarted: true,
                            callStatus: "pending"
                        });
                        const limit = sub.maxCalls !== undefined ? sub.maxCalls : 3;

                        let calculatedStatus = "enabled";
                        if (!sub.isEnabled) {
                            calculatedStatus = "disabled";
                        } else if (approvedCount >= limit) {
                            calculatedStatus = "disabled";
                        } else if (approvedCount + pendingCount >= limit) {
                            calculatedStatus = "froze";
                        }

                        return {
                            ...sub.toObject(),
                            approvedCount,
                            pendingCount,
                            calculatedStatus
                        };
                    })
                );
                return {
                    ...topic.toObject(),
                    subtopics: subtopicsWithStatus,
                };
            })
        );
        res.json({ topics: topicsWithSubtopics });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post("/topics", async (req, res) => {
    try {
        const { title, description, isEnabled, languages } = req.body;

        if (!title) {
            return res.status(400).json({ error: "Title is required" });
        }

        const topic = new Topic({
            title,
            description,
            isEnabled: isEnabled !== undefined ? isEnabled : true,
            languages: Array.isArray(languages) ? languages : [],
        });

        await topic.save();
        res.status(201).json({ topic });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put("/topics/:topicId", async (req, res) => {
    try {
        const { topicId } = req.params;
        const { title, description, isEnabled, languages } = req.body;

        const topic = await Topic.findByIdAndUpdate(
            topicId,
            { title, description, isEnabled, ...(languages !== undefined ? { languages: Array.isArray(languages) ? languages : [] } : {}) },
            { new: true, runValidators: true }
        );

        if (!topic) {
            return res.status(404).json({ error: "Topic not found" });
        }

        res.json({ topic });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete("/topics/:topicId", async (req, res) => {
    try {
        const { topicId } = req.params;

        // Delete all subtopics first
        await Subtopic.deleteMany({ topicId });

        const topic = await Topic.findByIdAndDelete(topicId);
        if (!topic) {
            return res.status(404).json({ error: "Topic not found" });
        }

        res.json({ message: "Topic and subtopics deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== SUBTOPICS MANAGEMENT =====
router.post("/topics/:topicId/subtopics", async (req, res) => {
    try {
        const { topicId } = req.params;
        const { title, description, instructions, maxCalls, isEnabled } = req.body;

        if (!title) {
            return res.status(400).json({ error: "Title is required" });
        }

        // Verify topic exists
        const topic = await Topic.findById(topicId);
        if (!topic) {
            return res.status(404).json({ error: "Topic not found" });
        }

        const subtopic = new Subtopic({
            topicId,
            title,
            description,
            instructions,
            maxCalls: maxCalls !== undefined ? maxCalls : 3,
            isEnabled: isEnabled !== undefined ? isEnabled : true,
        });

        await subtopic.save();
        res.status(201).json({ subtopic });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put("/subtopics/:subtopicId", async (req, res) => {
    try {
        const { subtopicId } = req.params;
        const updateData = {};
        if (req.body.title !== undefined) updateData.title = req.body.title;
        if (req.body.description !== undefined) updateData.description = req.body.description;
        if (req.body.instructions !== undefined) updateData.instructions = req.body.instructions;
        if (req.body.maxCalls !== undefined) updateData.maxCalls = Number(req.body.maxCalls);
        if (req.body.isEnabled !== undefined) updateData.isEnabled = Boolean(req.body.isEnabled);

        const subtopic = await Subtopic.findByIdAndUpdate(
            subtopicId,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        if (!subtopic) {
            return res.status(404).json({ error: "Subtopic not found" });
        }

        const approvedCount = await CallSession.countDocuments({
            subtopicId: subtopic._id,
            callActuallyStarted: true,
            callStatus: "approved"
        });
        const pendingCount = await CallSession.countDocuments({
            subtopicId: subtopic._id,
            callActuallyStarted: true,
            callStatus: "pending"
        });
        const limit = subtopic.maxCalls !== undefined ? subtopic.maxCalls : 3;

        let calculatedStatus = "enabled";
        if (!subtopic.isEnabled) {
            calculatedStatus = "disabled";
        } else if (approvedCount >= limit) {
            calculatedStatus = "disabled";
        } else if (approvedCount + pendingCount >= limit) {
            calculatedStatus = "froze";
        }

        res.json({
            subtopic: {
                ...subtopic.toObject(),
                approvedCount,
                pendingCount,
                calculatedStatus
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete("/subtopics/:subtopicId", async (req, res) => {
    try {
        const { subtopicId } = req.params;

        const subtopic = await Subtopic.findByIdAndDelete(subtopicId);
        if (!subtopic) {
            return res.status(404).json({ error: "Subtopic not found" });
        }

        res.json({ message: "Subtopic deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== CALL APPROVAL =====

// Approve specific user's recording
router.patch("/calls/:callId/approve/:userId", async (req, res) => {
    try {
        const { callId, userId } = req.params;

        const call = await CallSession.findOne({ callId });
        if (!call) {
            return res.status(404).json({ error: "Call not found" });
        }

        await applyRecordingDecision(call, userId, "approved", req.user._id, req.body?.note);
        await call.save();
        await updateLimitAndBlacklist(userId, call.language, true);

        res.json({ message: "Recording approved successfully", call });
    } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
    }
});

// Reject specific user's recording
router.patch("/calls/:callId/reject/:userId", async (req, res) => {
    try {
        const { callId, userId } = req.params;

        const call = await CallSession.findOne({ callId });
        if (!call) {
            return res.status(404).json({ error: "Call not found" });
        }

        await applyRecordingDecision(call, userId, "rejected", req.user._id, req.body?.note);
        await call.save();
        await updateLimitAndBlacklist(userId, call.language, false);

        res.json({ message: "Recording rejected successfully", call });
    } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
    }
});

// Approve entire call (both recordings) - Backward compatibility
router.patch("/calls/:callId/approve", async (req, res) => {
    try {
        const { callId } = req.params;
        const call = await CallSession.findOne({ callId });
        if (!call) return res.status(404).json({ error: "Call not found" });

        await applyRecordingDecision(call, call.userA.toString(), "approved", req.user._id, req.body?.recordingAReviewNote);
        await applyRecordingDecision(call, call.userB.toString(), "approved", req.user._id, req.body?.recordingBReviewNote);
        await call.save();
        await updateLimitAndBlacklist(call.userA.toString(), call.language, true);
        await updateLimitAndBlacklist(call.userB.toString(), call.language, true);

        res.json({ message: "Call approved successfully", call });
    } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
    }
});

// Reject entire call (both recordings) - Backward compatibility
router.patch("/calls/:callId/reject", async (req, res) => {
    try {
        const { callId } = req.params;
        const call = await CallSession.findOne({ callId });
        if (!call) return res.status(404).json({ error: "Call not found" });

        await applyRecordingDecision(call, call.userA.toString(), "rejected", req.user._id, req.body?.recordingAReviewNote);
        await applyRecordingDecision(call, call.userB.toString(), "rejected", req.user._id, req.body?.recordingBReviewNote);
        await call.save();
        await updateLimitAndBlacklist(call.userA.toString(), call.language, false);
        await updateLimitAndBlacklist(call.userB.toString(), call.language, false);

        res.json({ message: "Call rejected successfully", call });
    } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
    }
});

// ===== USER MANAGEMENT =====
router.get("/users", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const filter = { isAdmin: false };
        if (req.query.accountStatus) filter.accountStatus = req.query.accountStatus;
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search.trim(), "i");
            filter.$or = [
                { firstname: searchRegex },
                { lastname: searchRegex },
                { username: searchRegex },
                { email: searchRegex }
            ];
        }

        const total = await User.countDocuments(filter);
        const users = await User.find(filter)
            .select('username email firstname lastname dailyCallLimit overallCallLimit dailyPhraseLimit overallPhraseLimit accountStatus createdAt')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            users,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List users pending admin approval
router.get("/users/pending", async (req, res) => {
    try {
        const filter = { isAdmin: false, accountStatus: "pending_approval" };
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search.trim(), "i");
            filter.$or = [
                { firstname: searchRegex },
                { lastname: searchRegex },
                { username: searchRegex },
                { email: searchRegex }
            ];
        }
        const users = await User.find(filter)
            .select('username email firstname lastname gender regionalLanguage locality address microphoneBrand microphoneModel introRecordingFile createdAt')
            .sort({ createdAt: -1 });
        res.json({ users });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Stream intro recording audio
router.get("/users/:userId/intro", async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).lean();
        if (!user) return res.status(404).json({ error: "User not found" });
        if (!user.introRecordingFile) return res.status(404).json({ error: "No intro recording" });

        // Serve local files directly
        if (user.introRecordingFile.startsWith("local:")) {
            const localFileName = user.introRecordingFile.replace("local:", "");
            const localFilePath = path.join(process.cwd(), "recordings", "intros", localFileName);
            if (fs.existsSync(localFilePath)) {
                res.setHeader("Content-Type", "audio/flac");
                res.setHeader("Accept-Ranges", "bytes");
                return fs.createReadStream(localFilePath).pipe(res);
            }
            return res.status(404).json({ error: "Local recording file not found" });
        }

        // Fallback: check if S3 key filename exists locally in recordings/intros
        const baseName = path.basename(user.introRecordingFile);
        const fallbackPath = path.join(process.cwd(), "recordings", "intros", baseName);
        if (fs.existsSync(fallbackPath)) {
            res.setHeader("Content-Type", "audio/flac");
            res.setHeader("Accept-Ranges", "bytes");
            return fs.createReadStream(fallbackPath).pipe(res);
        }

        try {
            const command = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: user.introRecordingFile
            });
            const response = await s3Client.send(command);
            
            if (response.ContentLength) {
                res.setHeader("Content-Length", response.ContentLength);
            }
            res.setHeader("Content-Type", response.ContentType || "audio/webm");
            res.setHeader("Accept-Ranges", "bytes");
            response.Body.on('error', (err) => {
                console.error('S3 Stream error (Admin intro):', err);
            }).pipe(res);
        } catch (s3error) {
            console.error("Intro admin streaming S3 error:", s3error);
            return res.status(404).json({ error: `Audio file cloud error: ${s3error.message}` });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Approve a user
router.patch("/users/:userId/approve", async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.userId,
            { accountStatus: "approved", rejectionReason: null, introReviewedAt: new Date() },
            { new: true }
        ).select('username email firstname accountStatus');
        if (!user) return res.status(404).json({ error: "User not found" });

        // Send congratulatory email to sign agreement
        try {
            await sendIntroApprovalEmail(user.email, user.firstname);
        } catch (mailErr) {
            console.error("Failed to send intro approval email:", mailErr.message);
        }

        res.json({ message: "User approved", user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update user limits
router.patch("/users/:userId/limits", async (req, res) => {
    try {
        const { dailyPhraseLimit, overallPhraseLimit, dailyCallLimit, overallCallLimit } = req.body;
        
        const updates = {};
        if (dailyPhraseLimit !== undefined) updates.dailyPhraseLimit = Number(dailyPhraseLimit);
        if (overallPhraseLimit !== undefined) updates.overallPhraseLimit = Number(overallPhraseLimit);
        if (dailyCallLimit !== undefined) updates.dailyCallLimit = Number(dailyCallLimit);
        if (overallCallLimit !== undefined) updates.overallCallLimit = Number(overallCallLimit);

        const user = await User.findByIdAndUpdate(
            req.params.userId,
            { $set: updates },
            { new: true }
        ).select('username email dailyPhraseLimit overallPhraseLimit dailyCallLimit overallCallLimit');
        
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json({ message: "Limits updated", user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get raw user document JSON for Admin metadata editor
router.get("/users/:userId/raw", async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select("-passwordHash").lean();
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json({ user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update raw user document from Admin JSON editor
router.patch("/users/:userId/raw", async (req, res) => {
    try {
        const { userData } = req.body;
        if (!userData || typeof userData !== "object") {
            return res.status(400).json({ error: "Invalid user metadata object provided." });
        }

        const updateData = { ...userData };
        delete updateData._id;
        delete updateData.passwordHash;
        delete updateData.createdAt;
        delete updateData.updatedAt;
        delete updateData.__v;

        const updatedUser = await User.findByIdAndUpdate(
            req.params.userId,
            { $set: updateData },
            { new: true, runValidators: true }
        ).select("-passwordHash").lean();

        if (!updatedUser) return res.status(404).json({ error: "User not found" });
        res.json({ message: "User metadata updated successfully", user: updatedUser });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a user from Admin Metadata Editor
router.delete("/users/:userId", async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        if (user.introRecordingFile) {
            const key = user.introRecordingFile;
            try {
                if (key.startsWith("local:")) {
                    const localFileName = key.replace("local:", "");
                    const localFilePath = path.join(process.cwd(), "recordings", "intros", localFileName);
                    if (fs.existsSync(localFilePath)) {
                        fs.unlinkSync(localFilePath);
                    }
                } else {
                    await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
                }
            } catch (cleanupErr) {
                console.error("Failed to cleanup intro recording for deleted user:", cleanupErr.message);
            }
        }

        await User.findByIdAndDelete(req.params.userId);
        res.json({ message: "User deleted successfully", success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reject a user with a typed reason
router.patch("/users/:userId/reject", async (req, res) => {
    try {
        const reason = String(req.body?.reason || "").trim();
        if (!reason) return res.status(400).json({ error: "Rejection reason is required" });

        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        const newCount = (user.introRejectionCount || 0) + 1;

        if (newCount >= 2) {
            // Delete recording file from disk/S3 first
            if (user.introRecordingFile) {
                const key = user.introRecordingFile;
                try {
                    if (key.startsWith("local:")) {
                        const localFileName = key.replace("local:", "");
                        const localFilePath = path.join(process.cwd(), "recordings", "intros", localFileName);
                        if (fs.existsSync(localFilePath)) {
                            fs.unlinkSync(localFilePath);
                        }
                    } else {
                        await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
                    }
                } catch (cleanupErr) {
                    console.error("Failed to cleanup intro recording for deleted user:", cleanupErr.message);
                }
            }

            // Send final deletion email
            try {
                await sendIntroFinalDeletionEmail(user.email, user.firstname);
            } catch (mailErr) {
                console.error("Failed to send final deletion email:", mailErr.message);
            }

            // Delete the user from DB!
            await User.findByIdAndDelete(req.params.userId);

            return res.json({ message: "User rejected twice and account deleted", deleted: true });
        }

        // First rejection: update status and increment count
        user.accountStatus = "rejected";
        user.rejectionReason = reason;
        user.introReviewedAt = new Date();
        user.introRejectionCount = newCount;
        await user.save();

        // Send onboarding rejection email
        try {
            await sendIntroRejectionEmail(user.email, user.firstname, reason);
        } catch (mailErr) {
            console.error("Failed to send intro rejection email:", mailErr.message);
        }

        res.json({ message: "User rejected", user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.patch("/users/:userId/limit", async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit } = req.body;

        if (typeof limit !== 'number' || limit < 0) {
            return res.status(400).json({ error: "Invalid limit. Must be a non-negative number." });
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { dailyCallLimit: limit },
            { new: true, runValidators: true }
        ).select('username email dailyCallLimit');

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        res.json({ message: "User limit updated successfully", user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reset contributor agreement so user must re-sign with fresh profile details (DOB, address, etc.)
router.post("/users/:userId/resend-agreement", async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        if (user.contributorAgreement?.s3Key) {
            try {
                if (!user.contributorAgreement.s3Key.startsWith("local:")) {
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: BUCKET_NAME,
                        Key: user.contributorAgreement.s3Key
                    }));
                }
            } catch (s3Err) {
                console.error("Failed to delete existing agreement PDF from S3:", s3Err.message);
            }
        }

        user.contributorAgreement = {
            signed: false,
            signedAt: null,
            s3Key: null,
            signerName: null,
            signerIp: null,
            agreementVersion: null,
            pdfHash: null,
            adminReviewStatus: null,
            adminReviewedAt: null,
            adminReviewedBy: null,
            adminReviewReason: null
        };

        await user.save();
        res.json({ message: "Agreement reset successfully. User will be required to re-sign on next login.", success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== QA USER MANAGEMENT (admin only) =====
// Note: requireAuth + isAdmin already ran on the parent router;
// req.user is populated and confirmed as admin before reaching here.
const qaRouter = express.Router();

// Create QA user
qaRouter.post("/", async (req, res) => {
    // Must be admin (not just QA) to create QA users
    if (!req.user.isAdmin) return res.status(403).json({ error: "Admin access required" });
    const { firstname, lastname, email, password } = req.body;
    let qaLanguageCodes = req.body?.qaLanguageCodes || [];
    
    // Fallback normalization if legacy string is pushed
    if (req.body?.qaLanguageCode && qaLanguageCodes.length === 0) {
        qaLanguageCodes = [req.body.qaLanguageCode];
    }
    
    qaLanguageCodes = qaLanguageCodes.map(c => String(c).trim().toLowerCase());

    if (!firstname || !lastname || !email || !password)
        return res.status(400).json({ error: "firstname, lastname, email and password are required" });
    if (!qaLanguageCodes || qaLanguageCodes.length === 0)
        return res.status(400).json({ error: "At least one language must be assigned" });
    try {
        const exists = await User.findOne({ email });
        if (exists) return res.status(409).json({ error: "Email already in use" });
        
        // Validate all requested languages
        const existingLanguages = await Language.find({ code: { $in: qaLanguageCodes } }).select("code").lean();
        if (existingLanguages.length !== qaLanguageCodes.length) {
            return res.status(400).json({ error: "One or more selected languages are invalid" });
        }
        const username = email.split("@")[0] + "_qa_" + Date.now();
        const passwordHash = await bcrypt.hash(password, 10);
        const qaUser = await User.create({
            firstname,
            lastname,
            email,
            username,
            passwordHash,
            isQA: true,
            isAdmin: false,
            qaLanguageCode: qaLanguageCodes[0], // Keep for legacy/fallback
            qaLanguageCodes,
            // QA users don't need profile fields — skip required validation via minimal values
            gender: "other",
            regionalLanguage: "N/A",
            locality: "urban",
            address: { street: "N/A", state: "N/A", city: "N/A", pincode: "000000" },
            microphoneBrand: "N/A",
            microphoneModel: "N/A",
            accountStatus: "approved",
            isEmailVerified: true,
            dob: new Date("1990-01-01"),
        });
        res.json({
            message: "QA user created",
            user: { id: qaUser._id, firstname, lastname, email, username, qaLanguageCode }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// List QA users
qaRouter.get("/", async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Admin access required" });
    try {
        const users = await User.find({ isQA: true })
            .select("firstname lastname email username qaLanguageCode qaLanguageCodes createdAt")
            .sort({ createdAt: -1 });
        res.json({ users });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete QA user
qaRouter.delete("/:id", async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Admin access required" });
    try {
        const user = await User.findOneAndDelete({ _id: req.params.id, isQA: true });
        if (!user) return res.status(404).json({ error: "QA user not found" });
        res.json({ message: "QA user deleted" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update QA User Languages
qaRouter.patch("/:id/languages", async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Admin access required" });
    let { qaLanguageCodes } = req.body;
    
    if (!Array.isArray(qaLanguageCodes) || qaLanguageCodes.length === 0) {
        return res.status(400).json({ error: "At least one language must be assigned." });
    }
    qaLanguageCodes = qaLanguageCodes.map(c => String(c).trim().toLowerCase());
    
    try {
        const existingLanguages = await Language.find({ code: { $in: qaLanguageCodes } }).select("code").lean();
        if (existingLanguages.length !== qaLanguageCodes.length) {
            return res.status(400).json({ error: "One or more selected languages are invalid" });
        }
        
        const user = await User.findOneAndUpdate(
            { _id: req.params.id, isQA: true },
            { 
                $set: { 
                    qaLanguageCodes,
                    qaLanguageCode: qaLanguageCodes[0] // sync legacy field
                } 
            },
            { new: true }
        );
        
        if (!user) return res.status(404).json({ error: "QA user not found" });
        
        res.json({ message: "QA user languages updated successfully", user });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.use("/qa-users", qaRouter);

// ===== LANGUAGE MANAGEMENT (admin) =====

// List all languages
router.get("/languages", async (req, res) => {
    try {
        const langs = await Language.find().sort({ name: 1 });
        res.json({ languages: langs });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Create language
router.post("/languages", async (req, res) => {
    const { name, code } = req.body;
    const hourlyPayout = Number(req.body?.hourlyPayout);
    const sampleRate = req.body?.sampleRate !== undefined ? Number(req.body.sampleRate) : 48000;
    const maxHoursPerContributor = req.body?.maxHoursPerContributor !== undefined ? Number(req.body.maxHoursPerContributor) : -1;
    const maxDailyCallLimit = req.body?.maxDailyCallLimit !== undefined ? Number(req.body.maxDailyCallLimit) : 5;
    if (!name || !code) return res.status(400).json({ error: "name and code are required" });
    if (!Number.isFinite(hourlyPayout) || hourlyPayout < 0) {
        return res.status(400).json({ error: "A valid hourly payout is required" });
    }
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
        return res.status(400).json({ error: "A valid sample rate is required" });
    }
    if (!Number.isFinite(maxHoursPerContributor) || (maxHoursPerContributor < 0 && maxHoursPerContributor !== -1)) {
        return res.status(400).json({ error: "A valid max contribution limit (hours) is required" });
    }
    if (!Number.isFinite(maxDailyCallLimit) || maxDailyCallLimit < 1) {
        return res.status(400).json({ error: "A valid max daily call limit is required" });
    }
    try {
        const noisy = req.body?.noisy !== undefined ? !!req.body.noisy : false;
        const lang = await Language.create({
            name: name.trim(),
            code: code.trim().toLowerCase(),
            hourlyPayout,
            sampleRate,
            maxHoursPerContributor,
            maxDailyCallLimit,
            enabled: true,
            noisy
        });
        res.status(201).json({ language: lang });
    } catch (e) {
        if (e.code === 11000) return res.status(409).json({ error: "Language code already exists" });
        res.status(500).json({ error: e.message });
    }
});

// Update language (rename / enable/disable)
router.patch("/languages/:id", async (req, res) => {
    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name.trim();
    if (req.body.enabled !== undefined) updates.enabled = !!req.body.enabled;
    if (req.body.noisy !== undefined) updates.noisy = !!req.body.noisy;
    if (req.body.hourlyPayout !== undefined) {
        const hourlyPayout = Number(req.body.hourlyPayout);
        if (!Number.isFinite(hourlyPayout) || hourlyPayout < 0) {
            return res.status(400).json({ error: "A valid hourly payout is required" });
        }
        updates.hourlyPayout = hourlyPayout;
    }
    if (req.body.sampleRate !== undefined) {
        const sampleRate = Number(req.body.sampleRate);
        if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
            return res.status(400).json({ error: "A valid sample rate is required" });
        }
        updates.sampleRate = sampleRate;
    }
    if (req.body.maxHoursPerContributor !== undefined) {
        const maxHours = Number(req.body.maxHoursPerContributor);
        if (!Number.isFinite(maxHours) || (maxHours < 0 && maxHours !== -1)) {
            return res.status(400).json({ error: "A valid max contribution limit (hours) is required" });
        }
        updates.maxHoursPerContributor = maxHours;
    }
    if (req.body.maxDailyCallLimit !== undefined) {
        const maxDaily = Number(req.body.maxDailyCallLimit);
        if (!Number.isFinite(maxDaily) || maxDaily < 1) {
            return res.status(400).json({ error: "A valid max daily call limit is required" });
        }
        updates.maxDailyCallLimit = maxDaily;
    }
    try {
        const lang = await Language.findByIdAndUpdate(req.params.id, updates, { new: true });
        if (!lang) return res.status(404).json({ error: "Language not found" });
        res.json({ language: lang });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete language (removes category association or deletes document)
router.delete("/languages/:id", async (req, res) => {
    try {
        const type = req.query.type;
        const lang = await Language.findById(req.params.id);
        if (!lang) return res.status(404).json({ error: "Language not found" });

        if (type === "call") lang.isCall = false;
        else if (type === "phrase") lang.isPhrase = false;
        else {
            lang.isCall = false;
            lang.isPhrase = false;
        }

        if (!lang.isCall && !lang.isPhrase) {
            await Language.findByIdAndDelete(req.params.id);
        } else {
            await lang.save();
        }
        res.json({ message: "Language deleted" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Helper to compute contributor demographics & user lists
function calculateDemographics(items) {
    let male = 0;
    let female = 0;
    let otherGender = 0;
    let age_18_30 = 0;
    let age_30_45 = 0;
    let age_45_60 = 0;
    let age_60_plus = 0;

    const approvedUsers = [];
    const pendingUsers = [];
    const rejectedUsers = [];

    for (const item of items) {
        const u = item.user;

        let age = null;
        if (u.dob) {
            const dobDate = new Date(u.dob);
            if (!isNaN(dobDate.getTime())) {
                const today = new Date();
                age = today.getFullYear() - dobDate.getFullYear();
                const m = today.getMonth() - dobDate.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
                    age--;
                }
            }
        }

        const userObj = {
            _id: u._id,
            firstname: u.firstname || "",
            lastname: u.lastname || "",
            username: u.username || "",
            email: u.email || "",
            gender: u.gender || "unknown",
            dob: u.dob || null,
            age: age !== null && Number.isFinite(age) ? age : "N/A",
            speaker_id: u.speaker_id || `spk_${u._id}`,
            locality: u.locality || "N/A",
            state: u.address?.state || "N/A",
            status: item.appStatus || "pending",
            appliedAt: item.appliedAt || null,
            noiseGateDb: item.noiseGateDb !== undefined ? item.noiseGateDb : (u.noiseGateDb || 0)
        };

        if (item.appStatus === "approved") {
            approvedUsers.push(userObj);
        } else if (item.appStatus === "pending") {
            pendingUsers.push(userObj);
        } else if (item.appStatus === "rejected") {
            rejectedUsers.push(userObj);
        }

        // Only compute gender/age demographics for non-rejected (active) contributors
        if (item.appStatus !== "rejected") {
            const g = String(u.gender || "").toLowerCase().trim();
            if (g === "male") male++;
            else if (g === "female") female++;
            else otherGender++;

            if (age !== null && Number.isFinite(age)) {
                if (age >= 18 && age <= 30) age_18_30++;
                else if (age > 30 && age <= 45) age_30_45++;
                else if (age > 45 && age <= 60) age_45_60++;
                else if (age > 60) age_60_plus++;
            }
        }
    }

    const totalContributors = approvedUsers.length + pendingUsers.length;

    return {
        totalContributors,
        male,
        female,
        otherGender,
        age_18_30,
        age_30_45,
        age_45_60,
        age_60_plus,
        approvedUsers,
        pendingUsers,
        rejectedUsers
    };
}

// GET /api/admin/languages/:id/contributors-summary
router.get("/languages/:id/contributors-summary", async (req, res) => {
    try {
        const langParam = req.params.id;
        let language = await Language.findById(langParam).lean();
        if (!language) {
            language = await Language.findOne({ code: String(langParam).toLowerCase().trim() }).lean();
        }
        if (!language) {
            language = await Language.findOne({ name: { $regex: new RegExp(`^${langParam}$`, "i") } }).lean();
        }
        if (!language) {
            return res.status(404).json({ error: "Language not found" });
        }

        const langCode = String(language.code || "").toLowerCase().trim();
        const langName = String(language.name || "").toLowerCase().trim();

        // 1. Fetch call sessions for this language
        const callSessions = await CallSession.find({
            language: { $regex: new RegExp(`^(${langCode}|${langName})$`, "i") }
        }).select("userA userB callStatus recordingAStatus recordingBStatus").lean();

        const userCallStatusMap = new Map();
        for (const session of callSessions) {
            if (session.userA) userCallStatusMap.set(String(session.userA), "approved");
            if (session.userB) userCallStatusMap.set(String(session.userB), "approved");
        }

        const callUserIds = Array.from(userCallStatusMap.keys());

        // 2. Fetch users with call applications OR call sessions for this language
        const users = await User.find({
            $or: [
                { "languageApplications.0": { $exists: true } },
                { _id: { $in: callUserIds } }
            ]
        })
        .select("firstname lastname email username gender dob speaker_id locality address languageApplications createdAt")
        .lean();

        const userItemMap = new Map();

        for (const u of users) {
            const apps = (u.languageApplications || []).filter(a => {
                const appType = a.applicationType || "phrase";
                if (appType !== "call") return false;
                const c = String(a.languageCode || "").toLowerCase().trim();
                return c === langCode || c === langName;
            });

            if (apps.length > 0) {
                const latestApp = apps.sort((a, b) => new Date(b.appliedAt || 0) - new Date(a.appliedAt || 0))[0];
                let appStatus = latestApp.status || "pending";
                // If the latest application is explicitly rejected, respect that status!
                if (userCallStatusMap.has(String(u._id)) && latestApp.status !== "rejected") {
                    appStatus = "approved";
                }
                userItemMap.set(String(u._id), {
                    user: u,
                    appStatus,
                    appliedAt: latestApp.appliedAt || u.createdAt,
                    noiseGateDb: latestApp.noiseGateDb !== undefined ? latestApp.noiseGateDb : (u.noiseGateDb || 0)
                });
            } else if (userCallStatusMap.has(String(u._id))) {
                userItemMap.set(String(u._id), {
                    user: u,
                    appStatus: "approved",
                    appliedAt: u.createdAt,
                    noiseGateDb: u.noiseGateDb || 0
                });
            }
        }

        const items = Array.from(userItemMap.values());
        const summary = calculateDemographics(items);

        res.json({
            language: {
                _id: language._id,
                name: language.name,
                code: language.code
            },
            summary
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/contributors/update-noise-gate
router.post("/contributors/update-noise-gate", async (req, res) => {
    try {
        const { userId, applicationType, companyId, languageCode, noiseGateDb } = req.body;
        if (!userId) {
            return res.status(400).json({ error: "userId is required" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const rawVal = parseInt(noiseGateDb);
        const gateValue = isNaN(rawVal) ? 0 : Math.min(0, Math.max(-60, rawVal));

        if (!user.languageApplications) {
            user.languageApplications = [];
        }

        const type = applicationType || "phrase";
        const reqLang = String(languageCode || "").toLowerCase().trim();

        // Resolve company identifiers if companyId is provided
        let companyIdentifiers = [];
        if (companyId) {
            let company = await Company.findById(companyId).lean();
            if (!company) {
                company = await Company.findOne({ name: { $regex: new RegExp(`^${companyId}$`, "i") } }).lean();
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
            updatedApp = true;
        });

        if (!updatedApp && reqLang) {
            user.languageApplications.push({
                applicationType: type,
                companyId: companyId || null,
                languageCode: reqLang,
                status: "approved",
                noiseGateDb: gateValue,
                appliedAt: new Date()
            });
        }

        user.markModified("languageApplications");
        await user.save();

        res.json({
            message: `Noise gate set to ${gateValue === 0 ? "RAW (0 dB)" : gateValue + " dB"} for ${user.firstname || user.username}.`,
            noiseGateDb: gateValue
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/languages/:id/remove-contributor
router.post("/languages/:id/remove-contributor", async (req, res) => {
    try {
        const langParam = req.params.id;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: "userId is required" });
        }

        let language = await Language.findById(langParam).lean();
        if (!language) {
            language = await Language.findOne({ code: String(langParam).toLowerCase().trim() }).lean();
        }
        if (!language) {
            language = await Language.findOne({ name: { $regex: new RegExp(`^${langParam}$`, "i") } }).lean();
        }
        if (!language) {
            return res.status(404).json({ error: "Language not found" });
        }

        const langCode = String(language.code || "").toLowerCase().trim();
        const langName = String(language.name || "").toLowerCase().trim();

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (!user.languageApplications) {
            user.languageApplications = [];
        }

        let updated = false;
        user.languageApplications.forEach(app => {
            if (app.applicationType === "call") {
                const appLang = String(app.languageCode || "").toLowerCase().trim();
                if (appLang === langCode || appLang === langName) {
                    app.status = "rejected";
                    app.reviewedAt = new Date();
                    app.reviewedBy = req.user._id;
                    updated = true;
                }
            }
        });

        if (!updated) {
            user.languageApplications.push({
                applicationType: "call",
                languageCode: langCode,
                status: "rejected",
                appliedAt: new Date(),
                reviewedAt: new Date(),
                reviewedBy: req.user._id
            });
        }

        user.markModified("languageApplications");
        await user.save();

        res.json({ message: `Contributor ${user.firstname || user.username} has been removed from Call Language ${language.name}.` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/languages/:id/reset-contributor
router.post("/languages/:id/reset-contributor", async (req, res) => {
    try {
        const langParam = req.params.id;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: "userId is required" });
        }

        let language = await Language.findById(langParam).lean();
        if (!language) {
            language = await Language.findOne({ code: String(langParam).toLowerCase().trim() }).lean();
        }
        if (!language) {
            language = await Language.findOne({ name: { $regex: new RegExp(`^${langParam}$`, "i") } }).lean();
        }
        if (!language) {
            return res.status(404).json({ error: "Language not found" });
        }

        const langCode = String(language.code || "").toLowerCase().trim();
        const langName = String(language.name || "").toLowerCase().trim();

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (user.languageApplications) {
            user.languageApplications = user.languageApplications.filter(app => {
                if (app.applicationType !== "call") return true;
                const appLang = String(app.languageCode || "").toLowerCase().trim();
                return appLang !== langCode && appLang !== langName;
            });
        }

        user.markModified("languageApplications");
        await user.save();

        res.json({ message: `Call application for ${user.firstname || user.username} has been reset for ${language.name}. They can now apply again.` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin/companies/:id/contributors-summary
router.get("/companies/:id/contributors-summary", async (req, res) => {
    try {
        const compParam = req.params.id;
        let company = await Company.findById(compParam).lean();
        if (!company) {
            company = await Company.findOne({ name: { $regex: new RegExp(`^${compParam}$`, "i") } }).lean();
        }
        if (!company) {
            return res.status(404).json({ error: "Company not found" });
        }

        const companyName = company.name;
        const projectName = company.projectName || company.name;
        const baseName = companyName.replace(/_downloaded$/, "").trim();
        const compIdStr = String(company._id);

        const companyIdentifiers = [
            companyName,
            projectName,
            baseName,
            `${baseName}_downloaded`,
            compIdStr
        ].filter(Boolean);

        const companyRegexes = companyIdentifiers.map(s => new RegExp(`^${s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, "i"));

        // Find all phrase records for this company to identify languages and contributors
        const phrases = await Phrase.find({
            companyId: { $in: companyRegexes }
        }).select("language contributorId status recordedAt").lean();

        // Also find users with phrase language applications for this company
        const users = await User.find({
            "languageApplications.companyId": { $in: companyRegexes },
            "languageApplications.applicationType": "phrase"
        }).select("firstname lastname email username gender dob speaker_id locality address languageApplications").lean();

        const languageMap = new Map(); // langCode -> { name, phrases: [], usersMap: new Map() }

        for (const p of phrases) {
            const l = String(p.language || "other").toLowerCase().trim();
            if (!languageMap.has(l)) {
                languageMap.set(l, { code: l, name: p.language || l, phrases: [], usersMap: new Map() });
            }
            languageMap.get(l).phrases.push(p);
        }

        for (const u of users) {
            for (const app of (u.languageApplications || [])) {
                if (app.applicationType !== "phrase") continue;
                const appComp = String(app.companyId || "").replace(/_downloaded$/, "").trim().toLowerCase();
                const matchesComp = companyIdentifiers.some(id => id.replace(/_downloaded$/, "").trim().toLowerCase() === appComp);
                if (!matchesComp) continue;

                const l = String(app.languageCode || "other").toLowerCase().trim();
                if (!languageMap.has(l)) {
                    languageMap.set(l, { code: l, name: app.languageCode || l, phrases: [], usersMap: new Map() });
                }
                languageMap.get(l).usersMap.set(String(u._id), {
                    user: u,
                    appStatus: app.status || "pending",
                    appliedAt: app.appliedAt,
                    noiseGateDb: app.noiseGateDb !== undefined ? app.noiseGateDb : (u.noiseGateDb || 0)
                });
            }
        }

        // Populate users for phrases if contributorId exists
        const contributorIds = phrases.map(p => p.contributorId).filter(Boolean);
        const contributorUsers = await User.find({ _id: { $in: contributorIds } })
            .select("firstname lastname email username gender dob speaker_id locality address createdAt languageApplications").lean();
        const contributorUserMap = new Map(contributorUsers.map(u => [String(u._id), u]));

        for (const p of phrases) {
            const l = String(p.language || "other").toLowerCase().trim();
            const langObj = languageMap.get(l);
            if (p.contributorId && contributorUserMap.has(String(p.contributorId))) {
                const u = contributorUserMap.get(String(p.contributorId));
                const existing = langObj.usersMap.get(String(u._id));
                
                const matchingApp = (u.languageApplications || []).find(app => {
                    if (app.applicationType && app.applicationType !== "phrase") return false;
                    const appComp = String(app.companyId || "").replace(/_downloaded$/, "").trim().toLowerCase();
                    const compMatches = companyIdentifiers.some(id => id.replace(/_downloaded$/, "").trim().toLowerCase() === appComp);
                    const matchesLang = String(app.languageCode || "").toLowerCase().trim() === l;
                    return compMatches && matchesLang;
                });

                let currentStatus;
                if (matchingApp && matchingApp.status === "rejected") {
                    currentStatus = "rejected";
                } else if (existing?.appStatus === "rejected") {
                    currentStatus = "rejected";
                } else if (matchingApp?.status === "approved" || existing?.appStatus === "approved") {
                    currentStatus = "approved";
                } else if (p.status === "approved") {
                    currentStatus = "approved";
                } else {
                    currentStatus = existing?.appStatus || matchingApp?.status || "pending";
                }

                const noiseVal = matchingApp?.noiseGateDb !== undefined ? matchingApp.noiseGateDb : (existing?.noiseGateDb !== undefined ? existing.noiseGateDb : (u.noiseGateDb || 0));

                langObj.usersMap.set(String(u._id), {
                    user: u,
                    appStatus: currentStatus,
                    appliedAt: existing?.appliedAt || matchingApp?.appliedAt || p.recordedAt || u.createdAt,
                    noiseGateDb: noiseVal
                });
            }
        }

        const languagesList = [];
        for (const [langCode, langData] of languageMap.entries()) {
            const items = Array.from(langData.usersMap.values());
            const summary = calculateDemographics(items);
            languagesList.push({
                code: langCode,
                name: langData.name.charAt(0).toUpperCase() + langData.name.slice(1),
                phraseCount: langData.phrases.length,
                summary
            });
        }

        languagesList.sort((a, b) => b.phraseCount - a.phraseCount);

        res.json({
            company: {
                _id: company._id,
                name: company.name,
                projectName: company.projectName
            },
            languages: languagesList
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/companies/:id/remove-contributor
router.post("/companies/:id/remove-contributor", async (req, res) => {
    try {
        const compParam = req.params.id;
        const { userId, languageCode } = req.body;

        if (!userId) {
            return res.status(400).json({ error: "userId is required" });
        }

        let company = await Company.findById(compParam).lean();
        if (!company) {
            company = await Company.findOne({ name: { $regex: new RegExp(`^${compParam}$`, "i") } }).lean();
        }
        if (!company) {
            return res.status(404).json({ error: "Company not found" });
        }

        const companyName = company.name;
        const projectName = company.projectName || company.name;
        const baseName = companyName.replace(/_downloaded$/, "").trim();
        const compIdStr = String(company._id);

        const companyIdentifiers = [
            companyName,
            projectName,
            baseName,
            compIdStr
        ].filter(Boolean);

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (!user.languageApplications) {
            user.languageApplications = [];
        }

        let updated = false;
        // Mark matching phrase applications for this company as rejected
        user.languageApplications.forEach(app => {
            if (app.applicationType === "phrase" || !app.applicationType) {
                const appComp = String(app.companyId || "").replace(/_downloaded$/, "").trim().toLowerCase();
                const compMatches = companyIdentifiers.some(id => id.replace(/_downloaded$/, "").trim().toLowerCase() === appComp);
                if (compMatches) {
                    const reqLang = String(languageCode || "").toLowerCase().trim();
                    const appLang = String(app.languageCode || "").toLowerCase().trim();
                    if (!reqLang || appLang === reqLang) {
                        app.status = "rejected";
                        app.reviewedAt = new Date();
                        app.reviewedBy = req.user._id;
                        updated = true;
                    }
                }
            }
        });

        // If no matching application was found, push a rejected application entry
        if (!updated) {
            user.languageApplications.push({
                applicationType: "phrase",
                companyId: company.name,
                languageCode: (languageCode || "english").toLowerCase().trim(),
                status: "rejected",
                appliedAt: new Date(),
                reviewedAt: new Date(),
                reviewedBy: req.user._id
            });
        }

        user.markModified("languageApplications");
        await user.save();

        res.json({ message: `Contributor ${user.firstname || user.username} has been removed from ${company.projectName || company.name}.` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/companies/:id/reset-contributor
router.post("/companies/:id/reset-contributor", async (req, res) => {
    try {
        const compParam = req.params.id;
        const { userId, languageCode } = req.body;

        if (!userId) {
            return res.status(400).json({ error: "userId is required" });
        }

        let company = await Company.findById(compParam).lean();
        if (!company) {
            company = await Company.findOne({ name: { $regex: new RegExp(`^${compParam}$`, "i") } }).lean();
        }
        if (!company) {
            return res.status(404).json({ error: "Company not found" });
        }

        const companyName = company.name;
        const projectName = company.projectName || company.name;
        const baseName = companyName.replace(/_downloaded$/, "").trim();
        const compIdStr = String(company._id);

        const companyIdentifiers = [
            companyName,
            projectName,
            baseName,
            compIdStr
        ].filter(Boolean);

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (user.languageApplications) {
            user.languageApplications = user.languageApplications.filter(app => {
                if (app.applicationType && app.applicationType !== "phrase") return true;
                const appComp = String(app.companyId || "").replace(/_downloaded$/, "").trim().toLowerCase();
                const compMatches = companyIdentifiers.some(id => id.replace(/_downloaded$/, "").trim().toLowerCase() === appComp);
                if (!compMatches) return true;

                const reqLang = String(languageCode || "").toLowerCase().trim();
                const appLang = String(app.languageCode || "").toLowerCase().trim();
                if (!reqLang || appLang === reqLang) {
                    return false; // Remove matching phrase application
                }
                return true;
            });
        }

        user.markModified("languageApplications");
        await user.save();

        res.json({ message: `Phrase application for ${user.firstname || user.username} has been reset for ${company.projectName || company.name}. They can now apply again.` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== LANGUAGE APPLICATION REVIEW (admin) =====

// List all language applications (paginated, filterable by status)
router.get("/language-applications", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const statusFilter = req.query.status; // pending | approved | rejected
        const skip = (page - 1) * limit;

        // Find users with matching language applications
        const matchStage = { "languageApplications.0": { $exists: true } };
        const users = await User.find(matchStage)
            .select("firstname lastname email username languageApplications")
            .lean();

        // Flatten to individual applications
        let apps = [];
        users.forEach(u => {
            u.languageApplications.forEach(app => {
                if (!statusFilter || app.status === statusFilter) {
                    apps.push({
                        appId: app._id,
                        userId: u._id,
                        userFirstname: u.firstname,
                        userLastname: u.lastname,
                        userEmail: u.email,
                        username: u.username,
                        companyId: app.companyId,
                        ...app,
                    });
                }
            });
        });

        // Sort by appliedAt desc
        apps.sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));

        const total = apps.length;
        apps = apps.slice(skip, skip + limit);

        res.json({ applications: apps, total, page, pages: Math.ceil(total / limit) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Approve a user's language application
router.patch("/language-applications/:userId/:appId/approve", async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: "User not found" });
        const app = user.languageApplications.find(a => String(a._id) === String(req.params.appId));
        if (!app) return res.status(404).json({ error: "Application not found" });
        app.status = "approved";
        app.reviewedBy = req.user._id;
        app.reviewedAt = new Date();
        await user.save();

        // Send project approved email
        try {
            const languageDoc = await Language.findOne({ code: app.languageCode });
            const languageName = languageDoc?.name || app.languageCode;
            await sendProjectApplicationApprovedEmail(user.email, user.firstname, languageName, app.applicationType);
        } catch (mailErr) {
            console.error("Failed to send project application approval email:", mailErr.message);
        }

        res.json({ message: "Application approved" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Reject a user's language application
router.patch("/language-applications/:userId/:appId/reject", async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: "User not found" });
        const app = user.languageApplications.find(a => String(a._id) === String(req.params.appId));
        if (!app) return res.status(404).json({ error: "Application not found" });
        app.status = "rejected";
        app.reviewedBy = req.user._id;
        app.reviewedAt = new Date();
        await user.save();

        // Send project rejected email
        try {
            const languageDoc = await Language.findOne({ code: app.languageCode });
            const languageName = languageDoc?.name || app.languageCode;
            await sendProjectApplicationRejectedEmail(user.email, user.firstname, languageName, app.applicationType);
        } catch (mailErr) {
            console.error("Failed to send project application rejection email:", mailErr.message);
        }

        res.json({ message: "Application rejected" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Analyze a user's language application audio
router.post("/language-applications/:userId/:appId/analyze", analyzeLanguageApplication);

// ─── AWS S3 MEDIA LIBRARY ──────────────────────────────────────────────────────
router.get("/s3-explorer", async (req, res) => {
    try {
        const prefix = req.query.prefix || "";
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: prefix
        });
        const response = await s3Client.send(command);
        
        const foldersSet = new Set();
        const rawFiles = [];

        for (const item of (response.Contents || [])) {
            if (!item.Key || item.Key === prefix) continue;
            const relative = item.Key.slice(prefix.length);
            const slashIdx = relative.indexOf("/");
            if (slashIdx !== -1) {
                const folderPrefix = prefix + relative.slice(0, slashIdx + 1);
                foldersSet.add(folderPrefix);
            } else {
                rawFiles.push({
                    key: item.Key,
                    size: item.Size,
                    lastModified: item.LastModified
                });
            }
        }

        const folders = Array.from(foldersSet).sort();
        let files = rawFiles;

        // --- Context Injection Engine ---
        const ObjectKeysExtracted = files.map(f => f.key);

        if (prefix.startsWith("phrases/")) {
            // Deeply query the exact phrase objects pointing cleanly to these S3 assets
            const phrases = await Phrase.find({ audioFile: { $in: ObjectKeysExtracted } })
                .populate("contributorId", "username email firstname lastname");
            
            files = files.map(f => {
                const match = phrases.find(p => p.audioFile === f.key);
                if (match) {
                    return { 
                        ...f, 
                        context: match.toObject ? match.toObject() : match
                    };
                }
                return f;
            });
        } else if (prefix.startsWith("calls/")) {
            // Query CallSession for these audio files
            const calls = await CallSession.find({
                $or: [
                    { recordingAFile: { $in: ObjectKeysExtracted } },
                    { recordingBFile: { $in: ObjectKeysExtracted } },
                    { mixedRecordingFile: { $in: ObjectKeysExtracted } }
                ]
            })
            .populate("userA", "firstname lastname username email dob gender address locality regionalLanguage speaker_id")
            .populate("userB", "firstname lastname username email dob gender address locality regionalLanguage speaker_id")
            .populate("topicId", "title")
            .populate("subtopicId", "title description instructions");

            files = files.map(f => {
                const match = calls.find(c => 
                    c.recordingAFile === f.key || 
                    c.recordingBFile === f.key || 
                    c.mixedRecordingFile === f.key
                );
                
                if (match) {
                    let speakerRole = "Unknown";
                    let matchedUser = null;
                    if (match.recordingAFile === f.key) {
                        speakerRole = "Speaker A";
                        matchedUser = match.userA;
                    } else if (match.recordingBFile === f.key) {
                        speakerRole = "Speaker B";
                        matchedUser = match.userB;
                    } else if (match.mixedRecordingFile === f.key) {
                        speakerRole = "Mixed";
                    }

                    const contextObj = match.toObject ? match.toObject() : match;
                    contextObj._fileSpeakerRole = speakerRole;
                    contextObj._fileMatchedUser = matchedUser;

                    return { 
                        ...f, 
                        context: contextObj
                    };
                }
                return f;
            });
        }

        res.json({ folders, files });
    } catch (e) {
        console.error("S3 Explorer Error:", e);
        res.status(500).json({ error: e.message });
    }
});

router.get("/s3-download", async (req, res) => {
    try {
        const { key, dl } = req.query;
        if (!key) return res.status(400).json({ error: "S3 Object Key required" });

        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key
        });
        const s3Doc = await s3Client.send(command);
        
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Type", s3Doc.ContentType || "audio/webm");

        if (dl === "1") {
            let filename = key.split("/").pop();
            const ext = key.includes(".") ? key.split(".").pop() : "";

            const phrase = await Phrase.findOne({ audioFile: key });
            if (phrase) {
                filename = phrase.phraseId + (ext ? `.${ext}` : "");
            } else {
                const call = await CallSession.findOne({
                    $or: [
                        { recordingAFile: key },
                        { recordingBFile: key },
                        { mixedRecordingFile: key }
                    ]
                });
                if (call) {
                    const baseName = key.split("/").pop().split(".")[0];
                    filename = `${call.callId}_${baseName}` + (ext ? `.${ext}` : "");
                }
            }

            res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        } else {
            res.setHeader("Content-Disposition", "inline");
        }

        s3Doc.Body.on('error', (err) => {
            console.error('S3 Stream error (Admin download):', err);
        }).pipe(res);
    } catch (e) {
        console.error("S3 Download Error:", e);
        res.status(500).json({ error: e.message });
    }
});

router.get("/s3-download-wav", async (req, res) => {
    try {
        const { key } = req.query;
        if (!key) return res.status(400).json({ error: "S3 Object Key required" });

        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key
        });
        const s3Doc = await s3Client.send(command);
        
        let filename = key.split("/").pop().split(".")[0];

        const phrase = await Phrase.findOne({ audioFile: key });
        if (phrase) {
            filename = phrase.phraseId;
        } else {
            const call = await CallSession.findOne({
                $or: [
                    { recordingAFile: key },
                    { recordingBFile: key },
                    { mixedRecordingFile: key }
                ]
            });
            if (call) {
                const baseName = key.split("/").pop().split(".")[0];
                filename = `${call.callId}_${baseName}`;
            }
        }

        // JIT Pipe logic streams natively executing FFMPEG bridging
        streamS3ToWav(s3Doc.Body, res, filename);
    } catch (e) {
        console.error("S3 Download WAV Error:", e);
        res.status(500).json({ error: e.message });
    }
});

router.get("/phrases/download-company", async (req, res) => {
    try {
        const { company, type = "phrases" } = req.query;
        if (!company) return res.status(400).json({ error: "Company name is required" });

        // Normalize company name the same way it is stored in DB/S3
        const companyFolder = company.replace(/[^a-zA-Z0-9_\-\ ]/g, "").trim();

        if (type === "approved_apps" || type === "all_apps") {
            // Find all matching users who applied for this company
            const users = await User.find({
                "languageApplications.companyId": { $regex: new RegExp(`^${companyFolder}$`, "i") },
                "languageApplications.applicationType": "phrase"
            }).lean();

            const appRecords = [];
            for (const u of users) {
                for (const app of (u.languageApplications || [])) {
                    if (app.applicationType !== "phrase") continue;
                    const appCompany = String(app.companyId || "").replace(/[^a-zA-Z0-9_\-\ ]/g, "").trim();
                    if (appCompany.toLowerCase() !== companyFolder.toLowerCase()) continue;
                    
                    if (type === "approved_apps" && app.status !== "approved") continue;
                    
                    // We need a valid recording file to download
                    if (!app.recordingFile) continue;
                    
                    appRecords.push({
                        app,
                        speakerId: u.speaker_id || `spk_unknown_${u._id}`,
                        language: String(app.languageCode || "unknown").toLowerCase().trim()
                    });
                }
            }

            if (appRecords.length === 0) {
                return res.status(404).json({ error: `No ${type === "approved_apps" ? "approved" : "total"} applications found for this company.` });
            }

            res.setHeader("Content-Type", "application/zip");
            res.setHeader("Content-Disposition", `attachment; filename="${companyFolder}_${type}.zip"`);

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
                console.error("Archiver package not found.", err);
                return res.status(500).json({ error: "Server missing 'archiver' dependency." });
            }

            const archive = new ZipArchive({ zlib: { level: 0 } });
            archive.on("error", (err) => {
                console.error("Archiver Error:", err);
                if (!res.headersSent) res.status(500).json({ error: err.message });
            });

            res.on('error', (err) => console.error('Response stream error:', err));
            archive.pipe(res);

            for (const record of appRecords) {
                const app = record.app;
                const baseFileName = app.recordingFile.split("/").pop().replace("local:", "");
                const destFileName = `${record.speakerId}__${companyFolder}__${record.language}.wav`;
                const zipPath = `${record.language}/${destFileName}`;

                if (app.recordingFile.startsWith("local:")) {
                    const localPath = path.join(process.cwd(), "recordings", "language-apps", baseFileName);
                    if (fs.existsSync(localPath)) {
                        try {
                            const fileStream = fs.createReadStream(localPath);
                            const wavBuffer = await getWavBuffer(fileStream);
                            archive.append(wavBuffer, { name: zipPath });
                        } catch (err) {
                            console.error(`Failed to convert local file ${localPath} to WAV:`, err.message);
                        }
                    }
                } else {
                    try {
                        const s3Doc = await s3Client.send(new GetObjectCommand({
                            Bucket: BUCKET_NAME,
                            Key: app.recordingFile
                        }));
                        const wavBuffer = await getWavBuffer(s3Doc.Body);
                        archive.append(wavBuffer, { name: zipPath });
                    } catch (s3Err) {
                        console.error(`Failed to stream S3 file ${app.recordingFile}:`, s3Err.message);
                    }
                }
            }

            await archive.finalize();
            return;
        }
        const isAlreadyDownloadedFolder = company.endsWith("_downloaded") || companyFolder.endsWith("_downloaded");

        // Fetch the company config to read custom namingPattern
        const baseCompanyName = companyFolder.replace(/_downloaded$/, "");
        const companyDoc = await Company.findOne({ name: { $regex: new RegExp(`^${baseCompanyName}$`, "i") } }).lean();
        const filenamePattern = companyDoc?.namingPattern || "{phraseId}";

        // Filter ONLY QA-approved phrases
        const targetCompanyIds = (type === "fresh_phrases")
            ? [companyFolder, companyFolder.toLowerCase()]
            : [
                companyFolder,
                `${companyFolder}_downloaded`,
                companyFolder.toLowerCase(),
                `${companyFolder.toLowerCase()}_downloaded`
              ];

        const approvedPhrases = await Phrase.find({
            companyId: { $in: targetCompanyIds },
            status: "approved",
            audioFile: { $ne: null }
        }).populate("contributorId").lean();

        if (approvedPhrases.length === 0) {
            return res.status(404).json({ error: `No approved phrases found for "${companyFolder}".` });
        }

        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${companyFolder}_phrases.zip"`);

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
            console.error("Archiver package not found.", err);
            return res.status(500).json({ error: "Server missing 'archiver' dependency." });
        }

        const archive = new ZipArchive({ zlib: { level: 0 } });

        archive.on("error", (err) => {
            console.error("Archiver Error:", err);
            if (!res.headersSent) res.status(500).json({ error: err.message });
        });

        res.on('error', (err) => console.error('Response stream error:', err));
        archive.pipe(res);

        const successfullyProcessed = [];
        const combinedUtterances = [];
        const combinedSpeakers = {};
        const languageUtterances = {};
        const languageSpeakers = {};

        // Process ONLY approved phrase records, organized by language
        for (const phrase of approvedPhrases) {
            const key = phrase.audioFile;
            if (!key) continue;

            const contributor = phrase.contributorId || {};
            const baseName = key.substring(key.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
            let folderName = phrase.phraseId || baseName;
            const phraseId = phrase.phraseId;
            const speakerId = contributor.speaker_id || phrase.speaker_id || "";
            const language = String(phrase.language || "other").toLowerCase().trim();
            const langFolder = language.replace(/[^a-zA-Z0-9_\-\ ]/g, "") || "other";

            // Calculate spkfreq dynamically
            let spkfreq = "1";
            if (phrase.contributorId) {
                const speakerPhrases = await Phrase.find({
                    companyId: { $in: targetCompanyIds },
                    contributorId: phrase.contributorId,
                    status: "approved"
                })
                .sort({ recordedAt: 1 })
                .select("_id")
                .lean();

                const idx = speakerPhrases.findIndex(p => p._id.toString() === phrase._id.toString());
                spkfreq = idx !== -1 ? String(idx + 1) : "1";
            }

            // Compute flexible/custom filename from namingPattern
            let computedName = filenamePattern
                .replace(/{phraseId}/g, phraseId || "")
                .replace(/{language}/g, phrase.language || "")
                .replace(/{speaker_id}/g, speakerId || `spk_${contributor._id || "unknown"}`)
                .replace(/{gender}/g, contributor.gender || "unknown")
                .replace(/{freq}/g, phrase.freq !== undefined && phrase.freq !== null ? String(phrase.freq) : "")
                .replace(/{spkfreq}/g, spkfreq)
                .replace(/{baseName}/g, baseName)
                .replace(/{emotion}/g, phrase.emotion || "")
                .replace(/{style}/g, phrase.style || "")
                .replace(/{intent}/g, phrase.intent || "")
                .replace(/{pitch}/g, phrase.pitch || "")
                .replace(/{speed}/g, phrase.speed || "")
                .replace(/{volume}/g, phrase.volume || "")
                .replace(/{instructions}/g, phrase.instructions || "");
            
            if (phrase.tags) {
                for (const [tagKey, tagVal] of Object.entries(phrase.tags)) {
                    const regex = new RegExp(`{${tagKey}}`, 'g');
                    computedName = computedName.replace(regex, tagVal || "");
                }
            }

            computedName = computedName.replace(/[^a-zA-Z0-9_\-\ ]/g, "").trim();
            if (computedName) {
                folderName = computedName;
            }

            let age = "unknown";
            if (contributor.dob) {
                const dobDate = new Date(contributor.dob);
                const today = new Date();
                let calculatedAge = today.getFullYear() - dobDate.getFullYear();
                const m = today.getMonth() - dobDate.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
                    calculatedAge--;
                }
                age = calculatedAge;
            }

            const speakerInfo = {
                speaker_id: speakerId,
                gender: contributor.gender || "unknown",
                age,
                native_language: contributor.regionalLanguage || "unknown",
                accent: contributor.accent || "unknown",
                dialect: contributor.dialect || "unknown",
                region: contributor.locality || "unknown",
                state: contributor.address?.state || "unknown",
                consent_provided: true,
                consent_platform: "voclara.com",
                recording_environment: "room",
                audio_specs: {
                    sample_rate: 48000,
                    bit_depth: 24,
                    channels: 1
                }
            };

            if (!languageSpeakers[langFolder]) languageSpeakers[langFolder] = {};
            if (!languageSpeakers[langFolder][speakerId]) languageSpeakers[langFolder][speakerId] = speakerInfo;
            if (!combinedSpeakers[speakerId]) combinedSpeakers[speakerId] = speakerInfo;

            const downloadCustomizations = companyDoc?.downloadCustomizations || [];
            const isCustomized = downloadCustomizations && downloadCustomizations.length > 0;
            const isAllowedKey = (keyName) => {
                if (!isCustomized) return true;
                return downloadCustomizations.some(dk => dk.toLowerCase() === keyName.toLowerCase());
            };

            const utterance = {
                id: phrase.phraseId || folderName,
                path: `${folderName}.wav`,
                language: phrase.language,
                script_type: phrase.script_type || "orthographic",
                speaker_id: contributor.speaker_id || phrase.speaker_id || "",
                text: phrase.text
            };

            if (isAllowedKey("emotion")) utterance.emotion = phrase.emotion || "neutral";
            if (isAllowedKey("style")) utterance.style = phrase.style || "conversational";
            if (isAllowedKey("intent")) utterance.intent = phrase.intent || "statement";
            if (isAllowedKey("pitch")) utterance.pitch = phrase.pitch || "medium";
            if (isAllowedKey("speed")) utterance.speed = phrase.speed || "normal";
            if (isAllowedKey("volume")) utterance.volume = phrase.volume || "normal";
            if (isAllowedKey("events") && phrase.events) utterance.events = phrase.events.split(",").map(e => e.trim());
            if ((isAllowedKey("instruction") || isAllowedKey("instructions")) && phrase.instructions) utterance.instruction = phrase.instructions;

            if (phrase.tags) {
                for (const [tagKey, tagVal] of Object.entries(phrase.tags)) {
                    if (isAllowedKey(tagKey)) {
                        utterance[tagKey] = tagVal;
                    }
                }
            }

            if (!languageUtterances[langFolder]) languageUtterances[langFolder] = [];
            languageUtterances[langFolder].push(utterance);
            combinedUtterances.push(utterance);

            // Fetch + convert audio to WAV
            try {
                let wavBuffer;
                if (key.startsWith("local:")) {
                    const localPath = path.join(process.cwd(), "recordings", "temp", key.replace("local:", ""));
                    if (fs.existsSync(localPath)) {
                        const fileStream = fs.createReadStream(localPath);
                        wavBuffer = await getWavBuffer(fileStream);
                    }
                } else {
                    const audioCommand = new GetObjectCommand({
                        Bucket: BUCKET_NAME,
                        Key: key
                    });
                    const s3Doc = await s3Client.send(audioCommand);
                    wavBuffer = await getWavBuffer(s3Doc.Body);
                }

                if (wavBuffer) {
                    const isPhraseApp = key.includes("/phrase apps/");
                    const entryName = isPhraseApp ? `${langFolder}/phrase apps/${folderName}.wav` : `${langFolder}/${folderName}.wav`;
                    archive.append(wavBuffer, { name: entryName });
                    successfullyProcessed.push({ key, phrase });
                }
            } catch (err) {
                console.error(`Failed to fetch audio for ${key}:`, err);
            }
        }

        // Per-language metadata JSON files
        for (const [lang, utterances] of Object.entries(languageUtterances)) {
            archive.append(JSON.stringify(utterances, null, 2), { name: `${lang}/utterances.json` });
            archive.append(JSON.stringify(Object.values(languageSpeakers[lang] || {}), null, 2), { name: `${lang}/speaker_metadata.json` });
        }

        // Combined metadata JSON files at root
        archive.append(JSON.stringify(combinedUtterances, null, 2), { name: `combined_utterances.json` });
        archive.append(JSON.stringify(Object.values(combinedSpeakers), null, 2), { name: `combined_speaker_metadata.json` });

        // Wait for archive to finalize
        await archive.finalize();

        // Background task to move files in S3 and update DB
        setTimeout(async () => {
            if (isAlreadyDownloadedFolder) return;

            for (const { key: oldKey, phrase } of successfullyProcessed) {
                try {
                    // Preserve phrase application files in place (do not move them to _downloaded)
                    if (oldKey.includes("/phrase apps/")) {
                        continue;
                    }

                    const newKey = oldKey.replace(`phrases/${companyFolder}/`, `phrases/${companyFolder}_downloaded/`);
                    if (oldKey === newKey) continue;

                    await s3Client.send(new CopyObjectCommand({
                        Bucket: BUCKET_NAME,
                        CopySource: `${BUCKET_NAME}/${oldKey}`,
                        Key: newKey
                    }));

                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: BUCKET_NAME,
                        Key: oldKey
                    }));

                    if (phrase) {
                        await Phrase.updateOne(
                            { _id: phrase._id },
                            { $set: {
                                audioFile: newKey,
                                companyId: (phrase.companyId && phrase.companyId.endsWith("_downloaded") ? phrase.companyId : (phrase.companyId || companyFolder) + "_downloaded")
                            } }
                        );
                    }
                } catch (moveErr) {
                    console.error(`Error moving ${oldKey} to downloaded folder:`, moveErr);
                }
            }
        }, 1000);

    } catch (e) {
        console.error("Download Company Phrases Error:", e);
        if (!res.headersSent) res.status(500).json({ error: e.message });
    }
});

// Download only a hand-picked set of files (by their exact S3 keys).
// Same zip layout as the company batch, but it never moves anything in S3.
router.post("/s3/download-selected", async (req, res) => {
    try {
        const keys = Array.isArray(req.body?.keys) ? req.body.keys.filter(Boolean) : [];
        if (keys.length === 0) {
            return res.status(400).json({ error: "No files selected." });
        }

        // Attach metadata when a phrase record exists for a given file.
        const phraseDocs = await Phrase.find({ audioFile: { $in: keys } })
            .populate("contributorId").lean();
        const phraseByKey = new Map(phraseDocs.map((p) => [p.audioFile, p]));

        const companyNames = Array.from(new Set(phraseDocs.map(p => p.companyId).filter(Boolean)));
        const companyDocs = companyNames.length > 0 ? await Company.find({ name: { $in: companyNames } }).select("name downloadCustomizations").lean() : [];
        const companyMap = new Map(companyDocs.map(c => [c.name, c]));

        // Attach metadata when a call session record exists for a given file.
        const callDocs = await CallSession.find({
            $or: [
                { recordingAFile: { $in: keys } },
                { recordingBFile: { $in: keys } },
                { mixedRecordingFile: { $in: keys } }
            ]
        })
        .populate("userA", "firstname lastname username email dob gender address locality regionalLanguage speaker_id")
        .populate("userB", "firstname lastname username email dob gender address locality regionalLanguage speaker_id")
        .populate("topicId", "title")
        .populate("subtopicId", "title description instructions").lean();
        
        const callByKey = new Map();
        callDocs.forEach(c => {
            if (c.recordingAFile) callByKey.set(c.recordingAFile, c);
            if (c.recordingBFile) callByKey.set(c.recordingBFile, c);
            if (c.mixedRecordingFile) callByKey.set(c.mixedRecordingFile, c);
        });

        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="selected_files.zip"`);

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
            console.error("Archiver package not found.", err);
            return res.status(500).json({ error: "Server missing 'archiver' dependency." });
        }

        const archive = new ZipArchive({ zlib: { level: 0 } });
        archive.on("error", (err) => {
            console.error("Archiver Error:", err);
            if (!res.headersSent) res.status(500).json({ error: err.message });
        });
        res.on('error', (err) => console.error('Response stream error:', err));
        archive.pipe(res);

        const combinedUtterances = []; // collected to write one combined file at the end
        const combinedSpeakers = {}; // keyed by speaker_id so each speaker appears only once
        const combinedCalls = []; // collected to write call metadata

        // Process each selected file one at a time (buffered) so nothing is skipped.
        for (const key of keys) {
            const phrase = phraseByKey.get(key) || null;
            const call = callByKey.get(key) || null;
            
            const baseName = key.substring(key.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
            let folderName = baseName;

            if (phrase) {
                folderName = phrase.phraseId || baseName;
                const contributor = phrase.contributorId || {};
                const phraseId = phrase.phraseId;
                const speakerId = contributor.speaker_id || phrase.speaker_id || `spk_${contributor._id}`;

                let age = "unknown";
                if (contributor.dob) {
                    const dobDate = new Date(contributor.dob);
                    const today = new Date();
                    let calculatedAge = today.getFullYear() - dobDate.getFullYear();
                    const m = today.getMonth() - dobDate.getMonth();
                    if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
                        calculatedAge--;
                    }
                    age = calculatedAge;
                }

                const speakerInfo = {
                    speaker_id: speakerId,
                    gender: contributor.gender || "unknown",
                    age,
                    native_language: contributor.regionalLanguage || "unknown",
                    accent: contributor.accent || "unknown",
                    dialect: contributor.dialect || "unknown",
                    region: contributor.locality || "unknown",
                    state: contributor.address?.state || "unknown",
                    consent_provided: true,
                    consent_platform: "voclara.com",
                    recording_environment: "room",
                    audio_specs: {
                        sample_rate: 48000,
                        bit_depth: 24,
                        channels: 1
                    }
                };
                // Collect once per speaker for the combined file (no repetition).
                if (!combinedSpeakers[speakerId]) combinedSpeakers[speakerId] = speakerInfo;

                const companyDoc = companyMap.get(phrase.companyId);
                const downloadCustomizations = companyDoc?.downloadCustomizations || [];
                const isCustomized = downloadCustomizations && downloadCustomizations.length > 0;
                const isAllowedKey = (key) => {
                    if (!isCustomized) return true;
                    return downloadCustomizations.some(dk => dk.toLowerCase() === key.toLowerCase());
                };

                const utterance = {
                    id: phraseId,
                    path: `${folderName}.wav`,
                    language: phrase.language,
                    script_type: phrase.script_type || "orthographic",
                    speaker_id: contributor.speaker_id || phrase.speaker_id || "",
                    text: phrase.text
                };

                if (isAllowedKey("emotion")) utterance.emotion = phrase.emotion || "neutral";
                if (isAllowedKey("style")) utterance.style = phrase.style || "conversational";
                if (isAllowedKey("intent")) utterance.intent = phrase.intent || "statement";
                if (isAllowedKey("pitch")) utterance.pitch = phrase.pitch || "medium";
                if (isAllowedKey("speed")) utterance.speed = phrase.speed || "normal";
                if (isAllowedKey("volume")) utterance.volume = phrase.volume || "normal";
                if (isAllowedKey("events") && phrase.events) utterance.events = phrase.events.split(",").map(e => e.trim());
                if ((isAllowedKey("instruction") || isAllowedKey("instructions")) && phrase.instructions) utterance.instruction = phrase.instructions;

                if (phrase.tags) {
                    for (const [tagKey, tagVal] of Object.entries(phrase.tags)) {
                        if (isAllowedKey(tagKey)) {
                            utterance[tagKey] = tagVal;
                        }
                    }
                }
                combinedUtterances.push(utterance);
            } else if (call) {
                folderName = call.callId ? `${call.callId}_${baseName}` : baseName;
                
                let speakerRole = "Unknown";
                let matchedUser = null;
                if (call.recordingAFile === key) {
                    speakerRole = "Speaker A";
                    matchedUser = call.userA || {};
                } else if (call.recordingBFile === key) {
                    speakerRole = "Speaker B";
                    matchedUser = call.userB || {};
                } else if (call.mixedRecordingFile === key) {
                    speakerRole = "Mixed";
                }

                let durationMinutes = 0;
                if (speakerRole === "Speaker A") {
                    durationMinutes = getRecordingDurationMinutes(call, "A");
                } else if (speakerRole === "Speaker B") {
                    durationMinutes = getRecordingDurationMinutes(call, "B");
                } else if (speakerRole === "Mixed") {
                    let actualCallDur = call?.actualCallDuration;
                    if (!actualCallDur && call?.endedAt && call?.actualCallStartedAt) {
                        actualCallDur = (new Date(call.endedAt).getTime() - new Date(call.actualCallStartedAt).getTime()) / 1000;
                    }
                    durationMinutes = actualCallDur ? (actualCallDur / 60) : 0;
                }

                if (typeof durationMinutes === "number") {
                    durationMinutes = Math.round(durationMinutes * 100) / 100;
                }

                const callMetadata = {
                    file_name: `${folderName}.wav`,
                    call_id: call.callId,
                    topic_of_conversation: call.topicId?.title || "",
                    subtopic: call.subtopicId?.title || "",
                    description: call.subtopicId?.description || "",
                    speaker_role: speakerRole,
                    speaker_id: matchedUser ? (matchedUser.speaker_id || matchedUser._id) : "mixed_or_unknown",
                    speaker_gender: matchedUser?.gender || "",
                    speaker_region: matchedUser?.address?.state || "",
                    speaker_accent: matchedUser?.locality || "",
                    speaker_dialect: matchedUser?.regionalLanguage || "",
                    negotiation_duration_seconds: call.negotiationDuration || 0,
                    duration_minutes: durationMinutes
                };
                combinedCalls.push(callMetadata);
            }

            try {
                const s3Doc = await s3Client.send(new GetObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: key
                }));

                let offsetMs = 0;
                let durationMs = 0;

                let actualCallDuration = call ? call.actualCallDuration : 0;
                if (!actualCallDuration && call && call.endedAt && call.actualCallStartedAt) {
                    actualCallDuration = (new Date(call.endedAt).getTime() - new Date(call.actualCallStartedAt).getTime()) / 1000;
                }

                if (call && call.actualCallStartedAt && actualCallDuration) {
                    const callStart = new Date(call.actualCallStartedAt).getTime();
                    let recordingStart = callStart;

                    if (call.recordingAFile === key && call.recordingAStartedAt) {
                        recordingStart = new Date(call.recordingAStartedAt).getTime();
                    } else if (call.recordingBFile === key && call.recordingBStartedAt) {
                        recordingStart = new Date(call.recordingBStartedAt).getTime();
                    }

                    // If recording started after the call, we pad the beginning.
                    if (recordingStart > callStart) {
                        offsetMs = recordingStart - callStart;
                    }
                    
                    durationMs = actualCallDuration * 1000;
                }

                const wavBuffer = await getWavBuffer(s3Doc.Body, { offsetMs, durationMs });
                // Flat layout: every wav sits at the zip root (e.g. utt_xxx.wav)
                archive.append(wavBuffer, { name: `${folderName}.wav` });
            } catch (err) {
                console.error(`Failed to fetch S3 audio for ${key}:`, err);
            }
        }

        if (combinedUtterances.length > 0) {
            archive.append(JSON.stringify(combinedUtterances, null, 2), { name: `combined_utterances.json` });
        }
        if (Object.keys(combinedSpeakers).length > 0) {
            archive.append(JSON.stringify(combinedSpeakers, null, 2), { name: `combined_speaker_metadata.json` });
        }
        if (combinedCalls.length > 0) {
            archive.append(JSON.stringify(combinedCalls, null, 2), { name: `combined_calls_metadata.json` });
        }

        await archive.finalize();
    } catch (e) {
        console.error("Download Selected Files Error:", e);
        if (!res.headersSent) res.status(500).json({ error: e.message });
    }
});

router.delete("/s3-explorer", async (req, res) => {
    try {
        const { key } = req.body;
        if (!key) return res.status(400).json({ error: "S3 Object Key required" });
        
        const command = new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key
        });
        await s3Client.send(command);
        res.json({ success: true, message: "Deleted native AWS block permanently" });
    } catch (e) {
        console.error("S3 Delete Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// ===== SPEAKER ID BACKFILL (admin only, idempotent) =====
router.post("/backfill-speaker-ids", async (req, res) => {
    try {
        const users = await User.find({ speaker_id: null }).sort({ createdAt: 1 }).select("_id");
        let updated = 0;
        for (const user of users) {
            const { seq } = await Counter.findOneAndUpdate(
                { _id: "speaker_id" },
                { $inc: { seq: 1 } },
            );
            const speaker_id = `spk_${seq}`;
            await User.updateOne({ _id: user._id }, { $set: { speaker_id } });
            updated++;
        }
        res.json({ message: `Backfilled ${updated} users with speaker IDs` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== PHRASE DOWNLOAD STATS =====
router.get("/phrases/download-stats", requireAuth(JWT_SECRET), async (req, res) => {
    try {
        const stats = await Phrase.aggregate([
            {
                $group: {
                    _id: { companyId: "$companyId", status: "$status" },
                    count: { $sum: 1 }
                }
            }
        ]);

        const companyStats = {};
        for (const item of stats) {
            const rawCompanyId = item._id.companyId || "Unknown";
            const isDownloaded = rawCompanyId.endsWith("_downloaded");
            const companyId = isDownloaded ? rawCompanyId.replace(/_downloaded$/, "") : rawCompanyId;
            const status = item._id.status;

            if (!companyStats[companyId]) {
                companyStats[companyId] = { pending: 0, recorded: 0, approved: 0, rejected: 0, freshApproved: 0 };
            }
            
            // Add to total status count
            companyStats[companyId][status] = (companyStats[companyId][status] || 0) + item.count;
            
            // Count fresh approved separately
            if (status === "approved" && !isDownloaded) {
                companyStats[companyId].freshApproved = (companyStats[companyId].freshApproved || 0) + item.count;
            }
        }

        res.json({ success: true, stats: companyStats });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== COMPANY MANAGEMENT =====


router.post("/companies", requireAuth(JWT_SECRET), async (req, res) => {
    try {
        const { name, maxContributionMinutes, hourlyPayout, projectName, namingPattern, singlePhraseFrequency } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: "Company name is required" });

        const cleanName = name.trim();
        const existing = await Company.findOne({ name: { $regex: new RegExp(`^${cleanName}$`, "i") } });
        if (existing) {
            return res.status(400).json({ error: "A company with that identifier already exists." });
        }

        const company = await Company.create({ 
            name: cleanName, 
            maxContributionMinutes: Number.isFinite(Number(maxContributionMinutes)) ? Number(maxContributionMinutes) : 195, 
            hourlyPayout: Number.isFinite(Number(hourlyPayout)) ? Number(hourlyPayout) : 0, 
            singlePhraseFrequency: Number.isInteger(Number(singlePhraseFrequency)) && Number(singlePhraseFrequency) >= 1 ? Number(singlePhraseFrequency) : 1,
            projectName: projectName && projectName.trim() ? projectName.trim() : cleanName,
            namingPattern: namingPattern && namingPattern.trim() ? namingPattern.trim() : "{phraseId}"
        });
        res.status(201).json({ message: "Company created successfully", company });
    } catch (e) {
        if (e.code === 11000) return res.status(400).json({ error: "Company name already exists" });
        res.status(500).json({ error: e.message });
    }
});

router.patch("/companies/:id", async (req, res) => {
    try {
        const { maxContributionMinutes, hourlyPayout, singlePhraseFrequency, projectName, namingPattern, userCustomizations, downloadCustomizations } = req.body;
        const updateData = {};
        if (maxContributionMinutes !== undefined) updateData.maxContributionMinutes = Number(maxContributionMinutes);
        if (hourlyPayout !== undefined) updateData.hourlyPayout = Number(hourlyPayout);
        if (singlePhraseFrequency !== undefined) updateData.singlePhraseFrequency = Math.max(1, Number(singlePhraseFrequency) || 1);
        if (projectName !== undefined) updateData.projectName = String(projectName).trim();
        if (namingPattern !== undefined) updateData.namingPattern = String(namingPattern).trim();
        if (userCustomizations !== undefined) updateData.userCustomizations = userCustomizations;
        if (downloadCustomizations !== undefined) updateData.downloadCustomizations = downloadCustomizations;
        
        const company = await Company.findByIdAndUpdate(req.params.id, { $set: updateData }, { new: true });
        if (!company) return res.status(404).json({ error: "Company not found" });

        if (singlePhraseFrequency !== undefined) {
            // Automatically ensure existing phrase workload has target phrase frequency copies
            await syncCompanyPhraseFrequency(company.name, company.singlePhraseFrequency);
        }

        res.json({ message: "Company updated", company });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

async function syncCompanyPhraseFrequency(companyName, targetFreq) {
    if (!companyName || !targetFreq || targetFreq < 1) return;
    try {
        const phrases = await Phrase.find({ companyId: companyName }).lean();
        const textGroups = {};
        for (const p of phrases) {
            const textKey = (p.text || "").trim();
            if (!textKey) continue;
            if (!textGroups[textKey]) textGroups[textKey] = [];
            textGroups[textKey].push(p);
        }
        const docsToInsert = [];
        for (const [textKey, group] of Object.entries(textGroups)) {
            if (group.length < targetFreq) {
                const needed = targetFreq - group.length;
                const sample = group[0];
                const baseId = (sample.phraseId || "").replace(/_c\d+$/, "");
                for (let i = 1; i <= needed; i++) {
                    const newCopyIndex = group.length + i;
                    docsToInsert.push({
                        phraseId: `${baseId}_c${newCopyIndex}`,
                        companyId: sample.companyId,
                        projectName: sample.projectName,
                        language: sample.language,
                        script_type: sample.script_type,
                        speaker_id: sample.speaker_id,
                        text: sample.text,
                        emotion: sample.emotion,
                        style: sample.style,
                        intent: sample.intent,
                        pitch: sample.pitch,
                        speed: sample.speed,
                        volume: sample.volume,
                        events: sample.events,
                        instructions: sample.instructions,
                        freq: sample.freq,
                        tags: sample.tags
                    });
                }
            }
        }
        if (docsToInsert.length > 0) {
            await Phrase.insertMany(docsToInsert);
        }
    } catch (err) {
        console.error("syncCompanyPhraseFrequency error:", err);
    }
}

router.delete("/companies/:id", async (req, res) => {
    try {
        // Fetch the company first so we have its name (used as companyId in phrases)
        const company = await Company.findById(req.params.id);
        if (!company) return res.status(404).json({ error: "Company not found" });

        // Delete all pending & locked phrases for this company
        // (recorded/approved phrases are kept to preserve contributor history)
        const deletedPhrases = await Phrase.deleteMany({
            companyId: company.name,
            status: { $in: ["pending", "locked"] },
        });

        await Company.findByIdAndDelete(req.params.id);

        res.json({
            message: "Company deleted",
            deletedPhrases: deletedPhrases.deletedCount,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== COMPANY PHRASE WORKLOADS & SAMPLE SELECTION =====

router.get("/companies/:id/phrase-workloads", async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);
        if (!company) return res.status(404).json({ error: "Company not found" });

        const companyFolder = company.name.replace(/[^a-zA-Z0-9_\-\ ]/g, "").trim();
        const companyRegex = new RegExp(`^${companyFolder}(_downloaded)?$`, "i");

        const langStats = await Phrase.aggregate([
            { $match: { companyId: { $regex: companyRegex } } },
            { $group: { _id: { $toLower: "$language" }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        const languages = langStats.map(s => ({
            code: s._id,
            name: s._id.charAt(0).toUpperCase() + s._id.slice(1),
            count: s.count
        }));

        res.json({
            company,
            languages
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get("/companies/:id/phrase-workloads/:language", async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);
        if (!company) return res.status(404).json({ error: "Company not found" });

        const companyFolder = company.name.replace(/[^a-zA-Z0-9_\-\ ]/g, "").trim();
        const companyRegex = new RegExp(`^${companyFolder}(_downloaded)?$`, "i");
        const language = String(req.params.language).trim().toLowerCase();
        const filter = { 
            companyId: { $regex: companyRegex },
            language: { $regex: new RegExp(`^${language}$`, "i") }
        };

        if (req.query.search) {
            const regex = new RegExp(req.query.search.trim(), "i");
            filter.$or = [
                { phraseId: regex },
                { text: regex },
                { emotion: regex },
                { style: regex },
                { intent: regex }
            ];
        }

        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.max(1, parseInt(req.query.limit) || 50);
        const skip = (page - 1) * limit;

        const totalPhrases = await Phrase.countDocuments(filter);
        const phrases = await Phrase.find(filter)
            .sort({ isSample: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        res.json({
            company,
            language,
            phrases,
            totalPhrases,
            page,
            totalPages: Math.ceil(totalPhrases / limit)
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post("/phrases/:phraseId/set-sample", async (req, res) => {
    try {
        const targetPhrase = await Phrase.findById(req.params.phraseId);
        if (!targetPhrase) return res.status(404).json({ error: "Phrase not found" });

        if (targetPhrase.companyId && targetPhrase.language) {
            await Phrase.updateMany(
                { 
                    companyId: targetPhrase.companyId, 
                    language: { $regex: new RegExp(`^${targetPhrase.language}$`, "i") } 
                },
                { $set: { isSample: false } }
            );
        }

        targetPhrase.isSample = true;
        await targetPhrase.save();

        res.json({ message: "Sample phrase set successfully", phrase: targetPhrase });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete("/phrases/:phraseId", async (req, res) => {
    try {
        const phrase = await Phrase.findByIdAndDelete(req.params.phraseId);
        if (!phrase) return res.status(404).json({ error: "Phrase not found" });
        res.json({ message: "Phrase deleted successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== CONTRIBUTOR AGREEMENTS =====

// List agreements pending admin review
router.get("/contributor-agreements/pending", async (req, res) => {
    try {
        const filter = {
            "contributorAgreement.signed": true,
            "contributorAgreement.adminReviewStatus": "pending",
        };
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search.trim(), "i");
            filter.$or = [
                { firstname: searchRegex },
                { lastname: searchRegex },
                { username: searchRegex },
                { email: searchRegex }
            ];
        }
        const users = await User.find(filter)
            .select("firstname lastname email username speaker_id accountStatus contributorAgreement.signedAt contributorAgreement.agreementVersion contributorAgreement.signerIp contributorAgreement.s3Key")
            .sort({ "contributorAgreement.signedAt": 1 })
            .lean();
        res.json({
            agreements: users.map(u => ({
                userId: u._id.toString(),
                firstname: u.firstname,
                lastname: u.lastname,
                email: u.email,
                username: u.username,
                speaker_id: u.speaker_id,
                accountStatus: u.accountStatus,
                signedAt: u.contributorAgreement?.signedAt || null,
                agreementVersion: u.contributorAgreement?.agreementVersion || null,
                signerIp: u.contributorAgreement?.signerIp || null,
                hasPdf: !!u.contributorAgreement?.s3Key,
            })),
        });
    } catch (err) {
        console.error("[admin] pending agreements list failed:", err);
        res.status(500).json({ error: err.message });
    }
});

// List fully-approved users (accountStatus=approved AND agreement admin-approved)
router.get("/contributor-agreements/approved-users", async (req, res) => {
    try {
        const filter = {
            accountStatus: "approved",
            "contributorAgreement.signed": true,
            "contributorAgreement.adminReviewStatus": "approved",
        };
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search.trim(), "i");
            filter.$or = [
                { firstname: searchRegex },
                { lastname: searchRegex },
                { username: searchRegex },
                { email: searchRegex }
            ];
        }
        const users = await User.find(filter)
            .select("firstname lastname email username speaker_id dailyCallLimit overallCallLimit dailyPhraseLimit overallPhraseLimit contributorAgreement.signedAt contributorAgreement.adminReviewedAt contributorAgreement.agreementVersion contributorAgreement.s3Key")
            .sort({ "contributorAgreement.adminReviewedAt": -1 })
            .lean();
        res.json({
            users: users.map(u => ({
                userId: u._id.toString(),
                firstname: u.firstname,
                lastname: u.lastname,
                email: u.email,
                username: u.username,
                speaker_id: u.speaker_id,
                dailyCallLimit: u.dailyCallLimit,
                overallCallLimit: u.overallCallLimit,
                dailyPhraseLimit: u.dailyPhraseLimit,
                overallPhraseLimit: u.overallPhraseLimit,
                signedAt: u.contributorAgreement?.signedAt || null,
                approvedAt: u.contributorAgreement?.adminReviewedAt || null,
                agreementVersion: u.contributorAgreement?.agreementVersion || null,
                hasPdf: !!u.contributorAgreement?.s3Key,
            })),
        });
    } catch (err) {
        console.error("[admin] approved-users list failed:", err);
        res.status(500).json({ error: err.message });
    }
});

// Download any user's signed agreement PDF (admin only)
router.get("/contributor-agreements/:userId/download", async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select("contributorAgreement firstname lastname username").lean();
        if (!user || !user.contributorAgreement?.s3Key) {
            return res.status(404).json({ error: "agreement_not_found" });
        }
        const key = user.contributorAgreement.s3Key;

        // Serve local files directly
        if (key.startsWith("local:")) {
            const localFileName = key.replace("local:", "");
            const localFilePath = path.join(process.cwd(), "recordings", "agreements", localFileName);
            if (fs.existsSync(localFilePath)) {
                res.setHeader("Content-Type", "application/pdf");
                res.setHeader(
                    "Content-Disposition",
                    `attachment; filename="Voclara-Contributor-Agreement-${user.username || user._id}.pdf"`
                );
                return fs.createReadStream(localFilePath).pipe(res);
            }
            return res.status(404).json({ error: "Local agreement file not found" });
        }

        // Fallback: check if S3 key filename exists locally in recordings/agreements
        const baseName = path.basename(key);
        const fallbackPath = path.join(process.cwd(), "recordings", "agreements", baseName);
        if (fs.existsSync(fallbackPath)) {
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="Voclara-Contributor-Agreement-${user.username || user._id}.pdf"`
            );
            return fs.createReadStream(fallbackPath).pipe(res);
        }

        try {
            const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
            const s3Doc = await s3Client.send(command);
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="Voclara-Contributor-Agreement-${user.username || user._id}.pdf"`
            );
            s3Doc.Body.on("error", (err) => {
                console.error("[admin] S3 stream error (agreement):", err);
            }).pipe(res);
        } catch (s3error) {
            console.error("S3 agreement streaming error:", s3error);
            return res.status(404).json({ error: `Agreement cloud error: ${s3error.message}` });
        }
    } catch (err) {
        console.error("[admin] agreement download failed:", err);
        res.status(500).json({ error: "download_failed" });
    }
});

// Approve a pending agreement
router.post("/contributor-agreements/:userId/approve", async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: "user_not_found" });
        const ca = user.contributorAgreement;
        if (!ca || !ca.signed) {
            return res.status(400).json({ error: "not_signed" });
        }
        if (ca.adminReviewStatus === "approved") {
            return res.json({ message: "Already approved" });
        }
        user.contributorAgreement.adminReviewStatus = "approved";
        user.contributorAgreement.adminReviewedAt = new Date();
        user.contributorAgreement.adminReviewedBy = req.user._id;
        user.contributorAgreement.adminReviewReason = null;
        await user.save();

        // Send email notification of agreement approval
        try {
            await sendAgreementApprovedEmail(user.email, user.firstname, ca.s3Key);
        } catch (mailErr) {
            console.error("Failed to send agreement approval email:", mailErr.message);
        }

        res.json({ message: "Agreement approved" });
    } catch (err) {
        console.error("[admin] agreement approve failed:", err);
        res.status(500).json({ error: err.message });
    }
});

// Reject a pending agreement (soft — user can re-sign)
router.post("/contributor-agreements/:userId/reject", async (req, res) => {
    try {
        const reason = String(req.body?.reason || "").trim();
        if (!reason) return res.status(400).json({ error: "reason_required" });
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: "user_not_found" });
        const ca = user.contributorAgreement;
        if (!ca || !ca.signed) {
            return res.status(400).json({ error: "not_signed" });
        }

        user.contributorAgreement.signed = false;
        user.contributorAgreement.adminReviewStatus = "rejected";
        user.contributorAgreement.adminReviewedAt = new Date();
        user.contributorAgreement.adminReviewedBy = req.user._id;
        user.contributorAgreement.adminReviewReason = reason;
        await user.save();

        // Best-effort email — don't fail the endpoint if email is down
        try {
            await sendAgreementRejectionEmail(user.email, user.firstname, reason);
        } catch (mailErr) {
            console.error("[admin] rejection email failed (non-fatal):", mailErr?.message || mailErr);
        }

        res.json({ message: "Agreement rejected — user notified" });
    } catch (err) {
        console.error("[admin] agreement reject failed:", err);
        res.status(500).json({ error: err.message });
    }
});

// Blacklist — hard delete account + related S3 files (per user preference: "delete the account")
router.post("/contributor-agreements/:userId/blacklist", async (req, res) => {
    try {
        const reason = String(req.body?.reason || "").trim();
        if (!reason) return res.status(400).json({ error: "reason_required" });
        const user = await User.findById(req.params.userId).lean();
        if (!user) return res.status(404).json({ error: "user_not_found" });

        // Collect S3 keys to purge
        const keys = [];
        if (user.introRecordingFile) keys.push(user.introRecordingFile);
        if (user.contributorAgreement?.s3Key) keys.push(user.contributorAgreement.s3Key);
        for (const app of user.languageApplications || []) {
            if (app.recordingFile) keys.push(app.recordingFile);
        }
        for (const key of keys) {
            try {
                await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
            } catch (s3Err) {
                console.error(`[admin] blacklist S3 delete failed for ${key}:`, s3Err?.message || s3Err);
            }
        }

        // Delete the user document. Log the reason so we have an audit trail via server logs.
        console.log(`[admin] BLACKLIST userId=${user._id} email=${user.email} username=${user.username} by=${req.user._id} reason="${reason}"`);
        await User.deleteOne({ _id: user._id });

        res.json({ message: "Account blacklisted and deleted", purgedFiles: keys.length });
    } catch (err) {
        console.error("[admin] agreement blacklist failed:", err);
        res.status(500).json({ error: err.message });
    }
});

// ===== PAN VERIFICATION (admin) =====

// List users who have uploaded a PAN card, optionally filtered by verification status.
router.get("/kyc/pans", async (req, res) => {
    try {
        const status = String(req.query.status || "pending").toLowerCase();
        const filter = { "kyc.panCardS3Key": { $ne: null } };
        if (["pending", "verified", "rejected"].includes(status)) {
            filter["kyc.verificationStatus"] = status;
        } else if (status !== "all") {
            return res.status(400).json({ error: "invalid_status" });
        }
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search.trim(), "i");
            filter.$or = [
                { firstname: searchRegex },
                { lastname: searchRegex },
                { username: searchRegex },
                { email: searchRegex }
            ];
        }
        const users = await User.find(filter)
            .select("username email firstname lastname kyc")
            .sort({ "kyc.submittedAt": -1 })
            .lean();
        res.json({
            users: users.map((u) => ({
                _id: u._id,
                username: u.username,
                email: u.email,
                firstname: u.firstname,
                lastname: u.lastname,
                panNumber: u.kyc?.panNumber || null,
                submittedAt: u.kyc?.submittedAt || null,
                verificationStatus: u.kyc?.verificationStatus || null,
                verifiedAt: u.kyc?.verifiedAt || null,
                rejectionReason: u.kyc?.rejectionReason || null,
            })),
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Stream a user's PAN card image from S3.
router.get("/users/:userId/pan-card", async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select("kyc").lean();
        if (!user) return res.status(404).json({ error: "User not found" });
        const key = user.kyc?.panCardS3Key;
        if (!key) return res.status(404).json({ error: "no_pan_card" });

        // Serve local files directly
        if (key.startsWith("local:")) {
            const localFileName = key.replace("local:", "");
            const localFilePath = path.join(process.cwd(), "recordings", "kyc", localFileName);
            if (fs.existsSync(localFilePath)) {
                const ext = localFileName.endsWith("png") ? "image/png" : "image/jpeg";
                res.setHeader("Content-Type", ext);
                res.setHeader("Cache-Control", "private, max-age=60");
                return fs.createReadStream(localFilePath).pipe(res);
            }
            return res.status(404).json({ error: "Local PAN card file not found" });
        }

        // Fallback: check if S3 key filename exists locally in recordings/kyc
        const baseName = path.basename(key);
        const fallbackPath = path.join(process.cwd(), "recordings", "kyc", baseName);
        if (fs.existsSync(fallbackPath)) {
            const ext = baseName.endsWith("png") ? "image/png" : "image/jpeg";
            res.setHeader("Content-Type", ext);
            res.setHeader("Cache-Control", "private, max-age=60");
            return fs.createReadStream(fallbackPath).pipe(res);
        }

        try {
            const cmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
            const s3Doc = await s3Client.send(cmd);
            if (s3Doc.ContentLength) res.setHeader("Content-Length", s3Doc.ContentLength);
            res.setHeader("Content-Type", s3Doc.ContentType || "image/jpeg");
            res.setHeader("Cache-Control", "private, max-age=60");
            s3Doc.Body.on("error", (err) => {
                console.error("[admin] PAN card stream error:", err);
            }).pipe(res);
        } catch (s3error) {
            console.error("S3 PAN card streaming error:", s3error);
            return res.status(404).json({ error: `PAN card cloud error: ${s3error.message}` });
        }
    } catch (err) {
        console.error("[admin] PAN card fetch failed:", err);
        return res.status(404).json({ error: "pan_card_not_found" });
    }
});

// Mark a user's PAN as verified.
router.post("/users/:userId/pan/verify", async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select("kyc").lean();
        if (!user) return res.status(404).json({ error: "User not found" });
        if (!user.kyc?.panCardS3Key) return res.status(400).json({ error: "no_pan_card" });

        await User.updateOne(
            { _id: req.params.userId },
            {
                $set: {
                    "kyc.verificationStatus": "verified",
                    "kyc.verifiedBy": req.user._id,
                    "kyc.verifiedAt": new Date(),
                    "kyc.rejectionReason": null,
                },
            }
        );
        res.json({ ok: true });
    } catch (err) {
        console.error("[admin] PAN verify failed:", err);
        res.status(500).json({ error: err.message });
    }
});

// Mark a user's PAN as rejected with a reason.
router.post("/users/:userId/pan/reject", async (req, res) => {
    try {
        const reason = String(req.body?.reason || "").trim();
        if (!reason) return res.status(400).json({ error: "reason_required" });
        if (reason.length > 500) return res.status(400).json({ error: "reason_too_long" });

        const user = await User.findById(req.params.userId).select("kyc").lean();
        if (!user) return res.status(404).json({ error: "User not found" });
        if (!user.kyc?.panCardS3Key) return res.status(400).json({ error: "no_pan_card" });

        await User.updateOne(
            { _id: req.params.userId },
            {
                $set: {
                    "kyc.verificationStatus": "rejected",
                    "kyc.verifiedBy": req.user._id,
                    "kyc.verifiedAt": new Date(),
                    "kyc.rejectionReason": reason,
                },
            }
        );
        res.json({ ok: true });
    } catch (err) {
        console.error("[admin] PAN reject failed:", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
