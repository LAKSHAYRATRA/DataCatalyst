import mongoose from "mongoose";

const scriptedTopicSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        frequency: { type: Number, default: 3, min: 1 }, // Target frequency (how many times it should be recorded by distinct speakers)
        isEnabled: { type: Boolean, default: true },
        languages: [{ type: String, trim: true }],
    },
    { timestamps: true }
);

export const ScriptedTopic = mongoose.model("ScriptedTopic", scriptedTopicSchema);
