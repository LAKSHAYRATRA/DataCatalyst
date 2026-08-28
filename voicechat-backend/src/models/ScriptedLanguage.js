import mongoose from "mongoose";

const scriptedLanguageSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },   // "Hindi (Scripted)"
        code: { type: String, required: true, unique: true, trim: true, lowercase: true }, // "hindi-scripted" or "hindi"
        hourlyPayout: { type: Number, required: true, min: 0 },
        sampleRate: { type: Number, default: 48000 },
        enabled: { type: Boolean, default: true },
        maxHoursPerContributor: { type: Number, default: -1 }, // -1 means unlimited
        maxDailyCallLimit: { type: Number, default: 5, min: 1 },
        noisy: { type: Boolean, default: false },
        testPhrase: { type: String, trim: true, default: "" }, // Test phrase for applicants to read
    },
    { timestamps: true }
);

export const ScriptedLanguage = mongoose.model("ScriptedLanguage", scriptedLanguageSchema);
export default ScriptedLanguage;
