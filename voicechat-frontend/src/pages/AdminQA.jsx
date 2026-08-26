import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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

const STATUS_COLOR = {
    pending: "bg-yellow-900/50 text-yellow-300",
    approved: "bg-green-900/50 text-green-300",
    rejected: "bg-red-900/50 text-red-300",
};

const getRecordingStatusBadge = (status) => {
    if (!status) {
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-neutral-700 text-neutral-300">N/A</span>;
    }

    const config = {
        pending: { bg: 'bg-yellow-900/50', text: 'text-yellow-300', icon: '⏳' },
        approved: { bg: 'bg-success-900/50', text: 'text-success-300', icon: '✓' },
        rejected: { bg: 'bg-error-900/50', text: 'text-error-300', icon: '✗' }
    };

    const { bg, text, icon } = config[status] || config.pending;
    return <span className={`px-2 py-1 text-xs font-medium rounded-full ${bg} ${text}`}>{icon} {status}</span>;
};

function StatusBadge({ status }) {
    const icon = status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : "Pending";
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full capitalize ${STATUS_COLOR[status] || "bg-neutral-700 text-neutral-300"}`}>
            {icon}
        </span>
    );
}

function mergeReviewFields(call, updatedCall) {
    if (!call || !updatedCall) return call;
    return {
        ...call,
        callStatus: updatedCall.callStatus,
        recordingAStatus: updatedCall.recordingAStatus,
        recordingAReviewNote: updatedCall.recordingAReviewNote,
        recordingADurationMinutes: updatedCall.recordingADurationMinutes,
        recordingAPayoutUsd: updatedCall.recordingAPayoutUsd,
        recordingANoisy: updatedCall.recordingANoisy,
        recordingBStatus: updatedCall.recordingBStatus,
        recordingBReviewNote: updatedCall.recordingBReviewNote,
        recordingBDurationMinutes: updatedCall.recordingBDurationMinutes,
        recordingBPayoutUsd: updatedCall.recordingBPayoutUsd,
        recordingBNoisy: updatedCall.recordingBNoisy,
        reviewedBy: updatedCall.reviewedBy,
        reviewedAt: updatedCall.reviewedAt,
        reviewNotes: updatedCall.reviewNotes,
    };
}

export default function AdminQA() {
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
    const [notes, setNotes] = useState("");
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
    const [playedSpotchecks, setPlayedSpotchecks] = useState({});

    const [allLanguages, setAllLanguages] = useState([]);

    const rawQaList = (userInfo?.qaLanguageCodes && userInfo.qaLanguageCodes.length > 0)
        ? userInfo.qaLanguageCodes
        : (userInfo?.qaLanguageCode ? [userInfo.qaLanguageCode] : []);

    const availableLanguagesList = isQaOnly
        ? rawQaList
        : (allLanguages.length > 0 ? allLanguages : (rawQaList.length > 0 ? rawQaList : ["english", "hindi", "marathi", "bengali", "tamil", "telugu", "gujarati", "kannada", "malayalam", "punjabi"]));

    // Audio refs for visualizer
    const audioRefs = React.useRef({});

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
            const qs = `?page=${page}&limit=20${statusFilter ? `&status=${statusFilter}` : ""}${languageFilter ? `&language=${encodeURIComponent(languageFilter)}` : ""}`;
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
            setNotes(call.reviewNotes || "");
            setPlayedSpotchecks({});
            setRejectionReasons({
                [call.userA?._id]: call.recordingARejectionReason ? call.recordingARejectionReason.split(", ").map(s => s.trim()) : (call.recordingANoisy ? ["Noisy"] : []),
                [call.userB?._id]: call.recordingBRejectionReason ? call.recordingBRejectionReason.split(", ").map(s => s.trim()) : (call.recordingBNoisy ? ["Noisy"] : [])
            });
            setRecordingNotes({
                [call.userA?._id]: call.recordingAReviewNote || "",
                [call.userB?._id]: call.recordingBReviewNote || ""
            });
            setQcResults({
                [call.userA?._id]: call.recordingAQCResult || null,
                [call.userB?._id]: call.recordingBQCResult || null
            });
        } catch (err) {
            await loadCalls();
            Swal.fire({
                icon: 'warning',
                title: 'Call Locked',
                text: err.message || 'This call is currently locked for review by another QA reviewer.',
                confirmButtonColor: '#ea580c'
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

    async function runAudioQC(callId, userId) {
        setQcLoading(prev => ({ ...prev, [userId]: true }));
        setQcErrors(prev => ({ ...prev, [userId]: null }));
        try {
            const data = await apiPostJson(`/api/admin/qa/calls/${callId}/analyze/${userId}`);
            setQcResults(prev => ({ ...prev, [userId]: data }));
            if (reviewing) {
                setReviewing(prev => {
                    if (!prev) return prev;
                    const isUserA = String(prev.userA?._id) === String(userId);
                    return {
                        ...prev,
                        recordingAQCResult: isUserA ? data : prev.recordingAQCResult,
                        recordingBQCResult: !isUserA ? data : prev.recordingBQCResult,
                    };
                });
            }
            await loadCalls();
        } catch (err) {
            setQcErrors(prev => ({ ...prev, [userId]: err.message || err }));
        } finally {
            setQcLoading(prev => ({ ...prev, [userId]: false }));
        }
    }

    function getSortedQcEvents(events) {
        if (!Array.isArray(events)) return [];
        const sortedByTime = [...events].sort((a, b) => (a.timestamp_sec || 0) - (b.timestamp_sec || 0));
        const filtered = [];
        for (const evt of sortedByTime) {
            const last = filtered[filtered.length - 1];
            if (!last || (evt.timestamp_sec - last.timestamp_sec >= 4)) {
                filtered.push(evt);
            } else if ((Number(evt.score) || 0) > (Number(last.score) || 0)) {
                filtered[filtered.length - 1] = evt;
            }
        }
        // Sort descending by noise intensity (score e.g. 0.85 -> 0.70 -> 0.55)
        return filtered.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
    }

    function getSelectedReasons(userId) {
        const val = rejectionReasons[userId];
        if (Array.isArray(val)) return val;
        if (typeof val === 'string' && val.trim()) return val.split(", ").map(s => s.trim());
        return [];
    }

    function toggleReason(userId, reason, callId) {
        setRejectionReasons(prev => {
            const current = getSelectedReasons(userId);
            let next;
            if (current.includes(reason)) {
                next = current.filter(r => r !== reason);
            } else {
                next = [...current, reason];
            }
            
            if (reason === "Noisy") {
                const isNowNoisy = next.includes("Noisy");
                toggleNoisy(callId, userId, isNowNoisy);
            }
            
            return { ...prev, [userId]: next };
        });
    }

    function playSpotcheck(callId, userId, timestampSec) {
        setPlayedSpotchecks(prev => {
            const userPlayed = prev[userId] || [];
            if (!userPlayed.includes(timestampSec)) {
                return { ...prev, [userId]: [...userPlayed, timestampSec] };
            }
            return prev;
        });

        const key = `${callId}_${userId}`;
        const audioEl = audioRefs.current[key];
        if (audioEl) {
            audioEl.currentTime = Math.max(0, timestampSec - 2);
            audioEl.play().catch(() => {});
        } else {
            loadCallAudio(callId, userId).then(() => {
                setTimeout(() => {
                    const el = audioRefs.current[key];
                    if (el) {
                        el.currentTime = Math.max(0, timestampSec - 2);
                        el.play().catch(() => {});
                    }
                }, 500);
            });
        }
    }

    async function loadCallAudio(callId, userId) {
        const key = `${callId}_${userId}`;
        if (audioUrls[key]) return;
        setLoadingAudio(key);
        try {
            const url = `${BACKEND_URL}/api/admin/qa/calls/${callId}/recording/${userId}`;
            const wavBlob = await fetchAndConvertToWav(url);
            setAudioUrls((prev) => ({ ...prev, [key]: URL.createObjectURL(wavBlob) }));
        } catch (e) {
            Swal.fire({
                icon: 'error',
                title: 'Audio Conversion Failed',
                text: "The audio format could not be converted to WAV in your browser. " + e.message,
                confirmButtonColor: '#ea580c'
            });
        } finally {
            setLoadingAudio(null);
        }
    }

    async function actOnRecording(callId, userId, action) {
        if (lockExpired) {
            Swal.fire({
                icon: 'error',
                title: '15-Min Lock Expired',
                text: 'Your 15-minute review window for this call has expired. Please close and re-open the call from the queue to lock it again.',
                confirmButtonColor: '#ea580c'
            });
            return;
        }

        const selectedReasons = getSelectedReasons(userId);
        if (action === 'reject' && selectedReasons.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Rejection Reason Required',
                text: 'Please check at least one rejection reason (Off-Topic Conversation or Noisy) before rejecting this recording.',
                confirmButtonColor: '#ea580c'
            });
            return;
        }

        const result = await Swal.fire({
            title: action === 'approve' ? 'Approve Recording?' : 'Reject Recording?',
            text: `Are you sure you want to ${action} this recording?`,
            icon: action === 'approve' ? 'question' : 'warning',
            showCancelButton: true,
            confirmButtonColor: action === 'approve' ? '#16a34a' : '#dc2626',
            cancelButtonColor: '#404040',
            confirmButtonText: action === 'approve' ? 'Yes, approve' : 'Yes, reject'
        });

        if (!result.isConfirmed) return;

        setActionLoading(`${action}_${userId}`);
        const note = recordingNotes[userId] || "";
        const isNoisy = selectedReasons.includes("Noisy") || (reviewing?.userA?._id?.toString() === userId.toString()
            ? !!reviewing?.recordingANoisy
            : !!reviewing?.recordingBNoisy);

        try {
            const data = await apiPatch(`/api/admin/qa/calls/${callId}/${action}/${userId}`, {
                note: note.trim(),
                isNoisy,
                rejectionReason: action === 'reject' ? selectedReasons.join(", ") : null
            });
            if (reviewing?.callId === callId && data.call) {
                setReviewing((prev) => mergeReviewFields(prev, data.call));
            }
            await loadCalls();
            Swal.fire({
                icon: 'success',
                title: 'Success',
                text: `Recording ${action}d successfully.`,
                timer: 1500,
                showConfirmButton: false
            });
        } catch (e) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: e.message,
                confirmButtonColor: '#ea580c'
            });
        } finally {
            setActionLoading(null);
        }
    }

    async function toggleNoisy(callId, userId, isNoisy) {
        try {
            const data = await apiPatch(`/api/admin/qa/calls/${callId}/noisy/${userId}`, { isNoisy });
            if (reviewing?.callId === callId && data.call) {
                setReviewing((prev) => mergeReviewFields(prev, data.call));
            }
            await loadCalls();
        } catch (e) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: e.message,
                confirmButtonColor: '#ea580c'
            });
        }
    }

    async function saveNotes() {
        if (!reviewing) return;
        setActionLoading("notes");
        try {
            await apiPatch(`/api/admin/qa/calls/${reviewing.callId}`, { notes });
            await loadCalls();
            setReviewing(null);
            Swal.fire({
                icon: 'success',
                title: 'Notes Saved',
                timer: 1500,
                showConfirmButton: false
            });
        } catch (e) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: e.message,
                confirmButtonColor: '#ea580c'
            });
        } finally {
            setActionLoading(null);
        }
    }

    function fmt(d) {
        if (!d) return "-";
        return new Date(d).toLocaleString("en-IN", {
            day: "numeric",
            month: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
        });
    }

    function dur(s, e) {
        if (!s || !e) return "-";
        const diff = new Date(e) - new Date(s);
        return `${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`;
    }

    function formatSeconds(seconds) {
        if (!seconds || seconds < 0) return "-";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}m ${secs}s`;
    }

    function getCallStart(call) {
        return call?.recordingAStartedAt || call?.recordingBStartedAt || call?.actualCallStartedAt || call?.startedAt;
    }

    function getParticipantLabel(user, side = "") {
        if (!user) return side ? `Speaker ${side}` : "?";
        if (isQaOnly) {
            return side ? `Speaker ${side}` : "Speaker";
        }
        return user.username || user._id || "?";
    }

    function formatPayout(amount, minutes) {
        const payout = Number(amount) || 0;
        const mins = Number(minutes) || 0;
        if (payout <= 0 || mins <= 0) return "Payout pending";
        return `$${payout.toFixed(2)} for ${mins.toFixed(2)} mins`;
    }

    const total = callTotal;
    const pages = callPages;

    return (
        <div className="min-h-screen bg-neutral-900 pt-16 md:pt-0 md:pl-64">
            <AdminNav />
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12">
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">Q/A Review</h1>
                        <p className="text-neutral-400 text-sm">Review call recordings.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Approved / All Languages Dropdown */}
                        <select
                            value={languageFilter}
                            onChange={(e) => { setLanguageFilter(e.target.value); setPage(1); }}
                            className="bg-neutral-700 border border-neutral-600 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-warning-500 capitalize"
                        >
                            <option value="">
                                {isQaOnly ? "All Approved Languages" : "All Languages"}
                            </option>
                            {availableLanguagesList.map((lang) => (
                                <option key={lang} value={lang} className="capitalize">
                                    {lang.charAt(0).toUpperCase() + lang.slice(1)}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* 3 Status Tabs: Pending, Approved, Rejected (Left Aligned) */}
                <div className="flex flex-wrap gap-2 mb-6">
                    {[
                        { label: "Pending", value: "pending" },
                        { label: "Approved", value: "approved" },
                        { label: "Rejected", value: "rejected" }
                    ].map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() => {
                                setStatusFilter(tab.value);
                                setPage(1);
                            }}
                            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                                (statusFilter || "pending") === tab.value
                                    ? "bg-warning-600 text-white shadow-lg shadow-warning-900/20"
                                    : "bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-700"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {error && <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-4">{error}</div>}

                {loadingCalls ? (
                    <div className="flex justify-center py-16"><div className="w-12 h-12 border-4 border-warning-200 border-t-warning-500 rounded-full animate-spin" /></div>
                ) : calls.length === 0 ? (
                    <div className="text-center py-16 text-neutral-500">No calls found.</div>
                ) : (
                    <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-neutral-700">
                                    <tr>
                                        {["Call ID", "Users", "Topic", "Language", "Date", "Duration", "Action"].map((h) => (
                                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-neutral-300 uppercase tracking-wider whitespace-nowrap">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-700">
                                    {calls.map((call) => (
                                            <tr key={call.callId} className="hover:bg-neutral-700/40 transition-colors">
                                                <td className="px-4 py-3 font-mono text-xs text-neutral-300 break-all">{call.callId}</td>
                                                <td className="px-4 py-3">
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-white text-xs font-mono">{getParticipantLabel(call.userA, "A")}</span>
                                                            {statusFilter !== "pending" && <StatusBadge status={call.recordingAStatus || "pending"} />}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-neutral-300 text-xs font-mono">{getParticipantLabel(call.userB, "B")}</span>
                                                            {statusFilter !== "pending" && <StatusBadge status={call.recordingBStatus || "pending"} />}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {call.subtopicId ? (
                                                        <div>
                                                            <div className="text-sm font-medium text-white leading-tight">
                                                                {call.subtopicId.title}
                                                            </div>
                                                            {call.subtopicId.description && (
                                                                <div 
                                                                    className="text-xs text-neutral-400 mt-0.5 max-w-[200px] truncate"
                                                                    title={call.subtopicId.description}
                                                                >
                                                                    {call.subtopicId.description}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-sm text-neutral-500 italic">-</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-indigo-900/50 text-indigo-300 capitalize">
                                                        {call.language || '-'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-neutral-400 text-xs">{fmt(call.startedAt)}</td>
                                                <td className="px-4 py-3 text-neutral-300">{dur(getCallStart(call), call.endedAt)}</td>
                                                <td className="px-4 py-3">
                                                    <button
                                                        onClick={() => openCallReview(call)}
                                                        className="px-3 py-1.5 bg-warning-600 hover:bg-warning-700 text-white text-xs font-semibold rounded-lg"
                                                    >
                                                        Review
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="bg-neutral-700 px-4 py-3 flex items-center justify-between">
                            <span className="text-xs text-neutral-400">{total} total</span>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setPage((p) => p - 1)} disabled={page === 1} className="px-3 py-1 bg-neutral-600 text-white rounded text-xs disabled:opacity-40">Prev</button>
                                <span className="text-xs text-neutral-300">Page {page} / {pages}</span>
                                <button onClick={() => setPage((p) => p + 1)} disabled={page >= pages} className="px-3 py-1 bg-neutral-600 text-white rounded text-xs disabled:opacity-40">Next</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {reviewing && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={closeCallReview}>
                    <div className="bg-neutral-800 border border-neutral-700 rounded-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto p-4 md:p-6 animate-scale-in" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4 md:mb-6">
                            <h2 className="text-xl md:text-2xl font-bold text-white">Review Call</h2>
                            <button onClick={closeCallReview} className="text-neutral-400 hover:text-white">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <div className="text-sm text-neutral-400 mb-1">Call ID</div>
                                    <div className="text-white font-mono text-xs md:text-sm break-all">{reviewing.callId}</div>
                                </div>
                                <div>
                                    <div className="text-sm text-neutral-400 mb-1">Status</div>
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${reviewing.endReason === 'completed' ? 'bg-success-900/50 text-success-300' :
                                        'bg-neutral-700 text-neutral-300'
                                        }`}>
                                        {reviewing.endReason || 'Unknown'}
                                    </span>
                                </div>
                            </div>

                            <div>
                                <div className="text-sm text-neutral-400 mb-2">Participants</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-neutral-700 p-3 rounded-lg">
                                        <div className="text-white font-semibold text-sm md:text-base">{getParticipantLabel(reviewing.userA, "A")}</div>
                                        {!isQaOnly && <div className="text-xs text-neutral-400 break-all">{reviewing.userA?.email}</div>}
                                        {reviewing.questionerUserId?.toString() === reviewing.userA?._id?.toString() && (
                                            <div className="text-xs text-warning-400 mt-1">Questioner</div>
                                        )}
                                        {reviewing.answererUserId?.toString() === reviewing.userA?._id?.toString() && (
                                            <div className="text-xs text-success-400 mt-1">Answerer</div>
                                        )}
                                    </div>
                                    <div className="bg-neutral-700 p-3 rounded-lg">
                                        <div className="text-white font-semibold text-sm md:text-base">{getParticipantLabel(reviewing.userB, "B")}</div>
                                        {!isQaOnly && <div className="text-xs text-neutral-400 break-all">{reviewing.userB?.email}</div>}
                                        {reviewing.questionerUserId?.toString() === reviewing.userB?._id?.toString() && (
                                            <div className="text-xs text-warning-400 mt-1">Questioner</div>
                                        )}
                                        {reviewing.answererUserId?.toString() === reviewing.userB?._id?.toString() && (
                                            <div className="text-xs text-success-400 mt-1">Answerer</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {reviewing.subtopicId && (
                                <div>
                                    <div className="text-sm text-neutral-400 mb-1">Topic</div>
                                    <div className="text-white text-sm md:text-base">{reviewing.subtopicId.title}</div>
                                    {reviewing.subtopicId.description && (
                                        <div className="text-xs text-neutral-500 mt-1">{reviewing.subtopicId.description}</div>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <div className="text-sm text-neutral-400 mb-1">Started</div>
                                    <div className="text-white text-xs md:text-sm">{fmt(reviewing.startedAt)}</div>
                                </div>
                                <div>
                                    <div className="text-sm text-neutral-400 mb-1">Ended</div>
                                    <div className="text-white text-xs md:text-sm">{reviewing.endedAt ? fmt(reviewing.endedAt) : '-'}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <div className="text-sm text-neutral-400 mb-1">Negotiation Duration</div>
                                    <div className="text-white">{formatSeconds(reviewing.negotiationDuration)}</div>
                                </div>
                                <div>
                                    <div className="text-sm text-neutral-400 mb-1">Call Duration</div>
                                    <div className="text-white">{dur(getCallStart(reviewing), reviewing.endedAt)}</div>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-neutral-700">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <div className="text-sm text-neutral-400">Recordings</div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {[
                                        { user: reviewing.userA, status: reviewing.recordingAStatus, file: reviewing.recordingAFile, side: "A", payoutUsd: reviewing.recordingAPayoutUsd, durMins: reviewing.recordingADurationMinutes, prevNote: reviewing.recordingAReviewNote },
                                        { user: reviewing.userB, status: reviewing.recordingBStatus, file: reviewing.recordingBFile, side: "B", payoutUsd: reviewing.recordingBPayoutUsd, durMins: reviewing.recordingBDurationMinutes, prevNote: reviewing.recordingBReviewNote },
                                    ].map(({ user, status, file, side, payoutUsd, durMins, prevNote }) => {
                                        if (!user) return null;
                                        const key = `${reviewing.callId}_${user._id}`;
                                        return (
                                            <div key={key} className="bg-neutral-700 p-4 rounded-lg flex flex-col justify-between">
                                                <div>
                                                    <div className="text-white font-semibold mb-2">{getParticipantLabel(user, side)}</div>
                                                    {statusFilter !== "pending" && (
                                                        <div className="mb-3">
                                                            <div className="text-xs text-neutral-400 mb-1">Status</div>
                                                            {getRecordingStatusBadge(status)}
                                                        </div>
                                                    )}
                                                    <div className="mb-3 text-xs text-neutral-400">
                                                        {formatPayout(payoutUsd, durMins)}
                                                    </div>
                                                    {(prevNote || "").trim() && (
                                                        <div className="mb-3 rounded-lg border border-neutral-600 bg-neutral-800/60 px-3 py-2 text-xs text-neutral-300">
                                                            {prevNote}
                                                        </div>
                                                    )}

                                                    {/* Audio Visualizer & Player */}
                                                    <div className="mb-3">
                                                        <label className="block text-[10px] text-neutral-400 mb-1 uppercase font-bold">Listen Recording</label>
                                                        {audioUrls[key] ? (
                                                            <div className="space-y-2">
                                                                <AudioVisualizer 
                                                                    url={audioUrls[key]}
                                                                    audioRef={{ current: audioRefs.current[key] }} 
                                                                />
                                                                <audio 
                                                                    ref={(el) => (audioRefs.current[key] = el)}
                                                                    controls 
                                                                    src={audioUrls[key]} 
                                                                    className="w-full h-9 rounded" 
                                                                    controlsList="nodownload noplaybackrate" 
                                                                    onContextMenu={(e) => e.preventDefault()}
                                                                />
                                                            </div>
                                                        ) : file ? (
                                                            <button 
                                                                onClick={() => loadCallAudio(reviewing.callId, user._id)} 
                                                                disabled={loadingAudio === key} 
                                                                className="w-full py-2 bg-neutral-800 hover:bg-neutral-600 border border-neutral-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
                                                            >
                                                                {loadingAudio === key ? "Loading WAV..." : "▶ Load Audio Waveform"}
                                                            </button>
                                                        ) : (
                                                            <div className="text-xs text-neutral-500 text-center py-2">No recording available</div>
                                                        )}
                                                    </div>

                                                    {/* Audio QC Analyzer Card */}
                                                    {file && (
                                                        <div className="mb-4 pt-3 border-t border-neutral-600">
                                                            <button
                                                                onClick={() => runAudioQC(reviewing.callId, user._id)}
                                                                disabled={qcLoading[user._id]}
                                                                className="w-full inline-flex items-center justify-center px-4 py-2 bg-neutral-800 hover:bg-neutral-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold border border-neutral-600 transition-colors"
                                                            >
                                                                {qcLoading[user._id] ? (
                                                                    <span className="flex items-center gap-1.5">
                                                                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                                        Running QC Analysis...
                                                                    </span>
                                                                ) : (qcResults[user._id] ? "🔄 Re-run QC Analyzer" : "📊 Run Audio QC Analyzer")}
                                                            </button>

                                                            {qcErrors[user._id] && (
                                                                <div className="mt-2 text-xs text-error-400 font-medium">
                                                                    ⚠️ {qcErrors[user._id]}
                                                                </div>
                                                            )}

                                                            {qcResults[user._id] && (
                                                                <div className="mt-3 space-y-3 bg-neutral-900/40 p-3 rounded-lg border border-neutral-700/50">
                                                                    <div className="flex justify-between text-xs">
                                                                        <span className="text-neutral-400">YAMNet Noise:</span>
                                                                        <span className={`font-bold ${qcResults[user._id].yamnet?.suspicion_rating === 10 ? 'text-error-400' : qcResults[user._id].yamnet?.suspicion_rating === 5 ? 'text-warning-400' : 'text-success-400'}`}>
                                                                            {qcResults[user._id].yamnet?.rating_label || 'Pass'}
                                                                        </span>
                                                                    </div>
                                                                    {qcResults[user._id].yamnet?.events && qcResults[user._id].yamnet.events.length > 0 ? (
                                                                        <div className="space-y-1.5">
                                                                            <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Spotcheck Noise Events (Click to play 8s)</div>
                                                                            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                                                                                {getSortedQcEvents(qcResults[user._id].yamnet.events).map((e, idx) => {
                                                                                     const isPlayed = (playedSpotchecks[user._id] || []).includes(e.timestamp_sec);
                                                                                     return (
                                                                                         <button
                                                                                             key={idx}
                                                                                             onClick={() => playSpotcheck(reviewing.callId, user._id, e.timestamp_sec)}
                                                                                             className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border transition-all ${
                                                                                                 isPlayed
                                                                                                     ? 'bg-emerald-950/70 text-emerald-300 border-emerald-600 font-bold'
                                                                                                     : e.severity === 'heavy' 
                                                                                                         ? 'bg-error-950/40 text-error-300 border-error-800 hover:bg-error-900/60' 
                                                                                                         : 'bg-warning-950/40 text-warning-300 border-warning-800 hover:bg-warning-900/60'
                                                                                             }`}
                                                                                         >
                                                                                             <span>{isPlayed ? '✓' : '🔊'}</span>
                                                                                             <span className="font-mono font-bold">[{e.timestamp}]</span>
                                                                                             <span>{e.class}</span>
                                                                                             <span className="opacity-80 font-bold text-amber-300">({Number(e.score).toFixed(2)})</span>
                                                                                         </button>
                                                                                     );
                                                                                 })}
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        qcResults[user._id].yamnet?.top_noise_events && qcResults[user._id].yamnet.top_noise_events !== "None" && (
                                                                            <div className="text-[10px] text-error-300/80 bg-error-950/20 px-2 py-1 rounded border border-error-900/30">
                                                                                Events: {qcResults[user._id].yamnet.top_noise_events}
                                                                            </div>
                                                                        )
                                                                    )}
                                                                    {qcResults[user._id].freq && (
                                                                        <div className="grid grid-cols-2 gap-2 text-[10px] text-neutral-300">
                                                                            <div>Bit Verdict: <span className="font-bold">{qcResults[user._id].freq.bit_verdict}</span></div>
                                                                            <div>Noise Floor: <span className="font-bold">{qcResults[user._id].freq.noise_floor_db} dBFS</span></div>
                                                                            <div>Crest Factor: <span className="font-bold">{qcResults[user._id].freq.crest_factor} dB</span></div>
                                                                            <div>Processing: <span className="font-bold">{qcResults[user._id].freq.processing_verdict}</span></div>
                                                                        </div>
                                                                    )}
                                                                    {(qcResults[user._id].spectrogram || qcResults[user._id].spectrogramS3Key) && (
                                                                        <div className="mt-2 bg-black/40 rounded p-1 border border-neutral-800">
                                                                            <div className="text-[9px] text-neutral-500 mb-1 font-bold tracking-wider uppercase text-center">Nyquist Spectrogram (Click to zoom)</div>
                                                                            <img 
                                                                                src={qcResults[user._id].spectrogram 
                                                                                     ? `data:image/png;base64,${qcResults[user._id].spectrogram}`
                                                                                     : `${BACKEND_URL}/api/admin/qa/calls/${reviewing.callId}/spectrogram/${user._id}`
                                                                                 }
                                                                                alt="Spectrogram"
                                                                                crossOrigin="use-credentials"
                                                                                className="w-full rounded border border-neutral-900 cursor-zoom-in hover:opacity-80 transition-opacity"
                                                                                onClick={() => {
                                                                                    const src = qcResults[user._id].spectrogram 
                                                                                        ? `data:image/png;base64,${qcResults[user._id].spectrogram}`
                                                                                        : `${BACKEND_URL}/api/admin/qa/calls/${reviewing.callId}/spectrogram/${user._id}`;
                                                                                    setZoomedImage({ src, title: `${getParticipantLabel(user)}'s Spectrogram` });
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    <div className="mb-3">
                                                        <label className="block text-[10px] text-neutral-500 mb-1 uppercase font-bold">Review Note</label>
                                                        <textarea
                                                            rows={2}
                                                            value={recordingNotes[user._id] || ""}
                                                            onChange={(e) => setRecordingNotes(prev => ({ ...prev, [user._id]: e.target.value }))}
                                                            placeholder="Enter review notes..."
                                                            className="w-full bg-neutral-800 border border-neutral-600 text-white text-xs rounded-lg px-2 py-1.5 resize-none focus:border-warning-500 outline-none"
                                                        />
                                                    </div>
                                                      {/* Rejection Reason Selector */}
                                                      <div className="mb-3 bg-neutral-800/80 p-2.5 rounded-lg border border-neutral-600">
                                                          <div className="text-[10px] text-neutral-400 font-bold uppercase mb-1.5 flex items-center justify-between">
                                                              <span>Rejection Reason(s)</span>
                                                              <span className="text-[9px] text-neutral-500 font-normal">(At least 1 required if rejecting)</span>
                                                          </div>
                                                          <div className="flex flex-wrap items-center gap-3">
                                                              <label className="inline-flex items-center gap-1.5 text-xs text-neutral-200 cursor-pointer select-none">
                                                                  <input
                                                                      type="checkbox"
                                                                      checked={getSelectedReasons(user._id).includes("Off-Topic Conversation")}
                                                                      onChange={() => toggleReason(user._id, "Off-Topic Conversation", reviewing.callId)}
                                                                      className="w-4 h-4 text-error-600 bg-neutral-900 border-neutral-600 rounded focus:ring-error-500 cursor-pointer"
                                                                  />
                                                                  <span>🗣️ Off-Topic Conversation</span>
                                                              </label>
                                                              <label className="inline-flex items-center gap-1.5 text-xs text-neutral-200 cursor-pointer select-none">
                                                                  <input
                                                                      type="checkbox"
                                                                      checked={getSelectedReasons(user._id).includes("Noisy")}
                                                                      onChange={() => toggleReason(user._id, "Noisy", reviewing.callId)}
                                                                      className="w-4 h-4 text-error-600 bg-neutral-900 border-neutral-600 rounded focus:ring-error-500 cursor-pointer"
                                                                  />
                                                                  <span>🔊 Noisy</span>
                                                              </label>
                                                          </div>
                                                      </div>
                                                </div>

                                                     {(() => {
                                                          const hasQcResult = Boolean(qcResults[user._id]);
                                                          const yamnetEvents = qcResults[user._id]?.yamnet?.events || [];
                                                          const sortedEvts = getSortedQcEvents(yamnetEvents);
                                                          const totalEvts = sortedEvts.length;
                                                          const reqSpotchecks = totalEvts >= 3 ? 3 : totalEvts;
                                                          
                                                          const playedTimestamps = playedSpotchecks[user._id] || [];
                                                          const requiredTopEvts = sortedEvts.slice(0, reqSpotchecks);
                                                          const playedReqCount = requiredTopEvts.filter(evt => playedTimestamps.includes(evt.timestamp_sec)).length;

                                                          const isSatisfied = !isQaOnly || (hasQcResult && playedReqCount >= reqSpotchecks);

                                                          let statusMsg = "";
                                                          if (isQaOnly && !isSatisfied) {
                                                              if (!hasQcResult) {
                                                                  statusMsg = "🔒 QC Analyzer Compulsory: Run Audio QC Analyzer first to process this recording";
                                                              } else {
                                                                  statusMsg = `🔒 Spotcheck Required: Listen to at least ${reqSpotchecks} top noise events (${playedReqCount}/${reqSpotchecks} listened)`;
                                                              }
                                                          }

                                                          return (
                                                              <div>
                                                                  {isQaOnly && !isSatisfied && (
                                                                      <div className="mb-2 text-[11px] font-semibold text-amber-400 bg-amber-950/40 border border-amber-800/60 px-2.5 py-1.5 rounded-lg text-center">
                                                                          {statusMsg}
                                                                      </div>
                                                                  )}

                                                                  <div className="flex items-center gap-2 mt-4">
                                                                      <button
                                                                          onClick={() => actOnRecording(reviewing.callId, user._id, "approve")}
                                                                          disabled={actionLoading === `approve_${user._id}` || !isSatisfied}
                                                                          className="flex-1 px-3 py-2 bg-success-600 hover:bg-success-700 text-white rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                                          title={!isSatisfied ? statusMsg : ""}
                                                                      >
                                                                          {actionLoading === `approve_${user._id}` ? "Saving..." : "✓ Approve"}
                                                                      </button>
                                                                      <button
                                                                          onClick={() => actOnRecording(reviewing.callId, user._id, "reject")}
                                                                          disabled={actionLoading === `reject_${user._id}` || !isSatisfied}
                                                                          className="flex-1 px-3 py-2 bg-error-600 hover:bg-error-700 text-white rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                                          title={!isSatisfied ? statusMsg : ""}
                                                                      >
                                                                          {actionLoading === `reject_${user._id}` ? "Saving..." : "✗ Reject"}
                                                                      </button>
                                                                  </div>
                                                              </div>
                                                          );
                                                     })()}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>


                        </div>
                    </div>
                </div>
            )}

            {/* Spectrogram Zoom Modal (Lightbox) */}
            {zoomedImage && (
                <div 
                    className="fixed inset-0 bg-black/95 flex flex-col items-center justify-center p-4 z-[100] animate-fade-in cursor-zoom-out"
                    onClick={() => setZoomedImage(null)}
                >
                    <div className="absolute top-4 right-4 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                        <span className="text-white text-xs font-semibold tracking-wide bg-neutral-800/90 px-3 py-1.5 rounded-full border border-neutral-700/50">
                            {zoomedImage.title}
                        </span>
                        <button 
                            onClick={() => setZoomedImage(null)} 
                            className="bg-neutral-800 hover:bg-neutral-750 text-white rounded-full p-2 border border-neutral-700 transition-colors"
                        >
                            <svg className="w-6.5 h-6.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                    <div className="max-w-[95vw] max-h-[85vh] relative" onClick={(e) => e.stopPropagation()}>
                        <img 
                            src={zoomedImage.src} 
                            alt="Zoomed Spectrogram"
                            crossOrigin="use-credentials"
                            className="max-w-full max-h-[85vh] object-contain rounded-lg border border-neutral-800 shadow-2xl animate-scale-in"
                        />
                    </div>
                    <div className="mt-4 text-xs text-neutral-400 font-medium">
                        Click anywhere outside the spectrogram or 'X' to close zoom view
                    </div>
                </div>
            )}
        </div>
    );
}
