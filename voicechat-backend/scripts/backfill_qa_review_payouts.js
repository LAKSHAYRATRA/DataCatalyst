import dotenv from "dotenv";
import mongoose from "mongoose";
import { User } from "../src/models/User.js";
import { Phrase } from "../src/models/Phrase.js";
import { PhraseRejection } from "../src/models/PhraseRejection.js";
import { CallSession } from "../src/models/CallSession.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/voicechat";

async function backfill() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB for QA Payout Backfill...");

  // Load all QA users
  const qaUsers = await User.find({ isQA: true }).lean();
  const userMap = new Map();
  for (const u of qaUsers) {
    const perCallRate = Number((u.qaPerCallPayrateUsd !== undefined && u.qaPerCallPayrateUsd !== null && u.qaPerCallPayrateUsd > 0) ? u.qaPerCallPayrateUsd : u.perCallPayrate) || 0;
    const hourlyPhraseRate = Number((u.qaHourlyPhrasePayrateUsd !== undefined && u.qaHourlyPhrasePayrateUsd !== null && u.qaHourlyPhrasePayrateUsd > 0) ? u.qaHourlyPhrasePayrateUsd : u.hourlyPhraseRate) || 0;
    userMap.set(String(u._id), { perCallRate, hourlyPhraseRate });
  }

  const getRates = (userId) => {
    const strId = String(userId || "");
    if (userMap.has(strId)) return userMap.get(strId);
    return { perCallRate: 0, hourlyPhraseRate: 0 };
  };

  // 1. Backfill Phrase (Approved)
  const phrasesToUpdate = await Phrase.find({
    status: "approved",
    $or: [
      { qaId: { $ne: null } },
      { "firstQaReview.qaId": { $ne: null } },
      { editedBy: { $ne: null } }
    ],
    qaPhrasePayoutUsd: null
  });

  console.log(`Found ${phrasesToUpdate.length} approved phrases to backfill QA payout...`);
  let phraseCount = 0;
  for (const p of phrasesToUpdate) {
    const reviewerId = p.qaId || p.editedBy || p.firstQaReview?.qaId;
    const rates = getRates(reviewerId);
    const payout = Math.round(((p.duration || 0) / 3600) * rates.hourlyPhraseRate * 100) / 100;
    p.qaPhrasePayoutUsd = payout;
    await p.save();
    phraseCount++;
  }
  console.log(`Backfilled ${phraseCount} approved phrases.`);

  // 2. Backfill PhraseRejection
  const rejectionsToUpdate = await PhraseRejection.find({
    qaId: { $ne: null },
    qaPhrasePayoutUsd: null
  });

  console.log(`Found ${rejectionsToUpdate.length} phrase rejections to backfill QA payout...`);
  let rejectionCount = 0;
  for (const r of rejectionsToUpdate) {
    const rates = getRates(r.qaId);
    const payout = Math.round(((r.duration || 0) / 3600) * rates.hourlyPhraseRate * 100) / 100;
    r.qaPhrasePayoutUsd = payout;
    await r.save();
    rejectionCount++;
  }
  console.log(`Backfilled ${rejectionCount} phrase rejections.`);

  // 3. Backfill CallSession
  const callsToUpdate = await CallSession.find({
    $or: [
      { reviewedBy: { $ne: null } },
      { "firstQaReview.qaId": { $ne: null } }
    ],
    callStatus: { $in: ["approved", "rejected"] },
    qaCallPayoutUsd: null
  });

  console.log(`Found ${callsToUpdate.length} call sessions to backfill QA payout...`);
  let callCount = 0;
  for (const c of callsToUpdate) {
    const reviewerId = c.reviewedBy || c.firstQaReview?.qaId;
    const rates = getRates(reviewerId);
    c.qaCallPayoutUsd = rates.perCallRate;
    await c.save();
    callCount++;
  }
  console.log(`Backfilled ${callCount} call sessions.`);

  console.log("QA Payout Backfill completed successfully!");
  process.exit(0);
}

backfill().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
