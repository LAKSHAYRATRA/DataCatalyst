import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    projectName: { type: String, default: "" },
    maxContributionMinutes: { type: Number, default: 195 }, // 3 hours 15 mins default
    hourlyPayout: { type: Number, default: 0 },
    singlePhraseFrequency: { type: Number, default: 1, min: 1 }, // Number of unique contributors per phrase before retiring
    languages: [{ type: String, lowercase: true, trim: true }],
    namingPattern: { type: String, default: "{phraseId}" },
    userCustomizations: { type: [String], default: [] },
    downloadCustomizations: { type: [String], default: [] }
  },
  { timestamps: true }
);

export const Company = mongoose.model("Company", companySchema);
