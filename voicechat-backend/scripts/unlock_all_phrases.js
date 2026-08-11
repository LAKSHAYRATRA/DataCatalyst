import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Phrase } from '../src/models/Phrase.js';

dotenv.config();

async function unlockAllPhrases() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/voicechat';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const res = await Phrase.updateMany(
      { status: 'locked' },
      { $set: { status: 'pending' }, $unset: { lockedBy: '', lockedAt: '' } }
    );

    console.log(`Successfully unlocked ${res.modifiedCount} phrases back to pending!`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error unlocking phrases:', err);
    process.exit(1);
  }
}

unlockAllPhrases();
