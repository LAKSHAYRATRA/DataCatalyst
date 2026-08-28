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
            matchQuery.$or = [
                { languages: { $size: 0 } },
                { languages: null },
                { languages: { $in: [queryLang] } }
            ];
        }

        // Find user details (for deduplication, gender filtering, and claim status)
        let userRecordedSubtopicIds = new Set();
        let userGender = null;
        let userActiveClaimsMap = new Map(); // subtopicId -> role

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
                }).select("subtopicId").lean(),
                ScriptedClaim.find({
                    userId: currentUserId,
                    status: "active"
                }).lean(),
                User.findById(currentUserId).select("gender isAdmin isQA languageApplications").lean()
            ]);

            // Verify that the user has an approved scripted_call application for the requested language
            if (user && queryLang && req.query.preview !== "true") {
                const targetCode = String(queryLang).toLowerCase().trim();
                const isApproved = (user.languageApplications || []).some(
                    a => a.status === "approved" &&
                         a.applicationType === "scripted_call" &&
                         String(a.languageCode || "").toLowerCase().trim() === targetCode
                );
                if (!isApproved) {
                    return res.json({ topics: [] });
                }
            }

            userRecordedSubtopicIds = new Set([
                ...userSessions.map(s => String(s.subtopicId)).filter(Boolean),
                ...userSubmissions.map(s => String(s.subtopicId)).filter(Boolean)
            ]);

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

        const topics = await ScriptedTopic.find(matchQuery).sort({ title: 1 });

        const topicsWithSubtopicsRaw = await Promise.all(
            topics.map(async (topic) => {
                const subtopics = await ScriptedSubtopic.find({
                    topicId: topic._id,
                    isEnabled: true,
                }).sort({ title: 1 });

                const validSubtopics = [];
                for (const sub of subtopics) {
                    const subIdStr = String(sub._id);

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
                };
            })
        );
        
        // Filter out topics where all subtopics are completed, locked by others, or incompatible
        const topicsWithSubtopics = topicsWithSubtopicsRaw.filter(t => t.subtopics.length > 0);

        res.json({ topics: topicsWithSubtopics, userGender });
    } catch (error) {
        res.status(500).json({ error: error.message });
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
        if (existingSub) {
            return res.status(400).json({ error: "You have already completed this scripted scenario." });
        }

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

export default router;
