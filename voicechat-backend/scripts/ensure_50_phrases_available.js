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
const LanguageApp = mongoose.model('LanguageApplication', new mongoose.Schema({}, { strict: false }));

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Make 50 seeded emotion phrases available for any approved company/project
    const res = await Phrase.updateMany(
      { phraseId: { $regex: /^emo_p_/ } },
      {
        $set: {
          status: 'pending',
          lockedBy: null,
          lockedAt: null,
          contributorId: null,
          audioFile: null
        },
        $unset: {
          companyId: "",
          projectName: ""
        }
      }
    );
    console.log(`Made ${res.modifiedCount} emotion phrases universally available across all projects!`);

    process.exit(0);
  } catch (err) {
    console.error('Error updating phrases:', err);
    process.exit(1);
  }
}

run();
