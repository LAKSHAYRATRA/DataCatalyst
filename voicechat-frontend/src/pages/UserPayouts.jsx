import React, { useEffect, useState } from "react";
import Nav from "../components/Nav.jsx";
import { apiGet, apiPostJson } from "../lib/api.js";
import { PhoneCall, Radio, Mic2, CreditCard } from "lucide-react";

function money(value) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function formatHHMMSSFromSeconds(totalSecs) {
  const secs = Math.max(0, Math.floor(Number(totalSecs) || 0));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function UserPayouts() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("calls"); // 'calls' | 'scripted' | 'phrases' | 'payments'
  const [subTab, setSubTab] = useState("all"); // 'all' | 'pending' | 'reviewed'

  const [editingUpi, setEditingUpi] = useState(false);
  const [upiInput, setUpiInput] = useState("");
  const [upiSaving, setUpiSaving] = useState(false);
  const [upiError, setUpiError] = useState("");
  const [upiSuccess, setUpiSuccess] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await apiGet("/api/payouts/me");
        setData(res);
        if (res?.summary?.user?.upiId) {
          setUpiInput(res.summary.user.upiId);
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSaveUpi = async (e) => {
    e.preventDefault();
    setUpiSaving(true);
    setUpiError("");
    setUpiSuccess("");
    try {
      const res = await apiPostJson("/api/user/upi", { upiId: upiInput });
      setUpiSuccess("UPI ID updated successfully!");
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          summary: {
            ...prev.summary,
            user: {
              ...prev.summary.user,
              upiId: res.upiId,
            },
          },
        };
      });
      setEditingUpi(false);
    } catch (err) {
      setUpiError(err.message || "Failed to update UPI ID");
    } finally {
      setUpiSaving(false);
    }
  };

  const summary = data?.summary;
  const rawCallsList = data?.calls || [];
  const phrasesList = data?.phrases || [];

  // Separate Live Calls vs Scripted Calls
  const callsList = rawCallsList.filter(c => !String(c.callId || "").startsWith("scripted_") && c.endReason !== "scripted_completed");
  const scriptedList = rawCallsList.filter(c => String(c.callId || "").startsWith("scripted_") || c.endReason === "scripted_completed");

  // Live Calls Metrics
  const callApprovedSecs = callsList
    .filter(c => c.status === "approved")
    .reduce((sum, c) => sum + ((Number(c.durationMinutes) || 0) * 60 || Number(c.duration) || 0), 0);

  const callPendingSecs = callsList
    .filter(c => c.status === "recorded" || c.status === "completed" || c.status === "pending")
    .reduce((sum, c) => sum + ((Number(c.durationMinutes) || 0) * 60 || Number(c.duration) || 0), 0);

  const callPendingUsd = callsList
    .filter(c => c.status === "recorded" || c.status === "completed" || c.status === "pending")
    .reduce((sum, c) => sum + (Number(c.payoutUsd) || 0), 0);

  const pendingCallsCount = callsList.filter(c => c.status === "recorded" || c.status === "completed" || c.status === "pending").length;
  const reviewedCallsCount = callsList.filter(c => c.status === "approved" || c.status === "rejected").length;

  const filteredCalls = callsList.filter(c => {
    if (subTab === "pending") return c.status === "recorded" || c.status === "completed" || c.status === "pending";
    if (subTab === "reviewed") return c.status === "approved" || c.status === "rejected";
    return true;
  });

  // Scripted Calls Metrics
  const scriptedApprovedSecs = scriptedList
    .filter(c => c.status === "approved")
    .reduce((sum, c) => sum + ((Number(c.durationMinutes) || 0) * 60 || Number(c.duration) || 0), 0);

  const scriptedPendingSecs = scriptedList
    .filter(c => c.status === "recorded" || c.status === "completed" || c.status === "pending")
    .reduce((sum, c) => sum + ((Number(c.durationMinutes) || 0) * 60 || Number(c.duration) || 0), 0);

  const scriptedPendingUsd = scriptedList
    .filter(c => c.status === "recorded" || c.status === "completed" || c.status === "pending")
    .reduce((sum, c) => sum + (Number(c.payoutUsd) || 0), 0);

  const pendingScriptedCount = scriptedList.filter(c => c.status === "recorded" || c.status === "completed" || c.status === "pending").length;
  const reviewedScriptedCount = scriptedList.filter(c => c.status === "approved" || c.status === "rejected").length;

  const filteredScripted = scriptedList.filter(c => {
    if (subTab === "pending") return c.status === "recorded" || c.status === "completed" || c.status === "pending";
    if (subTab === "reviewed") return c.status === "approved" || c.status === "rejected";
    return true;
  });

  // Phrases Metrics
  const phraseApprovedSecs = phrasesList
    .filter(p => p.status === "approved")
    .reduce((sum, p) => sum + (Number(p.duration) || 0), 0);

  const phrasePendingSecs = phrasesList
    .filter(p => p.status === "recorded" || p.status === "pending")
    .reduce((sum, p) => sum + (Number(p.duration) || 0), 0);

  const phrasePendingUsd = phrasesList
    .filter(p => p.status === "recorded" || p.status === "pending")
    .reduce((sum, p) => sum + (Number(p.payoutUsd) || 0), 0);

  const pendingPhrasesCount = phrasesList.filter(p => p.status === "recorded" || p.status === "pending").length;
  const reviewedPhrasesCount = phrasesList.filter(p => p.status === "approved" || p.status === "rejected").length;

  const filteredPhrases = phrasesList.filter(p => {
    if (subTab === "pending") return p.status === "recorded" || p.status === "pending";
    if (subTab === "reviewed") return p.status === "approved" || p.status === "rejected";
    return true;
  });

  const totalPendingEst = (summary?.totalRemainingPayoutUsd && summary.totalRemainingPayoutUsd > 0)
    ? summary.totalRemainingPayoutUsd
    : (summary?.totalPendingEstimatedUsd !== undefined ? summary.totalPendingEstimatedUsd : (phrasePendingUsd + callPendingUsd + scriptedPendingUsd));

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 pt-16 md:pt-0 md:pl-64 transition-colors duration-300">
      <Nav />
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12 space-y-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-white mb-2">Earnings</h1>
          <p className="text-neutral-600 dark:text-neutral-400">See your approved earnings, paid amounts, and payout history.</p>
        </div>

        {loading ? (
          <div className="text-center py-16"><div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div></div>
        ) : error ? (
          <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-lg">{error}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="relative overflow-hidden rounded-3xl p-6 md:p-7 border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 hover:border-neutral-700 shadow-xl transition-all duration-300 group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-emerald-500/15 transition-all" />
                <div className="relative z-10">
                  <div className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    Earned
                  </div>
                  <div className="text-3xl md:text-4xl font-black text-white drop-shadow-sm font-mono">{money(summary?.totalMoneyMadeUsd)}</div>
                  <div className="text-xs text-neutral-400 mt-2 font-medium">From approved live calls, scripted calls, and phrases</div>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-3xl p-6 md:p-7 border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 hover:border-neutral-700 shadow-xl transition-all duration-300 group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-indigo-500/15 transition-all" />
                <div className="relative z-10">
                  <div className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                    Paid Out
                  </div>
                  <div className="text-3xl md:text-4xl font-black text-white drop-shadow-sm font-mono">{money(summary?.totalPaidOutUsd)}</div>
                  <div className="text-xs text-neutral-400 mt-2 font-medium">{data?.payments?.length || 0} payout records</div>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-3xl p-6 md:p-7 border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 hover:border-neutral-700 shadow-xl transition-all duration-300 group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-cyan-500/15 transition-all" />
                <div className="relative z-10">
                  <div className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                    Remaining Payout
                  </div>
                  <div className="text-3xl md:text-4xl font-black text-white drop-shadow-sm font-mono">{money(summary?.totalRemainingPayoutUsd)}</div>
                  <div className="text-xs text-neutral-400 mt-2 font-medium">{pendingCallsCount} live calls, {pendingScriptedCount} scripted calls, {pendingPhrasesCount} phrases pending</div>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-3xl p-6 md:p-7 border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 hover:border-neutral-700 shadow-xl transition-all duration-300 group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/10 rounded-full blur-2xl pointer-events-none" />
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-primary-500 animate-pulse"></span>
                    UPI ID for Payouts
                  </h3>
                  <p className="text-sm text-neutral-400 mt-1 font-medium">
                    Your earnings will be sent to this UPI account.
                  </p>
                </div>
                
                <div className="flex-shrink-0">
                  {editingUpi ? (
                    <form onSubmit={handleSaveUpi} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="text"
                        value={upiInput}
                        onChange={(e) => setUpiInput(e.target.value)}
                        placeholder="username@bank"
                        className="px-4 py-2.5 rounded-2xl border border-neutral-700 bg-neutral-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-full sm:w-64"
                        disabled={upiSaving}
                        required
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="px-5 py-2.5 rounded-2xl bg-primary-600 hover:bg-primary-500 text-white font-bold text-sm shadow-md transition-all duration-200"
                          disabled={upiSaving}
                        >
                          {upiSaving ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUpi(false);
                            setUpiInput(data?.summary?.user?.upiId || "");
                            setUpiError("");
                          }}
                          className="px-4 py-2.5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-sm transition-all duration-200"
                          disabled={upiSaving}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center gap-4">
                      {data?.summary?.user?.upiId ? (
                        <div className="bg-neutral-800/80 border border-neutral-700 px-4 py-2 rounded-2xl text-sm font-mono text-white">
                          {data.summary.user.upiId}
                        </div>
                      ) : (
                        <div className="text-sm font-semibold text-rose-400 flex items-center gap-1.5">
                          ⚠️ No UPI ID added
                        </div>
                      )}
                      <button
                        onClick={() => {
                          setEditingUpi(true);
                          setUpiInput(data?.summary?.user?.upiId || "");
                        }}
                        className="px-5 py-2.5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-sm border border-neutral-700 transition-all duration-200"
                      >
                        {data?.summary?.user?.upiId ? "Modify" : "Add UPI ID"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              {upiError && (
                <div className="mt-3 text-sm text-rose-400 relative z-10 font-semibold">
                  {upiError}
                </div>
              )}
              {upiSuccess && (
                <div className="mt-3 text-sm text-emerald-400 relative z-10 font-semibold">
                  {upiSuccess}
                </div>
              )}
            </div>

            <div className="relative overflow-hidden bg-gradient-to-r from-[#5865F2]/15 via-neutral-900/90 to-[#5865F2]/10 border border-[#5865F2]/30 p-6 md:p-7 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all duration-300 hover:shadow-xl hover:shadow-[#5865F2]/5">
              <div className="absolute top-0 right-0 w-36 h-36 bg-[#5865F2] rounded-full blur-[80px] opacity-20 pointer-events-none"></div>
              <div className="flex items-center gap-4 relative z-10">
                <div className="w-12 h-12 bg-[#5865F2] rounded-2xl flex items-center justify-center shadow-lg shadow-[#5865F2]/30 shrink-0">
                  <svg className="w-6 h-6 fill-current text-white" viewBox="0 0 127.14 96.36">
                    <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.4-5c.87-.64,1.71-1.32,2.5-2a75.7,75.7,0,0,0,72.6,0c.79.7,1.63,1.38,2.5,2a68.43,68.43,0,0,1-10.4,5,77.7,77.7,0,0,0,6.63,10.85,105.73,105.73,0,0,0,31-18.83C129.8,48.12,122.9,25.32,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.78,46,53.78,53,48.71,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96,46,96,53,91,65.69,84.69,65.69Z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Join our Discord Community</h3>
                  <p className="text-sm text-neutral-400 mt-0.5 font-medium">
                    Connect with fellow contributors, get real-time support, and stay updated on active tasks.
                  </p>
                </div>
              </div>
              
              <a
                href="https://discord.gg/TVuj7Brytq"
                target="_blank"
                rel="noopener noreferrer"
                className="btn bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-sm px-6 py-3 rounded-2xl transition-all duration-300 shadow-md shadow-[#5865F2]/20 hover:shadow-lg hover:shadow-[#5865F2]/30 text-center shrink-0 relative z-10"
              >
                Join Discord
              </a>
            </div>

            <div className="relative overflow-hidden rounded-3xl p-6 md:p-8 border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 shadow-xl">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 border-b border-neutral-800 pb-5 relative z-10">
                <div className="inline-flex flex-wrap p-1.5 rounded-2xl bg-neutral-900 border border-neutral-800 shadow-inner gap-1.5">
                  <button
                    onClick={() => { setTab("calls"); setSubTab("all"); }}
                    className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
                      tab === "calls"
                        ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-lg shadow-primary-500/30 scale-[1.02]"
                        : "text-neutral-300 hover:text-white hover:bg-neutral-800"
                    }`}
                  >
                    <PhoneCall className={`w-4 h-4 ${tab === "calls" ? "text-white" : "text-primary-400"}`} />
                    <span>Calls</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
                      tab === "calls" ? "bg-white/20 text-white" : "bg-neutral-800 text-neutral-300"
                    }`}>
                      {callsList.length}
                    </span>
                  </button>

                  <button
                    onClick={() => { setTab("scripted"); setSubTab("all"); }}
                    className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
                      tab === "scripted"
                        ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-lg shadow-primary-500/30 scale-[1.02]"
                        : "text-neutral-300 hover:text-white hover:bg-neutral-800"
                    }`}
                  >
                    <Radio className={`w-4 h-4 ${tab === "scripted" ? "text-white" : "text-primary-400"}`} />
                    <span>Scripted Calls</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
                      tab === "scripted" ? "bg-white/20 text-white" : "bg-neutral-800 text-neutral-300"
                    }`}>
                      {scriptedList.length}
                    </span>
                  </button>

                  <button
                    onClick={() => { setTab("phrases"); setSubTab("all"); }}
                    className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
                      tab === "phrases"
                        ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-lg shadow-primary-500/30 scale-[1.02]"
                        : "text-neutral-300 hover:text-white hover:bg-neutral-800"
                    }`}
                  >
                    <Mic2 className={`w-4 h-4 ${tab === "phrases" ? "text-white" : "text-primary-400"}`} />
                    <span>Phrases</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
                      tab === "phrases" ? "bg-white/20 text-white" : "bg-neutral-800 text-neutral-300"
                    }`}>
                      {data?.phrases?.length || 0}
                    </span>
                  </button>

                  <button
                    onClick={() => { setTab("payments"); setSubTab("all"); }}
                    className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
                      tab === "payments"
                        ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-lg shadow-primary-500/30 scale-[1.02]"
                        : "text-neutral-300 hover:text-white hover:bg-neutral-800"
                    }`}
                  >
                    <CreditCard className={`w-4 h-4 ${tab === "payments" ? "text-white" : "text-primary-400"}`} />
                    <span>Payments</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
                      tab === "payments" ? "bg-white/20 text-white" : "bg-neutral-800 text-neutral-300"
                    }`}>
                      {data?.payments?.length || 0}
                    </span>
                  </button>
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-neutral-400 bg-neutral-900 px-3.5 py-2 rounded-xl border border-neutral-800 self-start md:self-auto">
                  Showing <span className="text-white font-extrabold">
                    {tab === "calls" ? `${callsList.length} calls` : tab === "scripted" ? `${scriptedList.length} scripted calls` : tab === "phrases" ? `${data?.phrases?.length || 0} phrases` : `${data?.payments?.length || 0} payments`}
                  </span>
                </div>
              </div>

              {/* Duration Counters & Sub-filters for Calls, Scripted & Phrases */}
              {(tab === "calls" || tab === "scripted" || tab === "phrases") && (
                <div className="mb-6 space-y-4">
                  {/* Duration Counters */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-neutral-950/80 text-white p-6 rounded-3xl border border-neutral-800 shadow-inner relative overflow-hidden">
                    <div>
                      <span className="block text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Approved Duration
                      </span>
                      <span className="font-mono font-bold text-xl md:text-2xl text-white tracking-wide">
                        {formatHHMMSSFromSeconds(tab === "calls" ? callApprovedSecs : tab === "scripted" ? scriptedApprovedSecs : phraseApprovedSecs)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-cyan-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-cyan-400"></span> Pending Review Duration
                      </span>
                      <span className="font-mono font-bold text-xl md:text-2xl text-white tracking-wide">
                        {formatHHMMSSFromSeconds(tab === "calls" ? callPendingSecs : tab === "scripted" ? scriptedPendingSecs : phrasePendingSecs)}
                      </span>
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <span className="block text-xs font-bold text-primary-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-primary-400"></span> Est. Pending Value
                      </span>
                      <span className="font-mono font-bold text-xl md:text-2xl text-white tracking-wide">
                        {money(tab === "calls" ? callPendingUsd : tab === "scripted" ? scriptedPendingUsd : phrasePendingUsd)}
                      </span>
                    </div>
                  </div>

                  {/* Sub-filters Toggle */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 mr-1">Filter Status:</span>
                    <button
                      onClick={() => setSubTab("all")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        subTab === "all"
                          ? "bg-white text-neutral-950 font-black shadow-sm"
                          : "bg-neutral-850 text-neutral-300 hover:bg-neutral-800"
                      }`}
                    >
                      All ({tab === "calls" ? callsList.length : tab === "scripted" ? scriptedList.length : phrasesList.length})
                    </button>
                    <button
                      onClick={() => setSubTab("pending")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        subTab === "pending"
                          ? "bg-primary-600 text-white font-black shadow-sm"
                          : "bg-neutral-850 text-neutral-300 hover:bg-neutral-800"
                      }`}
                    >
                      Pending ({tab === "calls" ? pendingCallsCount : tab === "scripted" ? pendingScriptedCount : pendingPhrasesCount})
                    </button>
                    <button
                      onClick={() => setSubTab("reviewed")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        subTab === "reviewed"
                          ? "bg-emerald-600 text-white font-black shadow-sm"
                          : "bg-neutral-850 text-neutral-300 hover:bg-neutral-800"
                      }`}
                    >
                      Reviewed ({tab === "calls" ? reviewedCallsCount : tab === "scripted" ? reviewedScriptedCount : reviewedPhrasesCount})
                    </button>
                  </div>
                </div>
              )}

              {tab === "calls" ? (
                <div className="space-y-3">
                  {filteredCalls.map((call) => (
                    <div key={call.callId} className="rounded-2xl border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-850/80 hover:border-neutral-700 p-5 flex flex-col gap-3 transition-all shadow-sm">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                          <div className="text-base font-bold text-white">{call.topic}</div>
                          <div className="text-xs text-neutral-400 mt-0.5">{call.subtopic || "-"} • {call.language || "-"}</div>
                          <div className="text-xs text-neutral-500 mt-2 font-mono">{formatDate(call.startedAt)} • {call.durationMinutes?.toFixed?.(2) || "0.00"} min</div>
                        </div>
                        <div className="text-left md:text-right">
                          <div className="text-xl font-bold font-mono text-white">{money(call.payoutUsd)}</div>
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold capitalize mt-1 border ${
                            call.status === "approved" ? "bg-emerald-950/60 text-emerald-300 border-emerald-800/60" :
                            call.status === "rejected" ? "bg-rose-950/60 text-rose-300 border-rose-800/60" :
                            "bg-cyan-950/60 text-cyan-300 border-cyan-800/60"
                          }`}>
                            {call.status === "recorded" || call.status === "pending" ? "Pending Review" : call.status}
                          </span>
                        </div>
                      </div>

                      {call.reviewNote && (
                        <div className="mt-1 pt-3 border-t border-neutral-800/80 bg-neutral-950/60 p-3.5 rounded-xl text-xs">
                          <div className="text-neutral-300 flex items-start gap-2">
                            <span className="font-bold text-white shrink-0">Feedback Note:</span>
                            <span className="italic">"{call.reviewNote}"</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {!filteredCalls.length && <div className="text-center py-12 text-neutral-400">No {subTab !== "all" ? subTab : ""} calls found.</div>}
                </div>
              ) : tab === "scripted" ? (
                <div className="space-y-3">
                  {filteredScripted.map((call) => (
                    <div key={call.callId} className="rounded-2xl border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-850/80 hover:border-neutral-700 p-5 flex flex-col gap-3 transition-all shadow-sm">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                          <div className="text-base font-bold text-white flex items-center gap-2">
                            <Radio className="w-4 h-4 text-indigo-400" />
                            <span>{call.subtopic && call.subtopic !== "-" ? call.subtopic : call.topic || "Scripted Conversation"}</span>
                          </div>
                          <div className="text-xs text-neutral-400 mt-0.5">
                            {call.topic && call.topic !== "-" && call.topic !== call.subtopic ? `${call.topic} • ` : ""}<span className="capitalize">{call.language || "-"}</span>
                          </div>
                          <div className="text-xs text-neutral-500 mt-2 font-mono">{formatDate(call.startedAt)} • {call.durationMinutes?.toFixed?.(2) || "0.00"} min</div>
                        </div>
                        <div className="text-left md:text-right">
                          <div className="text-xl font-bold font-mono text-white">{money(call.payoutUsd)}</div>
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold capitalize mt-1 border ${
                            call.status === "approved" ? "bg-emerald-950/60 text-emerald-300 border-emerald-800/60" :
                            call.status === "rejected" ? "bg-rose-950/60 text-rose-300 border-rose-800/60" :
                            "bg-cyan-950/60 text-cyan-300 border-cyan-800/60"
                          }`}>
                            {call.status === "recorded" || call.status === "pending" ? "Pending Review" : call.status}
                          </span>
                        </div>
                      </div>

                      {call.reviewNote && (
                        <div className="mt-1 pt-3 border-t border-neutral-800/80 bg-neutral-950/60 p-3.5 rounded-xl text-xs">
                          <div className="text-neutral-300 flex items-start gap-2">
                            <span className="font-bold text-white shrink-0">Feedback Note:</span>
                            <span className="italic">"{call.reviewNote}"</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {!filteredScripted.length && <div className="text-center py-12 text-neutral-400">No {subTab !== "all" ? subTab : ""} scripted calls found.</div>}
                </div>
              ) : tab === "phrases" ? (
                <div className="space-y-3">
                  {filteredPhrases.map((phrase) => (
                    <div key={phrase.phraseId} className="rounded-2xl border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-850/80 hover:border-neutral-700 p-5 flex flex-col gap-3 transition-all shadow-sm">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="text-base font-bold text-white truncate" title={phrase.text}>{phrase.text}</div>
                          <div className="text-xs text-neutral-400 capitalize">{phrase.language || "-"}</div>
                          <div className="text-xs text-neutral-500 mt-2 font-mono">{formatDate(phrase.recordedAt)} • {phrase.duration?.toFixed?.(2) || "0.00"} sec</div>
                        </div>
                        <div className="text-left md:text-right flex-shrink-0">
                          <div className="text-xl font-bold font-mono text-white">{money(phrase.payoutUsd)}</div>
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold capitalize mt-1 border ${
                            phrase.status === "approved" ? "bg-emerald-950/60 text-emerald-300 border-emerald-800/60" :
                            phrase.status === "rejected" ? "bg-rose-950/60 text-rose-300 border-rose-800/60" :
                            "bg-cyan-950/60 text-cyan-300 border-cyan-800/60"
                          }`}>
                            {phrase.status === "recorded" || phrase.status === "pending" ? "Pending Review" : phrase.status}
                          </span>
                        </div>
                      </div>

                      {phrase.qaComment && (
                        <div className="mt-1 pt-3 border-t border-neutral-800/80 bg-neutral-950/60 p-3.5 rounded-xl text-xs">
                          <div className="text-neutral-300 flex items-start gap-2">
                            <span className="font-bold text-white shrink-0">Feedback Note:</span>
                            <span className="italic">"{phrase.qaComment}"</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {!filteredPhrases.length && <div className="text-center py-12 text-neutral-400">No {subTab !== "all" ? subTab : ""} phrases found.</div>}
                </div>
              ) : (
                (data?.payments || []).length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-neutral-800 bg-neutral-900/80 uppercase text-[11px] tracking-widest text-neutral-400">
                          {["Amount", "Paid At", "Details"].map((h) => (
                            <th key={h} className="px-6 py-4 text-left font-bold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-800/80">
                        {(data?.payments || []).map((payment) => (
                          <tr key={payment.id} className="hover:bg-neutral-800/30 transition-colors">
                            <td className="px-6 py-4 text-sm font-bold font-mono text-white">{money(payment.amountUsd)}</td>
                            <td className="px-6 py-4 text-sm text-neutral-300">{formatDate(payment.paidAt)}</td>
                            <td className="px-6 py-4 text-sm text-neutral-400">{payment.note || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="text-center py-12 text-neutral-400">No payments have been recorded yet.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
