import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
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
    ArrowLeft,
    FolderKanban,
    FileText
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

function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export default function AdminScriptedLanguageSubprojects() {
    const { langCode } = useParams();
    const [allLanguages, setAllLanguages] = useState([]);
    const [subprojects, setSubprojects] = useState([]);
    const [currentBaseLanguage, setCurrentBaseLanguage] = useState(capitalize(langCode || ""));
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [saving, setSaving] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [showOnlyActive, setShowOnlyActive] = useState(true);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingSubproject, setEditingSubproject] = useState(null);
    const [modalProjectName, setModalProjectName] = useState("");
    const [modalLanguage, setModalLanguage] = useState(capitalize(langCode || ""));
    const [modalHourlyPayout, setModalHourlyPayout] = useState("25.00");
    const [modalSampleRate, setModalSampleRate] = useState("48000");
    const [modalMaxHoursPerContributor, setModalMaxHoursPerContributor] = useState("");
    const [modalMaxDailyCallLimit, setModalMaxDailyCallLimit] = useState("5");
    const [modalNoisy, setModalNoisy] = useState(false);
    const [modalIsBoosted, setModalIsBoosted] = useState(false);
    const [modalEnableCallRoles, setModalEnableCallRoles] = useState(true);
    const [modalRole1, setModalRole1] = useState("Role 1");
    const [modalRole2, setModalRole2] = useState("Role 2");
    const [modalTestPhrase, setModalTestPhrase] = useState("");
    const [modalSaving, setModalSaving] = useState(false);
    const [modalError, setModalError] = useState("");

    // Summary & Users Modals State
    const [summaryModalLang, setSummaryModalLang] = useState(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryData, setSummaryData] = useState(null);
    const [activeModalType, setActiveModalType] = useState(null); // "summary" | "users"
    const [usersTab, setUsersTab] = useState("approved");
    const [usersSearch, setUsersSearch] = useState("");

    useEffect(() => {
        loadSubprojects();
    }, [langCode]);

    async function toggleBoost(sub) {
        const newBoost = !sub.isBoosted;
        if (newBoost && !sub.enabled) {
            setError(`Cannot boost "${sub.projectName || sub.name}" because the project is disabled. Please enable the project first before boosting.`);
            setTimeout(() => setError(""), 4000);
            return;
        }
        setSaving(sub._id);
        try {
            await patch(`/api/admin/scripted-languages/${sub._id}`, { isBoosted: newBoost });
            setSubprojects(prev => prev.map(s => s._id === sub._id ? { ...s, isBoosted: newBoost } : s));
            setSuccess(`Scripted subproject ${newBoost ? "boosted & recommended" : "unboosted"} successfully.`);
            setTimeout(() => setSuccess(""), 3000);
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(null);
        }
    }

    async function loadSubprojects() {
        setLoading(true);
        setError("");
        try {
            const data = await get("/api/admin/scripted-languages");
            const list = data.languages || [];
            setAllLanguages(list);

            const cleanCode = (langCode || "").toLowerCase().trim();
            // Filter subprojects that belong to this base language
            const matched = list.filter((l) => {
                const bLang = (l.language || "").toLowerCase().trim();
                const lCode = (l.code || "").toLowerCase().trim();
                const lName = (l.name || "").toLowerCase().trim();
                return (
                    bLang === cleanCode ||
                    lCode === cleanCode ||
                    lCode.endsWith(`-${cleanCode}`) ||
                    lName === cleanCode ||
                    lName.includes(`(${cleanCode})`)
                );
            });

            // Find canonical base language name if available
            const baseObj = list.find(l => (l.language && l.language.toLowerCase() === cleanCode) || l.code.toLowerCase() === cleanCode);
            const baseName = baseObj?.language || (baseObj && !baseObj.projectName ? baseObj.name : capitalize(langCode || ""));
            setCurrentBaseLanguage(baseName);
            setModalLanguage(baseName);
            setSubprojects(matched);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    function openAddModal() {
        setEditingSubproject(null);
        setModalProjectName("");
        setModalLanguage(currentBaseLanguage);
        setModalHourlyPayout("25.00");
        setModalSampleRate("48000");
        setModalMaxHoursPerContributor("");
        setModalMaxDailyCallLimit("5");
        setModalNoisy(false);
        setModalIsBoosted(false);
        setModalEnableCallRoles(true);
        setModalRole1("Role 1");
        setModalRole2("Role 2");
        setModalTestPhrase("");
        setModalError("");
        setShowModal(true);
    }

    function openEditModal(sub) {
        setEditingSubproject(sub);
        setModalProjectName(sub.projectName || (sub.name !== currentBaseLanguage ? sub.name : ""));
        setModalLanguage(sub.language || currentBaseLanguage);
        setModalHourlyPayout(sub.hourlyPayout !== undefined ? String(sub.hourlyPayout) : "25.00");
        setModalSampleRate(sub.sampleRate !== undefined ? String(sub.sampleRate) : "48000");
        setModalMaxHoursPerContributor(sub.maxHoursPerContributor !== undefined && sub.maxHoursPerContributor !== -1 ? String(sub.maxHoursPerContributor) : "");
        setModalMaxDailyCallLimit(sub.maxDailyCallLimit !== undefined ? String(sub.maxDailyCallLimit) : "5");
        setModalNoisy(!!sub.noisy);
        setModalIsBoosted(!!sub.isBoosted);
        setModalEnableCallRoles(sub.enableCallRoles !== undefined ? !!sub.enableCallRoles : true);
        setModalRole1(sub.role1 || "Role 1");
        setModalRole2(sub.role2 || "Role 2");
        setModalTestPhrase(sub.testPhrase || "");
        setModalError("");
        setShowModal(true);
    }

    function closeModal() {
        setShowModal(false);
        setEditingSubproject(null);
        setModalError("");
    }

    async function saveSubproject(e) {
        e.preventDefault();
        const projName = modalProjectName.trim();
        const langStr = (modalLanguage || currentBaseLanguage).trim();
        if (!langStr) return setModalError("Language is required.");

        // Format name: "Project Name (Language)" or just "Language"
        const computedName = projName ? `${projName} (${langStr})` : langStr;
        const code = editingSubproject ? editingSubproject.code : toSlug(computedName);

        const hourlyPayout = parseFloat(modalHourlyPayout);
        if (isNaN(hourlyPayout) || hourlyPayout < 0) return setModalError("Please enter a valid hourly payout ($/hr).");

        const sampleRate = parseInt(modalSampleRate, 10);
        if (isNaN(sampleRate) || sampleRate <= 0) return setModalError("Please enter a valid sample rate (e.g. 48000).");

        const maxDailyCallLimit = parseInt(modalMaxDailyCallLimit, 10);
        if (isNaN(maxDailyCallLimit) || maxDailyCallLimit < 1) return setModalError("Max daily calls must be at least 1.");

        let maxHours = -1;
        if (modalMaxHoursPerContributor.trim() !== "") {
            maxHours = parseFloat(modalMaxHoursPerContributor);
            if (isNaN(maxHours) || maxHours < 0) return setModalError("Max contribution limit must be a valid positive number or left blank for unlimited.");
        }

        const role1 = modalRole1.trim() || "Role 1";
        const role2 = modalRole2.trim() || "Role 2";
        if (modalEnableCallRoles && (!modalRole1.trim() || !modalRole2.trim())) {
            return setModalError("Please specify both Role 1 and Role 2 names.");
        }

        setModalSaving(true);
        setModalError("");
        try {
            const payload = {
                name: computedName,
                projectName: projName,
                language: langStr,
                hourlyPayout,
                sampleRate,
                maxHoursPerContributor: maxHours,
                maxDailyCallLimit,
                noisy: modalNoisy,
                isBoosted: modalIsBoosted,
                enableCallRoles: modalEnableCallRoles,
                role1: modalEnableCallRoles ? role1 : "Role 1",
                role2: modalEnableCallRoles ? role2 : "Role 2",
                testPhrase: modalTestPhrase.trim(),
            };

            if (editingSubproject) {
                await patch(`/api/admin/scripted-languages/${editingSubproject._id}`, payload);
                setSuccess(`Scripted Subproject "${computedName}" updated successfully.`);
            } else {
                await postJson("/api/admin/scripted-languages", { ...payload, code });
                setSuccess(`Scripted Subproject "${computedName}" created successfully.`);
            }
            closeModal();
            await loadSubprojects();
        } catch (e) {
            setModalError(e.message === "Language code already exists"
                ? "A subproject with that name/code already exists."
                : e.message);
        } finally {
            setModalSaving(false);
        }
    }

    async function toggleEnable(sub) {
        const next = !sub.enabled;
        setSaving(sub._id);
        try {
            const data = await patch(`/api/admin/scripted-languages/${sub._id}`, { enabled: next });
            setSubprojects(prev => prev.map(l => l._id === sub._id ? data.language || { ...l, enabled: next } : l));
            setSuccess(`Scripted Subproject "${sub.name}" is now ${next ? "active" : "disabled"}.`);
            setTimeout(() => setSuccess(""), 3000);
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(null);
        }
    }

    async function handleDelete(sub) {
        const result = await Swal.fire({
            title: "Delete Scripted Subproject?",
            text: `Are you sure you want to delete "${sub.name}"? This action cannot be undone.`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#e11d48",
            cancelButtonColor: "#3f3f46",
            confirmButtonText: "Yes, delete it",
            background: "#18181b",
            color: "#ffffff",
        });
        if (!result.isConfirmed) return;

        setSaving(sub._id);
        try {
            await del(`/api/admin/scripted-languages/${sub._id}`);
            setSubprojects(prev => prev.filter(l => l._id !== sub._id));
            setSuccess(`Scripted Subproject "${sub.name}" deleted.`);
            setTimeout(() => setSuccess(""), 3000);
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(null);
        }
    }

    async function fetchSummary(lang, modalType = "summary") {
        setSummaryModalLang(lang);
        setActiveModalType(modalType);
        setSummaryLoading(true);
        setSummaryData(null);
        try {
            const data = await get(`/api/admin/scripted-languages/${lang._id}/contributors-summary`);
            setSummaryData(data);
        } catch (e) {
            console.error(e);
            setError("Failed to load contributor data: " + e.message);
        } finally {
            setSummaryLoading(false);
        }
    }

    function closeSummaryModal() {
        setSummaryModalLang(null);
        setActiveModalType(null);
        setSummaryData(null);
        setUsersSearch("");
    }

    async function handleRemoveScriptedContributor(u) {
        const result = await Swal.fire({
            title: "Remove Contributor?",
            text: `Are you sure you want to remove ${u.firstname} ${u.lastname} from ${summaryModalLang.name}?`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#e11d48",
            cancelButtonColor: "#3f3f46",
            confirmButtonText: "Yes, Remove",
            background: "#18181b",
            color: "#ffffff",
        });
        if (!result.isConfirmed) return;

        try {
            await postJson(`/api/admin/scripted-languages/${summaryModalLang._id}/remove-contributor`, { userId: u._id });
            await Swal.fire({
                title: "Contributor Removed",
                text: "The user has been removed from this scripted language.",
                icon: "success",
                background: "#18181b",
                color: "#ffffff"
            });
            fetchSummary(summaryModalLang, "users");
        } catch (e) {
            Swal.fire({
                title: "Error",
                text: e.message,
                icon: "error",
                background: "#18181b",
                color: "#ffffff"
            });
        }
    }

    async function handleResetScriptedContributor(u) {
        const result = await Swal.fire({
            title: "Reset Application?",
            text: `Reset application for ${u.firstname} ${u.lastname} back to Pending?`,
            icon: "question",
            showCancelButton: true,
            confirmButtonColor: "#3b82f6",
            cancelButtonColor: "#3f3f46",
            confirmButtonText: "Yes, Reset",
            background: "#18181b",
            color: "#ffffff",
        });
        if (!result.isConfirmed) return;

        try {
            await postJson(`/api/admin/scripted-languages/${summaryModalLang._id}/reset-contributor`, { userId: u._id });
            await Swal.fire({
                title: "Application Reset",
                text: "The application is back to pending review.",
                icon: "success",
                background: "#18181b",
                color: "#ffffff"
            });
            fetchSummary(summaryModalLang, "users");
        } catch (e) {
            Swal.fire({
                title: "Error",
                text: e.message,
                icon: "error",
                background: "#18181b",
                color: "#ffffff"
            });
        }
    }

    const filteredSubprojects = subprojects.filter((sub) => {
        if (showOnlyActive && !sub.enabled) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        return (
            (sub.name && sub.name.toLowerCase().includes(q)) ||
            (sub.code && sub.code.toLowerCase().includes(q)) ||
            (sub.projectName && sub.projectName.toLowerCase().includes(q)) ||
            (sub.role1 && sub.role1.toLowerCase().includes(q)) ||
            (sub.role2 && sub.role2.toLowerCase().includes(q))
        );
    });

    const activeCount = subprojects.filter(s => s.enabled).length;

    return (
        <div className="min-h-screen bg-neutral-950 text-white pt-16 md:pt-0 md:pl-64">
            <AdminNav />
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12 space-y-6">

                {/* Back Link */}
                <Link
                    to="/admin/scripted-languages"
                    className="inline-flex items-center gap-2 text-xs font-bold text-neutral-400 hover:text-primary-400 transition-colors group"
                >
                    <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                    <span>Back to Scripted Call Languages</span>
                </Link>

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
                                <FolderKanban className="w-8 h-8 text-primary-500" />
                                <span>{currentBaseLanguage} Scripted Subprojects</span>
                            </h1>
                            <span className="text-xs font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                {activeCount} of {subprojects.length} Active
                            </span>
                        </div>
                        <p className="text-sm text-neutral-400">
                            Create and manage scripted calling subprojects, speaking roles (e.g. Doctor vs Patient), hourly payout rates, test phrases, and quotas under {currentBaseLanguage}.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Link
                            to="/admin/scripted-topics"
                            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-bold text-xs border border-neutral-700 transition-all cursor-pointer"
                        >
                            <FileText className="w-4 h-4 text-warning-400" />
                            <span>Scripted Topics & Prompts</span>
                        </Link>
                        <button
                            onClick={openAddModal}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-bold text-sm shadow-lg shadow-primary-500/20 transition-all cursor-pointer"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Add Subproject</span>
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

                {/* Filters Bar */}
                <div className="flex flex-wrap items-center justify-between gap-4 bg-neutral-800/60 border border-neutral-700/70 p-4 rounded-2xl">
                    <div className="flex items-center gap-3 flex-1 min-w-[280px] max-w-md">
                        <div className="relative w-full">
                            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                            <input
                                type="text"
                                placeholder={`Search scripted subprojects in ${currentBaseLanguage}...`}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-neutral-900/80 border border-neutral-700 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-primary-500"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-xs font-bold text-neutral-300 cursor-pointer select-none bg-neutral-900/80 border border-neutral-700 px-3 py-2 rounded-xl">
                            <input
                                type="checkbox"
                                checked={showOnlyActive}
                                onChange={(e) => setShowOnlyActive(e.target.checked)}
                                className="rounded bg-neutral-800 border-neutral-600 text-primary-600 focus:ring-0 cursor-pointer"
                            />
                            <span>Show Only Active Subprojects</span>
                        </label>

                        <button
                            onClick={loadSubprojects}
                            disabled={loading}
                            title="Refresh Subprojects"
                            className="p-2 rounded-xl bg-neutral-900/80 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700 transition-all cursor-pointer"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Subprojects Grid */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24 text-neutral-500">
                        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-sm font-semibold">Loading {currentBaseLanguage} Subprojects...</p>
                    </div>
                ) : filteredSubprojects.length === 0 ? (
                    <div className="text-center py-20 border border-dashed border-neutral-800 rounded-2xl bg-neutral-900/40">
                        <FolderKanban className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
                        <h3 className="text-base font-bold text-neutral-300">
                            {showOnlyActive ? `No Active Scripted Subprojects in ${currentBaseLanguage}` : `No Scripted Subprojects Found in ${currentBaseLanguage}`}
                        </h3>
                        <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto mb-4">
                            {showOnlyActive 
                                ? `There are currently no active scripted subprojects enabled under ${currentBaseLanguage}. Click below to add one.`
                                : `Get started by creating your first scripted subproject (e.g. Doctor-Patient Scripted Conversations) in ${currentBaseLanguage}.`
                            }
                        </p>
                        <button
                            onClick={openAddModal}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-bold text-xs cursor-pointer"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Create Scripted Subproject</span>
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {filteredSubprojects.map((sub) => (
                            <div
                                key={sub._id}
                                className={`p-5 rounded-2xl bg-neutral-800/50 border transition-all flex flex-col justify-between shadow-lg ${
                                    sub.enabled 
                                        ? "border-neutral-700/80 hover:border-primary-500/50 hover:shadow-primary-500/5" 
                                        : "border-neutral-800 opacity-60 bg-neutral-900/40"
                                }`}
                            >
                                <div>
                                    {/* Card Top */}
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="font-bold text-white text-lg">{sub.name}</h3>
                                                <span className="text-xs font-mono px-2 py-0.5 rounded bg-neutral-900 text-neutral-400 border border-neutral-700">
                                                    {sub.code}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                <span className="text-[11px] text-primary-400 font-semibold block">
                                                    Scripted Subproject in {sub.language || currentBaseLanguage}
                                                </span>
                                                {sub.enableCallRoles ? (
                                                    <span className="text-[10px] font-bold text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800/60 inline-flex items-center gap-1">
                                                        🎭 {sub.role1 || "Role 1"} vs {sub.role2 || "Role 2"}
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800 font-medium">
                                                        ⚪ Direct (No Roles)
                                                    </span>
                                                )}
                                                {sub.noisy && (
                                                    <span className="text-[10px] font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800/60 inline-flex items-center gap-1">
                                                        ⚠️ Noisy
                                                    </span>
                                                )}
                                                {sub.isBoosted && (
                                                    <span className="text-[10px] font-extrabold text-amber-300 bg-gradient-to-r from-amber-500/20 to-orange-500/20 px-2 py-0.5 rounded border border-amber-500/50 inline-flex items-center gap-1 shadow-sm">
                                                        🔥 Boosted
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => toggleEnable(sub)}
                                            disabled={saving === sub._id}
                                            className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                                                sub.enabled 
                                                    ? "bg-emerald-900/60 text-emerald-300 border border-emerald-700/60 hover:bg-emerald-800" 
                                                    : "bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-white"
                                            }`}
                                        >
                                            <span className={`w-1.5 h-1.5 rounded-full ${sub.enabled ? 'bg-emerald-400' : 'bg-neutral-500'}`} />
                                            <span>{sub.enabled ? "Active" : "Disabled"}</span>
                                        </button>
                                    </div>

                                    {/* Metrics Grid */}
                                    <div className="grid grid-cols-2 gap-2 mt-4 p-3 bg-neutral-900/70 border border-neutral-800 rounded-xl text-xs">
                                        <div>
                                            <span className="text-neutral-500 block text-[10px] uppercase font-bold">Hourly Payout</span>
                                            <span className="font-bold text-emerald-400 text-sm font-mono">
                                                ${sub.hourlyPayout || 0} <span className="text-[10px] text-neutral-400 font-normal">/ hr</span>
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-neutral-500 block text-[10px] uppercase font-bold">Sample Rate</span>
                                            <span className="font-bold text-white text-xs font-mono">
                                                {sub.sampleRate ? `${sub.sampleRate / 1000} kHz` : "48 kHz"}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-neutral-500 block text-[10px] uppercase font-bold">Daily Call Limit</span>
                                            <span className="font-bold text-white text-xs font-mono">
                                                {sub.maxDailyCallLimit || 5} calls/day
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-neutral-500 block text-[10px] uppercase font-bold">Max Contrib. Limit</span>
                                            <span className="font-bold text-white text-xs font-mono">
                                                {sub.maxHoursPerContributor && sub.maxHoursPerContributor !== -1 ? `${sub.maxHoursPerContributor} hrs` : "Unlimited"}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions Footer */}
                                <div className="mt-5 pt-3 border-t border-neutral-700/60 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={() => fetchSummary(sub, "summary")}
                                            className="px-2.5 py-1.5 rounded-lg bg-neutral-700/60 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                        >
                                            <Activity className="w-3.5 h-3.5 text-primary-400" />
                                            <span>Stats</span>
                                        </button>
                                        <button
                                            onClick={() => fetchSummary(sub, "users")}
                                            className="px-2.5 py-1.5 rounded-lg bg-neutral-700/60 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                        >
                                            <Users className="w-3.5 h-3.5 text-indigo-400" />
                                            <span>Contributors</span>
                                        </button>
                                        <button
                                            onClick={() => toggleBoost(sub)}
                                            disabled={saving === sub._id}
                                            className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                                sub.isBoosted
                                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                                                    : 'bg-neutral-700/60 hover:bg-neutral-700 text-neutral-300 hover:text-white'
                                            }`}
                                            title={sub.isBoosted ? "Unboost from Dashboard" : "Boost on Contributor Dashboard"}
                                        >
                                            <span>🚀 {sub.isBoosted ? 'Boosted' : 'Boost'}</span>
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => openEditModal(sub)}
                                            className="p-1.5 rounded-lg hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                                            title="Edit Subproject"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(sub)}
                                            className="p-1.5 rounded-lg hover:bg-rose-900/40 text-neutral-400 hover:text-rose-400 transition-colors cursor-pointer"
                                            title="Delete Subproject"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Create / Edit Subproject Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up max-h-[90vh] flex flex-col">
                        <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <FolderKanban className="w-5 h-5 text-primary-400" />
                                <h2 className="text-lg font-bold text-white">
                                    {editingSubproject ? `Edit Scripted Subproject (${editingSubproject.name})` : `Add Scripted Subproject under ${currentBaseLanguage}`}
                                </h2>
                            </div>
                            <button onClick={closeModal} className="text-neutral-400 hover:text-white p-1 rounded-lg cursor-pointer">
                                ✕
                            </button>
                        </div>

                        <form onSubmit={saveSubproject} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
                            {modalError && (
                                <div className="p-3 bg-rose-900/30 border border-rose-700/50 text-rose-300 text-xs rounded-xl flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    <span>{modalError}</span>
                                </div>
                            )}

                            {/* Subproject Name Input */}
                            <div>
                                <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5 flex items-center justify-between">
                                    <span>Subproject / Scenario Name <span className="text-primary-400">*</span></span>
                                    <span className="text-[11px] font-bold text-primary-400">Language: {currentBaseLanguage}</span>
                                </label>
                                <input
                                    type="text"
                                    autoFocus
                                    value={modalProjectName}
                                    onChange={(e) => setModalProjectName(e.target.value)}
                                    placeholder="e.g. Doctor-Patient Conversations, Hotel Booking, Customer Support..."
                                    required
                                    className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-sm text-white focus:outline-none focus:border-primary-500 font-medium"
                                />
                            </div>

                            {/* Live Name Preview Banner */}
                            {modalProjectName.trim() && (
                                <div className="bg-neutral-950 border border-neutral-800 px-3.5 py-2.5 rounded-xl flex items-center justify-between text-xs animate-fade-in">
                                    <span className="text-neutral-400 font-medium">User will see:</span>
                                    <span className="font-bold text-primary-400 font-mono text-sm">
                                        {modalProjectName.trim()} ({currentBaseLanguage})
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
                                                placeholder="e.g. Doctor / Buyer / Speaker 1"
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
                                                placeholder="e.g. Patient / Seller / Speaker 2"
                                                className="w-full px-3 py-2 bg-neutral-900 border border-emerald-700/60 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-400 font-semibold"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Test Phrase Input */}
                            <div>
                                <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5 flex items-center justify-between">
                                    <span>Applicant Test Phrase</span>
                                    <span className="text-[10px] text-neutral-500 font-normal">Optional screening phrase</span>
                                </label>
                                <textarea
                                    rows={2}
                                    value={modalTestPhrase}
                                    onChange={(e) => setModalTestPhrase(e.target.value)}
                                    placeholder="Enter a prompt phrase for contributors applying to this scripted project..."
                                    className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500 resize-none"
                                />
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

                            <div className="flex items-center gap-2.5 pt-1">
                                <input
                                    type="checkbox"
                                    id="noisy-scripted-subproject-checkbox"
                                    checked={modalNoisy}
                                    onChange={e => setModalNoisy(e.target.checked)}
                                    className="w-4 h-4 text-primary-600 bg-neutral-800 border-neutral-700 rounded focus:ring-primary-500"
                                />
                                <label htmlFor="noisy-scripted-subproject-checkbox" className="text-xs font-semibold text-neutral-300 select-none cursor-pointer">
                                    Noisy Language (Bypasses YAMNet noise scanning)
                                </label>
                            </div>

                            <div className="flex items-center gap-2.5 pt-1">
                                <input
                                    type="checkbox"
                                    id="boost-scripted-subproject-checkbox"
                                    checked={modalIsBoosted}
                                    onChange={e => setModalIsBoosted(e.target.checked)}
                                    className="w-4 h-4 text-amber-500 bg-neutral-800 border-neutral-700 rounded focus:ring-amber-500"
                                />
                                <label htmlFor="boost-scripted-subproject-checkbox" className="text-xs font-bold text-amber-300 select-none cursor-pointer flex items-center gap-1.5">
                                    <span>🚀 Boost Project (Feature prominently on Contributor Dashboard)</span>
                                </label>
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
                                            <span>{editingSubproject ? "Save Changes" : "Create Scripted Subproject"}</span>
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
                                    <span className="text-primary-400 font-semibold">— {summaryModalLang.name}</span>
                                </h2>
                                <p className="text-xs text-neutral-400 mt-0.5">Scripted Subproject: {summaryModalLang.name} ({summaryModalLang.code})</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setActiveModalType(activeModalType === "summary" ? "users" : "summary")}
                                    className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-xs font-semibold rounded-lg text-neutral-200 transition-colors cursor-pointer"
                                >
                                    Switch to {activeModalType === "summary" ? "👥 Users List" : "📊 Demographics"}
                                </button>
                                <button onClick={closeSummaryModal} className="text-neutral-400 hover:text-white transition-colors text-xl leading-none px-2 cursor-pointer">✕</button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="p-6 overflow-y-auto flex-1">
                            {summaryLoading ? (
                                <div className="flex justify-center py-16">
                                    <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
                                </div>
                            ) : !summaryData ? (
                                <div className="text-center py-12 text-neutral-400">Failed to load contributor data.</div>
                            ) : activeModalType === "summary" ? (
                                <div className="space-y-6">
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

                                        <div className="bg-neutral-750 border border-neutral-700 p-5 rounded-xl">
                                            <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-wider mb-4">Age Distribution</h3>
                                            <div className="space-y-3">
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-neutral-300 font-medium">18 – 30 Years</span>
                                                        <span className="text-primary-400 font-semibold">{summaryData.age_18_30} contributors</span>
                                                    </div>
                                                    <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                        <div className="bg-primary-500 h-full rounded-full" style={{ width: `${summaryData.totalContributors > 0 ? (summaryData.age_18_30 / summaryData.totalContributors) * 100 : 0}%` }} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-neutral-300 font-medium">30 – 45 Years</span>
                                                        <span className="text-primary-400 font-semibold">{summaryData.age_30_45} contributors</span>
                                                    </div>
                                                    <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                        <div className="bg-amber-500 h-full rounded-full" style={{ width: `${summaryData.totalContributors > 0 ? (summaryData.age_30_45 / summaryData.totalContributors) * 100 : 0}%` }} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-neutral-300 font-medium">45 – 60 Years</span>
                                                        <span className="text-primary-400 font-semibold">{summaryData.age_45_60} contributors</span>
                                                    </div>
                                                    <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                        <div className="bg-orange-500 h-full rounded-full" style={{ width: `${summaryData.totalContributors > 0 ? (summaryData.age_45_60 / summaryData.totalContributors) * 100 : 0}%` }} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-neutral-300 font-medium">60+ Years</span>
                                                        <span className="text-primary-400 font-semibold">{summaryData.age_60_plus} contributors</span>
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
                                    <div className="flex items-center justify-between border-b border-neutral-700 pb-3 mb-4 gap-4 flex-wrap">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setUsersTab("approved")}
                                                className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${usersTab === "approved" ? "bg-emerald-600 text-white" : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"}`}
                                            >
                                                Approved ({summaryData.approvedUsers.length})
                                            </button>
                                            <button
                                                onClick={() => setUsersTab("pending")}
                                                className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${usersTab === "pending" ? "bg-amber-600 text-white" : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"}`}
                                            >
                                                Pending ({summaryData.pendingUsers.length})
                                            </button>
                                            <button
                                                onClick={() => setUsersTab("rejected")}
                                                className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${usersTab === "rejected" ? "bg-red-600 text-white" : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"}`}
                                            >
                                                Rejected ({summaryData.rejectedUsers?.length || 0})
                                            </button>
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Search by name, email, speaker_id..."
                                            value={usersSearch}
                                            onChange={e => setUsersSearch(e.target.value)}
                                            className="bg-neutral-700 border border-neutral-600 text-white placeholder-neutral-400 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 min-w-[200px]"
                                        />
                                    </div>

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
                                                                <th className="px-4 py-2.5 text-right">Actions</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-neutral-700/80">
                                                            {filtered.map(u => (
                                                                <tr key={u._id} className="hover:bg-neutral-700/40">
                                                                    <td className="px-4 py-2.5 font-mono text-primary-400 font-semibold">{u.speaker_id}</td>
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
                                                                    <td className="px-4 py-2.5 text-right">
                                                                        {usersTab === "approved" && (
                                                                            <button
                                                                                onClick={() => handleRemoveScriptedContributor(u)}
                                                                                className="px-2.5 py-1 bg-red-600/90 hover:bg-red-600 text-white text-[11px] font-bold rounded-lg transition-colors shadow-sm whitespace-nowrap cursor-pointer"
                                                                            >
                                                                                Remove
                                                                            </button>
                                                                        )}
                                                                        {usersTab === "rejected" && (
                                                                            <button
                                                                                onClick={() => handleResetScriptedContributor(u)}
                                                                                className="px-2.5 py-1 bg-blue-600/90 hover:bg-blue-600 text-white text-[11px] font-bold rounded-lg transition-colors shadow-sm whitespace-nowrap cursor-pointer"
                                                                            >
                                                                                Reset App
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
