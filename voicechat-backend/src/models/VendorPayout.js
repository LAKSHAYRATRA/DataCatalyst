import mongoose from "mongoose";

const vendorPayoutSchema = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
    amountUsd: { type: Number, required: true, min: 0 },
    amountInr: { type: Number, default: 0 },
    paymentMethod: {
      type: String,
      enum: ["upi", "bank_transfer", "cash", "other"],
      default: "upi"
    },
    referenceId: { type: String, default: "", trim: true }, // e.g. UTR / Bank Reference Number
    note: { type: String, default: "", trim: true },
    paidAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

export const VendorPayout = mongoose.model("VendorPayout", vendorPayoutSchema);
export default VendorPayout;
