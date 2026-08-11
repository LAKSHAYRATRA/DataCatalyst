import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/voicechat';

const phraseSchema = new mongoose.Schema({}, { strict: false });
const Phrase = mongoose.model('Phrase', phraseSchema);

const HINDI_EMOTION_PHRASES = [
  // 1. Happy
  { emotion: 'Happy', text: "आज का दिन कितना अद्भुत और खुशहाल निकला, मुझे विश्वास ही नहीं हो रहा!" },
  { emotion: 'Happy', text: "सूरज की खिली धूप ने पूरे कमरे में सबके चेहरों पर मुस्कान ला दी।" },
  { emotion: 'Happy', text: "शानदार खबर मिलते ही पूरे हॉल में तालियों और हँसी की गूँज छा गई।" },
  { emotion: 'Happy', text: "इस सुहाने सफर का हर एक पल अपार खुशी और आनंद लेकर आया है।" },
  { emotion: 'Happy', text: "महीनों की कड़ी मेहनत के बाद आज यह शानदार सफलता हासिल हुई है!" },

  // 2. Sad
  { emotion: 'Sad', text: "ट्रेन के धीरे-धीरे चलते ही उसकी आँखों से खामोशी में आँसू छलक पड़े।" },
  { emotion: 'Sad', text: "इतने सालों के प्यारे रिश्तों के बाद आज अलविदा कहते हुए दिल टूट रहा है।" },
  { emotion: 'Sad', text: "उस खाली गलियारे में उसकी गैरमौजूदगी बहुत तन्हा और दुखी करने वाली थी।" },
  { emotion: 'Sad', text: "कभी-कभी खामोशी से भी ज्यादा पुरानी यादें दिल को दर्द पहुँचाती हैं।" },
  { emotion: 'Sad', text: "ढलती शाम के साथ पूरे शांत मोहल्ले में एक उदासी की लहर दौड़ गई।" },

  // 3. Angry
  { emotion: 'Angry', text: "बहाने बनाना बंद करो और तुरंत अपनी गलती की जिम्मेदारी स्वीकार करो!" },
  { emotion: 'Angry', text: "यह बात पूरी तरह से बर्दाश्त के बाहर है और मैं इसे बिल्कुल सहन नहीं करूँगा!" },
  { emotion: 'Angry', text: "सब कुछ तय होने के बाद तुम्हारी हिम्मत कैसे हुई अपना वादा तोड़ने की?" },
  { emotion: 'Angry', text: "मैंने तुमसे बार-बार कहा है कि मेरी बात के बीच में मत बोला करो!" },
  { emotion: 'Angry', text: "दरवाजा तुरंत बंद करो और इसी वक्त यहाँ से बाहर निकल जाओ!" },

  // 4. Excited
  { emotion: 'Excited', text: "हमने आज ट्रॉफी जीत ली है और मेरी खुशी का कोई ठिकाना नहीं है!" },
  { emotion: 'Excited', text: "अपना सामान जल्दी पैक करो, हम कल सुबह ही छुट्टियाँ बिताने निकल रहे हैं!" },
  { emotion: 'Excited', text: "देखो, आसमान में आतिशबाजी का कितना शानदार और खूबसूरत नजारा है!" },
  { emotion: 'Excited', text: "यह मेरे करियर का अब तक का सबसे बड़ा और रोमांचक अवसर है!" },
  { emotion: 'Excited', text: "जल्दी चलो, भव्य संगीत समारोह बस पाँच मिनट में शुरू होने वाला है!" },

  // 5. Neutral
  { emotion: 'Neutral', text: "आज की मुख्य बैठक सुबह दस बजे कॉन्फ्रेंस रूम नंबर दो में रखी गई है।" },
  { emotion: 'Neutral', text: "कृपया संलग्न दस्तावेज़ की समीक्षा करें और शुक्रवार तक अपनी रिपोर्ट भेजें।" },
  { emotion: 'Neutral', text: "शहर का तापमान आज बाईस डिग्री सेल्सियस है और हल्की हवा चल रही है।" },
  { emotion: 'Neutral', text: "सभी यात्रियों से अनुरोध है कि वे अपने कीमती सामान का ध्यान स्वयं रखें।" },
  { emotion: 'Neutral', text: "प्लेटफॉर्म नंबर तीन पर आने वाली ट्रेन अपने सही समय पर रवाना होगी।" }
];

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Make all existing emotion phrases matched to company 'lol' & 'hindi'
    const updatedRes = await Phrase.updateMany(
      { phraseId: { $regex: /^emo_p_/ } },
      {
        $set: {
          companyId: 'lol',
          projectName: 'lol',
          language: 'hindi',
          status: 'pending',
          lockedBy: null,
          lockedAt: null,
          contributorId: null
        }
      }
    );
    console.log(`Updated ${updatedRes.modifiedCount} English phrases to Hindi & Project "lol"`);

    // Insert Hindi Emotion Phrases
    const now = Date.now();
    const hindiDocs = HINDI_EMOTION_PHRASES.map((item, i) => ({
      phraseId: `emo_hi_${now}_${i + 1}`,
      companyId: 'lol',
      projectName: 'lol',
      language: 'hindi',
      text: item.text,
      emotion: item.emotion,
      style: 'Conversational',
      intent: 'Statement',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    const inserted = await Phrase.insertMany(hindiDocs);
    console.log(`Successfully inserted ${inserted.length} Hindi Emotion Phrases for Project "lol"!`);

    process.exit(0);
  } catch (err) {
    console.error('Error seeding Hindi phrases:', err);
    process.exit(1);
  }
}

run();
