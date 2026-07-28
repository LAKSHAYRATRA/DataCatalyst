import { User } from "../models/User.js";
import { Language } from "../models/Language.js";
import { CallSession } from "../models/CallSession.js";

export async function updateLimitAndBlacklist(userId, languageCode, isApproved) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      console.warn(`[LimitService] User ${userId} not found`);
      return;
    }

    const lang = await Language.findOne({ code: languageCode.toLowerCase() });
    const maxDailyLimit = lang ? (lang.maxDailyCallLimit ?? 5) : 5;

    const oldLimit = user.dailyCallLimit;

    if (isApproved) {
      if (user.dailyCallLimit < maxDailyLimit) {
        user.dailyCallLimit += 1;
      }
    } else {
      if (user.dailyCallLimit > 0) {
        user.dailyCallLimit -= 1;
      }
    }

    await user.save();
    console.log(`[LimitService] Updated user ${user.username} call limit from ${oldLimit} to ${user.dailyCallLimit}`);

    // Blacklisting check: if limit is 1, and this decision was a rejection
    if (user.dailyCallLimit === 1 && !isApproved) {
      const userCalls = await CallSession.find({
        $or: [
          { userA: userId, recordingAStatus: { $in: ["approved", "rejected"] } },
          { userB: userId, recordingBStatus: { $in: ["approved", "rejected"] } }
        ]
      })
      .sort({ endedAt: -1 })
      .limit(3);

      let consecutiveRejections = 0;
      for (const call of userCalls) {
        const isUserA = String(call.userA) === String(userId);
        const status = isUserA ? call.recordingAStatus : call.recordingBStatus;
        if (status === "rejected") {
          consecutiveRejections++;
        } else if (status === "approved") {
          break; // broke consecutive chain
        }
      }

      if (consecutiveRejections >= 3) {
        const app = user.languageApplications.find(
          a => a.languageCode.toLowerCase() === languageCode.toLowerCase() && a.applicationType === "call"
        );
        if (app) {
          app.status = "blacklisted";
          await user.save();
          console.log(`[Blacklist] User ${user.username} blacklisted from calls for language: ${languageCode}`);
        }
      }
    }
  } catch (err) {
    console.error("[LimitService] Error updating limit or blacklisting:", err);
  }
}
