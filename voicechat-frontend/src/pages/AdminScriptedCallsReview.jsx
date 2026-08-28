import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { 
    Radio, 
    CheckCircle2, 
    XCircle, 
    Clock, 
    Volume2, 
    FileText, 
    Sparkles, 
    RefreshCw, 
    ChevronRight, 
    AlertCircle, 
    Play, 
    Pause, 
    Download,
    Eye,
    ShieldAlert,
    RotateCcw,
    Check,
    X,
    Users,
    Activity,
    BarChart2,
    ZoomIn
} from "lucide-react";
import AdminNav from "../components/AdminNav.jsx";
import { getUserInfo } from "../lib/auth.js";
import { fetchAndConvertToWav } from "../lib/audioToWav.js";
import AudioVisualizer from "../components/AudioVisualizer.jsx";
import Swal from "sweetalert2";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

async function apiFetch(path, opts = {}) {
    const res = await fetch(`${BACKEND_URL}${path}`, { credentials: "include", ...opts });
    const json = await res.json().catch(() => ({ error: "Request failed" }));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
}

async function apiPatch(path, data = {}) {
    return apiFetch(path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
}

async function apiPostJson(path, data = {}) {
    return apiFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
}

function StatusBadge({ status }) {
    const s = (status || "pending").toLowerCase();
    if (s === "approved") {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-700/60 shadow-sm">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Approved</span>
            </span>
        );
    }
    if (s === "rejected") {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-950/70 text-rose-300 border border-rose-700/60 shadow-sm">
                <XCircle className="w-3.5 h-3.5 text-rose-400" />
                <span>Rejected</span>
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-950/70 text-amber-300 border border-amber-700/60 shadow-sm">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Pending</span>
        </span>
    );
}

export default function AdminScriptedCallsReview() {
    const navigate = useNavigate();
    const userInfo = getUserInfo();
    const isQaOnly = Boolean(userInfo?.isQA && !userInfo?.isAdmin);
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState("pending");
    const [languageFilter, setLanguageFilter] = useState("");
    const [error, setError] = useState("");

    const [calls, setCalls] = useState([]);
    const [loadingCalls, setLoadingCalls] = useState(true);
    const [callPages, setCallPages] = useState(1);
    const [callTotal, setCallTotal] = useState(0);
    const [reviewing, setReviewing] = useState(null);
    const [recordingNotes, setRecordingNotes] = useState({});
    const [rejectionReasons, setRejectionReasons] = useState({});
    const [actionLoading, setActionLoading] = useState(null);
    const [audioUrls, setAudioUrls] = useState({});
    const [loadingAudio, setLoadingAudio] = useState(null);
    const [qcLoading, setQcLoading] = useState({});
    const [qcResults, setQcResults] = useState({});
    const [qcErrors, setQcErrors] = useState({});
    const [zoomedImage, setZoomedImage] = useState(null);
    const [lockTimerSeconds, setLockTimerSeconds] = useState(900);
    const [lockExpired, setLockExpired] = useState(false);
    const [allLanguages, setAllLanguages] = useState([]);

    const audioRefs = useRef({});

    const rawQaList = (userInfo?.qaLanguageCodes && userInfo.qaLanguageCodes.length > 0)
        ? userInfo.qaLanguageCodes
        : (userInfo?.qaLanguageCode ? [userInfo.qaLanguageCode] : []);

    const availableLanguagesList = isQaOnly
        ? rawQaList
        : (allLanguages.length > 0 ? allLanguages : (rawQaList.length > 0 ? rawQaList : ["english", "hindi", "marathi", "bengali", "tamil", "telugu", "gujarati", "kannada", "malayalam", "punjabi"]));

    useEffect(() => {
        async function fetchLanguages() {
            try {
                const data = await apiFetch("/api/admin/qa/languages");
                if (data?.languages && Array.isArray(data.languages)) {
                    setAllLanguages(data.languages.map(l => String(l.code || l.name || l).toLowerCase()));
                }
            } catch {}
        }
        fetchLanguages();
    }, []);

    useEffect(() => {
        loadCalls();
    }, [page, statusFilter, languageFilter]);

    useEffect(() => {
        if (!reviewing) return;
        setLockTimerSeconds(900);
        setLockExpired(false);
        const interval = setInterval(() => {
            setLockTimerSeconds((prev) => {
                if (prev <= 1) {
                    clearInterval(interval);
                    setLockExpired(true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [reviewing]);

    async function loadCalls() {
        setLoadingCalls(true);
        setError("");
        try {
            const qs = `?page=${page}&limit=20&mode=scripted${statusFilter ? `&status=${statusFilter}` : ""}${languageFilter ? `&language=${encodeURIComponent(languageFilter)}` : ""}`;
            const data = await apiFetch(`/api/admin/qa/calls${qs}`);
            setCalls(data.calls || []);
            setCallPages(data.pages || 1);
            setCallTotal(data.total || 0);
        } catch (e) {
            setError(e.message);
            if (e.message.includes("Unauthorized") || e.message.includes("Forbidden")) navigate("/login");
        } finally {
            setLoadingCalls(false);
        }
    }

    async function openCallReview(call) {
        try {
            await apiPostJson(`/api/admin/qa/calls/${call.callId}/lock`);
            setReviewing(call);
            const userAId = String(call.userA?._id || call.userA || "userA");
            const userBId = String(call.userB?._id || call.userB || "userB");

            setRejectionReasons({
                [userAId]: call.recordingARejectionReason ? call.recordingARejectionReason.split(", ").map(s => s.trim()) : (call.recordingANoisy ? ["Noisy"] : []),
                [userBId]: call.recordingBRejectionReason ? call.recordingBRejectionReason.split(", ").map(s => s.trim()) : (call.recordingBNoisy ? ["Noisy"] : [])
            });
            setRecordingNotes({
                [userAId]: call.recordingAReviewNote || "",
                [userBId]: call.recordingBReviewNote || ""
            });
            setQcResults({
                [userAId]: call.recordingAQCResult || null,
                [userBId]: call.recordingBQCResult || null
            });
        } catch (err) {
            await loadCalls();
            Swal.fire({
                icon: 'warning',
                title: 'Scripted Call Locked',
                text: err.message || 'This scripted call is currently locked for review by another QA reviewer.',
                confirmButtonColor: '#6366f1'
            });
        }
    }

    async function closeCallReview() {
        if (reviewing?.callId) {
            try {
                await apiPostJson(`/api/admin/qa/calls/${reviewing.callId}/unlock`);
            } catch {}
        }
        setReviewing(null);
        setLockExpired(false);
    }

    async function playAudio(callId, targetSpeaker) {
        const key = `${callId}_${targetSpeaker}`;
        if (audioUrls[key]) {
            const el = audioRefs.current[key];
            if (el) {
                if (el.paused) el.play().catch(() => {});
                else el.pause();
            }
            return;
        }

        setLoadingAudio(key);
        try {
            const url = `${BACKEND_URL}/api/admin/qa/calls/${callId}/recording/${targetSpeaker}`;
            const wavBlob = await fetchAndConvertToWav(url);
            const blobUrl = URL.createObjectURL(wavBlob);
            setAudioUrls(prev => ({ ...prev, [key]: blobUrl }));
            setTimeout(() => {
                const el = audioRefs.current[key];
                if (el) el.play().catch(() => {});
            }, 100);
        } catch (err) {
            Swal.fire('Playback Error', err.message || 'Failed to load audio', 'error');
        } finally {
            setLoadingAudio(null);
        }
    }

    const toggleReason = (userId, reason) => {
        setRejectionReasons(prev => {
            const userReasons = prev[userId] || [];
            const exists = userReasons.includes(reason);
            const updated = exists ? userReasons.filter(r => r !== reason) : [...userReasons, reason];
            return { ...prev, [userId]: updated };
        });
    };

    const getSelectedReasons = (userId) => {
        return rejectionReasons[userId] || [];
    };

    async function runAudioQC(callId, userId) {
        setQcLoading(prev => ({ ...prev, [userId]: true }));
        setQcErrors(prev => ({ ...prev, [userId]: null }));
        try {
            const res = await apiFetch(`/api/admin/qa/calls/${callId}/analyze/${userId}`, { method: "POST" });
            if (res.qc) {
                setQcResults(prev => ({ ...prev, [userId]: res.qc }));
            }
        } catch (err) {
            setQcErrors(prev => ({ ...prev, [userId]: err.message || 'QC analysis failed' }));
        } finally {
            setQcLoading(prev => ({ ...prev, [userId]: false }));
        }
    }

    async function actOnRecording(callId, userId, action) {
        if (lockExpired) {
            Swal.fire({
                icon: 'error',
                title: '15-Min Lock Expired',
                text: 'Your 15-minute review window for this call has expired. Please close and re-open the call from the queue to lock it again.',
                confirmButtonColor: '#6366f1'
            });
            return;
        }

        const selectedReasons = getSelectedReasons(userId);
        if (action === 'reject' && selectedReasons.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Rejection Reason Required',
                text: 'Please select at least one rejection reason (e.g. Off-Topic, Noisy, or Script Deviation) before rejecting.',
                confirmButtonColor: '#6366f1'
            });
            return;
        }

        const result = await Swal.fire({
            title: action === 'approve' ? 'Approve Speaker Recording?' : 'Reject Speaker Recording?',
            text: `Are you sure you want to ${action} this speaker's recording?`,
            icon: action === 'approve' ? 'question' : 'warning',
            showCancelButton: true,
            confirmButtonColor: action === 'approve' ? '#10b981' : '#ef4444',
            cancelButtonColor: '#404040',
            confirmButtonText: action === 'approve' ? 'Yes, approve' : 'Yes, reject'
        });

        if (!result.isConfirmed) return;

        setActionLoading(`${action}_${userId}`);
        const note = recordingNotes[userId] || "";
        const isNoisy = selectedReasons.includes("Noisy");

        try {
            const data = await apiPatch(`/api/admin/qa/calls/${callId}/${action}/${userId}`, {
                note: note.trim(),
                isNoisy,
                rejectionReason: action === 'reject' ? selectedReasons.join(", ") : null
            });

            if (data.call) {
                setReviewing(prev => ({ ...prev, ...data.call }));
            }
            await loadCalls();

            Swal.fire({
                icon: 'success',
                title: `Recording ${action === 'approve' ? 'Approved' : 'Rejected'}`,
                timer: 1200,
                showConfirmButton: false
            });
        } catch (err) {
            Swal.fire('Action Failed', err.message, 'error');
        } finally {
            setActionLoading(null);
        }
    }

    return (
        <div className="min-h-screen bg-neutral-900 text-white flex">
            <AdminNav />
            <div className="flex-1 md:ml-64 p-6 min-w-0">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-neutral-800">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <div className="p-2 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-md shadow-primary-500/20">
                                <Radio className="w-5 h-5" />
                            </div>
                            <h1 className="text-2xl font-bold">Scripted Calls Review</h1>
                            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary-900/60 text-primary-300 border border-primary-700/50">
                                QA & Audio Audit
                            </span>
                        </div>
                        <p className="text-sm text-neutral-400">
                            Audit dual-speaker scripted conversations with per-speaker approval controls and full stereo monitoring.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={loadCalls}
                            disabled={loadingCalls}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-semibold transition-all disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${loadingCalls ? 'animate-spin' : ''}`} />
                            <span>Refresh</span>
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="mt-6 flex flex-wrap items-center gap-3">
                    <div className="flex bg-neutral-800/80 p-1 rounded-xl border border-neutral-700/60">
                        {["pending", "approved", "rejected", ""].map((st) => (
                            <button
                                key={st}
                                onClick={() => { setStatusFilter(st); setPage(1); }}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${statusFilter === st ? "bg-primary-600 text-white shadow-sm" : "text-neutral-400 hover:text-white"}`}
                            >
                                {st || "All Calls"}
                            </button>
                        ))}
                    </div>

                    {availableLanguagesList.length > 0 && (
                        <select
                            value={languageFilter}
                            onChange={(e) => { setLanguageFilter(e.target.value); setPage(1); }}
                            className="bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-primary-500 capitalize"
                        >
                            <option value="">All Languages</option>
                            {availableLanguagesList.map(lang => (
                                <option key={lang} value={lang} className="capitalize">{lang}</option>
                            ))}
                        </select>
                    )}
                </div>

                {error && (
                    <div className="mt-4 p-4 rounded-xl bg-rose-900/30 border border-rose-700/50 text-rose-300 text-sm flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Call Table */}
                <div className="mt-6 bg-neutral-800/60 border border-neutral-700/60 rounded-2xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-neutral-800/90 text-neutral-400 uppercase font-semibold border-b border-neutral-700/80">
                                <tr>
                                    <th className="py-3.5 px-4">Call ID & Scenario</th>
                                    <th className="py-3.5 px-4">Speaker A (Host)</th>
                                    <th className="py-3.5 px-4">Speaker B (Guest)</th>
                                    <th className="py-3.5 px-4">Language</th>
                                    <th className="py-3.5 px-4">Duration</th>
                                    <th className="py-3.5 px-4">Status</th>
                                    <th className="py-3.5 px-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-750">
                                {loadingCalls ? (
                                    <tr>
                                        <td colSpan="7" className="py-12 text-center text-neutral-400">
                                            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                                            <span>Loading scripted calls...</span>
                                        </td>
                                    </tr>
                                ) : calls.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="py-12 text-center text-neutral-400">
                                            <Radio className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
                                            <span>No scripted calls found in this category.</span>
                                        </td>
                                    </tr>
                                ) : (
                                    calls.map((call) => (
                                        <tr key={call.callId} className="hover:bg-neutral-750/40 transition-colors">
                                            <td className="py-4 px-4">
                                                <div className="font-mono text-[11px] text-primary-400 font-semibold mb-0.5">
                                                    {call.callId}
                                                </div>
                                                <div className="text-white font-medium text-xs">
                                                    {call.subtopicId?.title || "Scripted Scenario"}
                                                </div>
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="text-white font-semibold mb-1">
                                                    {call.userA?.firstname || "Speaker A"} {call.userA?.lastname || ""}
                                                </div>
                                                <StatusBadge status={call.recordingAStatus} />
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="text-white font-semibold mb-1">
                                                    {call.userB?.firstname || "Speaker B"} {call.userB?.lastname || ""}
                                                </div>
                                                <StatusBadge status={call.recordingBStatus} />
                                            </td>
                                            <td className="py-4 px-4">
                                                <span className="capitalize font-bold text-neutral-300">
                                                    {call.language || "English"}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4 font-mono text-neutral-300">
                                                {call.actualCallDuration ? `${call.actualCallDuration}s` : `${call.recordingADurationMinutes || 0} min`}
                                            </td>
                                            <td className="py-4 px-4">
                                                <StatusBadge status={call.callStatus} />
                                            </td>
                                            <td className="py-4 px-4 text-right">
                                                <button
                                                    onClick={() => openCallReview(call)}
                                                    className="px-3.5 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 font-bold text-xs text-white shadow-md transition-all flex items-center gap-1 ml-auto"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                    <span>Review</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {callPages > 1 && (
                        <div className="p-4 border-t border-neutral-750 flex items-center justify-between text-xs text-neutral-400">
                            <span>Total {callTotal} scripted calls</span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40"
                                >
                                    Prev
                                </button>
                                <span>Page {page} of {callPages}</span>
                                <button
                                    onClick={() => setPage(p => Math.min(callPages, p + 1))}
                                    disabled={page === callPages}
                                    className="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Review Modal */}
                {reviewing && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={closeCallReview}>
                        <div className="bg-neutral-850 border border-neutral-700/80 rounded-2xl w-full max-w-5xl my-8 overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                            {/* Modal Header */}
                            <div className="p-5 border-b border-neutral-750 flex items-center justify-between bg-neutral-800/80">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-lg font-bold text-white">
                                            {reviewing.subtopicId?.title || "Scripted Conversation Audit"}
                                        </h2>
                                        <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-neutral-700 text-neutral-300">
                                            {reviewing.callId}
                                        </span>
                                    </div>
                                    <p className="text-xs text-neutral-400 mt-1">
                                        Language: <span className="text-primary-400 font-bold capitalize">{reviewing.language || "English"}</span> • 
                                        Lock Timer: <span className="text-amber-400 font-mono font-bold">{Math.floor(lockTimerSeconds / 60)}:{(lockTimerSeconds % 60).toString().padStart(2, '0')}</span>
                                    </p>
                                </div>
                                <button
                                    onClick={closeCallReview}
                                    className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div className="p-6 overflow-y-auto space-y-6">
                                {/* Top Stereo Audio Player */}
                                <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 via-neutral-800 to-indigo-950/40 border border-neutral-700/80 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Sparkles className="w-4 h-4 text-emerald-400" />
                                            <span className="text-xs font-bold text-white uppercase tracking-wider">
                                                Full Stitched Conversation (Stereo Dual-Channel)
                                            </span>
                                        </div>
                                        <span className="text-xs text-neutral-400 font-mono">
                                            Left: Spk A • Right: Spk B
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => playAudio(reviewing.callId, "stereo")}
                                            disabled={loadingAudio === `${reviewing.callId}_stereo`}
                                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-xs text-white shadow-md transition-all disabled:opacity-50"
                                        >
                                            {loadingAudio === `${reviewing.callId}_stereo` ? (
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <>
                                                    <Play className="w-4 h-4 fill-white" />
                                                    <span>Play Full Stitched Stereo Audio</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    {audioUrls[`${reviewing.callId}_stereo`] && (
                                        <audio
                                            ref={el => audioRefs.current[`${reviewing.callId}_stereo`] = el}
                                            src={audioUrls[`${reviewing.callId}_stereo`]}
                                            controls
                                            className="w-full h-8 mt-1"
                                        />
                                    )}
                                </div>

                                {/* Per-Speaker Review Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {[
                                        { user: reviewing.userA, side: "A", roleLabel: "Speaker A (Host)", status: reviewing.recordingAStatus, file: reviewing.recordingAFile, isHost: true },
                                        { user: reviewing.userB, side: "B", roleLabel: "Speaker B (Guest)", status: reviewing.recordingBStatus, file: reviewing.recordingBFile, isHost: false }
                                    ].map(({ user, side, roleLabel, status, file, isHost }) => {
                                        const userId = String(user?._id || user || (isHost ? "userA" : "userB"));
                                        const audioKey = `${reviewing.callId}_${userId}`;
                                        const selectedReasons = getSelectedReasons(userId);

                                        return (
                                            <div key={side} className="p-5 rounded-2xl bg-neutral-800/80 border border-neutral-700/80 flex flex-col justify-between space-y-4 shadow-lg">
                                                <div className="space-y-3">
                                                    {/* Header */}
                                                    <div className="flex items-center justify-between pb-2 border-b border-neutral-700/60">
                                                        <div>
                                                            <div className={`text-xs font-bold uppercase tracking-wider ${isHost ? 'text-primary-400' : 'text-indigo-400'}`}>
                                                                {roleLabel}
                                                            </div>
                                                            <div className="text-sm font-semibold text-white mt-0.5">
                                                                {user?.firstname || (isHost ? "Speaker A" : "Speaker B")} {user?.lastname || ""}
                                                            </div>
                                                            <div className="text-[11px] font-mono text-neutral-400">
                                                                {user?.speakerId || user?.username || userId}
                                                            </div>
                                                        </div>
                                                        <StatusBadge status={status} />
                                                    </div>

                                                    {/* Audio Player */}
                                                    <div>
                                                        <label className="block text-[10px] text-neutral-400 font-bold uppercase mb-1.5">
                                                            Audio Waveform & Playback
                                                        </label>
                                                        {audioUrls[audioKey] ? (
                                                            <div className="space-y-2">
                                                                <AudioVisualizer 
                                                                    url={audioUrls[audioKey]}
                                                                    audioRef={{ current: audioRefs.current[audioKey] }} 
                                                                />
                                                                <audio 
                                                                    ref={el => audioRefs.current[audioKey] = el}
                                                                    controls 
                                                                    src={audioUrls[audioKey]} 
                                                                    className="w-full h-8 rounded" 
                                                                />
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => playAudio(reviewing.callId, userId)}
                                                                disabled={loadingAudio === audioKey}
                                                                className={`w-full py-2.5 rounded-xl font-bold text-xs text-white shadow-md transition-all flex items-center justify-center gap-2 ${isHost ? 'bg-primary-600 hover:bg-primary-500' : 'bg-indigo-600 hover:bg-indigo-500'} disabled:opacity-50`}
                                                            >
                                                                {loadingAudio === audioKey ? (
                                                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                                ) : (
                                                                    <>
                                                                        <Play className="w-4 h-4 fill-white" />
                                                                        <span>Play {roleLabel} Audio</span>
                                                                    </>
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Audio QC Analyzer Card */}
                                                    <div className="pt-2 border-t border-neutral-700/60">
                                                        <button
                                                            onClick={() => runAudioQC(reviewing.callId, userId)}
                                                            disabled={qcLoading[userId]}
                                                            className="w-full py-1.5 px-3 rounded-lg bg-neutral-750 hover:bg-neutral-700 text-xs font-semibold text-neutral-200 border border-neutral-600 flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                                                        >
                                                            {qcLoading[userId] ? (
                                                                <>
                                                                    <div className="w-3.5 h-3.5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                                                                    <span>Running QC Analyzer...</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Activity className="w-3.5 h-3.5 text-primary-400" />
                                                                    <span>{qcResults[userId] ? "Re-run Audio QC Analyzer" : "Run Audio QC Analyzer"}</span>
                                                                </>
                                                            )}
                                                        </button>

                                                        {qcErrors[userId] && (
                                                            <div className="mt-1.5 text-[11px] text-rose-400 font-medium">
                                                                ⚠️ {qcErrors[userId]}
                                                            </div>
                                                        )}

                                                        {qcResults[userId] && (
                                                            <div className="mt-2 p-2.5 rounded-xl bg-neutral-900/60 border border-neutral-700/60 text-[11px] space-y-2">
                                                                <div className="flex justify-between">
                                                                    <span className="text-neutral-400">YAMNet Noise:</span>
                                                                    <span className="font-bold text-emerald-400">
                                                                        {qcResults[userId].yamnet?.rating_label || "Pass"}
                                                                    </span>
                                                                </div>
                                                                {qcResults[userId].freq && (
                                                                    <div className="grid grid-cols-2 gap-2 text-neutral-300">
                                                                        <div>Bit Verdict: <span className="font-bold">{qcResults[userId].freq.bit_verdict || "24-bit"}</span></div>
                                                                        <div>Noise Floor: <span className="font-bold">{qcResults[userId].freq.noise_floor_db || "-60"} dBFS</span></div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Review Note */}
                                                    <div>
                                                        <label className="block text-[10px] text-neutral-400 font-bold uppercase mb-1">
                                                            Review Note
                                                        </label>
                                                        <textarea
                                                            rows={2}
                                                            value={recordingNotes[userId] || ""}
                                                            onChange={(e) => setRecordingNotes(prev => ({ ...prev, [userId]: e.target.value }))}
                                                            placeholder={`Add specific feedback for ${roleLabel}...`}
                                                            className="w-full p-2.5 rounded-xl bg-neutral-900/80 border border-neutral-700 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-primary-500 resize-none"
                                                        />
                                                    </div>

                                                    {/* Rejection Reasons Selector */}
                                                    <div className="p-2.5 rounded-xl bg-neutral-900/60 border border-neutral-700/60 space-y-1.5">
                                                        <div className="text-[10px] font-bold text-neutral-400 uppercase flex items-center justify-between">
                                                            <span>Rejection Reason(s)</span>
                                                            <span className="text-[9px] text-neutral-500 font-normal">Required if rejecting</span>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2 pt-1">
                                                            {[
                                                                { id: "Off-Topic Conversation", label: "🗣️ Off-Topic" },
                                                                { id: "Noisy", label: "🔊 Noisy" },
                                                                { id: "Script Deviation", label: "🎙️ Script Deviation" }
                                                            ].map(r => (
                                                                <label key={r.id} className="inline-flex items-center gap-1.5 text-xs text-neutral-300 cursor-pointer select-none bg-neutral-800/80 px-2 py-1 rounded-lg border border-neutral-700 hover:border-neutral-600 transition-colors">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedReasons.includes(r.id)}
                                                                        onChange={() => toggleReason(userId, r.id)}
                                                                        className="w-3.5 h-3.5 text-rose-600 bg-neutral-900 border-neutral-600 rounded focus:ring-rose-500 cursor-pointer"
                                                                    />
                                                                    <span>{r.label}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Action Buttons */}
                                                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-700/60">
                                                    <button
                                                        onClick={() => actOnRecording(reviewing.callId, userId, "approve")}
                                                        disabled={actionLoading === `approve_${userId}`}
                                                        className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all disabled:opacity-40 flex items-center justify-center gap-1"
                                                    >
                                                        {actionLoading === `approve_${userId}` ? (
                                                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                        ) : (
                                                            <>
                                                                <Check className="w-3.5 h-3.5" />
                                                                <span>Approve</span>
                                                            </>
                                                        )}
                                                    </button>

                                                    <button
                                                        onClick={() => actOnRecording(reviewing.callId, userId, "reject")}
                                                        disabled={actionLoading === `reject_${userId}`}
                                                        className="py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition-all disabled:opacity-40 flex items-center justify-center gap-1"
                                                    >
                                                        {actionLoading === `reject_${userId}` ? (
                                                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                        ) : (
                                                            <>
                                                                <X className="w-3.5 h-3.5" />
                                                                <span>Reject</span>
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 border-t border-neutral-750 bg-neutral-800/60 flex items-center justify-end">
                                <button
                                    onClick={closeCallReview}
                                    className="px-5 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-xs font-bold text-neutral-200 transition-colors"
                                >
                                    Close Modal
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
