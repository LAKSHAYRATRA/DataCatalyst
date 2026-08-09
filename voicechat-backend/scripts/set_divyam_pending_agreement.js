import "dotenv/config";
import { connectDb } from "../src/db.js";
import { User } from "../src/models/User.js";

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI missing!");
    process.exit(1);
  }
  console.log("Connecting to Database...");
  await connectDb(uri);

  const targetEmail = "divplays007@gmail.com";
  let user = await User.findOne({ email: new RegExp(`^${targetEmail.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, "i") });

  if (!user) {
    user = await User.findOne({ username: new RegExp(`^divplays007`, "i") });
  }

  if (!user) {
    console.error(`User ${targetEmail} not found!`);
    process.exit(1);
  }

  user.accountStatus = "pending_approval";
  user.contributorAgreement = {
    signed: false,
    signedAt: null,
    s3Key: null,
    signerName: null,
    signerIp: null,
    agreementVersion: "v2.0-NoCloning",
    pdfHash: null,
    adminReviewStatus: null,
    adminReviewedAt: null,
    adminReviewedBy: null,
    adminReviewReason: null,
    assignedAgreementDoc: "datacatalyst-voice-dataset-consent-agreement"
  };

  await user.save();
  console.log(`✅ SUCCESS: User ${user.email} (${user.username}) set to pending contributor agreement with assignedNoCloningDoc!`);

  process.exit(0);
}

run().catch((err) => {
  console.error("Failed to update user:", err);
  process.exit(1);
});
