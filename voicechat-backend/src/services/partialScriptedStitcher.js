import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { CallSession } from "../models/CallSession.js";
import { ScriptedSubmission } from "../models/ScriptedSubmission.js";
import { ScriptedSubtopic } from "../models/ScriptedSubtopic.js";
import { User } from "../models/User.js";
import { s3Client, BUCKET_NAME } from "../config/s3.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { pipeline } from "stream/promises";

const execAsync = promisify(exec);

// Helper to robustly locate audio on disk
function resolveVerseAudioPath(rawPath) {
    if (!rawPath) return null;
    const cleanRaw = String(rawPath).replace(/^local:/, "").trim();
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
        path.join(cwd, "voicechat-backend", cleanRaw),
        path.join(cwd, "voicechat-backend", "uploads", "scripted_temp", base),
        path.join(cwd, "voicechat-backend", "uploads", base),
        path.join(cwd, "voicechat-backend", "recordings", base)
    ];
    return candidates.find(c => fs.existsSync(c) && fs.statSync(c).isFile()) || null;
}

// Download verse from S3 if needed
async function ensureVerseLocal(rawPath, tempDir) {
    const local = resolveVerseAudioPath(rawPath);
    if (local) return local;

    if (!BUCKET_NAME) return null;
    const base = path.basename(String(rawPath).replace(/^local:/, "").trim());
    const destPath = path.join(tempDir, `s3_${base}`);
    try {
        const s3Doc = await s3Client.send(new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: base
        }));
        await pipeline(s3Doc.Body, fs.createWriteStream(destPath));
        return destPath;
    } catch {
        return null;
    }
}

// Helper to get audio duration via ffprobe
async function getAudioDuration(filePath) {
    try {
        const { stdout } = await execAsync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
            { timeout: 8000 }
        );
        const dur = parseFloat(stdout.trim());
        return isNaN(dur) || dur <= 0 ? 1.0 : dur;
    } catch {
        return 1.0;
    }
}

/**
 * Stitches all recorded verses of a partial scripted call sequentially
 * without any pauses or gaps for the missing partner.
 * 
 * @param {string} callId - CallSession callId
 * @param {boolean} forceRecompile - Force re-stitching even if already cached
 * @returns {Promise<{ filePath: string, durationSec: number, role: string, speakerName: string, subtopicTitle: string }>}
 */
export async function compilePartialScriptedCall(callId, forceRecompile = false) {
    const call = await CallSession.findOne({ callId })
        .populate("userA", "firstname lastname username")
        .populate("userB", "firstname lastname username")
        .populate("subtopicId", "title")
        .lean();

    if (!call) {
        throw new Error(`Call not found: ${callId}`);
    }

    // Determine which speaker recorded
    let recordedRole = null;
    let recordedUserId = null;
    let speakerUser = null;

    if (call.userA && (!call.userB || call.recordingBStatus === "not_recorded")) {
        recordedRole = "speaker1";
        recordedUserId = call.userA._id || call.userA;
        speakerUser = call.userA;
    } else if (call.userB && (!call.userA || call.recordingAStatus === "not_recorded")) {
        recordedRole = "speaker2";
        recordedUserId = call.userB._id || call.userB;
        speakerUser = call.userB;
    } else if (call.userA) {
        recordedRole = "speaker1";
        recordedUserId = call.userA._id || call.userA;
        speakerUser = call.userA;
    } else if (call.userB) {
        recordedRole = "speaker2";
        recordedUserId = call.userB._id || call.userB;
        speakerUser = call.userB;
    }

    if (!recordedRole || !recordedUserId) {
        throw new Error("No recorded speaker found on this call session.");
    }

    const recordingsDir = path.join(process.cwd(), "recordings");
    if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });

    const outWavPath = path.join(recordingsDir, `${call.callId}_partial_${recordedRole}.wav`);

    if (!forceRecompile && fs.existsSync(outWavPath)) {
        const durationSec = await getAudioDuration(outWavPath);
        return {
            filePath: outWavPath,
            durationSec,
            role: recordedRole,
            speakerName: `${speakerUser?.firstname || ""} ${speakerUser?.lastname || ""}`.trim() || speakerUser?.username || recordedRole,
            subtopicTitle: call.subtopicId?.title || "Scripted Scenario"
        };
    }

    // Find submission for recorded speaker
    let sub = await ScriptedSubmission.findOne({
        callSessionId: call._id,
        role: recordedRole
    }).lean();

    if (!sub) {
        sub = await ScriptedSubmission.findOne({
            subtopicId: call.subtopicId?._id || call.subtopicId,
            userId: recordedUserId,
            status: { $ne: "cancelled" }
        }).sort({ createdAt: -1 }).lean();
    }

    if (!sub || !Array.isArray(sub.verses) || sub.verses.length === 0) {
        throw new Error(`No recorded audio verses found for ${recordedRole} on this call.`);
    }

    // Sort verses by turnIndex
    const sortedVerses = sub.verses
        .filter(v => v.audioPath)
        .sort((a, b) => Number(a.turnIndex) - Number(b.turnIndex));

    if (sortedVerses.length === 0) {
        throw new Error(`No valid audio files found in submission for ${recordedRole}.`);
    }

    const tempDir = path.join(process.cwd(), "temp", `${call.callId}_partial`);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    try {
        const concatList = [];
        const PAUSE_SEC = 0.35; // clean brief pause between contributor's own verses

        for (let i = 0; i < sortedVerses.length; i++) {
            const v = sortedVerses[i];
            const localFile = await ensureVerseLocal(v.audioPath, tempDir);
            if (!localFile) {
                console.warn(`[partialScriptedStitcher] Could not locate file for verse ${v.turnIndex}: ${v.audioPath}`);
                continue;
            }

            // Normalize verse to 48kHz mono 16-bit PCM WAV
            const normPath = path.join(tempDir, `v_norm_${i}.wav`);
            await execAsync(
                `ffmpeg -y -i "${localFile}" -ar 48000 -ac 1 -c:a pcm_s16le "${normPath}"`,
                { timeout: 15000 }
            );
            concatList.push(normPath);

            // Add brief natural micro-pause between verses (skip after last verse)
            if (i < sortedVerses.length - 1) {
                const pausePath = path.join(tempDir, `pause_${i}.wav`);
                await execAsync(
                    `ffmpeg -y -f lavfi -i anullsrc=r=48000:cl=mono -t ${PAUSE_SEC} -c:a pcm_s16le "${pausePath}"`,
                    { timeout: 8000 }
                );
                concatList.push(pausePath);
            }
        }

        if (concatList.length === 0) {
            throw new Error("Failed to process any verse audio files for partial call.");
        }

        // Concat list for ffmpeg
        const listPath = path.join(tempDir, "concat_list.txt");
        fs.writeFileSync(listPath, concatList.map(f => `file '${f.replace(/\\/g, "/")}'`).join("\n"));

        // Concat without gap into final WAV
        await execAsync(
            `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${outWavPath}"`,
            { timeout: 30000 }
        );

        const durationSec = await getAudioDuration(outWavPath);

        return {
            filePath: outWavPath,
            durationSec,
            role: recordedRole,
            speakerName: `${speakerUser?.firstname || ""} ${speakerUser?.lastname || ""}`.trim() || speakerUser?.username || recordedRole,
            subtopicTitle: call.subtopicId?.title || "Scripted Scenario"
        };
    } finally {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (_) {}
    }
}
