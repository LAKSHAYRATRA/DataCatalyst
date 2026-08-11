import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/voicechat';

const userSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model('User', userSchema);
const LanguageApp = mongoose.model('LanguageApplication', new mongoose.Schema({}, { strict: false }));

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const allApps = await LanguageApp.find({}).lean();
    console.log(`Total LanguageApplication documents in DB: ${allApps.length}`);
    console.table(allApps.map(a => ({
      _id: a._id,
      userId: a.userId,
      applicationType: a.applicationType,
      companyId: a.companyId,
      projectName: a.projectName,
      languageCode: a.languageCode,
      status: a.status
    })));

    process.exit(0);
  } catch (err) {
    console.error('Error inspecting all apps:', err);
    process.exit(1);
  }
}

run();
