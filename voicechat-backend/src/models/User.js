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
    perCallPayrate: { type: Number, default: 0, min: 0 },
    hourlyPhrasePayrate: { type: Number, default: 0, min: 0 },
    tokenVersion: { type: Number, default: 0 },
    isEmailVerified: { type: Boolean, default: false },
    dob: { type: Date, required: true },
    mobileNumber: { type: String, default: null, trim: true },
    phone: { type: String, default: null, trim: true },

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
    introRejectionCount: { type: Number, default: 0 },
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
      assignedAgreementDoc: { type: String, default: "default" },
    },

    // Language applications — one entry per language the user has applied for
    languageApplications: [
      {
        applicationType: { type: String, enum: ["call", "phrase", "scripted_call"], default: "phrase" },
        companyId: { type: String, trim: true, default: null },
        languageCode: { type: String, required: true, lowercase: true, trim: true },
        status: { type: String, enum: ["pending", "approved", "rejected", "blacklisted"], default: "pending" },
        recordingFile: { type: String, default: null },
        sampleRecordings: [{ type: mongoose.Schema.Types.Mixed, default: [] }],
        appliedAt: { type: Date, default: Date.now },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reviewedAt: { type: Date, default: null },
        qcResult: { type: mongoose.Schema.Types.Mixed, default: null },
        noiseGateDb: { type: Number, default: 0 }, // 0 = Disabled (RAW), -6, -10, -12, -15 dB
        notch5kEnabled: { type: Boolean, default: false }, // 5kHz Static Whine Filter
        deHissMode: { type: String, enum: ["off", "14k", "12k", "10k", "8k"], default: "off" }, // High-frequency hiss roll-off
        deEsserMode: { type: String, enum: ["off", "light", "medium", "strong"], default: "off" }, // Sibilance control
        client_spk_id: { type: String, trim: true, default: "" }, // Client-assigned speaker ID (e.g. SPK001)
        customFields: { type: mongoose.Schema.Types.Mixed, default: {} }, // Custom key-value tags scoped to this project
      },
    ],
    noiseGateDb: { type: Number, default: 0 }, // Default noise gate setting for contributor
    notch5kEnabled: { type: Boolean, default: false },
    deHissMode: { type: String, enum: ["off", "14k", "12k", "10k", "8k"], default: "off" },
    deEsserMode: { type: String, enum: ["off", "light", "medium", "strong"], default: "off" },
    
    // Speaker ID (e.g. spk_1, spk_2, ...)
    speaker_id: { type: String, unique: true, sparse: true, default: null },

    // Fallback Client Speaker ID
    client_spk_id: { type: String, trim: true, default: "" },

    accent: { type: String, default: null, trim: true },
    dialect: { type: String, default: null, trim: true },

    // Payout UPI ID
    upiId: { type: String, default: null, trim: true },

    // Reset Password
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },

    // Account disable and deletion state
    isDisabled: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },

    // Admin promotion audit tracking
    adminPromotedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    adminPromotedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
export default User;
