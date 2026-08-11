import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { User } from '../src/models/User.js';

dotenv.config();

async function testUserFetch() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/voicechat';
    await mongoose.connect(mongoUri);

    const user = await User.findOne({ email: 'divplays007@gmail.com' });
    if (!user) {
      console.error('User not found');
      process.exit(1);
    }

    const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
    const token = jwt.sign({ sub: user._id.toString(), tokenVersion: user.tokenVersion || 0 }, JWT_SECRET, { expiresIn: '1h' });

    console.log('Generated auth token for divplays007:', token);

    const BACKEND_URL = 'http://localhost:3001';
    const res = await fetch(`${BACKEND_URL}/api/phrases/available?language=hindi&projectName=lo1l`, {
      headers: {
        'Cookie': `vc_token=${token}`,
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('HTTP Status:', res.status);
    const body = await res.text();
    console.log('Response Body:', body);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error in testUserFetch:', err);
    process.exit(1);
  }
}

testUserFetch();
