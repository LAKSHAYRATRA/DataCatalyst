import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { User } from '../src/models/User.js';

dotenv.config();

async function debugPhraseTags() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/voicechat';
    await mongoose.connect(mongoUri);

    const user = await User.findOne({ email: 'divplays007@gmail.com' });
    const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
    const token = jwt.sign({ sub: user._id.toString(), tokenVersion: user.tokenVersion || 0 }, JWT_SECRET, { expiresIn: '1h' });

    const BACKEND_URL = 'http://localhost:3001';
    const res = await fetch(`${BACKEND_URL}/api/phrases/available?language=hindi&projectName=lo1l`, {
      headers: {
        'Cookie': `vc_token=${token}`,
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await res.json();
    console.log('Returned userCustomizations:', data.userCustomizations);
    console.log('Sample returned phrase keys & values:', data.phrases?.map(p => ({
      _id: p._id,
      text: p.text,
      emotion: p.emotion,
      style: p.style,
      intent: p.intent,
      pitch: p.pitch,
      speed: p.speed,
      volume: p.volume,
      instructions: p.instructions,
      freq: p.freq,
      tags: p.tags,
      domain: p.domain
    })));

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

debugPhraseTags();
