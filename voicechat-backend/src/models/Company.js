import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    maxContributionMinutes: { type: Number, default: 195 }, // 3 hours 15 mins default
    hourlyPayout: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export const Company = mongoose.model("Company", companySchema);
