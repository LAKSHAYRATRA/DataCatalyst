import mongoose from "mongoose";

const assignedProjectSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ["call", "scripted_call", "phrase"],
      required: true
    },
    subprojectId: { type: String, required: true }, // Company ID, Topic ID, or Language Code
    subprojectName: { type: String, required: true },
    languageCode: { type: String, default: "" },
    assignedLanguages: [{ type: String, lowercase: true, trim: true }],
    marginType: {
      type: String,
      enum: ["fixed_per_unit", "percentage"],
      default: "fixed_per_unit"
    },
    baseRate: { type: Number, default: 0 }, // Flat margin decided by Admin (e.g. ₹25/unit)
    unitLabel: { type: String, default: "unit" }, // e.g. "call", "hour", "scripted call"
    isActive: { type: Boolean, default: true },
    assignedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const vendorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    vendorCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    contactPerson: { type: String, trim: true, default: "" },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, default: "" },
    passwordHash: { type: String, required: true },
    payoutDetails: {
      upiId: { type: String, trim: true, default: null },
      accountHolderName: { type: String, trim: true, default: null },
      bankAccountNumber: { type: String, trim: true, default: null },
      ifscCode: { type: String, trim: true, uppercase: true, default: null },
      panNumber: { type: String, trim: true, uppercase: true, default: null }
    },
    assignedProjects: [assignedProjectSchema],
    isStudio: { type: Boolean, default: false },
    defaultArtistPayrate: {
      perCall: { type: Number, default: 0 },
      hourlyPhrase: { type: Number, default: 0 }
    },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active"
    },
    notes: { type: String, default: "" }
  },
  { timestamps: true }
);

export const Vendor = mongoose.model("Vendor", vendorSchema);
export default Vendor;
