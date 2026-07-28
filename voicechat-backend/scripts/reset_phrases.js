import mongoose from "mongoose";
import dotenv from "dotenv";
import { Phrase } from "../src/models/Phrase.js";
import { User } from "../src/models/User.js";

dotenv.config();

async function run() {
  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/voicechat";
  console.log("Connecting to MongoDB at:", mongoUri);
  await mongoose.connect(mongoUri);

  // 1. Delete all phrases
  const phraseResult = await Phrase.deleteMany({});
  console.log(`Deleted ${phraseResult.deletedCount} phrase documents.`);

  // 2. Clear language applications of type 'phrase'
  const userResult = await User.updateMany(
    {},
    { $pull: { languageApplications: { applicationType: "phrase" } } }
  );
  console.log(`Cleared phrase applications for ${userResult.modifiedCount} users.`);

  await mongoose.disconnect();
  console.log("Disconnected and finished successfully!");
}

run().catch(console.error);
