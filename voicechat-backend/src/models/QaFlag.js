import mongoose from "mongoose";

const qaFlagSchema = new mongoose.Schema(
  {
    qaId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ambiguityId: { type: mongoose.Schema.Types.ObjectId, ref: "Ambiguity", default: null },
    type: { type: String, enum: ["call", "phrase"], required: true },
    itemId: { type: String, required: true }, // callId or phraseId
    qaVerdict: { type: String, required: true }, // overall QA verdict
    adminVerdict: { type: String, required: true }, // overall Admin verdict
    qaVerdictA: { type: String, default: null }, // QA Speaker A verdict ("approved" | "rejected")
    qaVerdictB: { type: String, default: null }, // QA Speaker B verdict ("approved" | "rejected")
    adminVerdictA: { type: String, default: null }, // Admin Speaker A verdict ("approved" | "rejected")
    adminVerdictB: { type: String, default: null }, // Admin Speaker B verdict ("approved" | "rejected")
    isOverridden: { type: Boolean, default: false }, // true if Admin changed QA's decision
    note: { type: String, required: true }, // Admin feedback note for QA
    originalText: { type: String, default: null },
    qaText: { type: String, default: null },
    adminText: { type: String, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    readAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export const QaFlag = mongoose.model("QaFlag", qaFlagSchema);
