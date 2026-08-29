import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import { ScriptedTopic } from "../models/ScriptedTopic.js";
import { ScriptedSubtopic } from "../models/ScriptedSubtopic.js";
import { ScriptedSubmission } from "../models/ScriptedSubmission.js";
import { ScriptedClaim } from "../models/ScriptedClaim.js";
import { CallSession } from "../models/CallSession.js";
import { User } from "../models/User.js";
import { requireAuth } from "../auth.js";
import { stitchScriptedPair } from "../services/scriptedStitcher.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// Multer storage for uploaded scripted verses
const scriptedUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const dir = path.join(process.cwd(), "uploads", "scripted_temp");
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            cb(null, dir);
        },
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname) || ".wav";
            cb(null, `verse_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`);
        }
    }),
    limits: { fileSize: 25 * 1024 * 1024 }
});

function getOptionalUserId(req) {
    if (req.user && (req.user._id || req.user.id)) {
        return String(req.user._id || req.user.id);
    }
    let token = null;
    if (req.cookies && req.cookies.vc_token) token = req.cookies.vc_token;
    if (!token && req.cookies && req.cookies.token) token = req.cookies.token;
    if (!token && req.cookies && req.cookies.vc_token_client) token = req.cookies.vc_token_client;
    if (!token && req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
        token = req.headers.authorization.split(" ")[1];
    }
    if (!token && req.query.token) token = req.query.token;
    if (!token) return null;
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded.sub || decoded.id || decoded._id || decoded.userId || null;
    } catch {
        return null;
    }
}

/**
 * Utility: Expire stale locks (heartbeat older than 45 seconds or active lock older than 15 minutes)
 */
async function cleanupExpiredClaims() {
    try {
        const staleThreshold = new Date(Date.now() - 45 * 1000); // 45s without heartbeat
        const maxLockThreshold = new Date(Date.now() - 15 * 60 * 1000); // 15m absolute max
        await ScriptedClaim.updateMany(
            {
                status: "active",
                $or: [
                    { lastHeartbeat: { $lt: staleThreshold } },
                    { lockedAt: { $lt: maxLockThreshold } }
                ]
            },
            { $set: { status: "expired" } }
        );
    } catch (err) {
        console.error("[ScriptedClaim] Cleanup error:", err);
    }
}

// ── 1. Get enabled scripted topics & scenarios with locking & deduplication ──────────
router.get("/enabled", async (req, res) => {
    try {
        await cleanupExpiredClaims();

        const queryLang = req.query.language;
        const currentUserId = getOptionalUserId(req);

        let matchQuery = { isEnabled: true };
        if (queryLang) {
            const cleanLang = String(queryLang).toLowerCase().trim();
            const langRegex = new RegExp(`^${cleanLang}$`, "i");
            matchQuery.$or = [
                { languages: { $size: 0 } },
                { languages: null },
                { languages: { $in: [queryLang, cleanLang, langRegex] } },
                { languages: { $elemMatch: { $regex: cleanLang, $options: "i" } } }
            ];
        }

        // Find user details (for deduplication, gender filtering, and claim status)
        let userRecordedSubtopicIds = new Set();
        let userGender = null;
        let userActiveClaimsMap = new Map(); // subtopicId -> role
        let userNeedsReRecordSubmissionsMap = new Map(); // subtopicId -> submission

        if (currentUserId) {
            const [userSessions, userSubmissions, userClaims, user] = await Promise.all([
                CallSession.find({
                    $or: [{ userA: currentUserId }, { userB: currentUserId }],
                    callActuallyStarted: true,
                    callStatus: { $ne: "rejected" }
                }).select("subtopicId").lean(),
                ScriptedSubmission.find({
                    userId: currentUserId,
                    status: { $ne: "cancelled" }
                }).lean(),
                ScriptedClaim.find({
                    userId: currentUserId,
                    status: "active"
                }).lean(),
                User.findById(currentUserId).select("gender isAdmin isQA languageApplications").lean()
            ]);

            // Track completed vs re-recording submissions
            userSubmissions.forEach(s => {
                if (s.status === "needs_rerecord") {
                    userNeedsReRecordSubmissionsMap.set(String(s.subtopicId), s);
                } else if (s.status !== "rejected") {
                    userRecordedSubtopicIds.add(String(s.subtopicId));
                }
            });

            // Verify that the user has an approved scripted_call application for the requested language
            if (user && queryLang && req.query.preview !== "true") {
                const targetCode = String(queryLang).toLowerCase().trim();
                const isApproved = (user.languageApplications || []).some(
                    a => a.status === "approved" &&
                         a.applicationType === "scripted_call" &&
                         (
                             String(a.languageCode || "").toLowerCase().trim() === targetCode ||
                             String(a.language || "").toLowerCase().trim() === targetCode ||
                             targetCode.includes(String(a.languageCode || "").toLowerCase().trim())
                         )
                );
                if (!isApproved && !user.isAdmin) {
                    return res.json({ topics: [] });
                }
            }

            userSessions.forEach(s => {
                if (s.subtopicId && !userNeedsReRecordSubmissionsMap.has(String(s.subtopicId))) {
                    userRecordedSubtopicIds.add(String(s.subtopicId));
                }
            });

            userClaims.forEach(c => {
                userActiveClaimsMap.set(String(c.subtopicId), c.role);
            });

            if (user && user.gender) {
                userGender = user.gender.toLowerCase().trim();
            }
        }

        // Get all other users' active claims across the system
        const otherActiveClaims = await ScriptedClaim.find({
            status: "active",
            ...(currentUserId ? { userId: { $ne: currentUserId } } : {})
        }).select("subtopicId role").lean();

        const activeClaimsBySubtopic = new Map();
        for (const claim of otherActiveClaims) {
            const k = String(claim.subtopicId);
            if (!activeClaimsBySubtopic.has(k)) {
                activeClaimsBySubtopic.set(k, { speaker1: 0, speaker2: 0 });
            }
            const counts = activeClaimsBySubtopic.get(k);
            if (claim.role === "speaker1") counts.speaker1 += 1;
            else if (claim.role === "speaker2") counts.speaker2 += 1;
        }

        // Guaranteed inclusion for topics that contain a needs_rerecord scenario for this contributor
        const reRecordTopicIds = Array.from(userNeedsReRecordSubmissionsMap.values())
            .map(s => s.topicId)
            .filter(Boolean);

        let finalTopicQuery = matchQuery;
        if (reRecordTopicIds.length > 0) {
            finalTopicQuery = {
                $or: [
                    matchQuery,
                    { _id: { $in: reRecordTopicIds }, isEnabled: true }
                ]
            };
        }

        const topics = await ScriptedTopic.find(finalTopicQuery).sort({ title: 1 });

        const topicsWithSubtopicsRaw = await Promise.all(
            topics.map(async (topic) => {
                const subtopics = await ScriptedSubtopic.find({
                    topicId: topic._id,
                    isEnabled: true,
                }).sort({ title: 1 });

                const validSubtopics = [];
                for (const sub of subtopics) {
                    const subIdStr = String(sub._id);

                    // CASE 1: Contributor has rejected verse(s) requiring re-recording for this scenario
                    const needsReRecordSub = userNeedsReRecordSubmissionsMap.get(subIdStr);
                    if (needsReRecordSub) {
                        const rejectedVerses = (needsReRecordSub.verses || []).filter(v => v.status === "rejected");
                        const reasons = rejectedVerses.map(v => v.rejectionReason).filter(Boolean);
                        const notes = rejectedVerses.map(v => v.reviewNote).filter(Boolean);

                        validSubtopics.unshift({
                            _id: sub._id,
                            title: sub.title,
                            description: sub.description,
                            instructions: sub.instructions,
                            rawScript: sub.rawScript,
                            dialogueTurns: sub.dialogueTurns,
                            speaker1Gender: (sub.speaker1Gender || "any").toLowerCase(),
                            speaker2Gender: (sub.speaker2Gender || "any").toLowerCase(),
                            eligibleRoles: [needsReRecordSub.role],
                            isClaimedByMe: true,
                            claimedRole: needsReRecordSub.role,
                            frequency: sub.frequency || sub.maxCalls || 3,
                            completedFrequency: 0,
                            isReRecord: true,
                            submissionId: needsReRecordSub._id,
                            rejectedVersesCount: rejectedVerses.length,
                            rejectedReasons: reasons,
                            reviewNotes: notes
                        });
                        continue;
                    }

                    // RULE 1: If speaker already recorded this scenario, never show it to them again
                    if (userRecordedSubtopicIds.has(subIdStr)) {
                        continue;
                    }

                    // RULE 2: Target Frequency & Pending Half-Submission Balancing
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
                    const totalCompletedOrPaired = approvedCount + pendingCount;
                    const targetFrequency = sub.frequency !== undefined ? sub.frequency : (sub.maxCalls !== undefined ? sub.maxCalls : 3);

                    if (totalCompletedOrPaired >= targetFrequency) {
                        continue; // Target frequency limit reached
                    }

                    // Count unpaired half-recordings waiting for matching partner
                    const pendingS1Count = await ScriptedSubmission.countDocuments({
                        subtopicId: sub._id,
                        role: "speaker1",
                        status: "pending_match"
                    });
                    const pendingS2Count = await ScriptedSubmission.countDocuments({
                        subtopicId: sub._id,
                        role: "speaker2",
                        status: "pending_match"
                    });

                    // Active locked claims by other users
                    const otherClaims = activeClaimsBySubtopic.get(subIdStr) || { speaker1: 0, speaker2: 0 };

                    // Available open slots for each role (subtracting pending submissions AND active studio locks)
                    const openS1Slots = Math.max(0, targetFrequency - totalCompletedOrPaired - pendingS1Count - otherClaims.speaker1);
                    const openS2Slots = Math.max(0, targetFrequency - totalCompletedOrPaired - pendingS2Count - otherClaims.speaker2);

                    // Check if current user already holds a claim on this subtopic
                    const myClaimedRole = userActiveClaimsMap.get(subIdStr);

                    // RULE 3: GENDER FILTERING & ROLE ASSIGNMENT
                    const s1Gender = (sub.speaker1Gender || "any").toLowerCase();
                    const s2Gender = (sub.speaker2Gender || "any").toLowerCase();

                    const canDoS1Gender = !userGender || (s1Gender === "any" || s1Gender === userGender);
                    const canDoS2Gender = !userGender || (s2Gender === "any" || s2Gender === userGender);

                    let eligibleRoles = [];

                    if (myClaimedRole) {
                        // User has active lock on this role
                        eligibleRoles = [myClaimedRole];
                    } else {
                        // PRIORITY 1: If an S1 recording is waiting for a partner, prioritize assigning S2
                        if (pendingS1Count > pendingS2Count && canDoS2Gender && openS2Slots > 0) {
                            eligibleRoles = ["speaker2"];
                        }
                        // PRIORITY 2: If an S2 recording is waiting for a partner, prioritize assigning S1
                        else if (pendingS2Count > pendingS1Count && canDoS1Gender && openS1Slots > 0) {
                            eligibleRoles = ["speaker1"];
                        }
                        // PRIORITY 3: Both are open or equal, assign roles that have open capacity and match gender
                        else {
                            if (canDoS1Gender && openS1Slots > 0) eligibleRoles.push("speaker1");
                            if (canDoS2Gender && openS2Slots > 0) eligibleRoles.push("speaker2");
                        }
                    }

                    // If no eligible roles are available (or fully locked by others), omit this scenario
                    if (eligibleRoles.length === 0) {
                        continue;
                    }

                    validSubtopics.push({
                        _id: sub._id,
                        title: sub.title,
                        description: sub.description,
                        instructions: sub.instructions,
                        rawScript: sub.rawScript,
                        dialogueTurns: sub.dialogueTurns,
                        speaker1Gender: s1Gender,
                        speaker2Gender: s2Gender,
                        eligibleRoles: eligibleRoles,
                        isClaimedByMe: !!myClaimedRole,
                        claimedRole: myClaimedRole || null,
                        frequency: targetFrequency,
                        completedFrequency: approvedCount,
                    });
                }

                return {
                    _id: topic._id,
                    title: topic.title,
                    description: topic.description,
                    subtopics: validSubtopics,
                    hasReRecord: validSubtopics.some(s => s.isReRecord)
                };
            })
        );
        
        // Filter out topics where all subtopics are completed, locked by others, or incompatible
        const topicsWithSubtopics = topicsWithSubtopicsRaw.filter(t => t.subtopics.length > 0);

        // ALWAYS SORT TOPICS WITH RE-RECORDS TO THE VERY TOP!
        topicsWithSubtopics.sort((a, b) => {
            if (a.hasReRecord && !b.hasReRecord) return -1;
            if (!a.hasReRecord && b.hasReRecord) return 1;
            return 0;
        });

        res.json({ topics: topicsWithSubtopics, userGender });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── GET /api/scripted-topics/my-rerecords (Pending re-recordings for contributor) ──
router.get("/my-rerecords", requireAuth(JWT_SECRET), async (req, res) => {
    try {
        const userId = req.user?._id || req.userId;
        const reRecordSubmissions = await ScriptedSubmission.find({
            userId,
            status: "needs_rerecord"
        })
        .populate({
            path: "subtopicId",
            select: "title description dialogueTurns",
            populate: { path: "topicId", select: "title" }
        })
        .sort({ updatedAt: -1 })
        .lean();

        const formatted = reRecordSubmissions.map(sub => {
            const rejectedVerses = (sub.verses || []).filter(v => v.status === "rejected");
            return {
                submissionId: sub._id,
                subtopicId: sub.subtopicId?._id || sub.subtopicId,
                scenarioTitle: sub.subtopicId?.title || "Scripted Scenario",
                topicTitle: sub.subtopicId?.topicId?.title || "Scripted Topic",
                topicId: sub.subtopicId?.topicId?._id || null,
                role: sub.role,
                language: sub.language,
                rejectedCount: rejectedVerses.length,
                rejectionReasons: rejectedVerses.map(v => v.rejectionReason).filter(Boolean),
                notes: rejectedVerses.map(v => v.reviewNote).filter(Boolean),
                verses: sub.verses,
                scenario: sub.subtopicId
            };
        });

        res.json({ rerecords: formatted });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── 2. Claim / Lock a Scenario Role when Contributor opens Recording Studio ───────
router.post("/claim", requireAuth(JWT_SECRET), async (req, res) => {
    try {
        const userId = req.user?._id || req.userId;
        const { subtopicId, topicId, role, language } = req.body;

        if (!subtopicId || !topicId || !role) {
            return res.status(400).json({ error: "Missing required claim parameters" });
        }

        await cleanupExpiredClaims();

        // Release any existing active claims this user had on OTHER subtopics
        await ScriptedClaim.updateMany(
            {
                userId,
                status: "active",
                subtopicId: { $ne: subtopicId }
            },
            { $set: { status: "released" } }
        );

        // Verify subtopic exists and is active
        const sub = await ScriptedSubtopic.findById(subtopicId);
        if (!sub || !sub.isEnabled) {
            return res.status(404).json({ error: "Scripted scenario not found or disabled" });
        }

        // Check if user already submitted for this scenario
        const existingSub = await ScriptedSubmission.findOne({
            subtopicId,
            userId,
            status: { $ne: "cancelled" }
        });
        const isReRecording = existingSub && existingSub.status === "needs_rerecord";

        if (existingSub && !isReRecording) {
            return res.status(400).json({ error: "You have already completed this scripted scenario." });
        }

        if (!isReRecording) {
            const targetFrequency = sub.frequency !== undefined ? sub.frequency : (sub.maxCalls !== undefined ? sub.maxCalls : 3);
            const approvedCount = await CallSession.countDocuments({
                subtopicId,
                callActuallyStarted: true,
                callStatus: "approved"
            });
            const pendingCount = await CallSession.countDocuments({
                subtopicId,
                callActuallyStarted: true,
                callStatus: "pending"
            });
            const totalCompletedOrPaired = approvedCount + pendingCount;

            if (totalCompletedOrPaired >= targetFrequency) {
                return res.status(400).json({ error: "This scenario has already reached its target quota." });
            }

            // Count existing submissions and active claims by other users for this role
            const pendingRoleSubmissions = await ScriptedSubmission.countDocuments({
                subtopicId,
                role,
                status: "pending_match"
            });
            const otherActiveRoleClaims = await ScriptedClaim.countDocuments({
                subtopicId,
                role,
                status: "active",
                userId: { $ne: userId }
            });

            const openRoleSlots = targetFrequency - totalCompletedOrPaired - pendingRoleSubmissions - otherActiveRoleClaims;
            if (openRoleSlots <= 0) {
                return res.status(409).json({
                    error: "This speaker role is currently claimed by another contributor. Please choose another scenario."
                });
            }
        }

        // Upsert or create active claim for this user
        let claim = await ScriptedClaim.findOne({
            userId,
            subtopicId,
            status: "active"
        });

        if (claim) {
            claim.role = role;
            claim.language = language || "english";
            claim.lastHeartbeat = new Date();
            await claim.save();
        } else {
            claim = new ScriptedClaim({
                subtopicId,
                topicId,
                userId,
                role,
                language: language || "english",
                lockedAt: new Date(),
                lastHeartbeat: new Date(),
                status: "active"
            });
            await claim.save();
        }

        res.json({
            success: true,
            claimId: claim._id,
            subtopicId,
            role,
            message: "Scenario role locked successfully while window is open."
        });
    } catch (error) {
        console.error("[ScriptedClaim] Claim error:", error);
        res.status(500).json({ error: error.message || "Failed to claim scenario" });
    }
});

// ── 3. Heartbeat Endpoint to Keep Lock Active While Window is Open ────────────────
router.post("/heartbeat", async (req, res) => {
    try {
        const userId = getOptionalUserId(req);
        const { claimId, subtopicId } = req.body;

        if (!userId && !claimId) {
            return res.status(400).json({ error: "Unauthorized or missing claim ID" });
        }

        const query = { status: "active" };
        if (claimId) query._id = claimId;
        if (userId) query.userId = userId;
        if (subtopicId) query.subtopicId = subtopicId;

        const claim = await ScriptedClaim.findOneAndUpdate(
            query,
            { $set: { lastHeartbeat: new Date() } },
            { new: true }
        );

        if (!claim) {
            return res.status(404).json({ error: "Active claim expired or not found", expired: true });
        }

        res.json({ success: true, lastHeartbeat: claim.lastHeartbeat });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── 4. Release Claim when Contributor Exits Studio or Closes Window ───────────────
router.post("/release-claim", async (req, res) => {
    try {
        const userId = getOptionalUserId(req);
        const { claimId, subtopicId } = req.body;

        const query = { status: "active" };
        if (claimId) query._id = claimId;
        if (subtopicId) query.subtopicId = subtopicId;
        if (userId) query.userId = userId;

        await ScriptedClaim.updateMany(
            query,
            { $set: { status: "released" } }
        );

        res.json({ success: true, message: "Claim released successfully." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── 5. Contributor Submits Verses (Releases lock & auto-pairs) ────────────────────
router.post("/submit-recording", requireAuth(JWT_SECRET), scriptedUpload.any(), async (req, res) => {
    try {
        const userId = req.user?._id || req.userId;
        const { subtopicId, topicId, language, role, versesMeta } = req.body;

        if (!subtopicId || !topicId || !role) {
            return res.status(400).json({ error: "Missing required scenario parameters" });
        }

        // Parse verses metadata if provided
        let parsedVersesMeta = [];
        try {
            if (versesMeta) {
                parsedVersesMeta = typeof versesMeta === "string" ? JSON.parse(versesMeta) : versesMeta;
            }
        } catch (_) {}

        // Check if user already submitted for this scenario
        const existing = await ScriptedSubmission.findOne({
            subtopicId,
            userId,
            status: { $ne: "cancelled" }
        });

        if (existing) {
            return res.status(400).json({ error: "You have already recorded this scripted scenario." });
        }

        const user = await User.findById(userId).select("gender").lean();
        const userGender = user?.gender ? user.gender.toLowerCase().trim() : "other";

        // Map uploaded files to verses
        const files = req.files || [];
        const verses = files.map((file, idx) => {
            const meta = parsedVersesMeta[idx] || {};
            return {
                turnIndex: meta.turnIndex !== undefined ? meta.turnIndex : idx,
                audioPath: file.path,
                durationSec: meta.durationSec || 0,
                text: meta.text || ""
            };
        }).sort((a, b) => a.turnIndex - b.turnIndex);

        if (verses.length === 0) {
            return res.status(400).json({ error: "No audio verses uploaded" });
        }

        // Save submission
        const newSubmission = new ScriptedSubmission({
            subtopicId,
            topicId,
            language: language || "english",
            userId,
            userGender,
            role,
            verses,
            status: "pending_match"
        });

        await newSubmission.save();

        // Mark active claim as submitted
        await ScriptedClaim.updateMany(
            { userId, subtopicId, status: "active" },
            { $set: { status: "submitted" } }
        );

        // Check for matching opposite speaker submission
        const oppositeRole = role === "speaker1" ? "speaker2" : "speaker1";
        const matchingSubmission = await ScriptedSubmission.findOne({
            subtopicId,
            role: oppositeRole,
            status: "pending_match",
            userId: { $ne: userId }
        }).sort({ createdAt: 1 });

        if (matchingSubmission) {
            // Trigger automatic dual-channel stitching in background
            const s1Sub = role === "speaker1" ? newSubmission : matchingSubmission;
            const s2Sub = role === "speaker1" ? matchingSubmission : newSubmission;

            stitchScriptedPair(s1Sub, s2Sub).catch(err => {
                console.error("[ScriptedTopics] Async stitching failed:", err);
            });

            return res.json({
                success: true,
                matched: true,
                message: "Verses submitted successfully! Paired with matching partner."
            });
        }

        res.json({
            success: true,
            matched: false,
            message: "Verses submitted successfully! Awaiting matching partner."
        });
    } catch (error) {
        console.error("[ScriptedTopics] Submit recording error:", error);
        res.status(500).json({ error: error.message || "Failed to submit recording" });
    }
});

// GET /api/scripted-topics/submission-status/:subtopicId
router.get("/submission-status/:subtopicId", requireAuth(JWT_SECRET), async (req, res) => {
    try {
        const userId = req.userId || req.user?._id || getOptionalUserId(req);
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const submission = await ScriptedSubmission.findOne({
            subtopicId: req.params.subtopicId,
            userId,
            status: { $ne: "cancelled" }
        }).lean();

        if (!submission) {
            return res.json({ submission: null });
        }

        const versesWithUrls = (submission.verses || []).map(v => ({
            turnIndex: v.turnIndex,
            text: v.text,
            durationSec: v.durationSec,
            status: v.status || "pending",
            rejectionReason: v.rejectionReason || null,
            reviewNote: v.reviewNote || null,
            audioUrl: `/api/scripted-topics/verse-audio/${submission._id}/${v.turnIndex}`
        }));

        res.json({
            submission: {
                _id: submission._id,
                subtopicId: submission.subtopicId,
                role: submission.role,
                status: submission.status,
                language: submission.language,
                verses: versesWithUrls
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/scripted-topics/verse-audio/:submissionId/:turnIndex
router.get("/verse-audio/:submissionId/:turnIndex", async (req, res) => {
    try {
        const { submissionId, turnIndex } = req.params;
        const sub = await ScriptedSubmission.findById(submissionId).lean();
        if (!sub) return res.status(404).json({ error: "Submission not found" });

        const verse = (sub.verses || []).find(v => Number(v.turnIndex) === Number(turnIndex));
        if (!verse || !verse.audioPath || !fs.existsSync(verse.audioPath)) {
            return res.status(404).json({ error: "Verse audio file not found" });
        }

        const ext = path.extname(verse.audioPath).toLowerCase();
        const contentType = ext === ".webm" ? "audio/webm" : (ext === ".mp3" ? "audio/mpeg" : (ext === ".ogg" ? "audio/ogg" : "audio/wav"));

        const stat = fs.statSync(verse.audioPath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(verse.audioPath, { start, end });
            const head = {
                "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                "Accept-Ranges": "bytes",
                "Content-Length": chunksize,
                "Content-Type": contentType,
            };
            res.writeHead(206, head);
            file.pipe(res);
        } else {
            const head = {
                "Content-Length": fileSize,
                "Content-Type": contentType,
                "Accept-Ranges": "bytes",
            };
            res.writeHead(200, head);
            fs.createReadStream(verse.audioPath).pipe(res);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/scripted-topics/rerecord-verses
router.post("/rerecord-verses", requireAuth(JWT_SECRET), scriptedUpload.any(), async (req, res) => {
    try {
        const userId = req.userId || req.user?._id || getOptionalUserId(req);
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const { submissionId, subtopicId, role } = req.body;
        let parsedVersesMeta = [];
        try {
            parsedVersesMeta = req.body.versesMeta ? JSON.parse(req.body.versesMeta) : [];
        } catch (_) {}

        const submission = await ScriptedSubmission.findOne({
            _id: submissionId,
            userId,
            status: { $ne: "cancelled" }
        });

        if (!submission) {
            return res.status(404).json({ error: "Submission not found" });
        }

        const files = req.files || [];
        if (files.length === 0) {
            return res.status(400).json({ error: "No re-recorded verses uploaded" });
        }

        // Map and update each re-recorded verse
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const meta = parsedVersesMeta[i] || {};
            const turnIndex = Number(meta.turnIndex !== undefined ? meta.turnIndex : meta.index);

            const vIdx = submission.verses.findIndex(v => Number(v.turnIndex) === turnIndex);
            if (vIdx >= 0) {
                submission.verses[vIdx].audioPath = file.path;
                submission.verses[vIdx].durationSec = meta.durationSec || 0;
                submission.verses[vIdx].status = "pending";
                submission.verses[vIdx].rejectionReason = null;
                submission.verses[vIdx].reviewNote = null;
                submission.verses[vIdx].reviewedAt = null;
                submission.verses[vIdx].reviewedBy = null;
            } else {
                submission.verses.push({
                    turnIndex,
                    audioPath: file.path,
                    durationSec: meta.durationSec || 0,
                    text: meta.text || "",
                    status: "pending",
                    rejectionReason: null,
                    reviewNote: null
                });
            }
        }

        // Check if any verse is still rejected
        const hasRejectedVerses = submission.verses.some(v => v.status === "rejected");
        if (!hasRejectedVerses) {
            submission.status = submission.pairedSubmissionId ? "matched" : "pending_match";
        } else {
            submission.status = "needs_rerecord";
        }

        await submission.save();

        if (submission.callSessionId) {
            const call = await CallSession.findById(submission.callSessionId);
            if (call) {
                const isUserA = String(submission.userId) === String(call.userA);
                if (isUserA) {
                    call.recordingAStatus = "pending";
                    call.recordingARejectionReason = null;
                } else {
                    call.recordingBStatus = "pending";
                    call.recordingBRejectionReason = null;
                }
                call.callStatus = "pending";
                await call.save();
            }
        }

        // If paired, trigger re-stitching
        if (submission.pairedSubmissionId) {
            const pairedSub = await ScriptedSubmission.findById(submission.pairedSubmissionId);
            if (pairedSub) {
                const s1Sub = submission.role === "speaker1" ? submission : pairedSub;
                const s2Sub = submission.role === "speaker1" ? pairedSub : submission;
                stitchScriptedPair(s1Sub, s2Sub).catch(err => {
                    console.error("[ScriptedTopics] Re-stitching failed:", err);
                });
            }
        }

        res.json({
            success: true,
            message: "Re-recorded verses submitted successfully! Queued for review."
        });
    } catch (error) {
        console.error("[ScriptedTopics] Re-record submit error:", error);
        res.status(500).json({ error: error.message || "Failed to submit re-recorded verses" });
    }
});

// GET /api/scripted-topics/call-dialogue/:callId
router.get("/call-dialogue/:callId", async (req, res) => {
    try {
        const { callId } = req.params;
        const call = await CallSession.findOne({ callId })
            .populate("userA", "firstname lastname username email speaker_id")
            .populate("userB", "firstname lastname username email speaker_id")
            .lean();

        if (!call) return res.status(404).json({ error: "Scripted call not found" });

        // 1. Try finding submissions by callSessionId
        let [s1Sub, s2Sub] = await Promise.all([
            ScriptedSubmission.findOne({ callSessionId: call._id, role: "speaker1" }).lean(),
            ScriptedSubmission.findOne({ callSessionId: call._id, role: "speaker2" }).lean()
        ]);

        // Fallback: If not found by callSessionId, find by subtopicId and users
        if (!s1Sub || !s2Sub) {
            const subtopicId = call.subtopicId || s1Sub?.subtopicId || s2Sub?.subtopicId;
            if (subtopicId) {
                if (!s1Sub && call.userA) {
                    s1Sub = await ScriptedSubmission.findOne({
                        subtopicId,
                        userId: call.userA._id || call.userA,
                        status: { $ne: "cancelled" }
                    }).lean();
                }
                if (!s2Sub && call.userB) {
                    s2Sub = await ScriptedSubmission.findOne({
                        subtopicId,
                        userId: call.userB._id || call.userB,
                        status: { $ne: "cancelled" }
                    }).lean();
                }
            }
        }

        // 2. Fetch the subtopic
        const subtopicId = s1Sub?.subtopicId || s2Sub?.subtopicId || call.subtopicId;
        let subtopic = null;
        if (subtopicId) {
            subtopic = await ScriptedSubtopic.findById(subtopicId).lean();
        }

        // 3. Fallback if subtopic dialogueTurns is empty, reconstruct turns from submissions
        let rawDialogueTurns = subtopic?.dialogueTurns || [];
        if (rawDialogueTurns.length === 0) {
            const maxTurns = Math.max(s1Sub?.verses?.length || 0, s2Sub?.verses?.length || 0);
            for (let i = 0; i < maxTurns; i++) {
                const v1 = s1Sub?.verses?.find(v => Number(v.turnIndex) === i);
                const v2 = s2Sub?.verses?.find(v => Number(v.turnIndex) === i);
                rawDialogueTurns.push({
                    speaker1: v1?.text || (v1 ? `Speaker 1 Verse ${i + 1}` : ""),
                    speaker2: v2?.text || (v2 ? `Speaker 2 Verse ${i + 1}` : "")
                });
            }
        }

        const turns = [];
        rawDialogueTurns.forEach((turn, idx) => {
            // Speaker 1 Verse
            const v1Obj = s1Sub?.verses?.find(v => Number(v.turnIndex) === idx);
            if (turn.speaker1 || v1Obj) {
                turns.push({
                    turnIndex: idx,
                    speakerRole: "speaker1",
                    speakerLabel: "Speaker 1 (Host)",
                    speakerUser: call.userA ? {
                        id: String(call.userA._id || call.userA),
                        name: `${call.userA.firstname || ""} ${call.userA.lastname || ""}`.trim() || call.userA.username || "Speaker 1",
                        speaker_id: call.userA.speaker_id || null
                    } : null,
                    submissionId: s1Sub?._id || null,
                    text: turn.speaker1 || v1Obj?.text || "",
                    status: v1Obj?.status || "pending",
                    rejectionReason: v1Obj?.rejectionReason || null,
                    reviewNote: v1Obj?.reviewNote || null,
                    durationSec: v1Obj?.durationSec || 0,
                    audioUrl: s1Sub?._id ? `/api/scripted-topics/verse-audio/${s1Sub._id}/${idx}` : null
                });
            }

            // Speaker 2 Verse
            const v2Obj = s2Sub?.verses?.find(v => Number(v.turnIndex) === idx);
            if (turn.speaker2 || v2Obj) {
                turns.push({
                    turnIndex: idx,
                    speakerRole: "speaker2",
                    speakerLabel: "Speaker 2 (Guest)",
                    speakerUser: call.userB ? {
                        id: String(call.userB._id || call.userB),
                        name: `${call.userB.firstname || ""} ${call.userB.lastname || ""}`.trim() || call.userB.username || "Speaker 2",
                        speaker_id: call.userB.speaker_id || null
                    } : null,
                    submissionId: s2Sub?._id || null,
                    text: turn.speaker2 || v2Obj?.text || "",
                    status: v2Obj?.status || "pending",
                    rejectionReason: v2Obj?.rejectionReason || null,
                    reviewNote: v2Obj?.reviewNote || null,
                    durationSec: v2Obj?.durationSec || 0,
                    audioUrl: s2Sub?._id ? `/api/scripted-topics/verse-audio/${s2Sub._id}/${idx}` : null
                });
            }
        });

        res.json({
            call,
            subtopic,
            s1Submission: s1Sub,
            s2Submission: s2Sub,
            turns
        });
    } catch (err) {
        console.error("[call-dialogue] Error:", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
