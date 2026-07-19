import express from "express";
import { Topic } from "../models/Topic.js";
import { Subtopic } from "../models/Subtopic.js";
import { CallSession } from "../models/CallSession.js";

const router = express.Router();

// Get only enabled topics with enabled subtopics (for regular users)
router.get("/enabled", async (req, res) => {
    try {
        const queryLang = req.query.language;
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
                    const callCount = await CallSession.countDocuments({
                        subtopicId: sub._id,
                        callActuallyStarted: true
                    });
                    const limit = sub.maxCalls !== undefined ? sub.maxCalls : 3;
                    if (callCount < limit) {
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
