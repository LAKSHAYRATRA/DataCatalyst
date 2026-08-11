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
const Phrase = mongoose.model('Phrase', new mongoose.Schema({}, { strict: false }));
const PhraseRejection = mongoose.model('PhraseRejection', new mongoose.Schema({}, { strict: false }));

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const user = await User.findOne({ email: 'divplays007@gmail.com' });
    if (!user) {
      console.log('User divplays007@gmail.com not found!');
      process.exit(0);
    }

    console.log('Before Reset:');
    console.log('- LanguageApplications count:', user.languageApplications?.length || 0);
    console.log('- Contributor Agreement Signed:', user.hasSignedContributorAgreement);

    // 1. Clear ALL project applications
    user.languageApplications = [];
    
    // 2. Ensure Contributor Agreement remains signed & approved
    user.hasSignedContributorAgreement = true;
    user.agreementSignedAt = user.agreementSignedAt || new Date();
    user.agreementVersion = '1.0';

    user.markModified('languageApplications');
    await user.save();

    // 3. Reset all phrases recorded or locked by this user
    const phraseResetRes = await Phrase.updateMany(
      { $or: [{ contributorId: user._id }, { lockedBy: user._id }] },
      {
        $set: {
          status: 'pending',
          contributorId: null,
          lockedBy: null,
          lockedAt: null,
          audioFile: null,
          duration: 0,
          lufs: null,
          recordedAt: null
        }
      }
    );

    // 4. Clear rejections
    const rejectionDelRes = await PhraseRejection.deleteMany({ contributorId: user._id });

    console.log('\nSuccessfully performed full reset for divplays007@gmail.com!');
    console.log('Final Account State:');
    console.log(`- LanguageApplications count: ${user.languageApplications.length} (Empty)`);
    console.log(`- Contributor Agreement Signed: ${user.hasSignedContributorAgreement} (Untouched / Approved)`);
    console.log(`- Reset Phrases: ${phraseResetRes.modifiedCount}`);
    console.log(`- Cleared Rejections: ${rejectionDelRes.deletedCount}`);

    process.exit(0);
  } catch (err) {
    console.error('Error resetting user account:', err);
    process.exit(1);
  }
}

run();
