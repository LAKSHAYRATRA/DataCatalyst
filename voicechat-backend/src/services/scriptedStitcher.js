import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import crypto from "crypto";
import { CallSession } from "../models/CallSession.js";
import { ScriptedSubmission } from "../models/ScriptedSubmission.js";
import { ScriptedSubtopic } from "../models/ScriptedSubtopic.js";
import { ScriptedLanguage } from "../models/ScriptedLanguage.js";
import { Language } from "../models/Language.js";

const execAsync = promisify(exec);

// Helper to get audio duration in seconds via ffprobe
async function getAudioDuration(filePath) {
    try {
        const { stdout } = await execAsync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
        );
        const duration = parseFloat(stdout.trim());
        return isNaN(duration) || duration <= 0 ? 1.0 : duration;
    } catch (err) {
        console.warn(`[scriptedStitcher] ffprobe failed for ${filePath}, fallback to 2.0s:`, err.message);
        return 2.0;
    }
}

/**
 * Interleave and stitch a dual-speaker scripted conversation pair.
 * Track A (Speaker 1) has active audio during S1 turns and digital silence during S2 turns.
 * Track B (Speaker 2) has active audio during S2 turns and digital silence during S1 turns.
 * 
 * @param {Object} sub1 - ScriptedSubmission for Speaker 1
 * @param {Object} sub2 - ScriptedSubmission for Speaker 2
 */
export async function stitchScriptedPair(sub1, sub2) {
    const callId = `scripted_${crypto.randomUUID()}`;
    const recordingsDir = path.join(process.cwd(), "recordings");
    const tempDir = path.join(process.cwd(), "temp", callId);

    if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    try {
        const subtopic = await ScriptedSubtopic.findById(sub1.subtopicId).lean();
        const turnsCount = Math.max(sub1.verses?.length || 0, sub2.verses?.length || 0, subtopic?.dialogueTurns?.length || 0);

        if (turnsCount === 0) {
            throw new Error("No verses found to stitch for scripted pair");
        }

        const PAUSE_SEC = 0.4; // 400ms conversational pause between speaker turns
        const SAMPLE_RATE = 48000;

        // Generate a standard pause silence clip
        const pauseFile = path.join(tempDir, "pause.wav");
        await execAsync(
            `ffmpeg -y -f lavfi -i anullsrc=r=${SAMPLE_RATE}:cl=mono -t ${PAUSE_SEC} -c:a pcm_s16le "${pauseFile}"`
        );

        const trackAConcatList = [];
        const trackBConcatList = [];

        let totalDuration = 0;
        let totalAudioSecA = 0;
        let totalAudioSecB = 0;
        const segmentTimestamps = []; // For QA labels and time-aligned verification

        for (let i = 0; i < turnsCount; i++) {
            const v1 = (sub1.verses || []).find(v => v.turnIndex === i);
            const v2 = (sub2.verses || []).find(v => v.turnIndex === i);

            const v1File = v1 ? path.resolve(v1.audioPath) : null;
            const v2File = v2 ? path.resolve(v2.audioPath) : null;

            // 1. Process Speaker 1 Turn
            if (v1File && fs.existsSync(v1File)) {
                const dur1 = await getAudioDuration(v1File);
                if (v1) v1.durationSec = dur1;
                totalAudioSecA += dur1;
                const s1StartTime = totalDuration;
                totalDuration += dur1;
                const s1EndTime = totalDuration;

                // Normalize S1 audio to standard 48kHz mono 16-bit
                const s1NormFile = path.join(tempDir, `s1_turn_${i}.wav`);
                await execAsync(
                    `ffmpeg -y -i "${v1File}" -ar ${SAMPLE_RATE} -ac 1 -c:a pcm_s16le "${s1NormFile}"`
                );

                // S2 counterpart silence
                const s2SilenceFile = path.join(tempDir, `s2_silence_${i}.wav`);
                await execAsync(
                    `ffmpeg -y -f lavfi -i anullsrc=r=${SAMPLE_RATE}:cl=mono -t ${dur1} -c:a pcm_s16le "${s2SilenceFile}"`
                );

                trackAConcatList.push(s1NormFile);
                trackBConcatList.push(s2SilenceFile);

                segmentTimestamps.push({
                    turnIndex: i,
                    speaker: "Speaker 1",
                    userId: String(sub1.userId),
                    startSec: s1StartTime,
                    endSec: s1EndTime,
                    text: v1.text || subtopic?.dialogueTurns?.[i]?.speaker1 || ""
                });
            }

            // Add inter-turn natural pause
            trackAConcatList.push(pauseFile);
            trackBConcatList.push(pauseFile);
            totalDuration += PAUSE_SEC;

            // 2. Process Speaker 2 Turn
            if (v2File && fs.existsSync(v2File)) {
                const dur2 = await getAudioDuration(v2File);
                if (v2) v2.durationSec = dur2;
                totalAudioSecB += dur2;
                const s2StartTime = totalDuration;
                totalDuration += dur2;
                const s2EndTime = totalDuration;

                // Normalize S2 audio to standard 48kHz mono 16-bit
                const s2NormFile = path.join(tempDir, `s2_turn_${i}.wav`);
                await execAsync(
                    `ffmpeg -y -i "${v2File}" -ar ${SAMPLE_RATE} -ac 1 -c:a pcm_s16le "${s2NormFile}"`
                );

                // S1 counterpart silence
                const s1SilenceFile = path.join(tempDir, `s1_silence_${i}.wav`);
                await execAsync(
                    `ffmpeg -y -f lavfi -i anullsrc=r=${SAMPLE_RATE}:cl=mono -t ${dur2} -c:a pcm_s16le "${s1SilenceFile}"`
                );

                trackAConcatList.push(s1SilenceFile);
                trackBConcatList.push(s2NormFile);

                segmentTimestamps.push({
                    turnIndex: i,
                    speaker: "Speaker 2",
                    userId: String(sub2.userId),
                    startSec: s2StartTime,
                    endSec: s2EndTime,
                    text: v2.text || subtopic?.dialogueTurns?.[i]?.speaker2 || ""
                });
            }

            // Add inter-turn natural pause
            trackAConcatList.push(pauseFile);
            trackBConcatList.push(pauseFile);
            totalDuration += PAUSE_SEC;
        }

        // Write concat lists for ffmpeg
        const listAPath = path.join(tempDir, "list_a.txt");
        const listBPath = path.join(tempDir, "list_b.txt");

        fs.writeFileSync(listAPath, trackAConcatList.map(f => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
        fs.writeFileSync(listBPath, trackBConcatList.map(f => `file '${f.replace(/\\/g, "/")}'`).join("\n"));

        // Output destination files
        let callSession = null;
        let callId = null;

        if (sub1.callSessionId) {
            callSession = await CallSession.findById(sub1.callSessionId);
            if (callSession) {
                callId = callSession.callId;
            }
        }

        if (!callId) {
            callId = `scripted_${crypto.randomUUID()}`;
        }

        const outTrackA = path.join(recordingsDir, `${callId}_A.wav`);
        const outTrackB = path.join(recordingsDir, `${callId}_B.wav`);
        const outMixedStereo = path.join(recordingsDir, `${callId}_stereo.wav`);

        // Concatenate Track A
        await execAsync(`ffmpeg -y -f concat -safe 0 -i "${listAPath}" -c:a pcm_s16le "${outTrackA}"`);

        // Concatenate Track B
        await execAsync(`ffmpeg -y -f concat -safe 0 -i "${listBPath}" -c:a pcm_s16le "${outTrackB}"`);

        // Create Mixed Dual-Channel Stereo Audio (Left = Track A, Right = Track B)
        await execAsync(
            `ffmpeg -y -i "${outTrackA}" -i "${outTrackB}" -filter_complex "[0:a][1:a]join=inputs=2:channel_layout=stereo[a]" -map "[a]" -c:a pcm_s16le "${outMixedStereo}"`
        );

        const durationMinutesA = Math.max(0.01, +(totalAudioSecA / 60).toFixed(2));
        const durationMinutesB = Math.max(0.01, +(totalAudioSecB / 60).toFixed(2));

        const langCode = String(sub1.language || "english").toLowerCase().trim();
        const [sLang, lang] = await Promise.all([
            ScriptedLanguage.findOne({ code: langCode }).select("hourlyPayout").lean(),
            Language.findOne({ code: langCode }).select("hourlyPayout").lean()
        ]);
        const hourlyRate = (sLang && Number(sLang.hourlyPayout) > 0) ? Number(sLang.hourlyPayout) : (Number(lang?.hourlyPayout) || 0);

        const payoutUsdA = Math.round(((hourlyRate * durationMinutesA) / 60) * 100) / 100;
        const payoutUsdB = Math.round(((hourlyRate * durationMinutesB) / 60) * 100) / 100;

        const now = new Date();

        if (!callSession) {
            callSession = new CallSession({
                callId,
                userA: sub1.userId,
                userB: sub2.userId,
                topicId: sub1.topicId,
                subtopicId: sub1.subtopicId,
                language: sub1.language || "english",
                startedAt: sub1.createdAt || now,
                endedAt: now,
                actualCallStartedAt: sub1.createdAt || now,
                actualCallDuration: Math.round(totalDuration),
                recordingAFile: `${callId}_A.wav`,
                recordingAStartedAt: sub1.createdAt || now,
                recordingBFile: `${callId}_B.wav`,
                recordingBStartedAt: sub2.createdAt || now,
                mixedRecordingFile: `${callId}_stereo.wav`,
                callActuallyStarted: true,
                callStatus: "pending",
                recordingAStatus: "pending",
                recordingBStatus: "pending",
                recordingADurationMinutes: durationMinutesA,
                recordingBDurationMinutes: durationMinutesB,
                recordingAPayoutUsd: payoutUsdA,
                recordingBPayoutUsd: payoutUsdB,
                endReason: "scripted_completed"
            });
        } else {
            callSession.actualCallDuration = Math.round(totalDuration);
            callSession.recordingADurationMinutes = durationMinutesA;
            callSession.recordingBDurationMinutes = durationMinutesB;
            callSession.recordingAPayoutUsd = payoutUsdA;
            callSession.recordingBPayoutUsd = payoutUsdB;
            callSession.callStatus = "pending";
            callSession.recordingAStatus = "pending";
            callSession.recordingBStatus = "pending";
            callSession.endedAt = now;
        }

        await callSession.save();

        // Update Submissions as matched and persist verse durations
        sub1.status = "matched";
        sub1.pairedSubmissionId = sub2._id;
        sub1.callSessionId = callSession._id;
        await sub1.save();

        sub2.status = "matched";
        sub2.pairedSubmissionId = sub1._id;
        sub2.callSessionId = callSession._id;
        await sub2.save();

        // Clean up temporary workspace
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (_) {}

        console.log(`[scriptedStitcher] Successfully stitched pair into CallSession ${callId} (${totalDuration.toFixed(1)}s)`);
        return callSession;
    } catch (err) {
        console.error(`[scriptedStitcher] Error stitching scripted pair:`, err);
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (_) {}
        throw err;
    }
}
