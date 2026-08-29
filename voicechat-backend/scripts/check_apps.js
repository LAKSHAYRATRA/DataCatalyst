import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { ScriptedLanguage } from '../src/models/ScriptedLanguage.js';
import { ScriptedSubmission } from '../src/models/ScriptedSubmission.js';
import { CallSession } from '../src/models/CallSession.js';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/voicechat');

  const users = await User.find({ 'languageApplications.0': { $exists: true } }).lean();
  console.log('USERS WITH APPS:', users.length);
  for (const u of users) {
    console.log({
      id: u._id,
      user: u.username || u.email,
      apps: (u.languageApplications || []).map(a => ({
        type: a.applicationType,
        lang: a.languageCode,
        status: a.status
      }))
    });
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
