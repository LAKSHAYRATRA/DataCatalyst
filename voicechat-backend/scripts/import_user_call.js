import "dotenv/config";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { User } from "../src/models/User.js";
import { CallSession } from "../src/models/CallSession.js";
import { Topic } from "../src/models/Topic.js";
import { Subtopic } from "../src/models/Subtopic.js";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/voicechat";
const callId = "aac512d3-5af2-4066-a5b5-ccba4539c718";

async function run() {
  console.log("Connecting to Database:", MONGODB_URI);
  await mongoose.connect(MONGODB_URI);

  try {
    const tempExtractDir = path.resolve(process.cwd(), "temp_extracted", callId);
    const subFolder = path.join(tempExtractDir, `call_${callId}`);
    const targetDir = fs.existsSync(subFolder) ? subFolder : tempExtractDir;
    const files = fs.readdirSync(targetDir);
    console.log("Extracted contents:", files);

    const wavA = files.find(f => f.includes("spk_old_02") && f.endsWith(".wav"));
    const wavB = files.find(f => f.includes("spk_old_07") && f.endsWith(".wav"));

    if (!wavA || !wavB) {
      throw new Error(`Could not find both speaker audio WAV files in ${targetDir}. Found: ${files.join(", ")}`);
    }

    const pathA = path.join(targetDir, wavA);
    const pathB = path.join(targetDir, wavB);

    // Copy WAV files to local recordings/calls folder
    const recCallsDir = path.join(process.cwd(), "recordings", "calls");
    if (!fs.existsSync(recCallsDir)) {
      fs.mkdirSync(recCallsDir, { recursive: true });
    }

    const destA = path.join(recCallsDir, wavA);
    const destB = path.join(recCallsDir, wavB);
    fs.copyFileSync(pathA, destA);
    fs.copyFileSync(pathB, destB);
    console.log("Copied local recording files to:", recCallsDir);

    // Topic & Subtopic
    let topic = await Topic.findOne({ title: "General Discussion" });
    if (!topic) {
      topic = await Topic.create({
        title: "General Discussion",
        description: "General topic for QA testing",
        isEnabled: true,
        languages: ["hindi"]
      });
    }

    let subtopic = await Subtopic.findOne({ topicId: topic._id });
    if (!subtopic) {
      subtopic = await Subtopic.create({
        topicId: topic._id,
        title: "Sample Hindi Conversation",
        description: "Sample Hindi Conversation for QA",
        instructions: "Discuss daily activities in Hindi",
        isEnabled: true
      });
    }

    // Users
    let userA = await User.findOne({ username: "spk_old_02" });
    if (!userA) {
      userA = await User.create({
        firstname: "Speaker",
        lastname: "02",
        username: "spk_old_02",
        speaker_id: "spk_old_02",
        email: "spk_old_02@example.com",
        passwordHash: "$2a$10$xyzdummyhashvaluehere",
        accountStatus: "approved"
      });
    }

    let userB = await User.findOne({ username: "spk_old_07" });
    if (!userB) {
      userB = await User.create({
        firstname: "Speaker",
        lastname: "07",
        username: "spk_old_07",
        speaker_id: "spk_old_07",
        email: "spk_old_07@example.com",
        passwordHash: "$2a$10$xyzdummyhashvaluehere",
        accountStatus: "approved"
      });
    }

    const localKeyA = `local:${wavA}`;
    const localKeyB = `local:${wavB}`;

    // Create or update CallSession
    await CallSession.deleteOne({ callId });

    const call = await CallSession.create({
      callId,
      userA: userA._id,
      userB: userB._id,
      startedAt: new Date(),
      endedAt: new Date(Date.now() + 10 * 60 * 1000),
      endReason: "completed",
      callActuallyStarted: true,
      actualCallStartedAt: new Date(),
      actualCallDuration: 600,
      topicId: topic._id,
      subtopicId: subtopic._id,
      language: "hindi",
      callStatus: "pending",
      recordingAStatus: "pending",
      recordingBStatus: "pending",
      recordingAFile: localKeyA,
      recordingBFile: localKeyB,
      recordingADurationMinutes: 10.0,
      recordingBDurationMinutes: 10.0,
    });

    console.log("SUCCESS! Registered call session as pending QA:", call.callId);

  } catch (error) {
    console.error("Error importing call zip:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

run();
