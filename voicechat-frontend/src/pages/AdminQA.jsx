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

const STATUS_COLOR = {
    pending: "bg-yellow-900/50 text-yellow-300",
    approved: "bg-green-900/50 text-green-300",
    rejected: "bg-red-900/50 text-red-300",
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
        recordingBStatus: updatedCall.recordingBStatus,
        recordingBReviewNote: updatedCall.recordingBReviewNote,
        recordingBDurationMinutes: updatedCall.recordingBDurationMinutes,
        recordingBPayoutUsd: updatedCall.recordingBPayoutUsd,
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
    const [statusFilter, setStatusFilter] = useState(isQaOnly ? "pending" : "");
    const [error, setError] = useState("");

    const [calls, setCalls] = useState([]);
    const [loadingCalls, setLoadingCalls] = useState(true);
    const [callPages, setCallPages] = useState(1);
    const [callTotal, setCallTotal] = useState(0);
    const [reviewing, setReviewing] = useState(null);
    const [notes, setNotes] = useState("");
    const [recordingNotes, setRecordingNotes] = useState({});
    const [actionLoading, setActionLoading] = useState(null);
    const [audioUrls, setAudioUrls] = useState({});
    const [loadingAudio, setLoadingAudio] = useState(null);
    const [qcLoading, setQcLoading] = useState({});
    const [qcResults, setQcResults] = useState({});
    const [qcErrors, setQcErrors] = useState({});
    const [zoomedImage, setZoomedImage] = useState(null);

    // Audio refs for visualizer
    const audioRefs = React.useRef({});

    useEffect(() => {
        loadCalls();
    }, [page, statusFilter]);

    async function loadCalls() {
        setLoadingCalls(true);
        setError("");
        try {
            const qs = `?page=${page}&limit=20${statusFilter ? `&status=${statusFilter}` : ""}`;
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

    function filterOverlappingEvents(events) {
        if (!Array.isArray(events)) return [];
        const sorted = [...events].sort((a, b) => (a.timestamp_sec || 0) - (b.timestamp_sec || 0));
        const filtered = [];
        for (const evt of sorted) {
            const last = filtered[filtered.length - 1];
            if (!last || (evt.timestamp_sec - last.timestamp_sec >= 4)) {
                filtered.push(evt);
            }
        }
        return filtered;
    }

    function playSpotcheck(callId, userId, timestampSec) {
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
        try {
            const data = await apiPatch(`/api/admin/qa/calls/${callId}/${action}/${userId}`, { note: note.trim() });
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

    function getCallStart(call) {
        return call?.recordingAStartedAt || call?.recordingBStartedAt || call?.actualCallStartedAt || call?.startedAt;
    }

    function getParticipantLabel(user) {
        if (!user) return "?";
        if (isQaOnly) return user._id || "?";
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
                    {isQaOnly ? (
                        <div className="bg-yellow-900/40 border border-yellow-700/50 text-yellow-300 text-sm font-semibold rounded-lg px-3 py-2 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
                            Pending Calls Only
                        </div>
                    ) : (
                        <select
                            value={statusFilter}
                            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                            className="bg-neutral-700 border border-neutral-600 text-white text-sm rounded-lg px-3 py-2"
                        >
                            <option value="">All Calls</option>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                        </select>
                    )}
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
                                                <td className="px-4 py-3 font-mono text-xs text-neutral-400">{call.callId.slice(0, 8)}...</td>
                                                <td className="px-4 py-3">
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-white text-xs font-mono">{getParticipantLabel(call.userA)}</span>
                                                            <StatusBadge status={call.recordingAStatus || "pending"} />
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-neutral-300 text-xs font-mono">{getParticipantLabel(call.userB)}</span>
                                                            <StatusBadge status={call.recordingBStatus || "pending"} />
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
                                                        onClick={() => {
                                                            setReviewing(call);
                                                            setNotes(call.reviewNotes || "");
                                                            setRecordingNotes({
                                                                [call.userA?._id]: call.recordingAReviewNote || "",
                                                                [call.userB?._id]: call.recordingBReviewNote || ""
                                                            });
                                                            setQcResults({
                                                                [call.userA?._id]: call.recordingAQCResult || null,
                                                                [call.userB?._id]: call.recordingBQCResult || null
                                                            });
                                                        }}
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
                <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4" onClick={() => setReviewing(null)}>
                    <div className="bg-neutral-800 border border-neutral-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700">
                            <div>
                                <h2 className="text-lg font-bold text-white">Review Call</h2>
                                <p className="text-xs text-neutral-400 font-mono">{reviewing.callId}</p>
                            </div>
                            <button onClick={() => setReviewing(null)} className="text-neutral-400 hover:text-white">x</button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <div className="text-neutral-400 mb-1">Topic</div>
                                    <div className="text-white">
                                        <div>{reviewing.subtopicId?.title || "-"}</div>
                                        {reviewing.subtopicId?.description && (
                                            <div className="text-xs text-neutral-500 mt-0.5">{reviewing.subtopicId.description}</div>
                                        )}
                                    </div>
                                </div>
                                <div><div className="text-neutral-400 mb-1">Duration</div><div className="text-white">{dur(getCallStart(reviewing), reviewing.endedAt)}</div></div>
                                <div><div className="text-neutral-400 mb-1">Language</div><div className="text-white capitalize">{reviewing.language || "-"}</div></div>
                                <div><div className="text-neutral-400 mb-1">Date</div><div className="text-white text-xs">{fmt(reviewing.startedAt)}</div></div>
                            </div>
                            {[
                                { user: reviewing.userA, status: reviewing.recordingAStatus, file: reviewing.recordingAFile, side: "A" },
                                { user: reviewing.userB, status: reviewing.recordingBStatus, file: reviewing.recordingBFile, side: "B" },
                            ].map(({ user, status, file, side }) => {
                                if (!user) return null;
                                const key = `${reviewing.callId}_${user._id}`;
                                const recStatus = status || "pending";
                                return (
                                    <div key={key} className="bg-neutral-700 rounded-xl p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="font-semibold text-white text-sm font-mono">{getParticipantLabel(user)}</div>
                                                <div className="text-xs text-neutral-400">Recording {side}</div>
                                            </div>
                                            <StatusBadge status={recStatus} />
                                        </div>
                                        <div className="text-xs text-neutral-400">
                                            {side === "A"
                                                ? formatPayout(reviewing.recordingAPayoutUsd, reviewing.recordingADurationMinutes)
                                                : formatPayout(reviewing.recordingBPayoutUsd, reviewing.recordingBDurationMinutes)}
                                        </div>
                                        {((side === "A" ? reviewing.recordingAReviewNote : reviewing.recordingBReviewNote) || "").trim() && (
                                            <div className="rounded-lg border border-neutral-600 bg-neutral-800/60 px-3 py-2 text-xs text-neutral-300">
                                                {side === "A" ? reviewing.recordingAReviewNote : reviewing.recordingBReviewNote}
                                            </div>
                                        )}
                                        <div>
                                            <label className="block text-[10px] text-neutral-500 mb-1 uppercase font-bold">Review Note</label>
                                            <textarea
                                                rows={2}
                                                value={recordingNotes[user._id] || ""}
                                                onChange={(e) => setRecordingNotes(prev => ({ ...prev, [user._id]: e.target.value }))}
                                                placeholder="Enter review notes..."
                                                className="w-full bg-neutral-800 border border-neutral-600 text-white text-xs rounded-lg px-2 py-1.5 resize-none focus:border-warning-500 outline-none"
                                            />
                                        </div>
                                        {file ? (
                                            audioUrls[key] ? (
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
                                            ) : (
                                                <button onClick={() => loadCallAudio(reviewing.callId, user._id)} disabled={loadingAudio === key} className="w-full py-2 bg-neutral-600 hover:bg-neutral-500 text-white text-xs rounded-lg disabled:opacity-50">
                                                    {loadingAudio === key ? "Loading..." : "Load Audio (WAV)"}
                                                </button>
                                            )
                                        ) : <div className="text-xs text-neutral-500 text-center py-2">No recording available</div>}
                                        
                                        {/* Audio QC Analyzer Card */}
                                        {file && (
                                            <div className="pt-2 border-t border-neutral-600">
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
                                                                    {filterOverlappingEvents(qcResults[user._id].yamnet.events).map((e, idx) => (
                                                                        <button
                                                                            key={idx}
                                                                            onClick={() => playSpotcheck(reviewing.callId, user._id, e.timestamp_sec)}
                                                                            className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border transition-all ${
                                                                                e.severity === 'heavy' 
                                                                                    ? 'bg-error-950/40 text-error-300 border-error-800 hover:bg-error-900/60' 
                                                                                    : 'bg-warning-950/40 text-warning-300 border-warning-800 hover:bg-warning-900/60'
                                                                            }`}
                                                                        >
                                                                            <span>🔊</span>
                                                                            <span className="font-mono font-bold">[{e.timestamp}]</span>
                                                                            <span>{e.class}</span>
                                                                            <span className="opacity-60">({Number(e.score).toFixed(2)})</span>
                                                                        </button>
                                                                    ))}
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
                                        
                                        <div className="flex gap-2">
                                            <button onClick={() => actOnRecording(reviewing.callId, user._id, "approve")} disabled={!!actionLoading} className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50">
                                                {actionLoading === `approve_${user._id}` ? "Saving..." : "Approve"}
                                            </button>
                                            <button onClick={() => actOnRecording(reviewing.callId, user._id, "reject")} disabled={!!actionLoading} className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50">
                                                {actionLoading === `reject_${user._id}` ? "Saving..." : "Reject"}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            <div>
                                <label className="block text-sm text-neutral-400 mb-1">Review Notes (optional)</label>
                                <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full bg-neutral-700 border border-neutral-600 text-white text-sm rounded-lg px-3 py-2 resize-none" />
                                <button onClick={saveNotes} disabled={!!actionLoading} className="mt-2 w-full py-2 bg-neutral-600 hover:bg-neutral-500 text-white text-xs font-semibold rounded-lg disabled:opacity-50">
                                    {actionLoading === "notes" ? "Saving..." : "Save Notes"}
                                </button>
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
