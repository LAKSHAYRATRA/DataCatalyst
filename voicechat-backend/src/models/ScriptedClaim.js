import mongoose from "mongoose";

const scriptedClaimSchema = new mongoose.Schema(
    {
        subtopicId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ScriptedSubtopic",
            required: true,
            index: true
        },
        topicId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ScriptedTopic",
            required: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        role: {
            type: String,
            enum: ["speaker1", "speaker2"],
            required: true
        },
        language: {
            type: String,
            default: "english",
            index: true
        },
        lockedAt: {
            type: Date,
            default: Date.now
        },
        lastHeartbeat: {
            type: Date,
            default: Date.now
        },
        status: {
            type: String,
            enum: ["active", "submitted", "released", "expired"],
            default: "active",
            index: true
        }
    },
    { timestamps: true }
);

// Compound index for querying active locks on a subtopic role
scriptedClaimSchema.index({ subtopicId: 1, role: 1, status: 1 });
scriptedClaimSchema.index({ userId: 1, status: 1 });

export const ScriptedClaim = mongoose.model("ScriptedClaim", scriptedClaimSchema);
