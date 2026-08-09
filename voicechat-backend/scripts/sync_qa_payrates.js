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

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const qaUsers = await User.find({ isQA: true });
    console.log(`Found ${qaUsers.length} QA users`);

    for (const u of qaUsers) {
      const perCall = Number(u.perCallPayrate) || Number(u.qaPerCallPayrateUsd) || 0;
      const hourlyPhrase = Number(u.hourlyPhrasePayrate) || Number(u.qaHourlyPhrasePayrateUsd) || 0;

      await User.updateOne(
        { _id: u._id },
        {
          $set: {
            perCallPayrate: perCall,
            qaPerCallPayrateUsd: perCall,
            hourlyPhrasePayrate: hourlyPhrase,
            qaHourlyPhrasePayrateUsd: hourlyPhrase
          }
        }
      );

      console.log(`Updated QA User: ${u.username} (${u.email}) -> Call Rate: $${perCall}, Phrase Rate: $${hourlyPhrase}/hr`);
    }

    console.log('Successfully synced all QA payrates!');
    process.exit(0);
  } catch (err) {
    console.error('Error syncing QA payrates:', err);
    process.exit(1);
  }
}

run();
