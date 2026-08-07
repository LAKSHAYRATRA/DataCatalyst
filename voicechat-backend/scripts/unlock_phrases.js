import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/voicechat";

async function unlockAllPhrases() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB.");

    const res = await mongoose.connection.collection("phrases").updateMany(
      { status: "locked" },
      { 
        $set: { status: "pending" },
        $unset: { lockedBy: "", lockedAt: "" }
      }
    );

    console.log(`SUCCESS: Unlocked ${res.modifiedCount} locked phrases back to pending status.`);
  } catch (err) {
    console.error("Error unlocking phrases:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

unlockAllPhrases();
