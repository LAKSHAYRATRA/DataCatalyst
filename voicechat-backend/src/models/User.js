import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    firstname: { type: String, trim: true },
    lastname: { type: String, trim: true },
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    currentSocketId: { type: String, default: null },
    isAdmin: { type: Boolean, default: false },
    isQA: { type: Boolean, default: false },
    qaLanguageCode: { type: String, lowercase: true, trim: true, default: null },
    qaLanguageCodes: [{ type: String, lowercase: true, trim: true }],
    dailyCallLimit: { type: Number, default: 3, min: 0 },
    overallCallLimit: { type: Number, default: -1 }, // -1 means unlimited
    dailyPhraseLimit: { type: Number, default: 1000, min: 0 },
    overallPhraseLimit: { type: Number, default: -1 }, // -1 means unlimited
    tokenVersion: { type: Number, default: 0 },
    isEmailVerified: { type: Boolean, default: false },
    dob: { type: Date, required: true },

    // New profile fields
    gender: {
      type: String,
      enum: ["male", "female", "other"],
      required: true,
    },
    regionalLanguage: {
      type: String,
      required: true,
      trim: true,
    },
    locality: {
      type: String,
      enum: ["urban", "rural"],
      required: true,
    },
    address: {
      street: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      pincode: { type: String, required: true, trim: true },
    },
    microphoneBrand: { type: String, required: true, trim: true },
    microphoneModel: { type: String, required: true, trim: true },

    // Approval flow
    accountStatus: {
      type: String,
      enum: ["pending_intro", "pending_approval", "approved", "rejected"],
      default: "pending_intro",
    },
    introRecordingFile: { type: String, default: null }, // relative path
    rejectionReason: { type: String, default: null },

    // Language applications — one entry per language the user has applied for
    languageApplications: [
      {
        languageCode: { type: String, required: true, lowercase: true, trim: true },
        status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
        recordingFile: { type: String, default: null },
        appliedAt: { type: Date, default: Date.now },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reviewedAt: { type: Date, default: null },
      },
    ],
    
    // Reset Password
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
