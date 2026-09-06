import express from "express";
import { Topic } from "../models/Topic.js";
import { Subtopic } from "../models/Subtopic.js";
import { CallSession } from "../models/CallSession.js";
import { optionalAuth } from "../auth.js";

const JWT_SECRET = process.env.JWT_SECRET;
const router = express.Router();

// Get only enabled topics with enabled subtopics (for regular users)
router.get("/enabled", optionalAuth(JWT_SECRET), async (req, res) => {
    try {
        const queryLang = req.query.language;

        // If user belongs to a vendor, verify active Call project assignments
        if (req.user?.vendorId) {
            const { Vendor } = await import("../models/Vendor.js");
            const vendor = await Vendor.findById(req.user.vendorId).lean();
            const callProjects = (vendor?.assignedProjects || []).filter(p => p.category === "call" && p.isActive !== false);
            if (!vendor || callProjects.length === 0) {
                return res.json({ topics: [] });
            }
            const allowedCodes = callProjects.map(p => (p.languageCode || "").toLowerCase().trim()).filter(Boolean);
            if (queryLang && !allowedCodes.includes(String(queryLang).toLowerCase().trim())) {
                return res.json({ topics: [] });
            }
        }

        let matchQuery = { isEnabled: true };
        
        if (queryLang) {
            matchQuery.$or = [
                { languages: { $size: 0 } },
                { languages: null },
                { languages: { $in: [queryLang] } }
            ];
        }

        const topics = await Topic.find(matchQuery).sort({ title: 1 });

        const topicsWithSubtopicsRaw = await Promise.all(
            topics.map(async (topic) => {
                const subtopics = await Subtopic.find({
                    topicId: topic._id,
                    isEnabled: true,
                }).sort({ title: 1 });

                const validSubtopics = [];
                for (const sub of subtopics) {
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
                    if (approvedCount + pendingCount < limit) {
                        validSubtopics.push(sub);
                    }
                }

                return {
                    _id: topic._id,
                    title: topic.title,
                    description: topic.description,
                    subtopics: validSubtopics,
                };
            })
        );
        
        const topicsWithSubtopics = topicsWithSubtopicsRaw.filter(t => t.subtopics.length > 0);

        res.json({ topics: topicsWithSubtopics });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
