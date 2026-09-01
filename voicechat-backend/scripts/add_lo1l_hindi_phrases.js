import dotenv from "dotenv";
import mongoose from "mongoose";
import { Phrase } from "../src/models/Phrase.js";
import { Company } from "../src/models/Company.js";

dotenv.config({ path: "./.env" });

const HINDI_PHRASES = [
  {
    text: "आज शाम को बाजार में बहुत भीड़ होने की संभावना है।",
    domain: "daily_life",
    emotion: "neutral",
    intent: "observation"
  },
  {
    text: "कृपया अपनी यात्रा शुरू करने से पहले सभी आवश्यक दस्तावेज़ जांच लें।",
    domain: "travel",
    emotion: "informational",
    intent: "instruction"
  },
  {
    text: "मुझे बहुत खुशी है कि हमारी टीम ने यह परियोजना समय पर पूरी कर ली।",
    domain: "workplace",
    emotion: "happy",
    intent: "appreciation"
  },
  {
    text: "क्या आप मुझे पास के सबसे अच्छे अस्पताल का रास्ता बता सकते हैं?",
    domain: "navigation",
    emotion: "curious",
    intent: "inquiry"
  },
  {
    text: "स्वास्थ्य विशेषज्ञों का कहना है कि रोज़ाना सुबह टहलना दिल के लिए फायदेमंद है।",
    domain: "health",
    emotion: "informational",
    intent: "advice"
  },
  {
    text: "कृपया ध्यान दें कि अगली ट्रेन प्लेटफ़ॉर्म नंबर तीन पर आ रही है।",
    domain: "announcement",
    emotion: "neutral",
    intent: "alert"
  },
  {
    text: "अगर मौसम खराब रहा तो हमें अपनी कल की यात्रा स्थगित करनी पड़ सकती है।",
    domain: "travel",
    emotion: "concerned",
    intent: "caution"
  },
  {
    text: "ऑनलाइन बैंकिंग का उपयोग करते समय अपना पासवर्ड किसी के साथ साझा न करें।",
    domain: "banking",
    emotion: "serious",
    intent: "warning"
  },
  {
    text: "इस नई तकनीक से किसानों को फसल की पैदावार बढ़ाने में काफी मदद मिलेगी।",
    domain: "agriculture",
    emotion: "optimistic",
    intent: "statement"
  },
  {
    text: "क्या आपके पास इस पुस्तक का दूसरा भाग उपलब्ध है?",
    domain: "general",
    emotion: "inquisitive",
    intent: "question"
  }
];

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    // Look up company
    const company = await Company.findOne({ $or: [{ name: "lol" }, { projectName: "lo1l" }] });
    const companyName = company?.name || "lol";
    const projectName = company?.projectName || "lo1l";
    console.log(`Using company: "${companyName}", project: "${projectName}"`);

    // Find highest phraseId
    const allPhrases = await Phrase.find({}, { phraseId: 1 }).lean();
    let maxId = 50000;
    for (const p of allPhrases) {
      const num = parseInt(p.phraseId);
      if (!isNaN(num) && num > maxId) maxId = num;
    }

    const inserted = [];
    for (let i = 0; i < HINDI_PHRASES.length; i++) {
      const p = HINDI_PHRASES[i];
      const newPhraseId = String(maxId + i + 1);

      const phraseDoc = new Phrase({
        phraseId: newPhraseId,
        companyId: companyName,
        projectName: projectName,
        language: "hindi",
        text: p.text.trim(),
        emotion: p.emotion,
        domain: p.domain,
        intent: p.intent,
        tags: { domain: p.domain },
        status: "pending",
        lockedBy: null,
        lockedAt: null,
        assigned_speaker_id: null,
        speaker_id: null,
        contributorId: null,
        audioFile: null,
        duration: 0,
        isTestPhrase: false,
        isSample: false
      });

      const saved = await phraseDoc.save();
      inserted.push(saved);
      console.log(`[+] Inserted Phrase #${saved.phraseId}: "${saved.text}"`);
    }

    console.log(`\nSuccessfully added ${inserted.length} unallocated Hindi phrases for lo1l!`);
    process.exit(0);
  } catch (err) {
    console.error("Error inserting phrases:", err);
    process.exit(1);
  }
}

run();
