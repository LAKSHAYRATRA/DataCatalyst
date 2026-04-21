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
    recordingBStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    recordingBReviewNote: { type: String, default: null },
    recordingBDurationMinutes: { type: Number, default: 0, min: 0 },
    recordingBPayoutUsd: { type: Number, default: 0, min: 0 },

    // QA Review tracking
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNotes: { type: String, default: null },
    downloadLogs: [
      {
        adminUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        downloadedAt: { type: Date, default: Date.now },
        downloadCount: { type: Number, default: 1, min: 1 },
      },
    ],
  },
  { timestamps: true }
);

callSessionSchema.index({ userA: 1, startedAt: -1 });
callSessionSchema.index({ userB: 1, startedAt: -1 });

export const CallSession = mongoose.model("CallSession", callSessionSchema);
