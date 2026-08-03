import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

import { User } from "../src/models/User.js";
import { Language } from "../src/models/Language.js";
import { Subtopic } from "../src/models/Subtopic.js";
import { CallSession } from "../src/models/CallSession.js";

dotenv.config();

const s3ClientOpts = {
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
};
if (process.env.S3_ENDPOINT) {
  s3ClientOpts.endpoint = process.env.S3_ENDPOINT;
  s3ClientOpts.forcePathStyle = true;
}
const s3Client = new S3Client(s3ClientOpts);
const BUCKET_NAME = process.env.S3_BUCKET_NAME || "voicechat-recordings";

async function main() {
    await mongoose.connect("mongodb://localhost:27017/voicechat");
    console.log("Connected to MongoDB!");

    // 1. Get database details
    const userA = await User.findOne({ accountStatus: "approved" });
    const userB = await User.findOne({ _id: { $ne: userA?._id }, accountStatus: "approved" });
    const subtopic = await Subtopic.findOne({});

    if (!userA || !userB || !subtopic) {
        console.error("Missing approved users or subtopic in database!");
        process.exit(1);
    }

    console.log(`User A: ${userA.username} (${userA._id})`);
    console.log(`User B: ${userB.username} (${userB._id})`);
    console.log(`Subtopic: ${subtopic.title} (${subtopic._id})`);

    // 2. Upload a short local flac recording to S3
    const localDir = path.join(process.cwd(), "recordings", "language-apps");
    const localFiles = fs.readdirSync(localDir).filter(f => f.endsWith(".flac"));
    if (localFiles.length === 0) {
        console.error("No FLAC files found in recordings/language-apps!");
        process.exit(1);
    }
    
    // Choose the smallest file (usually the shortest duration)
    const sorted = localFiles.map(f => ({
        name: f,
        size: fs.statSync(path.join(localDir, f)).size
    })).sort((a, b) => a.size - b.size);
    const chosenFile = sorted[0].name;
    const localFilePath = path.join(localDir, chosenFile);
    console.log(`Using local file for upload: ${chosenFile} (${sorted[0].size} bytes)`);

    const fileBuffer = fs.readFileSync(localFilePath);
    
    const s3KeyA = `recordings/calls/test_call_2sec_A.flac`;
    const s3KeyB = `recordings/calls/test_call_2sec_B.flac`;

    console.log("Uploading file to S3...");
    await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3KeyA,
        Body: fileBuffer,
        ContentType: "audio/x-flac"
    }));
    await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3KeyB,
        Body: fileBuffer,
        ContentType: "audio/x-flac"
    }));
    console.log("S3 Upload Complete!");

    // 3. Clear any existing call with this test callId
    await CallSession.deleteOne({ callId: "call_2sec_test" });

    // 4. Create the CallSession document
    const call = new CallSession({
        callId: "call_2sec_test",
        userA: userA._id,
        userB: userB._id,
        startedAt: new Date(Date.now() - 10000),
        endedAt: new Date(),
        recordingAFile: s3KeyA,
        recordingAStartedAt: new Date(Date.now() - 10000),
        recordingBFile: s3KeyB,
        recordingBStartedAt: new Date(Date.now() - 10000),
        topicId: subtopic.topicId,
        subtopicId: subtopic._id,
        language: "hindi",
        callStatus: "pending",
        callActuallyStarted: true,
        actualCallDuration: 2,
        
        recordingAStatus: "approved",
        recordingAReviewNote: "Pre-approved 2-second reference",
        recordingADurationMinutes: 2 / 60,
        recordingAPayoutUsd: 0.1,
        
        recordingBStatus: "pending",
        recordingBReviewNote: null,
        recordingBDurationMinutes: 0,
        recordingBPayoutUsd: 0
    });

    await call.save();
    console.log("CallSession seeded successfully! Call ID: call_2sec_test");

    await mongoose.disconnect();
}

main().catch(e => {
    console.error("Seeding failed:", e);
    process.exit(1);
});
