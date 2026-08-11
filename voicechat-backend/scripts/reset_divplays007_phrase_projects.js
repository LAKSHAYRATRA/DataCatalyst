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

    console.log('Before Reset - LanguageApplications count:', user.languageApplications?.length || 0);

    // Filter out all phrase applications (keep call applications if any)
    if (Array.isArray(user.languageApplications)) {
      user.languageApplications = user.languageApplications.filter(a => a.applicationType !== 'phrase');
    } else {
      user.languageApplications = [];
    }

    user.markModified('languageApplications');
    await user.save();

    // Reset phrases recorded or locked by this user back to pending
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

    // Remove phrase rejections for this user
    const rejectionDelRes = await PhraseRejection.deleteMany({ contributorId: user._id });

    console.log('Successfully reset phrase projects for divplays007@gmail.com!');
    console.log(`- Remaining LanguageApplications: ${user.languageApplications.length}`);
    console.log(`- Reset Phrases count: ${phraseResetRes.modifiedCount}`);
    console.log(`- Deleted Rejections count: ${rejectionDelRes.deletedCount}`);

    process.exit(0);
  } catch (err) {
    console.error('Error resetting user phrase projects:', err);
    process.exit(1);
  }
}

run();
