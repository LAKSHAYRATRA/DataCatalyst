import mongoose from "mongoose";

const scriptedSubmissionSchema = new mongoose.Schema(
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
        language: {
            type: String,
            default: "english",
            index: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        userGender: {
            type: String,
            enum: ["male", "female", "other"],
            default: "other"
        },
        role: {
            type: String,
            enum: ["speaker1", "speaker2"],
            required: true
        },
        verses: [
            {
                turnIndex: { type: Number, required: true },
                audioPath: { type: String, required: true },
                durationSec: { type: Number, default: 0 },
                text: { type: String, default: "" },
                status: {
                    type: String,
                    enum: ["pending", "approved", "rejected"],
                    default: "pending"
                },
                rejectionReason: { type: String, default: null },
                reviewNote: { type: String, default: null },
                reviewedAt: { type: Date, default: null },
                reviewedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                    default: null
                }
            }
        ],
        status: {
            type: String,
            enum: ["pending_match", "matched", "needs_rerecord", "partially_approved", "approved", "rejected", "cancelled"],
            default: "pending_match",
            index: true
        },
        pairedSubmissionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ScriptedSubmission",
            default: null
        },
        callSessionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CallSession",
            default: null
        }
    },
    { timestamps: true }
);

scriptedSubmissionSchema.index({ subtopicId: 1, role: 1, status: 1 });

export const ScriptedSubmission = mongoose.model("ScriptedSubmission", scriptedSubmissionSchema);
