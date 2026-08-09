import "dotenv/config";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { User } from "../src/models/User.js";
import { CallSession } from "../src/models/CallSession.js";
import { Topic } from "../src/models/Topic.js";
import { Subtopic } from "../src/models/Subtopic.js";
import { s3Client, BUCKET_NAME } from "../src/config/s3.js";
import { PutObjectCommand, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/voicechat";
const testDataDir = path.resolve(process.cwd(), "..", "test conversational data");

async function run() {
  console.log("Connecting to Database:", MONGODB_URI);
  await mongoose.connect(MONGODB_URI);

  try {
    // 1. Ensure bucket exists
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
      console.log(`S3 Bucket '${BUCKET_NAME}' is ready.`);
    } catch (err) {
      console.log(`Creating S3 Bucket '${BUCKET_NAME}'...`);
      await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
    }

    // 2. Default Topic & Subtopic
    let topic = await Topic.findOne({ title: "Conversational Data" });
    if (!topic) {
      topic = await Topic.create({
        title: "Conversational Data",
        description: "Test conversational audio dataset",
        isEnabled: true,
        languages: ["hindi"]
      });
    }

    let subtopic = await Subtopic.findOne({ topicId: topic._id });
    if (!subtopic) {
      subtopic = await Subtopic.create({
        topicId: topic._id,
        title: "General Test Dialogue",
        description: "Recorded conversational test audio dataset",
        instructions: "General conversation topic test dataset",
        isEnabled: true
      });
    }

    if (!fs.existsSync(testDataDir)) {
      console.error(`Directory not found: ${testDataDir}`);
      return;
    }

    const entries = fs.readdirSync(testDataDir, { withFileTypes: true });
    const callDirs = entries.filter((e) => e.isDirectory() && e.name.startsWith("call_"));

    console.log(`Found ${callDirs.length} call directories in '${testDataDir}'`);

    for (const callDir of callDirs) {
      const fullCallDirPath = path.join(testDataDir, callDir.name);
      const callId = callDir.name.replace(/^call_/, "");

      const files = fs.readdirSync(fullCallDirPath);
      const wavFiles = files.filter((f) => f.endsWith(".wav"));

      console.log(`\n📁 Processing ${callDir.name} (${wavFiles.length} WAV files)...`);

      let userADoc = null;
      let userBDoc = null;
      let recordingAKey = null;
      let recordingBKey = null;

      for (let index = 0; index < wavFiles.length; index++) {
        const wavFile = wavFiles[index];
        const wavFilePath = path.join(fullCallDirPath, wavFile);

        // Parse speaker ID from filename e.g. "spk_old_03-0a614797-16d3-428a-94f5-c58beeb5ffd0.wav"
        const parts = wavFile.split("-");
        const speakerId = parts.length > 1 ? parts[0] : `speaker_${index + 1}`;

        // Find or create user for this speaker
        let userDoc = await User.findOne({ username: speakerId });
        if (!userDoc) {
          userDoc = await User.create({
            firstname: "Speaker",
            lastname: speakerId,
            username: speakerId,
            speaker_id: speakerId,
            email: `${speakerId.toLowerCase()}@datacatalyst.local`,
            passwordHash: "$2a$10$xyzdummyhashvaluehere",
            dob: new Date("1995-05-15"),
            accountStatus: "approved",
            gender: index % 2 === 0 ? "male" : "female",
            regionalLanguage: "Hindi",
            locality: "urban",
            address: {
              street: "Test Street 10",
              city: "New Delhi",
              state: "Delhi",
              pincode: "110001"
            },
            microphoneBrand: "StudioMic",
            microphoneModel: "Pro-V1"
          });
          console.log(`  Created user record for ${speakerId}`);
        }

        // Upload WAV file to S3
        const s3Key = `calls/${callId}/${wavFile}`;
        console.log(`  ⬆ Uploading audio file ${wavFile} -> S3 (${s3Key})...`);
        const fileBuffer = fs.readFileSync(wavFilePath);

        await s3Client.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: s3Key,
          Body: fileBuffer,
          ContentType: "audio/wav"
        }));

        // Upload matching CSV metadata file if it exists
        const csvFile = wavFile.replace(/\.wav$/, ".csv");
        const csvFilePath = path.join(fullCallDirPath, csvFile);
        if (fs.existsSync(csvFilePath)) {
          const csvS3Key = `calls/${callId}/${csvFile}`;
          console.log(`  ⬆ Uploading metadata file ${csvFile} -> S3 (${csvS3Key})...`);
          await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: csvS3Key,
            Body: fs.readFileSync(csvFilePath),
            ContentType: "text/csv"
          }));
        }

        if (index === 0) {
          userADoc = userDoc;
          recordingAKey = s3Key;
        } else {
          userBDoc = userDoc;
          recordingBKey = s3Key;
        }
      }

      // If only 1 speaker existed, reuse userA as userB fallback
      if (!userBDoc) {
        userBDoc = userADoc;
      }

      // Create or update CallSession in MongoDB
      const callData = {
        callId: callId,
        userA: userADoc._id,
        userB: userBDoc._id,
        topicId: topic._id,
        subtopicId: subtopic._id,
        language: "hindi",
        startedAt: new Date(Date.now() - 30 * 60 * 1000),
        endedAt: new Date(),
        actualCallDuration: 180,
        endReason: "completed",
        callActuallyStarted: true,
        callStatus: "approved",
        recordingAFile: recordingAKey,
        recordingAStatus: "approved",
        recordingADurationMinutes: 3,
        recordingBFile: recordingBKey,
        recordingBStatus: "approved",
        recordingBDurationMinutes: 3
      };

      await CallSession.findOneAndUpdate(
        { callId: callId },
        callData,
        { upsert: true, new: true }
      );

      console.log(`  ✅ Synced CallSession '${callId}' in MongoDB.`);
    }

    console.log("\n🎉 All test conversational data files successfully uploaded to S3 and registered in MongoDB!");

  } catch (err) {
    console.error("Error during batch upload:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

run();
