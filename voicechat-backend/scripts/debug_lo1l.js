import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Phrase } from '../src/models/Phrase.js';
import { Company } from '../src/models/Company.js';

dotenv.config();

async function testResolution() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/voicechat';
    await mongoose.connect(mongoUri);

    const inputProject = 'lo1l';
    let targetCompany = inputProject;

    const compDoc = await Company.findOne({
      $or: [
        { name: inputProject },
        { projectName: inputProject },
        { name: { $regex: new RegExp(`^${inputProject}$`, "i") } },
        { projectName: { $regex: new RegExp(`^${inputProject}$`, "i") } }
      ]
    }).select("name").lean();

    if (compDoc) {
      targetCompany = compDoc.name;
    }

    console.log(`Input "${inputProject}" resolved to targetCompany: "${targetCompany}"`);

    const coreComp = String(targetCompany).replace(/_downloaded$/, "").trim();
    const baseQuery = {
      language: { $regex: /^hindi$/i },
      companyId: { $in: [targetCompany, coreComp, `${coreComp}_downloaded`] }
    };

    const count = await Phrase.countDocuments({
      ...baseQuery,
      status: "pending"
    });

    console.log(`Phrases found matching query: ${count}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

testResolution();
