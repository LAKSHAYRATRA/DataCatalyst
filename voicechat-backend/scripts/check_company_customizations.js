import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Company } from '../src/models/Company.js';

dotenv.config();

async function checkCompany() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/voicechat';
    await mongoose.connect(mongoUri);

    const companies = await Company.find({}).lean();
    console.log('Companies:', JSON.stringify(companies, null, 2));

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkCompany();
