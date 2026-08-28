import React, { useEffect, useState, useRef } from "react";
import { 
    Download, 
    RefreshCw, 
    Layers, 
    Globe, 
    CheckCircle2, 
    XCircle, 
    Play, 
    Pause, 
    AlertCircle, 
    Volume2, 
    Radio, 
    FileAudio,
    Sparkles,
    Users
} from "lucide-react";
import Swal from "sweetalert2";
import AdminNav from "../components/AdminNav.jsx";
import { fetchAndConvertToWav } from "../lib/audioToWav.js";
import { getUserInfo } from "../lib/auth.js";

const BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
const REVIEW_BASE = "/api/admin/qa/language-applications";

async function apiFetch(path, opts = {}) {
    const res = await fetch(`${BASE}${path}`, { credentials: "include", ...opts });
    const json = await res.json().catch(() => ({ error: "Request failed" }));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
}
const get = (p) => apiFetch(p, { method: "GET" });
const patch = (p) => apiFetch(p, { method: "PATCH", headers: { "Content-Type": "application/json" } });

const STATUS_COLOR = {
    pending: "bg-amber-900/50 text-amber-300 border border-amber-700/50",
    approved: "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50",
    rejected: "bg-rose-900/50 text-rose-300 border border-rose-700/50",
};

export default function AdminScriptedCallApps() {
    const userInfo = getUserInfo();
    const [apps, setApps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState("pending");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [error, setError] = useState("");
    const [actionLoading, setActionLoading] = useState(null);
    const [audioSrc, setAudioSrc] = useState({});
    const [loadingAudio, setLoadingAudio] = useState({});
    const [playingKey, setPlayingKey] = useState(null);
    const [downloadingApp, setDownloadingApp] = useState({});
    const audioRefs = useRef({});

    useEffect(() => { 
        loadApps(); 
    }, [page, statusFilter]);

    async function fetchApps() {
        // Query language applications filtered for scripted_call type
        const qs = `?type=scripted_call&page=${page}&limit=20${statusFilter ? `&status=${statusFilter}` : ""}`;
        return get(`${REVIEW_BASE}${qs}`);
    }

    async function loadApps() {
        setLoading(true);
        setError("");
        try {
            const data = await fetchApps();
            setApps(data.applications || []);
            setTotal(data.total || 0);
            setTotalPages(data.pages || 1);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    async function act(userId, appId, action) {
        const key = `${action}_${appId}`;
        setActionLoading(key);
        try {
            await patch(`${REVIEW_BASE}/${userId}/${appId}/${action}`);
            Swal.fire({
                icon: 'success',
                title: `Applicant ${action === 'approve' ? 'Approved' : 'Rejected'}`,
                timer: 1500,
                showConfirmButton: false
            });
            await loadApps();
        } catch (e) {
            Swal.fire('Action Failed', e.message, 'error');
        } finally {
            setActionLoading(null);
        }
    }

    async function playSample(userId, appId) {
        const key = appId;
        if (audioSrc[key]) {
            const audioEl = audioRefs.current[key];
            if (audioEl) {
                if (audioEl.paused) {
                    audioEl.play().catch(() => {});
                    setPlayingKey(key);
                } else {
                    audioEl.pause();
                    setPlayingKey(null);
                }
            }
            return;
        }

        if (loadingAudio[key]) return;
        setLoadingAudio(prev => ({ ...prev, [key]: true }));
        try {
            const url = `${BASE}/api/language-applications/${userId}/${appId}/recording`;
            const wavBlob = await fetchAndConvertToWav(url);
            const blobUrl = URL.createObjectURL(wavBlob);
            setAudioSrc(prev => ({ ...prev, [key]: blobUrl }));
            setTimeout(() => {
                const audioEl = audioRefs.current[key];
                if (audioEl) {
                    audioEl.play().catch(() => {});
                    setPlayingKey(key);
                }
            }, 100);
        } catch (e) {
            Swal.fire('Audio Playback Error', e.message, 'error');
        } finally {
            setLoadingAudio(prev => ({ ...prev, [key]: false }));
        }
    }

    async function handleDownloadSingleApp(app) {
        const key = app.appId;
        const rawSpk = app.speaker_id || app.speakerId || `spk_${app.userId}`;
        const cleanSpk = String(rawSpk).replace(/[^a-zA-Z0-9_\-]/g, "");
        const rawName = [app.userFirstname, app.userLastname].filter(Boolean).join("_") || app.username || "applicant";
        const cleanName = String(rawName).trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "");
        const filename = `ScriptedCall_${cleanSpk}_${cleanName}.wav`;

        if (audioSrc[key]) {
            const a = document.createElement("a");
            a.href = audioSrc[key];
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            return;
        }

        setDownloadingApp(prev => ({ ...prev, [key]: true }));
        try {
            const url = `${BASE}/api/language-applications/${app.userId}/${app.appId}/recording`;
            const wavBlob = await fetchAndConvertToWav(url);
            const blobUrl = URL.createObjectURL(wavBlob);
            setAudioSrc(prev => ({ ...prev, [key]: blobUrl }));

            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (err) {
            Swal.fire('Download Failed', err.message, 'error');
        } finally {
            setDownloadingApp(prev => ({ ...prev, [key]: false }));
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
                            <div className="p-2 rounded-xl bg-gradient-to-r from-indigo-600 to-primary-600 text-white shadow-md shadow-indigo-500/20">
                                <Radio className="w-5 h-5" />
                            </div>
                            <h1 className="text-2xl font-bold">Scripted Calls Apps</h1>
                            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                                Applicant Screening
                            </span>
                        </div>
                        <p className="text-sm text-neutral-400">
                            Screen, verify voice samples, and approve contributors applying for Scripted Call projects.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={loadApps}
                            disabled={loading}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-semibold transition-all disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
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
                                {st || "All Applications"}
                            </button>
                        ))}
                    </div>

                    <div className="ml-auto text-xs text-neutral-400 font-semibold">
                        Total Applicants: <strong className="text-white">{total}</strong>
                    </div>
                </div>

                {error && (
                    <div className="mt-4 p-4 rounded-xl bg-rose-900/30 border border-rose-800/50 text-rose-300 text-sm flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Application Cards / Grid */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24 text-neutral-500">
                        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-sm font-semibold">Loading Scripted Call Applicants...</p>
                    </div>
                ) : apps.length === 0 ? (
                    <div className="text-center py-24 border border-dashed border-neutral-800 rounded-2xl mt-6 bg-neutral-900/40">
                        <Radio className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
                        <h3 className="text-base font-bold text-neutral-300">No Applications Found</h3>
                        <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
                            There are currently no applicant submissions under this filter.
                        </p>
                    </div>
                ) : (
                    <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {apps.map((app) => (
                            <div key={app.appId || app._id} className="p-5 rounded-2xl bg-neutral-800/50 border border-neutral-700/60 flex flex-col justify-between hover:border-neutral-600 transition-all shadow-md">
                                <div>
                                    {/* Top row */}
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-primary-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                                                {app.userFirstname?.[0] || app.username?.[0] || "U"}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-white text-base">
                                                    {app.userFirstname || app.username} {app.userLastname || ""}
                                                </h3>
                                                <div className="text-xs text-neutral-400 font-mono">
                                                    {app.userEmail}
                                                </div>
                                            </div>
                                        </div>

                                        <span className={`px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider rounded-full ${STATUS_COLOR[app.status] || "bg-neutral-700 text-neutral-300"}`}>
                                            {app.status}
                                        </span>
                                    </div>

                                    {/* Badges / Language details */}
                                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                                        <span className="px-2.5 py-1 rounded-lg bg-neutral-700/60 text-primary-300 font-bold border border-neutral-600/40">
                                            Language: {app.language || "Hindi"}
                                        </span>
                                        {app.dialect && (
                                            <span className="px-2.5 py-1 rounded-lg bg-neutral-700/60 text-neutral-300 font-medium">
                                                Dialect: {app.dialect}
                                            </span>
                                        )}
                                        {app.speakerId && (
                                            <span className="px-2.5 py-1 rounded-lg bg-neutral-900 text-neutral-400 font-mono">
                                                ID: {app.speakerId}
                                            </span>
                                        )}
                                    </div>

                                    {/* Sample Audio Player */}
                                    <div className="mt-4 p-3 rounded-xl bg-neutral-900/60 border border-neutral-800">
                                        <div className="flex items-center justify-between gap-2">
                                            <button
                                                onClick={() => playSample(app.userId, app.appId)}
                                                disabled={loadingAudio[app.appId]}
                                                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white transition-all disabled:opacity-50"
                                            >
                                                {loadingAudio[app.appId] ? (
                                                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                ) : playingKey === app.appId ? (
                                                    <>
                                                        <Pause className="w-3.5 h-3.5 fill-white" />
                                                        <span>Pause Sample</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Play className="w-3.5 h-3.5 fill-white" />
                                                        <span>Play Intro Audio Sample</span>
                                                    </>
                                                )}
                                            </button>

                                            <button
                                                onClick={() => handleDownloadSingleApp(app)}
                                                disabled={downloadingApp[app.appId]}
                                                title="Download Sample Audio"
                                                className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
                                            >
                                                <Download className="w-4 h-4" />
                                            </button>
                                        </div>

                                        {audioSrc[app.appId] && (
                                            <audio
                                                ref={el => audioRefs.current[app.appId] = el}
                                                src={audioSrc[app.appId]}
                                                onEnded={() => setPlayingKey(null)}
                                                controls
                                                className="w-full h-8 mt-2"
                                            />
                                        )}
                                    </div>
                                </div>

                                {/* Decision Actions */}
                                {app.status === "pending" && (
                                    <div className="mt-5 pt-4 border-t border-neutral-700/60 flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => act(app.userId, app.appId, "reject")}
                                            disabled={actionLoading === `reject_${app.appId}`}
                                            className="px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-700/40 text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
                                        >
                                            <XCircle className="w-3.5 h-3.5" />
                                            <span>Reject</span>
                                        </button>
                                        <button
                                            onClick={() => act(app.userId, app.appId, "approve")}
                                            disabled={actionLoading === `approve_${app.appId}`}
                                            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 flex items-center gap-1.5"
                                        >
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            <span>Approve for Scripted Calls</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-6">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-xs font-semibold disabled:opacity-40"
                        >
                            Previous
                        </button>
                        <span className="text-xs text-neutral-400 font-semibold">
                            Page {page} of {totalPages}
                        </span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-xs font-semibold disabled:opacity-40"
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
