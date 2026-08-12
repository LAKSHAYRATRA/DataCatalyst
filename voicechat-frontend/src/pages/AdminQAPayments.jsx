import React, { useEffect, useState } from "react";
import AdminNav from "../components/AdminNav.jsx";
import { getUserInfo } from "../lib/auth.js";
import { DollarSign, Phone, FileText, CheckCircle, XCircle, Clock, Award, ShieldAlert, CreditCard, Edit3, Check } from "lucide-react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

async function apiFetch(path, opts = {}) {
    const res = await fetch(`${BACKEND_URL}${path}`, { credentials: "include", ...opts });
    const json = await res.json().catch(() => ({ error: "Request failed" }));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
}

export default function AdminQAPayments() {
    const userInfo = getUserInfo();
    const isAdmin = Boolean(userInfo?.isAdmin);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [data, setData] = useState(null);

    const [upiInput, setUpiInput] = useState("");
    const [isEditingUpi, setIsEditingUpi] = useState(false);
    const [savingUpi, setSavingUpi] = useState(false);
    const [upiError, setUpiError] = useState("");
    const [upiSuccess, setUpiSuccess] = useState("");

    useEffect(() => {
        loadPaymentData();
    }, []);

    async function loadPaymentData() {
        setLoading(true);
        setError("");
        try {
            const res = await apiFetch("/api/admin/qa/payments-stats");
            setData(res);
        } catch (err) {
            setError(err.message || "Failed to load payment details.");
        } finally {
            setLoading(false);
        }
    }

    const handleSaveUpi = async (e) => {
        e.preventDefault();
        setUpiError("");
        setUpiSuccess("");
        const val = upiInput.trim();
        if (!val) {
            setUpiError("Please enter a valid UPI ID");
            return;
        }
        try {
            setSavingUpi(true);
            const res = await apiFetch("/api/user/upi", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ upiId: val })
            });
            setSavingUpi(false);
            setIsEditingUpi(false);
            setUpiSuccess("UPI ID updated successfully!");
            setData(prev => ({
                ...prev,
                qaUser: {
                    ...prev?.qaUser,
                    upiId: res.upiId || val
                }
            }));
            setTimeout(() => setUpiSuccess(""), 4000);
        } catch (err) {
            setSavingUpi(false);
            setUpiError(err.message || "Failed to update UPI ID");
        }
    };

    const formatDate = (d) => {
        if (!d) return "-";
        return new Date(d).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    };

    return (
        <div className="min-h-screen bg-neutral-900 pt-16 md:pt-0 md:pl-64 text-white">
            <AdminNav />
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12 space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-6">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3 text-white">
                            <DollarSign className="w-8 h-8 text-warning-400" />
                            QA Payments & Earnings
                        </h1>
                        <p className="text-neutral-400 text-sm mt-1">
                            {isAdmin ? "Overview of all QA Reviewer pay rates, reviewed workloads, and total calculated payouts." : "Your personal QA review earnings, payrates, and completed workload statistics."}
                        </p>
                    </div>
                    <button
                        onClick={loadPaymentData}
                        className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-2 w-max"
                    >
                        🔄 Refresh Data
                    </button>
                </div>

                {error && (
                    <div className="p-4 bg-error-950/60 border border-error-800 text-error-300 rounded-xl text-sm flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="w-12 h-12 border-4 border-warning-200 border-t-warning-500 rounded-full animate-spin" />
                    </div>
                ) : data?.isAdminView ? (
                    /* Admin View Across All QA Reviewers */
                    <div className="space-y-6">
                        {/* Global Expense Overview Banner */}
                        <div className="bg-gradient-to-r from-warning-950/50 via-neutral-850 to-neutral-800 border border-warning-900/40 p-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
                            <div>
                                <div className="text-xs uppercase tracking-wider text-warning-400 font-bold mb-1">Total Company QA Expense Owed</div>
                                <div className="text-3xl md:text-4xl font-extrabold text-white">
                                    ${data.totalCompanyQaExpenseUsd?.toFixed(2) || "0.00"} USD
                                </div>
                            </div>
                            <div className="text-right text-xs text-neutral-400">
                                <span>Active QA Reviewers: </span>
                                <span className="font-bold text-white text-sm">{data.stats?.length || 0}</span>
                            </div>
                        </div>

                        {/* All QA Users Table */}
                        <div className="bg-neutral-800 border border-neutral-700 rounded-2xl overflow-hidden shadow-xl">
                            <div className="p-4 border-b border-neutral-700 font-semibold text-sm text-neutral-200">
                                QA Reviewers Payrates & Earnings
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-neutral-750 text-neutral-400 uppercase text-[11px] font-bold tracking-wider">
                                        <tr>
                                            <th className="px-4 py-3 text-left">QA Reviewer</th>
                                            <th className="px-4 py-3 text-left">Per Call Rate</th>
                                            <th className="px-4 py-3 text-left">Hourly Phrase Rate</th>
                                            <th className="px-4 py-3 text-center">Calls Reviewed</th>
                                            <th className="px-4 py-3 text-center">Phrases Reviewed (Est. Hrs)</th>
                                            <th className="px-4 py-3 text-right">Total Earned</th>
                                            <th className="px-4 py-3 text-right">Paid Out</th>
                                            <th className="px-4 py-3 text-right font-bold text-warning-400">Remaining Owed</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-700/60">
                                        {data.stats.map((item) => {
                                            const remainingUsd = item.totalRemainingUsd !== undefined ? item.totalRemainingUsd : item.totalEarningsUsd;
                                            const paidOutUsd = item.totalPaidOutUsd !== undefined ? item.totalPaidOutUsd : 0;
                                            return (
                                                <tr key={item.qaUser._id} className="hover:bg-neutral-700/40 transition-colors">
                                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                                        <div className="font-semibold text-white">{item.qaUser.name}</div>
                                                        <div className="text-xs text-neutral-400">{item.qaUser.email}</div>
                                                    </td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap font-mono text-neutral-200">
                                                        ${item.qaUser.qaPerCallPayrateUsd?.toFixed(2) || "0.00"}
                                                    </td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap font-mono text-neutral-200">
                                                        ${item.qaUser.qaHourlyPhrasePayrateUsd?.toFixed(2) || "0.00"}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-center font-bold text-white">
                                                        {item.callsReviewed}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-center">
                                                         <span className="font-bold text-white">{item.phrasesReviewed} phrases</span>
                                                         <span className="text-xs text-neutral-400 block">({item.totalPhraseSecs || 0}s / {item.phraseHours}h)</span>
                                                     </td>
                                                    <td className="px-4 py-3.5 text-right font-mono text-neutral-300">
                                                        ${item.totalEarningsUsd?.toFixed(2) || "0.00"}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right font-mono text-emerald-400 font-semibold">
                                                        ${paidOutUsd.toFixed(2)}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right font-mono font-bold text-warning-400 text-base">
                                                        ${remainingUsd.toFixed(2)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Personal QA Reviewer Earnings View */
                    <div className="space-y-8">
                        {/* Registered UPI ID Banner */}
                        <div className="bg-neutral-800 border border-neutral-700 p-5 rounded-2xl shadow-lg relative overflow-hidden">
                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                                        <CreditCard className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Payment UPI Handle</div>
                                        {isEditingUpi ? (
                                            <form onSubmit={handleSaveUpi} className="flex items-center gap-2 mt-1">
                                                <input
                                                    type="text"
                                                    value={upiInput}
                                                    onChange={(e) => setUpiInput(e.target.value)}
                                                    placeholder="e.g. username@upi or 9876543210@ybl"
                                                    className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-amber-400 w-64"
                                                    autoFocus
                                                />
                                                <button
                                                    type="submit"
                                                    disabled={savingUpi}
                                                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-neutral-950 font-bold rounded-lg text-xs transition-colors flex items-center gap-1"
                                                >
                                                    {savingUpi ? "Saving..." : "Save"}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { setIsEditingUpi(false); setUpiError(""); }}
                                                    className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 rounded-lg text-xs transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                            </form>
                                        ) : (
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-lg font-bold font-mono text-white">
                                                    {data?.qaUser?.upiId ? data.qaUser.upiId : <span className="text-neutral-500 italic text-sm">Not Provided</span>}
                                                </span>
                                                <button
                                                    onClick={() => {
                                                        setUpiInput(data?.qaUser?.upiId || "");
                                                        setIsEditingUpi(true);
                                                        setUpiError("");
                                                    }}
                                                    className="px-3 py-1 bg-neutral-700 hover:bg-neutral-600 text-amber-400 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 border border-neutral-600"
                                                >
                                                    <Edit3 className="w-3.5 h-3.5" />
                                                    {data?.qaUser?.upiId ? "Edit UPI ID" : "Add UPI ID"}
                                                </button>
                                            </div>
                                        )}
                                        {upiError && <p className="text-xs text-rose-400 font-medium mt-1">{upiError}</p>}
                                        {upiSuccess && <p className="text-xs text-emerald-400 font-medium mt-1">{upiSuccess}</p>}
                                    </div>
                                </div>
                                <div className="text-xs text-neutral-400 max-w-xs">
                                    Admin payouts for your reviewed QA workload will be transferred directly to this registered UPI ID.
                                </div>
                            </div>
                        </div>

                        {/* Personal Pay Rates Banner */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {/* Per Call Payrate Card */}
                            <div className="bg-neutral-800 border border-neutral-700 p-5 rounded-2xl relative overflow-hidden shadow-lg">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Per Call Rate</span>
                                    <Phone className="w-5 h-5 text-warning-400" />
                                </div>
                                <div className="text-2xl font-extrabold text-white font-mono">
                                    ${data?.qaUser?.qaPerCallPayrateUsd?.toFixed(2) || "0.00"}
                                </div>
                                <div className="text-[11px] text-neutral-400 mt-1">
                                    Per reviewed call session
                                </div>
                            </div>

                            {/* Hourly Phrase Payrate Card */}
                            <div className="bg-neutral-800 border border-neutral-700 p-5 rounded-2xl relative overflow-hidden shadow-lg">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Hourly Phrase Rate</span>
                                    <FileText className="w-5 h-5 text-indigo-400" />
                                </div>
                                <div className="text-2xl font-extrabold text-white font-mono">
                                    ${data?.qaUser?.qaHourlyPhrasePayrateUsd?.toFixed(2) || "0.00"}
                                </div>
                                <div className="text-[11px] text-neutral-400 mt-1">
                                    Per hour of phrase reviews
                                </div>
                            </div>

                            {/* Total Earned Card */}
                            <div className="bg-gradient-to-br from-neutral-800 to-neutral-850 border border-neutral-700 p-5 rounded-2xl relative overflow-hidden shadow-lg">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider">Total Workload Earned</span>
                                    <Award className="w-5 h-5 text-amber-400" />
                                </div>
                                <div className="text-2xl font-black text-amber-400 font-mono">
                                    ${data?.totalEarningsUsd?.toFixed(2) || "0.00"} USD
                                </div>
                                <div className="text-[11px] text-neutral-400 mt-1">
                                    Total from completed reviews
                                </div>
                            </div>

                            {/* Remaining Balance / Paid Out Card */}
                            <div className="bg-gradient-to-br from-emerald-950/40 to-neutral-800 border border-emerald-600/40 p-5 rounded-2xl relative overflow-hidden shadow-lg">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Paid Out / Remaining</span>
                                    <DollarSign className="w-5 h-5 text-emerald-400" />
                                </div>
                                <div className="text-2xl font-black text-emerald-400 font-mono">
                                    ${data?.totalPaidOutUsd?.toFixed(2) || "0.00"} USD
                                </div>
                                <div className="text-[11px] text-emerald-200 mt-1 flex items-center justify-between">
                                    <span>Remaining: <strong>${data?.totalRemainingUsd?.toFixed(2) || "0.00"}</strong></span>
                                    {data?.totalRemainingUsd === 0 && <span className="bg-emerald-900/80 text-emerald-300 text-[10px] font-bold px-1.5 py-0.5 rounded">✓ Paid in Full</span>}
                                </div>
                            </div>
                        </div>

                        {/* Workload Breakdown Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Calls Workload Card */}
                            <div className="bg-neutral-800 border border-neutral-700 p-6 rounded-2xl space-y-4 shadow-lg">
                                <div className="flex items-center justify-between border-b border-neutral-700 pb-3">
                                    <h3 className="font-bold text-lg text-white flex items-center gap-2">
                                        <Phone className="w-5 h-5 text-warning-400" /> Call QA Workload
                                    </h3>
                                    <span className="text-xs font-mono bg-warning-950/60 text-warning-300 border border-warning-800/60 px-2.5 py-1 rounded-full font-bold">
                                        ${data?.callEarningsUsd?.toFixed(2) || "0.00"} USD
                                    </span>
                                </div>
                                <div className="grid grid-cols-3 gap-3 text-center">
                                    <div className="bg-neutral-900/60 p-3 rounded-xl border border-neutral-750">
                                        <div className="text-2xl font-bold text-white">{data?.callsReviewedCount || 0}</div>
                                        <div className="text-[11px] text-neutral-400 uppercase font-bold mt-1">Total Calls</div>
                                    </div>
                                    <div className="bg-success-950/30 p-3 rounded-xl border border-success-800/40">
                                        <div className="text-2xl font-bold text-success-400">{data?.approvedCallsCount || 0}</div>
                                        <div className="text-[11px] text-success-300 uppercase font-bold mt-1">Approved</div>
                                    </div>
                                    <div className="bg-error-950/30 p-3 rounded-xl border border-error-800/40">
                                        <div className="text-2xl font-bold text-error-400">{data?.rejectedCallsCount || 0}</div>
                                        <div className="text-[11px] text-error-300 uppercase font-bold mt-1">Rejected</div>
                                    </div>
                                </div>
                            </div>

                            {/* Phrases Workload Card */}
                            <div className="bg-neutral-800 border border-neutral-700 p-6 rounded-2xl space-y-4 shadow-lg">
                                <div className="flex items-center justify-between border-b border-neutral-700 pb-3">
                                    <h3 className="font-bold text-lg text-white flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-indigo-400" /> Phrase QA Workload
                                    </h3>
                                    <span className="text-xs font-mono bg-indigo-950/60 text-indigo-300 border border-indigo-800/60 px-2.5 py-1 rounded-full font-bold">
                                        ${data?.phraseEarningsUsd?.toFixed(2) || "0.00"} USD
                                    </span>
                                </div>
                                <div className="grid grid-cols-4 gap-2 text-center">
                                    <div className="bg-neutral-900/60 p-3 rounded-xl border border-neutral-750">
                                        <div className="text-xl font-bold text-white">{data?.phrasesReviewedCount || 0}</div>
                                        <div className="text-[10px] text-neutral-400 uppercase font-bold mt-1">Phrases</div>
                                    </div>
                                    <div className="bg-indigo-950/30 p-3 rounded-xl border border-indigo-800/40">
                                        <div className="text-xl font-bold text-indigo-300">{data?.totalPhraseSecs || 0}s</div>
                                        <div className="text-[10px] text-indigo-200 uppercase font-bold mt-1">Audio Secs</div>
                                    </div>
                                    <div className="bg-indigo-950/30 p-3 rounded-xl border border-indigo-800/40">
                                        <div className="text-xl font-bold text-indigo-300">{data?.phraseHours || 0}h</div>
                                        <div className="text-[10px] text-indigo-200 uppercase font-bold mt-1">Hours</div>
                                    </div>
                                    <div className="bg-success-950/30 p-3 rounded-xl border border-success-800/40">
                                        <div className="text-xl font-bold text-success-400">{data?.approvedPhrasesCount || 0}/{data?.rejectedPhrasesCount || 0}</div>
                                        <div className="text-[10px] text-success-300 uppercase font-bold mt-1">Appr/Rej</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* QA Payout History & Transferred Dates Log Card */}
                        <div className="bg-neutral-800 border border-neutral-700 rounded-2xl overflow-hidden shadow-lg">
                            <div className="p-4 border-b border-neutral-700 font-bold text-sm text-neutral-200 flex items-center justify-between">
                                <span className="flex items-center gap-2">
                                    <DollarSign className="w-5 h-5 text-emerald-400" /> QA Payout Transfers & Dates History
                                </span>
                                <span className="text-xs font-mono text-neutral-400 bg-neutral-900 px-2.5 py-1 rounded-full border border-neutral-750">
                                    {data?.payoutHistory?.length || 0} Transfers
                                </span>
                            </div>
                            <div className="p-4">
                                {data?.payoutHistory && data.payoutHistory.length > 0 ? (
                                    <div className="space-y-3">
                                        {data.payoutHistory.map((p) => (
                                            <div key={p._id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-neutral-900/60 rounded-xl border border-neutral-750 gap-2">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
                                                        <CheckCircle className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-bold text-white flex items-center gap-2">
                                                            <span>${(Number(p.amountUsd) || 0).toFixed(2)} USD</span>
                                                            <span className="text-xs text-neutral-400 font-normal">({p.note || "QA Workload Payout"})</span>
                                                        </div>
                                                        <div className="text-xs text-neutral-400 mt-0.5 flex items-center gap-1.5">
                                                            <Clock className="w-3.5 h-3.5 text-neutral-500" />
                                                            <span>Payout Date: <strong className="text-emerald-300 font-semibold">{formatDate(p.paidAt)}</strong></span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="self-start sm:self-center">
                                                    <span className="px-3 py-1 bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 rounded-full text-xs font-bold uppercase tracking-wider">
                                                        ✓ Paid Out
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-neutral-500 text-xs">
                                        No payout transfers recorded yet. When admin transfers funds via UPI, payout date & transaction details will appear here.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Recent Reviewed Items Log */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Recent Calls Log */}
                            <div className="bg-neutral-800 border border-neutral-700 rounded-2xl overflow-hidden shadow-lg">
                                <div className="p-4 border-b border-neutral-700 font-bold text-sm text-neutral-200 flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-warning-400" /> Recent Reviewed Calls
                                </div>
                                <div className="p-4 space-y-3">
                                    {data?.recentCalls && data.recentCalls.length > 0 ? (
                                        data.recentCalls.map((c) => (
                                            <div key={c._id} className="flex items-center justify-between p-3 bg-neutral-900/50 rounded-xl border border-neutral-750 text-xs">
                                                <div>
                                                    <div className="font-mono text-neutral-300 font-bold">Call ID: {c.callId}</div>
                                                    <div className="text-neutral-500 mt-0.5">{formatDate(c.reviewedAt)}</div>
                                                </div>
                                                <span className={`px-2 py-0.5 rounded-full font-bold uppercase ${c.callStatus === 'approved' ? 'bg-success-950/80 text-success-300 border border-success-800/60' : 'bg-error-950/80 text-error-300 border border-error-800/60'}`}>
                                                    {c.callStatus}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-neutral-500 text-xs">No recent call reviews found.</div>
                                    )}
                                </div>
                            </div>

                            {/* Recent Phrases Log */}
                            <div className="bg-neutral-800 border border-neutral-700 rounded-2xl overflow-hidden shadow-lg">
                                <div className="p-4 border-b border-neutral-700 font-bold text-sm text-neutral-200 flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-indigo-400" /> Recent Reviewed Phrases
                                </div>
                                <div className="p-4 space-y-3">
                                    {data?.recentPhrases && data.recentPhrases.length > 0 ? (
                                        data.recentPhrases.map((p) => (
                                            <div key={p._id} className="flex items-center justify-between p-3 bg-neutral-900/50 rounded-xl border border-neutral-750 text-xs">
                                                <div className="max-w-[70%]">
                                                    <div className="font-mono text-neutral-300 font-bold truncate">ID: {p.phraseId}</div>
                                                    <div className="text-neutral-400 truncate mt-0.5">"{p.text}"</div>
                                                </div>
                                                <span className={`px-2 py-0.5 rounded-full font-bold uppercase ${p.status === 'approved' ? 'bg-success-950/80 text-success-300 border border-success-800/60' : 'bg-error-950/80 text-error-300 border border-error-800/60'}`}>
                                                    {p.status}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-neutral-500 text-xs">No recent phrase reviews found.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
