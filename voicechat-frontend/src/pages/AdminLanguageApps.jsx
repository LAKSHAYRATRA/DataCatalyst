import React, { useEffect, useState } from "react";
import AdminNav from "../components/AdminNav.jsx";

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
    const [apps, setApps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState("pending");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [error, setError] = useState("");
    const [actionLoading, setActionLoading] = useState(null);
    const [audioSrc, setAudioSrc] = useState({});

    useEffect(() => { loadApps(); }, [page, statusFilter]);

    async function fetchApps() {
        const qs = `?page=${page}&limit=20${statusFilter ? `&status=${statusFilter}` : ""}`;
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
            await loadApps();
        } catch (e) {
            setError(e.message);
        } finally {
            setActionLoading(null);
        }
    }

    function loadAudio(userId, appId) {
        const key = appId;
        if (audioSrc[key]) return;
        setAudioSrc(prev => ({ ...prev, [key]: `${BASE}/api/language-applications/${userId}/${appId}/recording` }));
    }

    return (
        <div className="min-h-screen bg-neutral-900 pt-16 md:pt-0 md:pl-64">
            <AdminNav />
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12">

                {/* Header */}
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">Language Applications</h1>
                        <p className="text-neutral-400 text-sm">Review and approve language audio submissions.</p>
                    </div>
                    <select
                        value={statusFilter}
                        onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                        className="bg-neutral-700 border border-neutral-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-warning-500"
                    >
                        <option value="">All</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                    </select>
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
                        <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
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
                                                <tr key={key} className="hover:bg-neutral-700/40 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <div className="text-white font-medium text-xs">{app.userFirstname} {app.userLastname}</div>
                                                        <div className="text-neutral-400 text-xs">@{app.username}</div>
                                                    </td>
                                                    <td className="px-4 py-3 text-white text-xs font-medium">
                                                        {app.companyId || <span className="text-neutral-500 italic">None</span>}
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
                                                                    className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-warning-400 text-xs font-semibold rounded-lg transition-colors"
                                                                >
                                                                    ▶ Load
                                                                </button>
                                                            ) : (
                                                                <audio src={audioSrc[key]} controls controlsList="nodownload noplaybackrate" onContextMenu={(e) => e.preventDefault()} className="h-8 w-48" />
                                                            )
                                                        ) : (
                                                            <span className="text-neutral-600 text-xs">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {app.status === "pending" ? (
                                                            <div className="flex gap-2">
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
                                                            </div>
                                                        ) : (
                                                            <span className="text-neutral-600 text-xs">—</span>
                                                        )}
                                                    </td>
                                                </tr>
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
        </div>
    );
}
