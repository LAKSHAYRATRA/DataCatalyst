import mongoose from "mongoose";

const phraseSchema = new mongoose.Schema(
  {
    phraseId: { type: String, required: true },
    companyId: { type: String, default: null }, // Optional company grouping
    projectName: { type: String, default: null }, // Optional project grouping
    language: { type: String, required: true },
    script_type: { type: String, default: null },
    assigned_speaker_id: { type: String, default: null, index: true }, // Optional targeted speaker ID from JSON (e.g. spk_129)
    speaker_id: { type: String, default: null }, // from JSON, though we'll assign our own contributorId internally if we want
    text: { type: String, required: true },
    emotion: { type: String, default: null },
    style: { type: String, default: null },
    intent: { type: String, default: null },
    pitch: { type: String, default: null },
    speed: { type: String, default: null },
    volume: { type: String, default: null },
    events: { type: String, default: null },
    instructions: { type: String, default: null },
    freq: { type: Number, default: null },
    tags: { type: mongoose.Schema.Types.Mixed, default: {} },

    // State Tracking
    status: {
      type: String,
      enum: ["pending", "locked", "recorded", "approved", "rejected", "edited"],
      default: "pending",
    },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // Recording Info
    contributorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    audioFile: { type: String, default: null },
    duration: { type: Number, default: 0 }, // audio duration in seconds
    lufs: { type: Number, default: null }, // BS.1770-4 gated LUFS score
    recordedAt: { type: Date, default: null },

    // Audio Trimming & Backup Info
    wasAudioTrimmed: { type: Boolean, default: false },
    originalAudioFile: { type: String, default: null },
    originalDuration: { type: Number, default: null },
    originalLufs: { type: Number, default: null },

    // QA Info & 15-min review lock
    qaId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    qaComment: { type: String, default: null },
    qaPhrasePayoutUsd: { type: Number, default: null },
    reviewedAt: { type: Date, default: null },
    qaLockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    qaLockedAt: { type: Date, default: null },
    isTestPhrase: { type: Boolean, default: false },
    isSample: { type: Boolean, default: false },
    sampleSlot: { type: Number, default: null }, // e.g. 1, 2, 3... for multi-sample order
    qcResult: { type: mongoose.Schema.Types.Mixed, default: null },

    // Dual-QA Cross Audit & Ambiguity Tracking
    needsSecondQaReview: { type: Boolean, default: false },
    firstQaReview: {
      qaId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      action: { type: String },
      comment: { type: String },
      qaPhrasePayoutUsd: { type: Number, default: null },
      reviewedAt: { type: Date }
    },

    // Phrase Text & Audio Editing Tracking
    isEdited: { type: Boolean, default: false },
    originalText: { type: String, default: null },
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    editedAt: { type: Date, default: null },
    editedPhraseStatus: { type: String, enum: ["pending_admin", "approved", "rejected"], default: null },

    // Groq Vision Zero-Tolerance AI Spectrogram Audit
    spectrogramAiAudit: { type: mongoose.Schema.Types.Mixed, default: null },

    // Workload Deletion / Earnings Retention Archival
    isArchivedFromCompanyWorkload: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date, default: null },
    originalPhraseId: { type: String, default: null },

    // Download Tracking (Replaces legacy _downloaded companyId mutation)
    isDownloaded: { type: Boolean, default: false, index: true },
    downloadedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

phraseSchema.index({ companyId: 1, phraseId: 1 }, { unique: true });

export const Phrase = mongoose.model("Phrase", phraseSchema);
