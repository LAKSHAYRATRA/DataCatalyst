import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { User } from '../src/models/User.js';
import { Company } from '../src/models/Company.js';

dotenv.config();

async function testAdminSummary() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/voicechat';
    await mongoose.connect(mongoUri);

    const admin = await User.findOne({ email: 'admin@example.com' }) || await User.findOne({ email: 'divyambhatia672@gmail.com' });
    console.log('Using admin user:', admin.email);

    const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
    const token = jwt.sign({ sub: admin._id.toString(), tokenVersion: admin.tokenVersion || 0 }, JWT_SECRET, { expiresIn: '1h' });

    const company = await Company.findOne({ name: 'lol' });

    const BACKEND_URL = 'http://localhost:3001';
    const res = await fetch(`${BACKEND_URL}/api/admin/companies/${company._id}/contributors-summary`, {
      headers: {
        'Cookie': `vc_token=${token}`,
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('HTTP Status:', res.status);
    const data = await res.json();
    
    console.log('Full Summary Response:', JSON.stringify(data, null, 2));

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

testAdminSummary();
