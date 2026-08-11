import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Phrase } from '../src/models/Phrase.js';

dotenv.config();

async function findPhrasesWithTags() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/voicechat';
    await mongoose.connect(mongoUri);

    const countWithDomain = await Phrase.countDocuments({
      companyId: 'lol',
      $or: [
        { domain: { $ne: null } },
        { 'tags.domain': { $ne: null } }
      ]
    });

    const countWithFreq = await Phrase.countDocuments({
      companyId: 'lol',
      freq: { $ne: null }
    });

    console.log('Phrases with domain:', countWithDomain);
    console.log('Phrases with freq:', countWithFreq);

    const sampleDomain = await Phrase.findOne({
      companyId: 'lol',
      $or: [
        { domain: { $ne: null } },
        { 'tags.domain': { $ne: null } }
      ]
    }).lean();

    if (sampleDomain) {
      console.log('Sample phrase with domain:', sampleDomain.text, sampleDomain.tags || sampleDomain.domain);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

findPhrasesWithTags();
