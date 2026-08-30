import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import { Topic } from "../models/Topic.js";
import { Subtopic } from "../models/Subtopic.js";
import { ScriptedTopic } from "../models/ScriptedTopic.js";
import { ScriptedSubtopic } from "../models/ScriptedSubtopic.js";
import { ScriptedSubmission } from "../models/ScriptedSubmission.js";
import { CallSession } from "../models/CallSession.js";
import { Feedback } from "../models/Feedback.js";
import { User } from "../models/User.js";
import { Language } from "../models/Language.js";
import { ScriptedLanguage } from "../models/ScriptedLanguage.js";
import { PayoutPayment } from "../models/PayoutPayment.js";
import { isAdmin } from "../middleware/isAdmin.js";
import { isAdminOrQA } from "../middleware/isQA.js";
import { requireAuth } from "../auth.js";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { Phrase } from "../models/Phrase.js";
import { PhraseRejection } from "../models/PhraseRejection.js";
import { Ambiguity } from "../models/Ambiguity.js";
import { QaFlag } from "../models/QaFlag.js";
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

const transcriptionCallSchema = new mongoose.Schema(
  {
    call_id: { type: String, required: true, unique: true, index: true },
    Segmentation_Done: { type: Boolean, default: false, index: true },
    segmentation_qa: { type: Boolean, default: false, index: true },
    segmentation_qa_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    segmentation_qa_notes: { type: String, default: null },
    segmented_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    initial_submitted_segments: { type: Array, default: [] },
    qa_changes_count: { type: Number, default: 0 },
    qa_penalty_percentage: { type: Number, default: 0 },
    qa_payout_percentage: { type: Number, default: 100 },
    ready_for_transcription: { type: Boolean, default: false, index: true },
    transcription_status: { type: String, enum: ['PENDING_TRANSCRIPTION', 'IN_TRANSCRIPTION', 'TRANSCRIPTION_COMPLETED', 'QA_APPROVED'], default: 'PENDING_TRANSCRIPTION' },
    audio1Name: { type: String, default: '' },
    audio2Name: { type: String, default: '' },
    total_segments: { type: Number, default: 0 },
    transcribed_segments_count: { type: Number, default: 0 },
    qa_verified_segments_count: { type: Number, default: 0 },
    asr_status: { type: String, enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'], default: 'PENDING' },
    asr_error: { type: String, default: null },
    asr_completed_at: { type: Date, default: null }
  },
  { timestamps: true }
);

const TranscriptionCall = mongoose.models.TranscriptionCall || mongoose.model('TranscriptionCall', transcriptionCallSchema);

const wordSchema = new mongoose.Schema(
  {
    word: { type: String, required: true },
    start: { type: Number, required: true },
    end: { type: Number, required: true },
    start_ms: { type: Number },
    end_ms: { type: Number },
  },
  { _id: false }
);

const transcriptionSegmentSchema = new mongoose.Schema(
  {
    call_id: { type: String, required: true, index: true },
    segment_id: { type: String, required: true },
    call_id_segment_id: { type: String, required: true, unique: true, index: true },
    speaker: { type: String, default: 'speaker1' },
    start_sec: { type: Number, required: true },
    end_sec: { type: Number, required: true },
    start_ms: { type: Number, required: true },
    end_ms: { type: Number, required: true },
    duration_sec: { type: Number },
    duration_ms: { type: Number },
    segment_text: { type: String, default: '' },
    words: [wordSchema],
    tier1_text_verified: { type: Boolean, default: false },
    tier2_timestamps_verified: { type: Boolean, default: false },
    IsTranscribed: { type: Boolean, default: false, index: true },
    QAVerified: { type: Boolean, default: false, index: true },
    tier1_verified_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    tier2_verified_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    qa_verified_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    qa_notes: { type: String, default: null },
  },
  { timestamps: true }
);

const TranscriptionSegment = mongoose.models.TranscriptionSegment || mongoose.model('TranscriptionSegment', transcriptionSegmentSchema);

async function syncToSegmentationPipeline(call) {
  if (call && call.callStatus === 'approved') {
    try {
      await TranscriptionCall.findOneAndUpdate(
        { call_id: call.callId },
        {
          $set: {
            call_id: call.callId,
            audio1Name: call.recordingAFile || '',
            audio2Name: call.recordingBFile || '',
          },
          $setOnInsert: {
            Segmentation_Done: false,
            segmentation_qa: false,
            total_segments: 0,
            asr_status: 'PENDING'
          }
        },
        { upsert: true, new: true }
      );
      console.log(`[Segmentation Pipeline] Auto-registered QA Approved call: ${call.callId}`);
    } catch (err) {
      console.error('[Segmentation Pipeline Sync Error]:', err.message);
    }
  }
}

// Stream Speaker 1, Speaker 2 & Stereo Mixed audio for Admin/QA Reviews
router.get("/qa/calls/:callId/recording/:speaker", async (req, res) => {
  try {
    const { callId, speaker } = req.params;
    const call = await CallSession.findOne({ callId });
    if (!call) return res.status(404).json({ error: "Call not found" });

    const userAStr = (call.userA?._id || call.userA || "").toString();
    const userBStr = (call.userB?._id || call.userB || "").toString();
    const speakerStr = String(speaker).trim();

    let key;
    if (speakerStr === "mixed" || speakerStr === "stereo" || speakerStr === "combined") {
      key = call.mixedRecordingFile || call.recordingAFile;
    } else if (speakerStr === "speaker1" || speakerStr === "userA" || speakerStr === "A" || speakerStr === userAStr) {
      key = call.recordingAFile;
    } else if (speakerStr === "speaker2" || speakerStr === "userB" || speakerStr === "B" || speakerStr === userBStr) {
      key = call.recordingBFile;
    } else {
      key = call.recordingAFile || call.recordingBFile;
    }

    if (!key) return res.status(404).json({ error: "Recording file not found" });

    const cleanKey = key.replace(/^local:/, "");
    const baseName = path.basename(cleanKey);
    const possiblePaths = [
      path.join(process.cwd(), "recordings", baseName),
      path.join(process.cwd(), "recordings", cleanKey),
      path.join(process.cwd(), "recordings", "calls", baseName),
      path.join(process.cwd(), "uploads", baseName),
      path.join(process.cwd(), "uploads", "scripted_temp", baseName),
      path.join(process.cwd(), "temp_extracted", callId, baseName),
      path.join(process.cwd(), "temp_extracted", callId, `call_${callId}`, baseName),
      path.resolve(cleanKey)
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        const ext = path.extname(p).toLowerCase();
        const mimeType = ext === ".flac" ? "audio/flac" : ext === ".wav" ? "audio/wav" : ext === ".ogg" ? "audio/ogg" : "audio/webm";
        const stat = fs.statSync(p);
        const total = stat.size;

        if (req.headers.range) {
          const parts = req.headers.range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
          const chunksize = end - start + 1;
          const fileStream = fs.createReadStream(p, { start, end });
          res.writeHead(206, {
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Accept-Ranges": "bytes",
            "Content-Length": chunksize,
            "Content-Type": mimeType
          });
          return fileStream.pipe(res);
        } else {
          res.writeHead(200, {
            "Content-Length": total,
            "Content-Type": mimeType,
            "Accept-Ranges": "bytes"
          });
          return fs.createReadStream(p).pipe(res);
        }
      }
    }

    // Try S3 if not found locally
    try {
      const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: cleanKey });
      const response = await s3Client.send(command);
      const s3Ext = path.extname(cleanKey).toLowerCase();
      const s3Mime = s3Ext === ".flac" ? "audio/flac" : s3Ext === ".wav" ? "audio/wav" : (response.ContentType || "audio/flac");
      res.setHeader("Content-Type", s3Mime);
      if (response.ContentLength) res.setHeader("Content-Length", response.ContentLength);
      return response.Body.pipe(res);
    } catch (s3Err) {
      const testFallback = path.join(process.cwd(), "recordings", "test.wav");
      if (fs.existsSync(testFallback)) {
        res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": fs.statSync(testFallback).size });
        return fs.createReadStream(testFallback).pipe(res);
      }
      return res.status(404).json({ error: "Audio file not found in S3 or local storage" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/qa/segmentation-calls: List QA Approved calls in segmentation pipeline with tab filtering
router.get("/qa/segmentation-calls", requireAuth(JWT_SECRET), async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const tab = req.query.tab || 'pending'; // pending, approved, rejected, logs, all
    const search = (req.query.search || '').trim();

    // Fetch only calls explicitly sent for segmentation/transcription by Admin
    let callSessionQuery = {
      $or: [
        { transcribedAsCall: true },
        { isApprovedForTranscription: true },
        { isSentToSegmentation: true }
      ]
    };
    if (search) {
      callSessionQuery = {
        $and: [
          callSessionQuery,
          { callId: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const approvedCalls = await CallSession.find(callSessionQuery)
      .populate("userA", "username speaker_id email")
      .populate("userB", "username speaker_id email")
      .populate("topicId", "title")
      .sort({ updatedAt: -1 })
      .lean();

    const callIds = approvedCalls.map(c => c.callId);
    const tCalls = await TranscriptionCall.find({ call_id: { $in: callIds } })
      .populate("segmented_by", "username email firstname lastname")
      .populate("segmentation_qa_by", "username email firstname lastname")
      .lean();

    const tCallMap = new Map(tCalls.map(t => [t.call_id, t]));

    let results = approvedCalls.map(c => {
      const t = tCallMap.get(c.callId) || {};
      const isDone = Boolean(t.Segmentation_Done);
      const isApproved = Boolean(t.segmentation_qa);
      const isRejected = Boolean(t.segmentation_rejected || (!t.segmentation_qa && t.segmentation_qa_by));
      const isReviewed = Boolean(t.segmentation_qa_by || isApproved || isRejected);

      return {
        ...c,
        transcriptionCall: t,
        Segmentation_Done: isDone,
        segmentation_qa: isApproved,
        segmentation_rejected: isRejected,
        segmentation_qa_by: t.segmentation_qa_by || null,
        segmentation_qa_notes: t.segmentation_qa_notes || '',
        segmentation_qa_at: t.segmentation_qa_at || t.updatedAt,
        segmented_by: t.segmented_by || null,
        total_segments: t.total_segments || 0,
        qa_changes_count: t.qa_changes_count || 0,
        qa_penalty_percentage: t.qa_penalty_percentage || 0,
        qa_payout_percentage: t.qa_payout_percentage !== undefined ? t.qa_payout_percentage : 100,
        asr_status: t.asr_status || 'PENDING',
        isDone,
        isApproved,
        isRejected,
        isReviewed
      };
    });

    // Apply Tab Filtering
    if (tab === 'pending') {
      // Pending QA Review: Segmented by user, but not yet approved or rejected
      results = results.filter(r => r.isDone && !r.isApproved && !r.isRejected);
    } else if (tab === 'approved') {
      // QA Approved
      results = results.filter(r => r.isApproved);
    } else if (tab === 'rejected') {
      // QA Rejected
      results = results.filter(r => r.isRejected);
    } else if (tab === 'logs') {
      // Segmentation Logs: All reviewed segmentations sorted by review timestamp
      results = results.filter(r => r.isReviewed);
      results.sort((a, b) => new Date(b.segmentation_qa_at || b.updatedAt) - new Date(a.segmentation_qa_at || a.updatedAt));
    } else if (tab === 'all') {
      // All segmentation calls
      // no filter
    }

    const total = results.length;
    const paginated = results.slice((page - 1) * limit, page * limit);

    res.json({
      calls: paginated,
      page,
      pages: Math.ceil(total / limit) || 1,
      total,
      tab
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/qa/next-unsegmented-call: Returns the latest QA approved call that needs segmentation
router.get("/qa/next-unsegmented-call", async (req, res) => {
  try {
    const approvedCalls = await CallSession.find({ callStatus: "approved" })
      .populate("userA", "username speaker_id email")
      .populate("userB", "username speaker_id email")
      .populate("topicId", "title")
      .sort({ updatedAt: -1 })
      .lean();

    if (!approvedCalls || approvedCalls.length === 0) {
      return res.json({ hasUnsegmentedCall: false });
    }

    const callIds = approvedCalls.map(c => c.callId);
    const completedTCalls = await TranscriptionCall.find({ call_id: { $in: callIds }, Segmentation_Done: true }).lean();
    const completedSet = new Set(completedTCalls.map(t => t.call_id));

    const targetCall = approvedCalls.find(c => !completedSet.has(c.callId));
    if (!targetCall) {
      return res.json({ hasUnsegmentedCall: false });
    }

    const spk1 = targetCall.userA?.speaker_id || targetCall.userA?.username || 'Speaker 1';
    const spk2 = targetCall.userB?.speaker_id || targetCall.userB?.username || 'Speaker 2';

    res.json({
      hasUnsegmentedCall: true,
      call_id: targetCall.callId,
      audio1Url: `http://localhost:3001/api/admin/qa/calls/${encodeURIComponent(targetCall.callId)}/recording/speaker1`,
      audio2Url: `http://localhost:3001/api/admin/qa/calls/${encodeURIComponent(targetCall.callId)}/recording/speaker2`,
      audio1Name: targetCall.recordingAFile || `${spk1}.wav`,
      audio2Name: targetCall.recordingBFile || `${spk2}.wav`,
      meta1Name: `${spk1}_metadata.json`,
      meta2Name: `${spk2}_metadata.json`,
      meta1Data: JSON.stringify({ speaker_id: spk1, role: 'Speaker 1', email: targetCall.userA?.email || '' }, null, 2),
      meta2Data: JSON.stringify({ speaker_id: spk2, role: 'Speaker 2', email: targetCall.userB?.email || '' }, null, 2)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/qa/calls/:callId/segments: Fetch all segments of a call for QA Review
router.get("/qa/calls/:callId/segments", requireAuth(JWT_SECRET), async (req, res) => {
  try {
    const { callId } = req.params;
    const callSession = await CallSession.findOne({ callId })
      .populate("userA", "username speaker_id email")
      .populate("userB", "username speaker_id email")
      .populate("topicId", "title")
      .lean();

    const tCall = await TranscriptionCall.findOne({ call_id: callId }).lean();
    const segments = await TranscriptionSegment.find({ call_id: callId })
      .sort({ start_ms: 1, start_sec: 1 })
      .lean();

    res.json({
      callId,
      callSession,
      transcriptionCall: tCall,
      total_segments: segments.length,
      segments,
      audio1Url: `http://localhost:3001/api/admin/qa/calls/${encodeURIComponent(callId)}/recording/speaker1`,
      audio2Url: `http://localhost:3001/api/admin/qa/calls/${encodeURIComponent(callId)}/recording/speaker2`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function calculateSegmentationChanges(original = [], current = []) {
  if (!original || original.length === 0) return 0;
  if (!current || current.length === 0) return original.length;

  let changes = 0;
  const matchedCurrent = new Set();

  for (const orig of original) {
    const origStart = orig.start_sec !== undefined ? Number(orig.start_sec) : (orig.start_ms ? orig.start_ms / 1000 : (Number(orig.start) || 0));
    const origEnd = orig.end_sec !== undefined ? Number(orig.end_sec) : (orig.end_ms ? orig.end_ms / 1000 : (Number(orig.end) || 0));
    const origSpk = String(orig.speaker || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    const matchIdx = current.findIndex((c, idx) => {
      if (matchedCurrent.has(idx)) return false;
      if (c.segment_id && orig.segment_id && c.segment_id === orig.segment_id) return true;
      const cStart = c.start_sec !== undefined ? Number(c.start_sec) : (c.start_ms ? c.start_ms / 1000 : (Number(c.start) || 0));
      const cEnd = c.end_sec !== undefined ? Number(c.end_sec) : (c.end_ms ? c.end_ms / 1000 : (Number(c.end) || 0));
      return Math.abs(cStart - origStart) <= 1.0 && Math.abs(cEnd - origEnd) <= 1.0;
    });

    if (matchIdx === -1) {
      // Original segment was deleted -> 1 change
      changes++;
    } else {
      matchedCurrent.add(matchIdx);
      const curr = current[matchIdx];
      const cStart = curr.start_sec !== undefined ? Number(curr.start_sec) : (curr.start_ms ? curr.start_ms / 1000 : (Number(curr.start) || 0));
      const cEnd = curr.end_sec !== undefined ? Number(curr.end_sec) : (curr.end_ms ? curr.end_ms / 1000 : (Number(curr.end) || 0));
      const currSpk = String(curr.speaker || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      // Check if start/end shifted by > 150ms or speaker changed
      const startDiff = Math.abs(cStart - origStart);
      const endDiff = Math.abs(cEnd - origEnd);
      const spkDiff = origSpk !== currSpk && (origSpk && currSpk);

      if (startDiff > 0.15 || endDiff > 0.15 || spkDiff) {
        changes++;
      }
    }
  }

  // Any unmatched new segments were added by QA -> 1 change each
  const addedCount = current.length - matchedCurrent.size;
  if (addedCount > 0) {
    changes += addedCount;
  }

  return changes;
}

// POST /api/admin/qa/calls/:callId/segmentation-qa: QA approve or reject segmentation & calculate pay cuts
router.post("/qa/calls/:callId/segmentation-qa", requireAuth(JWT_SECRET), async (req, res) => {
  try {
    const { callId } = req.params;
    const { status, notes, changes_count } = req.body || {};
    const isApproved = status === 'approved' || status === true;

    // Fetch existing call and segments
    const existingCall = await TranscriptionCall.findOne({ call_id: callId });
    const currentSegments = await TranscriptionSegment.find({ call_id: callId }).lean();

    let computedChanges = 0;
    if (changes_count !== undefined && changes_count !== null) {
      computedChanges = Math.max(0, parseInt(changes_count, 10) || 0);
    } else if (existingCall && existingCall.initial_submitted_segments && existingCall.initial_submitted_segments.length > 0) {
      computedChanges = calculateSegmentationChanges(existingCall.initial_submitted_segments, currentSegments);
    }

    // 1 change = 10% pay cut, 2 changes = 20%, ..., 10 changes = 100% pay cut
    const penaltyPercentage = Math.min(100, computedChanges * 10);
    const payoutPercentage = Math.max(0, 100 - penaltyPercentage);

    const tCall = await TranscriptionCall.findOneAndUpdate(
      { call_id: callId },
      {
        $set: {
          segmentation_qa: isApproved,
          segmentation_rejected: !isApproved,
          segmentation_qa_at: new Date(),
          segmentation_qa_by: req.user?._id,
          segmentation_qa_notes: notes || '',
          qa_changes_count: computedChanges,
          qa_penalty_percentage: penaltyPercentage,
          qa_payout_percentage: payoutPercentage,
          ready_for_transcription: isApproved,
          transcription_status: isApproved ? 'PENDING_TRANSCRIPTION' : 'PENDING',
        }
      },
      { new: true }
    );

    if (isApproved) {
      await TranscriptionSegment.updateMany(
        { call_id: callId },
        { $set: { QAVerified: true, qa_verified_by: req.user?._id, qa_notes: notes || '' } }
      );

      // Route into segment-wise transcription pipeline in CallSession
      await CallSession.updateOne(
        { callId },
        {
          $set: {
            ready_for_transcription: true,
            segmentation_qa_approved_at: new Date(),
          }
        }
      );
    }

    res.json({
      success: true,
      transcriptionCall: tCall,
      status: isApproved ? 'approved' : 'rejected',
      qa_changes_count: computedChanges,
      qa_penalty_percentage: penaltyPercentage,
      qa_payout_percentage: payoutPercentage,
      ready_for_transcription: isApproved,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function syncSegmentsFromDisk(callId) {
  try {
    const existingCount = await TranscriptionSegment.countDocuments({ call_id: callId });
    if (existingCount > 0) {
      return; // Already synced, instant return
    }

    const possiblePaths = [
      path.resolve(process.cwd(), '../DataCatalyst_Labels-main/backend/uploads/segmentations', `call_${callId}`, `${callId}_segmentation_labels.json`),
      path.resolve(process.cwd(), 'DataCatalyst_Labels-main/backend/uploads/segmentations', `call_${callId}`, `${callId}_segmentation_labels.json`),
      path.resolve('c:/Users/manoj/OneDrive/Desktop/DC App n Website/DC Website/DataCatalyst_Labels-main/backend/uploads/segmentations', `call_${callId}`, `${callId}_segmentation_labels.json`),
    ];

    let foundData = null;
    for (const p of possiblePaths) {
      try {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, 'utf-8');
          foundData = JSON.parse(raw);
          if (foundData && foundData.segments && foundData.segments.length > 0) {
            break;
          }
        }
      } catch (e) {}
    }

    if (foundData && foundData.segments && foundData.segments.length > 0) {
      const docs = foundData.segments.map((seg, idx) => {
        const segId = String(seg.segment_id || `seg_${String(idx + 1).padStart(3, '0')}`);
        const callSegId = seg.call_id_segment_id || `${callId}_${segId}`;
        const startSec = Number(seg.start_sec) || 0;
        const endSec = Number(seg.end_sec) || 0;
        const startMs = Number(seg.start_ms) || Math.round(startSec * 1000);
        const endMs = Number(seg.end_ms) || Math.round(endSec * 1000);

        return {
          call_id: callId,
          segment_id: segId,
          call_id_segment_id: callSegId,
          speaker: seg.speaker || 'speaker1',
          start_sec: startSec,
          end_sec: endSec,
          start_ms: startMs,
          end_ms: endMs,
          duration_sec: Number(seg.duration_sec) || (endSec - startSec),
          duration_ms: Number(seg.duration_ms) || (endMs - startMs),
          segment_text: seg.segment_text || '',
          words: (seg.words || []).map(w => ({
            word: String(w.word || w.text || ''),
            start: Number(w.start) || 0,
            end: Number(w.end) || 0,
            start_ms: Number(w.start_ms) || Math.round((Number(w.start) || 0) * 1000),
            end_ms: Number(w.end_ms) || Math.round((Number(w.end) || 0) * 1000),
          })),
          tier1_text_verified: Boolean(seg.tier1_text_verified || seg.segment_text),
          tier2_timestamps_verified: Boolean(seg.tier2_timestamps_verified || (seg.words && seg.words.length > 0)),
          IsTranscribed: Boolean(seg.IsTranscribed || seg.segment_text),
          QAVerified: false,
        };
      });

      await TranscriptionSegment.deleteMany({ call_id: callId });
      await TranscriptionSegment.insertMany(docs, { ordered: false });

      await TranscriptionCall.findOneAndUpdate(
        { call_id: callId },
        {
          $set: {
            total_segments: foundData.segments.length,
            audio1Name: foundData.audio1_name || '',
            audio2Name: foundData.audio2_name || '',
            Segmentation_Done: true
          }
        },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error('syncSegmentsFromDisk error:', err);
  }
}

// POST /api/admin/qa/calls/:callId/transcription/reset-qa: Unreview/reset all segments for call
router.post("/qa/calls/:callId/transcription/reset-qa", requireAuth(JWT_SECRET), async (req, res) => {
  try {
    const { callId } = req.params;
    await syncSegmentsFromDisk(callId);

    const resSeg = await TranscriptionSegment.updateMany(
      { call_id: callId },
      { $set: { QAVerified: false, qa_verified_by: null, qa_notes: '' } }
    );

    await TranscriptionCall.updateOne(
      { call_id: callId },
      { $set: { qa_verified_segments_count: 0, transcription_status: 'IN_TRANSCRIPTION' } }
    );

    res.json({
      success: true,
      message: `Reset QA verification for call ${callId}`,
      modifiedSegments: resSeg.modifiedCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/calls/:callId/manual-transcription — Explicitly toggle a call for transcription
router.post("/calls/:callId/manual-transcription", requireAuth(JWT_SECRET), async (req, res) => {
  try {
    const { callId } = req.params;
    const { enable = true } = req.body;
    const call = await CallSession.findOne({ callId });
    if (!call) return res.status(404).json({ error: "Call not found" });

    call.isApprovedForTranscription = Boolean(enable);
    call.transcribedAsCall = Boolean(enable);
    if (enable) {
      call.callTranscriptionStatus = "transcribed";
    } else {
      call.callTranscriptionStatus = null;
    }
    await call.save();

    res.json({
      success: true,
      message: enable ? "Call manually queued for transcription" : "Call removed from transcription queue",
      isApprovedForTranscription: call.isApprovedForTranscription
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/qa/transcription-calls: List calls in transcription pipeline
router.get("/qa/transcription-calls", requireAuth(JWT_SECRET), async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const search = (req.query.search || '').trim();
    const filterStatus = req.query.status || 'all';

    // Find calls that either completed Segmentation QA OR were manually flagged for transcription
    const segApprovedTCalls = await TranscriptionCall.find({ segmentation_qa: true }).select('call_id').lean();
    const segApprovedCallIds = segApprovedTCalls.map(t => t.call_id);

    let callSessionQuery = {
      $or: [
        { transcribedAsCall: true },
        { callTranscriptionStatus: "transcribed" },
        { isApprovedForTranscription: true },
        { isMonologued: true },
        { callId: { $in: segApprovedCallIds } }
      ]
    };
    if (search) {
      callSessionQuery = {
        $and: [
          callSessionQuery,
          { callId: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const approvedCalls = await CallSession.find(callSessionQuery)
      .populate("userA", "username speaker_id email")
      .populate("userB", "username speaker_id email")
      .populate("topicId", "title")
      .sort({ updatedAt: -1 })
      .lean();

    const callIds = approvedCalls.map(c => c.callId);

    const tCalls = await TranscriptionCall.find({ call_id: { $in: callIds } }).lean();
    const tCallMap = new Map(tCalls.map(t => [t.call_id, t]));

    // Fetch segment stats grouped by call_id
    const segmentStats = await TranscriptionSegment.aggregate([
      { $match: { call_id: { $in: callIds } } },
      {
        $group: {
          _id: "$call_id",
          total_segments: { $sum: 1 },
          tier1_verified: { $sum: { $cond: [{ $eq: ["$tier1_text_verified", true] }, 1, 0] } },
          tier2_verified: { $sum: { $cond: [{ $eq: ["$tier2_timestamps_verified", true] }, 1, 0] } },
          is_transcribed: { $sum: { $cond: [{ $eq: ["$IsTranscribed", true] }, 1, 0] } },
          qa_verified: { $sum: { $cond: [{ $eq: ["$QAVerified", true] }, 1, 0] } },
        }
      }
    ]);

    const statsMap = new Map(segmentStats.map(s => [s._id, s]));

    let results = approvedCalls.map(c => {
      const t = tCallMap.get(c.callId) || {};
      const stats = statsMap.get(c.callId) || {
        total_segments: t.total_segments || 0,
        tier1_verified: 0,
        tier2_verified: 0,
        is_transcribed: 0,
        qa_verified: 0
      };

      const totalSegs = stats.total_segments || t.total_segments || 0;
      const isTranscribedCount = stats.is_transcribed || 0;
      const qaVerifiedCount = stats.qa_verified || 0;

      const isFullyTranscribed = totalSegs > 0 && isTranscribedCount >= totalSegs && isTranscribedCount > 0;
      const isQAComplete = totalSegs > 0 && qaVerifiedCount >= totalSegs && qaVerifiedCount > 0;

      return {
        ...c,
        callId: c.callId,
        transcriptionCall: t,
        Segmentation_Done: t.Segmentation_Done,
        segmentation_qa: t.segmentation_qa,
        transcription_status: isQAComplete ? 'QA_APPROVED' : (isFullyTranscribed ? 'TRANSCRIPTION_COMPLETED' : 'IN_TRANSCRIPTION'),
        total_segments: totalSegs,
        tier1_verified_count: stats.tier1_verified || 0,
        tier2_verified_count: stats.tier2_verified || 0,
        is_transcribed_count: isTranscribedCount,
        qa_verified_count: qaVerifiedCount,
        isFullyTranscribed,
        isQAComplete
      };
    });

    // Apply status filter matching user specifications
    if (filterStatus === 'pending_transcription') {
      results = results.filter(r => (r.is_transcribed_count || 0) < (r.total_segments || 1));
    } else if (filterStatus === 'pending_review') {
      results = results.filter(r => (r.is_transcribed_count || 0) > 0 && (r.qa_verified_count || 0) < (r.is_transcribed_count || 0));
    } else if (filterStatus === 'fully_transcribed') {
      results = results.filter(r => r.isFullyTranscribed && !r.isQAComplete);
    } else if (filterStatus === 'qa_reviewed') {
      results = results.filter(r => r.isQAComplete);
    }

    const total = results.length;
    const paginated = results.slice((page - 1) * limit, page * limit);

    res.json({
      calls: paginated,
      page,
      pages: Math.ceil(total / limit) || 1,
      total
    });
  } catch (err) {
    console.error('GET /qa/transcription-calls error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/qa/calls/:callId/transcription/reset-qa: Unreview/reset all segments for call
router.post("/qa/calls/:callId/transcription/reset-qa", requireAuth(JWT_SECRET), async (req, res) => {
  try {
    const { callId } = req.params;
    await syncSegmentsFromDisk(callId);

    const resSeg = await TranscriptionSegment.updateMany(
      { call_id: callId },
      { $set: { QAVerified: false, qa_verified_by: null, qa_notes: '' } }
    );

    await TranscriptionCall.updateOne(
      { call_id: callId },
      { $set: { qa_verified_segments_count: 0, transcription_status: 'IN_TRANSCRIPTION' } }
    );

    res.json({
      success: true,
      message: `Reset QA verification for call ${callId}`,
      modifiedSegments: resSeg.modifiedCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/qa/calls/:callId/transcription: Fetch full transcription details with word timestamps
router.get("/qa/calls/:callId/transcription", requireAuth(JWT_SECRET), async (req, res) => {
  try {
    const { callId } = req.params;
    await syncSegmentsFromDisk(callId);

    const callSession = await CallSession.findOne({ callId })
      .populate("userA", "username speaker_id email")
      .populate("userB", "username speaker_id email")
      .populate("topicId", "title")
      .lean();

    const tCall = await TranscriptionCall.findOne({ call_id: callId }).lean();
    const segments = await TranscriptionSegment.find({ call_id: callId })
      .populate("tier1_verified_by", "username email")
      .populate("tier2_verified_by", "username email")
      .populate("qa_verified_by", "username email")
      .sort({ start_ms: 1, start_sec: 1 })
      .lean();

    const totalSegs = segments.length;
    const tier1Count = segments.filter(s => s.tier1_text_verified).length;
    const tier2Count = segments.filter(s => s.tier2_timestamps_verified).length;
    const transcribedCount = segments.filter(s => s.IsTranscribed).length;
    const qaCount = segments.filter(s => s.QAVerified).length;

    res.json({
      callId,
      callSession,
      transcriptionCall: tCall,
      total_segments: totalSegs,
      tier1_verified_count: tier1Count,
      tier2_verified_count: tier2Count,
      transcribed_count: transcribedCount,
      qa_verified_count: qaCount,
      segments,
      audio1Url: `http://localhost:3001/api/admin/qa/calls/${encodeURIComponent(callId)}/recording/speaker1`,
      audio2Url: `http://localhost:3001/api/admin/qa/calls/${encodeURIComponent(callId)}/recording/speaker2`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/qa/calls/:callId/transcription/segments/:segmentId: Update single segment transcription & word timestamps
router.patch("/qa/calls/:callId/transcription/segments/:segmentId", requireAuth(JWT_SECRET), async (req, res) => {
  try {
    const { callId, segmentId } = req.params;
    const { segment_text, words, tier1_text_verified, tier2_timestamps_verified, QAVerified, qa_notes } = req.body;

    const updateFields = {};
    if (segment_text !== undefined) updateFields.segment_text = segment_text;
    if (words !== undefined) updateFields.words = words;
    if (tier1_text_verified !== undefined) {
      updateFields.tier1_text_verified = Boolean(tier1_text_verified);
      if (tier1_text_verified) updateFields.tier1_verified_by = req.user?._id;
    }
    if (tier2_timestamps_verified !== undefined) {
      updateFields.tier2_timestamps_verified = Boolean(tier2_timestamps_verified);
      if (tier2_timestamps_verified) updateFields.tier2_verified_by = req.user?._id;
    }
    if (QAVerified !== undefined) {
      updateFields.QAVerified = Boolean(QAVerified);
      if (QAVerified) updateFields.qa_verified_by = req.user?._id;
    }
    if (qa_notes !== undefined) updateFields.qa_notes = qa_notes;

    const segment = await TranscriptionSegment.findOneAndUpdate(
      { call_id: callId, segment_id: segmentId },
      { $set: updateFields },
      { new: true }
    );

    if (!segment) {
      return res.status(404).json({ error: "Segment not found" });
    }

    // Check overall call status and count verified segments
    const allSegments = await TranscriptionSegment.find({ call_id: callId }).lean();
    const totalSegs = allSegments.length;
    const transcribedCount = allSegments.filter(s => s.IsTranscribed).length;
    const qaCount = allSegments.filter(s => s.QAVerified).length;
    const allTranscribed = totalSegs > 0 && transcribedCount >= totalSegs;
    const allQa = totalSegs > 0 && qaCount >= totalSegs;

    await TranscriptionCall.updateOne(
      { call_id: callId },
      {
        $set: {
          total_segments: totalSegs,
          transcribed_segments_count: transcribedCount,
          qa_verified_segments_count: qaCount,
          transcription_status: allQa ? 'TRANSCRIPTION_COMPLETED' : (allTranscribed ? 'TRANSCRIPTION_COMPLETED' : 'IN_TRANSCRIPTION')
        }
      }
    );

    res.json({ 
      success: true, 
      segment, 
      total_segments: totalSegs,
      transcribed_count: transcribedCount,
      qa_verified_count: qaCount,
      allTranscribed, 
      allQa 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/qa/calls/:callId/transcription/qa-verify-all: Verify all transcription segments for call
router.post("/qa/calls/:callId/transcription/qa-verify-all", requireAuth(JWT_SECRET), async (req, res) => {
  try {
    const { callId } = req.params;
    const { status, qa_notes } = req.body;
    const isApproved = status === 'approved' || status === true;

    await TranscriptionSegment.updateMany(
      { call_id: callId },
      {
        $set: {
          QAVerified: isApproved,
          qa_verified_by: req.user?._id,
          qa_notes: qa_notes || ''
        }
      }
    );

    const tCall = await TranscriptionCall.findOneAndUpdate(
      { call_id: callId },
      {
        $set: {
          transcription_status: isApproved ? 'TRANSCRIPTION_COMPLETED' : 'IN_TRANSCRIPTION'
        }
      },
      { new: true }
    );

    res.json({ success: true, transcriptionCall: tCall, isApproved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
            if (c.isHidden) return null; // Project is hidden

            const compKey = String(c.name || "").trim().toLowerCase();
            const activeLangs = companyActiveLangs[compKey];

            // If no sample phrases exist for this company, do NOT list it on the contributor apply page
            if (!activeLangs || activeLangs.size === 0) return null;

            const hiddenSet = new Set((c.hiddenLanguages || []).map(l => String(l).toLowerCase().trim()));
            const visibleLangs = Array.from(activeLangs).filter(l => !hiddenSet.has(String(l).toLowerCase().trim()));
            if (visibleLangs.length === 0) return null;

            return {
                ...c,
                languages: visibleLangs
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
        const companyFolder = company.name.replace(/[^a-zA-Z0-9_\-\ ]/g, "").trim();
        const companyRegex = new RegExp(`^${companyFolder}(_downloaded)?$`, "i");

        const samplePhrases = await Phrase.find({ companyId: { $regex: companyRegex } })
            .select("tags emotion style intent pitch speed volume instructions script_type")
            .lean();
        const tagKeys = new Set();
        const standardFields = ["emotion", "style", "intent", "pitch", "speed", "volume", "instructions", "script_type"];
        for (const p of samplePhrases) {
            if (p.tags && typeof p.tags === "object") {
                for (const k of Object.keys(p.tags)) {
                    if (p.tags[k] !== undefined && p.tags[k] !== null && p.tags[k] !== "") {
                        tagKeys.add(k);
                    }
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
    const codes = [];
    if (user?.qaLanguageCode) {
        codes.push(String(user.qaLanguageCode).trim().toLowerCase());
    }
    if (Array.isArray(user?.qaLanguageCodes)) {
        user.qaLanguageCodes.forEach(c => {
            const trimmed = String(c).trim().toLowerCase();
            if (trimmed && !codes.includes(trimmed)) codes.push(trimmed);
        });
    }
    return codes.filter(Boolean);
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
        const companyFilter = (req.query.company || req.query.companyId || "").trim();
        const languageFilter = (req.query.language || req.query.languageCode || "").trim().toLowerCase();
        const search = (req.query.search || "").trim().toLowerCase();
        const skip = (page - 1) * limit;
        const allowedLanguages = req.user.isAdmin ? null : getReviewerLanguageCodes(req.user);

        // Resolve company identifiers if companyFilter is passed
        let targetCompanyIdentifiers = [];
        if (companyFilter) {
            targetCompanyIdentifiers.push(companyFilter.toLowerCase());
            const compDoc = await Company.findOne({
                $or: [
                    { name: { $regex: new RegExp(`^${companyFilter.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') } },
                    { projectName: { $regex: new RegExp(`^${companyFilter.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') } },
                    mongoose.Types.ObjectId.isValid(companyFilter) ? { _id: companyFilter } : null
                ].filter(Boolean)
            }).lean();

            if (compDoc) {
                targetCompanyIdentifiers.push(String(compDoc._id).toLowerCase());
                if (compDoc.name) targetCompanyIdentifiers.push(String(compDoc.name).toLowerCase().trim());
                if (compDoc.projectName) targetCompanyIdentifiers.push(String(compDoc.projectName).toLowerCase().trim());
            }
        }

        const users = await User.find({ "languageApplications.0": { $exists: true } })
            .select("firstname lastname email username speaker_id languageApplications")
            .lean();

        let apps = [];
        users.forEach((u) => {
            u.languageApplications.forEach((app) => {
                const languageCode = String(app.languageCode || "").trim().toLowerCase();
                const appType = app.applicationType || 'phrase';
                if (statusFilter && app.status !== statusFilter) return;
                if (typeFilter && appType !== typeFilter) return;
                if (allowedLanguages && !allowedLanguages.includes(languageCode)) return;
                if (languageFilter && languageCode !== languageFilter) return;

                if (targetCompanyIdentifiers.length > 0) {
                    const appComp = String(app.companyId || app.projectName || "").toLowerCase().trim();
                    const matchesComp = targetCompanyIdentifiers.some(id => id === appComp);
                    if (!matchesComp) return;
                }

                if (search) {
                    const fn = (u.firstname || "").toLowerCase();
                    const ln = (u.lastname || "").toLowerCase();
                    const un = (u.username || "").toLowerCase();
                    const em = (u.email || "").toLowerCase();
                    const spk = (u.speaker_id || `spk_${u._id}`).toLowerCase();
                    if (!fn.includes(search) && !ln.includes(search) && !un.includes(search) && !em.includes(search) && !spk.includes(search)) {
                        return;
                    }
                }

                apps.push({
                    appId: app._id,
                    userId: u._id,
                    userFirstname: u.firstname,
                    userLastname: u.lastname,
                    userEmail: u.email,
                    username: u.username,
                    speaker_id: u.speaker_id || `spk_${u._id}`,
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

async function getPhraseApplicationsHierarchy(req, res) {
    try {
        const allowedLanguages = req.user.isAdmin ? null : getReviewerLanguageCodes(req.user);
        
        // 1. Fetch all companies
        const companies = await Company.find({}).sort({ name: 1 }).lean();
        
        // 2. Fetch all known languages
        const allLanguages = await Language.find({}).lean();
        const langMap = {};
        allLanguages.forEach(l => {
            if (l.code) {
                langMap[l.code.toLowerCase()] = l.name || l.code;
            }
        });

        // 3. Find active languages in Phrase collection per company
        const phraseCombos = await Phrase.aggregate([
            {
                $group: {
                    _id: { companyId: "$companyId", language: { $toLower: "$language" } },
                    phraseCount: { $sum: 1 }
                }
            }
        ]);
        
        // Map company -> Map of languages with phrase count
        const companyPhraseLangs = {};
        phraseCombos.forEach(c => {
            if (c._id && c._id.companyId && c._id.language) {
                const compKey = String(c._id.companyId).replace(/_downloaded$/, "").trim().toLowerCase();
                const lang = String(c._id.language).trim().toLowerCase();
                if (!companyPhraseLangs[compKey]) {
                    companyPhraseLangs[compKey] = {};
                }
                companyPhraseLangs[compKey][lang] = (companyPhraseLangs[compKey][lang] || 0) + (c.phraseCount || 0);
            }
        });

        // 4. Find all users with phrase language applications
        const users = await User.find({ "languageApplications.0": { $exists: true } })
            .select("firstname lastname email username speaker_id languageApplications")
            .lean();

        // Aggregate application counts by company and language
        // companyKey -> { originalName, languages: { langCode: { pending, approved, rejected, total } } }
        const appStats = {};

        users.forEach(u => {
            (u.languageApplications || []).forEach(app => {
                const appType = app.applicationType || 'phrase';
                if (appType !== 'phrase') return;

                const langCode = String(app.languageCode || "").trim().toLowerCase();
                if (allowedLanguages && !allowedLanguages.includes(langCode)) return;

                const compName = String(app.companyId || app.projectName || "General Phrases").trim();
                const compKey = compName.toLowerCase();

                if (!appStats[compKey]) {
                    appStats[compKey] = {
                        originalName: compName,
                        languages: {}
                    };
                }
                if (!appStats[compKey].languages[langCode]) {
                    appStats[compKey].languages[langCode] = {
                        pending: 0,
                        approved: 0,
                        rejected: 0,
                        total: 0
                    };
                }
                const st = app.status || "pending";
                if (st === "approved") appStats[compKey].languages[langCode].approved++;
                else if (st === "rejected") appStats[compKey].languages[langCode].rejected++;
                else appStats[compKey].languages[langCode].pending++;
                appStats[compKey].languages[langCode].total++;
            });
        });

        // 5. Assemble hierarchy for each company
        const matchedCompKeys = new Set();
        const projectList = companies.map(comp => {
            const cName = String(comp.name || "").trim();
            const cKey = cName.toLowerCase();
            const cId = String(comp._id).toLowerCase();
            const pName = String(comp.projectName || "").trim();
            const pKey = pName.toLowerCase();

            matchedCompKeys.add(cKey);
            if (pKey) matchedCompKeys.add(pKey);
            matchedCompKeys.add(cId);

            // Combine stats from name, projectName, or _id
            const relevantStats = [
                appStats[cKey],
                appStats[pKey],
                appStats[cId]
            ].filter(Boolean);

            // All languages for this company: from phrases + from applications
            const phraseLangs = {
                ...(companyPhraseLangs[cKey] || {}),
                ...(companyPhraseLangs[pKey] || {})
            };

            const allLangsForComp = new Set([
                ...Object.keys(phraseLangs),
                ...relevantStats.flatMap(s => Object.keys(s.languages || {}))
            ]);

            const languageList = Array.from(allLangsForComp).map(langCode => {
                let pending = 0, approved = 0, rejected = 0, total = 0;
                relevantStats.forEach(s => {
                    if (s.languages && s.languages[langCode]) {
                        pending += s.languages[langCode].pending;
                        approved += s.languages[langCode].approved;
                        rejected += s.languages[langCode].rejected;
                        total += s.languages[langCode].total;
                    }
                });

                return {
                    code: langCode,
                    name: langMap[langCode] || (langCode.charAt(0).toUpperCase() + langCode.slice(1)),
                    phraseCount: phraseLangs[langCode] || 0,
                    pendingApplicants: pending,
                    approvedApplicants: approved,
                    rejectedApplicants: rejected,
                    totalApplicants: total
                };
            });

            // Sort languages: those with pending applicants first, then alphabetical
            languageList.sort((a, b) => b.pendingApplicants - a.pendingApplicants || b.totalApplicants - a.totalApplicants || a.code.localeCompare(b.code));

            const totalPending = languageList.reduce((acc, l) => acc + l.pendingApplicants, 0);
            const totalApproved = languageList.reduce((acc, l) => acc + l.approvedApplicants, 0);
            const totalRejected = languageList.reduce((acc, l) => acc + l.rejectedApplicants, 0);
            const totalApps = languageList.reduce((acc, l) => acc + l.totalApplicants, 0);

            return {
                id: comp._id,
                name: comp.name,
                projectName: comp.projectName || comp.name,
                description: comp.description || "",
                languages: languageList,
                totalLanguages: languageList.length,
                pendingApplicants: totalPending,
                approvedApplicants: totalApproved,
                rejectedApplicants: totalRejected,
                totalApplicants: totalApps
            };
        });

        // Also check if any unmatched applications exist (e.g. legacy company names)
        Object.keys(appStats).forEach(key => {
            if (!matchedCompKeys.has(key) && key) {
                const s = appStats[key];
                const languageList = Object.keys(s.languages).map(langCode => {
                    const lStat = s.languages[langCode];
                    return {
                        code: langCode,
                        name: langMap[langCode] || (langCode.charAt(0).toUpperCase() + langCode.slice(1)),
                        phraseCount: 0,
                        pendingApplicants: lStat.pending,
                        approvedApplicants: lStat.approved,
                        rejectedApplicants: lStat.rejected,
                        totalApplicants: lStat.total
                    };
                });
                projectList.push({
                    id: key,
                    name: s.originalName || key,
                    projectName: s.originalName || key,
                    description: "",
                    languages: languageList,
                    totalLanguages: languageList.length,
                    pendingApplicants: languageList.reduce((acc, l) => acc + l.pendingApplicants, 0),
                    approvedApplicants: languageList.reduce((acc, l) => acc + l.approvedApplicants, 0),
                    rejectedApplicants: languageList.reduce((acc, l) => acc + l.rejectedApplicants, 0),
                    totalApplicants: languageList.reduce((acc, l) => acc + l.totalApplicants, 0)
                });
            }
        });

        // Sort projects: those with pending applicants first, then by total applicants, then by name
        projectList.sort((a, b) => b.pendingApplicants - a.pendingApplicants || b.totalApplicants - a.totalApplicants || a.name.localeCompare(b.name));

        res.json({ projects: projectList });
    } catch (e) {
        console.error("Error in getPhraseApplicationsHierarchy:", e);
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
        const appType = app.applicationType || "phrase";
        const appComp = String(app.companyId || "").trim().toLowerCase();

        // Mark this application and any matching duplicate application entries as approved
        user.languageApplications.forEach((a) => {
            const aLang = String(a.languageCode || "").trim().toLowerCase();
            const aType = a.applicationType || "phrase";
            const aComp = String(a.companyId || "").trim().toLowerCase();

            if (aLang === languageCode && aType === appType) {
                if (appType === "phrase") {
                    if (appComp && aComp === appComp) {
                        a.status = "approved";
                        a.reviewedBy = req.user._id;
                        a.reviewedAt = new Date();
                    } else if (!appComp && !aComp) {
                        a.status = "approved";
                        a.reviewedBy = req.user._id;
                        a.reviewedAt = new Date();
                    }
                } else {
                    a.status = "approved";
                    a.reviewedBy = req.user._id;
                    a.reviewedAt = new Date();
                }
            }
        });

        await user.save();

        // Send project approved email
        try {
            const languageDoc = app.applicationType === "scripted_call"
                ? await ScriptedLanguage.findOne({ code: languageCode })
                : await Language.findOne({ code: languageCode });
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
            const languageDoc = app.applicationType === "scripted_call"
                ? await ScriptedLanguage.findOne({ code: languageCode })
                : await Language.findOne({ code: languageCode });
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

        let targetRecording = app.recordingFile;
        if (req.query.sampleIndex !== undefined && app.sampleRecordings && app.sampleRecordings.length > 0) {
            const sIdx = Number(req.query.sampleIndex);
            const found = app.sampleRecordings.find(s => s.sampleIndex === sIdx) || app.sampleRecordings[sIdx];
            if (found && found.recordingFile) {
                targetRecording = found.recordingFile;
            }
        }

        if (!targetRecording) {
            return res.status(404).json({ error: "Recording file not found" });
        }

        // 1. Resolve recording file path
        const localDir = path.join(process.cwd(), "recordings", "language-apps");
        const exactLocalName = targetRecording.startsWith("local:") 
          ? targetRecording.replace("local:", "") 
          : path.basename(targetRecording);
        
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
            if (targetRecording.startsWith("local:")) {
                return res.status(404).json({ error: "Local recording file not found" });
            }
            const lambdaResult = await invokeAudioQC({
                bucket: BUCKET_NAME,
                key: targetRecording,
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

// GET /api/admin/qa/segmentation-calls — Retrieves all QA approved calls for Segmentation Panel
qaCallRouter.get("/segmentation-calls", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const approvedFilter = { 
            $or: [
                { transcribedAsCall: true },
                { isApprovedForTranscription: true },
                { isSentToSegmentation: true }
            ],
            adminDeleted: { $ne: true },
            callId: { $not: /^scripted_/ }
        };

        const [sessions, total] = await Promise.all([
            CallSession.find(approvedFilter)
                .populate("userA", "firstname lastname username email speaker_id")
                .populate("userB", "firstname lastname username email speaker_id")
                .populate("topicId", "title")
                .populate("subtopicId", "title")
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            CallSession.countDocuments(approvedFilter)
        ]);

        const callIds = sessions.map(s => s.callId);
        const transcriptionRecords = await TranscriptionCall.find({ call_id: { $in: callIds } }).lean();
        const transcriptionMap = new Map(transcriptionRecords.map(t => [t.call_id, t]));

        const callsWithSegmentation = sessions.map(s => {
            const segRecord = transcriptionMap.get(s.callId) || {};
            return {
                ...s,
                Segmentation_Done: segRecord.Segmentation_Done || false,
                segmentation_qa: segRecord.segmentation_qa || false,
                total_segments: segRecord.total_segments || 0,
                asr_status: segRecord.asr_status || 'PENDING'
            };
        });

        res.json({ calls: callsWithSegmentation, total, page, pages: Math.ceil(total / limit) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// List calls for QA review with pagination
qaCallRouter.get("/calls", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const status = req.query.status;
        const isScripted = req.query.mode === "scripted";
        const skip = (page - 1) * limit;

        const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
        const filter = { 
            callActuallyStarted: true, 
            adminDeleted: { $ne: true },
            callId: isScripted ? /^scripted_/ : { $not: /^scripted_/ }
        };
        const selectedLanguage = req.query.language ? String(req.query.language).trim().toLowerCase() : null;

        if (req.user.isQA && !req.user.isAdmin && !isScripted) {
            const allowedLangs = getReviewerLanguageCodes(req.user);
            if (selectedLanguage && allowedLangs.includes(selectedLanguage)) {
                filter.language = selectedLanguage;
            } else if (allowedLangs.length > 0) {
                filter.language = { $in: allowedLangs };
            }

            if (status === "approved" || status === "rejected") {
                filter.callStatus = status;
                filter.reviewedBy = req.user._id;
            } else {
                // Pending Tab: Lock a batch of up to 2 calls for this QA reviewer
                filter.callStatus = "pending";

                // 1. Release expired locks (>15 mins old)
                await CallSession.updateMany(
                    { qaLockedAt: { $lt: fifteenMinsAgo } },
                    { $set: { qaLockedBy: null, qaLockedAt: null } }
                );

                // 2. Find pending calls currently locked by THIS QA reviewer
                let lockedForMe = await CallSession.find({
                    callActuallyStarted: true,
                    adminDeleted: { $ne: true },
                    callId: isScripted ? /^scripted_/ : { $not: /^scripted_/ },
                    callStatus: "pending",
                    ...(filter.language ? { language: filter.language } : {}),
                    qaLockedBy: req.user._id,
                    qaLockedAt: { $gte: fifteenMinsAgo }
                })
                .populate("userA", "firstname lastname username email dob gender address locality regionalLanguage speaker_id")
                .populate("userB", "firstname lastname username email dob gender address locality regionalLanguage speaker_id")
                .populate("topicId", "title")
                .populate("subtopicId", "title description instructions")
                .populate("reviewedBy", "firstname lastname email")
                .sort({ createdAt: 1 });

                // 3. If fewer than 2 calls locked for this QA user, lock additional available calls up to 2
                const neededCount = 2 - lockedForMe.length;
                if (neededCount > 0) {
                    const currentlyLockedIds = lockedForMe.map(c => c._id);
                    const availableCalls = await CallSession.find({
                        callActuallyStarted: true,
                        adminDeleted: { $ne: true },
                        callId: isScripted ? /^scripted_/ : { $not: /^scripted_/ },
                        callStatus: "pending",
                        ...(filter.language ? { language: filter.language } : {}),
                        _id: { $nin: currentlyLockedIds },
                        "firstQaReview.qaId": { $ne: req.user._id },
                        $or: [
                            { qaLockedBy: null },
                            { qaLockedBy: req.user._id },
                            { qaLockedAt: { $lt: fifteenMinsAgo } }
                        ]
                    })
                    .sort({ createdAt: 1 })
                    .limit(neededCount);

                    if (availableCalls.length > 0) {
                        const idsToLock = availableCalls.map(c => c._id);
                        const now = new Date();
                        await CallSession.updateMany(
                            { _id: { $in: idsToLock } },
                            { $set: { qaLockedBy: req.user._id, qaLockedAt: now } }
                        );

                        // Re-fetch populated locked list
                        lockedForMe = await CallSession.find({
                            callActuallyStarted: true,
                            adminDeleted: { $ne: true },
                            callId: isScripted ? /^scripted_/ : { $not: /^scripted_/ },
                            callStatus: "pending",
                            ...(filter.language ? { language: filter.language } : {}),
                            qaLockedBy: req.user._id,
                            qaLockedAt: { $gte: fifteenMinsAgo }
                        })
                        .populate("userA", "firstname lastname username email dob gender address locality regionalLanguage speaker_id")
                        .populate("userB", "firstname lastname username email dob gender address locality regionalLanguage speaker_id")
                        .populate("topicId", "title")
                        .populate("subtopicId", "title description instructions")
                        .populate("reviewedBy", "firstname lastname email")
                        .sort({ createdAt: 1 });
                    }
                }

                return res.json({ calls: lockedForMe, total: lockedForMe.length, page: 1, pages: 1 });
            }
        } else {
            if (selectedLanguage) {
                filter.language = selectedLanguage;
            }
            if (status) {
                filter.callStatus = status;
            }
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
    // Only finalize callStatus when BOTH recordings have been reviewed (neither is pending)
    if (recordingAStatus === "pending" || recordingBStatus === "pending") {
        return "pending";
    }
    if (recordingAStatus === "approved" && recordingBStatus === "approved") {
        return "approved";
    }
    // If one is rejected and other is approved/rejected, overall call goes to rejected
    return "rejected";
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

async function applyRecordingDecision(call, userId, action, reviewerId, note, isNoisy, rejectionReason) {
    const normalizedNote = typeof note === "string" ? note.trim() : "";

    let side;
    const userAStr = (call.userA?._id || call.userA || "").toString();
    const userBStr = (call.userB?._id || call.userB || "").toString();

    if (userAStr === String(userId) || userId === "userA" || userId === "A" || userId === "speaker1") {
        side = "A";
    } else if (userBStr === String(userId) || userId === "userB" || userId === "B" || userId === "speaker2") {
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
    const noisyKey = side === "A" ? "recordingANoisy" : "recordingBNoisy";
    const reasonKey = side === "A" ? "recordingARejectionReason" : "recordingBRejectionReason";

    call[statusKey] = action;

    if (action === "rejected") {
        const validReason = ["Off-Topic Conversation", "Noisy"].includes(rejectionReason) ? rejectionReason : null;
        call[reasonKey] = validReason;
        if (validReason === "Noisy" || isNoisy) {
            call[noisyKey] = true;
        }

        let defaultNote = "";
        if (validReason === "Noisy") {
            defaultNote = "Noisy Environment";
        } else if (validReason === "Off-Topic Conversation") {
            defaultNote = "Off Topic Conversation";
        }

        if (normalizedNote) {
            call[noteKey] = normalizedNote;
        } else {
            call[noteKey] = defaultNote || null;
        }
    } else {
        call[reasonKey] = null;
        call[noteKey] = normalizedNote || null;
        if (typeof isNoisy === "boolean") {
            call[noisyKey] = isNoisy;
        }
    }

    if (action === "approved") {
        const durationMinutes = getRecordingDurationMinutes(call, side);
        const hourlyPayout = await getLanguageHourlyPayout(call.language);
        call[durationKey] = durationMinutes;
        call[payoutKey] = roundCurrency((hourlyPayout * durationMinutes) / 60);
    } else {
        call[durationKey] = 0;
        call[payoutKey] = 0;
    }

    // Check QA 15-minute lock validity
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (reviewerId) {
        const isLockedByOther = call.qaLockedBy &&
            call.qaLockedBy.toString() !== reviewerId.toString() &&
            call.qaLockedAt &&
            call.qaLockedAt > fifteenMinsAgo;

        if (isLockedByOther) {
            const error = new Error("This call is currently locked for review by another QA reviewer.");
            error.statusCode = 409;
            throw error;
        }

        if (call.qaLockedBy && call.qaLockedBy.toString() === reviewerId.toString()) {
            if (call.qaLockedAt && call.qaLockedAt < fifteenMinsAgo) {
                const error = new Error("Your 15-minute review window for this call has expired. Please re-open the call to lock it again.");
                error.statusCode = 409;
                throw error;
            }
        }
    }

    if (call.callId && call.callId.startsWith("scripted_")) {
        call.callStatus = (call.recordingAStatus === "approved" && call.recordingBStatus === "approved") ? "approved" : "pending";
    } else {
        call.callStatus = computeCallStatus(call.recordingAStatus, call.recordingBStatus);
    }
    call.reviewedBy = reviewerId;
    call.reviewedAt = new Date();

    if (reviewerId) {
        const qaUser = await User.findById(reviewerId).select("perCallPayrate").lean();
        const perCallRate = Number(qaUser?.perCallPayrate) || 0;
        call.qaCallPayoutUsd = perCallRate;
    }
    
    // Clear lock only when call is completely reviewed (both users decided)
    if (call.callStatus !== "pending") {
        call.qaLockedBy = null;
        call.qaLockedAt = null;
    }
    // 2% Random Dual-QA Cross Audit & Ambiguity Mismatch Tracking for Calls
    try {
        if (call.needsSecondQaReview && call.firstQaReview && String(call.firstQaReview.qaId) !== String(reviewerId)) {
            // This is QA 2 doing the blind cross-review!
            const qa1StatusA = call.firstQaReview.recordingAStatus;
            const qa1StatusB = call.firstQaReview.recordingBStatus;
            const qa2StatusA = call.recordingAStatus;
            const qa2StatusB = call.recordingBStatus;

            const hasMismatch = (qa1StatusA !== qa2StatusA) || (qa1StatusB !== qa2StatusB);

            if (hasMismatch) {
                // Verdict Mismatch between QA 1 and QA 2! Route call to Ambiguity Tab
                const firstQaUser = await User.findById(call.firstQaReview.qaId).lean();
                const secondQaUser = reviewerId ? await User.findById(reviewerId).lean() : null;

                await Ambiguity.create({
                    type: "call",
                    callId: call.callId,
                    companyId: call.companyId,
                    language: call.language,
                    reason: "conflict",
                    audioFileA: call.recordingAFile,
                    audioFileB: call.recordingBFile,
                    qaReviews: [
                        {
                            qaId: call.firstQaReview.qaId,
                            qaName: firstQaUser ? `${firstQaUser.firstname || ""} ${firstQaUser.lastname || ""}`.trim() || firstQaUser.username : "QA 1 Reviewer",
                            qaUsername: firstQaUser?.username || "",
                            qaEmail: firstQaUser?.email || "",
                            action: call.firstQaReview.action,
                            recordingAAction: qa1StatusA,
                            recordingBAction: qa1StatusB,
                            recordingAReviewNote: call.firstQaReview.recordingAReviewNote || null,
                            recordingBReviewNote: call.firstQaReview.recordingBReviewNote || null,
                            recordingARejectionReason: call.firstQaReview.recordingARejectionReason || null,
                            recordingBRejectionReason: call.firstQaReview.recordingBRejectionReason || null,
                            reviewedAt: call.firstQaReview.reviewedAt
                        },
                        {
                            qaId: reviewerId,
                            qaName: secondQaUser ? `${secondQaUser.firstname || ""} ${secondQaUser.lastname || ""}`.trim() || secondQaUser.username : "QA 2 Reviewer",
                            qaUsername: secondQaUser?.username || "",
                            qaEmail: secondQaUser?.email || "",
                            action: call.callStatus,
                            recordingAAction: qa2StatusA,
                            recordingBAction: qa2StatusB,
                            recordingAReviewNote: call.recordingAReviewNote || null,
                            recordingBReviewNote: call.recordingBReviewNote || null,
                            recordingARejectionReason: call.recordingARejectionReason || null,
                            recordingBRejectionReason: call.recordingBRejectionReason || null,
                            reviewedAt: new Date()
                        }
                    ],
                    status: "pending"
                });
            }
            call.needsSecondQaReview = false;
        } else if (!call.needsSecondQaReview && Math.random() < 0.02) {
            // 2% chance to flag for Dual-QA Cross Audit
            call.needsSecondQaReview = true;
            const qaUser = reviewerId ? await User.findById(reviewerId).select("perCallPayrate").lean() : null;
            const perCallRate = Number(qaUser?.perCallPayrate) || 0;
            call.firstQaReview = {
                qaId: reviewerId,
                action: call.callStatus,
                recordingAStatus: call.recordingAStatus,
                recordingBStatus: call.recordingBStatus,
                recordingARejectionReason: call.recordingARejectionReason,
                recordingBRejectionReason: call.recordingBRejectionReason,
                recordingAReviewNote: call.recordingAReviewNote,
                recordingBReviewNote: call.recordingBReviewNote,
                qaCallPayoutUsd: perCallRate,
                reviewedAt: new Date()
            };
        }
    } catch (ambErr) {
        console.error("Call Ambiguity dual-audit tracking error:", ambErr);
    }

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
        const isNoisy = req.body?.isNoisy !== undefined ? !!req.body.isNoisy : (req.body?.noisy !== undefined ? !!req.body.noisy : undefined);
        await applyRecordingDecision(call, userId, "approved", req.user._id, req.body?.note, isNoisy);
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
        const { note, rejectionReason, isNoisy } = req.body;
        const call = await CallSession.findOne({ callId });
        if (!call) return res.status(404).json({ error: "Call not found" });
        if (!hasLanguageAccess(req.user, call.language)) {
            return res.status(403).json({ error: "Forbidden: language access required" });
        }
        const noisyFlag = isNoisy !== undefined ? !!isNoisy : (rejectionReason === "Noisy");
        await applyRecordingDecision(call, userId, "rejected", req.user._id, note, noisyFlag, rejectionReason);
        await call.save();
        await updateLimitAndBlacklist(userId, call.language, false);

        res.json({ message: "Recording rejected successfully", call });
    } catch (e) {
        res.status(e.statusCode || 500).json({ error: e.message });
    }
});

// Toggle/update recording noisy status (accessible to QA & Admin)
qaCallRouter.patch("/calls/:callId/noisy/:userId", async (req, res) => {
    try {
        const { callId, userId } = req.params;
        const isNoisy = !!req.body.isNoisy;
        const call = await CallSession.findOne({ callId });
        if (!call) return res.status(404).json({ error: "Call not found" });
        if (!hasLanguageAccess(req.user, call.language)) {
            return res.status(403).json({ error: "Forbidden: language access required" });
        }
        if (call.userA.toString() === userId) {
            call.recordingANoisy = isNoisy;
        } else if (call.userB.toString() === userId) {
            call.recordingBNoisy = isNoisy;
        } else {
            return res.status(404).json({ error: "User not part of this call" });
        }
        await call.save();
        res.json({ message: "Noisy status updated successfully", call });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Stream generated spectrogram plot from S3
qaCallRouter.get("/calls/:callId/spectrogram/:userId", async (req, res) => {
    try {
        const { callId, userId } = req.params;
        const call = await CallSession.findOne({ callId }).lean();
        if (!call) return res.status(404).json({ error: "Call not found" });

        const isUserA = (call.userA?._id || call.userA || "").toString() === String(userId);
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
        const userAStr = (call.userA?._id || call.userA || "").toString();
        const userBStr = (call.userB?._id || call.userB || "").toString();
        if (userAStr === String(userId)) {
            recordingFile = call.recordingAFile;
        } else if (userBStr === String(userId)) {
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

        const isUserA = (call.userA?._id || call.userA || "").toString() === String(userId);
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
        const userAStr = (call.userA?._id || call.userA || "").toString();
        const userBStr = (call.userB?._id || call.userB || "").toString();

        const isUserA = String(userId) === userAStr || userId === "userA" || userId === "A" || userId === "speakerA" || userId === "1";
        const isUserB = String(userId) === userBStr || userId === "userB" || userId === "B" || userId === "speakerB" || userId === "2";
        const isMixed = userId === "mixed" || userId === "stereo" || userId === "combined";

        if (isMixed) {
            recordingFile = call.mixedRecordingFile || call.recordingAFile;
        } else if (isUserA) {
            recordingFile = call.recordingAFile;
        } else if (isUserB) {
            recordingFile = call.recordingBFile;
        } else {
            // Fallback: if userId matches neither but starts with 'scripted', default to userA or userB
            recordingFile = call.recordingAFile || call.recordingBFile;
        }

        if (!recordingFile) {
            return res.status(404).json({ error: "Recording not available" });
        }

        const candidatePaths = [
            path.resolve(process.cwd(), "recordings", recordingFile),
            path.resolve(process.cwd(), "recordings", path.basename(recordingFile)),
            path.resolve(process.cwd(), "recordings", "calls", path.basename(recordingFile)),
            path.resolve(process.cwd(), "uploads", path.basename(recordingFile)),
            path.resolve(process.cwd(), "uploads", "scripted_temp", path.basename(recordingFile)),
            path.resolve(recordingFile)
        ];

        let localFoundPath = null;
        for (const p of candidatePaths) {
            if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                localFoundPath = p;
                break;
            }
        }

        if (localFoundPath) {
            const ext = path.extname(localFoundPath).toLowerCase();
            const mimeType = ext === ".flac" ? "audio/flac" : ext === ".wav" ? "audio/wav" : ext === ".ogg" ? "audio/ogg" : "audio/webm";
            const stat = fs.statSync(localFoundPath);
            const total = stat.size;

            if (req.headers.range) {
                const parts = req.headers.range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
                const chunksize = end - start + 1;
                const fileStream = fs.createReadStream(localFoundPath, { start, end });
                res.writeHead(206, {
                    "Content-Range": `bytes ${start}-${end}/${total}`,
                    "Accept-Ranges": "bytes",
                    "Content-Length": chunksize,
                    "Content-Type": mimeType
                });
                return fileStream.pipe(res);
            } else {
                res.writeHead(200, {
                    "Content-Length": total,
                    "Content-Type": mimeType,
                    "Accept-Ranges": "bytes"
                });
                return fs.createReadStream(localFoundPath).pipe(res);
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

// GET /api/admin/qa/calls/:callId/details — Retrieve single call details
qaCallRouter.get("/calls/:callId/details", async (req, res) => {
    try {
        const { callId } = req.params;
        const call = await CallSession.findOne({ callId })
            .populate("userA", "firstname lastname username email dob gender address locality regionalLanguage speaker_id")
            .populate("userB", "firstname lastname username email dob gender address locality regionalLanguage speaker_id")
            .populate("topicId", "title")
            .populate("subtopicId", "title description instructions")
            .populate("questionerUserId", "firstname lastname username")
            .populate("answererUserId", "firstname lastname username")
            .populate("reviewedBy", "firstname lastname username email");

        if (!call) return res.status(404).json({ error: "Call not found" });
        res.json({ call });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

qaCallRouter.get("/language-applications/hierarchy", getPhraseApplicationsHierarchy);
qaCallRouter.get("/phrase-apps/hierarchy", getPhraseApplicationsHierarchy);
qaCallRouter.get("/language-applications", listLanguageApplications);
qaCallRouter.patch("/language-applications/:userId/:appId/approve", approveLanguageApplication);
qaCallRouter.patch("/language-applications/:userId/:appId/reject", rejectLanguageApplication);
qaCallRouter.post("/language-applications/:userId/:appId/analyze", analyzeLanguageApplication);

// Lock call for 15 minutes
qaCallRouter.post("/calls/:callId/lock", async (req, res) => {
    try {
        const { callId } = req.params;
        const call = await CallSession.findOne({ callId });
        if (!call) return res.status(404).json({ error: "Call not found" });

        const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
        const isLockedByOther = !req.user?.isAdmin && call.qaLockedBy &&
            call.qaLockedBy.toString() !== req.user._id.toString() &&
            call.qaLockedAt &&
            call.qaLockedAt > fifteenMinsAgo;

        if (isLockedByOther) {
            return res.status(409).json({
                error: "This call is currently locked for review by another QA reviewer. Please pick another call.",
                isLocked: true
            });
        }

        call.qaLockedBy = req.user._id;
        call.qaLockedAt = new Date();
        await call.save();

        res.json({
            message: "Call locked for 15 minutes",
            qaLockedBy: call.qaLockedBy,
            qaLockedAt: call.qaLockedAt,
            expiresInSeconds: 15 * 60,
            success: true
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Unlock call when closing modal
qaCallRouter.post("/calls/:callId/unlock", async (req, res) => {
    try {
        const { callId } = req.params;
        const call = await CallSession.findOne({ callId });
        if (!call) return res.status(404).json({ error: "Call not found" });

        if (req.user?.isAdmin || (call.qaLockedBy && call.qaLockedBy.toString() === req.user._id.toString())) {
            call.qaLockedBy = null;
            call.qaLockedAt = null;
            await call.save();
        }

        res.json({ message: "Call unlocked", success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// QA Payments and Earnings Breakdown
qaCallRouter.get("/payments-stats", async (req, res) => {
    try {
        const isUserAdmin = Boolean(req.user.isAdmin);
        const targetUserId = req.query.qaUserId || (isUserAdmin ? null : req.user._id);

        const getQaPhraseStats = async (qaUserId, hourlyPhraseRate = 0) => {
            const uIdStr = String(qaUserId);
            const userIdObj = new mongoose.Types.ObjectId(uIdStr);

            const [approvedAgg, rejectedAgg] = await Promise.all([
                Phrase.aggregate([
                    {
                        $match: {
                            status: "approved",
                            $or: [
                                { qaId: { $in: [userIdObj, uIdStr] } },
                                { "firstQaReview.qaId": { $in: [userIdObj, uIdStr] } },
                                { editedBy: { $in: [userIdObj, uIdStr] } }
                            ]
                        }
                    },
                    {
                        $project: {
                            duration: 1
                        }
                    },
                    { $group: { _id: null, count: { $sum: 1 }, totalSecs: { $sum: "$duration" } } }
                ]),
                PhraseRejection.aggregate([
                    {
                        $match: {
                            $or: [
                                { qaId: { $in: [userIdObj, uIdStr] } },
                                { "firstQaReview.qaId": { $in: [userIdObj, uIdStr] } }
                            ]
                        }
                    },
                    {
                        $project: {
                            duration: 1
                        }
                    },
                    { $group: { _id: null, count: { $sum: 1 }, totalSecs: { $sum: "$duration" } } }
                ])
            ]);

            const approvedPhrasesCount = approvedAgg[0]?.count || 0;
            const approvedSecs = approvedAgg[0]?.totalSecs || 0;
            const rejectedPhrasesCount = rejectedAgg[0]?.count || 0;
            const rejectedSecs = rejectedAgg[0]?.totalSecs || 0;

            const phrasesReviewedCount = approvedPhrasesCount + rejectedPhrasesCount;
            const totalPhraseSecs = Math.round((approvedSecs + rejectedSecs) * 100) / 100;
            const phraseHours = totalPhraseSecs / 3600;
            const phraseEarningsUsd = Math.round((phraseHours * hourlyPhraseRate) * 100) / 100;

            return {
                phrasesReviewedCount,
                approvedPhrasesCount,
                rejectedPhrasesCount,
                approvedSecs,
                rejectedSecs,
                totalPhraseSecs,
                phraseHours,
                phraseEarningsUsd
            };
        };

        if (isUserAdmin && !req.query.qaUserId) {
            // Admin summary across ALL QA Users
            const qaUsers = await User.find({ isQA: true })
                .select("firstname lastname username email upiId perCallPayrate hourlyPhrasePayrate qaLanguageCodes qaLanguageCode createdAt")
                .sort({ createdAt: -1 })
                .lean();

            const stats = await Promise.all(
                qaUsers.map(async (qa) => {
                    const perCallRate = Number(qa.perCallPayrate) || 0;
                    const hourlyPhraseRate = Number(qa.hourlyPhrasePayrate) || 0;

                    const [callsAgg, phraseStats, payments] = await Promise.all([
                        CallSession.aggregate([
                            {
                                $match: {
                                    $or: [
                                        { reviewedBy: { $in: [qa._id, String(qa._id)] } },
                                        { "firstQaReview.qaId": { $in: [qa._id, String(qa._id)] } }
                                    ],
                                    callStatus: { $in: ["approved", "rejected"] }
                                }
                            },
                            {
                                $project: {
                                    payout: {
                                        $ifNull: ["$qaCallPayoutUsd", perCallRate]
                                    }
                                }
                            },
                            { $group: { _id: null, count: { $sum: 1 }, totalPayout: { $sum: "$payout" } } }
                        ]),
                        getQaPhraseStats(qa._id, hourlyPhraseRate),
                        PayoutPayment.find({ userId: qa._id }).sort({ paidAt: -1, createdAt: -1 }).lean()
                    ]);

                    const callsReviewed = callsAgg[0]?.count || 0;
                    const callEarningsUsd = Math.round((callsAgg[0]?.totalPayout || 0) * 100) / 100;
                    const phraseHoursFormatted = Math.round(phraseStats.phraseHours * 10000) / 10000;
                    const phraseEarningsUsd = phraseStats.phraseEarningsUsd;
                    const totalEarningsUsd = Math.round((callEarningsUsd + phraseEarningsUsd) * 100) / 100;

                    const totalPaidOutUsd = Math.round(payments.reduce((sum, p) => sum + (Number(p.amountUsd) || 0), 0) * 100) / 100;
                    const totalRemainingUsd = Math.max(0, Math.round((totalEarningsUsd - totalPaidOutUsd) * 100) / 100);

                    return {
                        qaUser: {
                            _id: qa._id,
                            username: qa.username,
                            name: `${qa.firstname || ""} ${qa.lastname || ""}`.trim() || qa.username,
                            email: qa.email,
                            upiId: qa.upiId || "",
                            perCallPayrate: perCallRate,
                            hourlyPhrasePayrate: hourlyPhraseRate,
                        },
                        callsReviewed,
                        phrasesReviewed: phraseStats.phrasesReviewedCount,
                        approvedPhrasesCount: phraseStats.approvedPhrasesCount,
                        rejectedPhrasesCount: phraseStats.rejectedPhrasesCount,
                        totalPhraseSecs: phraseStats.totalPhraseSecs,
                        phraseHours: phraseHoursFormatted,
                        callEarningsUsd,
                        phraseEarningsUsd,
                        totalEarningsUsd,
                        totalPaidOutUsd,
                        totalRemainingUsd,
                        totalRemainingPayoutUsd: totalRemainingUsd,
                        payoutHistory: payments.map(p => ({
                            _id: p._id,
                            amountUsd: p.amountUsd,
                            note: p.note || "QA Workload Payout",
                            paidAt: p.paidAt || p.createdAt,
                            createdAt: p.createdAt
                        }))
                    };
                })
            );

            const totalCompanyQaExpenseUsd = Math.round(stats.reduce((acc, s) => acc + s.totalEarningsUsd, 0) * 100) / 100;

            return res.json({
                isAdminView: true,
                stats,
                totalCompanyQaExpenseUsd
            });
        }

        // Single QA user personal payment breakdown
        const qaUser = targetUserId ? await User.findById(targetUserId).lean() : req.user;
        if (!qaUser) return res.status(404).json({ error: "QA user not found" });

        const perCallRate = Number(qaUser.perCallPayrate) || 0;
        const hourlyPhraseRate = Number(qaUser.hourlyPhrasePayrate) || 0;

        const [callsAgg, approvedCallsCount, rejectedCallsCount, phraseStats, payments, recentCalls, recentApprovedPhrases, recentRejectedPhrases] = await Promise.all([
            CallSession.aggregate([
                {
                    $match: {
                        $or: [
                            { reviewedBy: { $in: [qaUser._id, String(qaUser._id)] } },
                            { "firstQaReview.qaId": { $in: [qaUser._id, String(qaUser._id)] } }
                        ],
                        callStatus: { $in: ["approved", "rejected"] }
                    }
                },
                {
                    $project: {
                        payout: {
                            $ifNull: ["$qaCallPayoutUsd", perCallRate]
                        }
                    }
                },
                { $group: { _id: null, count: { $sum: 1 }, totalPayout: { $sum: "$payout" } } }
            ]),
            CallSession.countDocuments({ reviewedBy: qaUser._id, callStatus: "approved" }),
            CallSession.countDocuments({ reviewedBy: qaUser._id, callStatus: "rejected" }),
            getQaPhraseStats(qaUser._id, hourlyPhraseRate),
            PayoutPayment.find({ userId: qaUser._id }).sort({ paidAt: -1, createdAt: -1 }).lean(),
            CallSession.find({ reviewedBy: qaUser._id, callStatus: { $in: ["approved", "rejected"] } })
                .select("callId callStatus reviewedAt language topicId subtopicId")
                .sort({ reviewedAt: -1 })
                .limit(10)
                .lean(),
            Phrase.find({ qaId: qaUser._id, status: "approved" })
                .select("phraseId status reviewedAt language text projectName duration")
                .sort({ reviewedAt: -1 })
                .limit(10)
                .lean(),
            PhraseRejection.find({ qaId: qaUser._id })
                .select("phraseId language text duration rejectedAt comment")
                .sort({ rejectedAt: -1 })
                .limit(10)
                .lean()
        ]);

        const callsReviewedCount = callsAgg[0]?.count || 0;
        const callEarningsUsd = Math.round((callsAgg[0]?.totalPayout || 0) * 100) / 100;
        const phraseHoursFormatted = Math.round(phraseStats.phraseHours * 10000) / 10000;
        const phraseEarningsUsd = phraseStats.phraseEarningsUsd;
        const totalEarningsUsd = Math.round((callEarningsUsd + phraseEarningsUsd) * 100) / 100;

        const totalPaidOutUsd = Math.round(payments.reduce((sum, p) => sum + (Number(p.amountUsd) || 0), 0) * 100) / 100;
        const totalRemainingUsd = Math.max(0, Math.round((totalEarningsUsd - totalPaidOutUsd) * 100) / 100);

        // Combine recent approved & rejected phrases
        const recentPhrases = [
            ...recentApprovedPhrases.map(p => ({ ...p, status: "approved", actionTime: p.reviewedAt })),
            ...recentRejectedPhrases.map(p => ({ ...p, status: "rejected", actionTime: p.rejectedAt }))
        ].sort((a, b) => new Date(b.actionTime || 0) - new Date(a.actionTime || 0)).slice(0, 10);

        return res.json({
            isAdminView: false,
            qaUser: {
                _id: qaUser._id,
                username: qaUser.username,
                name: `${qaUser.firstname || ""} ${qaUser.lastname || ""}`.trim() || qaUser.username,
                email: qaUser.email,
                upiId: qaUser.upiId || "",
                perCallPayrate: perCallRate,
                hourlyPhrasePayrate: hourlyPhraseRate,
            },
            callsReviewedCount,
            approvedCallsCount,
            rejectedCallsCount,
            phrasesReviewedCount: phraseStats.phrasesReviewedCount,
            approvedPhrasesCount: phraseStats.approvedPhrasesCount,
            rejectedPhrasesCount: phraseStats.rejectedPhrasesCount,
            totalPhraseSecs: phraseStats.totalPhraseSecs,
            phraseHours: phraseHoursFormatted,
            callEarningsUsd,
            phraseEarningsUsd,
            totalEarningsUsd,
            totalPaidOutUsd,
            totalRemainingUsd,
            totalRemainingPayoutUsd: totalRemainingUsd,
            payoutHistory: payments.map(p => ({
                _id: p._id,
                amountUsd: p.amountUsd,
                note: p.note || "QA Workload Payout",
                paidAt: p.paidAt || p.createdAt,
                createdAt: p.createdAt
            })),
            recentCalls,
            recentPhrases
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const getLanguagesHandler = async (req, res) => {
    try {
        if (req.query.type === "phrase") {
            // For phrase projects: return clean Language Names (English, Hindi, Bengali, etc.)
            const phraseLangs = await Language.find({ $or: [{ isPhrase: true }, { type: "phrase" }] }).sort({ name: 1 }).lean();
            
            // Standard curated language presets (Clean Language Names)
            const standardLangs = [
                { name: "English", code: "english" },
                { name: "Hindi", code: "hindi" },
                { name: "Bengali", code: "bengali" },
                { name: "Tamil", code: "tamil" },
                { name: "Telugu", code: "telugu" },
                { name: "Marathi", code: "marathi" },
                { name: "Gujarati", code: "gujarati" },
                { name: "Kannada", code: "kannada" },
                { name: "Malayalam", code: "malayalam" },
                { name: "Punjabi", code: "punjabi" },
                { name: "Odia", code: "odia" },
                { name: "Assamese", code: "assamese" },
                { name: "Urdu", code: "urdu" },
                { name: "Hinglish", code: "hinglish" },
                { name: "Sanskrit", code: "sanskrit" },
                { name: "Bhojpuri", code: "bhojpuri" },
                { name: "Marwari", code: "marwari" },
                { name: "Maithili", code: "maithili" },
                { name: "Kashmiri", code: "kashmiri" },
                { name: "Nepali", code: "nepali" },
                { name: "Sindhi", code: "sindhi" }
            ];

            const langMap = new Map();
            // 1. Add standard languages
            standardLangs.forEach(sl => {
                langMap.set(sl.code.toLowerCase(), {
                    _id: `preset_${sl.code}`,
                    name: sl.name,
                    code: sl.code,
                    language: sl.name,
                    enabled: true,
                    isPhrase: true
                });
            });

            // 2. Add distinct languages found in Phrase collection
            const distinctDbLangs = await Phrase.distinct("language");
            distinctDbLangs.forEach(dl => {
                if (dl) {
                    const code = String(dl).toLowerCase().trim();
                    const name = code.charAt(0).toUpperCase() + code.slice(1);
                    if (!langMap.has(code)) {
                        langMap.set(code, {
                            _id: `db_${code}`,
                            name,
                            code,
                            language: name,
                            enabled: true,
                            isPhrase: true
                        });
                    }
                }
            });

            // 3. Add explicit phrase languages from Language model
            phraseLangs.forEach(pl => {
                const code = String(pl.code || "").toLowerCase().trim();
                const name = pl.name || code.charAt(0).toUpperCase() + code.slice(1);
                langMap.set(code, {
                    ...pl,
                    name,
                    code,
                    language: name
                });
            });

            const sortedPhraseLanguages = Array.from(langMap.values()).sort((a, b) => a.name.localeCompare(b.name));
            return res.json({ languages: sortedPhraseLanguages });
        }

        const query = { isPhrase: { $ne: true } };
        if (req.query.language) {
            const langStr = String(req.query.language).trim();
            query.$or = [
                { language: new RegExp(`^${langStr}$`, 'i') },
                { name: new RegExp(`\\(${langStr}\\)$`, 'i') },
                { code: new RegExp(`-${langStr.toLowerCase()}$`, 'i') },
                { code: langStr.toLowerCase() },
                { name: new RegExp(`^${langStr}$`, 'i') }
            ];
        }
        const langs = await Language.find(query).sort({ name: 1 });
        res.json({ languages: langs });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

qaCallRouter.get("/languages", getLanguagesHandler);

// ===== SINGLE CALL DELETE HANDLER =====
const deleteSingleCallHandler = async (req, res) => {
    try {
        const { callId } = req.params;
        const call = await CallSession.findOne({ callId });
        if (!call) return res.status(404).json({ error: "Call not found" });

        const keysToDelete = [call.recordingAFile, call.recordingBFile, call.mixedRecordingFile].filter(Boolean);
        for (const key of keysToDelete) {
            try {
                if (key.startsWith("local:")) {
                    const localFileName = key.replace("local:", "");
                    const localFilePath = path.join(process.cwd(), "recordings", localFileName);
                    if (fs.existsSync(localFilePath)) {
                        fs.unlinkSync(localFilePath);
                    }
                } else {
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: BUCKET_NAME,
                        Key: key
                    }));
                }
            } catch (err) {
                console.error(`Failed to delete storage file: ${key} for call ${callId}`, err);
            }
        }

        call.recordingAFile = null;
        call.recordingBFile = null;
        call.mixedRecordingFile = null;
        call.adminDeleted = true;
        await call.save();

        res.json({ message: "Call audio deleted from S3 and hidden from Admin Panel", success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ===== BULK DELETE SELECTED CALLS FROM DATABASE AND S3 =====
const bulkDeleteCallsHandler = async (req, res) => {
    try {
        const callIds = req.body?.callIds || req.body?.ids || (req.query?.ids ? req.query.ids.split(",") : []);
        if (!Array.isArray(callIds) || callIds.length === 0) {
            return res.status(400).json({ error: "No callIds provided for bulk deletion." });
        }

        const callsToDelete = await CallSession.find({ callId: { $in: callIds } });

        for (const call of callsToDelete) {
            const keysToDelete = [call.recordingAFile, call.recordingBFile, call.mixedRecordingFile].filter(Boolean);

            for (const key of keysToDelete) {
                try {
                    if (key.startsWith("local:")) {
                        const localFileName = key.replace("local:", "");
                        const localFilePath = path.join(process.cwd(), "recordings", localFileName);
                        if (fs.existsSync(localFilePath)) {
                            fs.unlinkSync(localFilePath);
                        }
                    } else {
                        await s3Client.send(new DeleteObjectCommand({
                            Bucket: BUCKET_NAME,
                            Key: key
                        }));
                    }
                } catch (err) {
                    console.error(`Failed to delete storage file: ${key} for call ${call.callId}`, err);
                }
            }

            call.recordingAFile = null;
            call.recordingBFile = null;
            call.mixedRecordingFile = null;
            call.adminDeleted = true;
            await call.save();
        }

        res.json({
            message: "Selected call audio deleted from S3 and hidden from Admin Panel",
            deletedCount: callsToDelete.length,
            success: true
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

qaCallRouter.delete("/calls/bulk-delete", bulkDeleteCallsHandler);
qaCallRouter.post("/calls/bulk-delete", bulkDeleteCallsHandler);
qaCallRouter.delete("/calls/:callId", deleteSingleCallHandler);

// Granular Scripted Verse QA Review endpoints
qaCallRouter.patch("/scripted/verse/:submissionId/:turnIndex/approve", async (req, res) => {
    try {
        const { submissionId, turnIndex } = req.params;
        const sub = await ScriptedSubmission.findById(submissionId);
        if (!sub) return res.status(404).json({ error: "Submission not found" });

        const verse = (sub.verses || []).find(v => Number(v.turnIndex) === Number(turnIndex));
        if (!verse) return res.status(404).json({ error: "Verse not found" });

        verse.status = "approved";
        verse.rejectionReason = null;
        verse.reviewNote = req.body.note || req.body.reviewNote || null;
        verse.reviewedAt = new Date();
        verse.reviewedBy = req.user._id;

        const allApproved = sub.verses.length > 0 && sub.verses.every(v => v.status === "approved");
        const hasRejected = sub.verses.some(v => v.status === "rejected");

        if (allApproved) {
            sub.status = "approved";
        } else if (hasRejected) {
            sub.status = "needs_rerecord";
        } else {
            sub.status = "partially_approved";
        }

        await sub.save();

        if (sub.callSessionId) {
            const call = await CallSession.findById(sub.callSessionId);
            if (call) {
                const isUserA = String(sub.userId) === String(call.userA);
                if (isUserA) {
                    call.recordingAStatus = allApproved ? "approved" : "pending";
                    call.recordingAReviewNote = verse.reviewNote;
                } else {
                    call.recordingBStatus = allApproved ? "approved" : "pending";
                    call.recordingBReviewNote = verse.reviewNote;
                }

                // Check other participant's submission
                const otherUserId = isUserA ? call.userB : call.userA;
                let otherApproved = false;
                if (otherUserId) {
                    const otherSub = await ScriptedSubmission.findOne({ 
                        $or: [
                            { callSessionId: call._id, userId: otherUserId },
                            { subtopicId: call.subtopicId, userId: otherUserId }
                        ]
                    });
                    if (otherSub && otherSub.verses?.length > 0) {
                        otherApproved = otherSub.verses.every(v => v.status === "approved");
                    }
                }

                if (allApproved && otherApproved) {
                    call.recordingAStatus = "approved";
                    call.recordingBStatus = "approved";
                    call.callStatus = "approved";
                    call.reviewedBy = req.user._id;
                    call.reviewedAt = new Date();
                } else {
                    call.callStatus = "pending"; // Keeps scripted call in pending until all phrases are approved
                }
                await call.save();
            }
        }

        res.json({ success: true, message: "Verse approved", verse, submission: sub });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

qaCallRouter.patch("/scripted/verse/:submissionId/:turnIndex/reject", async (req, res) => {
    try {
        const { submissionId, turnIndex } = req.params;
        const { rejectionReason, note, reviewNote } = req.body;

        const sub = await ScriptedSubmission.findById(submissionId);
        if (!sub) return res.status(404).json({ error: "Submission not found" });

        const verse = (sub.verses || []).find(v => Number(v.turnIndex) === Number(turnIndex));
        if (!verse) return res.status(404).json({ error: "Verse not found" });

        verse.status = "rejected";
        verse.rejectionReason = rejectionReason || "Needs re-recording";
        verse.reviewNote = note || reviewNote || "";
        verse.reviewedAt = new Date();
        verse.reviewedBy = req.user._id;

        sub.status = "needs_rerecord";
        await sub.save();

        if (sub.callSessionId) {
            const call = await CallSession.findById(sub.callSessionId);
            if (call) {
                const isUserA = String(sub.userId) === String(call.userA);
                if (isUserA) {
                    call.recordingAStatus = "pending";
                    call.recordingARejectionReason = verse.rejectionReason;
                    call.recordingAReviewNote = verse.reviewNote;
                } else {
                    call.recordingBStatus = "pending";
                    call.recordingBRejectionReason = verse.rejectionReason;
                    call.recordingBReviewNote = verse.reviewNote;
                }
                // Scripted calls NEVER move to rejected; they remain in pending until all phrases are re-recorded and approved
                call.callStatus = "pending";
                call.reviewedBy = req.user._id;
                call.reviewedAt = new Date();
                await call.save();
            }
        }

        res.json({ success: true, message: "Verse rejected for re-recording", verse, submission: sub });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

qaCallRouter.post("/scripted/submission/:submissionId/approve-all", async (req, res) => {
    try {
        const { submissionId } = req.params;
        const sub = await ScriptedSubmission.findById(submissionId);
        if (!sub) return res.status(404).json({ error: "Submission not found" });

        const now = new Date();
        for (const v of sub.verses) {
            v.status = "approved";
            v.rejectionReason = null;
            v.reviewedAt = now;
            v.reviewedBy = req.user._id;
        }
        sub.status = "approved";
        await sub.save();

        if (sub.callSessionId) {
            const call = await CallSession.findById(sub.callSessionId);
            if (call) {
                const hourlyPayout = await getLanguageHourlyPayout(call.language);
                const isUserA = String(sub.userId) === String(call.userA);
                const durSec = (sub.verses || []).reduce((sum, v) => sum + (Number(v.durationSec) || 0), 0);
                const durMin = durSec > 0 ? Math.max(0.01, +(durSec / 60).toFixed(2)) : (Number(isUserA ? call.recordingADurationMinutes : call.recordingBDurationMinutes) || 0);

                if (isUserA) {
                    call.recordingAStatus = "approved";
                    call.recordingADurationMinutes = durMin;
                    call.recordingAPayoutUsd = roundCurrency((hourlyPayout * durMin) / 60);
                } else {
                    call.recordingBStatus = "approved";
                    call.recordingBDurationMinutes = durMin;
                    call.recordingBPayoutUsd = roundCurrency((hourlyPayout * durMin) / 60);
                }

                if (call.recordingAStatus === "approved" && call.recordingBStatus === "approved") {
                    call.callStatus = "approved";
                    call.reviewedBy = req.user._id;
                    call.reviewedAt = now;
                }
                await call.save();
            }
        }

        res.json({ success: true, message: "All verses approved for submission", submission: sub });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

qaCallRouter.post("/scripted/call/:callId/approve-all", async (req, res) => {
    try {
        const { callId } = req.params;
        const call = await CallSession.findOne({ callId });
        if (!call) return res.status(404).json({ error: "Call not found" });

        const now = new Date();
        const [subA, subB] = await Promise.all([
            ScriptedSubmission.findOne({ subtopicId: call.subtopicId, userId: call.userA }),
            ScriptedSubmission.findOne({ subtopicId: call.subtopicId, userId: call.userB })
        ]);

        const hourlyPayout = await getLanguageHourlyPayout(call.language);

        if (subA) {
            for (const v of subA.verses) {
                v.status = "approved";
                v.rejectionReason = null;
                v.reviewedAt = now;
                v.reviewedBy = req.user._id;
            }
            subA.status = "approved";
            await subA.save();

            const durSecA = (subA.verses || []).reduce((sum, v) => sum + (Number(v.durationSec) || 0), 0);
            const durMinA = durSecA > 0 ? Math.max(0.01, +(durSecA / 60).toFixed(2)) : (Number(call.recordingADurationMinutes) || 0);
            call.recordingADurationMinutes = durMinA;
            call.recordingAPayoutUsd = roundCurrency((hourlyPayout * durMinA) / 60);
        }

        if (subB) {
            for (const v of subB.verses) {
                v.status = "approved";
                v.rejectionReason = null;
                v.reviewedAt = now;
                v.reviewedBy = req.user._id;
            }
            subB.status = "approved";
            await subB.save();

            const durSecB = (subB.verses || []).reduce((sum, v) => sum + (Number(v.durationSec) || 0), 0);
            const durMinB = durSecB > 0 ? Math.max(0.01, +(durSecB / 60).toFixed(2)) : (Number(call.recordingBDurationMinutes) || 0);
            call.recordingBDurationMinutes = durMinB;
            call.recordingBPayoutUsd = roundCurrency((hourlyPayout * durMinB) / 60);
        }

        call.recordingAStatus = "approved";
        call.recordingBStatus = "approved";
        call.callStatus = "approved";
        call.reviewedBy = req.user._id;
        call.reviewedAt = now;
        call.qaLockedBy = null;
        call.qaLockedAt = null;
        await call.save();

        res.json({ success: true, message: "Entire scripted dialogue approved!", call });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

qaCallRouter.post("/scripted/call/:callId/submit-review", async (req, res) => {
    try {
        const { callId } = req.params;
        const { decisions } = req.body; // Array of { submissionId, turnIndex, status, rejectionReason, reviewNote }

        if (!Array.isArray(decisions) || decisions.length === 0) {
            return res.status(400).json({ error: "No review decisions provided." });
        }

        const call = await CallSession.findOne({ callId });
        if (!call) return res.status(404).json({ error: "Scripted call not found." });

        const now = new Date();

        // Group decisions by submissionId
        const decisionsBySub = {};
        for (const d of decisions) {
            if (!d.submissionId) continue;
            if (!decisionsBySub[d.submissionId]) decisionsBySub[d.submissionId] = [];
            decisionsBySub[d.submissionId].push(d);
        }

        let allSubmissionsApproved = true;
        let anySubmissionsRejected = false;

        for (const subId of Object.keys(decisionsBySub)) {
            const sub = await ScriptedSubmission.findById(subId);
            if (!sub) continue;

            for (const d of decisionsBySub[subId]) {
                const verse = (sub.verses || []).find(v => Number(v.turnIndex) === Number(d.turnIndex));
                if (verse) {
                    verse.status = d.status === "rejected" ? "rejected" : "approved";
                    verse.rejectionReason = d.status === "rejected" ? (d.rejectionReason || "Needs re-recording") : null;
                    verse.reviewNote = d.status === "rejected" ? (d.reviewNote || "") : (d.reviewNote || null);
                    verse.reviewedAt = now;
                    verse.reviewedBy = req.user._id;
                }
            }

            const subHasRejected = sub.verses.some(v => v.status === "rejected");
            const subAllApproved = sub.verses.length > 0 && sub.verses.every(v => v.status === "approved");

            if (subHasRejected) {
                sub.status = "needs_rerecord"; // ONLY NOW is the submission set to needs_rerecord!
                anySubmissionsRejected = true;
                allSubmissionsApproved = false;
            } else if (subAllApproved) {
                sub.status = "approved";
            } else {
                sub.status = "partially_approved";
                allSubmissionsApproved = false;
            }

            await sub.save();
        }

        // Update CallSession status
        if (allSubmissionsApproved) {
            call.recordingAStatus = "approved";
            call.recordingBStatus = "approved";
            call.callStatus = "approved";
        } else {
            call.recordingAStatus = "pending";
            call.recordingBStatus = "pending";
            call.callStatus = "pending"; // Keeps call in pending until re-records complete!
        }
        call.reviewedBy = req.user._id;
        call.reviewedAt = now;
        call.qaLockedBy = null;
        call.qaLockedAt = null;
        await call.save();

        res.json({
            success: true,
            message: allSubmissionsApproved ? "All verses approved! Call marked as Approved." : "Review submitted. Rejected verses sent for contributor re-recording.",
            callStatus: call.callStatus,
            allApproved: allSubmissionsApproved
        });
    } catch (err) {
        console.error("Scripted review submit error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Mount QA router BEFORE isAdmin — this must stay here
router.use("/qa", qaCallRouter);

const sharedLanguageReviewRouter = express.Router();
sharedLanguageReviewRouter.use(requireAuth(JWT_SECRET));
sharedLanguageReviewRouter.use(isAdminOrQA);
sharedLanguageReviewRouter.get("/language-applications/hierarchy", getPhraseApplicationsHierarchy);
sharedLanguageReviewRouter.get("/phrase-apps/hierarchy", getPhraseApplicationsHierarchy);
sharedLanguageReviewRouter.get("/language-applications", listLanguageApplications);
sharedLanguageReviewRouter.patch("/language-applications/:userId/:appId/approve", approveLanguageApplication);
sharedLanguageReviewRouter.patch("/language-applications/:userId/:appId/reject", rejectLanguageApplication);
sharedLanguageReviewRouter.post("/language-applications/:userId/:appId/analyze", analyzeLanguageApplication);
sharedLanguageReviewRouter.delete("/calls/bulk-delete", bulkDeleteCallsHandler);
sharedLanguageReviewRouter.post("/calls/bulk-delete", bulkDeleteCallsHandler);
sharedLanguageReviewRouter.delete("/calls/:callId", deleteSingleCallHandler);
sharedLanguageReviewRouter.get("/languages", getLanguagesHandler);
router.use("/", sharedLanguageReviewRouter);
router.use("/qa", sharedLanguageReviewRouter);

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

        const targetUser = await User.findById(req.params.userId).select("isAdmin isQA").lean();
        if (!targetUser) return res.status(404).json({ error: "User not found" });

        const payout = await getSingleUserPayout(req.params.userId);
        if (!targetUser.isQA && (!payout || amountUsd > payout.summary.totalRemainingPayoutUsd + 0.01)) {
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

        const isScripted = req.query.mode === "scripted";
        const query = { 
            adminDeleted: { $ne: true },
            callId: isScripted ? /^scripted_/ : { $not: /^scripted_/ }
        };
        if (req.query.status) {
            if (req.query.status === "logs" || req.query.status === "reviewed") {
                query.callStatus = { $in: ["approved", "rejected"] };
            } else if (req.query.status === "rejected") {
                if (req.query.rejectedSubTab === "monologued") {
                    query.$or = [
                        { recordingAMonologueStatus: "transcribed" },
                        { recordingBMonologueStatus: "transcribed" },
                        { isMonologued: true }
                    ];
                } else if (req.query.rejectedSubTab === "pending_rejected") {
                    query.$and = [
                        {
                            $or: [
                                { callStatus: "rejected" },
                                { recordingAStatus: "rejected" },
                                { recordingBStatus: "rejected" }
                            ]
                        },
                        {
                            $or: [
                                { recordingAMonologueStatus: { $in: ["pending", null] } },
                                { recordingBMonologueStatus: { $in: ["pending", null] } }
                            ]
                        }
                    ];
                } else {
                    query.$or = [
                        { callStatus: "rejected" },
                        { recordingAStatus: "rejected" },
                        { recordingBStatus: "rejected" }
                    ];
                }
            } else if (req.query.status === "pending_segmentation") {
                const subtab = req.query.pipelineSubTab || "calls";
                // Calls queued for segmentation/transcription where segmentation is NOT yet done or not yet QA approved
                const tCalls = await TranscriptionCall.find({
                    $or: [
                        { Segmentation_Done: { $ne: true } },
                        { segmentation_qa: { $ne: true } }
                    ]
                }).lean();
                const eligibleCallIds = tCalls.map(t => t.call_id.replace(/_user[AB]$/, '').replace(/_monologue$/, ''));

                query.$and = query.$and || [];
                query.$and.push({
                    $or: [
                        { callId: { $in: eligibleCallIds } },
                        { transcribedAsCall: true },
                        { isMonologued: true }
                    ]
                });
                if (subtab === "calls") {
                    query.$and.push({ isMonologued: { $ne: true } });
                } else if (subtab === "monologues") {
                    query.$and.push({ isMonologued: true });
                }
            } else if (req.query.status === "pending_transcription") {
                const subtab = req.query.pipelineSubTab || "calls";
                // Calls where segmentation QA is approved (or monologue) but transcription/transcription QA is not yet completed
                const tCalls = await TranscriptionCall.find({
                    $and: [
                        {
                            $or: [
                                { segmentation_qa: true },
                                { isMonologue: true },
                                { Segmentation_Done: true }
                            ]
                        },
                        {
                            $or: [
                                { transcription_status: { $ne: 'QA_APPROVED' } },
                                { transcription_status: { $in: ['PENDING_TRANSCRIPTION', 'IN_TRANSCRIPTION', 'TRANSCRIPTION_COMPLETED', null] } }
                            ]
                        }
                    ]
                }).lean();
                const eligibleCallIds = tCalls.map(t => t.call_id.replace(/_user[AB]$/, '').replace(/_monologue$/, ''));

                query.$and = query.$and || [];
                query.$and.push({
                    $or: [
                        { callId: { $in: eligibleCallIds } },
                        { transcribedAsCall: true },
                        { isMonologued: true }
                    ]
                });
                if (subtab === "calls") {
                    query.$and.push({ isMonologued: { $ne: true } });
                } else if (subtab === "monologues") {
                    query.$and.push({ isMonologued: true });
                }
            } else if (req.query.status === "finished") {
                const subtab = req.query.pipelineSubTab || "calls";
                // Calls where segmentation, segmentation QA, transcription, and transcription QA are all approved
                const tCalls = await TranscriptionCall.find({
                    Segmentation_Done: true,
                    segmentation_qa: true,
                    transcription_status: 'QA_APPROVED'
                }).lean();
                const eligibleCallIds = tCalls.map(t => t.call_id.replace(/_user[AB]$/, '').replace(/_monologue$/, ''));

                query.$and = query.$and || [];
                query.$and.push({
                    callId: { $in: eligibleCallIds }
                });
                if (subtab === "calls") {
                    query.$and.push({ isMonologued: { $ne: true } });
                } else if (subtab === "monologues") {
                    query.$and.push({ isMonologued: true });
                }
            } else if (req.query.status === "pending") {
                query.callStatus = "pending";
                query.callActuallyStarted = true;
            } else if (req.query.status === "approved") {
                query.callStatus = "approved";
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
            .limit(limit)
            .lean();

        // Attach TranscriptionCall pipeline info for rich status rendering
        const callIds = calls.map(c => c.callId);
        const relatedTCalls = await TranscriptionCall.find({
            $or: [
                { call_id: { $in: callIds } },
                { call_id: { $in: callIds.map(id => `${id}_userA`) } },
                { call_id: { $in: callIds.map(id => `${id}_userB`) } },
                { call_id: { $in: callIds.map(id => `${id}_monologue`) } }
            ]
        }).lean();

        const tMap = new Map();
        for (const t of relatedTCalls) {
            tMap.set(t.call_id, t);
        }

        const callsWithPipelineInfo = calls.map(c => {
            const t = tMap.get(c.callId) || tMap.get(`${c.callId}_userA`) || tMap.get(`${c.callId}_userB`) || tMap.get(`${c.callId}_monologue`) || {};
            return {
                ...c,
                transcriptionCall: t,
                Segmentation_Done: t.Segmentation_Done || false,
                segmentation_qa: t.segmentation_qa || false,
                total_segments: t.total_segments || 0,
                qa_verified_segments_count: t.qa_verified_segments_count || 0,
                transcription_status: t.transcription_status || (c.transcribedAsCall ? 'PENDING_TRANSCRIPTION' : null)
            };
        });

        res.json({
            calls: callsWithPipelineInfo,
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

// ===== TRANSCRIBE REJECTED RECORDING AS MONOLOGUE =====
router.post("/calls/:callId/transcribe-monologue", async (req, res) => {
    try {
        const { callId } = req.params;
        const { speaker } = req.body; // 'userA' or 'userB'

        const call = await CallSession.findOne({ callId })
            .populate("userA", "firstname lastname username email speaker_id")
            .populate("userB", "firstname lastname username email speaker_id");

        if (!call) return res.status(404).json({ error: "Call not found" });

        let chosenUser;
        let recordingFile;

        if (speaker === "userA") {
            chosenUser = call.userA;
            recordingFile = call.recordingAFile;
            call.recordingAMonologueStatus = 'transcribed';
        } else if (speaker === "userB") {
            chosenUser = call.userB;
            recordingFile = call.recordingBFile;
            call.recordingBMonologueStatus = 'transcribed';
        } else {
            return res.status(400).json({ error: "Invalid speaker selected. Must be userA or userB." });
        }

        if (!recordingFile) {
            return res.status(400).json({ error: `No audio recording found for ${speaker}.` });
        }

        // Mark CallSession as monologued
        call.isMonologued = true;
        const monologueCallId = `${call.callId}_${speaker}`;

        call.monologueDetails = {
            ...(call.monologueDetails || {}),
            [speaker]: {
                status: 'transcribed',
                sentAt: new Date(),
                sentBy: req.user?._id || null,
                speakerName: chosenUser?.username || speaker,
                transcriptionCallId: monologueCallId
            }
        };
        call.markModified('monologueDetails');
        await call.save();

        // Create or update TranscriptionCall record for monologue queue
        let transDoc = await TranscriptionCall.findOne({ call_id: monologueCallId });
        if (!transDoc) {
            transDoc = new TranscriptionCall({
                call_id: monologueCallId,
                audio1Name: recordingFile,
                audio2Name: '',
                isMonologue: true,
                monologueSpeaker: chosenUser?.username || speaker,
                ready_for_transcription: true,
                transcription_status: 'PENDING_TRANSCRIPTION',
                Segmentation_Done: true,
            });
            await transDoc.save();
        }

        res.json({
            success: true,
            message: `Audio for ${chosenUser?.username || speaker} successfully sent for monologue transcription!`,
            call,
            monologueCallId
        });
    } catch (error) {
        console.error("Error sending monologue transcription:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== REJECT RECORDING AS MONOLOGUE =====
router.post("/calls/:callId/reject-monologue", async (req, res) => {
    try {
        const { callId } = req.params;
        const { speaker } = req.body; // 'userA' or 'userB'

        const call = await CallSession.findOne({ callId })
            .populate("userA", "firstname lastname username email speaker_id")
            .populate("userB", "firstname lastname username email speaker_id");

        if (!call) return res.status(404).json({ error: "Call not found" });

        let chosenUser;
        if (speaker === "userA") {
            chosenUser = call.userA;
            call.recordingAMonologueStatus = 'rejected';
        } else if (speaker === "userB") {
            chosenUser = call.userB;
            call.recordingBMonologueStatus = 'rejected';
        } else {
            return res.status(400).json({ error: "Invalid speaker selected. Must be userA or userB." });
        }

        call.monologueDetails = {
            ...(call.monologueDetails || {}),
            [speaker]: {
                status: 'rejected',
                rejectedAt: new Date(),
                rejectedBy: req.user?._id || null,
                speakerName: chosenUser?.username || speaker
            }
        };
        call.markModified('monologueDetails');
        await call.save();

        res.json({
            success: true,
            message: `Recording for ${chosenUser?.username || speaker} marked as rejected from monologue transcription.`,
            call
        });
    } catch (error) {
        console.error("Error rejecting monologue recording:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== TRANSCRIBE REJECTED/ANY CALL AS FULL CALL DIALOGUE (ADMIN ONLY) =====
router.post("/calls/:callId/transcribe-call", async (req, res) => {
    try {
        const { callId } = req.params;

        const call = await CallSession.findOne({ callId })
            .populate("userA", "firstname lastname username email speaker_id")
            .populate("userB", "firstname lastname username email speaker_id");

        if (!call) return res.status(404).json({ error: "Call not found" });

        if (!call.recordingAFile && !call.recordingBFile) {
            return res.status(400).json({ error: "No audio recordings found for this call." });
        }

        // Mark CallSession as transcribed as full call
        call.transcribedAsCall = true;
        call.callTranscriptionStatus = 'transcribed';
        call.isMonologued = false; // ensure it's treated as full call
        await call.save();

        // Create or update TranscriptionCall record for full call queue
        let transDoc = await TranscriptionCall.findOne({ call_id: call.callId });
        if (!transDoc) {
            transDoc = new TranscriptionCall({
                call_id: call.callId,
                audio1Name: call.recordingAFile || '',
                audio2Name: call.recordingBFile || '',
                isMonologue: false,
                ready_for_transcription: true,
                transcription_status: 'PENDING_TRANSCRIPTION',
                Segmentation_Done: false,
            });
            await transDoc.save();
        } else {
            transDoc.audio1Name = call.recordingAFile || transDoc.audio1Name || '';
            transDoc.audio2Name = call.recordingBFile || transDoc.audio2Name || '';
            transDoc.isMonologue = false;
            transDoc.ready_for_transcription = true;
            await transDoc.save();
        }

        res.json({
            success: true,
            message: `Call ${call.callId} successfully sent for full call transcription!`,
            call
        });
    } catch (error) {
        console.error("Error sending call transcription:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===== CANCEL TRANSCRIBE CALL (ADMIN ONLY) =====
router.post("/calls/:callId/cancel-transcribe-call", async (req, res) => {
    try {
        const { callId } = req.params;

        const call = await CallSession.findOne({ callId });
        if (!call) return res.status(404).json({ error: "Call not found" });

        call.transcribedAsCall = false;
        call.callTranscriptionStatus = null;
        call.isApprovedForTranscription = false;
        await call.save();

        await TranscriptionCall.deleteOne({ call_id: call.callId, isMonologue: { $ne: true } });

        res.json({
            success: true,
            message: `Call ${call.callId} removed from call transcription queue.`,
            call
        });
    } catch (error) {
        console.error("Error cancelling call transcription:", error);
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
        const userAStr = (call.userA?._id || call.userA || "").toString();
        const userBStr = (call.userB?._id || call.userB || "").toString();
        if (userAStr === String(userId)) {
            recordingFile = call.recordingAFile;
        } else if (userBStr === String(userId)) {
            recordingFile = call.recordingBFile;
        } else {
            return res.status(404).json({ error: "User not part of this call" });
        }

        if (!recordingFile) {
            return res.status(404).json({ error: "Recording not available" });
        }

        const candidatePaths = [
            path.resolve(process.cwd(), "recordings", recordingFile),
            path.resolve(process.cwd(), "recordings", path.basename(recordingFile)),
            path.resolve(process.cwd(), "recordings", "calls", path.basename(recordingFile)),
            path.resolve(process.cwd(), "uploads", path.basename(recordingFile)),
            path.resolve(process.cwd(), "uploads", "scripted_temp", path.basename(recordingFile)),
            path.resolve(recordingFile)
        ];

        let localFoundPath = null;
        for (const p of candidatePaths) {
            if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                localFoundPath = p;
                break;
            }
        }

        if (localFoundPath) {
            const ext = path.extname(localFoundPath).toLowerCase();
            const mimeType = ext === ".flac" ? "audio/flac" : ext === ".wav" ? "audio/wav" : ext === ".ogg" ? "audio/ogg" : "audio/webm";
            const stat = fs.statSync(localFoundPath);
            const total = stat.size;

            if (req.headers.range) {
                const parts = req.headers.range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
                const chunksize = end - start + 1;
                const fileStream = fs.createReadStream(localFoundPath, { start, end });
                res.writeHead(206, {
                    "Content-Range": `bytes ${start}-${end}/${total}`,
                    "Accept-Ranges": "bytes",
                    "Content-Length": chunksize,
                    "Content-Type": mimeType
                });
                return fileStream.pipe(res);
            } else {
                res.writeHead(200, {
                    "Content-Length": total,
                    "Content-Type": mimeType,
                    "Accept-Ranges": "bytes"
                });
                return fs.createReadStream(localFoundPath).pipe(res);
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
        const { subproject, language } = req.query;
        const target = (subproject || language || "").trim();
        const query = {};
        if (target) {
            query.$or = [
                { languages: target },
                { languages: { $regex: new RegExp(`^${target}$`, "i") } }
            ];
        }
        const topics = await Topic.find(query).sort({ createdAt: -1 });
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

// ===== SCRIPTED TOPICS & SUBTOPICS MANAGEMENT (Independent from Call Topics) =====

// List all scripted topics with subtopics
router.get("/scripted-topics", async (req, res) => {
    try {
        const { subproject, language } = req.query;
        const target = (subproject || language || "").trim();
        const query = {};
        if (target) {
            query.$or = [
                { languages: target },
                { languages: { $regex: new RegExp(`^${target}$`, "i") } }
            ];
        }
        const topics = await ScriptedTopic.find(query).sort({ createdAt: -1 });
        const topicsWithSubtopics = await Promise.all(
            topics.map(async (topic) => {
                const subtopics = await ScriptedSubtopic.find({ topicId: topic._id }).sort({ createdAt: -1 });
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
                        const limit = sub.frequency !== undefined ? sub.frequency : (sub.maxCalls !== undefined ? sub.maxCalls : 3);

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

// Create scripted topic
router.post("/scripted-topics", async (req, res) => {
    try {
        const { title, description, isEnabled, languages, frequency } = req.body;

        if (!title) {
            return res.status(400).json({ error: "Title is required" });
        }

        const topic = new ScriptedTopic({
            title,
            description,
            frequency: frequency !== undefined ? Number(frequency) : 3,
            isEnabled: isEnabled !== undefined ? isEnabled : true,
            languages: Array.isArray(languages) ? languages : [],
        });

        await topic.save();
        res.status(201).json({ topic });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update scripted topic
router.put("/scripted-topics/:topicId", async (req, res) => {
    try {
        const { topicId } = req.params;
        const { title, description, isEnabled, languages, frequency } = req.body;

        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (isEnabled !== undefined) updateData.isEnabled = isEnabled;
        if (frequency !== undefined) updateData.frequency = Number(frequency);
        if (languages !== undefined) updateData.languages = Array.isArray(languages) ? languages : [];

        const topic = await ScriptedTopic.findByIdAndUpdate(
            topicId,
            updateData,
            { new: true, runValidators: true }
        );

        if (!topic) {
            return res.status(404).json({ error: "Scripted Topic not found" });
        }

        res.json({ topic });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete scripted topic
router.delete("/scripted-topics/:topicId", async (req, res) => {
    try {
        const { topicId } = req.params;

        await ScriptedSubtopic.deleteMany({ topicId });

        const topic = await ScriptedTopic.findByIdAndDelete(topicId);
        if (!topic) {
            return res.status(404).json({ error: "Scripted Topic not found" });
        }

        res.json({ message: "Scripted Topic and its subtopics deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper to parse 2-person dialogue formatted as "Speaker 1 || Speaker 2"
function parseDialogueScript(rawText) {
    if (!rawText || typeof rawText !== "string") return [];
    const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);
    const turns = [];
    let order = 1;
    for (const line of lines) {
        if (line.includes("||")) {
            const parts = line.split("||");
            const spk1 = (parts[0] || "").trim();
            const spk2 = (parts.slice(1).join("||") || "").trim();
            if (spk1 || spk2) {
                turns.push({ order: order++, speaker1: spk1, speaker2: spk2 });
            }
        } else if (line.toLowerCase().startsWith("speaker 1:") || line.toLowerCase().startsWith("speaker1:")) {
            const spk1 = line.replace(/^speaker\s*1\s*:\s*/i, "").trim();
            turns.push({ order: order++, speaker1: spk1, speaker2: "" });
        } else if (line.toLowerCase().startsWith("speaker 2:") || line.toLowerCase().startsWith("speaker2:")) {
            if (turns.length > 0 && !turns[turns.length - 1].speaker2) {
                turns[turns.length - 1].speaker2 = line.replace(/^speaker\s*2\s*:\s*/i, "").trim();
            } else {
                turns.push({ order: order++, speaker1: "", speaker2: line.replace(/^speaker\s*2\s*:\s*/i, "").trim() });
            }
        }
    }
    return turns;
}

// Create scripted subtopic (with 2-person dialogue script support)
router.post("/scripted-topics/:topicId/subtopics", async (req, res) => {
    try {
        const { topicId } = req.params;
        const { title, description, instructions, rawScript, dialogueTurns, speaker1Gender, speaker2Gender, maxCalls, isEnabled } = req.body;

        if (!title) {
            return res.status(400).json({ error: "Title is required" });
        }

        const topic = await ScriptedTopic.findById(topicId);
        if (!topic) {
            return res.status(404).json({ error: "Scripted Topic not found" });
        }

        let parsedTurns = Array.isArray(dialogueTurns) && dialogueTurns.length > 0 
            ? dialogueTurns 
            : parseDialogueScript(rawScript || instructions || "");

        const targetFreq = req.body.frequency !== undefined ? Number(req.body.frequency) : (maxCalls !== undefined ? Number(maxCalls) : 3);

        const subtopic = new ScriptedSubtopic({
            topicId,
            title,
            description,
            instructions,
            rawScript: rawScript || (parsedTurns.length > 0 ? parsedTurns.map(t => `${t.speaker1} || ${t.speaker2}`).join("\n") : ""),
            dialogueTurns: parsedTurns,
            speaker1Gender: ["any", "male", "female"].includes(speaker1Gender) ? speaker1Gender : "any",
            speaker2Gender: ["any", "male", "female"].includes(speaker2Gender) ? speaker2Gender : "any",
            frequency: targetFreq,
            maxCalls: targetFreq,
            isEnabled: isEnabled !== undefined ? isEnabled : true,
        });

        await subtopic.save();
        res.status(201).json({ subtopic });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Bulk upload scripted scenarios for a topic
router.post("/scripted-topics/:topicId/bulk-subtopics", async (req, res) => {
    try {
        const { topicId } = req.params;
        const { scenarios } = req.body; // Array of { title, description, rawScript, maxCalls, isEnabled }

        if (!Array.isArray(scenarios) || scenarios.length === 0) {
            return res.status(400).json({ error: "An array of scenarios is required" });
        }

        const topic = await ScriptedTopic.findById(topicId);
        if (!topic) {
            return res.status(404).json({ error: "Scripted Topic not found" });
        }

        const createdSubtopics = [];
        for (const item of scenarios) {
            if (!item.title) continue;
            const parsedTurns = parseDialogueScript(item.rawScript || item.instructions || "");
            const targetFreq = item.frequency !== undefined ? Number(item.frequency) : (item.maxCalls !== undefined ? Number(item.maxCalls) : 3);
            const sub = new ScriptedSubtopic({
                topicId,
                title: item.title,
                description: item.description || "",
                instructions: item.instructions || "",
                rawScript: item.rawScript || (parsedTurns.length > 0 ? parsedTurns.map(t => `${t.speaker1} || ${t.speaker2}`).join("\n") : ""),
                dialogueTurns: parsedTurns,
                speaker1Gender: ["any", "male", "female"].includes(item.speaker1Gender) ? item.speaker1Gender : "any",
                speaker2Gender: ["any", "male", "female"].includes(item.speaker2Gender) ? item.speaker2Gender : "any",
                frequency: targetFreq,
                maxCalls: targetFreq,
                isEnabled: item.isEnabled !== undefined ? Boolean(item.isEnabled) : true,
            });
            await sub.save();
            createdSubtopics.push(sub);
        }

        res.status(201).json({ count: createdSubtopics.length, subtopics: createdSubtopics });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update scripted subtopic
router.put("/scripted-subtopics/:subtopicId", async (req, res) => {
    try {
        const { subtopicId } = req.params;
        const updateData = {};
        if (req.body.title !== undefined) updateData.title = req.body.title;
        if (req.body.description !== undefined) updateData.description = req.body.description;
        if (req.body.instructions !== undefined) updateData.instructions = req.body.instructions;
        if (req.body.speaker1Gender !== undefined) {
            updateData.speaker1Gender = ["any", "male", "female"].includes(req.body.speaker1Gender) ? req.body.speaker1Gender : "any";
        }
        if (req.body.speaker2Gender !== undefined) {
            updateData.speaker2Gender = ["any", "male", "female"].includes(req.body.speaker2Gender) ? req.body.speaker2Gender : "any";
        }
        if (req.body.frequency !== undefined) {
            updateData.frequency = Number(req.body.frequency);
            updateData.maxCalls = Number(req.body.frequency);
        } else if (req.body.maxCalls !== undefined) {
            updateData.maxCalls = Number(req.body.maxCalls);
            updateData.frequency = Number(req.body.maxCalls);
        }
        if (req.body.isEnabled !== undefined) updateData.isEnabled = Boolean(req.body.isEnabled);
        
        if (req.body.rawScript !== undefined || req.body.dialogueTurns !== undefined) {
            if (Array.isArray(req.body.dialogueTurns)) {
                updateData.dialogueTurns = req.body.dialogueTurns;
                updateData.rawScript = req.body.rawScript || req.body.dialogueTurns.map(t => `${t.speaker1} || ${t.speaker2}`).join("\n");
            } else if (req.body.rawScript !== undefined) {
                updateData.rawScript = req.body.rawScript;
                updateData.dialogueTurns = parseDialogueScript(req.body.rawScript);
            }
        }

        const subtopic = await ScriptedSubtopic.findByIdAndUpdate(
            subtopicId,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        if (!subtopic) {
            return res.status(404).json({ error: "Scripted Subtopic not found" });
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
        const limit = subtopic.frequency !== undefined ? subtopic.frequency : (subtopic.maxCalls !== undefined ? subtopic.maxCalls : 3);

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

// Delete scripted subtopic
router.delete("/scripted-subtopics/:subtopicId", async (req, res) => {
    try {
        const { subtopicId } = req.params;

        const subtopic = await ScriptedSubtopic.findByIdAndDelete(subtopicId);
        if (!subtopic) {
            return res.status(404).json({ error: "Scripted Subtopic not found" });
        }

        res.json({ message: "Scripted Subtopic deleted successfully" });
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

        const filter = { isAdmin: false, isDeleted: { $ne: true } };
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
            .select('username email firstname lastname mobileNumber phone dailyCallLimit overallCallLimit dailyPhraseLimit overallPhraseLimit accountStatus isDisabled createdAt')
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
        const filter = { isAdmin: false, isDeleted: { $ne: true }, accountStatus: "pending_approval" };
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
            .select('username email firstname lastname mobileNumber phone gender regionalLanguage locality address microphoneBrand microphoneModel introRecordingFile createdAt')
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

// Toggle disable status for a user
router.patch("/users/:userId/toggle-disable", async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        user.isDisabled = !user.isDisabled;
        await user.save();

        res.json({
            message: user.isDisabled ? "User disabled successfully" : "User enabled successfully",
            isDisabled: user.isDisabled,
            user: { _id: user._id, username: user.username, isDisabled: user.isDisabled }
        });
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

// Soft-delete a user while preserving demographic metadata for phrase dataset exports
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
            user.introRecordingFile = null;
        }

        const timestamp = Date.now();
        user.email = `deleted_${timestamp}_${user.email}`;
        user.username = `deleted_${timestamp}_${user.username}`;
        user.isDeleted = true;
        user.isDisabled = true;
        user.tokenVersion = (user.tokenVersion || 0) + 1; // Revoke existing tokens

        await user.save();
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

        const agreementDoc = req.body?.agreementDoc || "default";

        user.contributorAgreement = {
            signed: false,
            signedAt: null,
            s3Key: null,
            signerName: null,
            signerIp: null,
            agreementVersion: agreementDoc === "datacatalyst-voice-dataset-consent-agreement" ? "v2.0-NoCloning" : null,
            pdfHash: null,
            adminReviewStatus: null,
            adminReviewedAt: null,
            adminReviewedBy: null,
            adminReviewReason: null,
            assignedAgreementDoc: agreementDoc
        };

        await user.save();
        res.json({ message: `Agreement reset successfully (${agreementDoc}). User will be required to re-sign on next login.`, success: true });
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
        const allLangs = await Language.find().select("code name").lean();
        const validCodes = new Set(allLangs.map(l => (l.code || l.name || "").toLowerCase()));
        const fallbackCodes = ["english", "hindi", "marathi", "bengali", "tamil", "telugu", "gujarati", "kannada", "malayalam", "punjabi"];
        const invalid = qaLanguageCodes.filter(c => !validCodes.has(c) && !fallbackCodes.includes(c));
        if (invalid.length > 0) {
            return res.status(400).json({ error: `Selected language (${invalid.join(", ")}) is not recognized.` });
        }
        // Generate sequential QA ID: QA_01, QA_02, QA_03...
        const existingQaUsers = await User.find({ isQA: true }).select("speaker_id").lean();
        let maxNum = 0;
        for (const u of existingQaUsers) {
            if (u.speaker_id && u.speaker_id.startsWith("QA_")) {
                const num = parseInt(u.speaker_id.replace("QA_", ""), 10);
                if (!isNaN(num) && num > maxNum) maxNum = num;
            }
        }
        const nextNum = maxNum + 1;
        const qaSpeakerId = `QA_${String(nextNum).padStart(2, "0")}`;

        const perCallPayrate = Math.max(0, Number(req.body.perCallPayrate) || 0);
        const hourlyPhrasePayrate = Math.max(0, Number(req.body.hourlyPhrasePayrate) || 0);

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
            speaker_id: qaSpeakerId,
            qaLanguageCode: qaLanguageCodes[0], // Keep for legacy/fallback
            qaLanguageCodes,
            perCallPayrate,
            hourlyPhrasePayrate,
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
            user: { id: qaUser._id, firstname, lastname, email, username, speaker_id: qaSpeakerId, qaLanguageCodes, perCallPayrate, hourlyPhrasePayrate }
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
            .select("firstname lastname email username mobileNumber phone speaker_id qaLanguageCode qaLanguageCodes perCallPayrate hourlyPhrasePayrate createdAt")
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

// Update QA User Details (Languages & Payrates)
qaRouter.patch("/:id", async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Admin access required" });

    try {
        const existingUser = await User.findOne({ _id: req.params.id, isQA: true }).lean();
        if (!existingUser) return res.status(404).json({ error: "QA user not found" });

        const oldPerCallRate = Number(existingUser.perCallPayrate) || 0;
        const oldHourlyPhraseRate = Number(existingUser.hourlyPhrasePayrate) || 0;

        const updates = {};
        if (req.body.qaLanguageCodes !== undefined) {
            let qaLanguageCodes = req.body.qaLanguageCodes;
            if (!Array.isArray(qaLanguageCodes) || qaLanguageCodes.length === 0) {
                return res.status(400).json({ error: "At least one language must be assigned." });
            }
            qaLanguageCodes = qaLanguageCodes.map(c => String(c).trim().toLowerCase());
            updates.qaLanguageCodes = qaLanguageCodes;
            updates.qaLanguageCode = qaLanguageCodes[0];
        }

        let isRateChanged = false;

        if (req.body.perCallPayrate !== undefined) {
            const val = Math.max(0, Number(req.body.perCallPayrate) || 0);
            if (val !== oldPerCallRate) isRateChanged = true;
            updates.perCallPayrate = val;
        }
        if (req.body.hourlyPhrasePayrate !== undefined) {
            const val = Math.max(0, Number(req.body.hourlyPhrasePayrate) || 0);
            if (val !== oldHourlyPhraseRate) isRateChanged = true;
            updates.hourlyPhrasePayrate = val;
        }

        // Lock in all past work performed under the OLD rates before saving new rates!
        if (isRateChanged) {
            const userIdObj = new mongoose.Types.ObjectId(req.params.id);
            const uIdStr = String(req.params.id);

            // 1. Lock un-snapshotted Call Sessions
            await CallSession.updateMany(
                {
                    $or: [
                        { reviewedBy: { $in: [userIdObj, uIdStr] } },
                        { "firstQaReview.qaId": { $in: [userIdObj, uIdStr] } }
                    ],
                    callStatus: { $in: ["approved", "rejected"] },
                    $or: [{ qaCallPayoutUsd: null }, { qaCallPayoutUsd: { $exists: false } }]
                },
                { $set: { qaCallPayoutUsd: oldPerCallRate } }
            );

            // 2. Lock un-snapshotted Approved Phrases
            const unSnapshottedPhrases = await Phrase.find({
                status: "approved",
                $or: [
                    { qaId: { $in: [userIdObj, uIdStr] } },
                    { "firstQaReview.qaId": { $in: [userIdObj, uIdStr] } },
                    { editedBy: { $in: [userIdObj, uIdStr] } }
                ],
                $or: [{ qaPhrasePayoutUsd: null }, { qaPhrasePayoutUsd: { $exists: false } }]
            });

            for (const p of unSnapshottedPhrases) {
                const payout = Math.round(((p.duration || 0) / 3600) * oldHourlyPhraseRate * 100) / 100;
                p.qaPhrasePayoutUsd = payout;
                await p.save();
            }

            // 3. Lock un-snapshotted Phrase Rejections
            const unSnapshottedRejections = await PhraseRejection.find({
                $or: [
                    { qaId: { $in: [userIdObj, uIdStr] } },
                    { "firstQaReview.qaId": { $in: [userIdObj, uIdStr] } }
                ],
                $or: [{ qaPhrasePayoutUsd: null }, { qaPhrasePayoutUsd: { $exists: false } }]
            });

            for (const r of unSnapshottedRejections) {
                const payout = Math.round(((r.duration || 0) / 3600) * oldHourlyPhraseRate * 100) / 100;
                r.qaPhrasePayoutUsd = payout;
                await r.save();
            }
        }

        const user = await User.findOneAndUpdate(
            { _id: req.params.id, isQA: true },
            { $set: updates },
            { new: true }
        ).select("firstname lastname email username speaker_id qaLanguageCode qaLanguageCodes perCallPayrate hourlyPhrasePayrate createdAt");

        res.json({ message: "QA user details updated successfully", user });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Admin repair endpoint to purge obsolete fields, sync QA payrates and recalculate phrase earnings on production
qaRouter.post("/repair-payouts", async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Admin access required" });

    try {
        // Unset obsolete duplicate fields from all user documents in MongoDB
        await User.updateMany({}, { $unset: { qaPerCallPayrateUsd: "", qaHourlyPhrasePayrateUsd: "" } });

        const qaUsers = await User.find({ isQA: true });
        const results = [];

        for (const u of qaUsers) {
            let perCall = Number(u.perCallPayrate) || 0;
            let hourlyPhrase = Number(u.hourlyPhrasePayrate) || 0;

            if (u.email === "vishh1231@gmail.com" || (hourlyPhrase === 0 && u.isQA)) {
                hourlyPhrase = 8.00;
            }

            await User.updateOne(
                { _id: u._id },
                {
                    $set: {
                        perCallPayrate: perCall,
                        hourlyPhrasePayrate: hourlyPhrase
                    }
                }
            );

            const userIdObj = u._id;
            const uIdStr = String(u._id);

            const approvedPhrases = await Phrase.find({
                status: "approved",
                $or: [
                    { qaId: { $in: [userIdObj, uIdStr] } },
                    { "firstQaReview.qaId": { $in: [userIdObj, uIdStr] } },
                    { editedBy: { $in: [userIdObj, uIdStr] } }
                ]
            });

            let totalApprovedPayout = 0;
            let totalApprovedSecs = 0;
            for (const p of approvedPhrases) {
                const dur = p.duration || 0;
                totalApprovedSecs += dur;
                const calcPayout = Math.round((dur / 3600) * hourlyPhrase * 100) / 100;
                await Phrase.updateOne({ _id: p._id }, { $set: { qaPhrasePayoutUsd: calcPayout } });
                totalApprovedPayout += calcPayout;
            }

            const rejectedPhrases = await PhraseRejection.find({
                $or: [
                    { qaId: { $in: [userIdObj, uIdStr] } },
                    { "firstQaReview.qaId": { $in: [userIdObj, uIdStr] } }
                ]
            });

            let totalRejectedPayout = 0;
            let totalRejectedSecs = 0;
            for (const r of rejectedPhrases) {
                const dur = r.duration || 0;
                totalRejectedSecs += dur;
                const calcPayout = Math.round((dur / 3600) * hourlyPhrase * 100) / 100;
                await PhraseRejection.updateOne({ _id: r._id }, { $set: { qaPhrasePayoutUsd: calcPayout } });
                totalRejectedPayout += calcPayout;
            }

            const payments = await PayoutPayment.find({ userId: u._id }).lean();
            const totalPaidOutUsd = Math.round(payments.reduce((sum, p) => sum + (Number(p.amountUsd) || 0), 0) * 100) / 100;

            const totalEarningsUsd = Math.round((totalApprovedPayout + totalRejectedPayout) * 100) / 100;
            const remainingPayoutUsd = Math.max(0, Math.round((totalEarningsUsd - totalPaidOutUsd) * 100) / 100);
            const totalSecs = totalApprovedSecs + totalRejectedSecs;

            results.push({
                email: u.email,
                name: `${u.firstname || ""} ${u.lastname || ""}`.trim() || u.username,
                hourlyPhrasePayrateUsd: hourlyPhrase,
                phrasesReviewed: approvedPhrases.length + rejectedPhrases.length,
                totalPhraseSecs: totalSecs,
                phraseHours: Math.round((totalSecs / 3600) * 10000) / 10000,
                totalEarningsUsd,
                totalPaidOutUsd,
                remainingPayoutUsd
            });
        }

        res.json({ message: "QA payrates synced & phrase payouts recalculated successfully", results });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update QA User Languages (Legacy alias)
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
        if (req.query.type === "phrase") {
            // For phrase projects: return clean Language Names (English, Hindi, Bengali, etc.)
            const phraseLangs = await Language.find({ $or: [{ isPhrase: true }, { type: "phrase" }] }).sort({ name: 1 }).lean();
            
            // Standard curated language presets (Clean Language Names)
            const standardLangs = [
                { name: "English", code: "english" },
                { name: "Hindi", code: "hindi" },
                { name: "Bengali", code: "bengali" },
                { name: "Tamil", code: "tamil" },
                { name: "Telugu", code: "telugu" },
                { name: "Marathi", code: "marathi" },
                { name: "Gujarati", code: "gujarati" },
                { name: "Kannada", code: "kannada" },
                { name: "Malayalam", code: "malayalam" },
                { name: "Punjabi", code: "punjabi" },
                { name: "Odia", code: "odia" },
                { name: "Assamese", code: "assamese" },
                { name: "Urdu", code: "urdu" },
                { name: "Hinglish", code: "hinglish" },
                { name: "Sanskrit", code: "sanskrit" },
                { name: "Bhojpuri", code: "bhojpuri" },
                { name: "Marwari", code: "marwari" },
                { name: "Maithili", code: "maithili" },
                { name: "Kashmiri", code: "kashmiri" },
                { name: "Nepali", code: "nepali" },
                { name: "Sindhi", code: "sindhi" }
            ];

            const langMap = new Map();
            // 1. Add standard languages
            standardLangs.forEach(sl => {
                langMap.set(sl.code.toLowerCase(), {
                    _id: `preset_${sl.code}`,
                    name: sl.name,
                    code: sl.code,
                    language: sl.name,
                    enabled: true,
                    isPhrase: true
                });
            });

            // 2. Add distinct languages found in Phrase collection
            const distinctDbLangs = await Phrase.distinct("language");
            distinctDbLangs.forEach(dl => {
                if (dl) {
                    const code = String(dl).toLowerCase().trim();
                    const name = code.charAt(0).toUpperCase() + code.slice(1);
                    if (!langMap.has(code)) {
                        langMap.set(code, {
                            _id: `db_${code}`,
                            name,
                            code,
                            language: name,
                            enabled: true,
                            isPhrase: true
                        });
                    }
                }
            });

            // 3. Add explicit phrase languages from Language model
            phraseLangs.forEach(pl => {
                const code = String(pl.code || "").toLowerCase().trim();
                const name = pl.name || code.charAt(0).toUpperCase() + code.slice(1);
                langMap.set(code, {
                    ...pl,
                    name,
                    code,
                    language: name
                });
            });

            const sortedPhraseLanguages = Array.from(langMap.values()).sort((a, b) => a.name.localeCompare(b.name));
            return res.json({ languages: sortedPhraseLanguages });
        }

        const query = { isPhrase: { $ne: true } };
        if (req.query.language) {
            const langStr = String(req.query.language).trim();
            query.$or = [
                { language: new RegExp(`^${langStr}$`, 'i') },
                { name: new RegExp(`\\(${langStr}\\)$`, 'i') },
                { code: new RegExp(`-${langStr.toLowerCase()}$`, 'i') },
                { code: langStr.toLowerCase() },
                { name: new RegExp(`^${langStr}$`, 'i') }
            ];
        }
        const langs = await Language.find(query).sort({ name: 1 });
        res.json({ languages: langs });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Create language
router.post("/languages", async (req, res) => {
    const { name, code, type, isPhrase } = req.body;
    const hourlyPayout = req.body?.hourlyPayout !== undefined ? Number(req.body.hourlyPayout) : (type === "phrase" || isPhrase ? 0 : NaN);
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
        const isBoosted = req.body?.isBoosted !== undefined ? !!req.body.isBoosted : false;
        const enableCallRoles = req.body?.enableCallRoles !== undefined ? !!req.body.enableCallRoles : false;
        const role1 = req.body?.role1 ? String(req.body.role1).trim() : "Role 1";
        const role2 = req.body?.role2 ? String(req.body.role2).trim() : "Role 2";
        const projectName = req.body?.projectName ? String(req.body.projectName).trim() : "";
        const language = req.body?.language ? String(req.body.language).trim() : "";
        const lang = await Language.create({
            name: name.trim(),
            projectName,
            language,
            code: code.trim().toLowerCase(),
            hourlyPayout,
            sampleRate,
            maxHoursPerContributor,
            maxDailyCallLimit,
            enabled: true,
            noisy,
            isBoosted,
            enableCallRoles,
            role1,
            role2
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
    if (req.body.projectName !== undefined) updates.projectName = String(req.body.projectName).trim();
    if (req.body.language !== undefined) updates.language = String(req.body.language).trim();
    if (req.body.enabled !== undefined) {
        updates.enabled = !!req.body.enabled;
        if (!updates.enabled) updates.isBoosted = false; // Auto unboost if disabled
    }
    if (req.body.noisy !== undefined) updates.noisy = !!req.body.noisy;
    if (req.body.isBoosted !== undefined) {
        const isBoost = !!req.body.isBoosted;
        if (isBoost) {
            const existing = await Language.findById(req.params.id);
            const isCurrentlyEnabled = updates.enabled !== undefined ? updates.enabled : (existing ? existing.enabled : true);
            if (!isCurrentlyEnabled) {
                return res.status(400).json({ error: "Cannot boost a disabled/hidden project. Please enable the project first before boosting." });
            }
        }
        updates.isBoosted = isBoost;
    }
    if (req.body.enableCallRoles !== undefined) updates.enableCallRoles = !!req.body.enableCallRoles;
    if (req.body.role1 !== undefined) updates.role1 = String(req.body.role1).trim() || "Role 1";
    if (req.body.role2 !== undefined) updates.role2 = String(req.body.role2).trim() || "Role 2";
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

// ===== SCRIPTED CALL LANGUAGE MANAGEMENT (Independent from Call Languages) =====

// List all scripted languages
router.get("/scripted-languages", async (req, res) => {
    try {
        const query = {};
        if (req.query.language) {
            const langStr = String(req.query.language).trim();
            query.$or = [
                { language: new RegExp(`^${langStr}$`, 'i') },
                { name: new RegExp(`\\(${langStr}\\)$`, 'i') },
                { code: new RegExp(`-${langStr.toLowerCase()}$`, 'i') },
                { code: langStr.toLowerCase() },
                { name: new RegExp(`^${langStr}$`, 'i') }
            ];
        }
        const langs = await ScriptedLanguage.find(query).sort({ name: 1 });
        res.json({ languages: langs });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Create scripted language
router.post("/scripted-languages", async (req, res) => {
    const { name, code } = req.body;
    const hourlyPayout = Number(req.body?.hourlyPayout);
    const sampleRate = req.body?.sampleRate !== undefined ? Number(req.body.sampleRate) : 48000;
    const maxHoursPerContributor = req.body?.maxHoursPerContributor !== undefined ? Number(req.body.maxHoursPerContributor) : -1;
    const maxDailyCallLimit = req.body?.maxDailyCallLimit !== undefined ? Number(req.body.maxDailyCallLimit) : 5;
    const testPhrase = req.body?.testPhrase !== undefined ? String(req.body.testPhrase).trim() : "";
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
        const isBoosted = req.body?.isBoosted !== undefined ? !!req.body.isBoosted : false;
        const enableCallRoles = req.body?.enableCallRoles !== undefined ? !!req.body.enableCallRoles : false;
        const role1 = req.body?.role1 ? String(req.body.role1).trim() : "Role 1";
        const role2 = req.body?.role2 ? String(req.body.role2).trim() : "Role 2";
        const projectName = req.body?.projectName ? String(req.body.projectName).trim() : "";
        const language = req.body?.language ? String(req.body.language).trim() : "";
        const lang = await ScriptedLanguage.create({
            name: name.trim(),
            projectName,
            language,
            code: code.trim().toLowerCase(),
            hourlyPayout,
            sampleRate,
            maxHoursPerContributor,
            maxDailyCallLimit,
            enabled: true,
            noisy,
            isBoosted,
            enableCallRoles,
            role1,
            role2,
            testPhrase
        });
        res.status(201).json({ language: lang });
    } catch (e) {
        if (e.code === 11000) return res.status(409).json({ error: "Scripted language code already exists" });
        res.status(500).json({ error: e.message });
    }
});

// Update scripted language (rename / enable / payout / limits / testPhrase)
router.patch("/scripted-languages/:id", async (req, res) => {
    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name.trim();
    if (req.body.projectName !== undefined) updates.projectName = String(req.body.projectName).trim();
    if (req.body.language !== undefined) updates.language = String(req.body.language).trim();
    if (req.body.enabled !== undefined) {
        updates.enabled = !!req.body.enabled;
        if (!updates.enabled) updates.isBoosted = false; // Auto unboost if disabled
    }
    if (req.body.noisy !== undefined) updates.noisy = !!req.body.noisy;
    if (req.body.isBoosted !== undefined) {
        const isBoost = !!req.body.isBoosted;
        if (isBoost) {
            const existing = await ScriptedLanguage.findById(req.params.id);
            const isCurrentlyEnabled = updates.enabled !== undefined ? updates.enabled : (existing ? existing.enabled : true);
            if (!isCurrentlyEnabled) {
                return res.status(400).json({ error: "Cannot boost a disabled/hidden project. Please enable the project first before boosting." });
            }
        }
        updates.isBoosted = isBoost;
    }
    if (req.body.enableCallRoles !== undefined) updates.enableCallRoles = !!req.body.enableCallRoles;
    if (req.body.role1 !== undefined) updates.role1 = String(req.body.role1).trim() || "Role 1";
    if (req.body.role2 !== undefined) updates.role2 = String(req.body.role2).trim() || "Role 2";
    if (req.body.testPhrase !== undefined) updates.testPhrase = String(req.body.testPhrase).trim();
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
        const lang = await ScriptedLanguage.findByIdAndUpdate(req.params.id, updates, { new: true });
        if (!lang) return res.status(404).json({ error: "Scripted language not found" });
        res.json({ language: lang });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete scripted language
router.delete("/scripted-languages/:id", async (req, res) => {
    try {
        const lang = await ScriptedLanguage.findByIdAndDelete(req.params.id);
        if (!lang) return res.status(404).json({ error: "Scripted language not found" });
        res.json({ message: "Scripted language deleted successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin/scripted-languages/:id/contributors-summary
router.get("/scripted-languages/:id/contributors-summary", async (req, res) => {
    try {
        const langParam = req.params.id;
        let language = null;
        if (mongoose.Types.ObjectId.isValid(langParam)) {
            language = await ScriptedLanguage.findById(langParam).lean();
        }
        if (!language) {
            language = await ScriptedLanguage.findOne({ code: String(langParam).toLowerCase().trim() }).lean();
        }
        if (!language) {
            language = await ScriptedLanguage.findOne({ name: { $regex: new RegExp(`^${langParam}$`, "i") } }).lean();
        }
        if (!language) {
            return res.status(404).json({ error: "Scripted Language not found" });
        }

        const baseName = (language.language || language.name || "").trim().toLowerCase();
        // find all subprojects/languages belonging to this base scripted language
        const relatedScriptedLangs = await ScriptedLanguage.find({
            $or: [
                { _id: language._id },
                { code: String(language.code || "").toLowerCase().trim() },
                ...(baseName ? [
                    { language: new RegExp(`^${baseName}$`, "i") },
                    { name: new RegExp(`^${baseName}$`, "i") },
                    { name: new RegExp(`\\(${baseName}\\)$`, "i") }
                ] : [])
            ]
        }).lean();

        const validCodes = Array.from(new Set([
            String(language.code || "").toLowerCase().trim(),
            String(language.name || "").toLowerCase().trim(),
            ...relatedScriptedLangs.map(l => String(l.code || "").toLowerCase().trim()),
            ...relatedScriptedLangs.map(l => String(l.name || "").toLowerCase().trim())
        ])).filter(Boolean);

        // Fetch scripted call sessions & submissions for statistics
        const scriptedSessions = await CallSession.find({
            $and: [
                { $or: [{ callId: /^scripted_/ }, { endReason: "scripted_completed" }] },
                { language: { $in: validCodes.map(c => new RegExp(`^${c}$`, "i")) } }
            ]
        }).select("userA userB actualCallDuration duration recordingADurationMinutes recordingBDurationMinutes callStatus").lean();

        const userRecordedSecsMap = new Map(); // userId -> { approvedSec, pendingSec, rejectedSec, count }
        for (const s of scriptedSessions) {
            const durA = (Number(s.recordingADurationMinutes) || 0) * 60 || (Number(s.actualCallDuration || s.duration) || 0) / 2;
            const durB = (Number(s.recordingBDurationMinutes) || 0) * 60 || (Number(s.actualCallDuration || s.duration) || 0) / 2;
            if (s.userA) {
                const uKey = String(s.userA);
                if (!userRecordedSecsMap.has(uKey)) userRecordedSecsMap.set(uKey, { approvedSec: 0, pendingSec: 0, rejectedSec: 0, count: 0 });
                const st = userRecordedSecsMap.get(uKey);
                st.approvedSec += durA;
                st.count++;
            }
            if (s.userB) {
                const uKey = String(s.userB);
                if (!userRecordedSecsMap.has(uKey)) userRecordedSecsMap.set(uKey, { approvedSec: 0, pendingSec: 0, rejectedSec: 0, count: 0 });
                const st = userRecordedSecsMap.get(uKey);
                st.approvedSec += durB;
                st.count++;
            }
        }

        // Also fetch individual ScriptedSubmission verses stats
        const submissions = await ScriptedSubmission.find({
            language: { $in: validCodes.map(c => new RegExp(`^${c}$`, "i")) }
        }).select("userId status verses").lean();

        for (const sub of submissions) {
            if (!sub.userId) continue;
            const uKey = String(sub.userId);
            if (!userRecordedSecsMap.has(uKey)) userRecordedSecsMap.set(uKey, { approvedSec: 0, pendingSec: 0, rejectedSec: 0, count: 0 });
            const st = userRecordedSecsMap.get(uKey);
            (sub.verses || []).forEach(v => {
                const dur = Number(v.durationSec) || 0;
                if (v.status === "approved") st.approvedSec += dur;
                else if (v.status === "rejected") st.rejectedSec = (st.rejectedSec || 0) + dur;
                else st.pendingSec = (st.pendingSec || 0) + dur;
            });
        }

        // Users who applied specifically for scripted call (applicationType: "scripted_call")
        const users = await User.find({
            $or: [
                {
                    languageApplications: {
                        $elemMatch: {
                            applicationType: "scripted_call",
                            languageCode: { $in: validCodes }
                        }
                    }
                },
                { _id: { $in: Array.from(userRecordedSecsMap.keys()) } }
            ]
        }).select("firstname lastname email username gender dob locality address speaker_id noiseGateDb languageApplications createdAt").lean();

        const items = [];
        const seenUserIds = new Set();

        for (const u of users) {
            const uKey = String(u._id);
            if (seenUserIds.has(uKey)) continue;
            seenUserIds.add(uKey);

            // Match ONLY scripted_call application
            const matchingApp = (u.languageApplications || []).find(a => {
                const appType = a.applicationType || "phrase";
                if (appType !== "scripted_call") return false;
                const c = String(a.languageCode || "").toLowerCase().trim();
                return validCodes.includes(c);
            });

            const stats = userRecordedSecsMap.get(uKey) || { approvedSec: 0, pendingSec: 0, rejectedSec: 0, count: 0 };
            const appStatus = matchingApp ? matchingApp.status : (stats.approvedSec > 0 ? "approved" : "pending");

            const approvedSeconds = Math.round(stats.approvedSec || 0);
            const rejectedSeconds = Math.round(stats.rejectedSec || 0);
            const pendingSeconds = Math.round(stats.pendingSec || 0);
            const totalSeconds = approvedSeconds + rejectedSeconds + pendingSeconds;
            const totalAttempts = stats.count || 0;
            const approvalRate = totalSeconds > 0 ? Math.round((approvedSeconds / totalSeconds) * 100) : (appStatus === "approved" ? 100 : 0);
            const rejectionRate = totalSeconds > 0 ? Math.round((rejectedSeconds / totalSeconds) * 100) : (appStatus === "rejected" ? 100 : 0);

            items.push({
                user: u,
                appStatus,
                appliedAt: matchingApp?.appliedAt || u.createdAt || null,
                noiseGateDb: matchingApp?.noiseGateDb !== undefined ? matchingApp.noiseGateDb : (u.noiseGateDb || 0),
                approvedSeconds,
                rejectedSeconds,
                pendingSeconds,
                totalSeconds,
                approvedCount: stats.count || 0,
                approvalRate,
                rejectionRate
            });
        }

        const demographics = calculateDemographics(items);
        return res.json({
            language: {
                _id: language._id,
                name: language.name,
                code: language.code,
                hourlyPayout: language.hourlyPayout,
                sampleRate: language.sampleRate,
                enabled: language.enabled,
                maxDailyCallLimit: language.maxDailyCallLimit,
                maxHoursPerContributor: language.maxHoursPerContributor
            },
            ...demographics
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/scripted-languages/:id/remove-contributor
router.post("/scripted-languages/:id/remove-contributor", async (req, res) => {
    try {
        const langParam = req.params.id;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: "userId is required" });
        }

        let language = await ScriptedLanguage.findById(langParam).lean();
        if (!language) {
            language = await ScriptedLanguage.findOne({ code: String(langParam).toLowerCase().trim() }).lean();
        }
        if (!language) {
            language = await ScriptedLanguage.findOne({ name: { $regex: new RegExp(`^${langParam}$`, "i") } }).lean();
        }
        if (!language) {
            return res.status(404).json({ error: "Scripted Language not found" });
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
            if (app.applicationType === "scripted_call") {
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
                applicationType: "scripted_call",
                languageCode: langCode,
                status: "rejected",
                appliedAt: new Date(),
                reviewedAt: new Date(),
                reviewedBy: req.user._id
            });
        }

        user.markModified("languageApplications");
        await user.save();

        res.json({ message: `Contributor ${user.firstname || user.username} has been removed from Scripted Language ${language.name}.` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/scripted-languages/:id/reset-contributor
router.post("/scripted-languages/:id/reset-contributor", async (req, res) => {
    try {
        const langParam = req.params.id;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: "userId is required" });
        }

        let language = await ScriptedLanguage.findById(langParam).lean();
        if (!language) {
            language = await ScriptedLanguage.findOne({ code: String(langParam).toLowerCase().trim() }).lean();
        }
        if (!language) {
            language = await ScriptedLanguage.findOne({ name: { $regex: new RegExp(`^${langParam}$`, "i") } }).lean();
        }
        if (!language) {
            return res.status(404).json({ error: "Scripted Language not found" });
        }

        const langCode = String(language.code || "").toLowerCase().trim();
        const langName = String(language.name || "").toLowerCase().trim();

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (user.languageApplications) {
            user.languageApplications = user.languageApplications.filter(app => {
                if (app.applicationType !== "scripted_call") return true;
                const appLang = String(app.languageCode || "").toLowerCase().trim();
                return appLang !== langCode && appLang !== langName;
            });
        }

        user.markModified("languageApplications");
        await user.save();

        res.json({ message: `Scripted call application for ${user.firstname || user.username} has been reset for ${language.name}. They can now apply again.` });
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
            noiseGateDb: item.noiseGateDb !== undefined ? item.noiseGateDb : (u.noiseGateDb || 0),
            notch5kEnabled: item.notch5kEnabled !== undefined ? item.notch5kEnabled : (u.notch5kEnabled || false),
            deHissMode: item.deHissMode || u.deHissMode || "off",
            deEsserMode: item.deEsserMode || u.deEsserMode || "off",
            approvedSeconds: item.approvedSeconds || 0,
            rejectedSeconds: item.rejectedSeconds || 0,
            pendingSeconds: item.pendingSeconds || 0,
            totalSeconds: item.totalSeconds || 0,
            approvedCount: item.approvedCount || 0,
            rejectedCount: item.rejectedCount || 0,
            pendingCount: item.pendingCount || 0,
            approvalRate: item.approvalRate || 0,
            rejectionRate: item.rejectionRate || 0
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

        // 1. Fetch live call sessions for this language (excluding scripted calls)
        const callSessions = await CallSession.find({
            callId: { $not: /^scripted_/ },
            endReason: { $ne: "scripted_completed" },
            language: { $regex: new RegExp(`^(${langCode}|${langName})$`, "i") }
        }).select("userA userB callStatus actualCallDuration duration callActuallyStarted").lean();

        let totalCallSeconds = 0;
        let completedCallsCount = 0;
        const userCallStatsMap = new Map(); // userId -> { callSecs, callCount }

        const userCallStatusMap = new Map();
        for (const session of callSessions) {
            const dur = Number(session.actualCallDuration || session.duration) || 0;
            totalCallSeconds += dur;
            completedCallsCount++;

            [session.userA, session.userB].forEach(uid => {
                if (uid) {
                    const uKey = String(uid);
                    userCallStatusMap.set(uKey, "approved");
                    if (!userCallStatsMap.has(uKey)) {
                        userCallStatsMap.set(uKey, { callSecs: 0, callCount: 0 });
                    }
                    const st = userCallStatsMap.get(uKey);
                    st.callSecs += dur;
                    st.callCount++;
                }
            });
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

            const uStats = userCallStatsMap.get(String(u._id)) || { callSecs: 0, callCount: 0 };

            if (apps.length > 0) {
                const latestApp = apps.sort((a, b) => new Date(b.appliedAt || 0) - new Date(a.appliedAt || 0))[0];
                let appStatus = latestApp.status || "pending";
                if (userCallStatusMap.has(String(u._id)) && latestApp.status !== "rejected") {
                    appStatus = "approved";
                }
                userItemMap.set(String(u._id), {
                    user: u,
                    appStatus,
                    appliedAt: latestApp.appliedAt || u.createdAt,
                    noiseGateDb: latestApp.noiseGateDb !== undefined ? latestApp.noiseGateDb : (u.noiseGateDb || 0),
                    callSeconds: uStats.callSecs,
                    callCount: uStats.callCount
                });
            } else if (userCallStatusMap.has(String(u._id))) {
                userItemMap.set(String(u._id), {
                    user: u,
                    appStatus: "approved",
                    appliedAt: u.createdAt,
                    noiseGateDb: u.noiseGateDb || 0,
                    callSeconds: uStats.callSecs,
                    callCount: uStats.callCount
                });
            }
        }

        const items = Array.from(userItemMap.values());
        const summary = calculateDemographics(items);

        let approvedAppCount = 0;
        let rejectedAppCount = 0;
        let pendingAppCount = 0;
        for (const item of items) {
            if (item.appStatus === "approved") approvedAppCount++;
            else if (item.appStatus === "rejected") rejectedAppCount++;
            else pendingAppCount++;
        }
        const totalEvaluatedApps = approvedAppCount + rejectedAppCount;
        const approvalRate = totalEvaluatedApps > 0 ? Number(((approvedAppCount / totalEvaluatedApps) * 100).toFixed(1)) : 0;
        const rejectionRate = totalEvaluatedApps > 0 ? Number(((rejectedAppCount / totalEvaluatedApps) * 100).toFixed(1)) : 0;

        summary.totalCallSeconds = totalCallSeconds;
        summary.completedCallsCount = completedCallsCount;
        summary.approvedAppCount = approvedAppCount;
        summary.rejectedAppCount = rejectedAppCount;
        summary.pendingAppCount = pendingAppCount;
        summary.approvalRate = approvalRate;
        summary.rejectionRate = rejectionRate;

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

// POST /api/admin/contributors/update-audio-config (and /update-noise-gate alias)
const updateContributorAudioConfigHandler = async (req, res) => {
    try {
        const { userId, applicationType, companyId, languageCode, noiseGateDb, notch5kEnabled, deHissMode, deEsserMode } = req.body;
        if (!userId) {
            return res.status(400).json({ error: "userId is required" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const rawVal = parseInt(noiseGateDb);
        const gateValue = isNaN(rawVal) ? (user.noiseGateDb || 0) : Math.min(0, Math.max(-60, rawVal));
        const notchVal = notch5kEnabled !== undefined ? !!notch5kEnabled : (user.notch5kEnabled || false);
        const deHissVal = ["off", "14k", "12k", "10k"].includes(deHissMode) ? deHissMode : (user.deHissMode || "off");
        const deEsserVal = ["off", "light", "medium", "strong"].includes(deEsserMode) ? deEsserMode : (user.deEsserMode || "off");

        if (!user.languageApplications) {
            user.languageApplications = [];
        }

        const type = applicationType || "phrase";
        const reqLang = String(languageCode || "").toLowerCase().trim();

        // Resolve company identifiers if companyId is provided
        let companyIdentifiers = [];
        if (companyId) {
            let company = null;
            if (mongoose.Types.ObjectId.isValid(companyId)) {
                company = await Company.findById(companyId).lean();
            }
            if (!company) {
                const escaped = String(companyId).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
                company = await Company.findOne({
                    $or: [
                        { name: { $regex: new RegExp(`^${escaped}$`, "i") } },
                        { projectName: { $regex: new RegExp(`^${escaped}$`, "i") } }
                    ]
                }).lean();
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
            app.notch5kEnabled = notchVal;
            app.deHissMode = deHissVal;
            app.deEsserMode = deEsserVal;
            updatedApp = true;
        });

        if (!updatedApp && reqLang) {
            user.languageApplications.push({
                applicationType: type,
                companyId: companyId || null,
                languageCode: reqLang,
                status: "approved",
                noiseGateDb: gateValue,
                notch5kEnabled: notchVal,
                deHissMode: deHissVal,
                deEsserMode: deEsserVal,
                appliedAt: new Date()
            });
        }

        user.noiseGateDb = gateValue;
        user.notch5kEnabled = notchVal;
        user.deHissMode = deHissVal;
        user.deEsserMode = deEsserVal;

        user.markModified("languageApplications");
        await user.save();

        res.json({
            message: `Audio configurations updated for ${user.firstname || user.username}.`,
            noiseGateDb: gateValue,
            notch5kEnabled: notchVal,
            deHissMode: deHissVal,
            deEsserMode: deEsserVal
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

router.post("/contributors/update-audio-config", updateContributorAudioConfigHandler);
router.post("/contributors/update-noise-gate", updateContributorAudioConfigHandler);

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
        let company = null;
        if (mongoose.Types.ObjectId.isValid(compParam)) {
            company = await Company.findById(compParam).lean();
        }
        if (!company) {
            const escaped = String(compParam).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
            company = await Company.findOne({
                $or: [
                    { name: { $regex: new RegExp(`^${escaped}$`, "i") } },
                    { projectName: { $regex: new RegExp(`^${escaped}$`, "i") } }
                ]
            }).lean();
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
        }).select("language contributorId status recordedAt duration").lean();

        // Find all phrase rejections for this company
        const rejections = await PhraseRejection.find({
            companyId: { $in: companyRegexes }
        }).lean();

        // Calculate Whole Company Statistics across all languages
        let companyApprovedSeconds = 0;
        let companyPendingSeconds = 0;
        let companyRejectedSeconds = 0;

        let companyApprovedCount = 0;
        let companyPendingCount = 0;
        let companyRejectedCount = 0;

        for (const p of phrases) {
            const dur = Number(p.duration) || 0;
            if (p.status === "approved") {
                companyApprovedSeconds += dur;
                companyApprovedCount++;
            } else if (p.status === "recorded") {
                companyPendingSeconds += dur;
                companyPendingCount++;
            } else if (p.status === "rejected") {
                companyRejectedSeconds += dur;
                companyRejectedCount++;
            }
        }

        for (const r of rejections) {
            companyRejectedSeconds += Number(r.duration) || 0;
            companyRejectedCount++;
        }

        const companyTotalSeconds = companyApprovedSeconds + companyPendingSeconds + companyRejectedSeconds;
        const companyTotalEvaluated = companyApprovedCount + companyRejectedCount;
        const companyApprovalRate = companyTotalEvaluated > 0 ? Number(((companyApprovedCount / companyTotalEvaluated) * 100).toFixed(1)) : 0;
        const companyRejectionRate = companyTotalEvaluated > 0 ? Number(((companyRejectedCount / companyTotalEvaluated) * 100).toFixed(1)) : 0;

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
                    noiseGateDb: app.noiseGateDb !== undefined ? app.noiseGateDb : (u.noiseGateDb || 0),
                    notch5kEnabled: app.notch5kEnabled !== undefined ? app.notch5kEnabled : (u.notch5kEnabled || false),
                    deHissMode: app.deHissMode || u.deHissMode || "off",
                    deEsserMode: app.deEsserMode || u.deEsserMode || "off"
                });
            }
        }

        // Populate users for phrases if contributorId exists
        const contributorIds = phrases.map(p => p.contributorId).filter(Boolean);
        const contributorUsers = await User.find({ _id: { $in: contributorIds } })
            .select("firstname lastname email username gender dob speaker_id locality address createdAt languageApplications notch5kEnabled deHissMode deEsserMode noiseGateDb").lean();
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
                const notchVal = matchingApp?.notch5kEnabled !== undefined ? matchingApp.notch5kEnabled : (existing?.notch5kEnabled !== undefined ? existing.notch5kEnabled : (u.notch5kEnabled || false));
                const deHissVal = matchingApp?.deHissMode || existing?.deHissMode || u.deHissMode || "off";
                const deEsserVal = matchingApp?.deEsserMode || existing?.deEsserMode || u.deEsserMode || "off";

                langObj.usersMap.set(String(u._id), {
                    user: u,
                    appStatus: currentStatus,
                    appliedAt: existing?.appliedAt || matchingApp?.appliedAt || p.recordedAt || u.createdAt,
                    noiseGateDb: noiseVal,
                    notch5kEnabled: notchVal,
                    deHissMode: deHissVal,
                    deEsserMode: deEsserVal
                });
            }
        }

        const languagesList = [];
        for (const [langCode, langData] of languageMap.entries()) {
            const items = Array.from(langData.usersMap.values());

            // Compute per-language & per-contributor durations and rates
            let langApprovedSeconds = 0;
            let langPendingSeconds = 0;
            let langRejectedSeconds = 0;

            let langApprovedCount = 0;
            let langPendingCount = 0;
            let langRejectedCount = 0;

            const userDurations = new Map();

            for (const p of langData.phrases) {
                const dur = Number(p.duration) || 0;
                const uid = p.contributorId ? String(p.contributorId) : null;
                if (uid && !userDurations.has(uid)) {
                    userDurations.set(uid, {
                        totalSecs: 0,
                        approvedSecs: 0,
                        rejectedSecs: 0,
                        pendingSecs: 0,
                        approvedCnt: 0,
                        rejectedCnt: 0,
                        pendingCnt: 0
                    });
                }
                const uStats = uid ? userDurations.get(uid) : null;

                if (p.status === "approved") {
                    langApprovedSeconds += dur;
                    langApprovedCount++;
                    if (uStats) { uStats.approvedSecs += dur; uStats.approvedCnt++; }
                } else if (p.status === "recorded" || p.status === "pending_review") {
                    langPendingSeconds += dur;
                    langPendingCount++;
                    if (uStats) { uStats.pendingSecs += dur; uStats.pendingCnt++; }
                } else if (p.status === "rejected") {
                    langRejectedSeconds += dur;
                    langRejectedCount++;
                    if (uStats) { uStats.rejectedSecs += dur; uStats.rejectedCnt++; }
                }
            }

            // Include rejections from PhraseRejection audit table for this language
            for (const r of rejections) {
                const rLang = String(r.language || "other").toLowerCase().trim();
                if (rLang === langCode) {
                    const dur = Number(r.duration) || 0;
                    const uid = r.contributorId ? String(r.contributorId) : null;
                    if (uid && !userDurations.has(uid)) {
                        userDurations.set(uid, {
                            totalSecs: 0,
                            approvedSecs: 0,
                            rejectedSecs: 0,
                            pendingSecs: 0,
                            approvedCnt: 0,
                            rejectedCnt: 0,
                            pendingCnt: 0
                        });
                    }
                    const uStats = uid ? userDurations.get(uid) : null;

                    langRejectedSeconds += dur;
                    langRejectedCount++;
                    if (uStats) {
                        uStats.rejectedSecs += dur;
                        uStats.rejectedCnt++;
                    }
                }
            }

            const langTotalSeconds = langApprovedSeconds + langPendingSeconds + langRejectedSeconds;

            const langTotalEvaluated = langApprovedCount + langRejectedCount;
            const langApprovalRate = langTotalEvaluated > 0 ? Number(((langApprovedCount / langTotalEvaluated) * 100).toFixed(1)) : 0;
            const langRejectionRate = langTotalEvaluated > 0 ? Number(((langRejectedCount / langTotalEvaluated) * 100).toFixed(1)) : 0;

            // Attach per-contributor metrics to user list items
            for (const item of items) {
                const uStats = userDurations.get(String(item.user._id)) || {
                    totalSecs: 0,
                    approvedSecs: 0,
                    rejectedSecs: 0,
                    pendingSecs: 0,
                    approvedCnt: 0,
                    rejectedCnt: 0,
                    pendingCnt: 0
                };
                item.approvedSeconds = uStats.approvedSecs;
                item.rejectedSeconds = uStats.rejectedSecs;
                item.pendingSeconds = uStats.pendingSecs;
                item.totalSeconds = uStats.approvedSecs + uStats.pendingSecs + uStats.rejectedSecs;

                item.approvedCount = uStats.approvedCnt;
                item.rejectedCount = uStats.rejectedCnt;
                item.pendingCount = uStats.pendingCnt;

                const uEval = uStats.approvedCnt + uStats.rejectedCnt;
                item.approvalRate = uEval > 0 ? Number(((uStats.approvedCnt / uEval) * 100).toFixed(1)) : 0;
                item.rejectionRate = uEval > 0 ? Number(((uStats.rejectedCnt / uEval) * 100).toFixed(1)) : 0;
            }

            const summary = calculateDemographics(items);

            summary.totalSeconds = langTotalSeconds;
            summary.approvedSeconds = langApprovedSeconds;
            summary.rejectedSeconds = langRejectedSeconds;
            summary.pendingSeconds = langPendingSeconds;

            summary.approvedCount = langApprovedCount;
            summary.rejectedCount = langRejectedCount;
            summary.pendingCount = langPendingCount;

            summary.approvalRate = langApprovalRate;
            summary.rejectionRate = langRejectionRate;

            languagesList.push({
                code: langCode,
                name: langData.name.charAt(0).toUpperCase() + langData.name.slice(1),
                phraseCount: langData.phrases.length,
                totalSeconds: langTotalSeconds,
                approvedSeconds: langApprovedSeconds,
                rejectedSeconds: langRejectedSeconds,
                pendingSeconds: langPendingSeconds,
                approvalRate: langApprovalRate,
                rejectionRate: langRejectionRate,
                summary
            });
        }

        languagesList.sort((a, b) => b.phraseCount - a.phraseCount);

        res.json({
            company: {
                _id: company._id,
                name: company.name,
                projectName: company.projectName,
                totalSeconds: companyTotalSeconds,
                totalApprovedSeconds: companyApprovedSeconds,
                totalRejectedSeconds: companyRejectedSeconds,
                totalPendingSeconds: companyPendingSeconds,
                approvedCount: companyApprovedCount,
                rejectedCount: companyRejectedCount,
                pendingCount: companyPendingCount,
                approvalRate: companyApprovalRate,
                rejectionRate: companyRejectionRate
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
        const reqLang = String(languageCode || "").toLowerCase().trim();
        const isAll = !reqLang || reqLang === "all" || reqLang === "any";

        // Mark matching phrase applications for this company (and any legacy generic entries for this language) as rejected
        user.languageApplications.forEach(app => {
            if (app.applicationType === "phrase" || !app.applicationType) {
                const appComp = String(app.companyId || "").replace(/_downloaded$/, "").trim().toLowerCase();
                const compMatches = companyIdentifiers.some(id => id.replace(/_downloaded$/, "").trim().toLowerCase() === appComp);
                const appLang = String(app.languageCode || "").toLowerCase().trim();
                if ((compMatches || !appComp) && (isAll || appLang === reqLang)) {
                    app.status = "rejected";
                    app.reviewedAt = new Date();
                    app.reviewedBy = req.user._id;
                    updated = true;
                }
            }
        });

        // If no matching application was found, push a rejected application entry
        if (!updated) {
            user.languageApplications.push({
                applicationType: "phrase",
                companyId: company.name,
                languageCode: (!reqLang || reqLang === "all" || reqLang === "any") ? "english" : reqLang,
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

        const reqLang = String(languageCode || "").toLowerCase().trim();
        const isAll = !reqLang || reqLang === "all" || reqLang === "any";

        if (user.languageApplications) {
            user.languageApplications = user.languageApplications.filter(app => {
                if (app.applicationType && app.applicationType !== "phrase") return true;
                const appComp = String(app.companyId || "").replace(/_downloaded$/, "").trim().toLowerCase();
                const compMatches = companyIdentifiers.some(id => id.replace(/_downloaded$/, "").trim().toLowerCase() === appComp);
                const appLang = String(app.languageCode || "").toLowerCase().trim();

                if ((compMatches || !appComp) && (isAll || appLang === reqLang)) {
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
            .select("firstname lastname email username speaker_id languageApplications")
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
                        speaker_id: u.speaker_id || `spk_${u._id}`,
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
            const languageDoc = app.applicationType === "scripted_call"
                ? await ScriptedLanguage.findOne({ code: app.languageCode })
                : await Language.findOne({ code: app.languageCode });
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
            const languageDoc = app.applicationType === "scripted_call"
                ? await ScriptedLanguage.findOne({ code: app.languageCode })
                : await Language.findOne({ code: app.languageCode });
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

router.get("/phrases/download-company", requireAuth(JWT_SECRET), async (req, res) => {
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
                        userFirstname: u.firstname || "",
                        userLastname: u.lastname || "",
                        username: u.username || "",
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
                const rawName = [record.userFirstname, record.userLastname].filter(Boolean).join("_").trim() || record.username || "applicant";
                const cleanName = rawName.replace(/[^a-zA-Z0-9_\-]/g, "");
                const destFileName = `${cleanName}_${record.speakerId}.wav`;
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

        // Determine target status: "approved" (default) or "recorded" (pending QA)
        let targetStatus = "approved";
        if (req.query.status === "recorded" || req.query.status === "pending" || type === "recorded" || type === "pending" || type === "pending_phrases") {
            targetStatus = "recorded";
        }

        // Fetch the company config to read custom namingPattern
        const baseCompanyName = companyFolder.replace(/_downloaded$/, "");
        const companyDoc = await Company.findOne({ name: { $regex: new RegExp(`^${baseCompanyName}$`, "i") } }).lean();
        const filenamePattern = companyDoc?.namingPattern || "{phraseId}";

        // Target company IDs
        const isFreshOnly = type === "fresh_phrases" || req.query.isFresh === "true" || req.query.scope === "fresh";
        const targetCompanyIds = isFreshOnly
            ? [companyFolder, companyFolder.toLowerCase()]
            : [
                companyFolder,
                `${companyFolder}_downloaded`,
                companyFolder.toLowerCase(),
                `${companyFolder.toLowerCase()}_downloaded`
              ];

        let phrasesQuery = {
            companyId: { $in: targetCompanyIds },
            status: targetStatus,
            audioFile: { $ne: null }
        };

        const rawPhrases = await Phrase.find(phrasesQuery).populate("contributorId").lean();

        // Custom filtering by key & value if provided
        const filterKey = req.query.filterKey ? String(req.query.filterKey).trim() : "";
        const filterValue = req.query.filterValue ? String(req.query.filterValue).trim() : "";

        let approvedPhrases = rawPhrases;

        // Language filter if requested
        const reqLanguage = req.query.language ? String(req.query.language).trim().toLowerCase() : "";
        if (reqLanguage && reqLanguage !== "all") {
            approvedPhrases = approvedPhrases.filter(p => String(p.language || "").trim().toLowerCase() === reqLanguage);
        }

        if (filterKey && filterValue) {
            const cleanTargetVal = filterValue.toLowerCase();
            approvedPhrases = approvedPhrases.filter(p => {
                const contributor = p.contributorId || {};
                if (filterKey === "recording_date") {
                    if (!p.recordedAt) return false;
                    const d = new Date(p.recordedAt);
                    const day = String(d.getDate()).padStart(2, "0");
                    const month = String(d.getMonth() + 1).padStart(2, "0");
                    const year = d.getFullYear();
                    const ddmmyyyy = `${day}-${month}-${year}`;
                    const yyyymmdd = `${year}-${month}-${day}`;
                    return ddmmyyyy.toLowerCase() === cleanTargetVal || yyyymmdd.toLowerCase() === cleanTargetVal;
                }
                if (filterKey === "first_name") {
                    const fName = contributor.firstname ? String(contributor.firstname).trim() : (contributor.username || "");
                    return fName.toLowerCase() === cleanTargetVal;
                }
                if (filterKey === "last_name") {
                    const lName = contributor.lastname ? String(contributor.lastname).trim() : "";
                    return lName.toLowerCase() === cleanTargetVal;
                }
                if (filterKey === "speaker_id") {
                    const spk = contributor.speaker_id || p.speaker_id || "";
                    return spk.toLowerCase() === cleanTargetVal;
                }
                if (filterKey === "language") {
                    return String(p.language || "").trim().toLowerCase() === cleanTargetVal;
                }
                if (filterKey === "gender") {
                    return String(contributor.gender || "").trim().toLowerCase() === cleanTargetVal;
                }
                if (p.tags && p.tags[filterKey] !== undefined) {
                    return String(p.tags[filterKey]).trim().toLowerCase() === cleanTargetVal;
                }
                if (p[filterKey] !== undefined) {
                    return String(p[filterKey]).trim().toLowerCase() === cleanTargetVal;
                }
                return false;
            });
        }

        // Limit per speaker filter (duration cap in minutes)
        const limitPerSpeakerMinutes = req.query.limitPerSpeakerMinutes 
            ? parseFloat(req.query.limitPerSpeakerMinutes) 
            : (req.query.maxSpeakerMinutes ? parseFloat(req.query.maxSpeakerMinutes) : null);
        const maxSpeakerSecs = (limitPerSpeakerMinutes && limitPerSpeakerMinutes > 0) ? (limitPerSpeakerMinutes * 60) : null;

        if (maxSpeakerSecs > 0) {
            // Sort chronologically so we take the earliest recordings up to the limit
            approvedPhrases.sort((a, b) => new Date(a.recordedAt || a.createdAt || 0) - new Date(b.recordedAt || b.createdAt || 0));

            const speakerDurationSecs = {};
            approvedPhrases = approvedPhrases.filter(p => {
                const contributor = p.contributorId || {};
                const spkId = String(contributor.speaker_id || p.speaker_id || contributor._id || "unknown").trim();
                const dur = Number(p.duration) > 0 ? Number(p.duration) : 5;
                const currentSecs = speakerDurationSecs[spkId] || 0;
                if (currentSecs >= maxSpeakerSecs) {
                    return false; // Skip phrase as speaker has hit limit
                }
                speakerDurationSecs[spkId] = currentSecs + dur;
                return true;
            });
        }

        if (approvedPhrases.length === 0) {
            return res.status(404).json({ error: `No matching ${isFreshOnly ? 'newly approved ' : ''}${targetStatus} phrases found for "${companyFolder}"${reqLanguage ? ` in language "${reqLanguage}"` : ''}${filterKey ? ` with ${filterKey}=${filterValue}` : ''}${maxSpeakerSecs ? ` (within ${limitPerSpeakerMinutes} min/speaker limit)` : ''}.` });
        }

        const langTag = (reqLanguage && reqLanguage !== "all") ? `_${reqLanguage}` : '';
        let zipFilename = `${companyFolder}${langTag}_${isFreshOnly ? 'newly_' : ''}${targetStatus}_phrases.zip`;
        if (filterKey && filterValue) {
            const cleanVal = filterValue.replace(/[^a-zA-Z0-9_\-]/g, "_");
            zipFilename = `${companyFolder}${langTag}_${isFreshOnly ? 'newly_' : ''}${targetStatus}_${filterKey}_${cleanVal}.zip`;
        }
        if (maxSpeakerSecs > 0) {
            zipFilename = zipFilename.replace(/\.zip$/i, `_${limitPerSpeakerMinutes}m_per_spk.zip`);
        }

        let archive;
        try {
            const archiverModule = await import("archiver");
            const archiverFn = archiverModule.default || archiverModule;
            if (typeof archiverFn === "function") {
                archive = archiverFn("zip", { zlib: { level: 0 } });
            } else if (archiverModule.ZipArchive) {
                archive = new archiverModule.ZipArchive({ zlib: { level: 0 } });
            } else {
                throw new Error("Could not initialize ZIP archiver engine.");
            }
        } catch (err) {
            console.error("Archiver error:", err);
            return res.status(500).json({ error: "Server missing or failed 'archiver' dependency: " + err.message });
        }

        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${zipFilename}"`);

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

        const usedFolderNames = new Set();

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
            const firstName = contributor.firstname ? String(contributor.firstname).trim() : (contributor.username || "");
            const lastName = contributor.lastname ? String(contributor.lastname).trim() : "";
            const reqDateFormat = String(req.query.dateFormat || (filterValue && filterValue.match(/^\d{2}-\d{2}-\d{4}$/) ? "DD-MM-YYYY" : "YYYY-MM-DD")).toUpperCase().trim();
            let recordingDate = "";
            if (phrase.recordedAt) {
                const d = new Date(phrase.recordedAt);
                const day = String(d.getDate()).padStart(2, "0");
                const month = String(d.getMonth() + 1).padStart(2, "0");
                const year = d.getFullYear();
                recordingDate = reqDateFormat === "DD-MM-YYYY" ? `${day}-${month}-${year}` : `${year}-${month}-${day}`;
            }
            const genderVal = contributor.gender || "unknown";

            let computedName = filenamePattern
                .replace(/{phraseId}/g, phraseId || "")
                .replace(/{phrase_id}/g, phraseId || "")
                .replace(/{language}/g, phrase.language || "")
                .replace(/{speaker_id}/g, speakerId || `spk_${contributor._id || "unknown"}`)
                .replace(/{first_name}/g, firstName)
                .replace(/{firstname}/g, firstName)
                .replace(/{last_name}/g, lastName)
                .replace(/{lastname}/g, lastName)
                .replace(/{recording_date}/g, recordingDate)
                .replace(/{recorded_date}/g, recordingDate)
                .replace(/{date}/g, recordingDate)
                .replace(/{gender}/g, genderVal)
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
                id: folderName,
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

            // Fetch + convert audio to WAV (checks local disk candidates before S3 fallback)
            try {
                let wavBuffer = null;
                const cleanKey = (key || "").replace(/^local:/, "").trim();
                const baseName = cleanKey.substring(cleanKey.lastIndexOf("/") + 1);

                const localCandidates = [
                    path.join(process.cwd(), cleanKey),
                    path.join(process.cwd(), "uploads", cleanKey),
                    path.join(process.cwd(), "uploads", "phrases", companyFolder, baseName),
                    path.join(process.cwd(), "uploads", "phrases", cleanKey),
                    path.join(process.cwd(), "recordings", baseName),
                    path.join(process.cwd(), "recordings", cleanKey),
                    path.join(process.cwd(), "recordings", "phrases", baseName),
                    path.join(process.cwd(), "recordings", "temp", baseName),
                    path.join(process.cwd(), "uploads", "phrases", baseName),
                    path.join(process.cwd(), "recordings", "language-apps", baseName)
                ];

                for (const candidate of localCandidates) {
                    if (candidate && fs.existsSync(candidate)) {
                        try {
                            const fileStream = fs.createReadStream(candidate);
                            wavBuffer = await getWavBuffer(fileStream);
                            if (wavBuffer) break;
                        } catch (candErr) {
                            console.warn(`Error converting local file ${candidate}:`, candErr.message);
                        }
                    }
                }

                if (!wavBuffer) {
                    const audioCommand = new GetObjectCommand({
                        Bucket: BUCKET_NAME,
                        Key: cleanKey
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

        // Generate info.txt manifest containing dataset summary and per-speaker duration breakdown
        try {
            const speakerSummaryMap = {};
            let grandTotalDurationSecs = 0;

            for (const { phrase } of successfullyProcessed) {
                const contributor = phrase.contributorId || {};
                const spkId = String(contributor.speaker_id || phrase.speaker_id || `spk_${contributor._id || "unknown"}`).trim();
                const spkName = [contributor.firstname, contributor.lastname].filter(Boolean).join(" ").trim() || contributor.username || "Unknown";
                const spkGender = contributor.gender || "unknown";
                const pDur = Number(phrase.duration) > 0 ? Number(phrase.duration) : 0;
                const pLang = String(phrase.language || "other").toLowerCase().trim();

                grandTotalDurationSecs += pDur;

                if (!speakerSummaryMap[spkId]) {
                    speakerSummaryMap[spkId] = {
                        speakerId: spkId,
                        name: spkName,
                        gender: spkGender,
                        language: pLang,
                        phraseCount: 0,
                        totalDurationSecs: 0
                    };
                }
                speakerSummaryMap[spkId].phraseCount += 1;
                speakerSummaryMap[spkId].totalDurationSecs += pDur;
            }

            const formatHMS = (secs) => {
                const s = Math.round(secs || 0);
                const hrs = Math.floor(s / 3600);
                const mins = Math.floor((s % 3600) / 60);
                const remainderSecs = s % 60;
                return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(remainderSecs).padStart(2, "0")}`;
            };

            let infoText = `================================================================================
                    DATACATALYST / VOCLARA DATASET MANIFEST
================================================================================
Project / Company : ${companyFolder}
Language          : ${reqLanguage && reqLanguage !== "all" ? reqLanguage.toUpperCase() : "ALL LANGUAGES"}
Status            : ${targetStatus.toUpperCase()} PHRASES
Export Date & Time: ${new Date().toISOString().replace("T", " ").substring(0, 19)} UTC
Filter Applied    : ${filterKey && filterValue ? `${filterKey} = ${filterValue}` : "None (All Matching)"}
Speaker Cap       : ${limitPerSpeakerMinutes ? `${limitPerSpeakerMinutes} minutes per speaker` : "No Limit"}

================================================================================
                              SUMMARY TOTALS
================================================================================
Total Audio Files : ${successfullyProcessed.length}
Total Duration    : ${formatHMS(grandTotalDurationSecs)} (${(grandTotalDurationSecs / 60).toFixed(2)} mins / ${(grandTotalDurationSecs / 3600).toFixed(3)} hrs)
Unique Speakers   : ${Object.keys(speakerSummaryMap).length}

================================================================================
                         SPEAKER BREAKDOWN & DURATION
================================================================================
${"SPEAKER ID".padEnd(16)} | ${"NAME".padEnd(24)} | ${"GENDER".padEnd(8)} | ${"PHRASES".padEnd(8)} | ${"DURATION (HH:MM:SS)".padEnd(20)} | ${"DURATION (MINS)".padEnd(16)} | ${"AVG / PHRASE"}
------------------------------------------------------------------------------------------------------------------------
`;

            const sortedSpeakers = Object.values(speakerSummaryMap).sort((a, b) => b.totalDurationSecs - a.totalDurationSecs);
            for (const spk of sortedSpeakers) {
                const spkDurStr = formatHMS(spk.totalDurationSecs);
                const spkMinsStr = `${(spk.totalDurationSecs / 60).toFixed(2)} mins`;
                const avgSecs = spk.phraseCount > 0 ? (spk.totalDurationSecs / spk.phraseCount).toFixed(1) + "s" : "0.0s";
                
                infoText += `${spk.speakerId.padEnd(16)} | ${spk.name.substring(0, 24).padEnd(24)} | ${spk.gender.padEnd(8)} | ${String(spk.phraseCount).padEnd(8)} | ${spkDurStr.padEnd(20)} | ${spkMinsStr.padEnd(16)} | ${avgSecs}\n`;
            }

            infoText += `------------------------------------------------------------------------------------------------------------------------
================================================================================
`;

            archive.append(infoText, { name: "info.txt" });
        } catch (infoErr) {
            console.error("Failed to generate info.txt:", infoErr);
        }

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
                    _id: { companyId: "$companyId", language: "$language", status: "$status" },
                    count: { $sum: 1 }
                }
            }
        ]);

        const companyStats = {};
        const companyLanguageStats = {};

        for (const item of stats) {
            const rawCompanyId = item._id.companyId || "Unknown";
            const isDownloaded = rawCompanyId.endsWith("_downloaded");
            const companyId = isDownloaded ? rawCompanyId.replace(/_downloaded$/, "") : rawCompanyId;
            const language = String(item._id.language || "other").toLowerCase().trim();
            const status = item._id.status;

            if (!companyStats[companyId]) {
                companyStats[companyId] = { pending: 0, recorded: 0, approved: 0, rejected: 0, freshApproved: 0 };
            }
            if (!companyLanguageStats[companyId]) {
                companyLanguageStats[companyId] = {};
            }
            if (!companyLanguageStats[companyId][language]) {
                companyLanguageStats[companyId][language] = { pending: 0, recorded: 0, approved: 0, rejected: 0, freshApproved: 0 };
            }
            
            // Add to company totals
            companyStats[companyId][status] = (companyStats[companyId][status] || 0) + item.count;
            if (status === "approved" && !isDownloaded) {
                companyStats[companyId].freshApproved = (companyStats[companyId].freshApproved || 0) + item.count;
            }

            // Add to language totals
            companyLanguageStats[companyId][language][status] = (companyLanguageStats[companyId][language][status] || 0) + item.count;
            if (status === "approved" && !isDownloaded) {
                companyLanguageStats[companyId][language].freshApproved = (companyLanguageStats[companyId][language].freshApproved || 0) + item.count;
            }

            // Also index by lowercase for case-insensitive frontend matching
            const lowerId = companyId.toLowerCase();
            if (lowerId !== companyId) {
                if (!companyStats[lowerId]) {
                    companyStats[lowerId] = { pending: 0, recorded: 0, approved: 0, rejected: 0, freshApproved: 0 };
                }
                if (!companyLanguageStats[lowerId]) {
                    companyLanguageStats[lowerId] = {};
                }
                if (!companyLanguageStats[lowerId][language]) {
                    companyLanguageStats[lowerId][language] = { pending: 0, recorded: 0, approved: 0, rejected: 0, freshApproved: 0 };
                }

                companyStats[lowerId][status] = (companyStats[lowerId][status] || 0) + item.count;
                if (status === "approved" && !isDownloaded) {
                    companyStats[lowerId].freshApproved = (companyStats[lowerId].freshApproved || 0) + item.count;
                }

                companyLanguageStats[lowerId][language][status] = (companyLanguageStats[lowerId][language][status] || 0) + item.count;
                if (status === "approved" && !isDownloaded) {
                    companyLanguageStats[lowerId][language].freshApproved = (companyLanguageStats[lowerId][language].freshApproved || 0) + item.count;
                }
            }
        }

        res.json({ success: true, stats: companyStats, languageStats: companyLanguageStats });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== PHRASE DOWNLOAD FILTER OPTIONS =====
router.get("/phrases/download-filter-options", requireAuth(JWT_SECRET), async (req, res) => {
    try {
        const { company, status = "approved" } = req.query;
        if (!company) return res.status(400).json({ error: "Company name is required" });

        const companyFolder = company.replace(/[^a-zA-Z0-9_\-\ ]/g, "").trim();
        const targetStatus = (status === "recorded" || status === "pending") ? "recorded" : "approved";

        const targetCompanyIds = [
            companyFolder,
            `${companyFolder}_downloaded`,
            companyFolder.toLowerCase(),
            `${companyFolder.toLowerCase()}_downloaded`
        ];

        const reqLanguage = req.query.language ? String(req.query.language).trim().toLowerCase() : "";
        const queryFilter = {
            companyId: { $in: targetCompanyIds },
            status: targetStatus,
            audioFile: { $ne: null }
        };
        if (reqLanguage && reqLanguage !== "all") {
            queryFilter.language = new RegExp(`^${reqLanguage.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, "i");
        }

        const phrases = await Phrase.find(queryFilter).populate("contributorId").lean();

        const reqDateFormat = String(req.query.dateFormat || "DD-MM-YYYY").toUpperCase().trim();
        const dateLabel = reqDateFormat === "YYYY-MM-DD" ? "Recording Date (YYYY-MM-DD)" : "Recording Date (DD-MM-YYYY)";

        const filterKeysMap = {
            recording_date: { label: dateLabel, values: new Map() },
            first_name: { label: "First Name", values: new Map() },
            last_name: { label: "Last Name", values: new Map() },
            speaker_id: { label: "Speaker ID", values: new Map() },
            language: { label: "Language", values: new Map() },
            gender: { label: "Gender", values: new Map() },
            emotion: { label: "Emotion", values: new Map() },
            style: { label: "Style", values: new Map() },
            intent: { label: "Intent", values: new Map() },
            pitch: { label: "Pitch", values: new Map() },
            speed: { label: "Speed", values: new Map() },
            volume: { label: "Volume", values: new Map() },
            script_type: { label: "Script Type", values: new Map() }
        };

        const addVal = (k, v) => {
            if (v === undefined || v === null || String(v).trim() === "") return;
            const strVal = String(v).trim();
            if (!filterKeysMap[k]) {
                filterKeysMap[k] = { label: k.charAt(0).toUpperCase() + k.slice(1), values: new Map() };
            }
            filterKeysMap[k].values.set(strVal, (filterKeysMap[k].values.get(strVal) || 0) + 1);
        };

        for (const p of phrases) {
            const contributor = p.contributorId || {};
            const spkId = contributor.speaker_id || p.speaker_id || "";
            const fName = contributor.firstname ? String(contributor.firstname).trim() : (contributor.username || "");
            const lName = contributor.lastname ? String(contributor.lastname).trim() : "";
            const lang = String(p.language || "").trim().toLowerCase();
            const gdr = contributor.gender ? String(contributor.gender).trim().toLowerCase() : "";
            
            // Format dates
            if (p.recordedAt) {
                const d = new Date(p.recordedAt);
                if (!isNaN(d.getTime())) {
                    const day = String(d.getDate()).padStart(2, "0");
                    const month = String(d.getMonth() + 1).padStart(2, "0");
                    const year = d.getFullYear();
                    const formattedDate = reqDateFormat === "YYYY-MM-DD" ? `${year}-${month}-${day}` : `${day}-${month}-${year}`;
                    addVal("recording_date", formattedDate);
                }
            }

            if (fName) addVal("first_name", fName);
            if (lName) addVal("last_name", lName);
            if (spkId) addVal("speaker_id", spkId);
            if (lang) addVal("language", lang);
            if (gdr) addVal("gender", gdr);

            if (p.emotion) addVal("emotion", p.emotion);
            if (p.style) addVal("style", p.style);
            if (p.intent) addVal("intent", p.intent);
            if (p.pitch) addVal("pitch", p.pitch);
            if (p.speed) addVal("speed", p.speed);
            if (p.volume) addVal("volume", p.volume);
            if (p.script_type) addVal("script_type", p.script_type);

            if (p.tags && typeof p.tags === "object") {
                for (const [tk, tv] of Object.entries(p.tags)) {
                    if (tv && typeof tv !== "object") {
                        addVal(tk, String(tv));
                    }
                }
            }
        }

        const filterOptions = [];
        for (const [k, meta] of Object.entries(filterKeysMap)) {
            if (meta.values.size > 0) {
                const valuesArr = Array.from(meta.values.entries()).map(([val, cnt]) => ({
                    value: val,
                    count: cnt
                })).sort((a, b) => b.count - a.count);

                filterOptions.push({
                    key: k,
                    label: meta.label,
                    values: valuesArr
                });
            }
        }

        let freshCount = 0;
        if (targetStatus === "approved") {
            freshCount = phrases.filter(p => !String(p.companyId || "").endsWith("_downloaded")).length;
        }

        res.json({
            success: true,
            company: companyFolder,
            status: targetStatus,
            totalCount: phrases.length,
            freshCount: freshCount,
            filterOptions
        });
    } catch (e) {
        console.error("download-filter-options error:", e);
        res.status(500).json({ error: e.message });
    }
});

// ===== COMPANY MANAGEMENT =====


router.post("/companies", requireAuth(JWT_SECRET), async (req, res) => {
    try {
        const { name, maxContributionMinutes, hourlyPayout, projectName, namingPattern, singlePhraseFrequency, numberOfSamples } = req.body;
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
            numberOfSamples: Number.isInteger(Number(numberOfSamples)) && Number(numberOfSamples) >= 1 ? Number(numberOfSamples) : 1,
            projectName: projectName && projectName.trim() ? projectName.trim() : cleanName,
            namingPattern: namingPattern && namingPattern.trim() ? namingPattern.trim() : "{phraseId}",
            allowPhraseTextEdit: Boolean(req.body.allowPhraseTextEdit),
            enforceLufs: req.body.enforceLufs !== undefined ? Boolean(req.body.enforceLufs) : true
        });
        res.status(201).json({ message: "Company created successfully", company });
    } catch (e) {
        if (e.code === 11000) return res.status(400).json({ error: "Company name already exists" });
        res.status(500).json({ error: e.message });
    }
});

router.patch("/companies/:id", async (req, res) => {
    try {
        const { maxContributionMinutes, hourlyPayout, singlePhraseFrequency, numberOfSamples, projectName, namingPattern, userCustomizations, downloadCustomizations, chronologicalTag, allowPhraseTextEdit, enforceLufs } = req.body;
        const updateData = {};
        if (maxContributionMinutes !== undefined) updateData.maxContributionMinutes = Number(maxContributionMinutes);
        if (hourlyPayout !== undefined) updateData.hourlyPayout = Number(hourlyPayout);
        if (singlePhraseFrequency !== undefined) updateData.singlePhraseFrequency = Math.max(1, Number(singlePhraseFrequency) || 1);
        if (numberOfSamples !== undefined) updateData.numberOfSamples = Math.max(1, Number(numberOfSamples) || 1);
        if (projectName !== undefined) updateData.projectName = String(projectName).trim();
        if (namingPattern !== undefined) updateData.namingPattern = String(namingPattern).trim();
        if (userCustomizations !== undefined) updateData.userCustomizations = userCustomizations;
        if (downloadCustomizations !== undefined) updateData.downloadCustomizations = downloadCustomizations;
        if (chronologicalTag !== undefined) updateData.chronologicalTag = String(chronologicalTag).trim().toLowerCase();
        if (allowPhraseTextEdit !== undefined) updateData.allowPhraseTextEdit = Boolean(allowPhraseTextEdit);
        if (enforceLufs !== undefined) updateData.enforceLufs = Boolean(enforceLufs);
        if (req.body.isBoosted !== undefined) {
            const isBoost = Boolean(req.body.isBoosted);
            if (isBoost) {
                const existing = await Company.findById(req.params.id);
                if (existing && existing.isHidden) {
                    return res.status(400).json({ error: "Cannot boost a hidden project. Please unhide the project first before boosting." });
                }
            }
            updateData.isBoosted = isBoost;
        }
        
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

router.patch("/companies/:id/languages/:language/phrases/:phraseId/toggle-sample", async (req, res) => {
    try {
        const { phraseId } = req.params;
        const phrase = await Phrase.findOne({
            $or: [
                { phraseId },
                mongoose.Types.ObjectId.isValid(phraseId) ? { _id: phraseId } : null
            ].filter(Boolean)
        });
        if (!phrase) return res.status(404).json({ error: "Phrase not found" });

        phrase.isSample = !phrase.isSample;
        await phrase.save();

        res.json({
            message: `Phrase '${phrase.phraseId}' is now ${phrase.isSample ? 'designated as a test sample' : 'standard phrase'}`,
            isSample: phrase.isSample,
            phrase
        });
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

router.patch("/companies/:id/toggle-hide", async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);
        if (!company) return res.status(404).json({ error: "Company not found" });

        company.isHidden = !company.isHidden;
        if (company.isHidden) {
            company.isBoosted = false; // Hidden projects cannot remain boosted
        }
        await company.save();

        res.json({ 
            message: `Project '${company.name}' is now ${company.isHidden ? 'hidden (unboosted)' : 'visible'}`,
            isHidden: company.isHidden,
            isBoosted: company.isBoosted,
            company
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.patch("/companies/:id/languages/:language/toggle-hide", async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);
        if (!company) return res.status(404).json({ error: "Company not found" });

        const langCode = String(req.params.language).toLowerCase().trim();
        if (!langCode) return res.status(400).json({ error: "Language code is required" });

        const hiddenLangs = (company.hiddenLanguages || []).map(l => String(l).toLowerCase().trim());
        const isCurrentlyHidden = hiddenLangs.includes(langCode);

        if (isCurrentlyHidden) {
            company.hiddenLanguages = hiddenLangs.filter(l => l !== langCode);
        } else {
            company.hiddenLanguages = [...hiddenLangs, langCode];
        }

        await company.save();

        res.json({
            message: `Language '${langCode}' is now ${!isCurrentlyHidden ? 'hidden' : 'visible'} for project '${company.name}'`,
            isHidden: !isCurrentlyHidden,
            hiddenLanguages: company.hiddenLanguages,
            company
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

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
            { 
              $group: { 
                _id: { $toLower: "$language" }, 
                count: { $sum: 1 },
                reservedCount: {
                  $sum: {
                    $cond: [
                      {
                        $or: [
                          { $and: [{ $ne: ["$assigned_speaker_id", null] }, { $ne: ["$assigned_speaker_id", ""] }] },
                          { $and: [{ $eq: ["$status", "pending"] }, { $ne: ["$speaker_id", null] }, { $ne: ["$speaker_id", ""] }] }
                        ]
                      },
                      1,
                      0
                    ]
                  }
                },
                openPoolCount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $or: [{ $eq: ["$assigned_speaker_id", null] }, { $eq: ["$assigned_speaker_id", ""] }] },
                          { $or: [{ $ne: ["$status", "pending"] }, { $eq: ["$speaker_id", null] }, { $eq: ["$speaker_id", ""] }] }
                        ]
                      },
                      1,
                      0
                    ]
                  }
                },
                pendingCount: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
                recordedCount: { $sum: { $cond: [{ $eq: ["$status", "recorded"] }, 1, 0] } },
                approvedCount: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
              } 
            },
            { $sort: { _id: 1 } }
        ]);

        const hiddenSet = new Set((company.hiddenLanguages || []).map(l => String(l).toLowerCase().trim()));

        const languages = langStats.map(s => ({
            code: s._id,
            name: s._id.charAt(0).toUpperCase() + s._id.slice(1),
            count: s.count || 0,
            reservedCount: s.reservedCount || 0,
            openPoolCount: s.openPoolCount || 0,
            pendingCount: s.pendingCount || 0,
            recordedCount: s.recordedCount || 0,
            approvedCount: s.approvedCount || 0,
            isHidden: hiddenSet.has(s._id)
        }));

        const totalPhrases = languages.reduce((sum, l) => sum + l.count, 0);
        const totalReserved = languages.reduce((sum, l) => sum + l.reservedCount, 0);
        const totalOpenPool = languages.reduce((sum, l) => sum + l.openPoolCount, 0);
        const totalPending = languages.reduce((sum, l) => sum + l.pendingCount, 0);
        const totalRecorded = languages.reduce((sum, l) => sum + l.recordedCount, 0);
        const totalApproved = languages.reduce((sum, l) => sum + l.approvedCount, 0);

        res.json({
            company,
            languages,
            summary: {
                totalPhrases,
                totalReserved,
                totalOpenPool,
                totalPending,
                totalRecorded,
                totalApproved
            }
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
        const baseFilter = { 
            companyId: { $regex: companyRegex },
            language: { $regex: new RegExp(`^${language}$`, "i") }
        };

        const filter = { ...baseFilter };

        if (req.query.allocation === "reserved") {
            filter.$or = [
                { assigned_speaker_id: { $nin: [null, ""] } },
                { status: "pending", speaker_id: { $nin: [null, ""] } }
            ];
        } else if (req.query.allocation === "open") {
            filter.$and = filter.$and || [];
            filter.$and.push({
                $or: [
                    { assigned_speaker_id: null },
                    { assigned_speaker_id: "" },
                    { assigned_speaker_id: { $exists: false } }
                ]
            });
            filter.$and.push({
                $or: [
                    { status: { $ne: "pending" } },
                    { speaker_id: null },
                    { speaker_id: "" },
                    { speaker_id: { $exists: false } }
                ]
            });
        }

        if (req.query.status && req.query.status !== "all") {
            filter.status = req.query.status;
        }

        if (req.query.search) {
            const regex = new RegExp(req.query.search.trim(), "i");
            const searchOr = [
                { phraseId: regex },
                { text: regex },
                { emotion: regex },
                { style: regex },
                { intent: regex },
                { assigned_speaker_id: regex },
                { speaker_id: regex }
            ];
            if (filter.$or) {
                filter.$and = filter.$and || [];
                filter.$and.push({ $or: filter.$or });
                delete filter.$or;
                filter.$and.push({ $or: searchOr });
            } else {
                filter.$or = searchOr;
            }
        }

        // Aggregate language summary stats
        const statsAgg = await Phrase.aggregate([
            { $match: baseFilter },
            {
                $group: {
                    _id: null,
                    totalCount: { $sum: 1 },
                    reservedCount: {
                        $sum: {
                            $cond: [
                                {
                                    $or: [
                                        { $and: [{ $ne: ["$assigned_speaker_id", null] }, { $ne: ["$assigned_speaker_id", ""] }] },
                                        { $and: [{ $eq: ["$status", "pending"] }, { $ne: ["$speaker_id", null] }, { $ne: ["$speaker_id", ""] }] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    openPoolCount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $or: [{ $eq: ["$assigned_speaker_id", null] }, { $eq: ["$assigned_speaker_id", ""] }] },
                                        { $or: [{ $ne: ["$status", "pending"] }, { $eq: ["$speaker_id", null] }, { $eq: ["$speaker_id", ""] }] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    pendingCount: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
                    lockedCount: {
                        $sum: {
                            $cond: [
                                {
                                    $or: [
                                        { $eq: ["$status", "locked"] },
                                        { $ne: ["$lockedBy", null] },
                                        { $ne: ["$qaLockedBy", null] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    recordedCount: { $sum: { $cond: [{ $eq: ["$status", "recorded"] }, 1, 0] } },
                    approvedCount: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
                }
            }
        ]);

        const langSummary = statsAgg[0] || {
            totalCount: 0,
            reservedCount: 0,
            openPoolCount: 0,
            pendingCount: 0,
            lockedCount: 0,
            recordedCount: 0,
            approvedCount: 0
        };

        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = req.query.limit === "all" ? 100000 : Math.max(1, parseInt(req.query.limit) || 50);
        const skip = req.query.limit === "all" ? 0 : (page - 1) * limit;

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
            totalPages: Math.ceil(totalPhrases / limit),
            summary: langSummary
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post("/phrases/:phraseId/set-sample", async (req, res) => {
    try {
        const targetPhrase = await Phrase.findById(req.params.phraseId);
        if (!targetPhrase) return res.status(404).json({ error: "Phrase not found" });

        const slotInput = req.body?.sampleSlot !== undefined ? req.body.sampleSlot : null;

        if (slotInput === null || slotInput === 0 || slotInput === false || slotInput === "" || slotInput === "remove") {
            targetPhrase.isSample = false;
            targetPhrase.sampleSlot = null;
            await targetPhrase.save();

            return res.json({
                message: `Phrase "${targetPhrase.phraseId}" removed from application samples`,
                isSample: false,
                sampleSlot: null,
                phrase: targetPhrase
            });
        }

        const slotNumber = parseInt(slotInput, 10);
        if (isNaN(slotNumber) || slotNumber < 1) {
            return res.status(400).json({ error: "Sample slot must be a positive integer (e.g. 1, 2, 3...)" });
        }

        // If another phrase for the same company & language has this slot, reset it
        if (targetPhrase.companyId && targetPhrase.language) {
            await Phrase.updateMany(
                {
                    _id: { $ne: targetPhrase._id },
                    companyId: targetPhrase.companyId,
                    language: { $regex: new RegExp(`^${targetPhrase.language}$`, "i") },
                    sampleSlot: slotNumber
                },
                {
                    $set: { isSample: false, sampleSlot: null }
                }
            );
        }

        targetPhrase.isSample = true;
        targetPhrase.sampleSlot = slotNumber;
        await targetPhrase.save();

        res.json({
            message: `Phrase "${targetPhrase.phraseId}" designated as Sample #${slotNumber}`,
            isSample: true,
            sampleSlot: slotNumber,
            phrase: targetPhrase
        });
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

router.post("/companies/:id/phrase-workloads/:language/delete-pending", async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);
        if (!company) return res.status(404).json({ error: "Company not found" });

        const companyFolder = company.name.replace(/[^a-zA-Z0-9_\-\ ]/g, "").trim();
        const companyRegex = new RegExp(`^${companyFolder}(_downloaded)?$`, "i");
        const language = String(req.params.language).trim().toLowerCase();

        const filter = {
            companyId: { $regex: companyRegex },
            language: { $regex: new RegExp(`^${language}$`, "i") },
            status: "pending"
        };

        const result = await Phrase.deleteMany(filter);
        res.json({
            success: true,
            deletedCount: result.deletedCount,
            message: `Deleted ${result.deletedCount} pending phrases for ${company.name} (${language.toUpperCase()}).`
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post("/companies/:id/phrase-workloads/:language/allocate-speaker", async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);
        if (!company) return res.status(404).json({ error: "Company not found" });

        const companyFolder = company.name.replace(/[^a-zA-Z0-9_\-\ ]/g, "").trim();
        const companyRegex = new RegExp(`^${companyFolder}(_downloaded)?$`, "i");
        const language = String(req.params.language).trim().toLowerCase();
        const { speakerId, count, target = "open" } = req.body;

        const cleanSpeakerId = speakerId ? String(speakerId).trim() : null;

        const filter = {
            companyId: { $regex: companyRegex },
            language: { $regex: new RegExp(`^${language}$`, "i") },
            status: "pending"
        };

        if (target === "open") {
            filter.$and = [
                {
                    $or: [
                        { assigned_speaker_id: null },
                        { assigned_speaker_id: "" },
                        { assigned_speaker_id: { $exists: false } }
                    ]
                },
                {
                    $or: [
                        { speaker_id: null },
                        { speaker_id: "" },
                        { speaker_id: { $exists: false } }
                    ]
                }
            ];
        }

        let phrasesToUpdate = await Phrase.find(filter).select("_id").limit(count ? Number(count) : 0);
        const ids = phrasesToUpdate.map(p => p._id);

        if (ids.length === 0) {
            return res.json({
                success: true,
                updatedCount: 0,
                message: "No matching pending phrases found to allocate."
            });
        }

        const updateDoc = cleanSpeakerId 
            ? { $set: { assigned_speaker_id: cleanSpeakerId, speaker_id: cleanSpeakerId } }
            : { $unset: { assigned_speaker_id: "", speaker_id: "" } };

        const updateResult = await Phrase.updateMany({ _id: { $in: ids } }, updateDoc);

        res.json({
            success: true,
            updatedCount: updateResult.modifiedCount,
            message: cleanSpeakerId 
                ? `Allocated ${updateResult.modifiedCount} phrases to ${cleanSpeakerId}.` 
                : `Reset ${updateResult.modifiedCount} phrases back to the open pool.`
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post("/companies/:id/phrase-workloads/:language/unlock-all", async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);
        if (!company) return res.status(404).json({ error: "Company not found" });

        const companyFolder = company.name.replace(/[^a-zA-Z0-9_\-\ ]/g, "").trim();
        const companyRegex = new RegExp(`^${companyFolder}(_downloaded)?$`, "i");
        const language = String(req.params.language).trim().toLowerCase();

        const filter = {
            companyId: { $regex: companyRegex },
            language: { $regex: new RegExp(`^${language}$`, "i") },
            $or: [
                { status: "locked" },
                { lockedBy: { $ne: null } },
                { qaLockedBy: { $ne: null } }
            ]
        };

        const phrasesToUnlock = await Phrase.find(filter);
        let unlockedCount = 0;

        for (const p of phrasesToUnlock) {
            p.status = (p.audioFile || p.recordedAt) ? "recorded" : "pending";
            p.lockedBy = null;
            p.lockedAt = null;
            p.qaLockedBy = null;
            p.qaLockedAt = null;
            await p.save();
            unlockedCount++;
        }

        res.json({
            success: true,
            unlockedCount,
            message: `Successfully unlocked ${unlockedCount} locked phrases for ${company.name} (${language.toUpperCase()}).`
        });
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
            isDeleted: { $ne: true },
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
            .select("firstname lastname email username mobileNumber phone speaker_id dailyCallLimit overallCallLimit dailyPhraseLimit overallPhraseLimit isDisabled contributorAgreement.signedAt contributorAgreement.adminReviewedAt contributorAgreement.agreementVersion contributorAgreement.s3Key")
            .sort({ "contributorAgreement.adminReviewedAt": -1 })
            .lean();
        res.json({
            users: users.map(u => ({
                userId: u._id.toString(),
                firstname: u.firstname,
                lastname: u.lastname,
                email: u.email,
                username: u.username,
                mobileNumber: u.mobileNumber || u.phone || null,
                speaker_id: u.speaker_id,
                dailyCallLimit: u.dailyCallLimit,
                overallCallLimit: u.overallCallLimit,
                dailyPhraseLimit: u.dailyPhraseLimit,
                overallPhraseLimit: u.overallPhraseLimit,
                isDisabled: !!u.isDisabled,
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

// ─── AMBIGUITY & AUDIT SAMPLING ROUTES ──────────────────────────────────────────

// GET Ambiguity Stats (Pending counts)
router.get("/ambiguity/stats", async (req, res) => {
    try {
        const [pendingCalls, pendingPhrases] = await Promise.all([
            Ambiguity.countDocuments({ type: "call", status: "pending" }),
            Ambiguity.countDocuments({ type: "phrase", status: "pending" })
        ]);
        res.json({ pendingCalls, pendingPhrases, totalPending: pendingCalls + pendingPhrases });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET QA Ambiguity Breakdown (Counts per QA user)
router.get("/ambiguity/qa-breakdown", async (req, res) => {
    try {
        const qaUsers = await User.find({ isQA: true })
            .select("firstname lastname username email qaLanguageCode qaLanguageCodes")
            .sort({ firstname: 1, username: 1 })
            .lean();

        const allAmbiguities = await Ambiguity.find({}).lean();

        const qaBreakdown = qaUsers.map((qa) => {
            const qaIdStr = qa._id.toString();

            let callAmbiguitiesCount = 0;
            let phraseAmbiguitiesCount = 0;
            let pendingCount = 0;
            let resolvedCount = 0;

            for (const amb of allAmbiguities) {
                const isQaInvolved = Array.isArray(amb.qaReviews) && amb.qaReviews.some(
                    r => r.qaId && r.qaId.toString() === qaIdStr
                );

                if (isQaInvolved) {
                    if (amb.type === "call") {
                        callAmbiguitiesCount++;
                    } else if (amb.type === "phrase") {
                        phraseAmbiguitiesCount++;
                    }

                    if (amb.status === "pending") {
                        pendingCount++;
                    } else if (amb.status === "resolved") {
                        resolvedCount++;
                    }
                }
            }

            return {
                qaUser: {
                    _id: qa._id,
                    name: `${qa.firstname || ""} ${qa.lastname || ""}`.trim() || qa.username,
                    username: qa.username,
                    email: qa.email
                },
                callAmbiguitiesCount,
                phraseAmbiguitiesCount,
                totalAmbiguitiesCount: callAmbiguitiesCount + phraseAmbiguitiesCount,
                pendingCount,
                resolvedCount
            };
        }).sort((a, b) => b.totalAmbiguitiesCount - a.totalAmbiguitiesCount);

        res.json({ qaBreakdown });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET Ambiguity List (Calls / Phrases)
router.get("/ambiguity", async (req, res) => {
    try {
        const type = req.query.type || "call"; // "call" | "phrase"
        const status = req.query.status || "pending"; // "pending" | "resolved" | "all"
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const skip = (page - 1) * limit;

        const filter = { type };
        if (status !== "all") {
            filter.status = status;
        }

        const [ambiguities, total] = await Promise.all([
            Ambiguity.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Ambiguity.countDocuments(filter)
        ]);

        // Enrich with call or phrase details
        const enriched = await Promise.all(
            ambiguities.map(async (item) => {
                let callDoc = null;
                let phraseDoc = null;
                if (item.type === "call" && item.callId) {
                    callDoc = await CallSession.findOne({ callId: item.callId })
                        .populate("userA", "firstname lastname username email speaker_id")
                        .populate("userB", "firstname lastname username email speaker_id")
                        .populate("topicId", "title")
                        .populate("subtopicId", "title instructions")
                        .lean();
                } else if (item.type === "phrase" && item.phraseId) {
                    phraseDoc = await Phrase.findOne({ phraseId: item.phraseId })
                        .populate("contributorId", "firstname lastname username email speaker_id")
                        .lean();
                }

                return {
                    ...item,
                    callDetails: callDoc,
                    phraseDetails: phraseDoc
                };
            })
        );

        res.json({ ambiguities: enriched, total, page, pages: Math.ceil(total / limit) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST Admin Ambiguity Resolution
router.post("/ambiguity/:id/resolve", async (req, res) => {
    try {
        const { decision, decisionA, decisionB, notes } = req.body;
        const amb = await Ambiguity.findById(req.params.id);
        if (!amb) return res.status(404).json({ error: "Ambiguity record not found" });

        amb.status = "resolved";
        amb.resolvedBy = req.user._id;
        amb.adminNotes = notes || null;
        amb.resolvedAt = new Date();

        if (amb.type === "call") {
            const decA = decisionA || decision || "approved";
            const decB = decisionB || decision || "approved";
            if (!["approved", "rejected"].includes(decA) || !["approved", "rejected"].includes(decB)) {
                return res.status(400).json({ error: "decisionA and decisionB must be 'approved' or 'rejected'" });
            }

            amb.adminDecisionA = decA;
            amb.adminDecisionB = decB;
            amb.adminDecision = (decA === "approved" && decB === "approved") ? "approved" : (decA === "rejected" && decB === "rejected") ? "rejected" : "partial";
            await amb.save();

            const finalCallStatus = (decA === "approved" || decB === "approved") ? "approved" : "rejected";
            await CallSession.updateOne(
                { callId: amb.callId },
                {
                    $set: {
                        recordingAStatus: decA,
                        recordingBStatus: decB,
                        callStatus: finalCallStatus,
                        reviewedBy: req.user._id,
                        reviewedAt: new Date()
                    }
                }
            );

            // Audit flags for QAs
            if (Array.isArray(amb.qaReviews) && amb.qaReviews.length > 0) {
                for (const rev of amb.qaReviews) {
                    if (rev.qaId) {
                        const isOverriddenA = rev.recordingAAction !== decA;
                        const isOverriddenB = rev.recordingBAction !== decB;
                        const isOverridden = isOverriddenA || isOverriddenB;
                        const defaultNote = isOverridden
                            ? `Admin rendered individual verdicts (Speaker A: ${decA.toUpperCase()}, Speaker B: ${decB.toUpperCase()}). Your review was overridden.`
                            : `Admin confirmed your review (Speaker A: ${decA.toUpperCase()}, Speaker B: ${decB.toUpperCase()}).`;

                        await QaFlag.create({
                            qaId: rev.qaId,
                            ambiguityId: amb._id,
                            type: "call",
                            itemId: amb.callId,
                            qaVerdict: `SpkA:${rev.recordingAAction || "-"}, SpkB:${rev.recordingBAction || "-"}`,
                            adminVerdict: `SpkA:${decA}, SpkB:${decB}`,
                            qaVerdictA: rev.recordingAAction || "approved",
                            qaVerdictB: rev.recordingBAction || "approved",
                            adminVerdictA: decA,
                            adminVerdictB: decB,
                            isOverridden,
                            note: notes || defaultNote,
                            resolvedBy: req.user._id
                        });
                    }
                }
            }
        } else {
            // Phrase ambiguity resolution
            if (!["approved", "rejected"].includes(decision)) {
                return res.status(400).json({ error: "decision must be 'approved' or 'rejected'" });
            }
            amb.adminDecision = decision;
            await amb.save();

            await Phrase.updateOne(
                { phraseId: amb.phraseId },
                { $set: { status: decision, qaId: req.user._id, reviewedAt: new Date() } }
            );

            if (Array.isArray(amb.qaReviews) && amb.qaReviews.length > 0) {
                for (const rev of amb.qaReviews) {
                    if (rev.qaId) {
                        const isOverridden = rev.action !== decision;
                        const defaultNote = isOverridden
                            ? `Admin overridden your ${rev.action} verdict to ${decision.toUpperCase()}.`
                            : `Admin confirmed your ${rev.action} verdict.`;

                        await QaFlag.create({
                            qaId: rev.qaId,
                            ambiguityId: amb._id,
                            type: "phrase",
                            itemId: amb.phraseId,
                            qaVerdict: rev.action || "pending",
                            adminVerdict: decision,
                            isOverridden,
                            note: notes || defaultNote,
                            resolvedBy: req.user._id
                        });
                    }
                }
            }
        }

        res.json({ message: "Ambiguity resolved successfully", ambiguity: amb });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET QA Flags (for logged in QA user or Admin)
qaCallRouter.get("/flags", async (req, res) => {
    try {
        const targetUserId = req.query.qaUserId || req.user._id;
        const flags = await QaFlag.find({ qaId: targetUserId })
            .sort({ createdAt: -1 })
            .lean();
        const unreadCount = flags.filter(f => !f.readAt).length;

        res.json({ flags, unreadCount });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PATCH Mark QA Flag as read
qaCallRouter.patch("/flags/:id/read", async (req, res) => {
    try {
        await QaFlag.updateOne(
            { _id: req.params.id, qaId: req.user._id },
            { $set: { readAt: new Date() } }
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
