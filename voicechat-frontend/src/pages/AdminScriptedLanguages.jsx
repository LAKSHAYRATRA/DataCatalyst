import React, { useEffect, useState } from "react";
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
    Filter
} from "lucide-react";
import AdminNav from "../components/AdminNav.jsx";
import Swal from "sweetalert2";

const BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

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

export default function AdminScriptedLanguages() {
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
    const [modalHourlyPayout, setModalHourlyPayout] = useState("");
    const [modalSampleRate, setModalSampleRate] = useState("48000");
    const [modalMaxHoursPerContributor, setModalMaxHoursPerContributor] = useState("");
    const [modalMaxDailyCallLimit, setModalMaxDailyCallLimit] = useState("5");
    const [modalNoisy, setModalNoisy] = useState(false);
    const [modalTestPhrase, setModalTestPhrase] = useState("");
    const [modalSaving, setModalSaving] = useState(false);
    const [modalError, setModalError] = useState("");

    // Summary modal
    const [summaryModalLang, setSummaryModalLang] = useState(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryData, setSummaryData] = useState(null);
    const [activeModalType, setActiveModalType] = useState(null); // "summary" | "users"
    const [usersTab, setUsersTab] = useState("approved"); // "approved" | "pending"
    const [usersSearch, setUsersSearch] = useState("");

    useEffect(() => {
        load();
    }, []);

    async function load() {
        setLoading(true);
        setError("");
        try {
            const data = await get("/api/admin/scripted-languages");
            setLanguages(data.languages || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    async function toggleEnable(lang) {
        const next = !lang.enabled;
        setSaving(lang._id);
        try {
            const data = await patch(`/api/admin/scripted-languages/${lang._id}`, { enabled: next });
            setLanguages(prev => prev.map(l => l._id === lang._id ? data.language : l));
            setSuccess(`Scripted Language "${lang.name}" ${next ? "activated" : "disabled"}.`);
            setTimeout(() => setSuccess(""), 3000);
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(null);
        }
    }

    async function handleDelete(lang) {
        const result = await Swal.fire({
            title: `Delete Scripted Language?`,
            text: `Are you sure you want to remove "${lang.name}"? This action cannot be undone.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#e11d48',
            cancelButtonColor: '#4b5563',
            confirmButtonText: 'Yes, Delete'
        });

        if (!result.isConfirmed) return;

        setSaving(lang._id);
        try {
            await del(`/api/admin/scripted-languages/${lang._id}`);
            setLanguages(prev => prev.filter(l => l._id !== lang._id));
            Swal.fire('Deleted', `Language "${lang.name}" has been removed.`, 'success');
        } catch (e) {
            Swal.fire('Error', e.message, 'error');
        } finally {
            setSaving(null);
        }
    }

    function openModal() {
        setEditingLanguage(null);
        setModalName("");
        setModalHourlyPayout("");
        setModalSampleRate("48000");
        setModalMaxHoursPerContributor("");
        setModalMaxDailyCallLimit("5");
        setModalNoisy(false);
        setModalTestPhrase("");
        setModalError("");
        setShowModal(true);
    }

    function openEditModal(language) {
        setEditingLanguage(language);
        setModalName(language.name || "");
        setModalHourlyPayout(language.hourlyPayout !== undefined ? String(language.hourlyPayout) : "");
        setModalSampleRate(language.sampleRate !== undefined ? String(language.sampleRate) : "48000");
        setModalMaxHoursPerContributor(language.maxHoursPerContributor !== undefined && language.maxHoursPerContributor !== -1 ? String(language.maxHoursPerContributor) : "");
        setModalMaxDailyCallLimit(language.maxDailyCallLimit !== undefined ? String(language.maxDailyCallLimit) : "5");
        setModalNoisy(!!language.noisy);
        setModalTestPhrase(language.testPhrase || "");
        setModalError("");
        setShowModal(true);
    }

    function closeModal() {
        setShowModal(false);
        setEditingLanguage(null);
        setModalName("");
        setModalHourlyPayout("");
        setModalSampleRate("48000");
        setModalMaxHoursPerContributor("");
        setModalMaxDailyCallLimit("5");
        setModalNoisy(false);
        setModalTestPhrase("");
        setModalError("");
    }

    async function saveLanguage(e) {
        e.preventDefault();
        const name = modalName.trim();
        if (!name) return setModalError("Language name is required.");
        const code = editingLanguage ? editingLanguage.code : toSlug(name);
        if (!editingLanguage && !code) return setModalError("Name must contain letters or numbers.");

        const hourlyPayout = Number(modalHourlyPayout);
        if (modalHourlyPayout === "" || isNaN(hourlyPayout) || hourlyPayout < 0) {
            return setModalError("Valid hourly payout is required.");
        }

        const sampleRate = Number(modalSampleRate);
        if (modalSampleRate === "" || isNaN(sampleRate) || sampleRate <= 0) {
            return setModalError("Valid sample rate is required.");
        }

        let maxHoursPerContributor = -1;
        if (modalMaxHoursPerContributor !== "") {
            maxHoursPerContributor = Number(modalMaxHoursPerContributor);
            if (isNaN(maxHoursPerContributor) || maxHoursPerContributor < 0) {
                return setModalError("Max hours must be a positive number or empty.");
            }
        }

        let maxDailyCallLimit = 5;
        if (modalMaxDailyCallLimit !== "") {
            maxDailyCallLimit = Number(modalMaxDailyCallLimit);
            if (isNaN(maxDailyCallLimit) || maxDailyCallLimit < 1) {
                return setModalError("Max daily calls must be at least 1.");
            }
        }

        setModalSaving(true);
        setModalError("");
        try {
            if (editingLanguage) {
                const data = await patch(`/api/admin/scripted-languages/${editingLanguage._id}`, {
                    name,
                    hourlyPayout,
                    sampleRate,
                    maxHoursPerContributor,
                    maxDailyCallLimit,
                    noisy: modalNoisy,
                    testPhrase: modalTestPhrase.trim(),
                });
                setLanguages(prev => prev.map(l => l._id === editingLanguage._id ? data.language : l));
                setSuccess(`Scripted Language "${name}" updated.`);
            } else {
                const data = await postJson("/api/admin/scripted-languages", {
                    name,
                    code,
                    hourlyPayout,
                    sampleRate,
                    maxHoursPerContributor,
                    maxDailyCallLimit,
                    noisy: modalNoisy,
                    testPhrase: modalTestPhrase.trim(),
                });
                setLanguages(prev => [...prev, data.language].sort((a, b) => a.name.localeCompare(b.name)));
                setSuccess(`Scripted Language "${name}" created and set as active.`);
            }
            setTimeout(() => setSuccess(""), 3000);
            closeModal();
        } catch (err) {
            setModalError(err.message);
        } finally {
            setModalSaving(false);
        }
    }

    async function fetchSummary(lang, modalType = "summary") {
        setSummaryModalLang(lang);
        setActiveModalType(modalType);
        setSummaryLoading(true);
        setSummaryData(null);
        setUsersSearch("");
        try {
            const data = await get(`/api/admin/scripted-languages/${lang._id}/contributors-summary`);
            setSummaryData(data);
        } catch (err) {
            Swal.fire('Error', err.message, 'error');
            setSummaryModalLang(null);
            setActiveModalType(null);
        } finally {
            setSummaryLoading(false);
        }
    }

    // Filter languages list (Active by default)
    const filteredLanguages = languages.filter(l => {
        if (showOnlyActive && !l.enabled) return false;
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            (l.name && l.name.toLowerCase().includes(q)) ||
            (l.code && l.code.toLowerCase().includes(q))
        );
    });

    const activeCount = languages.filter(l => l.enabled).length;

    return (
        <div className="min-h-screen bg-neutral-900 text-white flex">
            <AdminNav />
            <div className="flex-1 md:ml-64 p-6 md:p-8 min-w-0 max-w-7xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-neutral-800">
                    <div>
                        <div className="flex items-center gap-2.5 mb-1">
                            <div className="p-2 rounded-xl bg-gradient-to-r from-indigo-600 to-primary-600 text-white shadow-lg shadow-indigo-500/20">
                                <Radio className="w-5 h-5" />
                            </div>
                            <h1 className="text-2xl font-bold">Scripted Call Languages</h1>
                            <span className="text-xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                {activeCount} Active
                            </span>
                        </div>
                        <p className="text-sm text-neutral-400">
                            Configure active project languages, contributor payout rates, audio quality parameters, and daily quotas for Scripted Calls.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={openModal}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-bold text-sm shadow-lg shadow-primary-500/20 transition-all cursor-pointer"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Add Scripted Language</span>
                        </button>
                    </div>
                </div>

                {/* Status Banners */}
                {success && (
                    <div className="p-4 rounded-xl bg-emerald-900/30 border border-emerald-700/50 text-emerald-300 text-sm flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        <span>{success}</span>
                    </div>
                )}
                {error && (
                    <div className="p-4 rounded-xl bg-rose-900/30 border border-rose-700/50 text-rose-300 text-sm flex items-center gap-2">
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
                                placeholder="Search active scripted languages..."
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
                            className="p-2 rounded-xl bg-neutral-900/80 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700 transition-all"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Language Cards List */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24 text-neutral-500">
                        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-sm font-semibold">Loading Scripted Call Languages...</p>
                    </div>
                ) : filteredLanguages.length === 0 ? (
                    <div className="text-center py-20 border border-dashed border-neutral-800 rounded-2xl bg-neutral-900/40">
                        <Radio className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
                        <h3 className="text-base font-bold text-neutral-300">
                            {showOnlyActive ? "No Active Scripted Languages Found" : "No Languages Match Search"}
                        </h3>
                        <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto mb-4">
                            {showOnlyActive 
                                ? "Currently there are no active languages enabled for scripted calls. Click below to add a language."
                                : "Try clearing your search filter or add a new scripted language."
                            }
                        </p>
                        <button
                            onClick={openModal}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-bold text-xs"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add New Language</span>
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {filteredLanguages.map((lang) => (
                            <div
                                key={lang._id}
                                className={`p-5 rounded-2xl bg-neutral-800/50 border transition-all flex flex-col justify-between shadow-lg ${
                                    lang.enabled 
                                        ? "border-neutral-700/80 hover:border-primary-500/50 hover:shadow-primary-500/5" 
                                        : "border-neutral-800 opacity-60 bg-neutral-900/40"
                                }`}
                            >
                                <div>
                                    {/* Card Top */}
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-white text-lg">{lang.name}</h3>
                                                <span className="text-xs font-mono px-2 py-0.5 rounded bg-neutral-900 text-neutral-400 border border-neutral-700">
                                                    {lang.code}
                                                </span>
                                            </div>
                                            <span className="text-[11px] text-primary-400 font-semibold mt-0.5 block">
                                                Scripted Project Language
                                            </span>
                                        </div>

                                        <button
                                            onClick={() => toggleEnable(lang)}
                                            disabled={saving === lang._id}
                                            className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                                                lang.enabled 
                                                    ? "bg-emerald-900/60 text-emerald-300 border border-emerald-700/60 hover:bg-emerald-800" 
                                                    : "bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-white"
                                            }`}
                                        >
                                            <span className={`w-1.5 h-1.5 rounded-full ${lang.enabled ? 'bg-emerald-400' : 'bg-neutral-500'}`} />
                                            <span>{lang.enabled ? "Active" : "Disabled"}</span>
                                        </button>
                                    </div>

                                    {/* Metrics Grid */}
                                    <div className="grid grid-cols-2 gap-2 mt-4 p-3 bg-neutral-900/70 border border-neutral-800 rounded-xl text-xs">
                                        <div>
                                            <span className="text-neutral-500 block text-[10px] uppercase font-bold">Hourly Payout</span>
                                            <span className="font-bold text-emerald-400 text-sm font-mono">
                                                ${lang.hourlyPayout || 0} <span className="text-[10px] text-neutral-400 font-normal">/ hr</span>
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-neutral-500 block text-[10px] uppercase font-bold">Sample Rate</span>
                                            <span className="font-bold text-white text-xs font-mono">
                                                {lang.sampleRate ? `${lang.sampleRate / 1000} kHz` : "48 kHz"}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-neutral-500 block text-[10px] uppercase font-bold">Daily Call Limit</span>
                                            <span className="font-bold text-white text-xs font-mono">
                                                {lang.maxDailyCallLimit || 5} calls/day
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-neutral-500 block text-[10px] uppercase font-bold">Max Contrib. Limit</span>
                                            <span className="font-bold text-white text-xs font-mono">
                                                {lang.maxHoursPerContributor && lang.maxHoursPerContributor !== -1 ? `${lang.maxHoursPerContributor} hrs` : "Unlimited"}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions Footer */}
                                <div className="mt-5 pt-3 border-t border-neutral-700/60 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={() => fetchSummary(lang, "summary")}
                                            className="px-2.5 py-1.5 rounded-lg bg-neutral-700/60 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1"
                                        >
                                            <Activity className="w-3.5 h-3.5 text-primary-400" />
                                            <span>Stats</span>
                                        </button>
                                        <button
                                            onClick={() => fetchSummary(lang, "users")}
                                            className="px-2.5 py-1.5 rounded-lg bg-neutral-700/60 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1"
                                        >
                                            <Users className="w-3.5 h-3.5 text-indigo-400" />
                                            <span>Contributors</span>
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => openEditModal(lang)}
                                            className="p-1.5 rounded-lg hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
                                            title="Edit Language"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(lang)}
                                            className="p-1.5 rounded-lg hover:bg-rose-900/40 text-neutral-400 hover:text-rose-400 transition-colors"
                                            title="Delete Language"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Create / Edit Language Modal */}
                {showModal && (
                    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                        <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up">
                            <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Radio className="w-5 h-5 text-primary-400" />
                                    <h2 className="text-lg font-bold text-white">
                                        {editingLanguage ? `Edit Scripted Language (${editingLanguage.name})` : "Add Scripted Call Language"}
                                    </h2>
                                </div>
                                <button onClick={closeModal} className="text-neutral-400 hover:text-white p-1 rounded-lg">
                                    ✕
                                </button>
                            </div>

                            <form onSubmit={saveLanguage} className="p-6 space-y-4">
                                {modalError && (
                                    <div className="p-3 bg-rose-900/30 border border-rose-700/50 text-rose-300 text-xs rounded-xl flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                        <span>{modalError}</span>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5">
                                        Language Name
                                    </label>
                                    <input
                                        type="text"
                                        value={modalName}
                                        onChange={(e) => setModalName(e.target.value)}
                                        placeholder="e.g. Hindi, English (India), Marathi"
                                        required
                                        className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-sm text-white focus:outline-none focus:border-primary-500"
                                    />
                                    {!editingLanguage && modalName && (
                                        <p className="text-[11px] text-neutral-500 mt-1 font-mono">
                                            Code: <span className="text-primary-400">{toSlug(modalName)}</span>
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5 flex items-center justify-between">
                                        <span>Test Phrase (Applicant Reading Prompt)</span>
                                        <span className="text-[10px] text-neutral-500 font-normal">Required for Project Applications</span>
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={modalTestPhrase}
                                        onChange={(e) => setModalTestPhrase(e.target.value)}
                                        placeholder="Enter the sample text / sentence the applicant must record when applying for this scripted language..."
                                        className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-sm text-white focus:outline-none focus:border-primary-500 resize-none"
                                    />
                                    <p className="text-[11px] text-neutral-400 mt-1">
                                        When a contributor applies for this scripted call language, they will be presented with this test phrase to record.
                                    </p>
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
                                            placeholder="e.g. 5.50"
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

                                <div className="pt-4 border-t border-neutral-800 flex items-center justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={closeModal}
                                        className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-neutral-300"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={modalSaving}
                                        className="px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-bold text-xs shadow-lg disabled:opacity-50 flex items-center gap-1.5"
                                    >
                                        {modalSaving ? (
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <Check className="w-4 h-4" />
                                                <span>{editingLanguage ? "Save Changes" : "Create Active Language"}</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Summary / Contributors Modal */}
                {summaryModalLang && (
                    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                        <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
                            <div className="p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-800/40">
                                <div>
                                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                        <span>{summaryModalLang.name}</span>
                                        <span className="text-xs font-mono bg-neutral-800 px-2 py-0.5 rounded text-neutral-400">
                                            {activeModalType === "summary" ? "Language Demographics & Stats" : "Contributor Roster"}
                                        </span>
                                    </h2>
                                </div>
                                <button 
                                    onClick={() => { setSummaryModalLang(null); setActiveModalType(null); }} 
                                    className="p-1.5 text-neutral-400 hover:text-white rounded-lg"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto space-y-5">
                                {summaryLoading ? (
                                    <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
                                        <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin mb-3" />
                                        <p className="text-xs font-bold">Loading Language Metrics...</p>
                                    </div>
                                ) : summaryData ? (
                                    activeModalType === "summary" ? (
                                        <div className="space-y-4">
                                            {/* Summary Cards */}
                                            <div className="grid grid-cols-3 gap-3 text-center">
                                                <div className="p-4 bg-neutral-800/60 rounded-xl border border-neutral-700/60">
                                                    <span className="text-[10px] uppercase font-bold text-neutral-400 block">Total Contributors</span>
                                                    <span className="text-2xl font-bold text-white font-mono">{summaryData.totalContributors || 0}</span>
                                                </div>
                                                <div className="p-4 bg-neutral-800/60 rounded-xl border border-neutral-700/60">
                                                    <span className="text-[10px] uppercase font-bold text-emerald-400 block">Approved</span>
                                                    <span className="text-2xl font-bold text-emerald-400 font-mono">{summaryData.approvedUsers?.length || 0}</span>
                                                </div>
                                                <div className="p-4 bg-neutral-800/60 rounded-xl border border-neutral-700/60">
                                                    <span className="text-[10px] uppercase font-bold text-amber-400 block">Pending</span>
                                                    <span className="text-2xl font-bold text-amber-400 font-mono">{summaryData.pendingUsers?.length || 0}</span>
                                                </div>
                                            </div>

                                            {/* Demographics */}
                                            <div className="p-4 bg-neutral-800/40 rounded-xl border border-neutral-700/60 space-y-3">
                                                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300">Gender Distribution</h4>
                                                <div className="grid grid-cols-3 gap-2 text-xs">
                                                    <div className="p-2.5 bg-neutral-900 rounded-lg">
                                                        <span className="text-neutral-500 block">Male</span>
                                                        <strong className="text-white font-mono">{summaryData.male || 0}</strong>
                                                    </div>
                                                    <div className="p-2.5 bg-neutral-900 rounded-lg">
                                                        <span className="text-neutral-500 block">Female</span>
                                                        <strong className="text-white font-mono">{summaryData.female || 0}</strong>
                                                    </div>
                                                    <div className="p-2.5 bg-neutral-900 rounded-lg">
                                                        <span className="text-neutral-500 block">Other</span>
                                                        <strong className="text-white font-mono">{summaryData.otherGender || 0}</strong>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {/* Tabs */}
                                            <div className="flex bg-neutral-800 p-1 rounded-xl">
                                                <button
                                                    onClick={() => setUsersTab("approved")}
                                                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${usersTab === "approved" ? "bg-primary-600 text-white" : "text-neutral-400 hover:text-white"}`}
                                                >
                                                    Approved ({summaryData.approvedUsers?.length || 0})
                                                </button>
                                                <button
                                                    onClick={() => setUsersTab("pending")}
                                                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${usersTab === "pending" ? "bg-primary-600 text-white" : "text-neutral-400 hover:text-white"}`}
                                                >
                                                    Pending ({summaryData.pendingUsers?.length || 0})
                                                </button>
                                            </div>

                                            {/* Users List */}
                                            <div className="space-y-2 max-h-[350px] overflow-y-auto">
                                                {(usersTab === "approved" ? summaryData.approvedUsers : summaryData.pendingUsers)?.map(u => (
                                                    <div key={u.userId} className="p-3 bg-neutral-800/60 rounded-xl border border-neutral-700 flex items-center justify-between text-xs">
                                                        <div>
                                                            <div className="font-bold text-white">{u.firstname} {u.lastname}</div>
                                                            <div className="text-neutral-400 font-mono text-[11px]">{u.email}</div>
                                                        </div>
                                                        <span className="font-mono text-neutral-400 px-2 py-1 bg-neutral-900 rounded">
                                                            {u.speaker_id || `spk_${u.userId}`}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    <p className="text-xs text-neutral-500 text-center py-8">No metrics available.</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
