import "dotenv/config";
import { connectDb } from "../src/db.js";
import { User } from "../src/models/User.js";

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not found in env!");
    process.exit(1);
  }
  console.log("Connecting to Database...");
  await connectDb(uri);

  const targetEmail = "divplays007@gmail.com";
  console.log(`Searching for user with email: ${targetEmail}`);

  let user = await User.findOne({ email: new RegExp(`^${targetEmail.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, "i") });

  if (!user) {
    console.log(`User ${targetEmail} not found by email, searching by username...`);
    user = await User.findOne({ username: new RegExp(`^divplays007`, "i") });
  }

  if (user) {
    user.isAdmin = true;
    user.isQA = true;
    user.accountStatus = "approved";
    user.isEmailVerified = true;
    await user.save();
    console.log(`SUCCESS: User ${user.email} (${user.username}) is now an ADMIN & QA!`);
  } else {
    console.log(`User ${targetEmail} not found in database.`);
    console.log("Please create or sign up an account first, or check username/email.");
  }

  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
