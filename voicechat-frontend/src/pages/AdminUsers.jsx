import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../lib/api.js";
import AdminNav from "../components/AdminNav.jsx";
import Swal from "sweetalert2";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

async function apiPatchJson(path, data = {}, method = "PATCH") {
    const res = await fetch(`${BACKEND_URL}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    const json = await res.json().catch(() => ({ error: "Request failed" }));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
}

const STATUS_BADGE = {
    approved: "bg-success-100 text-success-700 border border-success-200",
    pending_approval: "bg-warning-100 text-warning-700 border border-warning-200",
    pending_intro: "bg-neutral-100 text-neutral-600 border border-neutral-200",
    rejected: "bg-error-100 text-error-700 border border-error-200",
};
const STATUS_LABEL = {
    approved: "Approved",
    pending_approval: "Pending Review",
    pending_intro: "Intro Pending",
    rejected: "Rejected",
};

export default function AdminUsers() {
    const navigate = useNavigate();
    const [tab, setTab] = useState("pending"); // "pending", "all", "qa"
    
    // Approval/Rejection states
    const [actionUserId, setActionUserId] = useState(null);
    const [rejectModal, setRejectModal] = useState(null);
    const [rejectReason, setRejectReason] = useState("");
    const [rejectLoading, setRejectLoading] = useState(false);

    // Limit editing states
    const [limitModalUser, setLimitModalUser] = useState(null);
    const [limitForm, setLimitForm] = useState({
        dailyPhraseLimit: 1000,
        overallPhraseLimit: -1,
        dailyCallLimit: 50,
        overallCallLimit: -1
    });

    // Paginationg state
    const [users, setUsers] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
    const [usersLoading, setUsersLoading] = useState(false);
    const [editingUserId, setEditingUserId] = useState(null);
    const [newLimit, setNewLimit] = useState("");

    // Pending state
    const [pending, setPending] = useState([]);
    const [pendingLoading, setPendingLoading] = useState(false);

    // Approved users state
    const [approvedUsers, setApprovedUsers] = useState([]);
    const [approvedLoading, setApprovedLoading] = useState(false);
    const [approvedSearch, setApprovedSearch] = useState("");

    // QA Users state
    const [qaUsers, setQaUsers] = useState([]);
    const [qaLoading, setQaLoading] = useState(false);
    const [qaForm, setQaForm] = useState({ firstname: "", lastname: "", email: "", password: "", qaLanguageCodes: [] });
    const [qaCreating, setQaCreating] = useState(false);

    // QA Edit state
    const [editQaId, setEditQaId] = useState(null);
    const [editQaLanguageCodes, setEditQaLanguageCodes] = useState([]);
    const [qaUpdating, setQaUpdating] = useState(false);
    const [qaError, setQaError] = useState("");
    const [languages, setLanguages] = useState([]);

    const [error, setError] = useState("");

    useEffect(() => {
        if (tab === "pending") loadPending();
        if (tab === "all") loadUsers();
        if (tab === "approved") loadApprovedUsers();
        if (tab === "qa") loadQaUsers();
    }, [tab, pagination.page]);

    async function loadApprovedUsers() {
        setApprovedLoading(true);
        setError("");
        try {
            const data = await apiGet("/api/admin/contributor-agreements/approved-users");
            setApprovedUsers(data.users || []);
        } catch (e) {
            setError(e.message);
            if (e.message.includes("Forbidden") || e.message.includes("Unauthorized")) navigate("/login");
        } finally {
            setApprovedLoading(false);
        }
    }

    function downloadAgreement(userId) {
        const url = `${BACKEND_URL}/api/admin/contributor-agreements/${userId}/download`;
        window.open(url, "_blank", "noopener");
    }

    async function loadPending() {
        setPendingLoading(true);
        setError("");
        try {
            const data = await apiGet("/api/admin/users/pending");
            setPending(data.users);
        } catch (e) {
            setError(e.message);
            if (e.message.includes("Forbidden") || e.message.includes("Unauthorized")) navigate("/login");
        } finally {
            setPendingLoading(false);
        }
    }

    async function loadUsers() {
        setUsersLoading(true);
        setError("");
        try {
            const data = await apiGet(`/api/admin/users?page=${pagination.page}&limit=${pagination.limit}`);
            setUsers(data.users);
            setPagination(data.pagination);
        } catch (e) {
            setError(e.message);
            if (e.message.includes("Forbidden") || e.message.includes("Unauthorized")) navigate("/login");
        } finally {
            setUsersLoading(false);
        }
    }

    async function approveUser(userId) {
        setActionUserId(userId);
        try {
            await apiPatchJson(`/api/admin/users/${userId}/approve`);
            await loadPending();
            if (tab === "all") await loadUsers();
        } catch (e) {
            setError(e.message);
        } finally {
            setActionUserId(null);
        }
    }

    async function submitReject() {
        if (!rejectReason.trim()) return;
        setRejectLoading(true);
        try {
            await apiPatchJson(`/api/admin/users/${rejectModal}/reject`, { reason: rejectReason.trim() });
            setRejectModal(null);
            setRejectReason("");
            await loadPending();
            if (tab === "all") await loadUsers();
        } catch (e) {
            setError(e.message);
        } finally {
            setRejectLoading(false);
        }
    }

    async function submitLimitUpdate(e) {
        e.preventDefault();
        if (!limitModalUser) return;
        try {
            await apiPatchJson(`/api/admin/users/${limitModalUser._id}/limits`, limitForm);
            if (tab === "approved") await loadApprovedUsers();
            else await loadUsers();
            setLimitModalUser(null);
            Swal.fire({ title: "Limits Updated", icon: "success", timer: 2000, showConfirmButton: false });
        } catch (error) {
            Swal.fire("Error", error.message, "error");
        }
    }

    // ── QA User actions ──────────────────────────────────────────────
    async function loadQaUsers() {
        setQaLoading(true);
        setQaError("");
        try {
            const [usersData, languagesData] = await Promise.all([
                apiGet("/api/admin/qa-users"),
                apiGet("/api/admin/languages"),
            ]);
            setQaUsers(usersData.users);
            setLanguages((languagesData.languages || []).filter((lang) => lang.enabled));
        } catch (e) {
            setQaError(e.message);
        } finally {
            setQaLoading(false);
        }
    }

    async function createQaUser() {
        const { firstname, lastname, email, password, qaLanguageCodes } = qaForm;
        if (!firstname || !lastname || !email || !password) {
            setQaError("All fields are required."); return;
        }
        if (!qaLanguageCodes || qaLanguageCodes.length === 0) {
            setQaError("Select at least one language for this QA user."); return;
        }
        setQaCreating(true);
        setQaError("");
        try {
            await apiPatchJson("/api/admin/qa-users", qaForm, "POST");
            setQaForm({ firstname: "", lastname: "", email: "", password: "", qaLanguageCodes: [] });
            await loadQaUsers();
        } catch (e) {
            setQaError(e.message);
        } finally {
            setQaCreating(false);
        }
    }

    async function updateQaLanguages(id) {
        if (!editQaLanguageCodes || editQaLanguageCodes.length === 0) {
            alert("Select at least one language."); 
            return;
        }
        setQaUpdating(true);
        try {
            await apiPatchJson(`/api/admin/qa-users/${id}/languages`, { qaLanguageCodes: editQaLanguageCodes });
            setEditQaId(null);
            await loadQaUsers();
        } catch (e) {
            alert("Error: " + e.message);
        } finally {
            setQaUpdating(false);
        }
    }

    async function deleteQaUser(id, name) {
        if (!window.confirm(`Delete QA user "${name}"? This cannot be undone.`)) return;
        try {
            const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || "http://localhost:3001"}/api/admin/qa-users/${id}`, {
                method: "DELETE",
                credentials: "include",
            });
            if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
            await loadQaUsers();
        } catch (e) {
            alert("Error: " + e.message);
        }
    }

    const formatDate = (d) => new Date(d).toLocaleDateString();

    return (
        <div className="min-h-screen bg-neutral-900 pt-16 md:pt-0 md:pl-64">
            <AdminNav />

            {/* Reject Modal */}
            {rejectModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <h3 className="text-lg font-bold text-neutral-900 mb-1">Reject User</h3>
                        <p className="text-sm text-neutral-500 mb-4">The user will see this message and can re-record.</p>
                        <textarea
                            className="w-full border border-neutral-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
                            rows={4}
                            placeholder="e.g. Background noise was too loud. Please record in a quieter environment."
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            autoFocus
                        />
                        <div className="flex gap-3 mt-4">
                            <button onClick={() => { setRejectModal(null); setRejectReason(""); }}
                                className="flex-1 px-4 py-2 border border-neutral-300 rounded-lg text-sm hover:bg-neutral-50">
                                Cancel
                            </button>
                            <button
                                onClick={submitReject}
                                disabled={!rejectReason.trim() || rejectLoading}
                                className="flex-1 px-4 py-2 bg-error-600 hover:bg-error-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                            >
                                {rejectLoading ? "Rejecting…" : "Reject"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12">
                <div className="mb-6">
                    <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">User Management</h1>
                    <p className="text-sm text-neutral-400">Review intro recordings and manage users</p>
                </div>

                {error && (
                    <div className="bg-error-900/50 border border-error-700 text-error-300 px-4 py-3 rounded-lg mb-6">
                        {error}
                    </div>
                )}

                {/* Tabs */}
                <div className="flex gap-1 bg-neutral-800 rounded-xl p-1 mb-6 w-fit">
                    {[["pending", "⏳ Pending"], ["all", "👥 All Users"], ["approved", "✅ Approved Users"], ["qa", "🛡 QA Users"]].map(([key, label]) => (
                        <button key={key} onClick={() => setTab(key)}
                            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === key
                                ? "bg-primary-600 text-white shadow"
                                : "text-neutral-400 hover:text-white"
                                }`}>
                            {label}
                        </button>
                    ))}
                </div>

                {/* ── Pending Tab ── */}
                {tab === "pending" && (
                    pendingLoading ? (
                        <div className="flex justify-center py-16">
                            <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                        </div>
                    ) : pending.length === 0 ? (
                        <div className="text-center py-16 text-neutral-500">
                            <div className="text-4xl mb-3">✅</div>
                            <p className="font-medium">No pending approvals</p>
                            <p className="text-sm mt-1">All users have been reviewed.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {pending.map((user) => (
                                <div key={user._id} className="bg-neutral-800 border border-neutral-700 rounded-2xl p-5">
                                    <div className="flex flex-col md:flex-row md:items-start gap-4">
                                        {/* User info */}
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-white font-semibold">{user.firstname} {user.lastname}</span>
                                                <span className="text-neutral-400 text-sm">@{user.username}</span>
                                            </div>
                                            <div className="text-sm text-neutral-400">{user.email}</div>
                                            <div className="flex flex-wrap gap-2 mt-2 text-xs">
                                                <span className="bg-neutral-700 text-neutral-300 rounded px-2 py-0.5">{user.gender}</span>
                                                <span className="bg-neutral-700 text-neutral-300 rounded px-2 py-0.5">{user.regionalLanguage}</span>
                                                <span className="bg-neutral-700 text-neutral-300 rounded px-2 py-0.5">{user.locality}</span>
                                                <span className="bg-neutral-700 text-neutral-300 rounded px-2 py-0.5">
                                                    {user.address?.city}, {user.address?.state}
                                                </span>
                                                <span className="bg-neutral-700 text-neutral-300 rounded px-2 py-0.5">
                                                    🎙 {user.microphoneBrand} {user.microphoneModel}
                                                </span>
                                            </div>
                                            <div className="text-xs text-neutral-500 mt-1">Joined {formatDate(user.createdAt)}</div>
                                        </div>

                                        {/* Audio player */}
                                        <div className="md:w-64 flex-shrink-0">
                                            {user.introRecordingFile ? (
                                                <div className="space-y-2">
                                                    <p className="text-xs text-neutral-400 font-medium uppercase tracking-wide">Voice Introduction</p>
                                                    <audio
                                                        controls
                                                        controlsList="nodownload noplaybackrate"
                                                        onContextMenu={(e) => e.preventDefault()}
                                                        crossOrigin="use-credentials"
                                                        src={`${BACKEND_URL}/api/admin/users/${user._id}/intro`}
                                                        className="w-full h-10"
                                                    />
                                                </div>
                                            ) : (
                                                <p className="text-xs text-neutral-500 italic">No recording file</p>
                                            )}

                                            {/* Actions */}
                                            <div className="flex gap-2 mt-3">
                                                <button
                                                    onClick={() => approveUser(user._id)}
                                                    disabled={actionUserId === user._id}
                                                    className="flex-1 py-2 bg-success-600 hover:bg-success-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
                                                >
                                                    {actionUserId === user._id ? "…" : "✓ Approve"}
                                                </button>
                                                <button
                                                    onClick={() => { setRejectModal(user._id); setRejectReason(""); }}
                                                    disabled={actionUserId === user._id}
                                                    className="flex-1 py-2 bg-error-600 hover:bg-error-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
                                                >
                                                    ✗ Reject
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}

                {/* ── All Users Tab ── */}
                {tab === "all" && (
                    usersLoading ? (
                        <div className="flex justify-center py-16">
                            <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                        </div>
                    ) : (
                        <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-neutral-700">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">User</th>
                                            <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Email</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Status</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Daily Limit</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-700">
                                        {users.map((user) => (
                                            <tr key={user._id} className="hover:bg-neutral-700/50 transition-colors">
                                                <td className="px-4 py-4">
                                                    <div className="text-sm text-white font-medium">{user.username}</div>
                                                    <div className="text-xs text-neutral-400">{user.firstname} {user.lastname}</div>
                                                </td>
                                                <td className="hidden md:table-cell px-4 py-4 text-sm text-neutral-300">{user.email}</td>
                                                <td className="px-4 py-4">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[user.accountStatus] || STATUS_BADGE.pending_intro}`}>
                                                        {STATUS_LABEL[user.accountStatus] || "-"}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="flex flex-col gap-1 text-sm text-neutral-300">
                                                        <div><span className="text-neutral-500 w-16 inline-block">Phrases:</span> 
                                                            <span className="font-semibold text-white">{user.dailyPhraseLimit ?? 1000}</span>/day, 
                                                            {user.overallPhraseLimit === -1 ? ' Unlimited' : ` ${user.overallPhraseLimit} total`}
                                                        </div>
                                                        <div><span className="text-neutral-500 w-16 inline-block">Calls:</span> 
                                                            <span className="font-semibold text-white">{user.dailyCallLimit ?? 50}</span>/day, 
                                                            {user.overallCallLimit === -1 ? ' Unlimited' : ` ${user.overallCallLimit} total`}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 text-xs">
                                                    <button
                                                        onClick={() => { 
                                                            setLimitModalUser(user); 
                                                            setLimitForm({
                                                                dailyPhraseLimit: user.dailyPhraseLimit ?? 1000,
                                                                overallPhraseLimit: user.overallPhraseLimit ?? -1,
                                                                dailyCallLimit: user.dailyCallLimit ?? 50,
                                                                overallCallLimit: user.overallCallLimit ?? -1
                                                            });
                                                        }}
                                                        className="text-warning-400 hover:text-warning-300 font-medium bg-warning-400/10 hover:bg-warning-400/20 px-3 py-1.5 rounded transition-colors">
                                                        Edit Limits
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            <div className="bg-neutral-700 px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                                <div className="text-xs text-neutral-300">
                                    Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                                        disabled={pagination.page === 1}
                                        className="px-3 py-1 bg-neutral-600 text-neutral-300 rounded hover:bg-neutral-500 disabled:opacity-50 text-xs">Previous</button>
                                    <span className="px-3 py-1 text-neutral-300 text-xs">Page {pagination.page} of {pagination.pages}</span>
                                    <button onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                                        disabled={pagination.page >= pagination.pages}
                                        className="px-3 py-1 bg-neutral-600 text-neutral-300 rounded hover:bg-neutral-500 disabled:opacity-50 text-xs">Next</button>
                                </div>
                            </div>
                        </div>
                    )
                )}
                {/* ── Approved Users Tab ── */}
                {tab === "approved" && (
                    approvedLoading ? (
                        <div className="flex justify-center py-16">
                            <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                        </div>
                    ) : (
                        <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
                            <div className="px-4 py-3 flex flex-wrap gap-3 items-center justify-between border-b border-neutral-700">
                                <div>
                                    <h2 className="text-base font-bold text-white">Fully Approved Contributors ({approvedUsers.length})</h2>
                                    <p className="text-xs text-neutral-400 mt-0.5">Account approved AND contributor agreement admin-approved.</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={approvedSearch}
                                        onChange={e => setApprovedSearch(e.target.value)}
                                        placeholder="Search name, email, username…"
                                        className="w-64 px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-warning-500"
                                    />
                                    <button onClick={loadApprovedUsers} className="px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 text-sm text-white hover:bg-neutral-600">Refresh</button>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-neutral-700/50">
                                        <tr>
                                            {["User", "Email", "Signed", "Approved", "Version", "Actions"].map(h => (
                                                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-neutral-300 uppercase tracking-wider">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-700">
                                        {approvedUsers
                                            .filter(u => {
                                                if (!approvedSearch.trim()) return true;
                                                const q = approvedSearch.trim().toLowerCase();
                                                return (
                                                    (u.firstname || "").toLowerCase().includes(q) ||
                                                    (u.lastname || "").toLowerCase().includes(q) ||
                                                    (u.email || "").toLowerCase().includes(q) ||
                                                    (u.username || "").toLowerCase().includes(q)
                                                );
                                            })
                                            .map(u => (
                                                <tr key={u.userId} className="hover:bg-neutral-700/30 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <div className="text-white font-medium">{`${u.firstname || ""} ${u.lastname || ""}`.trim() || "—"}</div>
                                                        <div className="text-xs text-neutral-400">@{u.username}</div>
                                                    </td>
                                                    <td className="px-4 py-3 text-neutral-300">{u.email}</td>
                                                    <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">{u.signedAt ? new Date(u.signedAt).toLocaleDateString() : "—"}</td>
                                                    <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">{u.approvedAt ? new Date(u.approvedAt).toLocaleDateString() : "—"}</td>
                                                    <td className="px-4 py-3 text-neutral-400 text-xs">{u.agreementVersion || "—"}</td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex flex-wrap gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    setLimitModalUser({ _id: u.userId, username: u.username });
                                                                    setLimitForm({
                                                                        dailyPhraseLimit: u.dailyPhraseLimit ?? 1000,
                                                                        overallPhraseLimit: u.overallPhraseLimit ?? -1,
                                                                        dailyCallLimit: u.dailyCallLimit ?? 50,
                                                                        overallCallLimit: u.overallCallLimit ?? -1,
                                                                    });
                                                                }}
                                                                className="px-3 py-1.5 rounded-md bg-warning-500/10 text-warning-400 hover:bg-warning-500/20 text-xs font-medium"
                                                            >
                                                                Edit Limits
                                                            </button>
                                                            <button
                                                                onClick={() => downloadAgreement(u.userId)}
                                                                disabled={!u.hasPdf}
                                                                className="px-3 py-1.5 rounded-md bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                                                            >
                                                                Download Agreement
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        {approvedUsers.length === 0 && (
                                            <tr>
                                                <td colSpan="6" className="px-4 py-10 text-center text-neutral-500 text-sm">
                                                    No fully approved contributors yet.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )
                )}

                {/* ── QA Users Tab ── */}
                {tab === "qa" && (
                    <div className="space-y-6">
                        {/* Create QA User */}
                        <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
                            <h2 className="text-lg font-bold text-white mb-4">🛡 Create QA User</h2>
                            {qaError && <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-2 rounded-lg mb-4 text-sm">{qaError}</div>}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                                {[["firstname", "First Name"], ["lastname", "Last Name"], ["email", "Email"], ["password", "Password"]].map(([field, label]) => (
                                    <div key={field}>
                                        <label className="block text-xs text-neutral-400 mb-1">{label}</label>
                                        <input
                                            type={field === "password" ? "password" : "text"}
                                            value={qaForm[field]}
                                            onChange={e => setQaForm(f => ({ ...f, [field]: e.target.value }))}
                                            className="w-full bg-neutral-700 border border-neutral-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-warning-500"
                                            placeholder={label}
                                        />
                                    </div>
                                ))}
                            </div>
                            <div className="mb-4">
                                <label className="block text-xs text-neutral-400 mb-2">Assigned Languages</label>
                                {languages.length === 0 ? (
                                    <div className="text-sm text-neutral-500 bg-neutral-700/50 border border-neutral-600 rounded-lg px-3 py-3">
                                        No enabled languages available. Add languages first.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {languages.map((language) => (
                                            <label key={language._id} className="flex items-center space-x-2 text-sm text-white cursor-pointer hover:bg-neutral-700 p-2 rounded-lg transition-colors border border-neutral-600">
                                                <input
                                                    type="checkbox"
                                                    value={language.code}
                                                    checked={qaForm.qaLanguageCodes.includes(language.code)}
                                                    onChange={(e) => {
                                                        const checked = e.target.checked;
                                                        setQaForm(f => ({
                                                            ...f,
                                                            qaLanguageCodes: checked
                                                                ? [...f.qaLanguageCodes, language.code]
                                                                : f.qaLanguageCodes.filter(c => c !== language.code)
                                                        }));
                                                    }}
                                                    className="w-4 h-4 text-warning-600 bg-neutral-900 border-neutral-600 rounded focus:ring-warning-500"
                                                />
                                                <span>{language.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={createQaUser}
                                disabled={qaCreating || languages.length === 0}
                                className="px-5 py-2.5 bg-warning-600 hover:bg-warning-700 text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-50"
                            >
                                {qaCreating ? "Creating…" : "+ Create QA User"}
                            </button>
                        </div>

                        {/* QA Users list */}
                        <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
                            <div className="px-6 py-4 bg-neutral-700">
                                <h2 className="text-base font-bold text-white">Existing QA Users ({qaUsers.length})</h2>
                            </div>
                            {qaLoading ? (
                                <div className="flex justify-center py-10">
                                    <div className="w-10 h-10 border-4 border-warning-200 border-t-warning-500 rounded-full animate-spin" />
                                </div>
                            ) : qaUsers.length === 0 ? (
                                <div className="text-center py-10 text-neutral-500">No QA users yet.</div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead className="bg-neutral-700/50">
                                        <tr>
                                            {["Name", "Email", "Username", "Language", "Created", "Action"].map(h => (
                                                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-neutral-300 uppercase tracking-wider">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-700">
                                        {qaUsers.map(u => (
                                            <tr key={u._id} className="hover:bg-neutral-700/30 transition-colors">
                                                <td className="px-4 py-3 text-white font-medium">{u.firstname} {u.lastname}</td>
                                                <td className="px-4 py-3 text-neutral-400">{u.email}</td>
                                                <td className="px-4 py-3 text-neutral-400 font-mono text-xs">{u.username}</td>
                                                <td className="px-4 py-3 text-neutral-300 text-xs max-w-[200px] truncate" title={u.qaLanguageCodes?.join(", ")}>
                                                    {u.qaLanguageCodes && u.qaLanguageCodes.length > 0
                                                        ? u.qaLanguageCodes.join(", ")
                                                        : u.qaLanguageCode || "—"}
                                                </td>
                                                <td className="px-4 py-3 text-neutral-500 text-xs">{formatDate(u.createdAt)}</td>
                                                <td className="px-4 py-3 flex gap-2">
                                                    <button
                                                        onClick={() => {
                                                            setEditQaId(u._id);
                                                            setEditQaLanguageCodes(u.qaLanguageCodes && u.qaLanguageCodes.length > 0 ? u.qaLanguageCodes : (u.qaLanguageCode ? [u.qaLanguageCode] : []));
                                                        }}
                                                        className="px-3 py-1 bg-neutral-600 hover:bg-neutral-500 text-white text-xs font-semibold rounded-lg transition-colors"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => deleteQaUser(u._id, `${u.firstname} ${u.lastname}`)}
                                                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors"
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}
                {/* ── Edit QA Modal ── */}
                {editQaId && (
                    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                        <div className="bg-neutral-800 border border-neutral-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                            <h3 className="text-lg font-bold text-white mb-1">Edit Assigned Languages</h3>
                            <p className="text-sm text-neutral-400 mb-4">Select the language queues this reviewer can access.</p>
                            
                            <div className="grid grid-cols-2 gap-2 mb-6 max-h-48 overflow-y-auto custom-scrollbar">
                                {languages.map((language) => (
                                    <label key={language._id} className="flex items-center space-x-2 text-sm text-white cursor-pointer hover:bg-neutral-700 p-2 rounded-lg transition-colors border border-neutral-600">
                                        <input
                                            type="checkbox"
                                            value={language.code}
                                            checked={editQaLanguageCodes.includes(language.code)}
                                            onChange={(e) => {
                                                const checked = e.target.checked;
                                                setEditQaLanguageCodes(prev => checked 
                                                    ? [...prev, language.code] 
                                                    : prev.filter(c => c !== language.code)
                                                );
                                            }}
                                            className="w-4 h-4 text-warning-600 bg-neutral-900 border-neutral-600 rounded focus:ring-warning-500"
                                        />
                                        <span>{language.name}</span>
                                    </label>
                                ))}
                            </div>

                            <div className="flex gap-3">
                                <button onClick={() => { setEditQaId(null); setEditQaLanguageCodes([]); }}
                                    className="flex-1 px-4 py-2 border border-neutral-600 rounded-lg text-sm text-white hover:bg-neutral-700">
                                    Cancel
                                </button>
                                <button
                                    onClick={() => updateQaLanguages(editQaId)}
                                    disabled={qaUpdating || editQaLanguageCodes.length === 0}
                                    className="flex-1 px-4 py-2 bg-warning-600 hover:bg-warning-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                                >
                                    {qaUpdating ? "Saving…" : "Save Changes"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {/* Limit Editing Modal */}
            {limitModalUser && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-neutral-800 border border-neutral-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-4">Edit Limits for {limitModalUser.username}</h3>
                        <form onSubmit={submitLimitUpdate} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Daily Phrases</label>
                                    <input 
                                        type="number" 
                                        min="-1" 
                                        value={limitForm.dailyPhraseLimit}
                                        onChange={(e) => setLimitForm({...limitForm, dailyPhraseLimit: e.target.value})}
                                        className="w-full bg-neutral-700 text-white border border-neutral-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Overall Phrases (-1 = Unl)</label>
                                    <input 
                                        type="number" 
                                        min="-1" 
                                        value={limitForm.overallPhraseLimit}
                                        onChange={(e) => setLimitForm({...limitForm, overallPhraseLimit: e.target.value})}
                                        className="w-full bg-neutral-700 text-white border border-neutral-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Daily Calls</label>
                                    <input 
                                        type="number" 
                                        min="-1" 
                                        value={limitForm.dailyCallLimit}
                                        onChange={(e) => setLimitForm({...limitForm, dailyCallLimit: e.target.value})}
                                        className="w-full bg-neutral-700 text-white border border-neutral-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-neutral-400 mb-1">Overall Calls (-1 = Unl)</label>
                                    <input 
                                        type="number" 
                                        min="-1" 
                                        value={limitForm.overallCallLimit}
                                        onChange={(e) => setLimitForm({...limitForm, overallCallLimit: e.target.value})}
                                        className="w-full bg-neutral-700 text-white border border-neutral-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button type="button" onClick={() => setLimitModalUser(null)}
                                    className="flex-1 py-2 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 text-sm font-semibold rounded-lg transition-colors">
                                    Cancel
                                </button>
                                <button type="submit"
                                    className="flex-1 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold rounded-lg transition-colors">
                                    Save Limits
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
