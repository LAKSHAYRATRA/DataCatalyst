import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    projectName: { type: String, default: "" },
    maxContributionMinutes: { type: Number, default: 195 }, // 3 hours 15 mins default
    hourlyPayout: { type: Number, default: 0 },
    languages: [{ type: String, lowercase: true, trim: true }]
  },
  { timestamps: true }
);

export const Company = mongoose.model("Company", companySchema);
