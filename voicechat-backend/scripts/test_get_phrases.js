import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../src/models/User.js';
import { Phrase } from '../src/models/Phrase.js';

dotenv.config();

async function testQuery() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/voicechat';
    await mongoose.connect(mongoUri);

    const user = await User.findOne({ email: 'divplays007@gmail.com' });
    const projectName = 'lol';
    const language = 'hindi';

    const coreComp = String(projectName).replace(/_downloaded$/, "").trim();
    const baseQuery = {
      language: { $regex: new RegExp(`^${language}$`, "i") },
      companyId: { $in: [projectName, coreComp, `${coreComp}_downloaded`] }
    };

    const count = await Phrase.countDocuments({
      ...baseQuery,
      $or: [
        { status: "pending" },
        { status: "locked", lockedBy: user._id }
      ]
    });

    console.log('Query result count for divplays007:', count);

    const sample = await Phrase.find({
      ...baseQuery,
      $or: [
        { status: "pending" },
        { status: "locked", lockedBy: user._id }
      ]
    }).limit(5).lean();

    console.log('5 Sample phrases for divplays007:', sample.map(s => ({ id: s._id, text: s.text, emotion: s.emotion, companyId: s.companyId })));

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

testQuery();
