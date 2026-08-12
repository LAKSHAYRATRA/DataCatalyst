import mongoose from "mongoose";
import { Phrase } from "../src/models/Phrase.js";
import { Company } from "../src/models/Company.js";

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/voicechat";
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  // Ensure a test company exists
  let company = await Company.findOne({ name: "Voclara Labs" });
  if (!company) {
    company = await Company.create({
      name: "Voclara Labs",
      description: "Test Company for Phrase Workloads",
      languages: ["hindi", "english"]
    });
    console.log("Created test company: Voclara Labs");
  }

  // Remove existing test phrases for clean state
  await Phrase.deleteMany({ companyId: "Voclara Labs", language: "hindi" });

  // 4 Test Phrases in different states
  const testPhrases = [
    {
      phraseId: "test_ph_01_pending",
      companyId: "Voclara Labs",
      projectName: "TTS Data Collection",
      language: "hindi",
      text: "यह एक पेंडिंग वाक्य है जिसे डिलीट किया जा सकता है।",
      status: "pending",
      emotion: "neutral",
      style: "conversational"
    },
    {
      phraseId: "test_ph_02_pending",
      companyId: "Voclara Labs",
      projectName: "TTS Data Collection",
      language: "hindi",
      text: "यह दूसरा पेंडिंग वाक्य है जो बटन दबाने पर हटेगा।",
      status: "pending",
      emotion: "happy",
      style: "expressive"
    },
    {
      phraseId: "test_ph_03_recorded",
      companyId: "Voclara Labs",
      projectName: "TTS Data Collection",
      language: "hindi",
      text: "यह रिकॉर्ड किया गया वाक्य है। यह डिलीट नहीं होगा।",
      status: "recorded",
      audioFile: "phrases/test_rec_03.wav",
      duration: 3.5,
      recordedAt: new Date()
    },
    {
      phraseId: "test_ph_04_approved",
      companyId: "Voclara Labs",
      projectName: "TTS Data Collection",
      language: "hindi",
      text: "यह अप्रूव्ड वाक्य है जो डेटासेट का हिस्सा बन चुका है।",
      status: "approved",
      audioFile: "phrases/test_app_04.wav",
      duration: 4.2,
      reviewedAt: new Date()
    }
  ];

  const inserted = await Phrase.insertMany(testPhrases);
  console.log(`Successfully seeded ${inserted.length} test phrases into 'Voclara Labs' (HINDI):`);
  inserted.forEach(p => console.log(`  - [${p.phraseId}] status: "${p.status}" | text: "${p.text}"`));

  await mongoose.disconnect();
}

main().catch(console.error);
