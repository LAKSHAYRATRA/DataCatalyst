import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../src/models/User.js';
import { Phrase } from '../src/models/Phrase.js';

dotenv.config();

async function checkUserPhrases() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/voicechat';
    await mongoose.connect(mongoUri);

    const user = await User.findOne({ email: 'divplays007@gmail.com' });
    const phrases = await Phrase.find({ contributorId: user._id }).lean();

    console.log('User phrases count:', phrases.length);
    console.log('User phrases details:', phrases.map(p => ({
      _id: p._id,
      text: p.text.substring(0, 30),
      status: p.status,
      duration: p.duration,
      recordedAt: p.recordedAt,
      audioFile: p.audioFile
    })));

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkUserPhrases();
