import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AdminNav from "../components/AdminNav.jsx";
import { apiGet, apiPostJson } from "../lib/api.js";

function money(value) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

export default function AdminPayoutUser() {
  const { userId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showPayModal, setShowPayModal] = useState(false);
  const [amountUsd, setAmountUsd] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const res = await apiGet(`/api/admin/payouts/users/${userId}`);
      setData(res);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [userId]);

  async function submitPayment() {
    const amount = Number(amountUsd);
    const remaining = Number(data?.summary?.totalRemainingPayoutUsd) || 0;
    if (!Number.isFinite(amount) || amount <= 0) return setError("Enter a valid payout amount.");
    if (amount > remaining) return setError("Amount cannot exceed remaining payout.");

    try {
      setSaving(true);
      const res = await apiPostJson(`/api/admin/payouts/users/${userId}/payments`, { amountUsd: amount, note });
      setData(res);
      setShowPayModal(false);
      setAmountUsd("");
      setNote("");
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const summary = data?.summary;

  return (
    <div className="min-h-screen bg-neutral-900 pt-16 md:pt-0 md:pl-64">
      <AdminNav />
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <Link to="/admin/payouts" className="text-warning-400 text-sm hover:text-warning-300">← Back to payouts</Link>
            <h1 className="text-2xl md:text-3xl font-bold text-white mt-2">
              {summary ? `${summary.user.firstname || ""} ${summary.user.lastname || ""}`.trim() || summary.user.username : "User Payouts"}
            </h1>
            {summary && <p className="text-neutral-400">{summary.user.email}</p>}
          </div>
          {summary && (
            <button
              onClick={() => setShowPayModal(true)}
              className="px-4 py-2.5 rounded-lg bg-warning-600 hover:bg-warning-700 text-white font-semibold"
            >
              Pay Now
            </button>
          )}
        </div>

        {error && <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg">{error}</div>}

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-12 h-12 border-4 border-warning-200 border-t-warning-500 rounded-full animate-spin" /></div>
        ) : summary ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-neutral-800 border border-neutral-700 rounded-2xl p-5">
                <div className="text-sm text-neutral-400 mb-1">Total Earned</div>
                <div className="text-3xl font-bold text-white">{money(summary.totalMoneyMadeUsd)}</div>
                <div className="text-xs text-neutral-500 mt-2">{summary.totalApprovedCalls} approved calls, {summary.totalApprovedPhrases} approved phrases</div>
              </div>
              <div className="bg-neutral-800 border border-neutral-700 rounded-2xl p-5">
                <div className="text-sm text-neutral-400 mb-1">Paid Out</div>
                <div className="text-3xl font-bold text-white">{money(summary.totalPaidOutUsd)}</div>
                <div className="text-xs text-neutral-500 mt-2">{data.payments.length} payout records</div>
              </div>
              <div className="bg-neutral-800 border border-neutral-700 rounded-2xl p-5">
                <div className="text-sm text-neutral-400 mb-1">Remaining</div>
                <div className="text-3xl font-bold text-warning-300">{money(summary.totalRemainingPayoutUsd)}</div>
                <div className="text-xs text-neutral-500 mt-2">{summary.pendingCalls + summary.pendingPhrases} pending, {summary.rejectedCalls + summary.rejectedPhrases} rejected</div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.9fr] gap-6">
              <div className="bg-neutral-800 border border-neutral-700 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-neutral-700">
                  <h2 className="text-lg font-bold text-white">Call Payout Activity</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-700">
                      <tr>
                        {["Date", "Peer", "Topic", "Language", "Status", "Minutes", "Payout"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-neutral-300 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-700">
                      {data.calls.map((call) => (
                        <tr key={call.callId} className="hover:bg-neutral-700/40 transition-colors">
                          <td className="px-4 py-3 text-neutral-300 whitespace-nowrap">{formatDate(call.startedAt)}</td>
                          <td className="px-4 py-3 text-white">{call.peer?.username || "-"}</td>
                          <td className="px-4 py-3 text-neutral-300">{call.topic}</td>
                          <td className="px-4 py-3 text-neutral-300 capitalize">{call.language || "-"}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${call.status === "approved" ? "bg-green-900/50 text-green-300" : call.status === "rejected" ? "bg-red-900/50 text-red-300" : "bg-yellow-900/50 text-yellow-300"}`}>
                              {call.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-neutral-300">{call.durationMinutes?.toFixed?.(2) || "0.00"}</td>
                          <td className="px-4 py-3 text-white font-semibold">{money(call.payoutUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!data.calls.length && <div className="text-center py-6 text-neutral-500">No payout calls found.</div>}

                {/* Phrase Payout Activity */}
                <div className="px-5 py-4 border-t border-b border-neutral-700 bg-neutral-800">
                  <h2 className="text-lg font-bold text-white">Phrase Payout Activity</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-700">
                      <tr>
                        {["Date", "Phrase", "Language", "Status", "Duration (s)", "Payout"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-neutral-300 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-700">
                      {(data.phrases || []).map((phrase) => (
                        <tr key={phrase.phraseId} className="hover:bg-neutral-700/40 transition-colors">
                          <td className="px-4 py-3 text-neutral-300 whitespace-nowrap">{formatDate(phrase.recordedAt)}</td>
                          <td className="px-4 py-3 text-white truncate max-w-[200px]" title={phrase.text}>{phrase.text}</td>
                          <td className="px-4 py-3 text-neutral-300 capitalize">{phrase.language || "-"}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${phrase.status === "approved" ? "bg-green-900/50 text-green-300" : phrase.status === "rejected" ? "bg-red-900/50 text-red-300" : "bg-yellow-900/50 text-yellow-300"}`}>
                              {phrase.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-neutral-300">{phrase.duration?.toFixed?.(2) || "0.00"}</td>
                          <td className="px-4 py-3 text-white font-semibold">{money(phrase.payoutUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(!data.phrases || !data.phrases.length) && <div className="text-center py-6 text-neutral-500">No payout phrases found.</div>}
              </div>

              <div className="bg-neutral-800 border border-neutral-700 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-neutral-700">
                  <h2 className="text-lg font-bold text-white">Payment History</h2>
                </div>
                <div className="divide-y divide-neutral-700">
                  {data.payments.map((payment) => (
                    <div key={payment.id} className="px-5 py-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-white font-semibold">{money(payment.amountUsd)}</div>
                          <div className="text-xs text-neutral-400">{formatDate(payment.paidAt)}</div>
                        </div>
                        <div className="text-xs text-neutral-500 text-right">
                          {payment.createdBy ? `${payment.createdBy.firstname || ""} ${payment.createdBy.lastname || ""}`.trim() || payment.createdBy.email : "Admin"}
                        </div>
                      </div>
                      {payment.note && <div className="mt-2 text-sm text-neutral-300">{payment.note}</div>}
                    </div>
                  ))}
                  {!data.payments.length && <div className="text-center py-16 text-neutral-500">No payout records yet.</div>}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {showPayModal && summary && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-neutral-800 border border-neutral-700 rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="text-xl font-bold text-white">Confirm Payout</h2>
              <p className="text-sm text-neutral-400 mt-1">Remaining balance: {money(summary.totalRemainingPayoutUsd)}</p>
            </div>
            <div>
              <label className="block text-sm text-neutral-300 mb-1.5">Amount (USD)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amountUsd}
                onChange={(e) => setAmountUsd(e.target.value)}
                className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-neutral-300 mb-1.5">Note</label>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-white resize-none"
                placeholder="Optional payout note"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowPayModal(false)} className="flex-1 px-4 py-2.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white">Cancel</button>
              <button onClick={submitPayment} disabled={saving} className="flex-1 px-4 py-2.5 rounded-lg bg-warning-600 hover:bg-warning-700 text-white font-semibold disabled:opacity-50">
                {saving ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
