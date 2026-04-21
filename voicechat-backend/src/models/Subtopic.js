import mongoose from "mongoose";

const subtopicSchema = new mongoose.Schema(
    {
        topicId: { type: mongoose.Schema.Types.ObjectId, ref: "Topic", required: true },
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        instructions: { type: String, trim: true },
        isEnabled: { type: Boolean, default: true },
    },
    { timestamps: true }
);

export const Subtopic = mongoose.model("Subtopic", subtopicSchema);
