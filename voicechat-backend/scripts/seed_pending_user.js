import "dotenv/config";
import { connectDb } from "../src/db.js";
import { User } from "../src/models/User.js";
import bcrypt from "bcryptjs";

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI missing!");
    process.exit(1);
  }
  console.log("Connecting to Database...");
  await connectDb(uri);

  const testUsername = "pending_contributor_test";
  const testEmail = "pending.contributor@example.com";

  await User.deleteOne({ email: testEmail });
  await User.deleteOne({ username: testUsername });

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash("Password123!", salt);
  const randomSpeakerId = Math.floor(100000 + Math.random() * 900000);

  const newPendingUser = new User({
    firstname: "Rohan",
    lastname: "Sharma",
    username: testUsername,
    email: testEmail,
    speaker_id: randomSpeakerId,
    passwordHash: passwordHash,
    dob: new Date("1998-05-15"),
    gender: "male",
    regionalLanguage: "Hindi",
    locality: "urban",
    address: {
      street: "123 Tech Park Road",
      city: "Jaipur",
      state: "Rajasthan",
      pincode: "302017"
    },
    microphoneBrand: "Samsung",
    microphoneModel: "Galaxy Mic",
    accent: "Standard Indian",
    dialect: "Rajasthani Hindi",
    accountStatus: "pending_approval",
    introRecordingFile: "sample_intro.wav",
    introRecordingUploadedAt: new Date(),
    isEmailVerified: true,
    contributorAgreement: {
      signed: true,
      signedAt: new Date(),
      signerName: "Rohan Sharma",
      signerIp: "127.0.0.1",
      agreementVersion: "v1.0",
      adminReviewStatus: "pending",
      s3Key: "local:DataCatalyst-Voice-Dataset-Consent-Agreement.pdf"
    }
  });

  await newPendingUser.save();
  console.log(`✅ SUCCESS: Added mock pending user "${newPendingUser.firstname} ${newPendingUser.lastname}" (@${newPendingUser.username}) with speaker_id ${randomSpeakerId}!`);

  process.exit(0);
}

run().catch((err) => {
  console.error("Failed to seed pending user:", err);
  process.exit(1);
});
