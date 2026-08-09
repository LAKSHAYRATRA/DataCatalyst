import React, { useEffect, useState } from "react";
import AdminNav from "../components/AdminNav.jsx";
import { HelpCircle, Phone, FileText, CheckCircle, XCircle, AlertTriangle, ShieldCheck, Play, Pause, RefreshCw, UserCheck } from "lucide-react";
import Swal from "sweetalert2";

import { apiGet, apiPostJson } from "../lib/api.js";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1" ? "https://api.voclara.com" : "http://localhost:3001");

export default function AdminAmbiguity() {
    const [subTab, setSubTab] = useState("call"); // "call" | "phrase" | "qa"
    const [statusFilter, setStatusFilter] = useState("pending"); // "pending" | "resolved" | "all"
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [items, setItems] = useState([]);
    const [qaBreakdown, setQaBreakdown] = useState([]);
    const [stats, setStats] = useState({ pendingCalls: 0, pendingPhrases: 0, totalPending: 0 });
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const [speakerADecisions, setSpeakerADecisions] = useState({});
    const [speakerBDecisions, setSpeakerBDecisions] = useState({});
    const [adminNotes, setAdminNotes] = useState({});
    const [playingAudio, setPlayingAudio] = useState(null);
    const [actionLoading, setActionLoading] = useState({});

    useEffect(() => {
        loadStats();
    }, []);

    useEffect(() => {
        loadItems();
    }, [subTab, statusFilter, page]);

    async function loadStats() {
        try {
            const data = await apiGet("/api/admin/ambiguity/stats");
            setStats(data);
        } catch (e) {
            console.error("Failed to load ambiguity stats:", e);
        }
    }

    async function loadItems() {
        setLoading(true);
        setError("");
        try {
            if (subTab === "qa") {
                const data = await apiGet("/api/admin/ambiguity/qa-breakdown");
                setQaBreakdown(data.qaBreakdown || []);
            } else {
                const data = await apiGet(`/api/admin/ambiguity?type=${subTab}&status=${statusFilter}&page=${page}&limit=15`);
                setItems(data.ambiguities || []);
                setTotalPages(data.pages || 1);
            }
        } catch (e) {
            setError(e.message || "Failed to load ambiguities.");
        } finally {
            setLoading(false);
        }
    }

    async function handleResolveCall(itemId) {
        const decisionA = speakerADecisions[itemId] || "approved";
        const decisionB = speakerBDecisions[itemId] || "approved";
        const notes = adminNotes[itemId] || "";
        setActionLoading(prev => ({ ...prev, [itemId]: true }));
        try {
            await apiPostJson(`/api/admin/ambiguity/${itemId}/resolve`, { decisionA, decisionB, notes });
            Swal.fire({
                title: "Call Ambiguity Resolved!",
                text: `Successfully rendered final verdicts (Speaker A: ${decisionA.toUpperCase()}, Speaker B: ${decisionB.toUpperCase()}).`,
                icon: "success",
                background: "#1f2937",
                color: "#fff"
            });
            loadStats();
            loadItems();
        } catch (e) {
            Swal.fire({
                title: "Error",
                text: e.message || "Failed to resolve ambiguity.",
                icon: "error",
                background: "#1f2937",
                color: "#fff"
            });
        } finally {
            setActionLoading(prev => ({ ...prev, [itemId]: false }));
        }
    }

    async function handleResolve(itemId, decision) {
        const notes = adminNotes[itemId] || "";
        setActionLoading(prev => ({ ...prev, [itemId]: true }));
        try {
            await apiPostJson(`/api/admin/ambiguity/${itemId}/resolve`, { decision, notes });
            Swal.fire({
                title: "Ambiguity Resolved!",
                text: `Successfully marked final verdict as ${decision.toUpperCase()}.`,
                icon: "success",
                background: "#1f2937",
                color: "#fff"
            });
            loadStats();
            loadItems();
        } catch (e) {
            Swal.fire({
                title: "Error",
                text: e.message || "Failed to resolve ambiguity.",
                icon: "error",
                background: "#1f2937",
                color: "#fff"
            });
        } finally {
            setActionLoading(prev => ({ ...prev, [itemId]: false }));
        }
    }

    const togglePlay = (audioKey) => {
        if (playingAudio === audioKey) {
            setPlayingAudio(null);
        } else {
            setPlayingAudio(audioKey);
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

            <div className="p-6 max-w-7xl mx-auto space-y-6">
                {/* Header Banner */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-neutral-800 border border-neutral-700 p-6 rounded-2xl shadow-xl">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                                <HelpCircle className="w-6 h-6" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-white">Ambiguity & Audit Sampling</h1>
                                <p className="text-xs text-neutral-400 mt-0.5">
                                    QA Accuracy Benchmark • Spot-check 2% blind audit samples and resolve QA verdict conflicts
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => { loadStats(); loadItems(); }}
                            className="p-2.5 bg-neutral-700 hover:bg-neutral-600 rounded-xl text-neutral-300 transition-colors"
                            title="Refresh Data"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Sub-Tabs: Calls | Phrases */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-750 pb-2">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => { setSubTab("call"); setPage(1); }}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                                subTab === "call"
                                    ? "bg-amber-500 text-neutral-950 shadow-lg shadow-amber-500/20"
                                    : "bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-750"
                            }`}
                        >
                            <Phone className="w-4 h-4" />
                            <span>Calls Ambiguity</span>
                            {stats.pendingCalls > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-black bg-neutral-900 text-amber-400">
                                    {stats.pendingCalls}
                                </span>
                            )}
                        </button>

                        <button
                            onClick={() => { setSubTab("phrase"); setPage(1); }}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                                subTab === "phrase"
                                    ? "bg-amber-500 text-neutral-950 shadow-lg shadow-amber-500/20"
                                    : "bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-750"
                            }`}
                        >
                            <FileText className="w-4 h-4" />
                            <span>Phrases Ambiguity</span>
                            {stats.pendingPhrases > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-black bg-neutral-900 text-amber-400">
                                    {stats.pendingPhrases}
                                </span>
                            )}
                        </button>

                        <button
                            onClick={() => { setSubTab("qa"); setPage(1); }}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                                subTab === "qa"
                                    ? "bg-amber-500 text-neutral-950 shadow-lg shadow-amber-500/20"
                                    : "bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-750"
                            }`}
                        >
                            <UserCheck className="w-4 h-4" />
                            <span>QAs Breakdown</span>
                        </button>
                    </div>

                    {/* Filter status */}
                    {subTab !== "qa" && (
                        <div className="flex items-center gap-1 bg-neutral-800 p-1 rounded-xl border border-neutral-700 text-xs font-semibold">
                            <button
                                onClick={() => setStatusFilter("pending")}
                                className={`px-3 py-1.5 rounded-lg transition-colors ${statusFilter === "pending" ? "bg-amber-500 text-neutral-950 font-bold" : "text-neutral-400 hover:text-white"}`}
                            >
                                Pending Review
                            </button>
                            <button
                                onClick={() => setStatusFilter("resolved")}
                                className={`px-3 py-1.5 rounded-lg transition-colors ${statusFilter === "resolved" ? "bg-amber-500 text-neutral-950 font-bold" : "text-neutral-400 hover:text-white"}`}
                            >
                                Resolved
                            </button>
                            <button
                                onClick={() => setStatusFilter("all")}
                                className={`px-3 py-1.5 rounded-lg transition-colors ${statusFilter === "all" ? "bg-amber-500 text-neutral-950 font-bold" : "text-neutral-400 hover:text-white"}`}
                            >
                                All Logs
                            </button>
                        </div>
                    )}
                </div>

                {/* Main Content Area */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-neutral-400 space-y-3">
                        <div className="w-8 h-8 border-3 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                        <span className="text-xs font-semibold">Loading data...</span>
                    </div>
                ) : error ? (
                    <div className="p-4 bg-rose-950/40 border border-rose-800 text-rose-300 rounded-2xl text-xs font-medium">
                        ⚠️ {error}
                    </div>
                ) : subTab === "qa" ? (
                    <div className="bg-neutral-800 border border-neutral-700 rounded-2xl overflow-hidden shadow-xl space-y-4 p-6">
                        <div className="flex items-center justify-between border-b border-neutral-700 pb-4">
                            <div>
                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                    <UserCheck className="w-5 h-5 text-amber-400" /> QA Ambiguities Breakdown
                                </h3>
                                <p className="text-xs text-neutral-400 mt-1">
                                    Summary of all call and phrase ambiguities involving each QA reviewer
                                </p>
                            </div>
                            <span className="px-3 py-1 bg-neutral-900 border border-neutral-700 rounded-full text-xs font-mono font-bold text-amber-400">
                                {qaBreakdown.length} QA Reviewers
                            </span>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-neutral-900 text-neutral-400 uppercase tracking-wider font-semibold">
                                    <tr>
                                        <th className="px-4 py-3">QA Reviewer</th>
                                        <th className="px-4 py-3 text-center">📞 Calls Ambiguities</th>
                                        <th className="px-4 py-3 text-center">💬 Phrases Ambiguities</th>
                                        <th className="px-4 py-3 text-center">📊 Total Ambiguities</th>
                                        <th className="px-4 py-3 text-center">⚡ Pending Resolution</th>
                                        <th className="px-4 py-3 text-center">✓ Resolved</th>
                                        <th className="px-4 py-3 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-700/60">
                                    {qaBreakdown.map((row) => (
                                        <tr key={row.qaUser._id} className="hover:bg-neutral-700/40 transition-colors">
                                            <td className="px-4 py-3.5">
                                                <div className="font-bold text-white text-sm">{row.qaUser.name}</div>
                                                <div className="text-neutral-400 text-xs">@{row.qaUser.username} • {row.qaUser.email}</div>
                                            </td>
                                            <td className="px-4 py-3.5 text-center">
                                                <span className="px-2.5 py-1 bg-amber-950/80 text-amber-300 border border-amber-800/60 rounded-full font-mono font-bold">
                                                    {row.callAmbiguitiesCount}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5 text-center">
                                                <span className="px-2.5 py-1 bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 rounded-full font-mono font-bold">
                                                    {row.phraseAmbiguitiesCount}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5 text-center font-bold text-white text-sm font-mono">
                                                {row.totalAmbiguitiesCount}
                                            </td>
                                            <td className="px-4 py-3.5 text-center">
                                                {row.pendingCount > 0 ? (
                                                    <span className="px-2.5 py-1 bg-rose-950/80 text-rose-300 border border-rose-800/60 rounded-full font-mono font-bold">
                                                        {row.pendingCount} Pending
                                                    </span>
                                                ) : (
                                                    <span className="text-neutral-500 font-mono text-xs">0 Pending</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3.5 text-center font-mono text-emerald-400 font-semibold">
                                                {row.resolvedCount}
                                            </td>
                                            <td className="px-4 py-3.5 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => { setSubTab("call"); setStatusFilter("all"); setPage(1); }}
                                                        className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded-lg text-xs font-semibold transition-colors"
                                                    >
                                                        View Calls
                                                    </button>
                                                    <button
                                                        onClick={() => { setSubTab("phrase"); setStatusFilter("all"); setPage(1); }}
                                                        className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded-lg text-xs font-semibold transition-colors"
                                                    >
                                                        View Phrases
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {qaBreakdown.length === 0 && (
                                        <tr>
                                            <td colSpan="7" className="text-center py-12 text-neutral-500">
                                                No QA ambiguity data found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : items.length === 0 ? (
                    <div className="bg-neutral-800/40 border border-neutral-750 rounded-2xl p-12 text-center text-neutral-500 space-y-2">
                        <ShieldCheck className="w-10 h-10 mx-auto text-emerald-500/60" />
                        <p className="font-bold text-white text-base">No {statusFilter} ambiguities found</p>
                        <p className="text-xs">All QA reviews in this tab are verified and clear.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {items.map((item) => (
                            <div key={item._id} className="bg-neutral-800 border border-neutral-700 rounded-2xl p-6 shadow-xl space-y-5">
                                {/* Item Top Info */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-700 pb-4">
                                    <div className="flex items-center gap-3">
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold font-mono border ${
                                            item.reason === "sampling"
                                                ? "bg-indigo-950/70 text-indigo-300 border-indigo-800/60"
                                                : "bg-amber-950/70 text-amber-300 border-amber-800/60"
                                        }`}>
                                            {item.reason === "sampling" ? "🎲 2% Blind Audit Sample" : "⚠️ Conflicting QA Verdicts"}
                                        </span>

                                        <span className="text-xs font-bold text-neutral-300">
                                            {subTab === "call" ? `Call ID: ${item.callId}` : `Phrase ID: ${item.phraseId}`}
                                        </span>

                                        {item.language && (
                                            <span className="text-xs px-2 py-0.5 bg-neutral-900 text-neutral-400 rounded border border-neutral-700 font-mono">
                                                {item.language}
                                            </span>
                                        )}
                                    </div>

                                    <div className="text-xs text-neutral-400">
                                        Logged: {formatDate(item.createdAt)}
                                    </div>
                                </div>

                                {/* QAs Who Reviewed Details Box */}
                                <div className="space-y-3">
                                    <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                                        <UserCheck className="w-4 h-4 text-amber-400" />
                                        QAs Who Reviewed ({item.qaReviews?.length || 0})
                                    </h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {(item.qaReviews || []).map((rev, rIdx) => (
                                            <div key={rIdx} className="bg-neutral-900/70 border border-neutral-750 p-4 rounded-xl space-y-2 text-xs">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <span className="font-bold text-white">{rev.qaName || rev.qaUsername || "QA Reviewer"}</span>
                                                        <span className="text-[11px] text-neutral-400 block">{rev.qaEmail}</span>
                                                    </div>

                                                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                                                        rev.action === "approved"
                                                            ? "bg-emerald-950/70 text-emerald-400 border border-emerald-800"
                                                            : "bg-rose-950/70 text-rose-400 border border-rose-800"
                                                    }`}>
                                                        {rev.action === "approved" ? "✓ Approved" : "✗ Rejected"}
                                                    </span>
                                                </div>

                                                {subTab === "call" ? (
                                                    <div className="space-y-2 mt-2 pt-2 border-t border-neutral-800 text-[11px]">
                                                        {/* Speaker A Box */}
                                                        <div className="bg-neutral-950/70 p-2.5 rounded-lg border border-neutral-800 space-y-1">
                                                            <div className="flex items-center justify-between font-bold">
                                                                <span className="text-neutral-300">👤 Speaker A Review:</span>
                                                                <span className={`px-2 py-0.5 rounded text-[10px] ${
                                                                    rev.recordingAAction === "approved"
                                                                        ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800"
                                                                        : "bg-rose-950/80 text-rose-400 border border-rose-800"
                                                                }`}>
                                                                    {rev.recordingAAction === "approved" ? "✓ Approved" : "✗ Rejected"}
                                                                </span>
                                                            </div>
                                                            {rev.recordingARejectionReason && (
                                                                <div className="text-amber-300 text-[10px] font-semibold bg-amber-950/30 px-2 py-0.5 rounded border border-amber-900/40">
                                                                    Reason: {rev.recordingARejectionReason}
                                                                </div>
                                                            )}
                                                            {rev.recordingAReviewNote && (
                                                                <div className="text-neutral-300 italic text-[10px] bg-neutral-800/80 p-1.5 rounded">
                                                                    "{rev.recordingAReviewNote}"
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Speaker B Box */}
                                                        <div className="bg-neutral-950/70 p-2.5 rounded-lg border border-neutral-800 space-y-1">
                                                            <div className="flex items-center justify-between font-bold">
                                                                <span className="text-neutral-300">👤 Speaker B Review:</span>
                                                                <span className={`px-2 py-0.5 rounded text-[10px] ${
                                                                    rev.recordingBAction === "approved"
                                                                        ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800"
                                                                        : "bg-rose-950/80 text-rose-400 border border-rose-800"
                                                                }`}>
                                                                    {rev.recordingBAction === "approved" ? "✓ Approved" : "✗ Rejected"}
                                                                </span>
                                                            </div>
                                                            {rev.recordingBRejectionReason && (
                                                                <div className="text-amber-300 text-[10px] font-semibold bg-amber-950/30 px-2 py-0.5 rounded border border-amber-900/40">
                                                                    Reason: {rev.recordingBRejectionReason}
                                                                </div>
                                                            )}
                                                            {rev.recordingBReviewNote && (
                                                                <div className="text-neutral-300 italic text-[10px] bg-neutral-800/80 p-1.5 rounded">
                                                                    "{rev.recordingBReviewNote}"
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        {rev.rejectionReason && (
                                                            <div className="text-[11px] text-amber-300 font-semibold bg-amber-950/30 px-2 py-1 rounded border border-amber-900/40">
                                                                Reason: {rev.rejectionReason}
                                                            </div>
                                                        )}

                                                        {rev.comment && (
                                                            <div className="text-[11px] text-neutral-300 italic bg-neutral-800 p-2 rounded">
                                                                "{rev.comment}"
                                                            </div>
                                                        )}
                                                    </>
                                                )}

                                                <div className="text-[10px] text-neutral-500 text-right">
                                                    {formatDate(rev.reviewedAt)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Content Details & Audio Player */}
                                <div className="bg-neutral-900/40 p-4 rounded-xl border border-neutral-750 space-y-3">
                                    {subTab === "phrase" ? (
                                        <div className="space-y-2">
                                            <div className="text-sm font-bold text-white">"{item.text || item.phraseDetails?.text}"</div>
                                            {item.audioFile && (
                                                <div className="flex items-center gap-3">
                                                    <audio
                                                        src={`${BACKEND_URL}/api/phrases/stream/${item.phraseDetails?._id || item.phraseId}`}
                                                        controls
                                                        controlsList="nodownload"
                                                        className="w-full h-9 rounded-lg"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="text-xs font-semibold text-neutral-300">
                                                Topic: {item.callDetails?.topicId?.title || "Standard Call Session"}
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div>
                                                    <span className="text-[11px] text-neutral-400 block mb-1">Speaker A Audio:</span>
                                                    <audio
                                                        src={`${BACKEND_URL}/api/admin/qa/calls/${item.callId}/stream/A`}
                                                        controls
                                                        controlsList="nodownload"
                                                        className="w-full h-9 rounded-lg"
                                                    />
                                                </div>
                                                <div>
                                                    <span className="text-[11px] text-neutral-400 block mb-1">Speaker B Audio:</span>
                                                    <audio
                                                        src={`${BACKEND_URL}/api/admin/qa/calls/${item.callId}/stream/B`}
                                                        controls
                                                        controlsList="nodownload"
                                                        className="w-full h-9 rounded-lg"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Admin Final Verdict Panel */}
                                {item.status === "pending" ? (
                                    subTab === "call" ? (
                                        <div className="bg-neutral-900 p-4 rounded-xl border border-amber-500/30 space-y-4">
                                            <div className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                                                Admin Final Resolution (Individual Speaker Verdicts)
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {/* Speaker A Decision Box */}
                                                <div className="bg-neutral-950/80 p-3 rounded-lg border border-neutral-800 space-y-2">
                                                    <div className="text-xs font-bold text-neutral-300">👤 Speaker A Final Verdict</div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setSpeakerADecisions(prev => ({ ...prev, [item._id]: "approved" }))}
                                                            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border ${
                                                                (speakerADecisions[item._id] || "approved") === "approved"
                                                                    ? "bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950/50"
                                                                    : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white"
                                                            }`}
                                                        >
                                                            ✓ Approve Speaker A
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setSpeakerADecisions(prev => ({ ...prev, [item._id]: "rejected" }))}
                                                            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border ${
                                                                speakerADecisions[item._id] === "rejected"
                                                                    ? "bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-950/50"
                                                                    : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white"
                                                            }`}
                                                        >
                                                            ✗ Reject Speaker A
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Speaker B Decision Box */}
                                                <div className="bg-neutral-950/80 p-3 rounded-lg border border-neutral-800 space-y-2">
                                                    <div className="text-xs font-bold text-neutral-300">👤 Speaker B Final Verdict</div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setSpeakerBDecisions(prev => ({ ...prev, [item._id]: "approved" }))}
                                                            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border ${
                                                                (speakerBDecisions[item._id] || "approved") === "approved"
                                                                    ? "bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950/50"
                                                                    : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white"
                                                            }`}
                                                        >
                                                            ✓ Approve Speaker B
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setSpeakerBDecisions(prev => ({ ...prev, [item._id]: "rejected" }))}
                                                            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border ${
                                                                speakerBDecisions[item._id] === "rejected"
                                                                    ? "bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-950/50"
                                                                    : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white"
                                                            }`}
                                                        >
                                                            ✗ Reject Speaker B
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            <textarea
                                                rows={2}
                                                value={adminNotes[item._id] || ""}
                                                onChange={(e) => setAdminNotes({ ...adminNotes, [item._id]: e.target.value })}
                                                placeholder="Enter Admin notes / rationale for final verdicts..."
                                                className="w-full bg-neutral-800 border border-neutral-700 text-white text-xs rounded-xl px-3 py-2 outline-none focus:border-amber-400 resize-none"
                                            />

                                            <button
                                                onClick={() => handleResolveCall(item._id)}
                                                disabled={actionLoading[item._id]}
                                                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-extrabold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-amber-950/30"
                                            >
                                                <CheckCircle className="w-4 h-4" />
                                                Submit Speaker A & B Final Verdicts
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="bg-neutral-900 p-4 rounded-xl border border-amber-500/30 space-y-3">
                                            <div className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                                                Admin Final Resolution
                                            </div>

                                            <textarea
                                                rows={2}
                                                value={adminNotes[item._id] || ""}
                                                onChange={(e) => setAdminNotes({ ...adminNotes, [item._id]: e.target.value })}
                                                placeholder="Enter Admin notes / rationale for final verdict..."
                                                className="w-full bg-neutral-800 border border-neutral-700 text-white text-xs rounded-xl px-3 py-2 outline-none focus:border-amber-400 resize-none"
                                            />

                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => handleResolve(item._id, "approved")}
                                                    disabled={actionLoading[item._id]}
                                                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <CheckCircle className="w-4 h-4" />
                                                    Confirm Final Approval
                                                </button>
                                                <button
                                                    onClick={() => handleResolve(item._id, "rejected")}
                                                    disabled={actionLoading[item._id]}
                                                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <XCircle className="w-4 h-4" />
                                                    Confirm Final Rejection
                                                </button>
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    <div className="bg-neutral-900/60 p-4 rounded-xl border border-neutral-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                                        <div className="space-y-1">
                                            <span className="text-neutral-400 block font-semibold uppercase text-[10px]">Resolved Admin Verdicts</span>
                                            {subTab === "call" ? (
                                                <div className="flex items-center gap-2 font-mono font-bold text-xs">
                                                    <span className={`px-2 py-0.5 rounded border ${
                                                        (item.adminDecisionA || "approved") === "approved"
                                                            ? "bg-emerald-950/80 text-emerald-400 border-emerald-800"
                                                            : "bg-rose-950/80 text-rose-400 border-rose-800"
                                                    }`}>
                                                        👤 Speaker A: {(item.adminDecisionA || "approved").toUpperCase()}
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded border ${
                                                        (item.adminDecisionB || "approved") === "approved"
                                                            ? "bg-emerald-950/80 text-emerald-400 border-emerald-800"
                                                            : "bg-rose-950/80 text-rose-400 border-rose-800"
                                                    }`}>
                                                        👤 Speaker B: {(item.adminDecisionB || "approved").toUpperCase()}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className={`font-mono font-bold text-sm ${item.adminDecision === "approved" ? "text-emerald-400" : "text-rose-400"}`}>
                                                    {item.adminDecision?.toUpperCase()}
                                                </span>
                                            )}
                                            {item.adminNotes && (
                                                <p className="text-neutral-300 italic mt-1">"{item.adminNotes}"</p>
                                            )}
                                        </div>
                                        <div className="text-right text-neutral-400 text-[11px]">
                                            Resolved: {formatDate(item.resolvedAt)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
