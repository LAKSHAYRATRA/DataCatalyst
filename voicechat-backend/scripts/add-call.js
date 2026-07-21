import "dotenv/config";
import mongoose from "mongoose";
import crypto from "crypto";
import { User } from "../src/models/User.js";
import { CallSession } from "../src/models/CallSession.js";
import { Topic } from "../src/models/Topic.js";
import { Subtopic } from "../src/models/Subtopic.js";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/voicechat";

async function run() {
  console.log("Connecting to Database:", MONGODB_URI);
  await mongoose.connect(MONGODB_URI);

  try {
    // 1. Find or create User A
    const emailA = "divplays007@gmail.com";
    let userA = await User.findOne({ email: emailA });
    if (!userA) {
      console.log(`User ${emailA} not found, creating a dummy user...`);
      userA = await User.create({
        firstname: "Divyam",
        lastname: "Bhatia",
        username: "divplays007",
        email: emailA,
        passwordHash: "$2a$10$xyzdummyhashvaluehere",
        dob: new Date("2000-01-01"),
        gender: "male",
        regionalLanguage: "Hindi",
        locality: "urban",
        address: {
          street: "123 Main St",
          state: "Delhi",
          city: "New Delhi",
          pincode: "110001"
        },
        microphoneBrand: "Logitech",
        microphoneModel: "H390",
        accountStatus: "approved"
      });
      console.log(`Created user ${emailA} with ID ${userA._id}`);
    } else {
      console.log(`Found user ${emailA} with ID ${userA._id}`);
    }

    // 2. Find or create User B (peer)
    const emailB = "peer_user@example.com";
    let userB = await User.findOne({ email: emailB });
    if (!userB) {
      console.log(`Peer user ${emailB} not found, creating...`);
      userB = await User.create({
        firstname: "John",
        lastname: "Doe",
        username: "johndoe",
        email: emailB,
        passwordHash: "$2a$10$xyzdummyhashvaluehere",
        dob: new Date("1995-05-15"),
        gender: "male",
        regionalLanguage: "English",
        locality: "urban",
        address: {
          street: "456 Oak Rd",
          state: "California",
          city: "San Francisco",
          pincode: "94101"
        },
        microphoneBrand: "Sony",
        microphoneModel: "WH-1000XM4",
        accountStatus: "approved"
      });
      console.log(`Created peer user ${emailB} with ID ${userB._id}`);
    } else {
      console.log(`Found peer user ${emailB} with ID ${userB._id}`);
    }

    // 3. Create Topic "Finance"
    let topic = await Topic.findOne({ title: "Finance" });
    if (!topic) {
      console.log("Creating topic 'Finance'...");
      topic = await Topic.create({
        title: "Finance",
        description: "Discuss personal budget planning, investments, and expenses.",
        isEnabled: true,
        languages: ["english", "hindi"]
      });
    }

    // 4. Create Subtopic
    let subtopic = await Subtopic.findOne({ topicId: topic._id, title: "Personal Budgeting" });
    if (!subtopic) {
      console.log("Creating subtopic 'Personal Budgeting'...");
      subtopic = await Subtopic.create({
        topicId: topic._id,
        title: "Personal Budgeting",
        description: "Discuss how you plan your monthly budget and save money.",
        instructions: "Describe your salary allocation, emergency funds, and investment strategies.",
        isEnabled: true
      });
    }

    // 5. Create Call Session
    const callId = crypto.randomUUID();
    console.log(`Creating call session with ID ${callId}...`);
    const call = await CallSession.create({
      callId,
      userA: userA._id,
      userB: userB._id,
      startedAt: new Date(),
      endedAt: new Date(Date.now() + 10 * 60 * 1000),
      endReason: "hangup",
      callActuallyStarted: true,
      topicId: topic._id,
      subtopicId: subtopic._id,
      language: "english",
      callStatus: "approved",
      recordingAStatus: "approved",
      recordingBStatus: "approved",
      recordingADurationMinutes: 10.5,
      recordingBDurationMinutes: 10.2,
      recordingAPayoutUsd: 5.25,
      recordingBPayoutUsd: 5.10
    });

    console.log("Successfully created call session!", call);

  } catch (error) {
    console.error("Error creating call:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from Database");
  }
}

run();
