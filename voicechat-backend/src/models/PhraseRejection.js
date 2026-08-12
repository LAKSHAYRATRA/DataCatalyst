import mongoose from "mongoose";

const phraseRejectionSchema = new mongoose.Schema(
  {
    phraseId: { type: String, required: true },
    companyId: { type: String, default: null },
    language: { type: String, required: true },
    contributorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    qaId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    qaPhrasePayoutUsd: { type: Number, default: null },
    duration: { type: Number, default: 0 },
    comment: { type: String, default: null },
    rejectedAt: { type: Date, default: Date.now },
    text: { type: String, default: null }
  },
  { timestamps: true }
);

phraseRejectionSchema.index({ companyId: 1, contributorId: 1 });
phraseRejectionSchema.index({ language: 1 });

export const PhraseRejection = mongoose.model("PhraseRejection", phraseRejectionSchema);
