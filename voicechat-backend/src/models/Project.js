import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    languageRates: [
      {
        languageCode: { type: String, required: true, lowercase: true, trim: true },
        hourlyPayout: { type: Number, required: true, min: 0 }
      }
    ]
  },
  { timestamps: true }
);

export const Project = mongoose.model("Project", projectSchema);
