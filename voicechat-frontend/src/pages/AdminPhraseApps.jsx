import React, { useEffect, useState } from "react";
import AdminNav from "../components/AdminNav.jsx";
import { getUserInfo } from "../lib/auth.js";

const BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

async function apiFetch(path, opts = {}) {
    const res = await fetch(`${BASE}${path}`, { credentials: "include", ...opts });
    const json = await res.json().catch(() => ({ error: "Request failed" }));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
}
const get = (p) => apiFetch(p, { method: "GET" });
const post = (p, body) => apiFetch(p, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
});

const STATUS_COLOR = {
    pending: "bg-yellow-900/50 text-yellow-300",
    recorded: "bg-blue-900/50 text-blue-300",
    approved: "bg-green-900/50 text-green-300",
    rejected: "bg-red-900/50 text-red-300",
};

function StatusBadge({ status }) {
    const icon = status === "approved" ? "✓" : status === "rejected" ? "✗" : status === "recorded" ? "🎙" : "⏳";
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full capitalize ${STATUS_COLOR[status] || "bg-neutral-700 text-neutral-300"}`}>
            {icon} {status}
        </span>
    );
}

const PAGE_SIZE = 20;

export default function AdminPhraseApps() {
    const userInfo = getUserInfo();
    const isAdmin = userInfo?.isAdmin || false;

    const [phrases, setPhrases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState("recorded");
    const [page, setPage] = useState(1);
    const [error, setError] = useState("");
    const [actionLoading, setActionLoading] = useState(null);
    const [audioSrc, setAudioSrc] = useState({});
    const [comments, setComments] = useState({});

    useEffect(() => { loadPhrases(); }, []);

    async function loadPhrases() {
        setLoading(true);
        setError("");
        try {
            const endpoint = isAdmin ? "/api/phrases/admin/all" : "/api/phrases/qa/queue";
            const data = await get(endpoint);
            setPhrases(data.phrases || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    const filtered = statusFilter ? phrases.filter(p => p.status === statusFilter) : phrases;
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    async function act(phraseId, action) {
        const key = `${action}_${phraseId}`;
        setActionLoading(key);
        try {
            await post(`/api/phrases/qa/review/${phraseId}`, { action, comment: comments[phraseId] || "" });
            await loadPhrases();
        } catch (e) {
            setError(e.message);
        } finally {
            setActionLoading(null);
        }
    }

    function loadAudio(phraseId) {
        if (audioSrc[phraseId]) return;
        setAudioSrc(prev => ({ ...prev, [phraseId]: `${BASE}/api/phrases/${phraseId}/audio` }));
    }

    return (
        <div className="min-h-screen bg-neutral-900 pt-16 md:pt-0 md:pl-64">
            <AdminNav />
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12">

                {/* Header */}
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">Phrase Applications</h1>
                        <p className="text-neutral-400 text-sm">
                            {isAdmin ? "All phrase recordings across all statuses." : "Recorded phrases in your language queue."}
                        </p>
                    </div>
                    {isAdmin && (
                        <select
                            value={statusFilter}
                            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                            className="bg-neutral-700 border border-neutral-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-warning-500"
                        >
                            <option value="">All</option>
                            <option value="pending">Pending</option>
                            <option value="recorded">Recorded</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                        </select>
                    )}
                </div>

                {error && (
                    <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-4">{error}</div>
                )}

                {loading ? (
                    <div className="flex justify-center py-16">
                        <div className="w-12 h-12 border-4 border-warning-200 border-t-warning-500 rounded-full animate-spin" />
                    </div>
                ) : paginated.length === 0 ? (
                    <div className="text-center py-16 text-neutral-500">No phrases found.</div>
                ) : (
                    <>
                        <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-neutral-700">
                                        <tr>
                                            {["Phrase", "Contributor", "Language", "Company", "Status", "Recording", "Comment", "Action"].map(h => (
                                                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-neutral-300 uppercase tracking-wider whitespace-nowrap">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-700">
                                        {paginated.map(phrase => (
                                            <tr key={phrase._id} className="hover:bg-neutral-700/40 transition-colors">
                                                <td className="px-4 py-3 max-w-xs">
                                                    <p className="text-white text-xs leading-snug line-clamp-2" title={phrase.text}>{phrase.text}</p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {phrase.contributorId ? (
                                                        <>
                                                            <div className="text-white font-medium text-xs">{phrase.contributorId.firstname} {phrase.contributorId.lastname}</div>
                                                            <div className="text-neutral-400 text-xs">@{phrase.contributorId.username}</div>
                                                        </>
                                                    ) : (
                                                        <span className="text-neutral-600 text-xs">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <code className="bg-neutral-700 text-warning-300 px-2 py-0.5 rounded text-xs font-mono">{phrase.language}</code>
                                                </td>
                                                <td className="px-4 py-3 text-neutral-400 text-xs">
                                                    {phrase.companyId || <span className="text-neutral-600">—</span>}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <StatusBadge status={phrase.status} />
                                                </td>
                                                <td className="px-4 py-3">
                                                    {phrase.audioFile ? (
                                                        !audioSrc[phrase._id] ? (
                                                            <button
                                                                onClick={() => loadAudio(phrase._id)}
                                                                className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-warning-400 text-xs font-semibold rounded-lg transition-colors"
                                                            >
                                                                ▶ Load
                                                            </button>
                                                        ) : (
                                                            <audio
                                                                src={audioSrc[phrase._id]}
                                                                controls
                                                                controlsList="nodownload noplaybackrate"
                                                                onContextMenu={e => e.preventDefault()}
                                                                className="h-8 w-48"
                                                            />
                                                        )
                                                    ) : (
                                                        <span className="text-neutral-600 text-xs">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {phrase.status === "recorded" ? (
                                                        <input
                                                            type="text"
                                                            placeholder="Optional…"
                                                            value={comments[phrase._id] || ""}
                                                            onChange={e => setComments(prev => ({ ...prev, [phrase._id]: e.target.value }))}
                                                            className="w-32 bg-neutral-700 border border-neutral-600 text-white text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-warning-500 placeholder-neutral-500"
                                                        />
                                                    ) : (
                                                        <span className="text-neutral-500 text-xs">{phrase.qaComment || "—"}</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {phrase.status === "recorded" ? (
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => act(phrase._id, "approve")}
                                                                disabled={!!actionLoading}
                                                                className="px-3 py-1.5 bg-warning-600 hover:bg-warning-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                                                            >
                                                                {actionLoading === `approve_${phrase._id}` ? "…" : "Approve"}
                                                            </button>
                                                            <button
                                                                onClick={() => act(phrase._id, "reject")}
                                                                disabled={!!actionLoading}
                                                                className="px-3 py-1.5 bg-red-900/60 hover:bg-red-800 text-red-300 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                                                            >
                                                                {actionLoading === `reject_${phrase._id}` ? "…" : "Reject"}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-neutral-600 text-xs">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between mt-4 text-sm text-neutral-400">
                            <span>{filtered.length} phrase{filtered.length !== 1 ? "s" : ""}</span>
                            {totalPages > 1 && (
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg text-xs transition-colors disabled:opacity-40"
                                    >Prev</button>
                                    <span className="py-1.5">Page {page} / {totalPages}</span>
                                    <button
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
                                        className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg text-xs transition-colors disabled:opacity-40"
                                    >Next</button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
