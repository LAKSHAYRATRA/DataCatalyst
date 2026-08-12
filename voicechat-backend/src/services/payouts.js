import mongoose from "mongoose";
import { CallSession } from "../models/CallSession.js";
import { PayoutPayment } from "../models/PayoutPayment.js";
import { User } from "../models/User.js";
import { Phrase } from "../models/Phrase.js";
import { PhraseRejection } from "../models/PhraseRejection.js";
import { Language } from "../models/Language.js";
import { Project } from "../models/Project.js";
import { Company } from "../models/Company.js";

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function isRegularUser(user, isSingleUserCheck = false) {
  if (isSingleUserCheck) return !!user;
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

  const canonicalMin = (call.actualCallDuration && Number(call.actualCallDuration) > 0)
    ? Math.round((Number(call.actualCallDuration) / 60) * 100) / 100
    : 0;

  if (String(call.userA?._id || call.userA) === normalizedUserId) {
    me = call.userA;
    peer = call.userB;
    status = call.recordingAStatus || "pending";
    payoutUsd = Number(call.recordingAPayoutUsd) || 0;
    durationMinutes = canonicalMin || Number(call.recordingADurationMinutes) || 0;
    reviewNote = call.recordingAReviewNote || call.reviewNotes || null;
  } else if (String(call.userB?._id || call.userB) === normalizedUserId) {
    me = call.userB;
    peer = call.userA;
    status = call.recordingBStatus || "pending";
    payoutUsd = Number(call.recordingBPayoutUsd) || 0;
    durationMinutes = canonicalMin || Number(call.recordingBDurationMinutes) || 0;
    reviewNote = call.recordingBReviewNote || call.reviewNotes || null;
  } else {
    return null;
  }

  const reviewedByObj = call.reviewedBy ? {
    id: String(call.reviewedBy._id || call.reviewedBy),
    name: `${call.reviewedBy.firstname || ""} ${call.reviewedBy.lastname || ""}`.trim() || call.reviewedBy.username || "QA Reviewer",
    email: call.reviewedBy.email || null,
  } : null;

  return {
    callId: call.callId,
    startedAt: call.startedAt || null,
    endedAt: call.endedAt || null,
    language: call.language || null,
    topic: call.topicId?.title || "-",
    subtopic: call.subtopicId?.title || "-",
    peer: peer ? {
      id: String(peer._id || peer),
      username: peer.username || `${peer.firstname || ""} ${peer.lastname || ""}`.trim() || "Unknown",
      email: peer.email || null,
    } : null,
    status,
    payoutUsd: roundCurrency(payoutUsd),
    durationMinutes: roundCurrency(durationMinutes),
    reviewNote,
    reviewedBy: reviewedByObj,
    reviewedAt: call.reviewedAt || null,
    paidOut: false,
  };
}

function createSummary(user, callEntries, phraseEntries, payments, qaEarningsUsd = 0) {
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
    totalPendingEstimatedUsd: 0,
    totalPaidOutUsd: 0,
    totalRemainingPayoutUsd: 0,
  };

  let pendingUsd = 0;

  for (const entry of callEntries) {
    if (entry.status === "approved") {
      stats.totalApprovedCalls += 1;
      stats.totalMoneyMadeUsd += Number(entry.payoutUsd) || 0;
    } else if (entry.status === "rejected") {
      stats.rejectedCalls += 1;
    } else {
      stats.pendingCalls += 1;
      pendingUsd += Number(entry.payoutUsd) || 0;
    }
  }

  for (const phrase of phraseEntries) {
    if (phrase.status === "approved") {
      stats.totalApprovedPhrases += 1;
      stats.totalMoneyMadeUsd += Number(phrase.payoutUsd) || 0;
    } else if (phrase.status === "rejected") {
      stats.rejectedPhrases += 1;
    } else {
      stats.pendingPhrases += 1;
      pendingUsd += Number(phrase.payoutUsd) || 0;
    }
  }

  stats.totalMoneyMadeUsd += Number(qaEarningsUsd) || 0;

  for (const payment of payments) {
    stats.totalPaidOutUsd += Number(payment.amountUsd) || 0;
  }

  stats.totalMoneyMadeUsd = roundCurrency(stats.totalMoneyMadeUsd);
  stats.totalPendingEstimatedUsd = roundCurrency(pendingUsd);
  stats.totalPaidOutUsd = roundCurrency(stats.totalPaidOutUsd);
  stats.totalRemainingPayoutUsd = roundCurrency(Math.max(0, stats.totalMoneyMadeUsd - stats.totalPaidOutUsd));

  return {
    user: {
      id: String(user._id),
      firstname: user.firstname,
      lastname: user.lastname,
      username: user.username,
      email: user.email,
      upiId: user.upiId || null,
    },
    ...stats,
  };
}

async function loadUsers(userIds) {
  const filter = {};
  if (userIds?.length) {
    filter._id = { $in: userIds };
  } else {
    filter.isAdmin = false;
    filter.isQA = false;
  }
  return User.find(filter)
    .select("firstname lastname username email upiId speaker_id isAdmin isQA qaPerCallPayrateUsd qaHourlyPhrasePayrateUsd perCallPayrate hourlyPhrasePayrate")
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
    .populate("subtopicId", "title")
    .populate("reviewedBy", "firstname lastname username email")
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

  const phraseQuery = { contributorId: { $in: ids } };

  const activePhrases = await Phrase.find(phraseQuery)
    .populate("qaId", "firstname lastname username email")
    .sort({ recordedAt: -1, createdAt: -1 })
    .lean();

  const rejectionQuery = { contributorId: { $in: ids } };

  const rejections = await PhraseRejection.find(rejectionQuery)
    .populate("qaId", "firstname lastname username email")
    .sort({ rejectedAt: -1, createdAt: -1 })
    .lean();

  const rejectionItems = await Promise.all(rejections.map(async (r) => {
    let text = r.text;
    if (!text) {
      const orig = await Phrase.findOne({ phraseId: r.phraseId }).select("text").lean();
      text = orig?.text || "Phrase Recording";
    }
    return {
      _id: r._id,
      phraseId: r.phraseId,
      companyId: r.companyId,
      language: r.language,
      contributorId: r.contributorId,
      qaId: r.qaId,
      status: "rejected",
      duration: r.duration || 0,
      recordedAt: r.rejectedAt || r.createdAt,
      rejectedAt: r.rejectedAt || r.createdAt,
      qaComment: r.comment,
      comment: r.comment,
      text
    };
  }));

  return [...activePhrases, ...rejectionItems].sort((a, b) => new Date(b.recordedAt || b.createdAt || 0) - new Date(a.recordedAt || a.createdAt || 0));
}

async function loadQaEarningsForUsers(userIds, userMap) {
  const qaEarningsByUserId = Object.fromEntries(userIds.map((id) => [String(id), 0]));
  
  await Promise.all(
    userIds.map(async (rawId) => {
      const uIdStr = String(rawId);
      const user = userMap[uIdStr];
      if (!user) return;

      const userIdObj = new mongoose.Types.ObjectId(uIdStr);
      const perCallRate = Number((user.qaPerCallPayrateUsd !== undefined && user.qaPerCallPayrateUsd !== null && user.qaPerCallPayrateUsd > 0) ? user.qaPerCallPayrateUsd : user.perCallPayrate) || 0;
      const hourlyPhraseRate = Number((user.qaHourlyPhrasePayrateUsd !== undefined && user.qaHourlyPhrasePayrateUsd !== null && user.qaHourlyPhrasePayrateUsd > 0) ? user.qaHourlyPhrasePayrateUsd : user.hourlyPhraseRate) || 0;

      const [callsAgg, approvedAgg, rejectedAgg] = await Promise.all([
        CallSession.aggregate([
          {
            $match: {
              $or: [
                { reviewedBy: { $in: [userIdObj, uIdStr] } },
                { "firstQaReview.qaId": { $in: [userIdObj, uIdStr] } }
              ],
              callStatus: { $in: ["approved", "rejected"] }
            }
          },
          {
            $project: {
              payout: {
                $ifNull: ["$qaCallPayoutUsd", perCallRate]
              }
            }
          },
          { $group: { _id: null, total: { $sum: "$payout" } } }
        ]),
        Phrase.aggregate([
          {
            $match: {
              status: "approved",
              $or: [
                { qaId: { $in: [userIdObj, uIdStr] } },
                { "firstQaReview.qaId": { $in: [userIdObj, uIdStr] } },
                { editedBy: { $in: [userIdObj, uIdStr] } }
              ]
            }
          },
          {
            $project: {
              payout: {
                $ifNull: [
                  "$qaPhrasePayoutUsd",
                  { $multiply: [{ $divide: [{ $ifNull: ["$duration", 0] }, 3600] }, hourlyPhraseRate] }
                ]
              }
            }
          },
          { $group: { _id: null, total: { $sum: "$payout" } } }
        ]),
        PhraseRejection.aggregate([
          {
            $match: {
              $or: [
                { qaId: { $in: [userIdObj, uIdStr] } },
                { "firstQaReview.qaId": { $in: [userIdObj, uIdStr] } }
              ]
            }
          },
          {
            $project: {
              payout: {
                $ifNull: [
                  "$qaPhrasePayoutUsd",
                  { $multiply: [{ $divide: [{ $ifNull: ["$duration", 0] }, 3600] }, hourlyPhraseRate] }
                ]
              }
            }
          },
          { $group: { _id: null, total: { $sum: "$payout" } } }
        ])
      ]);

      const callEarnings = callsAgg[0]?.total || 0;
      const approvedEarnings = approvedAgg[0]?.total || 0;
      const rejectedEarnings = rejectedAgg[0]?.total || 0;

      qaEarningsByUserId[uIdStr] = roundCurrency(callEarnings + approvedEarnings + rejectedEarnings);
    })
  );

  return qaEarningsByUserId;
}

export async function getPayoutOverview(userIds = null) {
  const isSingleUserCheck = Array.isArray(userIds) && userIds.length > 0;
  const users = await loadUsers(userIds);
  const validUsers = users.filter(u => isRegularUser(u, isSingleUserCheck));
  if (validUsers.length === 0) {
    return { summaries: [], callsByUserId: {}, phrasesByUserId: {}, paymentsByUserId: {}, userMap: {} };
  }

  const ids = validUsers.map((user) => String(user._id));
  const userMap = Object.fromEntries(validUsers.map(u => [String(u._id), u]));
  const [calls, payments, phrases, langs, projects, companies, qaEarningsByUserId] = await Promise.all([
    loadCallsForUsers(ids),
    loadPaymentsForUsers(ids),
    loadPhrasesForUsers(ids),
    Language.find({}).lean(),
    Project.find({}).lean(),
    Company.find({}).lean(),
    loadQaEarningsForUsers(ids, userMap)
  ]);

  const langRates = Object.fromEntries(langs.map(l => [l.code.toLowerCase(), Number(l.hourlyPayout) || 0]));

  const callsByUserId = Object.fromEntries(ids.map((id) => [id, []]));

  for (const call of calls) {
    for (const userId of ids) {
      const entry = getCallEntryForUser(call, userId);
      if (entry) callsByUserId[userId].push(entry);
    }
  }

  const userLookupMap = new Map();
  for (const u of validUsers) {
    const uId = String(u._id);
    userLookupMap.set(uId, uId);
  }

  const phrasesByUserId = Object.fromEntries(ids.map((id) => [id, []]));

  for (const phrase of phrases) {
    let targetKey = null;
    if (phrase.contributorId && userLookupMap.has(String(phrase.contributorId))) {
      targetKey = userLookupMap.get(String(phrase.contributorId));
    }

    if (targetKey && phrasesByUserId[targetKey]) {
      let rate = langRates[String(phrase.language || "").toLowerCase()] || 0;
      
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
      if (phrase.duration && rate > 0) {
        phrasePayout = (phrase.duration / 3600) * rate;
        if (phrasePayout > 0) {
          phrasePayout = Math.max(0.01, roundCurrency(phrasePayout));
        }
      }

      const reviewedByObj = phrase.qaId ? {
        id: String(phrase.qaId._id || phrase.qaId),
        name: `${phrase.qaId.firstname || ""} ${phrase.qaId.lastname || ""}`.trim() || phrase.qaId.username || "QA Reviewer",
        email: phrase.qaId.email || null,
      } : null;

      phrasesByUserId[targetKey].push({
        phraseId: phrase.phraseId,
        text: phrase.text,
        language: phrase.language,
        status: phrase.status,
        companyId: phrase.companyId || null,
        projectName: phrase.projectName || null,
        duration: phrase.duration || 0,
        recordedAt: phrase.recordedAt || phrase.createdAt,
        payoutUsd: roundCurrency(phrasePayout),
        qaComment: phrase.qaComment || phrase.comment || null,
        reviewedAt: phrase.reviewedAt || phrase.rejectedAt || null,
        reviewedBy: reviewedByObj
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
    paymentsByUserId[String(user._id)] || [],
    qaEarningsByUserId[String(user._id)] || 0
  ));
  return { summaries, callsByUserId, phrasesByUserId, paymentsByUserId, userMap };
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

export async function getFinancesOverview() {
  const { summaries, callsByUserId, phrasesByUserId, userMap } = await getPayoutOverview();
  const companies = await Company.find({}).lean();
  const projects = await Project.find({}).lean();

  const companyMap = new Map();
  for (const c of companies) {
    companyMap.set(c.name, c);
    companyMap.set(c.name.replace("_downloaded", ""), c);
  }

  const overall = {
    totalPendingPayoutUsd: 0,
    totalEarnedUsd: 0,
    totalPaidOutUsd: 0,
    totalContributorsCount: summaries.length,
    pendingContributorsCount: 0
  };

  for (const s of summaries) {
    overall.totalPendingPayoutUsd += s.totalRemainingPayoutUsd;
    overall.totalEarnedUsd += s.totalMoneyMadeUsd;
    overall.totalPaidOutUsd += s.totalPaidOutUsd;
    if (s.totalRemainingPayoutUsd > 0) {
      overall.pendingContributorsCount += 1;
    }
  }

  overall.totalPendingPayoutUsd = roundCurrency(overall.totalPendingPayoutUsd);
  overall.totalEarnedUsd = roundCurrency(overall.totalEarnedUsd);
  overall.totalPaidOutUsd = roundCurrency(overall.totalPaidOutUsd);

  // Group by project / company
  const projectMap = new Map(); // key -> project object

  const getOrCreateProject = (key, defaultTitle, defaultHourly = 0, type = "phrase") => {
    if (!projectMap.has(key)) {
      projectMap.set(key, {
        id: key,
        displayName: defaultTitle,
        type,
        hourlyPayout: defaultHourly,
        approvedCount: 0,
        totalEarnedUsd: 0,
        totalPendingUsd: 0,
        contributorsMap: new Map() // userId -> contribObj
      });
    }
    return projectMap.get(key);
  };

  // 1. Process Phrases per user
  for (const [userId, userPhrases] of Object.entries(phrasesByUserId)) {
    const summary = summaries.find(s => String(s.user.id) === String(userId));
    const userDoc = userMap[userId] || summary?.user;

    for (const p of userPhrases) {
      if (p.status !== "approved") continue;

      const compKey = p.companyId ? String(p.companyId).replace("_downloaded", "").trim() : (p.projectName || "General Phrases");
      const compDoc = companyMap.get(compKey);
      const displayName = compDoc?.projectName || compDoc?.name || p.projectName || compKey;
      const hourlyPayout = compDoc?.hourlyPayout || 0;

      const proj = getOrCreateProject(compKey, displayName, hourlyPayout, "phrase");
      proj.approvedCount += 1;
      proj.totalEarnedUsd += p.payoutUsd;

      if (!proj.contributorsMap.has(userId)) {
        proj.contributorsMap.set(userId, {
          id: userId,
          name: `${userDoc?.firstname || summary?.user?.firstname || ""} ${userDoc?.lastname || summary?.user?.lastname || ""}`.trim() || userDoc?.username || summary?.user?.username,
          username: userDoc?.username || summary?.user?.username,
          email: userDoc?.email || summary?.user?.email,
          speaker_id: userDoc?.speaker_id || null,
          upiId: userDoc?.upiId || null,
          approvedPhrases: 0,
          approvedCalls: 0,
          earnedUsd: 0,
          userTotalPendingUsd: summary?.totalRemainingPayoutUsd || 0
        });
      }
      const cObj = proj.contributorsMap.get(userId);
      cObj.approvedPhrases += 1;
      cObj.earnedUsd += p.payoutUsd;
    }
  }

  // 2. Process Calls per user
  for (const [userId, userCalls] of Object.entries(callsByUserId)) {
    const summary = summaries.find(s => String(s.user.id) === String(userId));
    const userDoc = userMap[userId] || summary?.user;

    for (const c of userCalls) {
      if (c.status !== "approved") continue;

      const projKey = "Calls & Audio Conversations";
      const proj = getOrCreateProject(projKey, "Call Conversations", 0, "call");
      proj.approvedCount += 1;
      proj.totalEarnedUsd += c.payoutUsd;

      if (!proj.contributorsMap.has(userId)) {
        proj.contributorsMap.set(userId, {
          id: userId,
          name: `${userDoc?.firstname || summary?.user?.firstname || ""} ${userDoc?.lastname || summary?.user?.lastname || ""}`.trim() || userDoc?.username || summary?.user?.username,
          username: userDoc?.username || summary?.user?.username,
          email: userDoc?.email || summary?.user?.email,
          speaker_id: userDoc?.speaker_id || null,
          upiId: userDoc?.upiId || null,
          approvedPhrases: 0,
          approvedCalls: 0,
          earnedUsd: 0,
          userTotalPendingUsd: summary?.totalRemainingPayoutUsd || 0
        });
      }
      const cObj = proj.contributorsMap.get(userId);
      cObj.approvedCalls += 1;
      cObj.earnedUsd += c.payoutUsd;
    }
  }

  // Finalize project stats
  const projectList = [];
  for (const proj of projectMap.values()) {
    proj.totalEarnedUsd = roundCurrency(proj.totalEarnedUsd);
    
    const contribList = Array.from(proj.contributorsMap.values()).map(c => {
      c.earnedUsd = roundCurrency(c.earnedUsd);
      return c;
    });

    // Project pending calculation: proportional ratio or user remaining payout
    proj.totalPendingUsd = proj.totalEarnedUsd;
    proj.contributorsCount = contribList.length;
    proj.contributors = contribList.sort((a, b) => b.earnedUsd - a.earnedUsd);
    projectList.push(proj);
  }

  projectList.sort((a, b) => b.totalEarnedUsd - a.totalEarnedUsd);

  // Format contributors list with upiId and speaker_id
  const contributorsList = summaries.map(s => {
    const u = userMap[s.user.id];
    return {
      ...s,
      user: {
        ...s.user,
        speaker_id: u?.speaker_id || null,
        upiId: u?.upiId || null
      }
    };
  }).sort((a, b) => b.totalRemainingPayoutUsd - a.totalRemainingPayoutUsd);

  return {
    overall,
    projects: projectList,
    contributors: contributorsList
  };
}

