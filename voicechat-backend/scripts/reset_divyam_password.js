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
  await connectDb(uri);
  
  const passwordHash = await bcrypt.hash("admin123", 10);
  const res = await User.updateOne(
    { username: "divyambhatia672" },
    { $set: { passwordHash, isEmailVerified: true } }
  );
  
  if (res.matchedCount > 0) {
    console.log("Successfully reset password for 'divyambhatia672' to 'admin123'!");
  } else {
    console.log("User 'divyambhatia672' not found in database!");
  }
  process.exit(0);
}

run().catch(console.error);
