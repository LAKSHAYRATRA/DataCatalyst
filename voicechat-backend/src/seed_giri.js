import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { User } from "./models/User.js";
import { Ambiguity } from "./models/Ambiguity.js";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/voicechat";

async function main() {
  console.log("Connecting to Mongo:", MONGODB_URI);
  await mongoose.connect(MONGODB_URI);

  let giri = await User.findOne({
    $or: [
      { firstname: /giri/i },
      { lastname: /bhardwaj/i },
      { username: /giri/i },
      { email: /giri/i }
    ]
  });

  if (!giri) {
    console.log("Giri Bhardwaj not found. Creating Giri Bhardwaj QA user...");
    giri = await User.create({
      firstname: "Giri",
      lastname: "Bhardwaj",
      username: "giribhardwaj",
      email: "giri.bhardwaj@datacatalyst.in",
      isQA: true,
      perCallPayrate: 1.00,
      hourlyPhrasePayrate: 10.00,
      qaLanguageCodes: ["hi", "en"],
      upiId: "giri@upi"
    });
    console.log("Created Giri Bhardwaj QA user:", giri._id);
  } else {
    console.log("Found existing Giri Bhardwaj user:", giri._id, giri.firstname, giri.lastname, giri.email);
    if (!giri.isQA) {
      giri.isQA = true;
      await giri.save();
      console.log("Promoted Giri Bhardwaj to QA user!");
    }
  }

  // Check if sample ambiguity already exists for Giri
  let sampleCallAmb = await Ambiguity.findOne({ callId: "CALL_GIRI_SAMPLE_101" });
  if (!sampleCallAmb) {
    sampleCallAmb = await Ambiguity.create({
      type: "call",
      callId: "CALL_GIRI_SAMPLE_101",
      companyId: "DataCatalyst Corp",
      language: "Hindi",
      reason: "conflict",
      audioFileA: "recordings/sample_call_a.wav",
      audioFileB: "recordings/sample_call_b.wav",
      qaReviews: [
        {
          qaId: giri._id,
          qaName: `${giri.firstname || ""} ${giri.lastname || ""}`.trim() || giri.username,
          qaUsername: giri.username,
          qaEmail: giri.email,
          action: "rejected",
          recordingAAction: "rejected",
          recordingBAction: "approved",
          rejectionReason: "Noisy",
          comment: "Speaker A had background noise during conversation",
          reviewedAt: new Date()
        }
      ],
      status: "pending"
    });
    console.log("Created sample Call Ambiguity for Giri Bhardwaj:", sampleCallAmb._id);
  } else {
    console.log("Sample Call Ambiguity for Giri Bhardwaj already exists:", sampleCallAmb._id);
  }

  let samplePhraseAmb = await Ambiguity.findOne({ phraseId: "PHRASE_GIRI_SAMPLE_202" });
  if (!samplePhraseAmb) {
    samplePhraseAmb = await Ambiguity.create({
      type: "phrase",
      phraseId: "PHRASE_GIRI_SAMPLE_202",
      companyId: "DataCatalyst Corp",
      language: "Hindi",
      reason: "sampling",
      text: "नमस्ते, क्या आप मेरी मदद कर सकते हैं? (Sample phrase for QA review)",
      duration: 6.5,
      qaReviews: [
        {
          qaId: giri._id,
          qaName: `${giri.firstname || ""} ${giri.lastname || ""}`.trim() || giri.username,
          qaUsername: giri.username,
          qaEmail: giri.email,
          action: "rejected",
          comment: "Rejected due to low audio clarity at the beginning",
          reviewedAt: new Date()
        }
      ],
      status: "pending"
    });
    console.log("Created sample Phrase Ambiguity for Giri Bhardwaj:", samplePhraseAmb._id);
  } else {
    console.log("Sample Phrase Ambiguity for Giri Bhardwaj already exists:", samplePhraseAmb._id);
  }

  await mongoose.disconnect();
  console.log("Done!");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
