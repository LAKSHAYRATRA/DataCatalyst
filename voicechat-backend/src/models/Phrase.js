import mongoose from "mongoose";

const phraseSchema = new mongoose.Schema(
  {
    // Admin / Core JSON fields
    phraseId: { type: String, required: true, unique: true },
    companyId: { type: String, default: null }, // Optional company grouping
    language: { type: String, required: true },
    script_type: { type: String, default: null },
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

    // State Tracking
    status: {
      type: String,
      enum: ["pending", "locked", "recorded", "approved", "rejected"],
      default: "pending",
    },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // Recording Info
    contributorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    audioFile: { type: String, default: null },
    duration: { type: Number, default: 0 }, // audio duration in seconds
    recordedAt: { type: Date, default: null },

    // QA Info
    qaId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    qaComment: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Phrase = mongoose.model("Phrase", phraseSchema);
