import { CallSession } from "../models/CallSession.js";
import { PayoutPayment } from "../models/PayoutPayment.js";
import { User } from "../models/User.js";

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

function createSummary(user, callEntries, payments) {
  const stats = {
    totalCallsMade: callEntries.length,
    totalApprovedCalls: 0,
    pendingCalls: 0,
    rejectedCalls: 0,
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

export async function getPayoutOverview(userIds = null) {
  const users = await loadUsers(userIds);
  const validUsers = users.filter(isRegularUser);
  if (validUsers.length === 0) {
    return { summaries: [], callsByUserId: {}, paymentsByUserId: {} };
  }

  const ids = validUsers.map((user) => String(user._id));
  const [calls, payments] = await Promise.all([
    loadCallsForUsers(ids),
    loadPaymentsForUsers(ids),
  ]);

  const callsByUserId = Object.fromEntries(ids.map((id) => [id, []]));
  for (const call of calls) {
    for (const userId of ids) {
      const entry = getCallEntryForUser(call, userId);
      if (entry) callsByUserId[userId].push(entry);
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

  const summaries = validUsers.map((user) => createSummary(user, callsByUserId[String(user._id)] || [], paymentsByUserId[String(user._id)] || []));
  return { summaries, callsByUserId, paymentsByUserId };
}

export async function getSingleUserPayout(userId) {
  const { summaries, callsByUserId, paymentsByUserId } = await getPayoutOverview([userId]);
  if (!summaries.length) return null;
  const summary = summaries[0];
  const normalizedUserId = String(summary.user.id);
  return {
    summary,
    calls: callsByUserId[normalizedUserId] || [],
    payments: paymentsByUserId[normalizedUserId] || [],
  };
}
