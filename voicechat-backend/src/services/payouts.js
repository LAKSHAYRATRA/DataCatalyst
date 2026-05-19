import { CallSession } from "../models/CallSession.js";
import { PayoutPayment } from "../models/PayoutPayment.js";
import { User } from "../models/User.js";
import { Phrase } from "../models/Phrase.js";
import { Language } from "../models/Language.js";
import { Project } from "../models/Project.js";
import { Company } from "../models/Company.js";

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function isRegularUser(user) {
  return user && !user.isAdmin && !user.isQA;
}

function getCallEntryForUser(call, userId) {
  const normalizedUserId = String(userId);
  let me;
  let peer;
  let status;
  let payoutUsd;
  let durationMinutes;
  let reviewNote;

  if (String(call.userA?._id || call.userA) === normalizedUserId) {
    me = call.userA;
    peer = call.userB;
    status = call.recordingAStatus || "pending";
    payoutUsd = Number(call.recordingAPayoutUsd) || 0;
    durationMinutes = Number(call.recordingADurationMinutes) || 0;
    reviewNote = call.recordingAReviewNote || null;
  } else if (String(call.userB?._id || call.userB) === normalizedUserId) {
    me = call.userB;
    peer = call.userA;
    status = call.recordingBStatus || "pending";
    payoutUsd = Number(call.recordingBPayoutUsd) || 0;
    durationMinutes = Number(call.recordingBDurationMinutes) || 0;
    reviewNote = call.recordingBReviewNote || null;
  } else {
    return null;
  }

  return {
    callId: call.callId,
    startedAt: call.startedAt || null,
    endedAt: call.endedAt || null,
    language: call.language || null,
    topic: call.topicId?.title || "-",
    peer: peer ? {
      id: String(peer._id || peer),
      username: peer.username || `${peer.firstname || ""} ${peer.lastname || ""}`.trim() || "Unknown",
      email: peer.email || null,
    } : null,
    status,
    payoutUsd: roundCurrency(payoutUsd),
    durationMinutes: roundCurrency(durationMinutes),
    reviewNote,
    paidOut: false,
  };
}

function createSummary(user, callEntries, phraseEntries, payments) {
  const stats = {
    totalCallsMade: callEntries.length,
    totalApprovedCalls: 0,
    pendingCalls: 0,
    rejectedCalls: 0,
    totalPhrasesRecorded: phraseEntries.length,
    totalApprovedPhrases: 0,
    pendingPhrases: 0,
    rejectedPhrases: 0,
    totalMoneyMadeUsd: 0,
    totalPaidOutUsd: 0,
    totalRemainingPayoutUsd: 0,
  };

  for (const entry of callEntries) {
    if (entry.status === "approved") stats.totalApprovedCalls += 1;
    else if (entry.status === "rejected") stats.rejectedCalls += 1;
    else stats.pendingCalls += 1;
    stats.totalMoneyMadeUsd += Number(entry.payoutUsd) || 0;
  }

  for (const phrase of phraseEntries) {
    if (phrase.status === "approved") stats.totalApprovedPhrases += 1;
    else if (phrase.status === "rejected") stats.rejectedPhrases += 1;
    else stats.pendingPhrases += 1;
    stats.totalMoneyMadeUsd += Number(phrase.payoutUsd) || 0;
  }

  for (const payment of payments) {
    stats.totalPaidOutUsd += Number(payment.amountUsd) || 0;
  }

  stats.totalMoneyMadeUsd = roundCurrency(stats.totalMoneyMadeUsd);
  stats.totalPaidOutUsd = roundCurrency(stats.totalPaidOutUsd);
  stats.totalRemainingPayoutUsd = roundCurrency(Math.max(0, stats.totalMoneyMadeUsd - stats.totalPaidOutUsd));

  return {
    user: {
      id: String(user._id),
      firstname: user.firstname,
      lastname: user.lastname,
      username: user.username,
      email: user.email,
    },
    ...stats,
  };
}

async function loadUsers(userIds) {
  const filter = { isAdmin: false, isQA: false };
  if (userIds?.length) filter._id = { $in: userIds };
  return User.find(filter)
    .select("firstname lastname username email isAdmin isQA")
    .sort({ firstname: 1, lastname: 1, email: 1 })
    .lean();
}

async function loadCallsForUsers(userIds) {
  const ids = userIds.map((id) => String(id));
  return CallSession.find({
    callActuallyStarted: true,
    $or: [{ userA: { $in: ids } }, { userB: { $in: ids } }],
  })
    .populate("userA", "firstname lastname username email")
    .populate("userB", "firstname lastname username email")
    .populate("topicId", "title")
    .sort({ startedAt: -1 })
    .lean();
}

async function loadPaymentsForUsers(userIds) {
  return PayoutPayment.find({ userId: { $in: userIds } })
    .populate("createdBy", "firstname lastname email")
    .sort({ paidAt: -1, createdAt: -1 })
    .lean();
}

async function loadPhrasesForUsers(userIds) {
  const ids = userIds.map((id) => String(id));
  return Phrase.find({ contributorId: { $in: ids } })
    .sort({ recordedAt: -1 })
    .lean();
}

export async function getPayoutOverview(userIds = null) {
  const users = await loadUsers(userIds);
  const validUsers = users.filter(isRegularUser);
  if (validUsers.length === 0) {
    return { summaries: [], callsByUserId: {}, phrasesByUserId: {}, paymentsByUserId: {} };
  }

  const ids = validUsers.map((user) => String(user._id));
  const [calls, payments, phrases, langs, projects, companies] = await Promise.all([
    loadCallsForUsers(ids),
    loadPaymentsForUsers(ids),
    loadPhrasesForUsers(ids),
    Language.find({}).lean(),
    Project.find({}).lean(),
    Company.find({}).lean()
  ]);

  const langRates = Object.fromEntries(langs.map(l => [l.code.toLowerCase(), Number(l.hourlyPayout) || 0]));

  const callsByUserId = Object.fromEntries(ids.map((id) => [id, []]));
  for (const call of calls) {
    for (const userId of ids) {
      const entry = getCallEntryForUser(call, userId);
      if (entry) callsByUserId[userId].push(entry);
    }
  }

  const phrasesByUserId = Object.fromEntries(ids.map((id) => [id, []]));
  for (const phrase of phrases) {
    const key = String(phrase.contributorId);
    if (phrasesByUserId[key]) {
      let rate = langRates[String(phrase.language).toLowerCase()] || 0;
      
      // Check if project has a specific rate
      if (phrase.projectName) {
        const project = projects.find(p => p.name === phrase.projectName);
        if (project && project.languageRates) {
          const specificRate = project.languageRates.find(r => r.languageCode === phrase.language?.toLowerCase());
          if (specificRate) {
            rate = specificRate.hourlyPayout;
          }
        }
      }

      // Company rate overrides all other rates if set
      if (phrase.companyId) {
        // Strip _downloaded suffix if present to match the core company rate
        const coreCompanyId = String(phrase.companyId).replace("_downloaded", "").trim();
        const company = companies.find(c => c.name === phrase.companyId || c.name === coreCompanyId);
        if (company && company.hourlyPayout > 0) {
          rate = company.hourlyPayout;
        }
      }

      let phrasePayout = 0;
      if (phrase.status === "approved" && phrase.duration) {
         phrasePayout = (phrase.duration / 3600) * rate;
      }
      phrasesByUserId[key].push({
        phraseId: phrase.phraseId,
        text: phrase.text,
        language: phrase.language,
        status: phrase.status,
        duration: phrase.duration || 0,
        recordedAt: phrase.recordedAt,
        payoutUsd: roundCurrency(phrasePayout)
      });
    }
  }

  const paymentsByUserId = Object.fromEntries(ids.map((id) => [id, []]));
  for (const payment of payments) {
    const key = String(payment.userId);
    if (paymentsByUserId[key]) {
      paymentsByUserId[key].push({
        id: String(payment._id),
        amountUsd: roundCurrency(Number(payment.amountUsd) || 0),
        note: payment.note || null,
        paidAt: payment.paidAt,
        createdAt: payment.createdAt,
        createdBy: payment.createdBy ? {
          id: String(payment.createdBy._id),
          firstname: payment.createdBy.firstname,
          lastname: payment.createdBy.lastname,
          email: payment.createdBy.email,
        } : null,
      });
    }
  }

  const summaries = validUsers.map((user) => createSummary(
    user, 
    callsByUserId[String(user._id)] || [], 
    phrasesByUserId[String(user._id)] || [], 
    paymentsByUserId[String(user._id)] || []
  ));
  return { summaries, callsByUserId, phrasesByUserId, paymentsByUserId };
}

export async function getSingleUserPayout(userId) {
  const { summaries, callsByUserId, phrasesByUserId, paymentsByUserId } = await getPayoutOverview([userId]);
  if (!summaries.length) return null;
  const summary = summaries[0];
  const normalizedUserId = String(summary.user.id);
  return {
    summary,
    calls: callsByUserId[normalizedUserId] || [],
    phrases: phrasesByUserId[normalizedUserId] || [],
    payments: paymentsByUserId[normalizedUserId] || [],
  };
}
