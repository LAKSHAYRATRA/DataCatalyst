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
import { getPayoutOverview, getSingleUserPayout } from "../services/payouts.js";
import { ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "../config/s3.js";
import { streamS3ToWav, getWavStream, getWavBuffer } from "../utils/ffmpeg-stream.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

router.get("/companies", requireAuth(JWT_SECRET), async (req, res) => {
    try {
        const companies = await Company.find({}).sort({ name: 1 }).lean();
        res.json({ companies });
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
        res.json({ message: "Application rejected" });
    } catch (e) {
        res.status(500).json({ error: e.message });
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
        if (status) filter.callStatus = status;
        if (req.user.isQA && !req.user.isAdmin) {
            filter.language = { $in: getReviewerLanguageCodes(req.user) };
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
    const startedAt = side === "A"
        ? (call.recordingAStartedAt || call.actualCallStartedAt || call.startedAt)
        : (call.recordingBStartedAt || call.actualCallStartedAt || call.startedAt);
    const endedAt = call.endedAt;
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

        res.json({ message: "Recording rejected successfully", call });
    } catch (e) {
        res.status(e.statusCode || 500).json({ error: e.message });
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
            const command = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: recordingFile
            });
            const response = await s3Client.send(command);
            
            if (response.ContentLength) {
                res.setHeader("Content-Length", response.ContentLength);
            }
            res.setHeader("Content-Type", response.ContentType || "audio/webm");
            res.setHeader("Content-Disposition", `attachment; filename="${path.basename(recordingFile)}"`);
            res.setHeader("Accept-Ranges", "bytes");
            
            response.Body.pipe(res);
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


// Mount QA router BEFORE isAdmin — this must stay here
router.use("/qa", qaCallRouter);

const sharedLanguageReviewRouter = express.Router();
sharedLanguageReviewRouter.use(requireAuth(JWT_SECRET));
sharedLanguageReviewRouter.use(isAdminOrQA);
sharedLanguageReviewRouter.get("/language-applications", listLanguageApplications);
sharedLanguageReviewRouter.patch("/language-applications/:userId/:appId/approve", approveLanguageApplication);
sharedLanguageReviewRouter.patch("/language-applications/:userId/:appId/reject", rejectLanguageApplication);
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
                .select("firstname lastname username email isAdmin isQA qaLanguageCode qaLanguageCodes accountStatus dailyCallLimit regionalLanguage locality languageApplications createdAt updatedAt")
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
router.get("/payouts/users", async (req, res) => {
    try {
        const { summaries } = await getPayoutOverview();
        res.json({ users: summaries });
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

// ===== CALLS MANAGEMENT =====
router.get("/calls", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const query = {};
        if (req.query.status) {
            query.endReason = req.query.status;
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

        try {
            const command = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: recordingFile
            });
            const response = await s3Client.send(command);
            
            if (response.ContentLength) {
                res.setHeader("Content-Length", response.ContentLength);
            }
            res.setHeader("Content-Type", response.ContentType || "audio/webm");
            res.setHeader("Content-Disposition", `attachment; filename="${path.basename(recordingFile)}"`);
            res.setHeader("Accept-Ranges", "bytes");
            
            response.Body.pipe(res);
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
                return {
                    ...topic.toObject(),
                    subtopics,
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
        const { title, description, instructions, isEnabled } = req.body;

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
        const { title, description, instructions, isEnabled } = req.body;

        const subtopic = await Subtopic.findByIdAndUpdate(
            subtopicId,
            { title, description, instructions, isEnabled },
            { new: true, runValidators: true }
        );

        if (!subtopic) {
            return res.status(404).json({ error: "Subtopic not found" });
        }

        res.json({ subtopic });
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
        const users = await User.find({ isAdmin: false, accountStatus: "pending_approval" })
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
            response.Body.pipe(res);
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
            { accountStatus: "approved", rejectionReason: null },
            { new: true }
        ).select('username email accountStatus');
        if (!user) return res.status(404).json({ error: "User not found" });
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

// Reject a user with a typed reason
router.patch("/users/:userId/reject", async (req, res) => {
    try {
        const reason = String(req.body?.reason || "").trim();
        if (!reason) return res.status(400).json({ error: "Rejection reason is required" });

        const user = await User.findByIdAndUpdate(
            req.params.userId,
            { accountStatus: "rejected", rejectionReason: reason },
            { new: true }
        ).select('username email accountStatus rejectionReason');
        if (!user) return res.status(404).json({ error: "User not found" });
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
    if (!name || !code) return res.status(400).json({ error: "name and code are required" });
    if (!Number.isFinite(hourlyPayout) || hourlyPayout < 0) {
        return res.status(400).json({ error: "A valid hourly payout is required" });
    }
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
        return res.status(400).json({ error: "A valid sample rate is required" });
    }
    try {
        const lang = await Language.create({
            name: name.trim(),
            code: code.trim().toLowerCase(),
            hourlyPayout,
            sampleRate,
            enabled: true
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
    try {
        const lang = await Language.findByIdAndUpdate(req.params.id, updates, { new: true });
        if (!lang) return res.status(404).json({ error: "Language not found" });
        res.json({ language: lang });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete language
router.delete("/languages/:id", async (req, res) => {
    try {
        const lang = await Language.findByIdAndDelete(req.params.id);
        if (!lang) return res.status(404).json({ error: "Language not found" });
        res.json({ message: "Language deleted" });
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
        res.json({ message: "Application rejected" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── AWS S3 MEDIA LIBRARY ──────────────────────────────────────────────────────
router.get("/s3-explorer", async (req, res) => {
    try {
        const prefix = req.query.prefix || "";
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: prefix,
            Delimiter: "/"
        });
        const response = await s3Client.send(command);
        
        const folders = (response.CommonPrefixes || []).map(p => p.Prefix);
        let files = (response.Contents || []).map(f => ({
            key: f.Key,
            size: f.Size,
            lastModified: f.LastModified
        })).filter(f => f.key !== prefix);

        // --- Context Injection Engine ---
        if (prefix.startsWith("phrases/")) {
            const ObjectKeysExtracted = files.map(f => f.key);
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
            const filename = key.split("/").pop();
            res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        } else {
            res.setHeader("Content-Disposition", "inline");
        }

        s3Doc.Body.pipe(res);
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
        
        const filename = key.split("/").pop().split(".")[0];
        // JIT Pipe logic streams natively executing FFMPEG bridging
        streamS3ToWav(s3Doc.Body, res, filename);
    } catch (e) {
        console.error("S3 Download WAV Error:", e);
        res.status(500).json({ error: e.message });
    }
});

router.get("/phrases/download-company", async (req, res) => {
    try {
        const { company } = req.query;
        if (!company) return res.status(400).json({ error: "Company name is required" });

        // Normalize company name the same way it is stored in DB/S3
        const companyFolder = company.replace(/[^a-zA-Z0-9_\-\ ]/g, "").trim();
        const isAlreadyDownloadedFolder = company.endsWith("_downloaded") || companyFolder.endsWith("_downloaded");

        // Enumerate EVERY object actually present in this company's S3 folder.
        // We drive the batch off the real folder contents (not a DB query) so
        // that no file is ever skipped because of a status / companyId mismatch.
        const folderPrefix = `phrases/${companyFolder}/`;
        const objectKeys = [];
        let ContinuationToken;
        do {
            const listResp = await s3Client.send(new ListObjectsV2Command({
                Bucket: BUCKET_NAME,
                Prefix: folderPrefix,
                ContinuationToken
            }));
            for (const obj of (listResp.Contents || [])) {
                // Skip the folder placeholder object itself
                if (obj.Key && obj.Key !== folderPrefix) objectKeys.push(obj.Key);
            }
            ContinuationToken = listResp.IsTruncated ? listResp.NextContinuationToken : undefined;
        } while (ContinuationToken);

        if (objectKeys.length === 0) {
            return res.status(404).json({ error: "No files found in this company's folder." });
        }

        // Pull any matching phrase records so we can attach metadata when it exists.
        const phraseDocs = await Phrase.find({ audioFile: { $in: objectKeys } })
            .populate("contributorId").lean();
        const phraseByKey = new Map(phraseDocs.map((p) => [p.audioFile, p]));

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

        const archive = new ZipArchive({ zlib: { level: 9 } });

        archive.on("error", (err) => {
            console.error("Archiver Error:", err);
            if (!res.headersSent) res.status(500).json({ error: err.message });
        });

        archive.pipe(res);

        const successfullyProcessed = [];
        const combinedUtterances = []; // collected to write one combined file at the end
        const combinedSpeakers = {}; // keyed by speaker_id so each speaker appears only once

        // Process EVERY file in the folder, one at a time.
        for (const key of objectKeys) {
            const phrase = phraseByKey.get(key) || null;
            const contributor = phrase?.contributorId || {};

            // Folder name inside the zip: the phraseId when we have a DB record,
            // otherwise the file's base name so the file is still included.
            const baseName = key.substring(key.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
            const folderName = phrase?.phraseId || baseName;

            // Attach metadata JSON only when a phrase record exists for this file.
            if (phrase) {
                const phraseId = phrase.phraseId;
                const speakerId = contributor.speaker_id || `spk_${contributor._id}`;

                // Generate speaker_metadata.json
                const speakerInfo = {
                    speaker_id: speakerId,
                    gender: contributor.gender || "unknown",
                    age_range: "unknown",
                    native_language: contributor.regionalLanguage || "unknown",
                    primary_language: contributor.regionalLanguage || "unknown",
                    languages_spoken: contributor.languageApplications ? contributor.languageApplications.map(app => app.languageCode) : [],
                    accent: "unknown",
                    dialect: "unknown",
                    region: contributor.locality || "unknown",
                    state: contributor.address?.state || "unknown",
                    consent_provided: true,
                    consent_platform: "voclara.com",
                    recording_environment: "room",
                    audio_specs: {
                        format: "FLAC",
                        sample_rate: 48000,
                        bit_depth: 24,
                        channels: 1
                    }
                };
                // Collect once per speaker for the combined file (no repetition).
                if (!combinedSpeakers[speakerId]) combinedSpeakers[speakerId] = speakerInfo;

                // Build the utterance entry (only used for the combined file).
                const utterance = {
                    id: phraseId,
                    language: phrase.language,
                    script_type: phrase.script_type || "orthographic",
                    speaker_id: contributor.speaker_id || `spk_${contributor._id}`,
                    text: phrase.text,
                    emotion: phrase.emotion || "neutral",
                    style: phrase.style || "conversational",
                    intent: phrase.intent || "statement",
                    pitch: phrase.pitch || "medium",
                    speed: phrase.speed || "normal",
                    volume: phrase.volume || "normal",
                    events: phrase.events ? phrase.events.split(",").map(e => e.trim()) : [],
                    instruction: phrase.instructions || ""
                };
                combinedUtterances.push(utterance);
            }

            // Fetch + convert the S3 audio ONE AT A TIME and fully buffer it
            // before appending. This avoids opening every S3 stream / spawning
            // every ffmpeg process up front (which caused sockets to time out
            // and files to be silently skipped from the zip on large folders).
            try {
                const audioCommand = new GetObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: key
                });
                const s3Doc = await s3Client.send(audioCommand);
                const wavBuffer = await getWavBuffer(s3Doc.Body);
                // Flat layout: every wav sits at the zip root (e.g. utt_xxx.wav)
                archive.append(wavBuffer, { name: `${folderName}.wav` });
                successfullyProcessed.push({ key, phrase });
            } catch (err) {
                console.error(`Failed to fetch S3 audio for ${key}:`, err);
            }
        }

        // One combined utterances file at the root of the zip, covering every
        // downloaded file that has a phrase record.
        archive.append(JSON.stringify(combinedUtterances, null, 2), { name: `combined_utterances.json` });

        // One combined speaker-metadata file at the root, each speaker only once.
        archive.append(JSON.stringify(combinedSpeakers, null, 2), { name: `combined_speaker_metadata.json` });

        // Wait for archive to finalize
        await archive.finalize();

        // Background task to move files in S3 and update DB
        setTimeout(async () => {
            if (isAlreadyDownloadedFolder) return;

            for (const { key: oldKey, phrase } of successfullyProcessed) {
                try {
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

                    // Only update DB if this file has a phrase record.
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
router.post("/phrases/download-selected", async (req, res) => {
    try {
        const keys = Array.isArray(req.body?.keys) ? req.body.keys.filter(Boolean) : [];
        if (keys.length === 0) {
            return res.status(400).json({ error: "No files selected." });
        }

        // Attach metadata when a phrase record exists for a given file.
        const phraseDocs = await Phrase.find({ audioFile: { $in: keys } })
            .populate("contributorId").lean();
        const phraseByKey = new Map(phraseDocs.map((p) => [p.audioFile, p]));

        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="selected_phrases.zip"`);

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

        const archive = new ZipArchive({ zlib: { level: 9 } });
        archive.on("error", (err) => {
            console.error("Archiver Error:", err);
            if (!res.headersSent) res.status(500).json({ error: err.message });
        });
        archive.pipe(res);

        const combinedUtterances = []; // collected to write one combined file at the end
        const combinedSpeakers = {}; // keyed by speaker_id so each speaker appears only once

        // Process each selected file one at a time (buffered) so nothing is skipped.
        for (const key of keys) {
            const phrase = phraseByKey.get(key) || null;
            const contributor = phrase?.contributorId || {};

            const baseName = key.substring(key.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
            const folderName = phrase?.phraseId || baseName;

            if (phrase) {
                const phraseId = phrase.phraseId;
                const speakerId = contributor.speaker_id || `spk_${contributor._id}`;

                const speakerInfo = {
                    speaker_id: speakerId,
                    gender: contributor.gender || "unknown",
                    age_range: "unknown",
                    native_language: contributor.regionalLanguage || "unknown",
                    primary_language: contributor.regionalLanguage || "unknown",
                    languages_spoken: contributor.languageApplications ? contributor.languageApplications.map(app => app.languageCode) : [],
                    accent: "unknown",
                    dialect: "unknown",
                    region: contributor.locality || "unknown",
                    state: contributor.address?.state || "unknown",
                    consent_provided: true,
                    consent_platform: "voclara.com",
                    recording_environment: "room",
                    audio_specs: {
                        format: "FLAC",
                        sample_rate: 48000,
                        bit_depth: 24,
                        channels: 1
                    }
                };
                // Collect once per speaker for the combined file (no repetition).
                if (!combinedSpeakers[speakerId]) combinedSpeakers[speakerId] = speakerInfo;

                const utterance = {
                    id: phraseId,
                    language: phrase.language,
                    script_type: phrase.script_type || "orthographic",
                    speaker_id: contributor.speaker_id || `spk_${contributor._id}`,
                    text: phrase.text,
                    emotion: phrase.emotion || "neutral",
                    style: phrase.style || "conversational",
                    intent: phrase.intent || "statement",
                    pitch: phrase.pitch || "medium",
                    speed: phrase.speed || "normal",
                    volume: phrase.volume || "normal",
                    events: phrase.events ? phrase.events.split(",").map(e => e.trim()) : [],
                    instruction: phrase.instructions || ""
                };
                combinedUtterances.push(utterance);
            }

            try {
                const s3Doc = await s3Client.send(new GetObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: key
                }));
                const wavBuffer = await getWavBuffer(s3Doc.Body);
                // Flat layout: every wav sits at the zip root (e.g. utt_xxx.wav)
                archive.append(wavBuffer, { name: `${folderName}.wav` });
            } catch (err) {
                console.error(`Failed to fetch S3 audio for ${key}:`, err);
            }
        }

        // One combined utterances file at the root of the zip, covering every
        // downloaded file that has a phrase record.
        archive.append(JSON.stringify(combinedUtterances, null, 2), { name: `combined_utterances.json` });

        // One combined speaker-metadata file at the root, each speaker only once.
        archive.append(JSON.stringify(combinedSpeakers, null, 2), { name: `combined_speaker_metadata.json` });

        await archive.finalize();
    } catch (e) {
        console.error("Download Selected Phrases Error:", e);
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
                { upsert: true, new: true }
            );
            await User.updateOne({ _id: user._id }, { $set: { speaker_id: `spk_${seq}` } });
            updated++;
        }
        res.json({ message: `Backfilled ${updated} users with speaker IDs` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== COMPANY MANAGEMENT =====


router.post("/companies", async (req, res) => {
    try {
        const { name, maxContributionMinutes, hourlyPayout } = req.body;
        if (!name) return res.status(400).json({ error: "Company name is required" });
        const company = new Company({ name, maxContributionMinutes, hourlyPayout });
        await company.save();
        res.json({ message: "Company created successfully", company });
    } catch (e) {
        if (e.code === 11000) return res.status(400).json({ error: "Company name already exists" });
        res.status(500).json({ error: e.message });
    }
});

router.patch("/companies/:id", async (req, res) => {
    try {
        const { maxContributionMinutes, hourlyPayout } = req.body;
        const updateData = {};
        if (maxContributionMinutes !== undefined) updateData.maxContributionMinutes = Number(maxContributionMinutes);
        if (hourlyPayout !== undefined) updateData.hourlyPayout = Number(hourlyPayout);
        
        const company = await Company.findByIdAndUpdate(req.params.id, { $set: updateData }, { new: true });
        if (!company) return res.status(404).json({ error: "Company not found" });
        res.json({ message: "Company updated", company });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete("/companies/:id", async (req, res) => {
    try {
        await Company.findByIdAndDelete(req.params.id);
        res.json({ message: "Company deleted" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
