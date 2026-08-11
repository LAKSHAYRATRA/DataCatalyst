import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../src/models/User.js';
import { Phrase } from '../src/models/Phrase.js';
import { Company } from '../src/models/Company.js';

dotenv.config();

async function debugCompanySummary() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/voicechat';
    await mongoose.connect(mongoUri);

    const company = await Company.findOne({ name: 'lol' });
    console.log('Company:', company._id, company.name, company.projectName);

    const user = await User.findOne({ email: 'divplays007@gmail.com' });
    console.log('User:', user._id, user.email, user.speaker_id);

    // Find all phrases recorded or locked or submitted by user
    const phrasesByUser = await Phrase.find({ contributorId: user._id }).lean();
    console.log('Phrases with contributorId = user._id:', phrasesByUser.length);
    console.log('Sample user phrase companyIds:', [...new Set(phrasesByUser.map(p => p.companyId))]);

    // Find all phrases for company lol
    const companyPhrases = await Phrase.find({ companyId: { $in: ['lol', 'lo1l', 'lol_downloaded'] } }).lean();
    console.log('Company phrases total:', companyPhrases.length);
    console.log('Company phrases with contributorId:', companyPhrases.filter(p => p.contributorId).length);
    console.log('Company phrase statuses:', companyPhrases.reduce((acc, p) => { acc[p.status] = (acc[p.status]||0)+1; return acc; }, {}));

    const userPhrasesInCompany = companyPhrases.filter(p => String(p.contributorId) === String(user._id));
    console.log('User phrases inside company lol:', userPhrasesInCompany.length);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

debugCompanySummary();
