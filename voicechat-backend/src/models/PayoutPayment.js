import mongoose from "mongoose";

const payoutPaymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amountUsd: { type: Number, required: true, min: 0 },
    note: { type: String, default: null, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    paidAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const PayoutPayment = mongoose.model("PayoutPayment", payoutPaymentSchema);
