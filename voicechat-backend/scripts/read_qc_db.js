import mongoose from "mongoose";
import { CallSession } from "../src/models/CallSession.js";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/voicechat";

async function run() {
  await mongoose.connect(MONGODB_URI);
  try {
    const call = await CallSession.findOne({ callId: "81233f27-ddd3-4d3c-9460-01c21c3872d1" });
    if (!call) {
      console.log("Call not found!");
      return;
    }
    console.log("User A QC Result:", JSON.stringify(call.recordingAQCResult, null, 2));
    console.log("User B QC Result:", JSON.stringify(call.recordingBQCResult, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
