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
const LanguageApp = mongoose.model('LanguageApplication', new mongoose.Schema({}, { strict: false }));

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const user = await User.findOne({ email: 'divplays007@gmail.com' }).lean();
    if (!user) {
      console.log('User divplays007@gmail.com not found!');
      process.exit(0);
    }

    console.log('User Document:', {
      _id: user._id,
      email: user.email,
      username: user.username,
      hasSignedContributorAgreement: user.hasSignedContributorAgreement,
      agreementSignedAt: user.agreementSignedAt,
      agreementVersion: user.agreementVersion,
      isAdmin: user.isAdmin,
      isQA: user.isQA
    });

    const apps = await LanguageApp.find({ userId: user._id }).lean();
    console.log(`Found ${apps.length} LanguageApplications for divplays007@gmail.com:`);
    console.table(apps.map(a => ({
      _id: a._id,
      applicationType: a.applicationType,
      companyId: a.companyId,
      projectName: a.projectName,
      languageCode: a.languageCode,
      status: a.status,
      createdAt: a.createdAt
    })));

    process.exit(0);
  } catch (err) {
    console.error('Error inspecting user:', err);
    process.exit(1);
  }
}

run();
