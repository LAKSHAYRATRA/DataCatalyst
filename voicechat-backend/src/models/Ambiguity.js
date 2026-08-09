import mongoose from "mongoose";

const ambiguitySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["call", "phrase"], required: true },
    callId: { type: String, default: null },
    phraseId: { type: String, default: null },
    companyId: { type: String, default: null },
    language: { type: String, default: null },

    // Reason: "sampling" (2% audit sampling) or "conflict" (conflicting QA reviews)
    reason: { type: String, enum: ["sampling", "conflict"], default: "sampling" },

    // Audio & Content References for quick view
    audioFile: { type: String, default: null },
    audioFileA: { type: String, default: null },
    audioFileB: { type: String, default: null },
    text: { type: String, default: null },
    duration: { type: Number, default: 0 },

    // Audit logs of QAs who reviewed
    qaReviews: [
      {
        qaId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        qaName: { type: String, default: "" },
        qaUsername: { type: String, default: "" },
        qaEmail: { type: String, default: "" },
        action: { type: String }, // "approved" | "rejected"
        comment: { type: String, default: null },
        recordingAAction: { type: String, default: null },
        recordingBAction: { type: String, default: null },
        recordingAReviewNote: { type: String, default: null },
        recordingBReviewNote: { type: String, default: null },
        recordingARejectionReason: { type: String, default: null },
        recordingBRejectionReason: { type: String, default: null },
        reviewedAt: { type: Date, default: Date.now }
      }
    ],

    // Resolution State
    status: { type: String, enum: ["pending", "resolved"], default: "pending" },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    adminDecision: { type: String, default: null }, // "approved" | "rejected" | "partial"
    adminDecisionA: { type: String, default: null }, // "approved" | "rejected"
    adminDecisionB: { type: String, default: null }, // "approved" | "rejected"
    adminNotes: { type: String, default: null },
    resolvedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

ambiguitySchema.index({ type: 1, status: 1 });
ambiguitySchema.index({ callId: 1 });
ambiguitySchema.index({ phraseId: 1 });

export const Ambiguity = mongoose.model("Ambiguity", ambiguitySchema);
