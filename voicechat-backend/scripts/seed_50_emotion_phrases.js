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
const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
const LanguageApp = mongoose.model('LanguageApplication', new mongoose.Schema({}, { strict: false }));

const EMOTION_DATA = [
  // 1. Happy (5 phrases)
  { emotion: 'Happy', text: "I can't believe how wonderful this day turned out to be!" },
  { emotion: 'Happy', text: "Sunlight fills the room, bringing warm smiles to everyone around." },
  { emotion: 'Happy', text: "Laughter echoed through the hall as we celebrated our great news." },
  { emotion: 'Happy', text: "Every moment of this journey brings endless joy and pure delight." },
  { emotion: 'Happy', text: "What a fantastic achievement after months of dedicated hard work!" },

  // 2. Sad (5 phrases)
  { emotion: 'Sad', text: "Tears quietly rolled down her cheeks as the train slowly departed." },
  { emotion: 'Sad', text: "It breaks my heart to say goodbye after all these precious years." },
  { emotion: 'Sad', text: "The long empty hallway felt colder and lonely without his presence." },
  { emotion: 'Sad', text: "Sometimes memories hurt more than silence ever could." },
  { emotion: 'Sad', text: "A gentle sorrow washed over the quiet neighborhood at dusk." },

  // 3. Angry (5 phrases)
  { emotion: 'Angry', text: "Stop making excuses and take responsibility for your actions right now!" },
  { emotion: 'Angry', text: "This is completely unacceptable and I will not tolerate it any longer!" },
  { emotion: 'Angry', text: "How dare you break your promise after everything we agreed upon?" },
  { emotion: 'Angry', text: "I have asked you repeatedly to stop interrupting my presentation!" },
  { emotion: 'Angry', text: "Shut the door behind you and leave immediately!" },

  // 4. Excited (5 phrases)
  { emotion: 'Excited', text: "We just won the championship trophy and I cannot hold back my energy!" },
  { emotion: 'Excited', text: "Pack your bags right now because we are flying to Hawaii tomorrow morning!" },
  { emotion: 'Excited', text: "Look at those incredible fireworks lighting up the entire night sky!" },
  { emotion: 'Excited', text: "This is the most thrilling opportunity of my entire career!" },
  { emotion: 'Excited', text: "Hurry up, the grand opening concert is about to start in five minutes!" },

  // 5. Neutral (5 phrases)
  { emotion: 'Neutral', text: "The meeting is scheduled for ten o'clock in conference room B." },
  { emotion: 'Neutral', text: "Please review the attached document and submit your feedback by Friday." },
  { emotion: 'Neutral', text: "The temperature outside today is twenty-two degrees Celsius with light winds." },
  { emotion: 'Neutral', text: "All passengers are advised to keep their personal belongings with them." },
  { emotion: 'Neutral', text: "The train on platform three will depart on time according to the schedule." },

  // 6. Fearful (5 phrases)
  { emotion: 'Fearful', text: "Did you hear that strange shadow moving down the dark staircase?" },
  { emotion: 'Fearful', text: "Please don't leave me alone here in this creepy deserted house." },
  { emotion: 'Fearful', text: "My heart is pounding fast and I can feel danger lurking nearby." },
  { emotion: 'Fearful', text: "What was that loud crashing noise coming from the basement?" },
  { emotion: 'Fearful', text: "Step back slowly and don't make any sudden movements near the edge." },

  // 7. Disgusted (5 phrases)
  { emotion: 'Disgusted', text: "Ugh, the smell coming from that rotten milk is absolutely foul!" },
  { emotion: 'Disgusted', text: "I cannot stand the sight of slimy mold growing on the old fruits." },
  { emotion: 'Disgusted', text: "How could anyone eat something that looks so unappetizing and spoiled?" },
  { emotion: 'Disgusted', text: "That entire garbage bin needs to be disinfected and cleaned right away." },
  { emotion: 'Disgusted', text: "Eww, get that sticky bug away from my dinner plate immediately!" },

  // 8. Surprised (5 phrases)
  { emotion: 'Surprised', text: "Wow, I never expected to run into you after all these years!" },
  { emotion: 'Surprised', text: "Are you serious? I had no idea you won first place in the contest!" },
  { emotion: 'Surprised', text: "Oh my goodness, look at the size of that giant glowing shooting star!" },
  { emotion: 'Surprised', text: "Unbelievable! The test results came back completely clear!" },
  { emotion: 'Surprised', text: "Wait, did you really organize this entire surprise party just for me?" },

  // 9. Whisper (5 phrases)
  { emotion: 'Whisper', text: "Keep your voice down, nobody else in this room can know about this plan." },
  { emotion: 'Whisper', text: "Shh, pass the secret key under the table when no one is looking." },
  { emotion: 'Whisper', text: "Meet me behind the old library at midnight, don't tell a single soul." },
  { emotion: 'Whisper', text: "Hide the document inside the blue folder before the manager walks in." },
  { emotion: 'Whisper', text: "Speak softly, the baby just fell asleep in the next room." },

  // 10. Calm (5 phrases)
  { emotion: 'Calm', text: "Take a deep breath in, let go of all stress, and relax your mind." },
  { emotion: 'Calm', text: "Listen to the gentle ocean waves softly rolling against the smooth shore." },
  { emotion: 'Calm', text: "Everything will turn out fine, just take it one peaceful step at a time." },
  { emotion: 'Calm', text: "The night sky is quiet and calm, bringing complete peace to your heart." },
  { emotion: 'Calm', text: "Rest comfortably under the warm blanket and drift into sweet dreams." }
];

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Find active language applications to assign proper companyId & language
    const approvedApps = await LanguageApp.find({ status: 'approved', applicationType: 'phrase' }).lean();
    console.log(`Found ${approvedApps.length} approved phrase applications`);

    let targetCompany = 'General Phrases';
    let targetLanguage = 'english';

    if (approvedApps.length > 0) {
      targetCompany = approvedApps[0].companyId || targetCompany;
      targetLanguage = approvedApps[0].languageCode || targetLanguage;
    }

    console.log(`Targeting Company: "${targetCompany}", Language: "${targetLanguage}"`);

    const phrasesToInsert = [];
    const now = Date.now();

    for (let i = 0; i < EMOTION_DATA.length; i++) {
      const item = EMOTION_DATA[i];
      const pId = `emo_p_${now}_${i + 1}`;
      phrasesToInsert.push({
        phraseId: pId,
        companyId: targetCompany,
        projectName: targetCompany,
        language: targetLanguage,
        text: item.text,
        emotion: item.emotion,
        style: 'Conversational',
        intent: 'Statement',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    const result = await Phrase.insertMany(phrasesToInsert);
    console.log(`Successfully seeded ${result.length} phrases across 10 emotion categories!`);

    // Print summary table
    const summary = {};
    for (const p of phrasesToInsert) {
      summary[p.emotion] = (summary[p.emotion] || 0) + 1;
    }
    console.table(summary);

    process.exit(0);
  } catch (err) {
    console.error('Error seeding phrases:', err);
    process.exit(1);
  }
}

run();
