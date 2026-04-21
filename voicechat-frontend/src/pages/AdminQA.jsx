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
    const [statusFilter, setStatusFilter] = useState("");
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
        </div>
    );
}
