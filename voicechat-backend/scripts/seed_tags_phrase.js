import mongoose from "mongoose";
import { Phrase } from "../src/models/Phrase.js";
import { User } from "../src/models/User.js";

async function main() {
    await mongoose.connect("mongodb://localhost:27017/voicechat");
    console.log("Connected to MongoDB!");

    // Find the approved user to lock/assign this phrase to for testing
    const user = await User.findOne({ username: "divyambhatia672" });
    if (!user) {
        console.error("User divyambhatia672 not found!");
        process.exit(1);
    }

    console.log(`Found contributor user: ${user.username} (${user._id})`);

    // Clean up any existing test phrases
    await Phrase.deleteMany({ phraseId: "test_tag_phrase_01" });

    // Create a new phrase with custom tags
    const phrase = await Phrase.create({
        phraseId: "test_tag_phrase_01",
        companyId: "Voclara Labs",
        projectName: "TTS Data Collection",
        language: "hindi",
        text: "नमस्ते, आप कैसे हैं? यह एक कस्टम टैग परीक्षण है।",
        status: "pending",
        tags: {
            domain: "healthcare",
            gender: "male",
            speaker_id: "hindi_SPK001"
        }
    });

    console.log("Seeded test phrase with custom tags successfully!", phrase);
    await mongoose.disconnect();
}

main().catch(console.error);
