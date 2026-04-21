import mongoose from "mongoose";

const topicSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        isEnabled: { type: Boolean, default: true },
        languages: [{ type: String, trim: true }],
    },
    { timestamps: true }
);

export const Topic = mongoose.model("Topic", topicSchema);
