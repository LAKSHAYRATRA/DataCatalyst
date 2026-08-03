import "dotenv/config";
import { connectDb } from "../src/db.js";
import { User } from "../src/models/User.js";
import bcrypt from "bcryptjs";

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not found in env!");
    process.exit(1);
  }
  console.log("Connecting to Database...");
  await connectDb(uri);
  
  const username = "admin";
  const email = "admin@example.com";
  const password = "admin";
  const passwordHash = await bcrypt.hash(password, 10);
  
  console.log("Creating or updating admin user...");
  let user = await User.findOne({ username });
  if (user) {
    user.passwordHash = passwordHash;
    user.isAdmin = true;
    user.isQA = true;
    user.email = email;
    if (!user.speaker_id) {
      user.speaker_id = "spk_admin_" + Date.now();
    }
    user.dob = new Date("1990-01-01");
    user.gender = "male";
    user.locality = "urban";
    user.regionalLanguage = "english";
    user.microphoneBrand = "generic";
    user.microphoneModel = "generic";
    user.address = {
      street: "street",
      city: "city",
      state: "state",
      pincode: "123456"
    };
    await user.save();
    console.log("Updated admin user successfully!");
  } else {
    await User.create({
      username,
      email,
      passwordHash,
      isAdmin: true,
      isQA: true,
      speaker_id: "spk_admin_" + Date.now(),
      dob: new Date("1990-01-01"),
      gender: "male",
      locality: "urban",
      regionalLanguage: "english",
      microphoneBrand: "generic",
      microphoneModel: "generic",
      address: {
        street: "street",
        city: "city",
        state: "state",
        pincode: "123456"
      }
    });
    console.log("Created admin user successfully!");
  }
  
  console.log("Admin details:\nUsername: admin\nPassword: admin");
  process.exit(0);
}

run().catch(console.error);
