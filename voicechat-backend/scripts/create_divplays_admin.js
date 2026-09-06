import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDb } from "../src/db.js";
import { User } from "../src/models/User.js";
import { Counter } from "../src/models/Counter.js";

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not found in env!");
    process.exit(1);
  }

  console.log("Connecting to Database...");
  await connectDb(uri);

  const targetEmail = "divplays007@gmail.com";
  const targetPassword = "lol123";
  const targetUsername = "divplays007";

  console.log(`Searching for user with email: ${targetEmail}`);

  let user = await User.findOne({
    email: new RegExp(`^${targetEmail.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}$`, "i")
  });

  if (!user) {
    user = await User.findOne({ username: new RegExp(`^${targetUsername}$`, "i") });
  }

  const hashedPassword = await bcrypt.hash(targetPassword, 10);

  if (user) {
    console.log(`Found existing user: ${user.email} (${user.username}). Updating to ADMIN...`);
    user.email = targetEmail;
    user.passwordHash = hashedPassword;
    user.isAdmin = true;
    user.isQA = true;
    user.accountStatus = "approved";
    user.isEmailVerified = true;
    user.isDisabled = false;
    user.isDeleted = false;
    if (!user.dob) user.dob = new Date("2000-01-01");
    if (!user.gender) user.gender = "male";
    if (!user.regionalLanguage) user.regionalLanguage = "hindi";
    if (!user.locality) user.locality = "urban";
    if (!user.address) user.address = { street: "HQ", city: "Delhi", state: "Delhi", pincode: "110001" };
    if (!user.microphoneBrand) user.microphoneBrand = "Studio";
    if (!user.microphoneModel) user.microphoneModel = "Pro";

    if (!user.speaker_id) {
      const counter = await Counter.findOneAndUpdate(
        { _id: "speaker_id" },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );
      user.speaker_id = `spk_${counter.seq}`;
    }

    await user.save();
    console.log(`SUCCESS: User ${user.email} (${user.username}) updated to ADMIN & QA with password set to "${targetPassword}"!`);
  } else {
    console.log(`Creating new ADMIN user: ${targetEmail}...`);
    const counter = await Counter.findOneAndUpdate(
      { _id: "speaker_id" },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    const speaker_id = `spk_${counter.seq}`;

    user = new User({
      firstname: "Divyam",
      lastname: "Bhatia",
      username: targetUsername,
      email: targetEmail,
      passwordHash: hashedPassword,
      isAdmin: true,
      isQA: true,
      isEmailVerified: true,
      accountStatus: "approved",
      speaker_id,
      dob: new Date("2000-01-01"),
      gender: "male",
      regionalLanguage: "hindi",
      locality: "urban",
      address: { street: "HQ", city: "Delhi", state: "Delhi", pincode: "110001" },
      microphoneBrand: "Studio",
      microphoneModel: "Pro",
      isDisabled: false,
      isDeleted: false
    });

    await user.save();
    console.log(`SUCCESS: Created new ADMIN & QA user ${user.email} (${user.username}) with password "${targetPassword}"!`);
  }

  process.exit(0);
}

run().catch((err) => {
  console.error("Error creating admin account:", err);
  process.exit(1);
});
