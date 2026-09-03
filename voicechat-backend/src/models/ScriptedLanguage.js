import mongoose from "mongoose";

const scriptedLanguageSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },   // "Doctor-Patient Conversations (Hindi)" or "Hindi (Scripted)"
        projectName: { type: String, trim: true, default: "" }, // "Doctor-Patient Conversations"
        companyName: { type: String, trim: true, default: "" }, // Internal Admin Client/Company Reference (e.g. "Gnani", "Shaip")
        language: { type: String, trim: true, default: "" },    // "Hindi"
        code: { type: String, required: true, unique: true, trim: true, lowercase: true }, // "hindi-scripted" or "hindi"
        hourlyPayout: { type: Number, required: true, min: 0 },
        sampleRate: { type: Number, default: 48000 },
        enabled: { type: Boolean, default: true },
        maxHoursPerContributor: { type: Number, default: -1 }, // -1 means unlimited
        maxDailyCallLimit: { type: Number, default: 5, min: 1 },
        noisy: { type: Boolean, default: false },
        isBoosted: { type: Boolean, default: false },
        enableCallRoles: { type: Boolean, default: false },
        role1: { type: String, default: "Role 1", trim: true },
        role2: { type: String, default: "Role 2", trim: true },
        testPhrase: { type: String, trim: true, default: "" }, // Test phrase for applicants to read
    },
    { timestamps: true }
);

export const ScriptedLanguage = mongoose.model("ScriptedLanguage", scriptedLanguageSchema);
export default ScriptedLanguage;
