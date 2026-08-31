import mongoose from "mongoose";

const otpCodeSchema = new mongoose.Schema({
    email: { type: String, required: true, lowercase: true, trim: true },
    code: { type: String, required: true },
    type: { type: String, enum: ["signup", "login", "reset", "make_admin"], required: true },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
});

// TTL index: MongoDB auto-deletes expired docs
otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpCodeSchema.index({ email: 1, type: 1 });

export const OtpCode = mongoose.model("OtpCode", otpCodeSchema);
