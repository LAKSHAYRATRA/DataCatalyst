import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { connectDb } from "../src/db.js";
import { Company } from "../src/models/Company.js";
import { Phrase } from "../src/models/Phrase.js";
import { User } from "../src/models/User.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

async function seedGnaniEditedPhrases() {
  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/voicechat";
  console.log(`Connecting to MongoDB: ${mongoUri}`);
  await connectDb(mongoUri);

  // 1. Ensure Gnani Company exists
  let company = await Company.findOne({ name: { $regex: /^gnani$/i } });
  if (!company) {
    company = await Company.create({
      name: "Gnani",
      projectName: "Gnani",
      allowPhraseTextEdit: true,
      languages: ["hindi"],
      hourlyPayout: 150,
      maxContributionMinutes: 195
    });
    console.log(`Created Company: ${company.name}`);
  } else {
    company.allowPhraseTextEdit = true;
    await company.save();
    console.log(`Using existing Company: ${company.name}`);
  }

  // 2. Find a user or admin to attach as contributor / editedBy
  const adminUser = await User.findOne({ isAdmin: true }) || await User.findOne({});
  const userId = adminUser ? adminUser._id : null;
  console.log(`Attaching edits to user: ${adminUser ? adminUser.username || adminUser.email : "N/A"}`);

  // 3. Clean up old test phrases for Gnani with gnani_edit_ prefix
  const deleteResult = await Phrase.deleteMany({ companyId: company.name, phraseId: /^gnani_edit_/ });
  console.log(`Cleaned up ${deleteResult.deletedCount} previous test phrases.`);

  // 4. Create 10 edited phrases
  const phrasesToCreate = [];
  for (let i = 1; i <= 10; i++) {
    const numStr = String(i).padStart(3, "0");
    phrasesToCreate.push({
      phraseId: `gnani_edit_${numStr}`,
      companyId: company.name,
      projectName: company.projectName || company.name,
      language: "Hindi",
      originalText: `(Original #${i}) Namaste, yeh sample phrase ${i} ka original script text hai pehle wala.`,
      text: `(Edited #${i}) Namaste, yeh sample phrase ${i} ka NAYA EDITED script text hai admin approval ke liye.`,
      status: "recorded",
      isEdited: true,
      editedBy: userId,
      editedAt: new Date(),
      editedPhraseStatus: "pending_admin",
      contributorId: userId,
      audioFile: "recordings/test.wav",
      duration: 3.5 + i * 0.2,
      recordedAt: new Date()
    });
  }

  const createdPhrases = await Phrase.insertMany(phrasesToCreate);
  console.log(`Successfully created ${createdPhrases.length} edited phrases for Company "${company.name}":`);
  createdPhrases.forEach(p => {
    console.log(`  - [${p.phraseId}] ${p.text}`);
  });

  process.exit(0);
}

seedGnaniEditedPhrases().catch(err => {
  console.error("Error seeding edited phrases:", err);
  process.exit(1);
});
