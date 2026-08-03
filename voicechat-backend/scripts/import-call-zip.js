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

const callId = "81233f27-ddd3-4d3c-9460-01c21c3872d1";
const unzippedDir = path.resolve(process.cwd(), "..", "scratch", "unzipped_call", `call_${callId}`);

async function run() {
  console.log("Connecting to Database:", MONGODB_URI);
  await mongoose.connect(MONGODB_URI);

  try {
    // 1. Create or Find Topic
    let topic = await Topic.findOne({ title: "Finance" });
    if (!topic) {
      console.log("Creating topic 'Finance'...");
      topic = await Topic.create({
        title: "Finance",
        description: "Finance and wealth discussion",
        isEnabled: true,
        languages: ["hindi"]
      });
    }

    // 2. Create or Find Subtopic
    const subTitle = "पैसे की मनोविज्ञान: क्या अमीर होना केवल अधिक कमाने का खेल है?";
    let subtopic = await Subtopic.findOne({ title: subTitle });
    if (!subtopic) {
      console.log("Creating subtopic...");
      subtopic = await Subtopic.create({
        topicId: topic._id,
        title: subTitle,
        description: "पैसे की मनोविज्ञान: क्या अमीर होना केवल अधिक कमाने का खेल है?",
        instructions: "बहुत से लोग बड़ी सैलरी पाने के बाद भी महीने के अंत में तंगी से क्यों जूझते हैं...",
        isEnabled: true
      });
    }

    // 3. Find or Create User A (spk_55)
    let userA = await User.findOne({ username: "spk_55" });
    if (!userA) {
      console.log("Creating user spk_55...");
      userA = await User.create({
        firstname: "Speaker",
        lastname: "55",
        username: "spk_55",
        speaker_id: "spk_55",
        email: "spk_55@example.com",
        passwordHash: "$2a$10$xyzdummyhashvaluehere",
        dob: new Date("2000-01-01"),
        gender: "male",
        regionalLanguage: "Hindi",
        locality: "urban",
        address: { street: "Street 55", state: "Rajasthan", city: "Jaipur", pincode: "302001" },
        microphoneBrand: "Default",
        microphoneModel: "Mic",
        accountStatus: "approved"
      });
    }

    // 4. Find or Create User B (spk_60)
    let userB = await User.findOne({ username: "spk_60" });
    if (!userB) {
      console.log("Creating user spk_60...");
      userB = await User.create({
        firstname: "Speaker",
        lastname: "60",
        username: "spk_60",
        speaker_id: "spk_60",
        email: "spk_60@example.com",
        passwordHash: "$2a$10$xyzdummyhashvaluehere",
        dob: new Date("1998-01-01"),
        gender: "male",
        regionalLanguage: "Hindi",
        locality: "urban",
        address: { street: "Street 60", state: "Rajasthan", city: "Jaipur", pincode: "302001" },
        microphoneBrand: "Default",
        microphoneModel: "Mic",
        accountStatus: "approved"
      });
    }

    // 5. Ensure bucket exists and upload files to S3
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
      console.log(`Bucket ${BUCKET_NAME} exists.`);
    } catch (err) {
      console.log(`Bucket ${BUCKET_NAME} does not exist, creating...`);
      await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
    }

    const fileA = `spk_55-${callId}.wav`;
    const fileB = `spk_60-${callId}.wav`;
    const pathA = path.join(unzippedDir, fileA);
    const pathB = path.join(unzippedDir, fileB);

    const s3KeyA = `calls/${fileA}`;
    const s3KeyB = `calls/${fileB}`;

    console.log("Uploading User A audio to S3...");
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3KeyA,
      Body: fs.readFileSync(pathA),
      ContentType: "audio/wav"
    }));

    console.log("Uploading User B audio to S3...");
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3KeyB,
      Body: fs.readFileSync(pathB),
      ContentType: "audio/wav"
    }));

    // 6. Create CallSession
    console.log("Cleaning up old call session if exists...");
    await CallSession.deleteOne({ callId });

    console.log("Creating call session...");
    const call = await CallSession.create({
      callId,
      userA: userA._id,
      userB: userB._id,
      startedAt: new Date(),
      endedAt: new Date(Date.now() + 15 * 60 * 1000),
      endReason: "completed",
      callActuallyStarted: true,
      topicId: topic._id,
      subtopicId: subtopic._id,
      language: "hindi",
      callStatus: "pending",
      recordingAStatus: "pending",
      recordingBStatus: "pending",
      recordingAFile: s3KeyA,
      recordingBFile: s3KeyB,
      recordingADurationMinutes: 15.0,
      recordingBDurationMinutes: 15.0,
      recordingAPayoutUsd: 0,
      recordingBPayoutUsd: 0
    });

    console.log("Successfully created call session!", call.callId);

  } catch (error) {
    console.error("Error importing call:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from Database");
  }
}

run();
