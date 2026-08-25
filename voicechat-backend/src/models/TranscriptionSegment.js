const mongoose = require('mongoose');

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
    call_id: {
      type: String,
      required: true,
      index: true,
    },
    segment_id: {
      type: String,
      required: true,
    },
    call_id_segment_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    speaker: {
      type: String,
      default: 'speaker1',
    },
    start_sec: { type: Number, required: true },
    end_sec: { type: Number, required: true },
    start_ms: { type: Number, required: true },
    end_ms: { type: Number, required: true },
    duration_sec: { type: Number },
    duration_ms: { type: Number },
    segment_text: { type: String, default: '' },
    words: [wordSchema],

    // Workflow Proofreading & QA Flags
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

// Pre-save hook to ensure IsTranscribed is true ONLY when tier1 AND tier2 are verified
transcriptionSegmentSchema.pre('save', function (next) {
  this.IsTranscribed = Boolean(this.tier1_text_verified && this.tier2_timestamps_verified);
  next();
});

transcriptionSegmentSchema.index({ call_id: 1, IsTranscribed: 1, QAVerified: 1 });

module.exports = mongoose.models.TranscriptionSegment || mongoose.model('TranscriptionSegment', transcriptionSegmentSchema);
