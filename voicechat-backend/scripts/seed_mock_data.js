import "dotenv/config";
import { connectDb } from "../src/db.js";
import { CallSession } from "../src/models/CallSession.js";
import { User } from "../src/models/User.js";

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not found in env!");
    process.exit(1);
  }
  console.log("Connecting to Database...");
  await connectDb(uri);
  
  console.log("Fetching/creating mock users...");
  let users = await User.find({}).limit(2);
  if (users.length < 2) {
    console.log("Creating dummy users...");
    const u1 = await User.create({
      username: `userA_${Date.now()}`,
      email: `usera_${Date.now()}@example.com`,
      password: "password123",
      firstname: "Speaker",
      lastname: "A",
      gender: "male",
      dob: new Date("1995-01-01"),
      isPhoneVerified: true
    }).catch(e => console.error(e));
    
    const u2 = await User.create({
      username: `userB_${Date.now()}`,
      email: `userb_${Date.now()}@example.com`,
      password: "password123",
      firstname: "Speaker",
      lastname: "B",
      gender: "female",
      dob: new Date("1997-01-01"),
      isPhoneVerified: true
    }).catch(e => console.error(e));
    
    users = await User.find({}).limit(2);
  }
  
  const uA = users[0]?._id;
  const uB = users[1]?._id || uA;

  if (!uA || !uB) {
    console.error("Could not obtain users for CallSession!");
    process.exit(1);
  }

  console.log("Updating existing calls...");
  const sessions = await CallSession.find({}).limit(10);
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    let status = i % 3 === 0 ? "pending" : i % 3 === 1 ? "approved" : "rejected";
    s.callStatus = status;
    s.recordingAStatus = status;
    s.recordingBStatus = status;
    await s.save();
    console.log(`Updated CallSession ${s.callId} status to ${status}`);
  }

  console.log("Adding new dummy CallSessions...");
  for (let i = 0; i < 6; i++) {
    let status = i % 3 === 0 ? "pending" : i % 3 === 1 ? "approved" : "rejected";
    const callId = `dummy_call_${Date.now()}_${i}`;
    await CallSession.create({
      callId,
      startedAt: new Date(Date.now() - 30 * 60000),
      endedAt: new Date(Date.now() - 10 * 60000),
      actualCallStartedAt: new Date(Date.now() - 25 * 60000),
      callActuallyStarted: true,
      callStatus: status,
      recordingAStatus: status,
      recordingBStatus: status,
      actualCallDuration: 900,
      recordingADurationMinutes: 15,
      recordingBDurationMinutes: 15,
      language: "english",
      userA: uA,
      userB: uB,
      recordingAFile: "calls/dummy/recA.flac",
      recordingBFile: "calls/dummy/recB.flac",
    });
    console.log(`Created dummy CallSession ${callId} status to ${status}`);
  }
  
  console.log("Done!");
  process.exit(0);
}

run().catch(console.error);
