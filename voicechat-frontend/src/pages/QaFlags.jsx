import React, { useEffect, useState } from "react";
import AdminNav from "../components/AdminNav.jsx";
import { Flag, AlertTriangle, CheckCircle, Info, Check, RefreshCw, Phone, FileText } from "lucide-react";
import { apiGet, apiPatchJson } from "../lib/api.js";

export default function QaFlags() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [flags, setFlags] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [activeTab, setActiveTab] = useState("call"); // "call" | "phrase"

    useEffect(() => {
        loadFlags();
    }, []);

    async function loadFlags() {
        setLoading(true);
        setError("");
        try {
            const data = await apiGet("/api/admin/qa/flags");
            setFlags(data.flags || []);
            setUnreadCount(data.unreadCount || 0);
        } catch (e) {
            setError(e.message || "Failed to load flags.");
        } finally {
            setLoading(false);
        }
    }

    async function markAsRead(flagId) {
        try {
            await apiPatchJson(`/api/admin/qa/flags/${flagId}/read`, {});
            setFlags(prev => prev.map(f => f._id === flagId ? { ...f, readAt: new Date() } : f));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (e) {
            console.error("Failed to mark flag as read:", e);
        }
    }

    const formatDate = (d) => {
        if (!d) return "-";
        return new Date(d).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    };

    const unreadCallCount = flags.filter(f => f.type === "call" && !f.readAt).length;
    const unreadPhraseCount = flags.filter(f => f.type === "phrase" && !f.readAt).length;
    const filteredFlags = flags.filter(f => f.type === activeTab);

    return (
        <div className="min-h-screen bg-neutral-900 pt-16 md:pt-0 md:pl-64 text-white">
            <AdminNav />

            <div className="p-6 max-w-5xl mx-auto space-y-6">
                {/* Header Banner */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-neutral-800 border border-neutral-700 p-6 rounded-2xl shadow-xl">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400">
                            <Flag className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl font-bold text-white">QA Audit Flags & Feedback</h1>
                                {unreadCount > 0 && (
                                    <span className="px-2.5 py-0.5 bg-rose-500 text-white rounded-full text-xs font-bold font-mono">
                                        {unreadCount} New
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-neutral-400 mt-0.5">
                                Audit feedback notes and verdict override explanations from Admin on your reviewed calls & phrases
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={loadFlags}
                        className="p-2.5 bg-neutral-700 hover:bg-neutral-600 rounded-xl text-neutral-300 transition-colors self-start md:self-auto"
                        title="Refresh Flags"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>

                {/* Sub-Tabs: Calls & Phrases */}
                <div className="flex items-center gap-2 bg-neutral-800 p-1.5 rounded-xl border border-neutral-700 w-max">
                    <button
                        onClick={() => setActiveTab("call")}
                        className={`px-5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
                            activeTab === "call"
                                ? "bg-amber-600 text-white shadow-md"
                                : "text-neutral-400 hover:text-white"
                        }`}
                    >
                        <Phone className="w-4 h-4" />
                        <span>Calls Flags</span>
                        {unreadCallCount > 0 && (
                            <span className="px-2 py-0.5 bg-rose-500 text-white rounded-full text-[10px] font-mono font-bold">
                                {unreadCallCount}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab("phrase")}
                        className={`px-5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
                            activeTab === "phrase"
                                ? "bg-indigo-600 text-white shadow-md"
                                : "text-neutral-400 hover:text-white"
                        }`}
                    >
                        <FileText className="w-4 h-4" />
                        <span>Phrases Flags</span>
                        {unreadPhraseCount > 0 && (
                            <span className="px-2 py-0.5 bg-rose-500 text-white rounded-full text-[10px] font-mono font-bold">
                                {unreadPhraseCount}
                            </span>
                        )}
                    </button>
                </div>

                {/* Main Content List */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-neutral-400 space-y-3">
                        <div className="w-8 h-8 border-3 border-rose-500/30 border-t-rose-500 rounded-full animate-spin" />
                        <span className="text-xs font-semibold">Loading QA flags...</span>
                    </div>
                ) : error ? (
                    <div className="p-4 bg-rose-950/40 border border-rose-800 text-rose-300 rounded-2xl text-xs font-medium">
                        ⚠️ {error}
                    </div>
                ) : filteredFlags.length === 0 ? (
                    <div className="bg-neutral-800/40 border border-neutral-750 rounded-2xl p-12 text-center text-neutral-500 space-y-2">
                        <CheckCircle className="w-10 h-10 mx-auto text-emerald-500/60" />
                        <p className="font-bold text-white text-base">No Audit Flags Received for {activeTab === "call" ? "Calls" : "Phrases"}</p>
                        <p className="text-xs">Your reviewed {activeTab === "call" ? "call sessions" : "phrases"} have no audit flags or verdict overrides.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredFlags.map((flag) => {
                            const isUnread = !flag.readAt;
                            return (
                                <div
                                    key={flag._id}
                                    className={`bg-neutral-800 border rounded-2xl p-5 shadow-xl transition-all space-y-4 ${
                                        isUnread ? "border-amber-500/50 bg-neutral-800/90" : "border-neutral-700"
                                    }`}
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-700 pb-3">
                                        <div className="flex items-center gap-2.5">
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border ${
                                                flag.isOverridden
                                                    ? "bg-rose-950/80 text-rose-300 border-rose-800/60"
                                                    : "bg-indigo-950/80 text-indigo-300 border-indigo-800/60"
                                            }`}>
                                                {flag.isOverridden ? <AlertTriangle className="w-3.5 h-3.5" /> : <Info className="w-3.5 h-3.5" />}
                                                <span>{flag.isOverridden ? "⚠️ Verdict Overridden" : "ℹ️ Audit Note"}</span>
                                            </span>

                                            <span className="text-xs font-bold text-neutral-300 font-mono">
                                                {flag.type === "call" ? `Call ID: ${flag.itemId}` : `Phrase ID: ${flag.itemId}`}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <span className="text-[11px] text-neutral-400">
                                                {formatDate(flag.createdAt)}
                                            </span>

                                            {isUnread && (
                                                <button
                                                    onClick={() => markAsRead(flag._id)}
                                                    className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                                                >
                                                    <Check className="w-3.5 h-3.5" />
                                                    <span>Mark as Read</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Verdict Comparison Box */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-neutral-900/60 p-3.5 rounded-xl border border-neutral-750 text-xs">
                                        <div className="space-y-2">
                                            <span className="text-neutral-400 text-[10px] font-bold uppercase tracking-wider block">Your Verdict</span>
                                            {flag.type === "call" ? (
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between bg-neutral-950/60 px-2.5 py-1.5 rounded border border-neutral-800">
                                                        <span className="text-neutral-300 font-semibold">👤 Speaker A:</span>
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                                            (flag.qaVerdictA || flag.qaVerdict) === "approved"
                                                                ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800"
                                                                : "bg-rose-950/80 text-rose-400 border border-rose-800"
                                                        }`}>
                                                            {(flag.qaVerdictA || flag.qaVerdict) === "approved" ? "✓ Approved" : "✗ Rejected"}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between bg-neutral-950/60 px-2.5 py-1.5 rounded border border-neutral-800">
                                                        <span className="text-neutral-300 font-semibold">👤 Speaker B:</span>
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                                            (flag.qaVerdictB || flag.qaVerdict) === "approved"
                                                                ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800"
                                                                : "bg-rose-950/80 text-rose-400 border border-rose-800"
                                                        }`}>
                                                            {(flag.qaVerdictB || flag.qaVerdict) === "approved" ? "✓ Approved" : "✗ Rejected"}
                                                        </span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className={`inline-block px-2.5 py-0.5 rounded font-bold font-mono ${
                                                    flag.qaVerdict === "approved"
                                                        ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800"
                                                        : "bg-rose-950/80 text-rose-400 border border-rose-800"
                                                }`}>
                                                    {flag.qaVerdict === "approved" ? "✓ Approved" : "✗ Rejected"}
                                                </span>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <span className="text-neutral-400 text-[10px] font-bold uppercase tracking-wider block">Admin Verdict</span>
                                            {flag.type === "call" ? (
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between bg-neutral-950/60 px-2.5 py-1.5 rounded border border-neutral-800">
                                                        <span className="text-neutral-300 font-semibold">👤 Speaker A:</span>
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                                            (flag.adminVerdictA || flag.adminVerdict) === "approved"
                                                                ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800"
                                                                : "bg-rose-950/80 text-rose-400 border border-rose-800"
                                                        }`}>
                                                            {(flag.adminVerdictA || flag.adminVerdict) === "approved" ? "✓ Approved" : "✗ Rejected"}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between bg-neutral-950/60 px-2.5 py-1.5 rounded border border-neutral-800">
                                                        <span className="text-neutral-300 font-semibold">👤 Speaker B:</span>
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                                            (flag.adminVerdictB || flag.adminVerdict) === "approved"
                                                                ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800"
                                                                : "bg-rose-950/80 text-rose-400 border border-rose-800"
                                                        }`}>
                                                            {(flag.adminVerdictB || flag.adminVerdict) === "approved" ? "✓ Approved" : "✗ Rejected"}
                                                        </span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className={`inline-block px-2.5 py-0.5 rounded font-bold font-mono ${
                                                    flag.adminVerdict === "approved"
                                                        ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800"
                                                        : "bg-rose-950/80 text-rose-400 border border-rose-800"
                                                }`}>
                                                    {flag.adminVerdict === "approved" ? "✓ Approved" : "✗ Rejected"}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Phrase Script Comparison Box */}
                                    {flag.type === "phrase" && (flag.qaText || flag.adminText) && (
                                        <div className="bg-neutral-900/90 p-3.5 rounded-xl border border-indigo-500/30 text-xs space-y-2">
                                            <span className="text-indigo-400 font-bold text-[10px] uppercase tracking-wider block">
                                                ✏️ Phrase Script Breakdown & Audit
                                            </span>
                                            {flag.originalText && flag.originalText !== flag.adminText && (
                                                <div>
                                                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">Original Recorded Script:</span>
                                                    <p className="text-neutral-400 line-through italic text-xs bg-neutral-950/60 p-2 rounded border border-neutral-800">
                                                        "{flag.originalText}"
                                                    </p>
                                                </div>
                                            )}
                                            {flag.qaText && flag.qaText !== flag.originalText && (
                                                <div>
                                                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">QA Submitted Script:</span>
                                                    <p className="text-amber-200 text-xs bg-amber-950/30 p-2 rounded border border-amber-800/40">
                                                        "{flag.qaText}"
                                                    </p>
                                                </div>
                                            )}
                                            {flag.adminText && (
                                                <div>
                                                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">Admin Final Verified Script:</span>
                                                    <p className="text-white font-semibold text-xs bg-emerald-950/30 p-2 rounded border border-emerald-800/60">
                                                        "{flag.adminText}"
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Admin Note Box */}
                                    <div className="bg-neutral-900 p-4 rounded-xl border border-amber-500/20 space-y-1">
                                        <span className="text-amber-400 font-bold text-xs uppercase tracking-wider block">
                                            Admin Feedback Note:
                                        </span>
                                        <p className="text-xs text-white leading-relaxed">
                                            "{flag.note}"
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
