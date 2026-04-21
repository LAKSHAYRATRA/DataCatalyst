import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema(
  {
    callId: { type: String, required: true, index: true },
    fromUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    toUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ratingOverall: { type: Number, required: true, min: 1, max: 5 },
    audioQuality: { type: Number, required: true, min: 1, max: 5 },
    wouldTalkAgain: { type: Boolean, required: true },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

export const Feedback = mongoose.model("Feedback", feedbackSchema);
