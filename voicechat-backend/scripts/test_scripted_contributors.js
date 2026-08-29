import mongoose from 'mongoose';
import { ScriptedLanguage } from '../src/models/ScriptedLanguage.js';
import { User } from '../src/models/User.js';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/voicechat');
  const lang = await ScriptedLanguage.findOne({ code: 'english' }).lean();
  console.log('Scripted English language:', lang?._id, lang?.name);

  const users = await User.find({
    languageApplications: {
      $elemMatch: {
        applicationType: 'scripted_call',
        languageCode: 'english'
      }
    }
  }).select('username email languageApplications').lean();

  console.log('Pure Scripted English contributors found:', users.length);
  users.forEach(u => {
    console.log(u.username, u.languageApplications.filter(a => a.applicationType === 'scripted_call'));
  });

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
