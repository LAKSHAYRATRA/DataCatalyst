import mongoose from "mongoose";

const dialogueTurnSchema = new mongoose.Schema(
    {
        order: { type: Number, default: 0 },
        speaker1: { type: String, required: true, trim: true },
        speaker2: { type: String, required: true, trim: true },
    },
    { _id: false }
);

const scriptedSubtopicSchema = new mongoose.Schema(
    {
        topicId: { type: mongoose.Schema.Types.ObjectId, ref: "ScriptedTopic", required: true },
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        instructions: { type: String, trim: true },
        rawScript: { type: String, trim: true }, // Stores lines formatted as "Speaker 1 || Speaker 2"
        dialogueTurns: [dialogueTurnSchema],    // Structured 2-person dialogue turns
        speaker1Gender: { type: String, enum: ["any", "male", "female"], default: "any" },
        speaker2Gender: { type: String, enum: ["any", "male", "female"], default: "any" },
        frequency: { type: Number, default: 3, min: 1 }, // Target frequency: how many times it must be recorded by distinct speakers
        maxCalls: { type: Number, default: 3 }, // Backward-compatible alias
        isEnabled: { type: Boolean, default: true },
    },
    { timestamps: true }
);

scriptedSubtopicSchema.pre("save", function(next) {
    if (this.frequency !== undefined) {
        this.maxCalls = this.frequency;
    } else if (this.maxCalls !== undefined) {
        this.frequency = this.maxCalls;
    }
    next();
});

export const ScriptedSubtopic = mongoose.model("ScriptedSubtopic", scriptedSubtopicSchema);
