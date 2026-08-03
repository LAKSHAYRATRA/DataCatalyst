import mongoose from "mongoose";
import { User } from "../src/models/User.js";

async function main() {
    await mongoose.connect("mongodb://localhost:27017/voicechat");
    console.log("Connected to MongoDB!");

    // Find the approved user
    const user = await User.findOne({ username: "divyambhatia672", accountStatus: "approved" });
    if (!user) {
        console.error("User divyambhatia672 not found or not approved!");
        process.exit(1);
    }

    console.log(`Found approved user: ${user.username} (${user._id})`);

    // Remove any existing pending call applications for hindi to avoid clutter
    user.languageApplications = user.languageApplications.filter(
        app => !(app.applicationType === "call" && app.languageCode === "hindi" && app.status === "pending")
    );

    // Add a new pending call application with the 2-second audio
    user.languageApplications.push({
        _id: new mongoose.Types.ObjectId(),
        applicationType: "call",
        languageCode: "hindi",
        status: "pending",
        recordingFile: "recordings/calls/test_call_2sec_A.flac",
        appliedAt: new Date(),
        qcResult: null
    });

    user.markModified("languageApplications");
    await user.save();
    console.log("Seeded pending Call Application with 2-second sound successfully!");

    await mongoose.disconnect();
}

main().catch(console.error);
