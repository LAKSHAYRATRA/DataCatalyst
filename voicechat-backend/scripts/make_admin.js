import "dotenv/config";
import bcrypt from "bcryptjs";
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

  const targetEmail = "divyambhatia672@gmail.com";
  const targetPassword = "lol123";
  const targetUsername = "divyambhatia672";

  console.log(`Searching for user with email: ${targetEmail}`);

  let user = await User.findOne({ email: new RegExp(`^${targetEmail.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, "i") });

  const hashedPassword = await bcrypt.hash(targetPassword, 10);

  if (user) {
    user.passwordHash = hashedPassword;
    user.isAdmin = true;
    user.isQA = true;
    user.accountStatus = "approved";
    user.isEmailVerified = true;
    await user.save();
    console.log(`SUCCESS: User ${user.email} (${user.username}) updated to ADMIN & QA with password updated!`);
  } else {
    user = new User({
      email: targetEmail,
      username: targetUsername,
      passwordHash: hashedPassword,
      firstname: "Divyam",
      lastname: "Bhatia",
      isAdmin: true,
      isQA: true,
      accountStatus: "approved",
      isEmailVerified: true
    });
    await user.save();
    console.log(`SUCCESS: Created new ADMIN & QA user ${user.email} (${user.username}) with password set!`);
  }

  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
