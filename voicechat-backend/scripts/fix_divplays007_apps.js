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

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const user = await User.findOne({ email: 'divplays007@gmail.com' });
    if (!user) {
      console.log('User divplays007@gmail.com not found!');
      process.exit(0);
    }

    console.log('Current languageApplications for divplays007@gmail.com:', user.languageApplications || []);

    // Ensure hasSignedContributorAgreement is true
    user.hasSignedContributorAgreement = true;
    user.agreementSignedAt = user.agreementSignedAt || new Date();
    user.agreementVersion = '1.0';

    if (!user.languageApplications) {
      user.languageApplications = [];
    }

    // Check if there is an existing phrase application
    let phraseApp = user.languageApplications.find(a => a.applicationType === 'phrase');

    if (phraseApp) {
      console.log('Found existing phrase application:', phraseApp);
      phraseApp.status = 'approved';
      phraseApp.reviewedAt = new Date();
    } else {
      console.log('No phrase application found. Adding an approved phrase project!');
      user.languageApplications.push({
        _id: new mongoose.Types.ObjectId(),
        applicationType: 'phrase',
        companyId: 'General Phrases',
        projectName: 'General Phrases',
        languageCode: 'english',
        status: 'approved',
        appliedAt: new Date(),
        reviewedAt: new Date()
      });
    }

    user.markModified('languageApplications');
    await user.save();

    console.log('Successfully updated divplays007@gmail.com with approved phrase application & signed agreement status!');
    console.log('Updated User LanguageApplications:', user.languageApplications);

    process.exit(0);
  } catch (err) {
    console.error('Error updating divplays007:', err);
    process.exit(1);
  }
}

run();
