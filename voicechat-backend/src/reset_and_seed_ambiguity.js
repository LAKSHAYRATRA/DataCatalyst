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

  // 1. Clear existing Ambiguity records
  const deleteResult = await Ambiguity.deleteMany({});
  console.log(`Cleared existing Ambiguity collection (${deleteResult.deletedCount} items removed).`);

  // 2. Find or create QA 1 (Giri Bhardwaj) and QA 2 (Priya Sharma)
  let qa1 = await User.findOne({
    $or: [{ firstname: /giri/i }, { username: /giri/i }, { email: /giri/i }]
  });

  if (!qa1) {
    qa1 = await User.findOne({ isQA: true });
  }

  let qa2 = await User.findOne({
    $or: [{ firstname: /priya/i }, { username: /priya/i }, { email: /priya/i }]
  });

  if (!qa2 || String(qa2._id) === String(qa1?._id)) {
    // Find another user or create basic doc
    const otherQA = await User.findOne({ isQA: true, _id: { $ne: qa1?._id } });
    if (otherQA) {
      qa2 = otherQA;
    } else {
      const dummyId = new mongoose.Types.ObjectId();
      qa2 = {
        _id: dummyId,
        firstname: "Priya",
        lastname: "Sharma",
        username: "priyasharma",
        email: "priya.sharma@datacatalyst.in"
      };
    }
  }

  const qa1Name = qa1 ? `${qa1.firstname || ""} ${qa1.lastname || ""}`.trim() || qa1.username : "Giri Bhardwaj";
  const qa1Email = qa1?.email || "giri.bhardwaj@datacatalyst.in";

  const qa2Name = qa2 ? `${qa2.firstname || ""} ${qa2.lastname || ""}`.trim() || qa2.username : "Priya Sharma";
  const qa2Email = qa2?.email || "priya.sharma@datacatalyst.in";

  // 3. Create fresh Call Ambiguity (QA 1: SpkA Approved / SpkB Rejected VS QA 2: SpkA Rejected / SpkB Approved)
  const callAmb = await Ambiguity.create({
    type: "call",
    callId: "CALL_CROSS_AUDIT_209",
    companyId: "DataCatalyst Corp",
    language: "Hindi",
    reason: "conflict",
    audioFileA: "recordings/call_209_speaker_a.wav",
    audioFileB: "recordings/call_209_speaker_b.wav",
    qaReviews: [
      {
        qaId: qa1?._id || new mongoose.Types.ObjectId(),
        qaName: qa1Name,
        qaUsername: qa1?.username || "giribhardwaj",
        qaEmail: qa1Email,
        action: "approved",
        recordingAAction: "approved",
        recordingBAction: "rejected",
        recordingAReviewNote: "Speaker A audio is clear and well-articulated.",
        recordingBReviewNote: "Speaker B has excessive background noise.",
        recordingARejectionReason: null,
        recordingBRejectionReason: "Noisy",
        comment: "Speaker A is good, but Speaker B is noisy.",
        reviewedAt: new Date(Date.now() - 3600000)
      },
      {
        qaId: qa2?._id || new mongoose.Types.ObjectId(),
        qaName: qa2Name,
        qaUsername: qa2?.username || "priyasharma",
        qaEmail: qa2Email,
        action: "rejected",
        recordingAAction: "rejected",
        recordingBAction: "approved",
        recordingAReviewNote: "Speaker A has severe audio clipping distortion.",
        recordingBReviewNote: "Speaker B audio quality is perfect.",
        recordingARejectionReason: "Clipping",
        recordingBRejectionReason: null,
        comment: "Speaker A has clipping distortion, Speaker B is good.",
        reviewedAt: new Date()
      }
    ],
    status: "pending"
  });
  console.log(`Created fresh Call Ambiguity (${qa1Name} vs ${qa2Name}):`, callAmb._id);

  // 4. Create fresh Phrase Ambiguity (Giri vs Priya conflict)
  const phraseAmb = await Ambiguity.create({
    type: "phrase",
    phraseId: "PHRASE_CROSS_AUDIT_304",
    companyId: "DataCatalyst Corp",
    language: "Hindi",
    reason: "conflict",
    text: "मुझे यह नया voice dataset प्रोजेक्ट बहुत पसंद आया, धन्यवाद!",
    duration: 5.8,
    qaReviews: [
      {
        qaId: qa1?._id || new mongoose.Types.ObjectId(),
        qaName: qa1Name,
        qaUsername: qa1?.username || "giribhardwaj",
        qaEmail: qa1Email,
        action: "approved",
        comment: "Clear speech and correct accent.",
        reviewedAt: new Date(Date.now() - 1800000)
      },
      {
        qaId: qa2?._id || new mongoose.Types.ObjectId(),
        qaName: qa2Name,
        qaUsername: qa2?.username || "priyasharma",
        qaEmail: qa2Email,
        action: "rejected",
        comment: "Slight clipping error on the last word 'धन्यवाद'.",
        reviewedAt: new Date()
      }
    ],
    status: "pending"
  });
  console.log(`Created fresh Phrase Ambiguity (${qa1Name} vs ${qa2Name}):`, phraseAmb._id);

  await mongoose.disconnect();
  console.log("Reset & Seeding completed successfully!");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
