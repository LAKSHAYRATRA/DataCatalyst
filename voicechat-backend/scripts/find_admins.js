import "dotenv/config";
import { connectDb } from "../src/db.js";
import { User } from "../src/models/User.js";

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not found in env!");
    process.exit(1);
  }
  await connectDb(uri);
  
  // Find all users who are admins
  const admins = await User.find({ isAdmin: true }, "username email firstname lastname");
  console.log("=== Admin Users found in DB ===");
  console.log(JSON.stringify(admins, null, 2));

  // Find users containing divyam in email or username
  const divyams = await User.find({
    $or: [
      { email: /divyam/i },
      { username: /divyam/i }
    ]
  }, "username email firstname lastname isAdmin isQA");
  console.log("\n=== Users containing 'divyam' ===");
  console.log(JSON.stringify(divyams, null, 2));
  
  process.exit(0);
}

run().catch(console.error);
