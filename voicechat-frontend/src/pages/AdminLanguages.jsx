import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { 
    Radio, 
    Plus, 
    CheckCircle2, 
    XCircle, 
    Clock, 
    DollarSign, 
    Sliders, 
    Users, 
    Trash2, 
    Edit2, 
    RefreshCw, 
    Search,
    AlertCircle,
    Activity,
    Layers,
    Volume2,
    Check,
    X,
    Filter,
    FolderKanban,
    ArrowRight
} from "lucide-react";
import AdminNav from "../components/AdminNav.jsx";
import Swal from "sweetalert2";

const BASE = import.meta.env.VITE_BACKEND_URL || (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1" ? "https://api.voclara.com" : "http://localhost:3001");

async function apiFetch(path, opts = {}) {
    const res = await fetch(`${BASE}${path}`, { credentials: "include", ...opts });
    const json = await res.json().catch(() => ({ error: "Request failed" }));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
}
const get = (p) => apiFetch(p, { method: "GET" });
const postJson = (p, body) => apiFetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const patch = (p, body = {}) => apiFetch(p, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const del = (p) => apiFetch(p, { method: "DELETE" });

/** Convert any string to a clean slug: lowercase, non-alphanum → hyphen */
function toSlug(name) {
    return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function formatSecs(secs) {
  if (!secs || secs <= 0) return "0m 0s";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export default function AdminLanguages() {
    const [languages, setLanguages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [saving, setSaving] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [showOnlyActive, setShowOnlyActive] = useState(true); // By default only active languages are shown

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingLanguage, setEditingLanguage] = useState(null);
    const [modalName, setModalName] = useState("");
    const [modalProjectName, setModalProjectName] = useState("");
    const [modalLanguage, setModalLanguage] = useState("");
    const [modalHourlyPayout, setModalHourlyPayout] = useState("");
    const [modalSampleRate, setModalSampleRate] = useState("48000");
    const [modalMaxHoursPerContributor, setModalMaxHoursPerContributor] = useState("");
    const [modalMaxDailyCallLimit, setModalMaxDailyCallLimit] = useState("5");
    const [modalNoisy, setModalNoisy] = useState(false);
    const [modalEnabled, setModalEnabled] = useState(true);
    const [modalEnableCallRoles, setModalEnableCallRoles] = useState(false);
    const [modalRole1, setModalRole1] = useState("Role 1");
    const [modalRole2, setModalRole2] = useState("Role 2");
    const [modalSaving, setModalSaving] = useState(false);
    const [modalError, setModalError] = useState("");

    // Summary & Users Modals State
    const [summaryModalLang, setSummaryModalLang] = useState(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryData, setSummaryData] = useState(null);
    const [activeModalType, setActiveModalType] = useState(null); // "summary" | "users"
    const [usersTab, setUsersTab] = useState("approved"); // "approved" | "pending"
    const [usersSearch, setUsersSearch] = useState("");

    async function fetchSummary(lang, modalType = "summary") {
        setSummaryModalLang(lang);
        setActiveModalType(modalType);
        setUsersTab("approved");
        setUsersSearch("");
        setSummaryLoading(true);
        try {
            const data = await get(`/api/admin/languages/${lang._id}/contributors-summary`);
            setSummaryData(data.summary);
        } catch (e) {
            setError("Failed to load contributor summary: " + e.message);
        } finally {
            setSummaryLoading(false);
        }
    }

    function closeSummaryModal() {
        setSummaryModalLang(null);
        setActiveModalType(null);
        setSummaryData(null);
    }

    async function handleRemoveCallContributor(userObj) {
        if (!summaryModalLang) return;
        const langName = summaryModalLang.name || "this language";
        const result = await Swal.fire({
            title: "Remove Contributor?",
            text: `Are you sure you want to remove ${userObj.firstname || userObj.username} from Call Language ${langName}? Doing so will prevent them from making calls in this language and block re-applications until reset.`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#dc2626",
            cancelButtonColor: "#475569",
            confirmButtonText: "Yes, Remove Contributor",
            background: "#1f2937",
            color: "#fff"
        });

        if (result.isConfirmed) {
            try {
                await postJson(`/api/admin/languages/${summaryModalLang._id}/remove-contributor`, {
                    userId: userObj._id
                });
                Swal.fire({
                    title: "Removed!",
                    text: `${userObj.firstname || userObj.username} has been removed from Call Language ${langName}.`,
                    icon: "success",
                    background: "#1f2937",
                    color: "#fff"
                });
                fetchSummary(summaryModalLang, activeModalType);
            } catch (e) {
                Swal.fire({
                    title: "Error",
                    text: e.message,
                    icon: "error",
                    background: "#1f2937",
                    color: "#fff"
                });
            }
        }
    }

    async function handleResetCallContributor(userObj) {
        if (!summaryModalLang) return;
        const langName = summaryModalLang.name || "this language";
        const result = await Swal.fire({
            title: "Reset Application?",
            text: `Are you sure you want to reset the call application for ${userObj.firstname || userObj.username} in Call Language ${langName}? This will remove them from the rejected list and allow them to apply again.`,
            icon: "question",
            showCancelButton: true,
            confirmButtonColor: "#2563eb",
            cancelButtonColor: "#475569",
            confirmButtonText: "Yes, Reset Application",
            background: "#1f2937",
            color: "#fff"
        });

        if (result.isConfirmed) {
            try {
                await postJson(`/api/admin/languages/${summaryModalLang._id}/reset-contributor`, {
                    userId: userObj._id
                });
                Swal.fire({
                    title: "Reset!",
                    text: `Application for ${userObj.firstname || userObj.username} has been reset. They can now apply again.`,
                    icon: "success",
                    background: "#1f2937",
                    color: "#fff"
                });
                fetchSummary(summaryModalLang, activeModalType);
            } catch (e) {
                Swal.fire({
                    title: "Error",
                    text: e.message,
                    icon: "error",
                    background: "#1f2937",
                    color: "#fff"
                });
            }
        }
    }

    async function handleUpdateCallNoiseGate(userObj, noiseGateDb) {
        if (!summaryModalLang) return;
        try {
            await postJson("/api/admin/contributors/update-noise-gate", {
                userId: userObj._id,
                applicationType: "call",
                languageCode: summaryModalLang.code || summaryModalLang.name,
                noiseGateDb: parseInt(noiseGateDb) || 0
            });
            const Toast = Swal.mixin({
                toast: true,
                position: "top-end",
                showConfirmButton: false,
                timer: 2000,
                timerProgressBar: true,
                background: "#1f2937",
                color: "#fff"
            });
            const valNum = parseInt(noiseGateDb) || 0;
            Toast.fire({
                icon: "success",
                title: `Noise gate updated to ${valNum === 0 ? "RAW (0 dB)" : valNum + " dB"}`
            });
            fetchSummary(summaryModalLang, activeModalType);
        } catch (e) {
            Swal.fire({
                title: "Error",
                text: e.message,
                icon: "error",
                background: "#1f2937",
                color: "#fff"
            });
        }
    }

    async function openSetCallNoiseGateModal(userObj) {
        if (!summaryModalLang) return;
        const currentVal = userObj.noiseGateDb !== undefined ? userObj.noiseGateDb : 0;
        const langName = summaryModalLang.name || summaryModalLang.code || "Call Language";

        const { value: inputDb } = await Swal.fire({
            title: "Set Custom Noise Gate",
            html: `
                <div class="text-left text-xs text-neutral-300 mb-3 space-y-1.5 bg-neutral-800 p-3 rounded-lg border border-neutral-700">
                    <div><strong class="text-white">Contributor:</strong> ${userObj.firstname} ${userObj.lastname} (@${userObj.username})</div>
                    <div><strong class="text-warning-400">Call Language:</strong> ${langName}</div>
                    <div class="text-neutral-400 text-[11px] pt-1.5 border-t border-neutral-700/60 mt-2">
                        Enter custom noise gate attenuation in dB (e.g. <code>-12</code>, <code>-10</code>, <code>-6</code>, or <code>0</code> for RAW unedited audio). This setting applies <strong>ONLY</strong> to this contributor for <strong>Call Language (${langName})</strong>.
                    </div>
                </div>
            `,
            input: "text",
            inputValue: String(currentVal),
            inputPlaceholder: "Enter dB e.g. -12 or 0",
            showCancelButton: true,
            confirmButtonText: "Apply Noise Gate",
            cancelButtonText: "Cancel",
            confirmButtonColor: "#ea580c",
            cancelButtonColor: "#475569",
            background: "#1f2937",
            color: "#fff",
            inputValidator: (value) => {
                if (value === null || value === undefined || String(value).trim() === "") {
                    return "Please enter a dB number (e.g. -12 or 0)";
                }
                const num = parseInt(value);
                if (isNaN(num)) {
                    return "Please enter a valid integer (e.g. -12, -10, -6, 0)";
                }
                if (num > 0 || num < -60) {
                    return "dB value must be between 0 (RAW) and -60 dB";
                }
                return null;
            }
        });

        if (inputDb !== undefined && inputDb !== null) {
            handleUpdateCallNoiseGate(userObj, inputDb);
        }
    }

    useEffect(() => { load(); }, []);

    async function load() {
        setLoading(true);
        try {
            const data = await get("/api/admin/languages");
            setLanguages(data.languages || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    function openModal() {
        setEditingLanguage(null);
        setModalProjectName("");
        setModalLanguage("");
        setModalName("");
        setModalHourlyPayout("");
        setModalSampleRate("48000");
        setModalMaxHoursPerContributor("");
        setModalMaxDailyCallLimit("5");
        setModalNoisy(false);
        setModalEnabled(true);
        setModalEnableCallRoles(false);
        setModalRole1("Role 1");
        setModalRole2("Role 2");
        setModalError("");
        setShowModal(true);
    }

    function openEditModal(language) {
        setEditingLanguage(language);
        setModalProjectName(language.projectName || "");
        setModalLanguage(language.language || language.name || "");
        setModalName(language.name || "");
        setModalHourlyPayout(String(language.hourlyPayout ?? ""));
        setModalSampleRate(String(language.sampleRate ?? 48000));
        setModalMaxHoursPerContributor(
            language.maxHoursPerContributor !== undefined && language.maxHoursPerContributor !== -1
                ? String(language.maxHoursPerContributor)
                : ""
        );
        setModalMaxDailyCallLimit(String(language.maxDailyCallLimit ?? 5));
        setModalNoisy(!!language.noisy);
        setModalEnabled(language.enabled !== undefined ? !!language.enabled : true);
        setModalEnableCallRoles(!!language.enableCallRoles);
        setModalRole1(language.role1 || "Role 1");
        setModalRole2(language.role2 || "Role 2");
        setModalError("");
        setShowModal(true);
    }

    function closeModal() {
        setShowModal(false);
        setEditingLanguage(null);
        setModalProjectName("");
        setModalLanguage("");
        setModalName("");
        setModalHourlyPayout("");
        setModalSampleRate("48000");
        setModalMaxHoursPerContributor("");
        setModalMaxDailyCallLimit("5");
        setModalNoisy(false);
        setModalEnabled(true);
        setModalEnableCallRoles(false);
        setModalRole1("Role 1");
        setModalRole2("Role 2");
        setModalError("");
    }

    async function saveLanguage(e) {
        e.preventDefault();
        const proj = modalProjectName.trim();
        const langStr = modalLanguage.trim();
        const rawName = modalName.trim();

        // If project name is entered, format as "Project Name (Language)"
        const name = proj ? `${proj} (${langStr || rawName || "General"})` : (langStr || rawName);
        const hourlyPayout = Number(modalHourlyPayout);
        const sampleRate = Number(modalSampleRate);
        const maxHours = modalMaxHoursPerContributor.trim() === "" ? -1 : Number(modalMaxHoursPerContributor);
        const maxDailyCallLimit = Number(modalMaxDailyCallLimit);
        const role1 = modalRole1.trim();
        const role2 = modalRole2.trim();

        if (!name) return setModalError("Language name is required.");
        if (!Number.isFinite(hourlyPayout) || hourlyPayout < 0) return setModalError("A valid hourly payout is required.");
        if (!Number.isFinite(sampleRate) || sampleRate <= 0) return setModalError("A valid sample rate is required.");
        if (modalMaxHoursPerContributor.trim() !== "" && (!Number.isFinite(maxHours) || maxHours < 0)) {
            return setModalError("A valid max contribution limit (hours) is required.");
        }
        if (!Number.isFinite(maxDailyCallLimit) || maxDailyCallLimit < 1) {
            return setModalError("A valid max daily call limit is required.");
        }
        if (modalEnableCallRoles) {
            if (!role1) return setModalError("Role 1 name is required when Call Roles are enabled.");
            if (!role2) return setModalError("Role 2 name is required when Call Roles are enabled.");
            if (role1.toLowerCase() === role2.toLowerCase()) {
                return setModalError("Role 1 and Role 2 must have distinct names.");
            }
        }

        const code = editingLanguage ? editingLanguage.code : toSlug(name);
        if (!editingLanguage && !code) return setModalError("Name must contain at least one letter or number.");

        setModalSaving(true);
        setModalError("");
        try {
            const payload = {
                name,
                projectName: proj,
                language: langStr,
                hourlyPayout,
                sampleRate,
                maxHoursPerContributor: maxHours,
                maxDailyCallLimit,
                noisy: modalNoisy,
                enabled: modalEnabled,
                enableCallRoles: modalEnableCallRoles,
                role1: modalEnableCallRoles ? role1 : "Role 1",
                role2: modalEnableCallRoles ? role2 : "Role 2",
            };

            if (editingLanguage) {
                await patch(`/api/admin/languages/${editingLanguage._id}`, payload);
                setSuccess(`"${name}" updated successfully.`);
            } else {
                await postJson("/api/admin/languages", { ...payload, code });
                setSuccess(`"${name}" added successfully.`);
            }
            closeModal();
            await load();
        } catch (e) {
            setModalError(e.message === "Language code already exists"
                ? "A language with that name/code already exists."
                : e.message);
        } finally {
            setModalSaving(false);
        }
    }

    async function toggleGroupEnable(g) {
        const next = !g.enabled;
        const subprojectIds = (g.subprojects || []).map(s => s._id);
        if (subprojectIds.length === 0) return;

        setSaving(g.slug);
        try {
            await Promise.all(subprojectIds.map(id => patch(`/api/admin/languages/${id}`, { enabled: next })));
            setLanguages(prev => prev.map(l => {
                if (subprojectIds.includes(l._id)) {
                    return { ...l, enabled: next, ...(next ? {} : { isBoosted: false }) };
                }
                return l;
            }));
            setSuccess(`Call Language "${g.baseName}" is now ${next ? "active" : "disabled"} (${subprojectIds.length} subproject${subprojectIds.length !== 1 ? 's' : ''}).`);
            setTimeout(() => setSuccess(""), 3000);
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(null);
        }
    }

    async function toggleEnable(lang) {
        const next = !lang.enabled;
        setSaving(lang._id);
        try {
            const data = await patch(`/api/admin/languages/${lang._id}`, { enabled: next });
            setLanguages(prev => prev.map(l => l._id === lang._id ? data.language || { ...l, enabled: next } : l));
            setSuccess(`Call Language "${lang.name}" is now ${next ? "active" : "disabled"}.`);
            setTimeout(() => setSuccess(""), 3000);
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(null);
        }
    }

    async function handleDelete(lang) {
        const result = await Swal.fire({
            title: "Delete Call Language?",
            text: `Are you sure you want to delete "${lang.name}"? This action cannot be undone.`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#e11d48",
            cancelButtonColor: "#3f3f46",
            confirmButtonText: "Yes, delete it",
            background: "#18181b",
            color: "#ffffff",
        });
        if (!result.isConfirmed) return;

        setSaving(lang._id);
        try {
            await del(`/api/admin/languages/${lang._id}`);
            setLanguages(prev => prev.filter(l => l._id !== lang._id));
            setSuccess(`Call Language "${lang.name}" deleted.`);
            setTimeout(() => setSuccess(""), 3000);
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(null);
        }
    }

    function extractBaseLanguage(lang) {
        if (lang.language && lang.language.trim()) {
            return lang.language.trim();
        }
        const match = lang.name ? lang.name.match(/\(([^)]+)\)$/) : null;
        if (match && match[1]) {
            return match[1].trim();
        }
        return (lang.name || "").trim();
    }

    // Group all languages by base language name
    const groupedMap = new Map();
    languages.forEach(l => {
        const baseName = extractBaseLanguage(l);
        const key = baseName.toLowerCase();
        if (!groupedMap.has(key)) {
            groupedMap.set(key, {
                baseName,
                slug: toSlug(baseName),
                subprojects: [],
                enabled: false,
                maxPayout: 0,
                minPayout: Infinity,
                sampleRate: l.sampleRate || 48000,
                baseRecord: l
            });
        }
        const g = groupedMap.get(key);
        g.subprojects.push(l);
        if (l.enabled) g.enabled = true;
        const p = l.hourlyPayout || 0;
        if (p > g.maxPayout) g.maxPayout = p;
        if (p < g.minPayout) g.minPayout = p;
    });

    const baseLanguages = Array.from(groupedMap.values()).map(g => ({
        ...g,
        minPayout: g.minPayout === Infinity ? 0 : g.minPayout,
        activeCount: g.subprojects.filter(s => s.enabled).length,
    }));

    const filteredBaseLanguages = baseLanguages.filter(g => {
        if (showOnlyActive && !g.enabled) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        return (
            g.baseName.toLowerCase().includes(q) ||
            g.slug.includes(q) ||
            g.subprojects.some(s => 
                (s.name && s.name.toLowerCase().includes(q)) ||
                (s.projectName && s.projectName.toLowerCase().includes(q))
            )
        );
    });

    const activeLanguagesCount = baseLanguages.filter(g => g.enabled).length;
    const totalSubprojects = languages.length;

    return (
        <div className="min-h-screen bg-neutral-950 text-white pt-16 md:pt-0 md:pl-64">
            <AdminNav />
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12 space-y-6">

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
                                <Radio className="w-8 h-8 text-primary-500" />
                                <span>Call Languages</span>
                            </h1>
                            <span className="text-xs font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                {activeLanguagesCount} Active Languages
                            </span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700">
                                {totalSubprojects} Total Subprojects
                            </span>
                        </div>
                        <p className="text-sm text-neutral-400">
                            Click any language to manage its live call subprojects, custom speaker roles, hourly payouts, and daily quotas.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={openModal}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-bold text-sm shadow-lg shadow-primary-500/20 transition-all cursor-pointer"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Add Call Language</span>
                        </button>
                    </div>
                </div>

                {/* Status Banners */}
                {success && (
                    <div className="p-4 rounded-xl bg-emerald-900/30 border border-emerald-700/50 text-emerald-300 text-sm flex items-center gap-2 animate-fade-in">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        <span>{success}</span>
                    </div>
                )}
                {error && (
                    <div className="p-4 rounded-xl bg-rose-900/30 border border-rose-700/50 text-rose-300 text-sm flex items-center gap-2 animate-fade-in">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Filters & Active Language Controls */}
                <div className="flex flex-wrap items-center justify-between gap-4 bg-neutral-800/60 border border-neutral-700/70 p-4 rounded-2xl">
                    <div className="flex items-center gap-3 flex-1 min-w-[280px] max-w-md">
                        <div className="relative w-full">
                            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                            <input
                                type="text"
                                placeholder="Search call languages or subprojects..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-neutral-900/80 border border-neutral-700 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-primary-500"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Only Active Switch */}
                        <label className="flex items-center gap-2 text-xs font-bold text-neutral-300 cursor-pointer select-none bg-neutral-900/80 border border-neutral-700 px-3 py-2 rounded-xl">
                            <input
                                type="checkbox"
                                checked={showOnlyActive}
                                onChange={(e) => setShowOnlyActive(e.target.checked)}
                                className="rounded bg-neutral-800 border-neutral-600 text-primary-600 focus:ring-0 cursor-pointer"
                            />
                            <span>Show Only Active Languages</span>
                        </label>

                        <button
                            onClick={load}
                            disabled={loading}
                            title="Refresh Languages"
                            className="p-2 rounded-xl bg-neutral-900/80 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700 transition-all cursor-pointer"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Base Languages List */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24 text-neutral-500">
                        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-sm font-semibold">Loading Call Languages...</p>
                    </div>
                ) : filteredBaseLanguages.length === 0 ? (
                    <div className="text-center py-20 border border-dashed border-neutral-800 rounded-2xl bg-neutral-900/40">
                        <Radio className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
                        <h3 className="text-base font-bold text-neutral-300">
                            {showOnlyActive ? "No Active Call Languages Found" : "No Languages Match Search"}
                        </h3>
                        <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto mb-4">
                            {showOnlyActive 
                                ? "Currently there are no active languages enabled for live calls. Click below to add a language."
                                : "Try clearing your search filter or add a new call language."
                            }
                        </p>
                        <button
                            onClick={openModal}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-bold text-xs cursor-pointer"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add New Language</span>
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {filteredBaseLanguages.map((g) => (
                            <div
                                key={g.slug}
                                className={`p-5 rounded-2xl bg-neutral-800/50 border transition-all flex flex-col justify-between shadow-lg group hover:border-primary-500/60 ${
                                    g.enabled 
                                        ? "border-neutral-700/80 hover:shadow-primary-500/10" 
                                        : "border-neutral-800 opacity-70 bg-neutral-900/40"
                                }`}
                            >
                                <div>
                                    {/* Card Top */}
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="font-extrabold text-white text-xl group-hover:text-primary-400 transition-colors">
                                                    {g.baseName}
                                                </h3>
                                                <span className="text-xs font-mono px-2 py-0.5 rounded bg-neutral-900 text-neutral-400 border border-neutral-700">
                                                    {g.slug}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                <span className="text-[11px] font-bold text-primary-400 bg-primary-950/70 border border-primary-800/50 px-2 py-0.5 rounded-md flex items-center gap-1">
                                                    <FolderKanban className="w-3 h-3" />
                                                    <span>{g.subprojects.length} Subproject{g.subprojects.length !== 1 ? 's' : ''} ({g.activeCount} Active)</span>
                                                </span>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => toggleGroupEnable(g)}
                                            disabled={saving === g.slug}
                                            title={`Click to ${g.enabled ? 'disable' : 'activate'} all subprojects for ${g.baseName}`}
                                            className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer hover:scale-105 ${
                                                g.enabled 
                                                    ? "bg-emerald-900/60 text-emerald-300 border border-emerald-700/60 hover:bg-emerald-800/80" 
                                                    : "bg-neutral-800 text-neutral-400 border border-neutral-700 hover:bg-neutral-700 hover:text-white"
                                            }`}
                                        >
                                            <span className={`w-1.5 h-1.5 rounded-full ${g.enabled ? 'bg-emerald-400' : 'bg-neutral-500'}`} />
                                            <span>{saving === g.slug ? "Updating..." : g.enabled ? "Active" : "Disabled"}</span>
                                        </button>
                                    </div>

                                    {/* Subprojects Previews */}
                                    <div className="mt-3 space-y-1.5">
                                        <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">Configured Subprojects:</span>
                                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                                            {g.subprojects.map(s => (
                                                <span
                                                    key={s._id}
                                                    className={`text-[11px] px-2 py-1 rounded-lg border flex items-center gap-1 font-medium ${
                                                        s.enabled 
                                                            ? "bg-neutral-900/90 text-neutral-200 border-neutral-700" 
                                                            : "bg-neutral-900/40 text-neutral-500 border-neutral-800"
                                                    }`}
                                                >
                                                    <span className={`w-1.5 h-1.5 rounded-full ${s.enabled ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
                                                    <span className="truncate max-w-[170px]">{s.projectName || s.name}</span>
                                                    {s.enableCallRoles && <span className="text-[10px] text-indigo-400">🎭</span>}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Metrics Grid */}
                                    <div className="grid grid-cols-2 gap-2 mt-4 p-3 bg-neutral-900/70 border border-neutral-800 rounded-xl text-xs">
                                        <div>
                                            <span className="text-neutral-500 block text-[10px] uppercase font-bold">Hourly Payout</span>
                                            <span className="font-bold text-emerald-400 text-sm font-mono">
                                                ${g.maxPayout || 0} <span className="text-[10px] text-neutral-400 font-normal">/ hr</span>
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-neutral-500 block text-[10px] uppercase font-bold">Sample Rate</span>
                                            <span className="font-bold text-white text-xs font-mono">
                                                {g.sampleRate ? `${g.sampleRate / 1000} kHz` : "48 kHz"}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions Footer */}
                                <div className="mt-5 pt-3 border-t border-neutral-700/60 flex flex-col gap-2">
                                    <Link
                                        to={`/admin/languages/${g.slug}/subprojects`}
                                        className="w-full py-2.5 px-4 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                                    >
                                        <FolderKanban className="w-4 h-4" />
                                        <span>Manage Subprojects ({g.subprojects.length})</span>
                                        <ArrowRight className="w-3.5 h-3.5" />
                                    </Link>

                                    <div className="flex items-center justify-between gap-2 pt-1">
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => fetchSummary(g.baseRecord, "summary")}
                                                className="px-2.5 py-1 rounded-lg bg-neutral-700/60 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                            >
                                                <Activity className="w-3.5 h-3.5 text-primary-400" />
                                                <span>Stats</span>
                                            </button>
                                            <button
                                                onClick={() => fetchSummary(g.baseRecord, "users")}
                                                className="px-2.5 py-1 rounded-lg bg-neutral-700/60 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                            >
                                                <Users className="w-3.5 h-3.5 text-indigo-400" />
                                                <span>Contributors</span>
                                            </button>
                                        </div>

                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => openEditModal(g.baseRecord)}
                                                className="p-1.5 rounded-lg hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                                                title="Edit Language"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(g.baseRecord)}
                                                className="p-1.5 rounded-lg hover:bg-rose-900/40 text-neutral-400 hover:text-rose-400 transition-colors cursor-pointer"
                                                title="Delete Language"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Create / Edit Language Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up max-h-[90vh] flex flex-col">
                        <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Radio className="w-5 h-5 text-primary-400" />
                                <h2 className="text-lg font-bold text-white">
                                    {editingLanguage ? `Edit Call Language (${editingLanguage.name})` : "Add Call Language"}
                                </h2>
                            </div>
                            <button onClick={closeModal} className="text-neutral-400 hover:text-white p-1 rounded-lg">
                                ✕
                            </button>
                        </div>

                        <form onSubmit={saveLanguage} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
                            {modalError && (
                                <div className="p-3 bg-rose-900/30 border border-rose-700/50 text-rose-300 text-xs rounded-xl flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    <span>{modalError}</span>
                                </div>
                            )}

                            {/* Subproject & Language Inputs */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                                        Subproject / Project Name <span className="text-neutral-500 font-normal normal-case">(Optional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        autoFocus
                                        value={modalProjectName}
                                        onChange={(e) => setModalProjectName(e.target.value)}
                                        placeholder="e.g. Doctor-Patient Conversations"
                                        className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-sm text-white focus:outline-none focus:border-primary-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                                        Language <span className="text-primary-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={modalLanguage}
                                        onChange={(e) => setModalLanguage(e.target.value)}
                                        placeholder="e.g. Hindi, English"
                                        required
                                        className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-sm text-white focus:outline-none focus:border-primary-500"
                                    />
                                </div>
                            </div>

                            {/* Live Name Preview Banner */}
                            {(modalProjectName.trim() || modalLanguage.trim()) && (
                                <div className="bg-neutral-950 border border-neutral-800 px-3.5 py-2.5 rounded-xl flex items-center justify-between text-xs animate-fade-in">
                                    <span className="text-neutral-400 font-medium">User will see:</span>
                                    <span className="font-bold text-primary-400 font-mono text-sm">
                                        {modalProjectName.trim()
                                            ? `${modalProjectName.trim()} (${modalLanguage.trim() || "Language"})`
                                            : modalLanguage.trim()}
                                    </span>
                                </div>
                            )}

                            {/* Call Roles Switch */}
                            <div className="bg-neutral-950/80 border border-neutral-800 rounded-xl p-3.5 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                                            <span>🎭 Custom Roles (Doctor, Patient, Buyer, etc.)</span>
                                            <span className={`text-[10px] uppercase px-2 py-0.5 rounded font-extrabold ${modalEnableCallRoles ? 'bg-indigo-900/60 text-indigo-300 border border-indigo-700/50' : 'bg-neutral-800 text-neutral-400 border border-neutral-700'}`}>
                                                {modalEnableCallRoles ? 'Active' : 'Off (Direct Call)'}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-neutral-400 mt-0.5">
                                            Require matched callers to choose speaking roles before starting call.
                                        </p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={modalEnableCallRoles}
                                            onChange={(e) => setModalEnableCallRoles(e.target.checked)}
                                        />
                                        <div className="w-11 h-6 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                    </label>
                                </div>

                                {modalEnableCallRoles && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-800/80 animate-fade-in">
                                        <div>
                                            <label className="block text-[11px] font-bold uppercase text-indigo-300 mb-1">
                                                Role 1 Name <span className="text-rose-400">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={modalRole1}
                                                onChange={(e) => setModalRole1(e.target.value)}
                                                placeholder="e.g. Questioner / Buyer / Doctor"
                                                className="w-full px-3 py-2 bg-neutral-900 border border-indigo-700/60 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-400 font-semibold"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold uppercase text-emerald-300 mb-1">
                                                Role 2 Name <span className="text-rose-400">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={modalRole2}
                                                onChange={(e) => setModalRole2(e.target.value)}
                                                placeholder="e.g. Answerer / Seller / Patient"
                                                className="w-full px-3 py-2 bg-neutral-900 border border-emerald-700/60 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-400 font-semibold"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                                        Hourly Payout ($ / hr)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={modalHourlyPayout}
                                        onChange={(e) => setModalHourlyPayout(e.target.value)}
                                        placeholder="e.g. 25.00"
                                        required
                                        className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-sm text-white focus:outline-none focus:border-primary-500 font-mono"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                                        Sample Rate (Hz)
                                    </label>
                                    <select
                                        value={modalSampleRate}
                                        onChange={(e) => setModalSampleRate(e.target.value)}
                                        className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-sm text-white focus:outline-none focus:border-primary-500 font-mono"
                                    >
                                        <option value="48000">48000 Hz (48 kHz)</option>
                                        <option value="44100">44100 Hz (44.1 kHz)</option>
                                        <option value="16000">16000 Hz (16 kHz)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                                        Daily Call Limit
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={modalMaxDailyCallLimit}
                                        onChange={(e) => setModalMaxDailyCallLimit(e.target.value)}
                                        placeholder="5"
                                        className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-sm text-white focus:outline-none focus:border-primary-500 font-mono"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                                        Max Hours per Contributor
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={modalMaxHoursPerContributor}
                                        onChange={(e) => setModalMaxHoursPerContributor(e.target.value)}
                                        placeholder="Leave empty for unlimited"
                                        className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-sm text-white focus:outline-none focus:border-primary-500 font-mono"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2.5 pt-1">
                                <div className="flex items-center gap-2.5">
                                    <input
                                        type="checkbox"
                                        id="enabled-lang-checkbox"
                                        checked={modalEnabled}
                                        onChange={e => setModalEnabled(e.target.checked)}
                                        className="w-4 h-4 text-emerald-600 bg-neutral-800 border-neutral-700 rounded focus:ring-emerald-500"
                                    />
                                    <label htmlFor="enabled-lang-checkbox" className="text-xs font-semibold text-neutral-300 select-none cursor-pointer flex items-center gap-1.5">
                                        <span className={`w-2 h-2 rounded-full ${modalEnabled ? 'bg-emerald-400' : 'bg-neutral-500'}`} />
                                        <span>Enable this Language for Live Calls (Active)</span>
                                    </label>
                                </div>

                                <div className="flex items-center gap-2.5">
                                    <input
                                        type="checkbox"
                                        id="noisy-lang-checkbox"
                                        checked={modalNoisy}
                                        onChange={e => setModalNoisy(e.target.checked)}
                                        className="w-4 h-4 text-primary-600 bg-neutral-800 border-neutral-700 rounded focus:ring-primary-500"
                                    />
                                    <label htmlFor="noisy-lang-checkbox" className="text-xs font-semibold text-neutral-300 select-none cursor-pointer">
                                        Noisy Language (Bypasses YAMNet noise scanning)
                                    </label>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-neutral-800 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-neutral-300 cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={modalSaving}
                                    className="px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-bold text-xs shadow-lg disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                                >
                                    {modalSaving ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" />
                                            <span>{editingLanguage ? "Save Changes" : "Create Call Language"}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Contributor Summary / Users Modal */}
            {summaryModalLang && activeModalType && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={closeSummaryModal} />

                    <div className="relative bg-neutral-800 border border-neutral-700 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in text-white">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700 bg-neutral-850">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    {activeModalType === "summary" ? "📊 Contributor Demographics" : "👥 Contributors List"}
                                    <span className="text-warning-400 font-semibold">— {summaryModalLang.name}</span>
                                </h2>
                                <p className="text-xs text-neutral-400 mt-0.5">Call Language: {summaryModalLang.name} ({summaryModalLang.code})</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setActiveModalType(activeModalType === "summary" ? "users" : "summary")}
                                    className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-xs font-semibold rounded-lg text-neutral-200 transition-colors"
                                >
                                    Switch to {activeModalType === "summary" ? "👥 Users List" : "📊 Demographics"}
                                </button>
                                <button onClick={closeSummaryModal} className="text-neutral-400 hover:text-white transition-colors text-xl leading-none px-2">✕</button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="p-6 overflow-y-auto flex-1">
                            {summaryLoading ? (
                                <div className="flex justify-center py-16">
                                    <div className="w-10 h-10 border-4 border-warning-200 border-t-warning-500 rounded-full animate-spin" />
                                </div>
                            ) : !summaryData ? (
                                <div className="text-center py-12 text-neutral-400">Failed to load contributor data.</div>
                            ) : activeModalType === "summary" ? (
                                <div className="space-y-6">
                                    {/* Stats Overview */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                        <div className="bg-neutral-750 border border-neutral-700 p-4 rounded-xl">
                                            <span className="text-xs text-neutral-400 font-medium">Total Call Collection</span>
                                            <div className="text-xl font-bold text-white mt-1">{formatSecs(summaryData.totalCallSeconds)}</div>
                                        </div>
                                        <div className="bg-neutral-750 border border-neutral-700 p-4 rounded-xl">
                                            <span className="text-xs text-blue-400 font-medium">Completed Calls</span>
                                            <div className="text-xl font-bold text-blue-400 mt-1">{summaryData.completedCallsCount || 0}</div>
                                        </div>
                                        <div className="bg-neutral-750 border border-neutral-700 p-4 rounded-xl">
                                            <span className="text-xs text-emerald-400 font-medium">Appr. Rate (Apps)</span>
                                            <div className="text-xl font-bold text-emerald-400 mt-1">{summaryData.approvalRate ?? 0}%</div>
                                        </div>
                                        <div className="bg-neutral-750 border border-neutral-700 p-4 rounded-xl">
                                            <span className="text-xs text-red-400 font-medium">Rej. Rate (Apps)</span>
                                            <div className="text-xl font-bold text-red-400 mt-1">{summaryData.rejectionRate ?? 0}%</div>
                                        </div>
                                    </div>

                                    {/* Demographics Details Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Gender Breakdown */}
                                        <div className="bg-neutral-750 border border-neutral-700 p-5 rounded-xl">
                                            <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-wider mb-4">Gender Breakdown</h3>
                                            <div className="space-y-3">
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-neutral-300 font-medium">Male</span>
                                                        <span className="text-blue-400 font-semibold">{summaryData.male} ({summaryData.totalContributors > 0 ? Math.round((summaryData.male / summaryData.totalContributors) * 100) : 0}%)</span>
                                                    </div>
                                                    <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                        <div className="bg-blue-500 h-full rounded-full" style={{ width: `${summaryData.totalContributors > 0 ? (summaryData.male / summaryData.totalContributors) * 100 : 0}%` }} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-neutral-300 font-medium">Female</span>
                                                        <span className="text-pink-400 font-semibold">{summaryData.female} ({summaryData.totalContributors > 0 ? Math.round((summaryData.female / summaryData.totalContributors) * 100) : 0}%)</span>
                                                    </div>
                                                    <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                        <div className="bg-pink-500 h-full rounded-full" style={{ width: `${summaryData.totalContributors > 0 ? (summaryData.female / summaryData.totalContributors) * 100 : 0}%` }} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-neutral-300 font-medium">Other / Unspecified</span>
                                                        <span className="text-neutral-400 font-semibold">{summaryData.otherGender}</span>
                                                    </div>
                                                    <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                        <div className="bg-neutral-500 h-full rounded-full" style={{ width: `${summaryData.totalContributors > 0 ? (summaryData.otherGender / summaryData.totalContributors) * 100 : 0}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Age Distribution */}
                                        <div className="bg-neutral-750 border border-neutral-700 p-5 rounded-xl">
                                            <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-wider mb-4">Age Distribution</h3>
                                            <div className="space-y-3">
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-neutral-300 font-medium">18 – 30 Years</span>
                                                        <span className="text-warning-400 font-semibold">{summaryData.age_18_30} contributors</span>
                                                    </div>
                                                    <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                        <div className="bg-warning-500 h-full rounded-full" style={{ width: `${summaryData.totalContributors > 0 ? (summaryData.age_18_30 / summaryData.totalContributors) * 100 : 0}%` }} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-neutral-300 font-medium">30 – 45 Years</span>
                                                        <span className="text-warning-400 font-semibold">{summaryData.age_30_45} contributors</span>
                                                    </div>
                                                    <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                        <div className="bg-amber-500 h-full rounded-full" style={{ width: `${summaryData.totalContributors > 0 ? (summaryData.age_30_45 / summaryData.totalContributors) * 100 : 0}%` }} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-neutral-300 font-medium">45 – 60 Years</span>
                                                        <span className="text-warning-400 font-semibold">{summaryData.age_45_60} contributors</span>
                                                    </div>
                                                    <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                        <div className="bg-orange-500 h-full rounded-full" style={{ width: `${summaryData.totalContributors > 0 ? (summaryData.age_45_60 / summaryData.totalContributors) * 100 : 0}%` }} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-neutral-300 font-medium">60+ Years</span>
                                                        <span className="text-warning-400 font-semibold">{summaryData.age_60_plus} contributors</span>
                                                    </div>
                                                    <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                        <div className="bg-red-500 h-full rounded-full" style={{ width: `${summaryData.totalContributors > 0 ? (summaryData.age_60_plus / summaryData.totalContributors) * 100 : 0}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* Users Tab View */
                                <div>
                                    {/* Tabs */}
                                    <div className="flex items-center justify-between border-b border-neutral-700 pb-3 mb-4 gap-4 flex-wrap">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setUsersTab("approved")}
                                                className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${usersTab === "approved" ? "bg-emerald-600 text-white" : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"}`}
                                            >
                                                Approved Contributors ({summaryData.approvedUsers.length})
                                            </button>
                                            <button
                                                onClick={() => setUsersTab("pending")}
                                                className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${usersTab === "pending" ? "bg-amber-600 text-white" : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"}`}
                                            >
                                                Pending Contributors ({summaryData.pendingUsers.length})
                                            </button>
                                            <button
                                                onClick={() => setUsersTab("rejected")}
                                                className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${usersTab === "rejected" ? "bg-red-600 text-white" : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"}`}
                                            >
                                                Rejected Contributors ({summaryData.rejectedUsers?.length || 0})
                                            </button>
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Search by name, email, speaker_id..."
                                            value={usersSearch}
                                            onChange={e => setUsersSearch(e.target.value)}
                                            className="bg-neutral-700 border border-neutral-600 text-white placeholder-neutral-400 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-warning-500 min-w-[200px]"
                                        />
                                    </div>

                                    {/* Users Table */}
                                    {(() => {
                                        const list = usersTab === "approved" 
                                            ? summaryData.approvedUsers 
                                            : usersTab === "pending" 
                                            ? summaryData.pendingUsers 
                                            : (summaryData.rejectedUsers || []);
                                        const filtered = list.filter(u => {
                                            if (!usersSearch.trim()) return true;
                                            const q = usersSearch.toLowerCase();
                                            return (
                                                (u.firstname + " " + u.lastname).toLowerCase().includes(q) ||
                                                (u.username || "").toLowerCase().includes(q) ||
                                                (u.email || "").toLowerCase().includes(q) ||
                                                (u.speaker_id || "").toLowerCase().includes(q) ||
                                                (u.state || "").toLowerCase().includes(q)
                                            );
                                        });

                                        if (filtered.length === 0) {
                                            return (
                                                <div className="text-center py-12 text-neutral-400 text-sm">
                                                    No {usersTab} contributors found.
                                                </div>
                                            );
                                        }

                                        return (
                                            <div className="border border-neutral-700 rounded-xl overflow-hidden bg-neutral-850">
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-xs">
                                                        <thead className="bg-neutral-700 text-neutral-300 uppercase tracking-wider font-semibold">
                                                            <tr>
                                                                <th className="px-4 py-2.5 text-left">Speaker ID</th>
                                                                <th className="px-4 py-2.5 text-left">Contributor</th>
                                                                <th className="px-4 py-2.5 text-left">Email</th>
                                                                <th className="px-4 py-2.5 text-left">Gender / Age</th>
                                                                <th className="px-4 py-2.5 text-left">State / Locality</th>
                                                                <th className="px-4 py-2.5 text-left">Status</th>
                                                                <th className="px-4 py-2.5 text-left">Noise Gate (dB)</th>
                                                                <th className="px-4 py-2.5 text-right">Actions</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-neutral-700/80">
                                                            {filtered.map(u => (
                                                                <tr key={u._id} className="hover:bg-neutral-700/40">
                                                                    <td className="px-4 py-2.5 font-mono text-warning-400 font-semibold">{u.speaker_id}</td>
                                                                    <td className="px-4 py-2.5 font-medium text-white">
                                                                        {u.firstname} {u.lastname}
                                                                        <div className="text-[10px] text-neutral-400 font-normal">@{u.username}</div>
                                                                    </td>
                                                                    <td className="px-4 py-2.5 text-neutral-300">{u.email}</td>
                                                                    <td className="px-4 py-2.5 capitalize text-neutral-300">
                                                                        {u.gender} <span className="text-neutral-400">({u.age} yrs)</span>
                                                                    </td>
                                                                    <td className="px-4 py-2.5 text-neutral-300">
                                                                        {u.state} <span className="text-neutral-400">({u.locality})</span>
                                                                    </td>
                                                                    <td className="px-4 py-2.5">
                                                                        {u.status === "approved" ? (
                                                                            <span className="px-2 py-0.5 bg-emerald-900/60 text-emerald-300 text-[10px] font-bold rounded-full">Approved</span>
                                                                        ) : u.status === "rejected" ? (
                                                                            <span className="px-2 py-0.5 bg-red-900/60 text-red-300 text-[10px] font-bold rounded-full">Rejected</span>
                                                                        ) : (
                                                                            <span className="px-2 py-0.5 bg-amber-900/60 text-amber-300 text-[10px] font-bold rounded-full">Pending</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-2.5">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className={`px-2 py-0.5 text-[11px] font-mono font-bold rounded-md border ${
                                                                                (u.noiseGateDb || 0) === 0 
                                                                                    ? "bg-neutral-800 text-neutral-300 border-neutral-700" 
                                                                                    : "bg-warning-950/80 text-warning-400 border-warning-700/60"
                                                                            }`}>
                                                                                {(u.noiseGateDb || 0) === 0 ? "0 dB (RAW)" : `${u.noiseGateDb} dB`}
                                                                            </span>
                                                                            <button
                                                                                onClick={() => openSetCallNoiseGateModal(u)}
                                                                                className="px-2 py-1 bg-neutral-700 hover:bg-neutral-600 text-warning-400 hover:text-warning-300 text-[11px] font-semibold rounded-lg transition-colors border border-neutral-600 flex items-center gap-1 shadow-sm"
                                                                            >
                                                                                <Sliders className="w-3 h-3" />
                                                                                Set Noise Gate
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-2.5 text-right">
                                                                        {usersTab === "approved" && (
                                                                            <button
                                                                                onClick={() => handleRemoveCallContributor(u)}
                                                                                className="px-2.5 py-1 bg-red-600/90 hover:bg-red-600 text-white text-[11px] font-bold rounded-lg transition-colors shadow-sm whitespace-nowrap"
                                                                            >
                                                                                Remove Contributor
                                                                            </button>
                                                                        )}
                                                                        {usersTab === "rejected" && (
                                                                            <button
                                                                                onClick={() => handleResetCallContributor(u)}
                                                                                className="px-2.5 py-1 bg-blue-600/90 hover:bg-blue-600 text-white text-[11px] font-bold rounded-lg transition-colors shadow-sm whitespace-nowrap"
                                                                            >
                                                                                Reset Application
                                                                            </button>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
