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
    ArrowRight,
    BarChart3,
    Globe,
    RotateCcw,
    CheckCircle,
    Loader2,
    Building2
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
    const [modalProjectName, setModalProjectName] = useState("");
    const [modalCompanyName, setModalCompanyName] = useState("");
    const [modalLanguage, setModalLanguage] = useState("");
    const [modalHourlyPayout, setModalHourlyPayout] = useState("");
    const [modalSampleRate, setModalSampleRate] = useState("48000");
    const [modalMaxHoursPerContributor, setModalMaxHoursPerContributor] = useState("");
    const [modalMaxDailyCallLimit, setModalMaxDailyCallLimit] = useState("5");
    const [modalNoisy, setModalNoisy] = useState(false);
    const [modalEnabled, setModalEnabled] = useState(true);
    const [modalEnableCallRoles, setModalEnableCallRoles] = useState(false);
    const [modalRole1, setModalRole1] = useState("Speaker 1");
    const [modalRole2, setModalRole2] = useState("Speaker 2");
    const [modalTestPhrase, setModalTestPhrase] = useState("");
    const [modalSaving, setModalSaving] = useState(false);
    const [modalError, setModalError] = useState("");

    // Main View Tab: "languages" | "summary"
    const [activeMainTab, setActiveMainTab] = useState("languages");
    const [summaryOverview, setSummaryOverview] = useState(null);
    const [summaryLanguages, setSummaryLanguages] = useState([]);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [selectedSummaryLangCode, setSelectedSummaryLangCode] = useState(null);
    const [summaryUserTab, setSummaryUserTab] = useState("approved"); // "approved" | "pending" | "rejected"
    const [summaryUserSearch, setSummaryUserSearch] = useState("");

    // Summary modal
    const [summaryModalLang, setSummaryModalLang] = useState(null);
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

    async function toggleGroupEnable(g) {
        const next = !g.enabled;
        const subprojectIds = (g.subprojects || []).map(s => s._id);
        if (subprojectIds.length === 0) return;

        setSaving(g.slug);
        try {
            await Promise.all(subprojectIds.map(id => patch(`/api/admin/scripted-languages/${id}`, { enabled: next })));
            setLanguages(prev => prev.map(l => {
                if (subprojectIds.includes(l._id)) {
                    return { ...l, enabled: next, ...(next ? {} : { isBoosted: false }) };
                }
                return l;
            }));
            setSuccess(`Scripted Language "${g.baseName}" is now ${next ? "active" : "disabled"} (${subprojectIds.length} subproject${subprojectIds.length !== 1 ? 's' : ''}).`);
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
            const data = await patch(`/api/admin/scripted-languages/${lang._id}`, { enabled: next });
            setLanguages(prev => prev.map(l => l._id === lang._id ? data.language || { ...l, enabled: next } : l));
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
        setModalProjectName("");
        setModalCompanyName("");
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
        setModalTestPhrase("");
        setModalError("");
        setShowModal(true);
    }

    function openEditModal(language) {
        setEditingLanguage(language);
        setModalProjectName(language.projectName || "");
        setModalCompanyName(language.companyName || "");
        setModalLanguage(language.language || language.name || "");
        setModalName(language.name || "");
        setModalHourlyPayout(language.hourlyPayout !== undefined ? String(language.hourlyPayout) : "");
        setModalSampleRate(language.sampleRate !== undefined ? String(language.sampleRate) : "48000");
        setModalMaxHoursPerContributor(language.maxHoursPerContributor !== undefined && language.maxHoursPerContributor !== -1 ? String(language.maxHoursPerContributor) : "");
        setModalMaxDailyCallLimit(language.maxDailyCallLimit !== undefined ? String(language.maxDailyCallLimit) : "5");
        setModalNoisy(!!language.noisy);
        setModalEnabled(language.enabled !== undefined ? !!language.enabled : true);
        setModalEnableCallRoles(!!language.enableCallRoles);
        setModalRole1(language.role1 || "Role 1");
        setModalRole2(language.role2 || "Role 2");
        setModalTestPhrase(language.testPhrase || "");
        setModalError("");
        setShowModal(true);
    }

    function closeModal() {
        setShowModal(false);
        setEditingLanguage(null);
        setModalProjectName("");
        setModalCompanyName("");
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
        setModalTestPhrase("");
        setModalError("");
    }

    async function saveLanguage(e) {
        e.preventDefault();
        const proj = modalProjectName.trim();
        const langStr = modalLanguage.trim();
        const rawName = modalName.trim();

        // If project name is entered, format as "Project Name (Language)"
        const name = proj ? `${proj} (${langStr || rawName || "General"})` : (langStr || rawName);
        if (!name) return setModalError("Language name is required.");

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

        const role1 = modalRole1.trim();
        const role2 = modalRole2.trim();
        if (modalEnableCallRoles) {
            if (!role1) return setModalError("Role 1 name is required when Call Roles are enabled.");
            if (!role2) return setModalError("Role 2 name is required when Call Roles are enabled.");
            if (role1.toLowerCase() === role2.toLowerCase()) {
                return setModalError("Role 1 and Role 2 must have distinct names.");
            }
        }

        const code = editingLanguage ? editingLanguage.code : toSlug(name);
        if (!editingLanguage && !code) return setModalError("Name must contain letters or numbers.");

        setModalSaving(true);
        setModalError("");
        try {
            const payload = {
                name,
                projectName: proj,
                companyName: modalCompanyName.trim(),
                language: langStr,
                hourlyPayout,
                sampleRate,
                maxHoursPerContributor,
                maxDailyCallLimit,
                noisy: modalNoisy,
                enabled: modalEnabled,
                enableCallRoles: modalEnableCallRoles,
                role1: modalEnableCallRoles ? role1 : "Role 1",
                role2: modalEnableCallRoles ? role2 : "Role 2",
                testPhrase: modalTestPhrase.trim(),
            };

            if (editingLanguage) {
                const data = await patch(`/api/admin/scripted-languages/${editingLanguage._id}`, payload);
                setLanguages(prev => prev.map(l => l._id === editingLanguage._id ? data.language : l));
                setSuccess(`Scripted Language "${name}" updated.`);
            } else {
                const data = await postJson("/api/admin/scripted-languages", {
                    ...payload,
                    code,
                });
                setLanguages(prev => [...prev, data.language].sort((a, b) => a.name.localeCompare(b.name)));
                setSuccess(`Scripted Language "${name}" created.`);
            }
            setTimeout(() => setSuccess(""), 3000);
            closeModal();
            await load();
        } catch (err) {
            setModalError(err.message);
        } finally {
            setModalSaving(false);
        }
    }

    async function loadFullSummary(preselectCode = null) {
        setSummaryLoading(true);
        try {
            const data = await get("/api/admin/scripted-languages/all/contributors-summary");
            setSummaryOverview(data.overview || null);
            const langs = data.languages || [];
            setSummaryLanguages(langs);
            if (langs.length > 0) {
                if (preselectCode) {
                    const match = langs.find(l => 
                        String(l.code).toLowerCase() === String(preselectCode).toLowerCase() ||
                        String(l.name).toLowerCase() === String(preselectCode).toLowerCase() ||
                        String(l._id) === String(preselectCode)
                    );
                    setSelectedSummaryLangCode(match ? match.code : langs[0].code);
                } else if (!selectedSummaryLangCode) {
                    setSelectedSummaryLangCode(langs[0].code);
                }
            }
        } catch (err) {
            Swal.fire({
                icon: "error",
                title: "Error Loading Summary",
                text: err.message,
                confirmButtonColor: "#ea580c"
            });
        } finally {
            setSummaryLoading(false);
        }
    }

    function switchToSummary(targetCode = null) {
        setActiveMainTab("summary");
        loadFullSummary(targetCode);
    }

    async function handleRemoveScriptedContributor(userObj, lang) {
        const langName = lang?.name || "this scripted language";
        const result = await Swal.fire({
            title: "Remove Contributor?",
            text: `Are you sure you want to remove ${userObj.firstname || userObj.username} from doing scripted calls for ${langName}? Doing so will change their application status to rejected and revoke their scripted call access.`,
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
                await postJson(`/api/admin/scripted-languages/${lang._id}/remove-contributor`, {
                    userId: userObj._id
                });
                Swal.fire({
                    title: "Removed!",
                    text: `${userObj.firstname || userObj.username} has been removed from ${langName}.`,
                    icon: "success",
                    background: "#1f2937",
                    color: "#fff"
                });
                loadFullSummary(selectedSummaryLangCode);
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

    async function handleResetScriptedContributor(userObj, lang) {
        const langName = lang?.name || "this scripted language";
        const result = await Swal.fire({
            title: "Reset Application?",
            text: `Are you sure you want to reset the scripted call application for ${userObj.firstname || userObj.username} for ${langName}? This will remove them from the rejected list and allow them to apply again.`,
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
                await postJson(`/api/admin/scripted-languages/${lang._id}/reset-contributor`, {
                    userId: userObj._id
                });
                Swal.fire({
                    title: "Reset!",
                    text: `Application for ${userObj.firstname || userObj.username} has been reset. They can now apply again.`,
                    icon: "success",
                    background: "#1f2937",
                    color: "#fff"
                });
                loadFullSummary(selectedSummaryLangCode);
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

    async function handleUpdateAudioConfig(userObj, configData, lang) {
        try {
            await postJson("/api/admin/contributors/update-audio-config", {
                userId: userObj._id,
                applicationType: "scripted_call",
                languageCode: lang.code,
                noiseGateDb: parseInt(configData.noiseGateDb) || 0,
                notch5kEnabled: configData.notch5kEnabled === true || configData.notch5kEnabled === "true",
                deHissMode: configData.deHissMode || "off",
                deEsserMode: configData.deEsserMode || "off"
            });
            const Toast = Swal.mixin({
                toast: true,
                position: "top-end",
                showConfirmButton: false,
                timer: 2500,
                timerProgressBar: true,
                background: "#1f2937",
                color: "#fff"
            });
            Toast.fire({
                icon: "success",
                title: `Audio configurations updated for ${userObj.firstname || userObj.username}`
            });
            loadFullSummary(selectedSummaryLangCode);
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

    async function openEditAudioConfigModal(userObj, lang) {
        const currentGate = userObj.noiseGateDb !== undefined ? userObj.noiseGateDb : 0;
        const currentNotch = userObj.notch5kEnabled !== undefined ? userObj.notch5kEnabled : false;
        const currentDeHiss = userObj.deHissMode || "off";
        const currentDeEsser = userObj.deEsserMode || "off";
        const langName = lang ? lang.name : "Scripted Calls";

        const { value: formValues } = await Swal.fire({
            title: "Edit Audio DSP Configurations",
            html: `
                <div class="text-left text-xs text-neutral-300 mb-4 space-y-1.5 bg-neutral-850 p-3.5 rounded-xl border border-neutral-700 shadow-inner">
                    <div class="flex justify-between items-center"><strong class="text-white text-sm">${userObj.firstname} ${userObj.lastname}</strong> <span class="font-mono text-warning-400 font-bold">${userObj.speaker_id}</span></div>
                    <div><strong class="text-neutral-400">Workload Scope:</strong> <span class="text-warning-400 font-semibold">Scripted Calls (${langName})</span></div>
                    <div class="text-neutral-400 text-[11px] pt-1.5 border-t border-neutral-700/60 mt-1.5">
                        Settings apply automatically to this contributor in real-time when recording for this scripted call workload.
                    </div>
                </div>

                <div class="space-y-3.5 text-left text-xs">
                    <div>
                        <label class="block font-bold text-neutral-300 uppercase tracking-wider mb-1 flex items-center justify-between">
                            <span>1. Noise Gate (dB)</span>
                            <span class="text-[10px] font-normal text-neutral-400">Attenuates silence pauses</span>
                        </label>
                        <select id="swal-noise-gate" class="w-full bg-neutral-800 border border-neutral-600 rounded-lg p-2.5 text-white font-semibold focus:ring-2 focus:ring-warning-500">
                            <option value="0" ${currentGate === 0 ? "selected" : ""}>0 dB (RAW / Disabled)</option>
                            <option value="-6" ${currentGate === -6 ? "selected" : ""}>-6 dB (Light Attenuation)</option>
                            <option value="-10" ${currentGate === -10 ? "selected" : ""}>-10 dB (Medium Attenuation)</option>
                            <option value="-12" ${currentGate === -12 ? "selected" : ""}>-12 dB (Standard Attenuation)</option>
                            <option value="-15" ${currentGate === -15 ? "selected" : ""}>-15 dB (Heavy Attenuation)</option>
                            <option value="-18" ${currentGate === -18 ? "selected" : ""}>-18 dB (Maximum Attenuation)</option>
                        </select>
                    </div>

                    <div>
                        <label class="block font-bold text-neutral-300 uppercase tracking-wider mb-1 flex items-center justify-between">
                            <span>2. 5 kHz Static Whine Filter</span>
                            <span class="text-[10px] font-normal text-neutral-400">Removes USB 5kHz static line</span>
                        </label>
                        <select id="swal-notch5k" class="w-full bg-neutral-800 border border-neutral-600 rounded-lg p-2.5 text-white font-semibold focus:ring-2 focus:ring-warning-500">
                            <option value="true" ${currentNotch ? "selected" : ""}>Enabled (Active Notch at 5000 Hz)</option>
                            <option value="false" ${!currentNotch ? "selected" : ""}>Disabled (Off / Bypassed)</option>
                        </select>
                    </div>

                    <div>
                        <label class="block font-bold text-neutral-300 uppercase tracking-wider mb-1 flex items-center justify-between">
                            <span>3. De-Hiss Filter (Air & Hiss)</span>
                            <span class="text-[10px] font-normal text-neutral-400">High-shelf pre-amp noise cut</span>
                        </label>
                        <select id="swal-dehiss" class="w-full bg-neutral-800 border border-neutral-600 rounded-lg p-2.5 text-white font-semibold focus:ring-2 focus:ring-warning-500">
                            <option value="off" ${currentDeHiss === "off" ? "selected" : ""}>Off (Full Spectrum)</option>
                            <option value="14k" ${currentDeHiss === "14k" ? "selected" : ""}>14 kHz Cut (Gentle High-Shelf)</option>
                            <option value="12k" ${currentDeHiss === "12k" ? "selected" : ""}>12 kHz Cut (Standard De-Hiss)</option>
                            <option value="10k" ${currentDeHiss === "10k" ? "selected" : ""}>10 kHz Cut (Aggressive De-Hiss)</option>
                            <option value="8k" ${currentDeHiss === "8k" ? "selected" : ""}>8 kHz Cut (Maximum De-Hiss)</option>
                        </select>
                    </div>

                    <div>
                        <label class="block font-bold text-neutral-300 uppercase tracking-wider mb-1 flex items-center justify-between">
                            <span>4. De-Esser Filter (Sibilance Control)</span>
                            <span class="text-[10px] font-normal text-neutral-400">Reduces harsh 's' and 'sh' sounds</span>
                        </label>
                        <select id="swal-deesser" class="w-full bg-neutral-800 border border-neutral-600 rounded-lg p-2.5 text-white font-semibold focus:ring-2 focus:ring-warning-500">
                            <option value="off" ${currentDeEsser === "off" ? "selected" : ""}>Off (No De-Essing)</option>
                            <option value="light" ${currentDeEsser === "light" ? "selected" : ""}>Light (-3 dB attenuation)</option>
                            <option value="medium" ${currentDeEsser === "medium" ? "selected" : ""}>Medium (-6 dB attenuation)</option>
                            <option value="strong" ${currentDeEsser === "strong" ? "selected" : ""}>Strong (-9 dB attenuation)</option>
                        </select>
                    </div>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: "Save Audio Configs",
            cancelButtonText: "Cancel",
            confirmButtonColor: "#f59e0b",
            cancelButtonColor: "#475569",
            background: "#171717",
            color: "#ffffff",
            preConfirm: () => {
                const noiseGateDb = document.getElementById("swal-noise-gate").value;
                const notch5kEnabled = document.getElementById("swal-notch5k").value;
                const deHissMode = document.getElementById("swal-dehiss").value;
                const deEsserMode = document.getElementById("swal-deesser").value;
                return { noiseGateDb, notch5kEnabled, deHissMode, deEsserMode };
            }
        });

        if (formValues) {
            handleUpdateAudioConfig(userObj, formValues, lang);
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

    // Group all scripted languages by base language name
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
                            <div className="p-2 rounded-xl bg-primary-950/80 text-primary-400 border border-primary-800/60 shadow-inner">
                                <Radio className="w-5 h-5" />
                            </div>
                            <h1 className="text-2xl md:text-3xl font-extrabold">Scripted Call Languages</h1>
                            <span className="text-xs font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                {activeLanguagesCount} Active Languages
                            </span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700">
                                {totalSubprojects} Total Subprojects
                            </span>
                        </div>
                        <p className="text-sm text-neutral-400">
                            Click any language to manage its scripted call subprojects, custom speaker roles, prompts, and hourly payouts.
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

                {/* View Mode Toggle: Configurations vs Summary */}
                <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
                    <button
                        onClick={() => setActiveMainTab("languages")}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                            activeMainTab === "languages"
                                ? "bg-primary-600 text-white shadow-lg shadow-primary-500/20"
                                : "bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800 border border-neutral-800"
                        }`}
                    >
                        <FolderKanban className="w-4 h-4" />
                        <span>🗂️ Language Configurations</span>
                    </button>
                    <button
                        onClick={() => switchToSummary()}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                            activeMainTab === "summary"
                                ? "bg-warning-500 text-neutral-950 shadow-lg shadow-warning-500/20 font-extrabold"
                                : "bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800 border border-neutral-800"
                        }`}
                    >
                        <BarChart3 className="w-4 h-4" />
                        <span>📊 Contributors & Demographics Summary</span>
                        {summaryOverview && (
                            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-neutral-950 text-warning-400 border border-neutral-800 ml-1">
                                {summaryOverview.totalContributors || 0} Contributors
                            </span>
                        )}
                    </button>
                </div>

                {activeMainTab === "languages" && (
                    <div className="space-y-6">
                        {/* Filters & Active Language Controls */}
                        <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/5 rounded-full blur-3xl pointer-events-none" />
                            <div className="flex items-center gap-3 flex-1 min-w-[280px] max-w-md relative z-10">
                                <div className="relative w-full">
                                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                                    <input
                                        type="text"
                                        placeholder="Search active scripted languages or subprojects..."
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
                                <p className="text-sm font-semibold">Loading Scripted Call Languages...</p>
                            </div>
                        ) : filteredBaseLanguages.length === 0 ? (
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
                                        className={`relative overflow-hidden rounded-3xl p-6 border transition-all duration-300 flex flex-col justify-between shadow-xl group ${
                                            g.enabled 
                                                ? "border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 hover:border-neutral-700 hover:shadow-2xl" 
                                                : "border-neutral-800/80 bg-neutral-900/40 opacity-70 hover:opacity-100"
                                        }`}
                                    >
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-primary-500/15 transition-all" />
                                        <div className="relative z-10">
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
                                                            <span>{g.subprojects.length} Scripted Subproject{g.subprojects.length !== 1 ? 's' : ''} ({g.activeCount} Active)</span>
                                                        </span>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => toggleGroupEnable(g)}
                                                    disabled={saving === g.slug}
                                                    title={`Click to ${g.enabled ? 'disable' : 'activate'} all scripted subprojects for ${g.baseName}`}
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
                                                to={`/admin/scripted-languages/${g.slug}/subprojects`}
                                                className="w-full py-2.5 px-4 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                                            >
                                                <FolderKanban className="w-4 h-4" />
                                                <span>Manage Subprojects ({g.subprojects.length})</span>
                                                <ArrowRight className="w-3.5 h-3.5" />
                                            </Link>

                                            <div className="flex items-center justify-between gap-2 pt-1">
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        onClick={() => switchToSummary(g.slug || g.code || g.baseName)}
                                                        className="px-2.5 py-1 rounded-lg bg-neutral-700/60 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                                        title="View language collection statistics and demographics"
                                                    >
                                                        <Activity className="w-3.5 h-3.5 text-primary-400" />
                                                        <span>Stats</span>
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            switchToSummary(g.slug || g.code || g.baseName);
                                                            setSummaryUserTab("approved");
                                                        }}
                                                        className="px-2.5 py-1 rounded-lg bg-neutral-700/60 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                                        title="View, remove, and manage contributors for this language"
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
                )}

                {/* CONTRIBUTORS & DEMOGRAPHICS SUMMARY VIEW */}
                {activeMainTab === "summary" && (
                    <div className="space-y-8 animate-fade-in">
                        {/* Whole Scripted Calls Collection Overview */}
                        {summaryOverview && (
                            <div className="bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 border border-neutral-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-80 h-80 bg-warning-500/5 rounded-full blur-3xl pointer-events-none" />
                                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2 relative z-10">
                                    <Building2 className="w-5 h-5 text-warning-400" />
                                    Whole Scripted Calls Collection Overview (All Languages)
                                </h2>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 relative z-10">
                                    <div className="bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-850 border border-neutral-800 p-4 rounded-2xl shadow-sm">
                                        <span className="text-[11px] text-neutral-400 font-medium block">Total Collection Duration</span>
                                        <span className="text-lg font-bold text-white mt-1 block">{formatSecs(summaryOverview.totalSeconds)}</span>
                                        <span className="text-[11px] text-neutral-400 font-normal mt-0.5 block">{summaryOverview.totalCount || 0} total calls / phrases</span>
                                    </div>
                                    <div className="bg-gradient-to-br from-emerald-950/40 via-neutral-950 to-neutral-900 border border-emerald-500/30 p-4 rounded-2xl shadow-sm">
                                        <span className="text-[11px] text-emerald-300 font-medium block">Approved Duration</span>
                                        <span className="text-lg font-bold text-emerald-400 mt-1 block">{formatSecs(summaryOverview.totalApprovedSeconds)}</span>
                                        <span className="text-[11px] text-emerald-500/80 font-normal mt-0.5 block">{summaryOverview.approvedCount || 0} approved</span>
                                    </div>
                                    <div className="bg-gradient-to-br from-rose-950/40 via-neutral-950 to-neutral-900 border border-rose-500/30 p-4 rounded-2xl shadow-sm">
                                        <span className="text-[11px] text-rose-300 font-medium block">Rejected Duration</span>
                                        <span className="text-lg font-bold text-rose-400 mt-1 block">{formatSecs(summaryOverview.totalRejectedSeconds)}</span>
                                        <span className="text-[11px] text-rose-500/80 font-normal mt-0.5 block">{summaryOverview.rejectedCount || 0} rejected</span>
                                    </div>
                                    <div className="bg-gradient-to-br from-amber-950/40 via-neutral-950 to-neutral-900 border border-amber-500/30 p-4 rounded-2xl shadow-sm">
                                        <span className="text-[11px] text-amber-300 font-medium block">Pending Duration</span>
                                        <span className="text-lg font-bold text-amber-400 mt-1 block">{formatSecs(summaryOverview.totalPendingSeconds)}</span>
                                        <span className="text-[11px] text-amber-500/80 font-semibold mt-0.5 block">{summaryOverview.pendingCount || 0} pending</span>
                                    </div>
                                    <div className="bg-gradient-to-br from-emerald-950/30 via-neutral-950 to-neutral-900 border border-emerald-500/30 p-4 rounded-2xl shadow-sm">
                                        <span className="text-[11px] text-emerald-300 font-medium block">Approval Rate</span>
                                        <span className="text-lg font-bold text-emerald-300 mt-1 block">{summaryOverview.approvalRate ?? 0}%</span>
                                        <span className="text-[11px] text-neutral-400 font-normal mt-0.5 block">Evaluated calls</span>
                                    </div>
                                    <div className="bg-gradient-to-br from-rose-950/30 via-neutral-950 to-neutral-900 border border-rose-500/30 p-4 rounded-2xl shadow-sm">
                                        <span className="text-[11px] text-rose-300 font-medium block">Rejection Rate</span>
                                        <span className="text-lg font-bold text-rose-300 mt-1 block">{summaryOverview.rejectionRate ?? 0}%</span>
                                        <span className="text-[11px] text-neutral-400 font-normal mt-0.5 block">Evaluated calls</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {summaryLoading ? (
                            <div className="bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 border border-neutral-800 rounded-3xl text-center py-20 shadow-xl">
                                <Loader2 className="w-8 h-8 animate-spin text-warning-500 mx-auto mb-3" />
                                <p className="text-neutral-400">Loading scripted calls contributor summary data...</p>
                            </div>
                        ) : summaryLanguages.length === 0 ? (
                            <div className="bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 border border-neutral-800 rounded-3xl text-center py-20 shadow-xl">
                                <Users className="w-12 h-12 text-neutral-500 mx-auto mb-4" />
                                <h3 className="text-xl font-semibold mb-2 text-white">No Scripted Languages Found</h3>
                                <p className="text-neutral-400 mb-6">
                                    No scripted call recordings or contributor applications found yet.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                {/* Scripted Languages Cards */}
                                <div>
                                    <h2 className="text-lg font-semibold flex items-center gap-2 text-white mb-4">
                                        <Globe className="w-5 h-5 text-warning-500" />
                                        Scripted Languages ({summaryLanguages.length})
                                    </h2>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {summaryLanguages.map((lang) => {
                                            const isSelected = selectedSummaryLangCode === lang.code;
                                            return (
                                                <div
                                                    key={lang.code}
                                                    onClick={() => {
                                                        setSelectedSummaryLangCode(lang.code);
                                                        setSummaryUserTab("approved");
                                                        setSummaryUserSearch("");
                                                    }}
                                                    className={`border transition-all cursor-pointer p-5 rounded-3xl shadow-xl flex flex-col justify-between relative overflow-hidden ${
                                                        isSelected 
                                                            ? "bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 border-warning-500 ring-2 ring-warning-500/30 shadow-warning-500/10" 
                                                            : "bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 border-neutral-800 hover:border-neutral-700"
                                                    }`}
                                                >
                                                    <div className="relative z-10">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-900 text-warning-400 flex items-center justify-center font-bold text-sm border border-neutral-700 shadow-inner">
                                                                {lang.code.substring(0, 2).toUpperCase()}
                                                            </div>
                                                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-neutral-950 border border-neutral-800 text-neutral-300 flex items-center gap-1">
                                                                <Users className="w-3.5 h-3.5 text-warning-400" />
                                                                {lang.summary?.totalContributors || 0} Contributors
                                                            </span>
                                                        </div>

                                                        <h3 className="text-lg font-bold text-white">
                                                            {lang.name}
                                                        </h3>
                                                        <p className="text-xs text-neutral-400 mt-0.5">
                                                            {lang.phraseCount || 0} Recorded Calls • <span className="text-emerald-400 font-medium">{formatSecs(lang.approvedSeconds)} Appr.</span>
                                                        </p>

                                                        <div className="flex flex-wrap gap-1.5 mt-3 text-[11px]">
                                                            <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-900/50 font-medium">
                                                                ✓ {lang.approvalRate}% Appr.
                                                            </span>
                                                            <span className="px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-900/50 font-medium">
                                                                ✕ {lang.rejectionRate}% Rej.
                                                            </span>
                                                            <span className="px-2 py-0.5 rounded bg-neutral-950 text-neutral-300 border border-neutral-800 font-medium">
                                                                {lang.pendingCount} Pending
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="mt-4 pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400 relative z-10">
                                                        <span>Click to view demographics</span>
                                                        <span className="text-warning-400 font-bold">{isSelected ? "Viewing ↓" : "View →"}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Selected Language Demographics & Contributor Detail */}
                                {(() => {
                                    const selectedLangData = summaryLanguages.find(l => l.code === selectedSummaryLangCode) || summaryLanguages[0] || null;
                                    if (!selectedLangData) return null;

                                    return (
                                        <div className="bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 border border-neutral-800 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-96 h-96 bg-warning-500/5 rounded-full blur-3xl pointer-events-none" />
                                            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-4 relative z-10">
                                                <div>
                                                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                                        <BarChart3 className="w-6 h-6 text-warning-500" />
                                                        Demographics & Contributor Summary
                                                        <span className="text-warning-400 font-semibold">— {selectedLangData.name}</span>
                                                    </h2>
                                                    <p className="text-xs text-neutral-400 mt-1">
                                                        Showing detailed age, gender, and contributor user lists for {selectedLangData.name} in Scripted Calls.
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Demographics & Duration Overview Cards */}
                                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 relative z-10">
                                                <div className="bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-850 border border-neutral-800 p-3.5 rounded-2xl shadow-sm">
                                                    <span className="text-[11px] text-neutral-400 font-medium block">Total Language Collection</span>
                                                    <div className="text-base font-bold text-white mt-1">{formatSecs(selectedLangData.summary?.totalSeconds || selectedLangData.totalSeconds)}</div>
                                                    <span className="text-[10px] text-neutral-400 font-normal block mt-0.5">{selectedLangData.phraseCount || 0} calls</span>
                                                </div>
                                                <div className="bg-gradient-to-br from-emerald-950/40 via-neutral-950 to-neutral-900 border border-emerald-500/30 p-3.5 rounded-2xl shadow-sm">
                                                    <span className="text-[11px] text-emerald-300 font-medium block">Approved Duration</span>
                                                    <div className="text-base font-bold text-emerald-400 mt-1">{formatSecs(selectedLangData.summary?.approvedSeconds || selectedLangData.approvedSeconds)}</div>
                                                    <span className="text-[10px] text-emerald-500/80 font-normal block mt-0.5">{selectedLangData.summary?.approvedCount ?? selectedLangData.approvedCount ?? 0} calls</span>
                                                </div>
                                                <div className="bg-gradient-to-br from-rose-950/40 via-neutral-950 to-neutral-900 border border-rose-500/30 p-3.5 rounded-2xl shadow-sm">
                                                    <span className="text-[11px] text-rose-300 font-medium block">Rejected Duration</span>
                                                    <div className="text-base font-bold text-red-400 mt-1">{formatSecs(selectedLangData.summary?.rejectedSeconds || selectedLangData.rejectedSeconds)}</div>
                                                    <span className="text-[10px] text-red-500/80 font-normal block mt-0.5">{selectedLangData.summary?.rejectedCount ?? selectedLangData.rejectedCount ?? 0} calls</span>
                                                </div>
                                                <div className="bg-gradient-to-br from-amber-950/40 via-neutral-950 to-neutral-900 border border-amber-500/30 p-3.5 rounded-2xl shadow-sm">
                                                    <span className="text-[11px] text-amber-300 font-medium block">Pending Duration</span>
                                                    <div className="text-base font-bold text-amber-400 mt-1">{formatSecs(selectedLangData.summary?.pendingSeconds || selectedLangData.pendingSeconds)}</div>
                                                    <span className="text-[10px] text-amber-500/80 font-semibold block mt-0.5">{selectedLangData.summary?.pendingCount ?? selectedLangData.pendingCount ?? 0} pending calls</span>
                                                </div>
                                                <div className="bg-gradient-to-br from-emerald-950/30 via-neutral-950 to-neutral-900 border border-emerald-500/30 p-4 rounded-2xl shadow-sm">
                                                    <span className="text-[11px] text-emerald-300 font-medium block">Approval Rate</span>
                                                    <div className="text-base font-bold text-emerald-300 mt-1">{selectedLangData.approvalRate ?? selectedLangData.summary?.approvalRate ?? 0}%</div>
                                                    <span className="text-[10px] text-neutral-400 font-normal block mt-0.5">Evaluated</span>
                                                </div>
                                                <div className="bg-gradient-to-br from-rose-950/30 via-neutral-950 to-neutral-900 border border-rose-500/30 p-4 rounded-2xl shadow-sm">
                                                    <span className="text-[11px] text-rose-300 font-medium block">Rejection Rate</span>
                                                    <div className="text-base font-bold text-red-300 mt-1">{selectedLangData.rejectionRate ?? selectedLangData.summary?.rejectionRate ?? 0}%</div>
                                                    <span className="text-[10px] text-neutral-400 font-normal block mt-0.5">Evaluated</span>
                                                </div>
                                            </div>

                                            {/* Gender & Age Breakdown */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                                                {/* Gender Breakdown */}
                                                <div className="bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-850 border border-neutral-800 p-5 rounded-2xl shadow-sm">
                                                    <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-wider mb-4">Gender Breakdown</h3>
                                                    <div className="space-y-3">
                                                        <div>
                                                            <div className="flex justify-between text-xs mb-1">
                                                                <span className="text-neutral-300 font-medium">Male</span>
                                                                <span className="text-blue-400 font-semibold">
                                                                    {selectedLangData.summary?.male || 0} ({selectedLangData.summary?.totalContributors > 0 ? Math.round(((selectedLangData.summary?.male || 0) / selectedLangData.summary.totalContributors) * 100) : 0}%)
                                                                </span>
                                                            </div>
                                                            <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                                <div className="bg-blue-500 h-full rounded-full" style={{ width: `${selectedLangData.summary?.totalContributors > 0 ? ((selectedLangData.summary?.male || 0) / selectedLangData.summary.totalContributors) * 100 : 0}%` }} />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="flex justify-between text-xs mb-1">
                                                                <span className="text-neutral-300 font-medium">Female</span>
                                                                <span className="text-pink-400 font-semibold">
                                                                    {selectedLangData.summary?.female || 0} ({selectedLangData.summary?.totalContributors > 0 ? Math.round(((selectedLangData.summary?.female || 0) / selectedLangData.summary.totalContributors) * 100) : 0}%)
                                                                </span>
                                                            </div>
                                                            <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                                <div className="bg-pink-500 h-full rounded-full" style={{ width: `${selectedLangData.summary?.totalContributors > 0 ? ((selectedLangData.summary?.female || 0) / selectedLangData.summary.totalContributors) * 100 : 0}%` }} />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="flex justify-between text-xs mb-1">
                                                                <span className="text-neutral-300 font-medium">Other / Unspecified</span>
                                                                <span className="text-neutral-400 font-semibold">{selectedLangData.summary?.otherGender || 0}</span>
                                                            </div>
                                                            <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                                <div className="bg-neutral-500 h-full rounded-full" style={{ width: `${selectedLangData.summary?.totalContributors > 0 ? ((selectedLangData.summary?.otherGender || 0) / selectedLangData.summary.totalContributors) * 100 : 0}%` }} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Age Distribution */}
                                                <div className="bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-850 border border-neutral-800 p-5 rounded-2xl shadow-sm">
                                                    <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-wider mb-4">Age Distribution</h3>
                                                    <div className="space-y-3">
                                                        <div>
                                                            <div className="flex justify-between text-xs mb-1">
                                                                <span className="text-neutral-300 font-medium">18 – 30 Years</span>
                                                                <span className="text-warning-400 font-semibold">{selectedLangData.summary?.age_18_30 || 0} contributors</span>
                                                            </div>
                                                            <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                                <div className="bg-warning-500 h-full rounded-full" style={{ width: `${selectedLangData.summary?.totalContributors > 0 ? ((selectedLangData.summary?.age_18_30 || 0) / selectedLangData.summary.totalContributors) * 100 : 0}%` }} />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="flex justify-between text-xs mb-1">
                                                                <span className="text-neutral-300 font-medium">30 – 45 Years</span>
                                                                <span className="text-warning-400 font-semibold">{selectedLangData.summary?.age_30_45 || 0} contributors</span>
                                                            </div>
                                                            <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                                <div className="bg-amber-500 h-full rounded-full" style={{ width: `${selectedLangData.summary?.totalContributors > 0 ? ((selectedLangData.summary?.age_30_45 || 0) / selectedLangData.summary.totalContributors) * 100 : 0}%` }} />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="flex justify-between text-xs mb-1">
                                                                <span className="text-neutral-300 font-medium">45 – 60 Years</span>
                                                                <span className="text-warning-400 font-semibold">{selectedLangData.summary?.age_45_60 || 0} contributors</span>
                                                            </div>
                                                            <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                                <div className="bg-orange-500 h-full rounded-full" style={{ width: `${selectedLangData.summary?.totalContributors > 0 ? ((selectedLangData.summary?.age_45_60 || 0) / selectedLangData.summary.totalContributors) * 100 : 0}%` }} />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="flex justify-between text-xs mb-1">
                                                                <span className="text-neutral-300 font-medium">60+ Years</span>
                                                                <span className="text-warning-400 font-semibold">{selectedLangData.summary?.age_60_plus || 0} contributors</span>
                                                            </div>
                                                            <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                                                                <div className="bg-red-500 h-full rounded-full" style={{ width: `${selectedLangData.summary?.totalContributors > 0 ? ((selectedLangData.summary?.age_60_plus || 0) / selectedLangData.summary.totalContributors) * 100 : 0}%` }} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Contributors User Lists Tab */}
                                            <div className="pt-4 border-t border-neutral-700">
                                                <div className="flex items-center justify-between border-b border-neutral-700 pb-3 mb-4 gap-4 flex-wrap">
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => setSummaryUserTab("approved")}
                                                            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                                                                summaryUserTab === "approved" ? "bg-emerald-600 text-white" : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
                                                            }`}
                                                        >
                                                            <CheckCircle className="w-3.5 h-3.5" />
                                                            Approved Contributors ({selectedLangData.summary?.approvedUsers?.length || 0})
                                                        </button>
                                                        <button
                                                            onClick={() => setSummaryUserTab("pending")}
                                                            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                                                                summaryUserTab === "pending" ? "bg-amber-600 text-white" : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
                                                            }`}
                                                        >
                                                            <Clock className="w-3.5 h-3.5" />
                                                            Pending Contributors ({selectedLangData.summary?.pendingUsers?.length || 0})
                                                        </button>
                                                        <button
                                                            onClick={() => setSummaryUserTab("rejected")}
                                                            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                                                                summaryUserTab === "rejected" ? "bg-red-600 text-white" : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
                                                            }`}
                                                        >
                                                            <XCircle className="w-3.5 h-3.5" />
                                                            Rejected Contributors ({selectedLangData.summary?.rejectedUsers?.length || 0})
                                                        </button>
                                                    </div>

                                                    <div className="relative min-w-[240px]">
                                                        <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                                        <input
                                                            type="text"
                                                            placeholder="Search by name, email, speaker_id..."
                                                            value={summaryUserSearch}
                                                            onChange={e => setSummaryUserSearch(e.target.value)}
                                                            className="bg-neutral-700 border border-neutral-600 text-white placeholder-neutral-400 text-xs rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-warning-500 w-full"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Table */}
                                                {(() => {
                                                    const list = summaryUserTab === "approved" 
                                                        ? (selectedLangData.summary?.approvedUsers || [])
                                                        : summaryUserTab === "pending" 
                                                        ? (selectedLangData.summary?.pendingUsers || [])
                                                        : (selectedLangData.summary?.rejectedUsers || []);
                                                    const filtered = list.filter(u => {
                                                        if (!summaryUserSearch.trim()) return true;
                                                        const q = summaryUserSearch.toLowerCase();
                                                        return (
                                                            (u.firstname + " " + u.lastname).toLowerCase().includes(q) ||
                                                            (u.username || "").toLowerCase().includes(q) ||
                                                            (u.email || "").toLowerCase().includes(q) ||
                                                            (u.speaker_id || "").toLowerCase().includes(q) ||
                                                            (u.client_spk_id || "").toLowerCase().includes(q) ||
                                                            (u.state || "").toLowerCase().includes(q) ||
                                                            (u.vendorCode || u.vendorId?.vendorCode || "").toLowerCase().includes(q)
                                                        );
                                                    });

                                                    if (filtered.length === 0) {
                                                        return (
                                                            <div className="text-center py-12 text-neutral-400 text-sm">
                                                                No {summaryUserTab} contributors found for {selectedLangData.name}.
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <div className="border border-neutral-800 rounded-3xl overflow-hidden bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-850 shadow-2xl">
                                                            <div className="overflow-x-auto">
                                                                <table className="w-full text-xs">
                                                                    <thead className="bg-gradient-to-r from-neutral-800 to-neutral-850 text-neutral-300 uppercase tracking-wider font-semibold border-b border-neutral-800">
                                                                        <tr>
                                                                            <th className="px-4 py-2.5 text-left">Speaker ID</th>
                                                                            <th className="px-4 py-2.5 text-left">Contributor</th>
                                                                            <th className="px-4 py-2.5 text-left">Approved Dur.</th>
                                                                            <th className="px-4 py-2.5 text-left">Total Dur.</th>
                                                                            <th className="px-4 py-2.5 text-left">Rejected Dur.</th>
                                                                            <th className="px-4 py-2.5 text-left">Pending Dur.</th>
                                                                            <th className="px-4 py-2.5 text-left">Appr. / Rej. %</th>
                                                                            <th className="px-4 py-2.5 text-left">Status</th>
                                                                            <th className="px-4 py-2.5 text-left">Audio DSP Configs</th>
                                                                            <th className="px-4 py-2.5 text-right">Actions</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-neutral-700/80">
                                                                        {filtered.map(u => (
                                                                            <tr key={u._id} className="hover:bg-neutral-700/40">
                                                                                <td className="px-4 py-2.5">
                                                                                    <div className="font-mono text-warning-400 font-semibold">{u.speaker_id}</div>
                                                                                    {u.client_spk_id ? (
                                                                                        <div className="text-[10px] text-emerald-400 font-medium mt-0.5 flex items-center gap-1">
                                                                                            <span className="text-neutral-400">Client ID:</span>
                                                                                            <span className="font-mono font-bold bg-emerald-950/80 px-1 py-0.5 rounded border border-emerald-800/60">{u.client_spk_id}</span>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div className="text-[10px] text-neutral-500 italic mt-0.5">No Client ID</div>
                                                                                    )}
                                                                                </td>
                                                                                <td className="px-4 py-2.5 font-medium text-white">
                                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                                        <span>{u.firstname} {u.lastname}</span>
                                                                                        {(u.vendorCode || u.vendorId?.vendorCode) && (
                                                                                            <span
                                                                                                className="inline-flex items-center justify-center font-mono font-bold text-[10px] uppercase px-2 py-0.5 rounded-lg bg-neutral-900 border border-purple-500/50 text-purple-300 shadow-sm"
                                                                                                title={`Vendor Code: ${u.vendorCode || u.vendorId?.vendorCode}`}
                                                                                            >
                                                                                                🏢 {u.vendorCode || u.vendorId?.vendorCode}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="text-[10px] text-neutral-400 font-normal">@{u.username}</div>
                                                                                </td>
                                                                                <td className="px-4 py-2.5 text-emerald-400 font-semibold">{formatSecs(u.approvedSeconds)} <span className="text-[10px] text-emerald-500/80 font-normal">({u.approvedCount || 0})</span></td>
                                                                                <td className="px-4 py-2.5 text-white font-medium">{formatSecs(u.totalSeconds)}</td>
                                                                                <td className="px-4 py-2.5 text-red-400 font-medium">{formatSecs(u.rejectedSeconds)} <span className="text-[10px] text-red-500/80 font-normal">({u.rejectedCount || 0})</span></td>
                                                                                <td className="px-4 py-2.5 text-amber-400 font-medium">{formatSecs(u.pendingSeconds)} <span className="text-[10px] font-semibold text-amber-300">({u.pendingCount || 0} pending)</span></td>
                                                                                <td className="px-4 py-2.5 font-medium font-mono text-xs">
                                                                                    <span className="text-emerald-400">{Number(u.approvalRate || 0).toFixed(1)}%</span> / <span className="text-red-400">{Number(u.rejectionRate || 0).toFixed(1)}%</span>
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
                                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                                        <span className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded border ${
                                                                                            (u.noiseGateDb || 0) === 0 
                                                                                                ? "bg-neutral-800 text-neutral-400 border-neutral-700" 
                                                                                                : "bg-warning-950/80 text-warning-400 border-warning-700/60"
                                                                                        }`} title="Noise Gate">
                                                                                            Gate: {(u.noiseGateDb || 0) === 0 ? "RAW" : `${u.noiseGateDb}dB`}
                                                                                        </span>

                                                                                        <span className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded border ${
                                                                                            u.notch5kEnabled 
                                                                                                ? "bg-emerald-950/80 text-emerald-400 border-emerald-700/60" 
                                                                                                : "bg-neutral-800 text-neutral-400 border-neutral-700"
                                                                                        }`} title="5kHz Whine / Static Notch Filter">
                                                                                            5kHz: {u.notch5kEnabled ? "ON" : "OFF"}
                                                                                        </span>

                                                                                        <span className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded border ${
                                                                                            u.deHissMode && u.deHissMode !== "off"
                                                                                                ? "bg-cyan-950/80 text-cyan-400 border-cyan-700/60" 
                                                                                                : "bg-neutral-800 text-neutral-400 border-neutral-700"
                                                                                        }`} title="De-Hiss Filter">
                                                                                            Hiss: {u.deHissMode && u.deHissMode !== "off" ? u.deHissMode : "OFF"}
                                                                                        </span>

                                                                                        <span className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded border ${
                                                                                            u.deEsserMode && u.deEsserMode !== "off"
                                                                                                ? "bg-purple-950/80 text-purple-400 border-purple-700/60" 
                                                                                                : "bg-neutral-800 text-neutral-400 border-neutral-700"
                                                                                        }`} title="De-Esser">
                                                                                            Ess: {u.deEsserMode && u.deEsserMode !== "off" ? u.deEsserMode : "OFF"}
                                                                                        </span>

                                                                                        <button
                                                                                            onClick={() => openEditAudioConfigModal(u, selectedLangData)}
                                                                                            className="px-2 py-1 bg-neutral-700 hover:bg-neutral-600 text-warning-400 hover:text-warning-300 text-[11px] font-semibold rounded-lg transition-colors border border-neutral-600 flex items-center gap-1 shadow-sm ml-1 cursor-pointer"
                                                                                            title="Edit Noise Gate, 5kHz Filter, De-Hisser & De-Esser"
                                                                                        >
                                                                                            <Sliders className="w-3 h-3" />
                                                                                            Edit Configurations
                                                                                        </button>
                                                                                    </div>
                                                                                </td>
                                                                                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                                                                    <div className="flex items-center justify-end gap-1.5">
                                                                                        {summaryUserTab === "approved" && (
                                                                                            <button
                                                                                                onClick={() => handleRemoveScriptedContributor(u, selectedLangData)}
                                                                                                className="px-2.5 py-1 bg-red-600/90 hover:bg-red-600 text-white text-[11px] font-bold rounded-lg transition-colors shadow-sm whitespace-nowrap cursor-pointer flex items-center gap-1"
                                                                                                title="Remove contributor from scripted calls"
                                                                                            >
                                                                                                <Trash2 className="w-3 h-3" />
                                                                                                <span>Remove Contributor</span>
                                                                                            </button>
                                                                                        )}
                                                                                        {summaryUserTab === "rejected" && (
                                                                                            <button
                                                                                                onClick={() => handleResetScriptedContributor(u, selectedLangData)}
                                                                                                className="px-2.5 py-1 bg-blue-600/90 hover:bg-blue-600 text-white text-[11px] font-bold rounded-lg transition-colors shadow-sm whitespace-nowrap inline-flex items-center gap-1 cursor-pointer"
                                                                                                title="Reset application so user can re-apply"
                                                                                            >
                                                                                                <RotateCcw className="w-3 h-3" />
                                                                                                <span>Reset Application</span>
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
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
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                )}
            </div>

                {/* Create / Edit Language Modal */}
                {showModal && (
                    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                        <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 w-full max-w-lg shadow-2xl animate-slide-up max-h-[90vh] flex flex-col">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-primary-500/5 rounded-full blur-2xl pointer-events-none" />
                            <div className="p-5 border-b border-neutral-800 flex items-center justify-between relative z-10">
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

                                {/* Company Name / Internal Client Reference Input */}
                                <div>
                                    <label className="block text-xs font-bold uppercase text-neutral-400 mb-1.5 flex items-center justify-between">
                                        <span className="flex items-center gap-1.5">
                                            <span>🏢 Company / Client Reference</span>
                                            <span className="text-amber-400 font-normal normal-case text-[10px] bg-amber-950/60 border border-amber-800/40 px-1.5 py-0.5 rounded">Admin Only</span>
                                        </span>
                                        <span className="text-[11px] text-neutral-500 font-normal">Optional</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={modalCompanyName}
                                        onChange={(e) => setModalCompanyName(e.target.value)}
                                        placeholder="e.g. Gnani, Shaip, Tech Mahindra (internal only)"
                                        className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-sm text-white focus:outline-none focus:border-primary-500 font-medium placeholder-neutral-500"
                                    />
                                    <p className="text-[11px] text-neutral-500 mt-1">
                                        🔒 Internal admin reference only. Strictly hidden from contributors and QA reviewers.
                                    </p>
                                </div>

                                {/* Call Roles Switch */}
                                <div className="bg-neutral-950/80 border border-neutral-800 rounded-xl p-3.5 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="text-xs font-bold text-white flex items-center gap-1.5">
                                                <span>🎭 Custom Roles (Doctor, Patient, Buyer, etc.)</span>
                                                <span className={`text-[10px] uppercase px-2 py-0.5 rounded font-extrabold ${modalEnableCallRoles ? 'bg-indigo-900/60 text-indigo-300 border border-indigo-700/50' : 'bg-neutral-800 text-neutral-400 border border-neutral-700'}`}>
                                                    {modalEnableCallRoles ? 'Active' : 'Off (Default Speakers)'}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-neutral-400 mt-0.5">
                                                Enable to configure distinct custom roles for this scripted project.
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

                                <div className="space-y-2.5 pt-1">
                                    <div className="flex items-center gap-2.5">
                                        <input
                                            type="checkbox"
                                            id="enabled-scripted-lang-checkbox"
                                            checked={modalEnabled}
                                            onChange={e => setModalEnabled(e.target.checked)}
                                            className="w-4 h-4 text-emerald-600 bg-neutral-800 border-neutral-700 rounded focus:ring-emerald-500"
                                        />
                                        <label htmlFor="enabled-scripted-lang-checkbox" className="text-xs font-semibold text-neutral-300 select-none cursor-pointer flex items-center gap-1.5">
                                            <span className={`w-2 h-2 rounded-full ${modalEnabled ? 'bg-emerald-400' : 'bg-neutral-500'}`} />
                                            <span>Enable this Scripted Language (Active)</span>
                                        </label>
                                    </div>

                                    <div className="flex items-center gap-2.5">
                                        <input
                                            type="checkbox"
                                            id="noisy-scripted-lang-checkbox"
                                            checked={modalNoisy}
                                            onChange={e => setModalNoisy(e.target.checked)}
                                            className="w-4 h-4 text-primary-600 bg-neutral-800 border-neutral-700 rounded focus:ring-primary-500"
                                        />
                                        <label htmlFor="noisy-scripted-lang-checkbox" className="text-xs font-semibold text-neutral-300 select-none cursor-pointer">
                                            Noisy Environment (Bypasses YAMNet noise scanning)
                                        </label>
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
                        <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-slide-up">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-primary-500/5 rounded-full blur-2xl pointer-events-none" />
                            <div className="p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/40 relative z-10">
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
                                                    <div key={u._id || u.userId} className="p-3 bg-neutral-800/60 rounded-xl border border-neutral-700 flex items-center justify-between text-xs">
                                                        <div>
                                                            <div className="font-bold text-white flex items-center gap-1.5 flex-wrap">
                                                                <span>{u.firstname} {u.lastname}</span>
                                                                {(u.vendorCode || u.vendorId?.vendorCode) && (
                                                                    <span
                                                                        className="inline-flex items-center justify-center font-mono font-bold text-[10px] uppercase px-2 py-0.5 rounded-lg bg-neutral-900 border border-purple-500/50 text-purple-300 shadow-sm"
                                                                        title={`Vendor Code: ${u.vendorCode || u.vendorId?.vendorCode}`}
                                                                    >
                                                                        🏢 {u.vendorCode || u.vendorId?.vendorCode}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-neutral-400 font-mono text-[11px]">{u.email}</div>
                                                        </div>
                                                        <span className="font-mono text-neutral-400 px-2 py-1 bg-neutral-900 rounded">
                                                            {u.speaker_id || `spk_${u._id || u.userId}`}
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
    );
}
