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

    const apps = await LanguageApp.find({ applicationType: 'phrase' }).lean();
    console.log(`Found ${apps.length} total phrase applications in DB`);

    if (apps.length > 0) {
      const app = apps[0];
      const targetCompany = app.companyId || 'General Phrases';
      const targetLanguage = app.languageCode || 'english';

      const updated = await Phrase.updateMany(
        { phraseId: { $regex: /^emo_p_/ } },
        {
          $set: {
            companyId: targetCompany,
            projectName: targetCompany,
            language: targetLanguage
          }
        }
      );
      console.log(`Updated ${updated.modifiedCount} emotion phrases to Company: "${targetCompany}", Language: "${targetLanguage}"`);
    } else {
      console.log('No phrase applications found; emotion phrases set to default English.');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error linking phrases:', err);
    process.exit(1);
  }
}

run();
