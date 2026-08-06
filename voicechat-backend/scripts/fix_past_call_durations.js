import mongoose from "mongoose";
import dotenv from "dotenv";
import { CallSession } from "../src/models/CallSession.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/voicechat";

async function fixPastCallDurations() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB.");

    const calls = await CallSession.find({ actualCallDuration: { $gt: 0 } });
    let updatedCount = 0;

    for (const call of calls) {
      const canonicalMin = Math.round((Number(call.actualCallDuration) / 60) * 100) / 100;
      
      let needsUpdate = false;
      const update = {};

      if (!call.recordingADurationMinutes || Math.abs(call.recordingADurationMinutes - canonicalMin) > 0.05) {
        update.recordingADurationMinutes = canonicalMin;
        needsUpdate = true;
      }

      if (!call.recordingBDurationMinutes || Math.abs(call.recordingBDurationMinutes - canonicalMin) > 0.05) {
        update.recordingBDurationMinutes = canonicalMin;
        needsUpdate = true;
      }

      if (needsUpdate) {
        await CallSession.updateOne({ _id: call._id }, { $set: update });
        updatedCount++;
        console.log(`Updated CallSession ${call.callId}: canonical duration set to ${canonicalMin} mins`);
      }
    }

    console.log(`Successfully updated ${updatedCount} past call records.`);
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

fixPastCallDurations();
