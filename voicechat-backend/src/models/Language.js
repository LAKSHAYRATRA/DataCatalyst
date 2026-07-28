import mongoose from "mongoose";

const languageSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },   // "Hindi"
        code: { type: String, required: true, unique: true, trim: true, lowercase: true }, // "hindi"
        hourlyPayout: { type: Number, required: true, min: 0 },
        sampleRate: { type: Number, default: 48000 },
        enabled: { type: Boolean, default: true },
        maxHoursPerContributor: { type: Number, default: -1 }, // -1 means unlimited
        maxDailyCallLimit: { type: Number, default: 5, min: 1 },
        noisy: { type: Boolean, default: false },
    },
    { timestamps: true }
);

export const Language = mongoose.model("Language", languageSchema);
