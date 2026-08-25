const mongoose = require('mongoose');

const transcriptionCallSchema = new mongoose.Schema(
  {
    call_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    Segmentation_Done: {
      type: Boolean,
      default: false,
      index: true,
    },
    segmentation_qa: {
      type: Boolean,
      default: false,
      index: true,
    },
    audio1Name: { type: String, default: '' },
    audio2Name: { type: String, default: '' },
    total_segments: { type: Number, default: 0 },
    initial_submitted_segments: { type: Array, default: [] },
    qa_changes_count: { type: Number, default: 0 },
    qa_penalty_percentage: { type: Number, default: 0 },
    qa_payout_percentage: { type: Number, default: 100 },
    ready_for_transcription: { type: Boolean, default: false, index: true },
    transcription_status: { 
      type: String, 
      enum: ['PENDING_TRANSCRIPTION', 'IN_TRANSCRIPTION', 'TRANSCRIPTION_COMPLETED'], 
      default: 'PENDING_TRANSCRIPTION' 
    },
    transcribed_segments_count: { type: Number, default: 0 },
    qa_verified_segments_count: { type: Number, default: 0 },
    asr_status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
    },
    asr_error: { type: String, default: null },
    asr_completed_at: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.TranscriptionCall || mongoose.model('TranscriptionCall', transcriptionCallSchema);
