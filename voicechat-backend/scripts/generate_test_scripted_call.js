import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import mongoose from 'mongoose';
import { ScriptedTopic } from '../src/models/ScriptedTopic.js';
import { ScriptedSubtopic } from '../src/models/ScriptedSubtopic.js';
import { ScriptedSubmission } from '../src/models/ScriptedSubmission.js';
import { User } from '../src/models/User.js';
import { stitchScriptedPair } from '../src/services/scriptedStitcher.js';

const execAsync = promisify(exec);

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/voicechat');

  const userA = (await User.findOne({ username: 'divyambhatia672' })) || (await User.findOne());
  const userB = (await User.findOne({ username: 'johndoe' })) || (await User.find())[1];

  console.log('Using Speaker 1 (User A):', userA.username, String(userA._id));
  console.log('Using Speaker 2 (User B):', userB.username, String(userB._id));

  // Find or use subtopic with 3 turns
  let subtopic = await ScriptedSubtopic.findById('6a928c496377d95f95036ddc');
  if (!subtopic) {
    subtopic = await ScriptedSubtopic.findOne({ 'dialogueTurns.2': { $exists: true } }) || (await ScriptedSubtopic.findOne());
  }
  const topic = await ScriptedTopic.findById(subtopic.topicId);

  console.log('Scenario / Subtopic:', subtopic.title);
  console.log('Topic:', topic?.title || 'General');

  const uploadsDir = path.join(process.cwd(), 'uploads', 'scripted_temp');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  // Generate 3 audio files for Speaker 1 (4 seconds each)
  const versesA = [];
  for (let i = 0; i < 3; i++) {
    const filePath = path.join(uploadsDir, `test_turn_s1_${i}_${Date.now()}.wav`);
    const freq = 400 + i * 150;
    await execAsync(`ffmpeg -y -f lavfi -i "sine=frequency=${freq}:duration=4" -ar 48000 -ac 1 -c:a pcm_s16le "${filePath}"`);
    versesA.push({
      turnIndex: i,
      audioPath: filePath,
      durationSec: 4.0,
      text: subtopic.dialogueTurns?.[i]?.speaker1 || `Speaker 1 Dialogue Line ${i + 1}`,
      status: 'pending'
    });
  }

  // Generate 3 audio files for Speaker 2 (5 seconds each)
  const versesB = [];
  for (let i = 0; i < 3; i++) {
    const filePath = path.join(uploadsDir, `test_turn_s2_${i}_${Date.now()}.wav`);
    const freq = 550 + i * 180;
    await execAsync(`ffmpeg -y -f lavfi -i "sine=frequency=${freq}:duration=5" -ar 48000 -ac 1 -c:a pcm_s16le "${filePath}"`);
    versesB.push({
      turnIndex: i,
      audioPath: filePath,
      durationSec: 5.0,
      text: subtopic.dialogueTurns?.[i]?.speaker2 || `Speaker 2 Dialogue Line ${i + 1}`,
      status: 'pending'
    });
  }

  // Create Submissions for both speakers
  const sub1 = new ScriptedSubmission({
    subtopicId: subtopic._id,
    topicId: subtopic.topicId,
    language: 'english',
    userId: userA._id,
    userGender: 'male',
    role: 'speaker1',
    verses: versesA,
    status: 'pending_match'
  });
  await sub1.save();

  const sub2 = new ScriptedSubmission({
    subtopicId: subtopic._id,
    topicId: subtopic.topicId,
    language: 'english',
    userId: userB._id,
    userGender: 'female',
    role: 'speaker2',
    verses: versesB,
    status: 'pending_match'
  });
  await sub2.save();

  console.log('Submissions created for 3 turns each. Stitching dual-channel audio...');
  const callSession = await stitchScriptedPair(sub1, sub2);

  console.log('\n========================================');
  console.log('TEST SCRIPTED CALL SUCCESSFULLY CREATED');
  console.log('========================================');
  console.log('Call ID:', callSession.callId);
  console.log('Topic:', topic?.title || 'General');
  console.log('Scenario (Subtopic):', subtopic.title);
  console.log('Total Stitched Conversation Duration:', callSession.actualCallDuration, 'seconds');
  console.log('Speaker 1 Duration (User A):', callSession.recordingADurationMinutes, 'min | Payout: $' + callSession.recordingAPayoutUsd);
  console.log('Speaker 2 Duration (User B):', callSession.recordingBDurationMinutes, 'min | Payout: $' + callSession.recordingBPayoutUsd);
  console.log('Audio Files:');
  console.log(' - Track A:', callSession.recordingAFile);
  console.log(' - Track B:', callSession.recordingBFile);
  console.log(' - Stereo Mixed:', callSession.mixedRecordingFile);
  console.log('========================================\n');

  process.exit(0);
}

main().catch(err => {
  console.error('Error generating test scripted call:', err);
  process.exit(1);
});
