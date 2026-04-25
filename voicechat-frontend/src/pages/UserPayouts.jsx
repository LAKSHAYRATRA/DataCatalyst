import React, { useEffect, useState } from "react";
import Nav from "../components/Nav.jsx";
import { apiGet } from "../lib/api.js";

function money(value) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

export default function UserPayouts() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("calls");

  useEffect(() => {
    (async () => {
      try {
        const res = await apiGet("/api/payouts/me");
        setData(res);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const summary = data?.summary;
  const rows = tab === "calls" ? (data?.calls || []) : tab === "phrases" ? (data?.phrases || []) : (data?.payments || []);

  return (
    <div className="min-h-screen bg-gradient-subtle pt-16 md:pt-0 md:pl-64">
      <Nav />
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12 space-y-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-2">Earnings</h1>
          <p className="text-neutral-600">See your approved earnings, paid amounts, and payout history.</p>
        </div>

        {loading ? (
          <div className="text-center py-16"><div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div></div>
        ) : error ? (
          <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-lg">{error}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="card">
                <div className="text-sm text-neutral-600 mb-1">Earned</div>
                <div className="text-3xl font-bold text-neutral-900">{money(summary?.totalMoneyMadeUsd)}</div>
                <div className="text-xs text-neutral-500 mt-2">From approved calls and phrases</div>
              </div>
              <div className="card">
                <div className="text-sm text-neutral-600 mb-1">Paid Out</div>
                <div className="text-3xl font-bold text-neutral-900">{money(summary?.totalPaidOutUsd)}</div>
                <div className="text-xs text-neutral-500 mt-2">{data?.payments?.length || 0} payout records</div>
              </div>
              <div className="card">
                <div className="text-sm text-neutral-600 mb-1">Remaining</div>
                <div className="text-3xl font-bold text-warning-700">{money(summary?.totalRemainingPayoutUsd)}</div>
                <div className="text-xs text-neutral-500 mt-2">{summary?.pendingCalls || 0} calls, {summary?.pendingPhrases || 0} phrases pending</div>
              </div>
            </div>

            <div className="card">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div className="inline-flex rounded-xl bg-neutral-100 p-1">
                  <button
                    onClick={() => setTab("calls")}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === "calls" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`}
                  >
                    Calls
                  </button>
                  <button
                    onClick={() => setTab("phrases")}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === "phrases" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`}
                  >
                    Phrases
                  </button>
                  <button
                    onClick={() => setTab("payments")}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === "payments" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`}
                  >
                    Payments
                  </button>
                </div>
                <div className="text-sm text-neutral-500">
                  {tab === "calls" ? `${data?.calls?.length || 0} calls` : tab === "phrases" ? `${data?.phrases?.length || 0} phrases` : `${data?.payments?.length || 0} payments`}
                </div>
              </div>

              {tab === "calls" ? (
                <div className="space-y-3">
                  {(data?.calls || []).map((call) => (
                    <div key={call.callId} className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-neutral-900">{call.topic}</div>
                        <div className="text-sm text-neutral-600">{call.peer?.username || "Unknown"} • {call.language || "-"}</div>
                        <div className="text-xs text-neutral-500 mt-2">{formatDate(call.startedAt)} • {call.durationMinutes?.toFixed?.(2) || "0.00"} min</div>
                      </div>
                      <div className="text-left md:text-right">
                        <div className="text-xl font-bold text-neutral-900">{money(call.payoutUsd)}</div>
                        <div className="text-xs text-neutral-500 capitalize">{call.status}</div>
                      </div>
                    </div>
                  ))}
                  {!(data?.calls || []).length && <div className="text-center py-12 text-neutral-500">No call earnings yet.</div>}
                </div>
              ) : tab === "phrases" ? (
                <div className="space-y-3">
                  {(data?.phrases || []).map((phrase) => (
                    <div key={phrase.phraseId} className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="text-sm font-semibold text-neutral-900 truncate" title={phrase.text}>{phrase.text}</div>
                        <div className="text-sm text-neutral-600 capitalize">{phrase.language || "-"}</div>
                        <div className="text-xs text-neutral-500 mt-2">{formatDate(phrase.recordedAt)} • {phrase.duration?.toFixed?.(2) || "0.00"} sec</div>
                      </div>
                      <div className="text-left md:text-right flex-shrink-0">
                        <div className="text-xl font-bold text-neutral-900">{money(phrase.payoutUsd)}</div>
                        <div className="text-xs text-neutral-500 capitalize">{phrase.status}</div>
                      </div>
                    </div>
                  ))}
                  {!(data?.phrases || []).length && <div className="text-center py-12 text-neutral-500">No phrase earnings yet.</div>}
                </div>
              ) : (
                (data?.payments || []).length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-neutral-200">
                          {["Amount", "Paid At", "Details"].map((h) => (
                            <th key={h} className="px-4 py-3 text-left text-sm font-semibold text-neutral-700">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200">
                        {(data?.payments || []).map((payment) => (
                          <tr key={payment.id}>
                            <td className="px-4 py-4 text-sm font-semibold text-neutral-900">{money(payment.amountUsd)}</td>
                            <td className="px-4 py-4 text-sm text-neutral-700">{formatDate(payment.paidAt)}</td>
                            <td className="px-4 py-4 text-sm text-neutral-600">{payment.note || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="text-center py-12 text-neutral-500">No payments have been recorded yet.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
