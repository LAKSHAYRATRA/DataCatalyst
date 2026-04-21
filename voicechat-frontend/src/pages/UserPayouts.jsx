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
  const [tab, setTab] = useState("activity");

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
  const rows = tab === "activity" ? (data?.calls || []) : (data?.payments || []);

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
                <div className="text-xs text-neutral-500 mt-2">From approved calls</div>
              </div>
              <div className="card">
                <div className="text-sm text-neutral-600 mb-1">Paid Out</div>
                <div className="text-3xl font-bold text-neutral-900">{money(summary?.totalPaidOutUsd)}</div>
                <div className="text-xs text-neutral-500 mt-2">{data?.payments?.length || 0} payout records</div>
              </div>
              <div className="card">
                <div className="text-sm text-neutral-600 mb-1">Remaining</div>
                <div className="text-3xl font-bold text-warning-700">{money(summary?.totalRemainingPayoutUsd)}</div>
                <div className="text-xs text-neutral-500 mt-2">{summary?.pendingCalls || 0} calls are still pending review</div>
              </div>
            </div>

            <div className="card">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div className="inline-flex rounded-xl bg-neutral-100 p-1">
                  <button
                    onClick={() => setTab("activity")}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === "activity" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`}
                  >
                    Activity
                  </button>
                  <button
                    onClick={() => setTab("payments")}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === "payments" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`}
                  >
                    Payments
                  </button>
                </div>
                <div className="text-sm text-neutral-500">
                  {tab === "activity" ? `${data?.calls?.length || 0} calls` : `${data?.payments?.length || 0} payments`}
                </div>
              </div>

              {tab === "activity" ? (
                <div className="space-y-3">
                  {rows.map((call) => (
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
                  {!rows.length && <div className="text-center py-12 text-neutral-500">No call earnings yet.</div>}
                </div>
              ) : (
                rows.length ? (
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
                        {rows.map((payment) => (
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
