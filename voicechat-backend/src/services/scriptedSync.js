import crypto from "crypto";
import { ScriptedSubmission } from "../models/ScriptedSubmission.js";
import { ScriptedTopic } from "../models/ScriptedTopic.js";
import { CallSession } from "../models/CallSession.js";

/**
 * Ensures any half-recorded scripted submission (status: 'pending_match' or 'needs_rerecord')
 * has an active CallSession so it appears in Admin Scripted Calls Review with "Pending Completion".
 */
export async function syncPendingScriptedSubmissions() {
    try {
        const pendingSubs = await ScriptedSubmission.find({
            status: { $in: ["pending_match", "needs_rerecord"] }
        });

        let syncedCount = 0;
        for (const sub of pendingSubs) {
            let call = null;
            if (sub.callSessionId) {
                call = await CallSession.findById(sub.callSessionId);
            }

            if (!call) {
                const isSpeaker1 = sub.role === "speaker1";
                const userField = isSpeaker1 ? "userA" : "userB";
                call = await CallSession.findOne({
                    subtopicId: sub.subtopicId,
                    [userField]: sub.userId,
                    callActuallyStarted: true,
                    endReason: "scripted_pending_partner"
                });
            }

            if (!call) {
                // Determine language
                let effectiveLang = sub.language;
                if (!effectiveLang || effectiveLang === "english") {
                    try {
                        const topic = await ScriptedTopic.findById(sub.topicId).lean();
                        if (topic?.languages && topic.languages.length > 0) {
                            effectiveLang = topic.languages[0];
                        }
                    } catch {}
                }

                const singleCallId = `scripted_${crypto.randomUUID()}`;
                const isSpeaker1 = sub.role === "speaker1";
                const now = sub.createdAt || new Date();

                call = new CallSession({
                    callId: singleCallId,
                    userA: isSpeaker1 ? sub.userId : null,
                    userB: !isSpeaker1 ? sub.userId : null,
                    topicId: sub.topicId,
                    subtopicId: sub.subtopicId,
                    language: effectiveLang || "english",
                    startedAt: now,
                    endedAt: now,
                    actualCallStartedAt: now,
                    actualCallDuration: 0,
                    callActuallyStarted: true,
                    callStatus: "pending",
                    recordingAStatus: isSpeaker1 ? "pending" : "not_recorded",
                    recordingBStatus: !isSpeaker1 ? "pending" : "not_recorded",
                    endReason: "scripted_pending_partner"
                });
                await call.save();
                syncedCount++;
                console.log(`[scriptedSync] Created CallSession ${singleCallId} for pending submission ${sub._id} (${sub.role})`);
            }

            if (!sub.callSessionId || String(sub.callSessionId) !== String(call._id)) {
                sub.callSessionId = call._id;
                await sub.save();
            }
        }

        return syncedCount;
    } catch (err) {
        console.error("[scriptedSync] Error syncing pending submissions:", err);
        return 0;
    }
}
