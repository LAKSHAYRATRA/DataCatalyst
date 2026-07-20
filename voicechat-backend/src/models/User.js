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
    introRecordingUploadedAt: { type: Date, default: null },
    introReviewedAt: { type: Date, default: null },
    introConsent: {
      tos: { type: Boolean, default: false },
      privacy: { type: Boolean, default: false },
      sample: { type: Boolean, default: false },
      at: { type: Date, default: null },
    },
    rejectionReason: { type: String, default: null },

    // KYC — PAN card collection (Section 194O TDS threshold)
    kyc: {
      panNumber: { type: String, default: null, uppercase: true, trim: true },
      panCardS3Key: { type: String, default: null },
      submittedAt: { type: Date, default: null },
      verificationStatus: {
        type: String,
        enum: [null, "pending", "verified", "rejected"],
        default: null,
      },
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      verifiedAt: { type: Date, default: null },
      rejectionReason: { type: String, default: null },
    },

    // Contributor Agreement signing state (Stage-2 gating)
    contributorAgreement: {
      signed: { type: Boolean, default: false },
      signedAt: { type: Date, default: null },
      s3Key: { type: String, default: null },
      signerName: { type: String, default: null },
      signerIp: { type: String, default: null },
      agreementVersion: { type: String, default: null },
      pdfHash: { type: String, default: null },
      adminReviewStatus: {
        type: String,
        enum: [null, "pending", "approved", "rejected"],
        default: null,
      },
      adminReviewedAt: { type: Date, default: null },
      adminReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      adminReviewReason: { type: String, default: null },
    },

    // Language applications — one entry per language the user has applied for
    languageApplications: [
      {
        applicationType: { type: String, enum: ["call", "phrase"], default: "phrase" },
        companyId: { type: String, trim: true, default: null },
        languageCode: { type: String, required: true, lowercase: true, trim: true },
        status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
        recordingFile: { type: String, default: null },
        appliedAt: { type: Date, default: Date.now },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reviewedAt: { type: Date, default: null },
      },
    ],
    
    // Speaker ID (e.g. spk_1, spk_2, ...)
    speaker_id: { type: String, unique: true, sparse: true, default: null },

    // Reset Password
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
