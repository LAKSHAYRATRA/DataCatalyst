import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import crypto from "crypto";
import mongoose from "mongoose";
import { CallSession } from "../models/CallSession.js";
import { ScriptedSubmission } from "../models/ScriptedSubmission.js";
import { ScriptedSubtopic } from "../models/ScriptedSubtopic.js";
import { ScriptedLanguage } from "../models/ScriptedLanguage.js";
import { Language } from "../models/Language.js";
import { User } from "../models/User.js";
import { getArtistRateForProject } from "../controllers/vendorController.js";

import { s3Client, BUCKET_NAME } from "../config/s3.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { pipeline } from "stream/promises";

const execAsync = promisify(exec);

// Helper to robustly locate audio on disk across various root and relative paths
function resolveVerseAudioPath(rawPath) {
    if (!rawPath) return null;
    const cleanRaw = String(rawPath).replace(/^local:/, "");
    const base = path.basename(cleanRaw);
    const cwd = process.cwd();
    const candidates = [
        cleanRaw,
        path.resolve(cleanRaw),
        path.join(cwd, cleanRaw),
        path.join(cwd, "uploads", cleanRaw),
        path.join(cwd, "uploads", "scripted_temp", base),
        path.join(cwd, "uploads", base),
        path.join(cwd, "recordings", cleanRaw),
        path.join(cwd, "recordings", base),
        path.join(cwd, "recordings", "language-apps", base),
        path.join(cwd, "recordings", "scripted-call-apps", base),
        path.join(cwd, "voicechat-backend", cleanRaw),
        path.join(cwd, "voicechat-backend", "uploads", "scripted_temp", base),
        path.join(cwd, "voicechat-backend", "uploads", base),
        path.join(cwd, "voicechat-backend", "recordings", base),
        path.join(cwd, "voicechat-backend", "recordings", "language-apps", base),
        path.join(cwd, "voicechat-backend", "recordings", "scripted-call-apps", base)
    ];
    return candidates.find(c => fs.existsSync(c) && fs.statSync(c).isFile()) || null;
}

// Helper to get audio duration in seconds via ffprobe with safe timeout
async function getAudioDuration(filePath) {
    try {
        const { stdout } = await execAsync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
            { timeout: 5000 }
        );
        const duration = parseFloat(stdout.trim());
        return isNaN(duration) || duration <= 0 ? 1.0 : duration;
    } catch (err) {
        console.warn(`[scriptedStitcher] ffprobe failed for ${filePath}, fallback to 2.0s:`, err.message);
        return 2.0;
    }
}

/**
 * Robustly prepare a seamless loopable ambient room tone bed for a speaker.
 * 1. Checks if speaker has a calibrated 15-second room silence recording profile.
 * 2. Scans speaker's recorded verses using silencedetect to extract genuine room silence.
 * 3. Ping-pongs the extracted ambient slice (forward + reverse) so it loops click-free.
 * 4. If no clean ambient section is detected, falls back to a calibrated 48kHz studio room floor (-72 dBFS).
 * 
 * @param {Array} verses - Submissions verses array
 * @param {string} prefix - Speaker identifier ('spk1' or 'spk2')
 * @param {string} tempDir - Workspace directory
 * @param {number} sampleRate - Target sample rate in Hz (default 48000)
 * @param {string} roomSilenceRef - Optional path/key to speaker's 15s calibrated room silence
 */
async function prepareSpeakerRoomBed(verses, prefix, tempDir, sampleRate = 48000, roomSilenceRef = null) {
    const bedPath = path.join(tempDir, `${prefix}_room_bed.wav`);

    // Priority 1: Check if speaker has a dedicated 15-second room silence recording profile
    if (roomSilenceRef) {
        let silenceFilePath = resolveVerseAudioPath(roomSilenceRef);
        // If not found locally, attempt S3 fetch if configured
        if (!silenceFilePath && s3Client && BUCKET_NAME && !String(roomSilenceRef).startsWith("local:")) {
            try {
                const s3Key = String(roomSilenceRef).replace(/^s3:\/\/[^/]+\//, "");
                const localDownloadPath = path.join(tempDir, `${prefix}_s3_silence.flac`);
                const cmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key });
                const s3Res = await s3Client.send(cmd);
                if (s3Res.Body) {
                    await pipeline(s3Res.Body, fs.createWriteStream(localDownloadPath));
                    if (fs.existsSync(localDownloadPath)) {
                        silenceFilePath = localDownloadPath;
                    }
                }
            } catch (s3FetchErr) {
                console.warn(`[scriptedStitcher] Could not fetch roomSilenceRef from S3:`, s3FetchErr.message);
            }
        }

        if (silenceFilePath && fs.existsSync(silenceFilePath)) {
            try {
                // Extract 3 seconds of clean silence (skipping initial 2.0s to avoid mic engage click)
                const fwd = path.join(tempDir, `${prefix}_silence_fwd.wav`);
                const rev = path.join(tempDir, `${prefix}_silence_rev.wav`);

                await execAsync(
                    `ffmpeg -y -ss 2.0 -t 3.0 -i "${silenceFilePath}" -ar ${sampleRate} -ac 1 -c:a pcm_s16le "${fwd}"`,
                    { timeout: 5000 }
                );
                await execAsync(
                    `ffmpeg -y -i "${fwd}" -af "areverse" -c:a pcm_s16le "${rev}"`,
                    { timeout: 5000 }
                );
                const ppList = path.join(tempDir, `${prefix}_silence_pp_list.txt`);
                fs.writeFileSync(ppList, `file '${fwd.replace(/\\/g, "/")}'\nfile '${rev.replace(/\\/g, "/")}'\n`);
                await execAsync(
                    `ffmpeg -y -f concat -safe 0 -i "${ppList}" -c:a pcm_s16le "${bedPath}"`,
                    { timeout: 5000 }
                );
                console.log(`[scriptedStitcher] Using verified 15s room silence profile for ${prefix} from ${path.basename(silenceFilePath)}`);
                return bedPath;
            } catch (err) {
                console.warn(`[scriptedStitcher] Failed to process verified room silence for ${prefix}:`, err.message);
            }
        }
    }

    // Scan verses to locate true ambient silence in the speaker's actual environment
    for (const v of (verses || [])) {
        const filePath = resolveVerseAudioPath(v.audioPath);
        if (!filePath || !fs.existsSync(filePath)) continue;

        try {
            const { stderr } = await execAsync(
                `ffmpeg -i "${filePath}" -af "silencedetect=noise=-30dB:d=0.25" -f null -`,
                { timeout: 5000 }
            ).catch(err => ({ stderr: err?.stderr || "" }));

            const output = stderr || "";
            const regex = /silence_start:\s*([\d.]+)\s*[\r\n]+.*?silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g;
            let match;
            let bestSeg = null;
            let maxDur = 0;

            while ((match = regex.exec(output)) !== null) {
                const start = parseFloat(match[1]);
                const end = parseFloat(match[2]);
                const dur = parseFloat(match[3]);
                if (dur > maxDur) {
                    maxDur = dur;
                    bestSeg = { start, end, dur };
                }
            }

            if (bestSeg && bestSeg.dur >= 0.25) {
                // Extract middle slice of silence segment to avoid any speech bleed at edges
                const extractDur = Math.min(Math.max(0.2, bestSeg.dur * 0.8), 1.2);
                const extractStart = bestSeg.start + (bestSeg.dur - extractDur) / 2;

                const fwd = path.join(tempDir, `${prefix}_amb_fwd.wav`);
                const rev = path.join(tempDir, `${prefix}_amb_rev.wav`);

                await execAsync(
                    `ffmpeg -y -ss ${extractStart.toFixed(3)} -t ${extractDur.toFixed(3)} -i "${filePath}" -ar ${sampleRate} -ac 1 -c:a pcm_s16le "${fwd}"`,
                    { timeout: 5000 }
                );
                // Safe 1-pass reverse on small slice (<1.2s, executes in ~2ms)
                await execAsync(
                    `ffmpeg -y -i "${fwd}" -af "areverse" -c:a pcm_s16le "${rev}"`,
                    { timeout: 5000 }
                );

                const ppList = path.join(tempDir, `${prefix}_pp_list.txt`);
                fs.writeFileSync(ppList, `file '${fwd.replace(/\\/g, "/")}'\nfile '${rev.replace(/\\/g, "/")}'\n`);
                await execAsync(
                    `ffmpeg -y -f concat -safe 0 -i "${ppList}" -c:a pcm_s16le "${bedPath}"`,
                    { timeout: 5000 }
                );

                console.log(`[scriptedStitcher] Extracted natural room tone for ${prefix} from ${path.basename(filePath)} (${extractDur.toFixed(2)}s)`);
                return bedPath;
            }
        } catch (err) {
            console.warn(`[scriptedStitcher] Ambient room tone scan warning for ${prefix}:`, err.message);
        }
    }

    // Fallback: Calibrated Ultra-clean 48kHz Studio Room Floor (~ -72 dBFS)
    console.log(`[scriptedStitcher] Using calibrated 48kHz studio room floor for ${prefix}`);
    await execAsync(
        `ffmpeg -y -f lavfi -i "anoisesrc=d=1.0:c=pink:r=${sampleRate}:a=0.00025,highpass=f=25,lowpass=f=18000" -c:a pcm_s16le "${bedPath}"`,
        { timeout: 5000 }
    );
    return bedPath;
}

/**
 * Generates room tone silence of arbitrary duration from the prepared speaker bed.
 * Uses stream_loop -1 with linear forward micro-fades: runs in <5ms with ZERO memory accumulation!
 */
/**
 * Generates continuous room tone silence of arbitrary duration from the prepared speaker bed.
 * Pure continuous acoustic streaming without zero-dip clamp fades (eliminating black spectrogram gaps).
 */
async function generateBedSilence(bedPath, outPath, durationSec) {
    const dur = Math.max(0.02, parseFloat(Number(durationSec).toFixed(3)));
    const cmd = `ffmpeg -y -stream_loop -1 -i "${bedPath}" -t ${dur} -c:a pcm_s16le "${outPath}"`;
    await execAsync(cmd, { timeout: 8000 });
}

/**
 * Normalizes speech turn audio to standard 48kHz mono 16-bit PCM cleanly without zero-dip clamp fades.
 * Executes linearly without memory buffering or reversing.
 */
async function normalizeSpeech(inPath, outPath, sampleRate = 48000) {
    await execAsync(
        `ffmpeg -y -i "${inPath}" -ar ${sampleRate} -ac 1 -c:a pcm_s16le "${outPath}"`,
        { timeout: 15000 }
    );
    return await getAudioDuration(outPath);
}

/**
 * Interleave and stitch a dual-speaker scripted conversation pair.
 * Track A (Speaker 1) has active audio during S1 turns and Speaker 1's room tone during pauses/S2 turns.
 * Track B (Speaker 2) has active audio during S2 turns and Speaker 2's room tone during pauses/S1 turns.
 * 
 * @param {Object} sub1 - ScriptedSubmission for Speaker 1
 * @param {Object} sub2 - ScriptedSubmission for Speaker 2
 */
export async function stitchScriptedPair(sub1, sub2) {
    const recordingsDir = path.join(process.cwd(), "recordings");
    if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });

    // Determine CallSession and callId upfront
    let callSession = null;
    let effectiveCallId = null;

    if (sub1.callSessionId) {
        callSession = await CallSession.findById(sub1.callSessionId);
        if (callSession) {
            effectiveCallId = callSession.callId;
        }
    }

    if (!effectiveCallId) {
        effectiveCallId = `scripted_${crypto.randomUUID()}`;
    }

    const tempDir = path.join(process.cwd(), "temp", effectiveCallId);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    try {
        const subtopic = await ScriptedSubtopic.findById(sub1.subtopicId).lean();
        const turnsCount = Math.max(
            sub1.verses?.length || 0,
            sub2.verses?.length || 0,
            subtopic?.dialogueTurns?.length || 0
        );

        if (turnsCount === 0) {
            throw new Error("No verses found to stitch for scripted pair");
        }

        const PAUSE_SEC = 0.4; // 400ms conversational pause between speaker turns
        const SAMPLE_RATE = 48000;

        // Look up speakers' roomSilenceFile profiles
        let roomSilenceA = null;
        let roomSilenceB = null;
        try {
            const [u1, u2] = await Promise.all([
                User.findById(sub1.userId).select("roomSilenceFile languageApplications").lean(),
                User.findById(sub2.userId).select("roomSilenceFile languageApplications").lean()
            ]);
            roomSilenceA = u1?.roomSilenceFile || u1?.languageApplications?.find(a => a.applicationType === 'scripted_call' && a.roomSilenceFile)?.roomSilenceFile || null;
            roomSilenceB = u2?.roomSilenceFile || u2?.languageApplications?.find(a => a.applicationType === 'scripted_call' && a.roomSilenceFile)?.roomSilenceFile || null;
        } catch (e) {
            console.warn("[scriptedStitcher] Could not lookup user roomSilenceFile:", e.message);
        }

        // Prepare speaker-tailored ambient room beds (verified room tone -> verse ambient -> studio floor)
        const bedA = await prepareSpeakerRoomBed(sub1.verses, "spk1", tempDir, SAMPLE_RATE, roomSilenceA);
        const bedB = await prepareSpeakerRoomBed(sub2.verses, "spk2", tempDir, SAMPLE_RATE, roomSilenceB);

        const trackAConcatList = [];
        const trackBConcatList = [];

        let totalDuration = 0;
        let totalAudioSecA = 0;
        let totalAudioSecB = 0;
        const segmentTimestamps = [];

        for (let i = 0; i < turnsCount; i++) {
            const v1 = (sub1.verses || []).find(v => v.turnIndex === i);
            const v2 = (sub2.verses || []).find(v => v.turnIndex === i);

            const v1File = v1 ? resolveVerseAudioPath(v1.audioPath) : null;
            const v2File = v2 ? resolveVerseAudioPath(v2.audioPath) : null;

            // 1. Process Speaker 1 Turn
            if (v1File && fs.existsSync(v1File)) {
                const s1NormFile = path.join(tempDir, `s1_turn_${i}.wav`);
                const dur1 = await normalizeSpeech(v1File, s1NormFile, SAMPLE_RATE);
                if (v1) v1.durationSec = dur1;
                totalAudioSecA += dur1;
                const s1StartTime = totalDuration;
                totalDuration += dur1;
                const s1EndTime = totalDuration;

                // Track A gets S1 speech + S1 natural ambient pause
                const s1PauseFile = path.join(tempDir, `s1_pause_${i}.wav`);
                await generateBedSilence(bedA, s1PauseFile, PAUSE_SEC);

                // Track B receives ONE continuous seamless stream of Speaker 2's room tone for (dur1 + PAUSE_SEC)
                const s2SilenceFile = path.join(tempDir, `s2_turn_silence_${i}.wav`);
                await generateBedSilence(bedB, s2SilenceFile, dur1 + PAUSE_SEC);

                trackAConcatList.push(s1NormFile);
                trackAConcatList.push(s1PauseFile);
                trackBConcatList.push(s2SilenceFile);

                segmentTimestamps.push({
                    turnIndex: i,
                    speaker: "Speaker 1",
                    userId: String(sub1.userId),
                    startSec: s1StartTime,
                    endSec: s1EndTime,
                    text: v1.text || subtopic?.dialogueTurns?.[i]?.speaker1 || ""
                });

                totalDuration += PAUSE_SEC;
            }

            // 2. Process Speaker 2 Turn
            if (v2File && fs.existsSync(v2File)) {
                const s2NormFile = path.join(tempDir, `s2_turn_${i}.wav`);
                const dur2 = await normalizeSpeech(v2File, s2NormFile, SAMPLE_RATE);
                if (v2) v2.durationSec = dur2;
                totalAudioSecB += dur2;
                const s2StartTime = totalDuration;
                totalDuration += dur2;
                const s2EndTime = totalDuration;

                // Track B gets S2 speech + S2 natural ambient pause
                const s2PauseFile = path.join(tempDir, `s2_pause_${i}.wav`);
                await generateBedSilence(bedB, s2PauseFile, PAUSE_SEC);

                // Track A receives ONE continuous seamless stream of Speaker 1's room tone for (dur2 + PAUSE_SEC)
                const s1SilenceFile = path.join(tempDir, `s1_turn_silence_${i}.wav`);
                await generateBedSilence(bedA, s1SilenceFile, dur2 + PAUSE_SEC);

                trackAConcatList.push(s1SilenceFile);
                trackBConcatList.push(s2NormFile);
                trackBConcatList.push(s2PauseFile);

                segmentTimestamps.push({
                    turnIndex: i,
                    speaker: "Speaker 2",
                    userId: String(sub2.userId),
                    startSec: s2StartTime,
                    endSec: s2EndTime,
                    text: v2.text || subtopic?.dialogueTurns?.[i]?.speaker2 || ""
                });

                totalDuration += PAUSE_SEC;
            }
        }

        // Write concat lists for ffmpeg
        const listAPath = path.join(tempDir, "list_a.txt");
        const listBPath = path.join(tempDir, "list_b.txt");

        fs.writeFileSync(listAPath, trackAConcatList.map(f => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
        fs.writeFileSync(listBPath, trackBConcatList.map(f => `file '${f.replace(/\\/g, "/")}'`).join("\n"));

        const outTrackA = path.join(recordingsDir, `${effectiveCallId}_A.wav`);
        const outTrackB = path.join(recordingsDir, `${effectiveCallId}_B.wav`);
        const outMixedStereo = path.join(recordingsDir, `${effectiveCallId}_stereo.wav`);

        // Concatenate Track A
        await execAsync(`ffmpeg -y -f concat -safe 0 -i "${listAPath}" -c:a pcm_s16le "${outTrackA}"`, { timeout: 30000 });

        // Concatenate Track B
        await execAsync(`ffmpeg -y -f concat -safe 0 -i "${listBPath}" -c:a pcm_s16le "${outTrackB}"`, { timeout: 30000 });

        // Create Mixed Dual-Channel Stereo Audio (Left = Track A, Right = Track B)
        await execAsync(
            `ffmpeg -y -i "${outTrackA}" -i "${outTrackB}" -filter_complex "[0:a][1:a]join=inputs=2:channel_layout=stereo[a]" -map "[a]" -c:a pcm_s16le "${outMixedStereo}"`,
            { timeout: 30000 }
        );

        const durationMinutesA = Math.max(0.01, +(totalAudioSecA / 60).toFixed(2));
        const durationMinutesB = Math.max(0.01, +(totalAudioSecB / 60).toFixed(2));

        const langCode = String(sub1.language || "english").toLowerCase().trim();
        const [sLang, lang] = await Promise.all([
            ScriptedLanguage.findOne({ code: langCode }).select("hourlyPayout").lean(),
            Language.findOne({ code: langCode }).select("hourlyPayout").lean()
        ]);
        const hourlyRate = (sLang && Number(sLang.hourlyPayout) > 0) ? Number(sLang.hourlyPayout) : (Number(lang?.hourlyPayout) || 0);

        let hourlyRateA = hourlyRate;
        let hourlyRateB = hourlyRate;

        const [userA, userB] = await Promise.all([
            User.findById(sub1.userId).select("vendorId projectPayrates perCallPayrate isQA").lean(),
            User.findById(sub2.userId).select("vendorId projectPayrates perCallPayrate isQA").lean()
        ]);

        if (userA?.vendorId && !userA?.isQA) {
            const resA = getArtistRateForProject(userA, "scripted_call", langCode, langCode, hourlyRate);
            if (resA.isProjectConfigured || Number(userA.perCallPayrate) > 0) hourlyRateA = resA.artistRate;
        }
        if (userB?.vendorId && !userB?.isQA) {
            const resB = getArtistRateForProject(userB, "scripted_call", langCode, langCode, hourlyRate);
            if (resB.isProjectConfigured || Number(userB.perCallPayrate) > 0) hourlyRateB = resB.artistRate;
        }

        const payoutUsdA = Math.round(((hourlyRateA * durationMinutesA) / 60) * 100) / 100;
        const payoutUsdB = Math.round(((hourlyRateB * durationMinutesB) / 60) * 100) / 100;

        const now = new Date();

        if (!callSession) {
            callSession = new CallSession({
                callId: effectiveCallId,
                userA: sub1.userId,
                userB: sub2.userId,
                topicId: sub1.topicId,
                subtopicId: sub1.subtopicId,
                language: sub1.language || "english",
                startedAt: sub1.createdAt || now,
                endedAt: now,
                actualCallStartedAt: sub1.createdAt || now,
                actualCallDuration: Math.round(totalDuration),
                recordingAFile: `${effectiveCallId}_A.wav`,
                recordingAStartedAt: sub1.createdAt || now,
                recordingBFile: `${effectiveCallId}_B.wav`,
                recordingBStartedAt: sub2.createdAt || now,
                mixedRecordingFile: `${effectiveCallId}_stereo.wav`,
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
            if (!callSession.callStatus) callSession.callStatus = "pending";
            if (!callSession.recordingAStatus) callSession.recordingAStatus = "pending";
            if (!callSession.recordingBStatus) callSession.recordingBStatus = "pending";
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

        console.log(`[scriptedStitcher] Successfully stitched pair into CallSession ${effectiveCallId} (${totalDuration.toFixed(1)}s)`);
        return callSession;
    } catch (err) {
        console.error(`[scriptedStitcher] Error stitching scripted pair:`, err);
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (_) {}
        throw err;
    }
}

/**
 * Re-stitch an existing scripted CallSession from its submissions.
 * Updates Track A, Track B, and the stereo mixed file on disk with the current verse audios (including any trimmed verses).
 * 
 * @param {string} callId - The callId or _id of the CallSession
 */
export async function restitchScriptedCall(callId) {
    if (!callId) throw new Error("callId is required to restitch scripted call");
    
    let call = null;
    if (mongoose.Types.ObjectId.isValid(callId)) {
        call = await CallSession.findById(callId);
    }
    if (!call) {
        call = await CallSession.findOne({ callId });
    }
    if (!call) {
        throw new Error(`CallSession not found for callId: ${callId}`);
    }

    // Find submissions for speaker 1 and speaker 2
    let [sub1, sub2] = await Promise.all([
        ScriptedSubmission.findOne({ callSessionId: call._id, role: "speaker1" }),
        ScriptedSubmission.findOne({ callSessionId: call._id, role: "speaker2" })
    ]);

    if (!sub1 || !sub2) {
        const subtopicId = call.subtopicId;
        if (subtopicId) {
            if (!sub1 && call.userA) {
                sub1 = await ScriptedSubmission.findOne({
                    subtopicId,
                    userId: call.userA._id || call.userA,
                    status: { $ne: "cancelled" }
                });
            }
            if (!sub2 && call.userB) {
                sub2 = await ScriptedSubmission.findOne({
                    subtopicId,
                    userId: call.userB._id || call.userB,
                    status: { $ne: "cancelled" }
                });
            }
        }
    }

    if (!sub1 || !sub2) {
        throw new Error(`Cannot restitch: missing speaker submission(s) for call ${call.callId}`);
    }

    sub1.callSessionId = call._id;
    sub2.callSessionId = call._id;

    const updatedCall = await stitchScriptedPair(sub1, sub2);
    return {
        success: true,
        callId: updatedCall.callId,
        mixedRecordingFile: updatedCall.mixedRecordingFile,
        duration: updatedCall.actualCallDuration
    };
}
