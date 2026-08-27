import mongoose from "mongoose";

const callSessionSchema = new mongoose.Schema(
  {
    callId: { type: String, required: true, unique: true },
    userA: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    userB: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date },
    endReason: { type: String },
    recordingAFile: { type: String },
    recordingAStartedAt: { type: Date },
    recordingBFile: { type: String },
    recordingBStartedAt: { type: Date },
    mixedRecordingFile: { type: String },

    // Topic and Role fields
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: "Topic" },
    subtopicId: { type: mongoose.Schema.Types.ObjectId, ref: "Subtopic" },
    questionerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    answererUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    topicSelectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    topicSelectedAt: { type: Date },

    // Negotiation timing
    negotiationStartedAt: { type: Date },
    negotiationEndedAt: { type: Date },
    rolesConfirmedAt: { type: Date },
    actualCallStartedAt: { type: Date },
    negotiationDuration: { type: Number }, // seconds
    actualCallDuration: { type: Number }, // seconds

    // Language selection (any admin-defined code)
    language: {
      type: String,
      default: 'english',
      required: true
    },


    // Call approval and counting
    callStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    callActuallyStarted: {
      type: Boolean,
      default: false
    },
    // Individual recording statuses for separate approval
    recordingAStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    recordingAReviewNote: { type: String, default: null },
    recordingADurationMinutes: { type: Number, default: 0, min: 0 },
    recordingAPayoutUsd: { type: Number, default: 0, min: 0 },
    recordingANoisy: { type: Boolean, default: false },
    recordingARejectionReason: { type: String, enum: ['Off-Topic Conversation', 'Noisy', null], default: null },
    recordingBStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    recordingBReviewNote: { type: String, default: null },
    recordingBDurationMinutes: { type: Number, default: 0, min: 0 },
    recordingBPayoutUsd: { type: Number, default: 0, min: 0 },
    recordingBNoisy: { type: Boolean, default: false },
    recordingBRejectionReason: { type: String, enum: ['Off-Topic Conversation', 'Noisy', null], default: null },


    // QA Review tracking & 15-minute lock window
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNotes: { type: String, default: null },
    qaCallPayoutUsd: { type: Number, default: null },
    qaLockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    qaLockedAt: { type: Date, default: null },
    downloadLogs: [
      {
        adminUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        downloadedAt: { type: Date, default: Date.now },
        downloadCount: { type: Number, default: 1, min: 1 },
      },
    ],

    // Persistent QC Analytics
    recordingAQCResult: { type: mongoose.Schema.Types.Mixed, default: null },
    recordingBQCResult: { type: mongoose.Schema.Types.Mixed, default: null },

    // Dual-QA Cross Audit & Ambiguity Tracking
    needsSecondQaReview: { type: Boolean, default: false },
    firstQaReview: {
      qaId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      action: { type: String },
      recordingAStatus: { type: String },
      recordingBStatus: { type: String },
      recordingARejectionReason: { type: String },
      recordingBRejectionReason: { type: String },
      recordingAReviewNote: { type: String },
      recordingBReviewNote: { type: String },
      qaCallPayoutUsd: { type: Number, default: null },
      reviewedAt: { type: Date }
    },

    // Soft delete for Admin UI while retaining user earnings and history
    adminDeleted: { type: Boolean, default: false },

    // Monologue tracking for rejected calls sent to monologue transcription
    isMonologued: { type: Boolean, default: false },
    recordingAMonologueStatus: { type: String, enum: ['pending', 'transcribed', 'rejected'], default: 'pending' },
    recordingBMonologueStatus: { type: String, enum: ['pending', 'transcribed', 'rejected'], default: 'pending' },
    monologueDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    // Full Call Dialogue transcription tracking (irrespective of individual speaker rejection)
    transcribedAsCall: { type: Boolean, default: false },
    callTranscriptionStatus: { type: String, enum: ['pending', 'transcribed', 'rejected'], default: 'pending' },
  },
  { timestamps: true }
);

callSessionSchema.index({ userA: 1, startedAt: -1 });
callSessionSchema.index({ userB: 1, startedAt: -1 });

export const CallSession = mongoose.model("CallSession", callSessionSchema);
