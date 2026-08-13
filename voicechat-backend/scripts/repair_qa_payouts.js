import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", ".env") });
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/voicechat";

const userSchema = new mongoose.Schema({}, { strict: false });
const phraseSchema = new mongoose.Schema({}, { strict: false });
const phraseRejectionSchema = new mongoose.Schema({}, { strict: false });
const payoutPaymentSchema = new mongoose.Schema({}, { strict: false });

const User = mongoose.model("User", userSchema);
const Phrase = mongoose.model("Phrase", phraseSchema);
const PhraseRejection = mongoose.model("PhraseRejection", phraseRejectionSchema);
const PayoutPayment = mongoose.model("PayoutPayment", payoutPaymentSchema);

async function runRepair() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB for QA Payrate Repair...");

    const qaUsers = await User.find({ isQA: true });
    console.log(`Found ${qaUsers.length} QA users`);

    for (const u of qaUsers) {
      let perCall = Number(u.perCallPayrate) || 0;
      let hourlyPhrase = Number(u.hourlyPhrasePayrate) || 0;

      // Special check for Vishakha Bose or if rate was 0
      if (u.email === "vishh1231@gmail.com" || (hourlyPhrase === 0 && u.isQA)) {
        hourlyPhrase = 8.00; // Set to $8/hr as configured
      }

      await User.updateOne(
        { _id: u._id },
        {
          $set: {
            perCallPayrate: perCall,
            hourlyPhrasePayrate: hourlyPhrase
          },
          $unset: {
            qaPerCallPayrateUsd: "",
            qaHourlyPhrasePayrateUsd: ""
          }
        }
      );

      console.log(`Synced QA User: ${u.username} (${u.email}) -> Call Rate: $${perCall}, Phrase Rate: $${hourlyPhrase}/hr`);

      // Recalculate/Backfill phrase payouts for this QA user
      const userIdObj = u._id;
      const uIdStr = String(u._id);

      const approvedPhrases = await Phrase.find({
        status: "approved",
        $or: [
          { qaId: { $in: [userIdObj, uIdStr] } },
          { "firstQaReview.qaId": { $in: [userIdObj, uIdStr] } },
          { editedBy: { $in: [userIdObj, uIdStr] } }
        ]
      });

      let phraseUpdates = 0;
      let totalApprovedSecs = 0;
      let totalApprovedPayout = 0;

      for (const p of approvedPhrases) {
        const dur = p.duration || 0;
        totalApprovedSecs += dur;
        const calcPayout = Math.round((dur / 3600) * hourlyPhrase * 100) / 100;
        p.qaPhrasePayoutUsd = calcPayout;
        await Phrase.updateOne({ _id: p._id }, { $set: { qaPhrasePayoutUsd: calcPayout } });
        phraseUpdates++;
        totalApprovedPayout += calcPayout;
      }

      const rejectedPhrases = await PhraseRejection.find({
        $or: [
          { qaId: { $in: [userIdObj, uIdStr] } },
          { "firstQaReview.qaId": { $in: [userIdObj, uIdStr] } }
        ]
      });

      let rejectionUpdates = 0;
      let totalRejectedSecs = 0;
      let totalRejectedPayout = 0;

      for (const r of rejectedPhrases) {
        const dur = r.duration || 0;
        totalRejectedSecs += dur;
        const calcPayout = Math.round((dur / 3600) * hourlyPhrase * 100) / 100;
        await PhraseRejection.updateOne({ _id: r._id }, { $set: { qaPhrasePayoutUsd: calcPayout } });
        rejectionUpdates++;
        totalRejectedPayout += calcPayout;
      }

      // Calculate paid out payments
      const payments = await PayoutPayment.find({ userId: u._id }).lean();
      const totalPaidOutUsd = Math.round(payments.reduce((sum, p) => sum + (Number(p.amountUsd) || 0), 0) * 100) / 100;

      const totalEarningsUsd = Math.round((totalApprovedPayout + totalRejectedPayout) * 100) / 100;
      const totalRemainingUsd = Math.max(0, Math.round((totalEarningsUsd - totalPaidOutUsd) * 100) / 100);
      const totalSecs = totalApprovedSecs + totalRejectedSecs;
      const totalHours = Math.round((totalSecs / 3600) * 10000) / 10000;

      console.log(`\n--- Summary for ${u.firstname} ${u.lastname} (${u.email}) ---`);
      console.log(`Hourly Rate: $${hourlyPhrase}/hr`);
      console.log(`Phrases Reviewed: ${phraseUpdates + rejectionUpdates} phrases (${totalSecs}s / ${totalHours}h)`);
      console.log(`Total Phrase Earnings: $${totalEarningsUsd.toFixed(2)}`);
      console.log(`Total Paid Out: $${totalPaidOutUsd.toFixed(2)}`);
      console.log(`Net Remaining Payout: $${totalRemainingUsd.toFixed(2)}\n`);
    }

    console.log("Repair & Backfill completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Error during QA repair:", err);
    process.exit(1);
  }
}

runRepair();
