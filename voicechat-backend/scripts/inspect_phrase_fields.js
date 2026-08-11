import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Phrase } from '../src/models/Phrase.js';

dotenv.config();

async function inspectPhrase() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/voicechat';
    await mongoose.connect(mongoUri);

    const phrase = await Phrase.findOne({ companyId: 'lol' }).lean();
    console.log('Phrase Document in DB:', JSON.stringify(phrase, null, 2));

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

inspectPhrase();
