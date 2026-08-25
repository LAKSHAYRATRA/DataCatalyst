import React, { useEffect, useState, useRef } from "react";
import { Navigate } from "react-router-dom";
import { Download, RefreshCw, Layers } from "lucide-react";
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
    pending: "bg-yellow-900/50 text-yellow-300",
    approved: "bg-green-900/50 text-green-300",
    rejected: "bg-red-900/50 text-red-300",
};

function StatusBadge({ status }) {
    const icon = status === "approved" ? "✓" : status === "rejected" ? "✗" : "⏳";
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full capitalize ${STATUS_COLOR[status] || "bg-neutral-700 text-neutral-300"}`}>
            {icon} {status}
        </span>
    );
}

export default function AdminLanguageApps() {
    const userInfo = getUserInfo();
    if (userInfo?.isQA && !userInfo?.isAdmin) {
        return <Navigate to="/admin/qaphrase" replace />;
    }
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
    const [expandedApp, setExpandedApp] = useState(null);
    const [qcData, setQcData] = useState({});
    const [loadingQc, setLoadingQc] = useState({});
    const [lightboxSrc, setLightboxSrc] = useState(null);
    const audioRefs = useRef({});

    useEffect(() => { loadApps(); }, [page, statusFilter]);

    async function fetchApps() {
        const qs = `?type=phrase&page=${page}&limit=20${statusFilter ? `&status=${statusFilter}` : ""}`;
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

    const handleDownloadAppsZip = async () => {
        try {
            const compRes = await apiFetch("/api/admin/companies");
            const companyList = compRes.companies || [];

            const optionsHtml = companyList.map(c => `<option value="${c.name}">${c.name}</option>`).join("");

            const { value: formValues } = await Swal.fire({
                title: "Download Phrase Applications ZIP",
                html: `
                    <div class="text-left space-y-3 text-sm">
                        <div>
                            <label class="block font-semibold mb-1 text-neutral-300">Select Company:</label>
                            <select id="swal-comp" class="w-full p-2.5 bg-neutral-800 border border-neutral-700 text-white rounded-lg text-sm">
                                ${optionsHtml || '<option value="Gnani">Gnani</option>'}
                            </select>
                        </div>
                        <div>
                            <label class="block font-semibold mb-1 text-neutral-300">Download Filter:</label>
                            <select id="swal-type" class="w-full p-2.5 bg-neutral-800 border border-neutral-700 text-white rounded-lg text-sm">
                                <option value="approved_apps">QA-Approved Applications Only</option>
                                <option value="all_apps">All Applications (Approved, Pending, Rejected)</option>
                            </select>
                        </div>
                    </div>
                `,
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonText: "Download ZIP",
                confirmButtonColor: "#ea580c",
                cancelButtonText: "Cancel",
                preConfirm: () => {
                    return {
                        company: document.getElementById("swal-comp").value,
                        type: document.getElementById("swal-type").value
                    };
                }
            });

            if (formValues && formValues.company) {
                const token = document.cookie.split("; ").find(r => r.startsWith("vc_token="))?.split("=")[1] || localStorage.getItem("vc_token") || "";
                const url = `${BASE}/api/admin/phrases/download-company?company=${encodeURIComponent(formValues.company)}&type=${formValues.type}${token ? `&token=${encodeURIComponent(token)}` : ""}`;
                window.location.href = url;
                Swal.fire({
                    icon: "success",
                    title: "ZIP Download Started",
                    text: `Compiling ${formValues.type === 'approved_apps' ? 'approved' : 'all'} phrase applications for ${formValues.company}.`,
                    timer: 2500,
                    showConfirmButton: false
                });
            }
        } catch (err) {
            Swal.fire("Error", err.message || "Failed to download phrase applications", "error");
        }
    };

    async function act(userId, appId, action) {
        const key = `${action}_${appId}`;
        setActionLoading(key);
        try {
            await patch(`${REVIEW_BASE}/${userId}/${appId}/${action}`);
            await loadApps();
        } catch (e) {
            setError(e.message);
        } finally {
            setActionLoading(null);
        }
    }

    async function loadAudio(userId, appId) {
        const key = appId;
        if (audioSrc[key] || loadingAudio[key]) return;
        setLoadingAudio(prev => ({ ...prev, [key]: true }));
        try {
            const url = `${BASE}/api/language-applications/${userId}/${appId}/recording`;
            const wavBlob = await fetchAndConvertToWav(url);
            setAudioSrc(prev => ({ ...prev, [key]: URL.createObjectURL(wavBlob) }));
        } catch (e) {
            setError("Failed to convert audio: " + e.message);
        } finally {
            setLoadingAudio(prev => ({ ...prev, [key]: false }));
        }
    }

    async function toggleQC(userId, appId) {
        if (expandedApp === appId) {
            setExpandedApp(null);
            return;
        }
        setExpandedApp(appId);
        
        // Populate pre-cached results if available
        const targetApp = apps.find(a => a.appId === appId);
        if (targetApp && targetApp.qcResult && !qcData[appId]) {
            setQcData(prev => ({ ...prev, [appId]: targetApp.qcResult }));
            return;
        }

        if (qcData[appId]) return;

        setLoadingQc(prev => ({ ...prev, [appId]: true }));
        try {
            const res = await apiFetch(`/api/admin/qa/language-applications/${userId}/${appId}/analyze`, { method: "POST" });
            setQcData(prev => ({ ...prev, [appId]: res }));
        } catch (e) {
            setError("Failed to run QC analysis: " + e.message);
        } finally {
            setLoadingQc(prev => ({ ...prev, [appId]: false }));
        }
    }

    async function reRunQC(userId, appId) {
        setLoadingQc(prev => ({ ...prev, [appId]: true }));
        try {
            const res = await apiFetch(`/api/admin/qa/language-applications/${userId}/${appId}/analyze?force=true`, { method: "POST" });
            setQcData(prev => ({ ...prev, [appId]: res }));
        } catch (e) {
            setError("Failed to re-run QC: " + e.message);
        } finally {
            setLoadingQc(prev => ({ ...prev, [appId]: false }));
        }
    }

    return (
        <div className="min-h-screen bg-neutral-900 pt-16 md:pt-0 md:pl-64">
            <AdminNav />
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12">

                {/* Header */}
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">Phrase Applications</h1>
                        <p className="text-neutral-400 text-sm">Review, approve, and download phrase language application audio submissions.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={handleDownloadAppsZip}
                            className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2 shadow-md"
                            title="Download ZIP package of phrase applications"
                        >
                            <Download className="w-4 h-4" />
                            <span>Download Apps ZIP</span>
                        </button>
                        <select
                            value={statusFilter}
                            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                            className="bg-neutral-700 border border-neutral-600 text-white text-xs font-semibold rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-warning-500"
                        >
                            <option value="">All Statuses</option>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                        </select>
                    </div>
                </div>

                {error && <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-4">{error}</div>}

                {loading ? (
                    <div className="flex justify-center py-16">
                        <div className="w-12 h-12 border-4 border-warning-200 border-t-warning-500 rounded-full animate-spin" />
                    </div>
                ) : apps.length === 0 ? (
                    <div className="text-center py-16 text-neutral-500">No applications found.</div>
                ) : (
                    <>
                        <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden shadow-xl">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-neutral-700">
                                        <tr>
                                            {["User", "Project", "Language", "Status", "Applied", "Recording", "Action"].map(h => (
                                                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-neutral-300 uppercase tracking-wider whitespace-nowrap">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-700">
                                        {apps.map(app => {
                                            const key = app.appId;
                                            return (
                                                <React.Fragment key={key}>
                                                    <tr className="hover:bg-neutral-700/40 transition-colors">
                                                        <td className="px-4 py-3">
                                                            <div className="text-white font-medium text-xs">{app.userFirstname} {app.userLastname}</div>
                                                            <div className="text-neutral-400 text-xs">@{app.username}</div>
                                                        </td>
                                                        <td className="px-4 py-3 text-white text-xs font-medium">
                                                            {app.projectName || app.companyId || <span className="text-neutral-500 italic">None</span>}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <code className="bg-neutral-700 text-warning-300 px-2 py-0.5 rounded text-xs font-mono">{app.languageCode}</code>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <StatusBadge status={app.status} />
                                                        </td>
                                                        <td className="px-4 py-3 text-neutral-400 text-xs whitespace-nowrap">
                                                            {new Date(app.appliedAt).toLocaleString()}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            {app.recordingFile ? (
                                                                !audioSrc[key] ? (
                                                                    <button
                                                                        onClick={() => loadAudio(app.userId, app.appId)}
                                                                        disabled={loadingAudio[key]}
                                                                        className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-warning-400 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                                                                    >
                                                                        {loadingAudio[key] ? "Converting..." : "▶ Load"}
                                                                    </button>
                                                                ) : (
                                                                    <div className="flex items-center gap-2">
                                                                        <audio ref={el => audioRefs.current[key] = el} src={audioSrc[key]} controls controlsList="nodownload noplaybackrate" onContextMenu={(e) => e.preventDefault()} className="h-8 w-60" />
                                                                        <a
                                                                            href={audioSrc[key]}
                                                                            download={`${([app.userFirstname, app.userLastname].filter(Boolean).join('_') || app.username || 'applicant').replace(/[^a-zA-Z0-9_\-]/g, '')}_${app.speaker_id || app.speakerId || 'spk'}.wav`}
                                                                            className="p-1.5 bg-neutral-700 hover:bg-neutral-600 text-warning-400 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                                                                            title="Download converted WAV file"
                                                                        >
                                                                            <Download className="w-3.5 h-3.5" />
                                                                        </a>
                                                                    </div>
                                                                )
                                                            ) : (
                                                                <span className="text-neutral-600 text-xs">—</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex gap-2 items-center">
                                                                {app.recordingFile && (
                                                                    <button
                                                                        onClick={() => toggleQC(app.userId, app.appId)}
                                                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                                                                            expandedApp === app.appId
                                                                                ? "bg-warning-600 text-white"
                                                                                : "bg-neutral-700 hover:bg-neutral-600 text-neutral-300"
                                                                        }`}
                                                                    >
                                                                        📊 {expandedApp === app.appId ? "Close QC" : "QC"}
                                                                    </button>
                                                                )}
                                                                {app.status === "pending" ? (
                                                                    <>
                                                                        <button
                                                                            onClick={() => act(app.userId, app.appId, "approve")}
                                                                            disabled={!!actionLoading}
                                                                            className="px-3 py-1.5 bg-warning-600 hover:bg-warning-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                                                                        >
                                                                            {actionLoading === `approve_${key}` ? "…" : "Approve"}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => act(app.userId, app.appId, "reject")}
                                                                            disabled={!!actionLoading}
                                                                            className="px-3 py-1.5 bg-red-900/60 hover:bg-red-800 text-red-300 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                                                                        >
                                                                            {actionLoading === `reject_${key}` ? "…" : "Reject"}
                                                                        </button>
                                                                    </>
                                                                ) : (
                                                                    <span className="text-neutral-600 text-xs">—</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {expandedApp === app.appId && (
                                                        <tr className="bg-neutral-900/40">
                                                            <td colSpan={7} className="px-6 py-5 border-t border-neutral-700/60">
                                                                {loadingQc[app.appId] ? (
                                                                    <div className="flex items-center justify-center py-6 gap-2">
                                                                        <div className="w-5 h-5 border-2 border-warning-200 border-t-warning-500 rounded-full animate-spin" />
                                                                        <span className="text-xs text-neutral-400">Running QC plot analysis...</span>
                                                                    </div>
                                                                ) : qcData[app.appId] ? (
                                                                    (() => {
                                                                        const data = qcData[app.appId];
                                                                        const freq = data.freq || {};

                                                                        return (
                                                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in text-xs">
                                                                                {/* Metrics Panel */}
                                                                                <div className="bg-neutral-800/80 border border-neutral-700/60 rounded-xl p-4 space-y-4">
                                                                                    <div className="flex items-center justify-between border-b border-neutral-700 pb-2">
                                                                                        <span className="text-sm font-bold text-white uppercase tracking-wider">QC Analysis Metrics</span>
                                                                                        <button
                                                                                            onClick={() => reRunQC(app.userId, app.appId)}
                                                                                            className="px-2 py-1 bg-neutral-700 hover:bg-neutral-600 text-warning-400 hover:text-warning-300 rounded font-semibold transition-colors"
                                                                                        >
                                                                                            🔄 Re-run
                                                                                        </button>
                                                                                    </div>

                                                                                    <div className="grid grid-cols-3 gap-3 text-neutral-300">
                                                                                        <div className="bg-neutral-900/50 p-2.5 rounded-lg border border-neutral-700/40">
                                                                                            <div className="text-[10px] uppercase font-bold text-neutral-500 mb-0.5">Bit Depth</div>
                                                                                            <div className="font-semibold text-white">
                                                                                                {freq.bit_depth || "—"}
                                                                                            </div>
                                                                                        </div>

                                                                                        <div className="bg-neutral-900/50 p-2.5 rounded-lg border border-neutral-700/40">
                                                                                            <div className="text-[10px] uppercase font-bold text-neutral-500 mb-0.5">Noise Floor</div>
                                                                                            <div className="font-semibold text-white">
                                                                                                {freq.noise_floor !== undefined ? `${freq.noise_floor} dBFS` : "—"}
                                                                                            </div>
                                                                                        </div>

                                                                                        <div className="bg-neutral-900/50 p-2.5 rounded-lg border border-neutral-700/40">
                                                                                            <div className="text-[10px] uppercase font-bold text-neutral-500 mb-0.5">Crest Factor</div>
                                                                                            <div className="font-semibold text-white">
                                                                                                {freq.crest_factor !== undefined ? `${freq.crest_factor} dB` : "—"}
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>

                                                                                    <div className="bg-neutral-900/50 p-3 rounded-lg border border-neutral-700/40">
                                                                                        <div className="text-[10px] uppercase font-bold text-neutral-500 mb-1">Signal Processing Verdict</div>
                                                                                        <div className="text-white leading-relaxed font-medium">
                                                                                            {freq.processing_verdict || "No processing detected"}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>

                                                                                {/* Spectrogram Panel */}
                                                                                <div className="bg-neutral-800/80 border border-neutral-700/60 rounded-xl p-4 flex flex-col justify-between">
                                                                                    <div className="text-sm font-bold text-white uppercase tracking-wider border-b border-neutral-700 pb-2 mb-3">
                                                                                        Nyquist Spectrogram (20Hz - 20kHz)
                                                                                    </div>
                                                                                    {freq.spectrogram_img ? (
                                                                                        <div className="relative group cursor-zoom-in overflow-hidden rounded-lg bg-neutral-900 flex-1 flex items-center justify-center max-h-[220px]" onClick={() => setLightboxSrc(freq.spectrogram_img)}>
                                                                                            <img
                                                                                                src={`data:image/png;base64,${freq.spectrogram_img}`}
                                                                                                alt="Spectrogram Plot"
                                                                                                className="w-full h-auto max-h-full object-contain group-hover:scale-[1.02] transition-transform duration-300"
                                                                                            />
                                                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold">
                                                                                                🔍 Click to Zoom (Nyquist Analysis)
                                                                                            </div>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div className="text-neutral-500 italic text-center py-12 flex-1 flex items-center justify-center">
                                                                                            No spectrogram plot generated.
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })()
                                                                ) : (
                                                                    <div className="text-center py-6 text-neutral-500">
                                                                        No QC analysis run yet. 
                                                                        <button
                                                                            onClick={() => toggleQC(app.userId, app.appId)}
                                                                            className="text-warning-400 hover:underline font-semibold ml-1"
                                                                        >
                                                                            Run QC Analysis Now
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between mt-4 text-sm text-neutral-400">
                            <span>{total} total application{total !== 1 ? "s" : ""}</span>
                            {totalPages > 1 && (
                                <div className="flex gap-3">
                                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg text-xs transition-colors disabled:opacity-40">Prev</button>
                                    <span className="py-1.5">Page {page} / {totalPages}</span>
                                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg text-xs transition-colors disabled:opacity-40">Next</button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Spectrogram Lightbox Modal */}
            {lightboxSrc && (
                <div 
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/95 backdrop-blur-sm cursor-zoom-out animate-fade-in"
                    onClick={() => setLightboxSrc(null)}
                >
                    <div className="relative max-w-[95vw] max-h-[85vh] flex flex-col items-center">
                        <img 
                            src={`data:image/png;base64,${lightboxSrc}`} 
                            alt="Spectrogram Zoomed" 
                            className="max-w-full max-h-[80vh] object-contain rounded-lg border border-neutral-700 shadow-2xl"
                        />
                        <div className="mt-4 text-xs font-semibold text-neutral-400 bg-neutral-900/80 px-3 py-1.5 rounded-full border border-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                            <span>📊 Zoomed Spectrogram Plot (Click anywhere to close)</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
