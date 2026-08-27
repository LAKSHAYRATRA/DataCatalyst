import React, { useEffect, useState, useRef } from "react";
import { Navigate } from "react-router-dom";
import { 
    Download, 
    RefreshCw, 
    Layers, 
    ArrowLeft, 
    Globe, 
    Building2, 
    Users, 
    CheckCircle2, 
    Clock, 
    XCircle, 
    Search, 
    ChevronRight, 
    Filter,
    Volume2,
    FileAudio,
    Sparkles,
    Archive,
    X,
    Play,
    Pause,
    Check,
    AlertCircle,
    Tag
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

function StatusBadge({ status }) {
    const icon = status === "approved" ? "✓" : status === "rejected" ? "✗" : "⏳";
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full capitalize ${STATUS_COLOR[status] || "bg-neutral-700 text-neutral-300"}`}>
            {icon} {status}
        </span>
    );
}

export default function AdminLanguageApps() {
    const userInfo = getUserInfo();
    if (userInfo?.isQA && !userInfo?.isAdmin) {
        return <Navigate to="/admin/qaphrase" replace />;
    }

    // Level Navigation State:
    // selectedProject: null (Level 1: Projects) or project object (Level 2: Languages)
    // selectedLanguage: null or language object (Level 3: Applicants)
    const [selectedProject, setSelectedProject] = useState(null);
    const [selectedLanguage, setSelectedLanguage] = useState(null);

    // Data States
    const [projects, setProjects] = useState([]);
    const [loadingHierarchy, setLoadingHierarchy] = useState(true);
    const [apps, setApps] = useState([]);
    const [loadingApps, setLoadingApps] = useState(false);
    const [statusFilter, setStatusFilter] = useState("pending");
    const [searchQuery, setSearchQuery] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [error, setError] = useState("");

    // Audio & Action States
    const [actionLoading, setActionLoading] = useState(null);
    const [audioSrc, setAudioSrc] = useState({});
    const [loadingAudio, setLoadingAudio] = useState({});
    const [downloadingApp, setDownloadingApp] = useState({});
    const [downloadingZip, setDownloadingZip] = useState({});
    const [expandedApp, setExpandedApp] = useState(null);
    const [qcData, setQcData] = useState({});
    const [loadingQc, setLoadingQc] = useState({});
    const [lightboxSrc, setLightboxSrc] = useState(null);
    const [selectedApplicantModal, setSelectedApplicantModal] = useState(null);
    const audioRefs = useRef({});

    // Naming Dialog State
    const [namingModalOpen, setNamingModalOpen] = useState(false);
    const [namingTarget, setNamingTarget] = useState(null); // { type: 'single' | 'zip', app, sampleIndex, sample, phraseId }
    const [namingPreset, setNamingPreset] = useState("emotion"); // 'emotion' | 'phraseId' | 'speaker_emotion' | 'speaker_phraseId' | 'full' | 'custom'
    const [customPattern, setCustomPattern] = useState(localStorage.getItem("phrase_app_naming_pattern") || "{emotion}");
    const [isExecutingDownload, setIsExecutingDownload] = useState(false);

    // Load hierarchy on mount
    useEffect(() => {
        loadHierarchy();
    }, []);

    // Load applicants when project and language are selected, or filter/page changes
    useEffect(() => {
        if (selectedProject && selectedLanguage) {
            loadApplicants();
        }
    }, [selectedProject, selectedLanguage, page, statusFilter, searchQuery]);

    async function loadHierarchy() {
        setLoadingHierarchy(true);
        setError("");
        try {
            const data = await get(`${REVIEW_BASE}/hierarchy`);
            setProjects(data.projects || []);
            
            if (selectedProject) {
                const updatedProj = (data.projects || []).find(p => String(p.id) === String(selectedProject.id) || p.name === selectedProject.name);
                if (updatedProj) {
                    setSelectedProject(updatedProj);
                    if (selectedLanguage) {
                        const updatedLang = updatedProj.languages?.find(l => l.code === selectedLanguage.code);
                        if (updatedLang) setSelectedLanguage(updatedLang);
                    }
                }
            }
        } catch (e) {
            setError(e.message || "Failed to load project hierarchy");
        } finally {
            setLoadingHierarchy(false);
        }
    }

    async function loadApplicants() {
        if (!selectedProject || !selectedLanguage) return;
        setLoadingApps(true);
        setError("");
        try {
            const params = new URLSearchParams({
                page,
                limit: 25,
                type: "phrase",
                company: selectedProject.name || selectedProject.id,
                language: selectedLanguage.code,
            });
            if (statusFilter) params.append("status", statusFilter);
            if (searchQuery.trim()) params.append("search", searchQuery.trim());

            const data = await get(`${REVIEW_BASE}?${params.toString()}`);
            setApps(data.applications || []);
            setTotal(data.total || 0);
            setTotalPages(data.pages || 1);

            // Update modal if applicant is currently selected
            if (selectedApplicantModal) {
                const updatedApp = (data.applications || []).find(a => String(a.appId) === String(selectedApplicantModal.appId));
                if (updatedApp) {
                    setSelectedApplicantModal(updatedApp);
                }
            }
        } catch (e) {
            setError(e.message || "Failed to load applicants");
        } finally {
            setLoadingApps(false);
        }
    }

    const handleDownloadAppsZip = async () => {
        try {
            const res = await apiFetch('/api/admin/companies', { method: "GET" });
            const compList = res.companies || [];
            
            let optionsHtml = '';
            compList.forEach(c => {
                const isSelected = selectedProject && (selectedProject.name === c.name || selectedProject.id === c._id);
                optionsHtml += `<option value="${c.name}" ${isSelected ? 'selected' : ''}>${c.projectName || c.name} (${c.name})</option>`;
            });

            const { value: formValues } = await Swal.fire({
                title: "Download Phrase Applications ZIP",
                html: `
                    <div class="text-left space-y-3 text-sm">
                        <div>
                            <label class="block font-semibold mb-1 text-neutral-300">Select Project / Company:</label>
                            <select id="swal-comp" class="w-full p-2.5 bg-neutral-800 border border-neutral-700 text-white rounded-lg text-sm focus:ring-2 focus:ring-warning-500">
                                ${optionsHtml || '<option value="Gnani">Gnani</option>'}
                            </select>
                        </div>
                        <div>
                            <label class="block font-semibold mb-1 text-neutral-300">Download Filter:</label>
                            <select id="swal-type" class="w-full p-2.5 bg-neutral-800 border border-neutral-700 text-white rounded-lg text-sm focus:ring-2 focus:ring-warning-500">
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
            await loadApplicants();
            loadHierarchy();
            Swal.fire({
                toast: true,
                position: "top-end",
                icon: "success",
                title: `Application ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
                timer: 2000,
                showConfirmButton: false
            });
        } catch (e) {
            setError(e.message);
        } finally {
            setActionLoading(null);
        }
    }

    async function loadAudio(userId, appId, autoPlay = true, sampleIndex = null) {
        const key = sampleIndex !== null ? `${appId}_s_${sampleIndex}` : appId;
        if (audioSrc[key]) {
            const audioEl = audioRefs.current[key];
            if (audioEl) {
                if (audioEl.paused) audioEl.play().catch(() => {});
                else audioEl.pause();
            }
            return;
        }
        if (loadingAudio[key]) return;
        setLoadingAudio(prev => ({ ...prev, [key]: true }));
        try {
            const sampleQuery = sampleIndex !== null ? `?sampleIndex=${sampleIndex}` : '';
            const url = `${BASE}/api/language-applications/${userId}/${appId}/recording${sampleQuery}`;
            const wavBlob = await fetchAndConvertToWav(url);
            const blobUrl = URL.createObjectURL(wavBlob);
            setAudioSrc(prev => ({ ...prev, [key]: blobUrl }));
            if (autoPlay) {
                setTimeout(() => {
                    const audioEl = audioRefs.current[key];
                    if (audioEl) audioEl.play().catch(() => {});
                }, 100);
            }
        } catch (e) {
            setError("Failed to convert audio: " + e.message);
        } finally {
            setLoadingAudio(prev => ({ ...prev, [key]: false }));
        }
    }

    function getPatternForPreset(preset, customVal = customPattern) {
        switch (preset) {
            case "emotion":
                return "{emotion}";
            case "phraseId":
                return "{phraseId}";
            case "speaker_emotion":
                return "{speakerId}_{emotion}";
            case "speaker_phraseId":
                return "{speakerId}_{phraseId}";
            case "full":
                return "{speakerId}_{company}_{language}_sample_{sampleIndex}_{emotion}";
            case "custom":
                return customVal || "{emotion}";
            default:
                return "{emotion}";
        }
    }

    function formatSampleFilename(pattern, app, sample, sampleIndex = 0) {
        if (!app) return "sample.wav";
        const rawSpk = app.speaker_id || app.speakerId || `spk_${app.userId}`;
        const cleanSpk = String(rawSpk).replace(/[^a-zA-Z0-9_\-]/g, "");
        const rawName = [app.userFirstname, app.userLastname].filter(Boolean).join("_") || app.username || "applicant";
        const cleanName = String(rawName).trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "");
        const comp = app.companyId || selectedProject?.projectName || selectedProject?.name || "Project";
        const lang = app.languageCode || selectedLanguage?.code || "lang";
        const phraseId = sample?.phraseId || `sample_${sampleIndex + 1}`;
        const emotion = sample?.emotion || sample?.tags?.emotion || phraseId;
        const style = sample?.style || sample?.tags?.style || "";
        const intent = sample?.intent || sample?.tags?.intent || "";
        const speed = sample?.speed || sample?.tags?.speed || "";
        const pitch = sample?.pitch || sample?.tags?.pitch || "";
        const volume = sample?.volume || sample?.tags?.volume || "";
        const idx = String(sampleIndex + 1);

        let formatted = (pattern || "{emotion}")
            .replace(/\{speakerId\}/gi, cleanSpk)
            .replace(/\{name\}/gi, cleanName)
            .replace(/\{company\}/gi, comp)
            .replace(/\{language\}/gi, lang)
            .replace(/\{phraseId\}/gi, phraseId)
            .replace(/\{id\}/gi, phraseId)
            .replace(/\{emotion\}/gi, emotion)
            .replace(/\{style\}/gi, style)
            .replace(/\{intent\}/gi, intent)
            .replace(/\{speed\}/gi, speed)
            .replace(/\{pitch\}/gi, pitch)
            .replace(/\{volume\}/gi, volume)
            .replace(/\{sampleIndex\}/gi, idx)
            .replace(/\{index\}/gi, idx);

        let clean = formatted.replace(/[^a-zA-Z0-9_\-]/g, "_").replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "");
        if (!clean) clean = `sample_${idx}`;
        return `${clean}.wav`;
    }

    function openNamingModal(type, app, sampleIndex = null, sample = null, phraseId = null) {
        setNamingTarget({ type, app, sampleIndex, sample, phraseId });
        setNamingModalOpen(true);
    }

    async function handleConfirmDownload() {
        if (!namingTarget) return;
        const pattern = getPatternForPreset(namingPreset, customPattern);
        localStorage.setItem("phrase_app_naming_pattern", pattern);

        setIsExecutingDownload(true);
        try {
            if (namingTarget.type === "single") {
                await executeSingleDownload(namingTarget.app, namingTarget.sampleIndex, namingTarget.sample, pattern);
            } else {
                await executeZipDownload(namingTarget.app, pattern);
            }
            setNamingModalOpen(false);
        } catch (e) {
            Swal.fire("Download Error", e.message || "Failed to download audio", "error");
        } finally {
            setIsExecutingDownload(false);
        }
    }

    async function executeSingleDownload(app, sampleIndex, sample, pattern) {
        const key = sampleIndex !== null ? `${app.appId}_s_${sampleIndex}` : app.appId;
        const filename = formatSampleFilename(pattern, app, sample, sampleIndex !== null ? sampleIndex : 0);

        setDownloadingApp(prev => ({ ...prev, [key]: true }));
        try {
            const sampleQuery = sampleIndex !== null ? `?sampleIndex=${sampleIndex}` : '';
            const url = `${BASE}/api/language-applications/${app.userId}/${app.appId}/recording${sampleQuery}`;
            const wavBlob = await fetchAndConvertToWav(url);
            const blobUrl = URL.createObjectURL(wavBlob);
            setAudioSrc(prev => ({ ...prev, [key]: blobUrl }));
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            Swal.fire({
                toast: true,
                position: "top-end",
                icon: "success",
                title: `Downloaded: ${filename}`,
                timer: 2500,
                showConfirmButton: false
            });
        } catch (e) {
            throw e;
        } finally {
            setDownloadingApp(prev => ({ ...prev, [key]: false }));
        }
    }

    async function executeZipDownload(app, pattern) {
        const key = app.appId;
        setDownloadingZip(prev => ({ ...prev, [key]: true }));
        try {
            const url = `${BASE}/api/language-applications/${app.userId}/${app.appId}/download-zip?namingPattern=${encodeURIComponent(pattern)}`;
            const res = await fetch(url, { credentials: "include" });
            if (!res.ok) throw new Error("Failed to generate zip file");
            const blob = await res.blob();
            const rawSpk = app.speaker_id || app.speakerId || `spk_${app.userId}`;
            const comp = app.companyId || "Project";
            const lang = app.languageCode || "lang";
            const filename = `${rawSpk}_${comp}_${lang}_samples.zip`;

            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

            Swal.fire({
                toast: true,
                position: "top-end",
                icon: "success",
                title: "Samples ZIP downloaded with custom naming!",
                timer: 2500,
                showConfirmButton: false
            });
        } catch (err) {
            throw err;
        } finally {
            setDownloadingZip(prev => ({ ...prev, [key]: false }));
        }
    }

    async function toggleQC(userId, appId, sampleIndex = null) {
        const key = sampleIndex !== null ? `${appId}_s_${sampleIndex}` : appId;
        if (expandedApp === key) {
            setExpandedApp(null);
            return;
        }
        setExpandedApp(key);
        if (!qcData[key]) {
            await runQC(userId, appId, sampleIndex);
        }
    }

    async function runQC(userId, appId, sampleIndex = null) {
        const key = sampleIndex !== null ? `${appId}_s_${sampleIndex}` : appId;
        setLoadingQc(prev => ({ ...prev, [key]: true }));
        try {
            const sampleQuery = sampleIndex !== null ? `?sampleIndex=${sampleIndex}` : '';
            const res = await apiFetch(`${REVIEW_BASE}/${userId}/${appId}/analyze${sampleQuery}`, {
                method: "POST"
            });
            setQcData(prev => ({ ...prev, [key]: res.qcResult }));
        } catch (e) {
            setError("QC Analysis Failed: " + e.message);
        } finally {
            setLoadingQc(prev => ({ ...prev, [key]: false }));
        }
    }

    // Filter projects based on search query in Level 1
    const filteredProjects = projects.filter(p => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            (p.name && p.name.toLowerCase().includes(q)) ||
            (p.projectName && p.projectName.toLowerCase().includes(q)) ||
            (p.description && p.description.toLowerCase().includes(q))
        );
    });

    // Total pending counter across all projects
    const totalGlobalPending = projects.reduce((acc, p) => acc + (p.pendingApplicants || 0), 0);

    return (
        <div className="min-h-screen bg-neutral-900 text-neutral-100 flex transition-colors duration-300">
            <AdminNav />
            <div className="flex-1 md:ml-64 p-6 md:p-10 max-w-7xl mx-auto space-y-6">

                {/* Persistent Breadcrumb Bar */}
                <div className="flex items-center gap-2 text-xs font-semibold text-neutral-400 bg-neutral-800/80 border border-neutral-700/80 px-4 py-3 rounded-xl shadow-lg">
                    <button
                        onClick={() => { setSelectedProject(null); setSelectedLanguage(null); setSearchQuery(""); }}
                        className={`flex items-center gap-1.5 transition-colors ${!selectedProject ? 'text-warning-400 font-bold' : 'hover:text-white'}`}
                    >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Phrase Projects</span>
                    </button>

                    {selectedProject && (
                        <>
                            <span className="text-neutral-600">/</span>
                            <button
                                onClick={() => { setSelectedLanguage(null); setSearchQuery(""); }}
                                className={`flex items-center gap-1.5 transition-colors ${!selectedLanguage ? 'text-warning-400 font-bold' : 'hover:text-white'}`}
                            >
                                <Building2 className="w-3.5 h-3.5" />
                                <span>{selectedProject.projectName || selectedProject.name}</span>
                            </button>
                        </>
                    )}

                    {selectedLanguage && (
                        <>
                            <span className="text-neutral-600">/</span>
                            <span className="text-warning-400 font-bold flex items-center gap-1.5">
                                <Globe className="w-3.5 h-3.5" />
                                <span>{selectedLanguage.name} ({selectedLanguage.code})</span>
                            </span>
                        </>
                    )}
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="p-4 bg-rose-950/70 border border-rose-800 text-rose-200 rounded-xl text-sm flex items-center justify-between shadow-lg">
                        <span>{error}</span>
                        <button onClick={() => setError("")} className="text-rose-400 hover:text-white font-bold ml-4">✕</button>
                    </div>
                )}

                {/* ========================================================================= */}
                {/* LEVEL 1: PROJECTS VIEW (Default)                                          */}
                {/* ========================================================================= */}
                {!selectedProject && (
                    <div className="space-y-6 animate-fade-in">
                        {/* Level 1 Header */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-neutral-800/60 border border-neutral-700/60 p-6 rounded-2xl shadow-xl">
                            <div>
                                <h1 className="text-2xl md:text-3xl font-extrabold text-white flex items-center gap-3">
                                    <span>Phrase Applications</span>
                                    {totalGlobalPending > 0 && (
                                        <span className="px-2.5 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs rounded-full font-semibold animate-pulse">
                                            {totalGlobalPending} Pending
                                        </span>
                                    )}
                                </h1>
                                <p className="text-neutral-400 text-sm mt-1">
                                    Select a project to explore its active language workloads and review applicant recordings.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    onClick={() => handleDownloadAppsZip()}
                                    className="px-4 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg hover:shadow-orange-600/30"
                                >
                                    <Download className="w-4 h-4" />
                                    <span>Download Apps ZIP</span>
                                </button>
                                <button
                                    onClick={loadHierarchy}
                                    disabled={loadingHierarchy}
                                    className="p-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 hover:text-white rounded-xl transition-colors disabled:opacity-50"
                                    title="Refresh hierarchy"
                                >
                                    <RefreshCw className={`w-4 h-4 ${loadingHierarchy ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                        </div>

                        {/* Search & Stats Bar */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="md:col-span-2 relative">
                                <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-neutral-400" />
                                <input
                                    type="text"
                                    placeholder="Search projects..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-neutral-800/90 border border-neutral-700 text-white text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-warning-500 transition-all placeholder:text-neutral-500 shadow-md"
                                />
                            </div>
                            <div className="bg-neutral-800/80 border border-neutral-700/60 px-4 py-2.5 rounded-xl flex items-center justify-between">
                                <span className="text-xs text-neutral-400 font-semibold">Total Projects</span>
                                <span className="text-base font-bold text-white font-mono">{projects.length}</span>
                            </div>
                            <div className="bg-neutral-800/80 border border-neutral-700/60 px-4 py-2.5 rounded-xl flex items-center justify-between">
                                <span className="text-xs text-neutral-400 font-semibold">Pending Reviews</span>
                                <span className={`text-base font-bold font-mono ${totalGlobalPending > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                    {totalGlobalPending}
                                </span>
                            </div>
                        </div>

                        {/* Project Cards Grid */}
                        {loadingHierarchy ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-3">
                                <div className="w-12 h-12 border-4 border-warning-200 border-t-warning-500 rounded-full animate-spin" />
                                <span className="text-sm text-neutral-400">Loading project catalog...</span>
                            </div>
                        ) : filteredProjects.length === 0 ? (
                            <div className="text-center py-20 bg-neutral-800/40 border border-neutral-700/50 rounded-2xl text-neutral-500">
                                <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30 text-neutral-400" />
                                <p className="text-base font-semibold text-neutral-300">No matching projects found</p>
                                <p className="text-xs text-neutral-500 mt-1">Try refining your search query.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {filteredProjects.map(proj => {
                                    const hasPending = (proj.pendingApplicants || 0) > 0;
                                    return (
                                        <div
                                            key={proj.id || proj.name}
                                            onClick={() => { setSelectedProject(proj); setSelectedLanguage(null); setSearchQuery(""); }}
                                            className="group bg-neutral-800/80 hover:bg-neutral-800 border border-neutral-700/70 hover:border-warning-500/60 rounded-2xl p-6 transition-all duration-300 shadow-lg hover:shadow-2xl hover:scale-[1.01] cursor-pointer flex flex-col justify-between"
                                        >
                                            <div>
                                                <div className="flex items-start justify-between gap-3 mb-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neutral-700 to-neutral-900 border border-neutral-600 flex items-center justify-center group-hover:border-warning-500/50 transition-colors">
                                                            <Building2 className="w-5 h-5 text-warning-400" />
                                                        </div>
                                                        <div>
                                                            <h3 className="text-base font-bold text-white group-hover:text-warning-300 transition-colors leading-tight">
                                                                {proj.projectName || proj.name}
                                                            </h3>
                                                            {proj.projectName && proj.projectName !== proj.name && (
                                                                <span className="text-xs text-neutral-400 block">{proj.name}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {hasPending ? (
                                                        <span className="px-2.5 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold rounded-lg shadow-sm animate-pulse">
                                                            {proj.pendingApplicants} Pending
                                                        </span>
                                                    ) : (
                                                        <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-lg">
                                                            All Reviewed
                                                        </span>
                                                    )}
                                                </div>

                                                {proj.description && (
                                                    <p className="text-xs text-neutral-400 line-clamp-2 mb-4 leading-relaxed">
                                                        {proj.description}
                                                    </p>
                                                )}

                                                <div className="grid grid-cols-2 gap-2 bg-neutral-900/60 border border-neutral-700/40 rounded-xl p-3 text-xs mb-4">
                                                    <div>
                                                        <span className="text-neutral-500 block text-[10px] uppercase font-bold">Languages</span>
                                                        <span className="text-white font-bold font-mono text-sm">
                                                            {proj.totalLanguages || proj.languages?.length || 0} active
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span className="text-neutral-500 block text-[10px] uppercase font-bold">Total Applicants</span>
                                                        <span className="text-white font-bold font-mono text-sm">
                                                            {proj.totalApplicants || 0} applied
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-3 border-t border-neutral-700/50 flex items-center justify-between text-xs text-warning-400 font-semibold group-hover:text-warning-300">
                                                <span>View Ongoing Languages</span>
                                                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ========================================================================= */}
                {/* LEVEL 2: ONGOING LANGUAGES IN PROJECT VIEW                                */}
                {/* ========================================================================= */}
                {selectedProject && !selectedLanguage && (
                    <div className="space-y-6 animate-fade-in">
                        {/* Header Navigation */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-neutral-800/60 border border-neutral-700/60 p-6 rounded-2xl shadow-xl">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => { setSelectedProject(null); setSearchQuery(""); }}
                                    className="p-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 hover:text-white rounded-xl transition-all flex items-center gap-2 text-xs font-bold"
                                    title="Back to projects"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    <span>Projects</span>
                                </button>
                                <div>
                                    <h1 className="text-2xl md:text-3xl font-extrabold text-white">
                                        {selectedProject.projectName || selectedProject.name}
                                    </h1>
                                    <p className="text-neutral-400 text-sm mt-1">
                                        Select an ongoing language to review applicant sample recordings.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={loadHierarchy}
                                    disabled={loadingHierarchy}
                                    className="p-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 hover:text-white rounded-xl transition-colors disabled:opacity-50"
                                    title="Refresh languages"
                                >
                                    <RefreshCw className={`w-4 h-4 ${loadingHierarchy ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                        </div>

                        {/* Languages Grid */}
                        {(!selectedProject.languages || selectedProject.languages.length === 0) ? (
                            <div className="text-center py-20 bg-neutral-800/40 border border-neutral-700/50 rounded-2xl text-neutral-500">
                                <Globe className="w-12 h-12 mx-auto mb-3 opacity-30 text-neutral-400" />
                                <p className="text-base font-semibold text-neutral-300">No active languages in this project</p>
                                <p className="text-xs text-neutral-500 mt-1">Upload phrases to this project to enable languages.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                                {selectedProject.languages.map(lang => {
                                    const hasPending = (lang.pendingApplicants || 0) > 0;
                                    return (
                                        <div
                                            key={lang.code}
                                            onClick={() => { setSelectedLanguage(lang); setSearchQuery(""); setPage(1); }}
                                            className="group bg-neutral-800/80 hover:bg-neutral-800 border border-neutral-700/70 hover:border-warning-500/60 rounded-2xl p-5 transition-all duration-300 shadow-lg hover:shadow-2xl hover:scale-[1.02] cursor-pointer flex flex-col justify-between"
                                        >
                                            <div>
                                                <div className="flex items-start justify-between gap-2 mb-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-neutral-700 to-neutral-900 border border-neutral-600 flex items-center justify-center group-hover:border-warning-500/50">
                                                            <Globe className="w-4 h-4 text-warning-400" />
                                                        </div>
                                                        <div>
                                                            <h3 className="text-base font-bold text-white group-hover:text-warning-300 transition-colors">
                                                                {lang.name}
                                                            </h3>
                                                            <span className="text-xs font-mono text-neutral-400 block uppercase">
                                                                {lang.code}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {hasPending ? (
                                                        <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-bold rounded-lg animate-pulse">
                                                            {lang.pendingApplicants} Pending
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold rounded-lg">
                                                            ✓ Done
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="space-y-1.5 bg-neutral-900/60 border border-neutral-700/40 rounded-xl p-3 text-xs mb-3 font-mono">
                                                    <div className="flex justify-between text-neutral-400">
                                                        <span>Pending:</span>
                                                        <span className={`font-bold ${hasPending ? 'text-amber-400' : 'text-neutral-300'}`}>
                                                            {lang.pendingApplicants || 0}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between text-neutral-400">
                                                        <span>Approved:</span>
                                                        <span className="font-bold text-emerald-400">{lang.approvedApplicants || 0}</span>
                                                    </div>
                                                    <div className="flex justify-between text-neutral-400">
                                                        <span>Rejected:</span>
                                                        <span className="font-bold text-rose-400">{lang.rejectedApplicants || 0}</span>
                                                    </div>
                                                    <div className="flex justify-between text-neutral-300 pt-1 border-t border-neutral-800">
                                                        <span>Total Applied:</span>
                                                        <span className="font-bold text-white">{lang.totalApplicants || 0}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-3 border-t border-neutral-700/50 flex items-center justify-between text-xs text-warning-400 font-semibold group-hover:text-warning-300">
                                                <span>Review Applicants</span>
                                                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ========================================================================= */}
                {/* LEVEL 3: APPLICANTS ROSTER IN SELECTED LANGUAGE                           */}
                {/* ========================================================================= */}
                {selectedProject && selectedLanguage && (
                    <div className="space-y-6 animate-fade-in">
                        {/* Header with Breadcrumb and Controls */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-neutral-800/60 border border-neutral-700/60 p-6 rounded-2xl shadow-xl">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => { setSelectedLanguage(null); setSearchQuery(""); }}
                                    className="p-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 hover:text-white rounded-xl transition-all flex items-center gap-2 text-xs font-bold"
                                    title="Back to languages"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    <span>Languages</span>
                                </button>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h1 className="text-2xl md:text-3xl font-extrabold text-white">
                                            {selectedLanguage.name} Applicants
                                        </h1>
                                        <code className="text-xs px-2 py-0.5 rounded bg-warning-500/20 text-warning-300 font-mono border border-warning-500/30">
                                            {selectedLanguage.code}
                                        </code>
                                    </div>
                                    <p className="text-neutral-400 text-sm mt-1">
                                        Project: <span className="text-white font-semibold">{selectedProject.projectName || selectedProject.name}</span>
                                    </p>
                                </div>
                            </div>

                            {/* Actions & Filters */}
                            <div className="flex flex-wrap items-center gap-3">
                                <select
                                    value={statusFilter}
                                    onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                                    className="bg-neutral-800 border border-neutral-700 text-white text-xs font-semibold rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-warning-500 shadow-md"
                                >
                                    <option value="">All Statuses</option>
                                    <option value="pending">Pending Only</option>
                                    <option value="approved">Approved Only</option>
                                    <option value="rejected">Rejected Only</option>
                                </select>
                                <button
                                    onClick={loadApplicants}
                                    disabled={loadingApps}
                                    className="p-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 hover:text-white rounded-xl transition-colors disabled:opacity-50"
                                    title="Refresh applicants list"
                                >
                                    <RefreshCw className={`w-4 h-4 ${loadingApps ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                        </div>

                        {/* Search applicants bar */}
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-neutral-400" />
                            <input
                                type="text"
                                placeholder="Search applicants by name, username, or speaker ID..."
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                                className="w-full pl-10 pr-4 py-2.5 bg-neutral-800/90 border border-neutral-700 text-white text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-warning-500 transition-all placeholder:text-neutral-500 shadow-md"
                            />
                        </div>

                        {/* Applicants Table */}
                        {loadingApps ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-3">
                                <div className="w-12 h-12 border-4 border-warning-200 border-t-warning-500 rounded-full animate-spin" />
                                <span className="text-sm text-neutral-400">Loading applicants...</span>
                            </div>
                        ) : apps.length === 0 ? (
                            <div className="text-center py-20 bg-neutral-800/40 border border-neutral-700/50 rounded-2xl text-neutral-500">
                                <Users className="w-12 h-12 mx-auto mb-3 opacity-30 text-neutral-400" />
                                <p className="text-base font-semibold text-neutral-300">No applicants found</p>
                                <p className="text-xs text-neutral-500 mt-1">
                                    No submissions match the current filter ({statusFilter || "all"}).
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="bg-neutral-800/90 border border-neutral-700/80 rounded-2xl overflow-hidden shadow-2xl">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-neutral-700/70 border-b border-neutral-700">
                                                <tr>
                                                    {["Applicant (Click to Inspect)", "Speaker ID", "Status", "Samples", "Applied At", "Quick Actions"].map(h => (
                                                        <th key={h} className="px-4 py-3.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-wider whitespace-nowrap">
                                                            {h}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-neutral-700/60">
                                                {apps.map(app => {
                                                    const key = app.appId;
                                                    const speakerId = app.speaker_id || app.speakerId || `spk_${app.userId}`;
                                                    const sampleCount = app.sampleRecordings?.length || 1;
                                                    return (
                                                        <React.Fragment key={key}>
                                                            <tr className="hover:bg-neutral-700/30 transition-colors">
                                                                <td className="px-4 py-3.5">
                                                                    <button
                                                                        onClick={() => setSelectedApplicantModal(app)}
                                                                        className="text-left group/name flex flex-col"
                                                                    >
                                                                        <div className="text-white font-bold text-xs group-hover/name:text-warning-400 group-hover/name:underline transition-colors flex items-center gap-1.5">
                                                                            <span>{app.userFirstname} {app.userLastname}</span>
                                                                            <ChevronRight className="w-3 h-3 text-neutral-500 group-hover/name:text-warning-400 group-hover/name:translate-x-0.5 transition-transform" />
                                                                        </div>
                                                                        <div className="text-neutral-400 text-[11px]">
                                                                            @{app.username}
                                                                        </div>
                                                                    </button>
                                                                </td>
                                                                <td className="px-4 py-3.5">
                                                                    <code className="bg-neutral-900 text-neutral-300 px-2 py-0.5 rounded text-xs font-mono border border-neutral-700/60">
                                                                        {speakerId}
                                                                    </code>
                                                                </td>
                                                                <td className="px-4 py-3.5">
                                                                    <StatusBadge status={app.status} />
                                                                </td>
                                                                <td className="px-4 py-3.5">
                                                                    <button
                                                                        onClick={() => setSelectedApplicantModal(app)}
                                                                        className="px-2.5 py-1 bg-warning-500/10 hover:bg-warning-500/20 border border-warning-500/30 text-warning-300 rounded-lg text-xs font-bold font-mono transition-colors flex items-center gap-1.5"
                                                                    >
                                                                        <FileAudio className="w-3.5 h-3.5" />
                                                                        <span>{sampleCount} Sample{sampleCount !== 1 ? 's' : ''}</span>
                                                                    </button>
                                                                </td>
                                                                <td className="px-4 py-3.5 text-neutral-400 text-xs whitespace-nowrap">
                                                                    {new Date(app.appliedAt).toLocaleString()}
                                                                </td>
                                                                <td className="px-4 py-3.5">
                                                                    <div className="flex gap-2 items-center">
                                                                        <button
                                                                            onClick={() => setSelectedApplicantModal(app)}
                                                                            className="px-2.5 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors shadow-sm"
                                                                            title="Inspect and listen to all sample recordings"
                                                                        >
                                                                            <Play className="w-3.5 h-3.5 text-warning-400" />
                                                                            <span>Inspect</span>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => openNamingModal("zip", app)}
                                                                            disabled={downloadingZip[key]}
                                                                            className="px-2.5 py-1.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-sm disabled:opacity-50"
                                                                            title="Download all sample WAV recordings in a ZIP"
                                                                        >
                                                                            {downloadingZip[key] ? (
                                                                                <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                                                            ) : (
                                                                                <Archive className="w-3.5 h-3.5" />
                                                                            )}
                                                                            <span>ZIP</span>
                                                                        </button>
                                                                        {app.status === "pending" && (
                                                                            <>
                                                                                <button
                                                                                    onClick={() => act(app.userId, app.appId, "approve")}
                                                                                    disabled={!!actionLoading}
                                                                                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors shadow-md disabled:opacity-50"
                                                                                    title="Approve applicant"
                                                                                >
                                                                                    {actionLoading === `approve_${key}` ? "…" : "Approve"}
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => act(app.userId, app.appId, "reject")}
                                                                                    disabled={!!actionLoading}
                                                                                    className="px-2.5 py-1.5 bg-rose-900/70 hover:bg-rose-800 text-rose-200 text-xs font-bold rounded-lg transition-colors shadow-md disabled:opacity-50"
                                                                                    title="Reject applicant"
                                                                                >
                                                                                    {actionLoading === `reject_${key}` ? "…" : "Reject"}
                                                                                </button>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Pagination Footer */}
                                <div className="flex items-center justify-between mt-4 text-xs text-neutral-400">
                                    <span>{total} total applicant{total !== 1 ? "s" : ""}</span>
                                    {totalPages > 1 && (
                                        <div className="flex gap-2 items-center">
                                            <button 
                                                onClick={() => setPage(p => Math.max(1, p - 1))} 
                                                disabled={page === 1} 
                                                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white rounded-lg transition-colors disabled:opacity-40"
                                            >
                                                Prev
                                            </button>
                                            <span className="px-2">Page {page} of {totalPages}</span>
                                            <button 
                                                onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
                                                disabled={page === totalPages} 
                                                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white rounded-lg transition-colors disabled:opacity-40"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* ========================================================================= */}
            {/* APPLICANT SAMPLES INSPECTOR MODAL                                         */}
            {/* ========================================================================= */}
            {selectedApplicantModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-neutral-900 border border-neutral-700 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                        
                        {/* Modal Header */}
                        <div className="p-6 bg-neutral-800/90 border-b border-neutral-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-3">
                                    <h2 className="text-xl font-bold text-white">
                                        {selectedApplicantModal.userFirstname} {selectedApplicantModal.userLastname}
                                    </h2>
                                    <code className="text-xs bg-neutral-950 text-warning-400 px-2.5 py-1 rounded-lg border border-neutral-700 font-mono font-bold">
                                        {selectedApplicantModal.speaker_id || `spk_${selectedApplicantModal.userId}`}
                                    </code>
                                    <StatusBadge status={selectedApplicantModal.status} />
                                </div>
                                <p className="text-xs text-neutral-400 mt-1">
                                    Project: <span className="text-white font-semibold">{selectedProject?.projectName || selectedProject?.name}</span> • 
                                    Language: <span className="text-white font-semibold uppercase">{selectedApplicantModal.languageCode}</span> • 
                                    Applied: <span className="text-neutral-300 font-mono">{new Date(selectedApplicantModal.appliedAt).toLocaleString()}</span>
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => openNamingModal("zip", selectedApplicantModal)}
                                    disabled={downloadingZip[selectedApplicantModal.appId]}
                                    className="px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg disabled:opacity-50"
                                >
                                    {downloadingZip[selectedApplicantModal.appId] ? (
                                        <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <Archive className="w-3.5 h-3.5" />
                                    )}
                                    <span>Download All (ZIP)</span>
                                </button>
                                <button
                                    onClick={() => setSelectedApplicantModal(null)}
                                    className="p-2 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 hover:text-white rounded-xl transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body: Samples List */}
                        <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
                            {(() => {
                                const samples = selectedApplicantModal.sampleRecordings && selectedApplicantModal.sampleRecordings.length > 0
                                    ? selectedApplicantModal.sampleRecordings
                                    : [{ sampleIndex: 0, phraseId: "sample_1", text: "Sample application recording", recordingFile: selectedApplicantModal.recordingFile }];

                                return samples.map((sample, idx) => {
                                    const sampleKey = `${selectedApplicantModal.appId}_s_${idx}`;
                                    const isPlaying = audioSrc[sampleKey] && audioRefs.current[sampleKey] && !audioRefs.current[sampleKey].paused;

                                    return (
                                        <div 
                                            key={idx}
                                            className="bg-neutral-800/80 border border-neutral-700/80 rounded-2xl p-5 shadow-lg space-y-4"
                                        >
                                            {/* Sample Title and Info */}
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="flex items-center gap-2.5">
                                                    <span className="w-7 h-7 rounded-lg bg-warning-500/20 text-warning-300 border border-warning-500/40 text-xs font-mono font-bold flex items-center justify-center">
                                                        #{idx + 1}
                                                    </span>
                                                    <span className="text-xs font-mono text-neutral-400 font-semibold">
                                                        {sample.phraseId || `Sample Phrase ${idx + 1}`}
                                                    </span>
                                                </div>

                                                {sample.lufs !== undefined && sample.lufs !== null && (
                                                    <span className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded border ${
                                                        sample.lufs >= -24.0 && sample.lufs <= -18.0
                                                            ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                                                            : sample.lufs > -18.0
                                                            ? "bg-rose-500/15 border-rose-500/40 text-rose-400"
                                                            : "bg-amber-500/15 border-amber-500/40 text-amber-400"
                                                    }`}>
                                                        {sample.lufs} LUFS
                                                    </span>
                                                )}
                                            </div>

                                            {/* Phrase Text */}
                                            {sample.text && (
                                                <div className="bg-neutral-900/90 border border-neutral-700/60 p-4 rounded-xl">
                                                    <p className="text-white text-sm md:text-base font-medium leading-relaxed">
                                                        "{sample.text}"
                                                    </p>
                                                </div>
                                            )}

                                            {/* Metadata Badges */}
                                            <div className="flex flex-wrap gap-2 text-xs">
                                                {sample.emotion && (
                                                    <span className="px-2.5 py-1 bg-neutral-900 text-neutral-300 rounded-lg border border-neutral-700 font-medium">
                                                        Emotion: <b className="text-white">{sample.emotion}</b>
                                                    </span>
                                                )}
                                                {sample.style && (
                                                    <span className="px-2.5 py-1 bg-neutral-900 text-neutral-300 rounded-lg border border-neutral-700 font-medium">
                                                        Style: <b className="text-white">{sample.style}</b>
                                                    </span>
                                                )}
                                                {sample.speed && (
                                                    <span className="px-2.5 py-1 bg-neutral-900 text-neutral-300 rounded-lg border border-neutral-700 font-medium">
                                                        Speed: <b className="text-white">{sample.speed}</b>
                                                    </span>
                                                )}
                                                {sample.intent && (
                                                    <span className="px-2.5 py-1 bg-neutral-900 text-neutral-300 rounded-lg border border-neutral-700 font-medium">
                                                        Intent: <b className="text-white">{sample.intent}</b>
                                                    </span>
                                                )}
                                                {sample.tags && Object.entries(sample.tags).map(([tk, tv]) => (
                                                    <span key={tk} className="px-2.5 py-1 bg-warning-950/60 text-warning-300 rounded-lg border border-warning-700/50 font-medium">
                                                        {tk}: <b className="text-white">{String(tv)}</b>
                                                    </span>
                                                ))}
                                            </div>

                                            {/* Audio Player and Action Controls */}
                                            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-neutral-700/50">
                                                <div className="flex items-center gap-3 flex-1 min-w-[260px]">
                                                    {!audioSrc[sampleKey] ? (
                                                        <button
                                                            onClick={() => loadAudio(selectedApplicantModal.userId, selectedApplicantModal.appId, true, idx)}
                                                            disabled={loadingAudio[sampleKey]}
                                                            className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-warning-400 hover:text-warning-300 text-xs font-bold rounded-xl transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm"
                                                        >
                                                            {loadingAudio[sampleKey] ? (
                                                                <div className="w-4 h-4 border-2 border-warning-400 border-t-transparent rounded-full animate-spin" />
                                                            ) : (
                                                                <Play className="w-4 h-4 fill-warning-400" />
                                                            )}
                                                            <span>Play Sample #{idx + 1}</span>
                                                        </button>
                                                    ) : (
                                                        <audio
                                                            ref={el => audioRefs.current[sampleKey] = el}
                                                            src={audioSrc[sampleKey]}
                                                            controls
                                                            controlsList="nodownload noplaybackrate"
                                                            onContextMenu={(e) => e.preventDefault()}
                                                            className="h-9 w-full max-w-md rounded-lg"
                                                        />
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => toggleQC(selectedApplicantModal.userId, selectedApplicantModal.appId, idx)}
                                                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                                                            expandedApp === sampleKey
                                                                ? "bg-warning-600 text-white shadow-warning-600/30"
                                                                : "bg-neutral-700 hover:bg-neutral-600 text-neutral-200"
                                                        }`}
                                                    >
                                                        <span>📊</span>
                                                        <span>{expandedApp === sampleKey ? "Close QC" : "QC Analysis"}</span>
                                                    </button>
                                                    <button
                                                        onClick={() => openNamingModal("single", selectedApplicantModal, idx, sample, sample.phraseId)}
                                                        disabled={downloadingApp[sampleKey]}
                                                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md disabled:opacity-50"
                                                    >
                                                        {downloadingApp[sampleKey] ? (
                                                            <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                                        ) : (
                                                            <Download className="w-3.5 h-3.5" />
                                                        )}
                                                        <span>Download WAV</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Inline QC Drawer */}
                                            {expandedApp === sampleKey && (
                                                <div className="mt-4 pt-4 border-t border-neutral-700/70 bg-neutral-900/90 rounded-xl p-4">
                                                    {loadingQc[sampleKey] ? (
                                                        <div className="flex items-center justify-center py-6 gap-2 text-xs text-neutral-400">
                                                            <div className="w-4 h-4 border-2 border-warning-400 border-t-transparent rounded-full animate-spin" />
                                                            <span>Computing Fourier transform & noise floor...</span>
                                                        </div>
                                                    ) : qcData[sampleKey] ? (
                                                        <div className="space-y-4">
                                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                                                                <div className="bg-neutral-800 p-2.5 rounded-lg border border-neutral-700">
                                                                    <span className="text-neutral-400 block text-[10px] uppercase">QC Status</span>
                                                                    <span className={`font-bold ${qcData[sampleKey].status === 'PASS' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                        {qcData[sampleKey].status || 'COMPLETED'}
                                                                    </span>
                                                                </div>
                                                                <div className="bg-neutral-800 p-2.5 rounded-lg border border-neutral-700">
                                                                    <span className="text-neutral-400 block text-[10px] uppercase">Sample Rate</span>
                                                                    <span className="font-bold text-white">{qcData[sampleKey].sampleRate || '48000'} Hz</span>
                                                                </div>
                                                                <div className="bg-neutral-800 p-2.5 rounded-lg border border-neutral-700">
                                                                    <span className="text-neutral-400 block text-[10px] uppercase">Peak Amplitude</span>
                                                                    <span className="font-bold text-white">{qcData[sampleKey].peakDbfs ? `${qcData[sampleKey].peakDbfs} dBFS` : 'N/A'}</span>
                                                                </div>
                                                                <div className="bg-neutral-800 p-2.5 rounded-lg border border-neutral-700">
                                                                    <span className="text-neutral-400 block text-[10px] uppercase">SNR Floor</span>
                                                                    <span className="font-bold text-white">{qcData[sampleKey].snr ? `${qcData[sampleKey].snr} dB` : 'N/A'}</span>
                                                                </div>
                                                            </div>
                                                            {qcData[sampleKey].spectrogramBase64 && (
                                                                <div>
                                                                    <span className="text-xs text-neutral-400 font-semibold block mb-1">Spectrogram:</span>
                                                                    <img 
                                                                        src={`data:image/png;base64,${qcData[sampleKey].spectrogramBase64}`} 
                                                                        alt="Spectrogram" 
                                                                        onClick={() => setLightboxSrc(qcData[sampleKey].spectrogramBase64)}
                                                                        className="w-full h-36 object-cover rounded-lg border border-neutral-700 cursor-zoom-in hover:opacity-90"
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-neutral-400 text-center py-4">
                                                            <span>No QC data available. </span>
                                                            <button 
                                                                onClick={() => runQC(selectedApplicantModal.userId, selectedApplicantModal.appId, idx)}
                                                                className="text-warning-400 hover:underline font-bold ml-1"
                                                            >
                                                                Run QC Analysis Now
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                });
                            })()}
                        </div>

                        {/* Modal Footer (Approve / Reject Action Bar) */}
                        <div className="p-5 bg-neutral-800/90 border-t border-neutral-700 flex items-center justify-between gap-4">
                            <div className="text-xs text-neutral-400">
                                Status: <b className="text-white capitalize">{selectedApplicantModal.status}</b>
                            </div>
                            <div className="flex items-center gap-3">
                                {selectedApplicantModal.status === "pending" && (
                                    <>
                                        <button
                                            onClick={() => act(selectedApplicantModal.userId, selectedApplicantModal.appId, "approve")}
                                            disabled={!!actionLoading}
                                            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg disabled:opacity-50"
                                        >
                                            <Check className="w-4 h-4" />
                                            <span>Approve Applicant</span>
                                        </button>
                                        <button
                                            onClick={() => act(selectedApplicantModal.userId, selectedApplicantModal.appId, "reject")}
                                            disabled={!!actionLoading}
                                            className="px-5 py-2.5 bg-rose-900/80 hover:bg-rose-800 text-rose-200 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg disabled:opacity-50"
                                        >
                                            <XCircle className="w-4 h-4" />
                                            <span>Reject Applicant</span>
                                        </button>
                                    </>
                                )}
                                <button
                                    onClick={() => setSelectedApplicantModal(null)}
                                    className="px-4 py-2.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded-xl text-xs font-semibold"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
                            className="max-w-full max-h-[80vh] object-contain rounded-xl border border-neutral-700 shadow-2xl"
                        />
                        <div className="mt-4 text-xs font-semibold text-neutral-300 bg-neutral-900/90 px-4 py-2 rounded-full border border-neutral-800 uppercase tracking-wider flex items-center gap-1.5 shadow-lg">
                            <span>📊 Zoomed Spectrogram Plot (Click anywhere to close)</span>
                        </div>
                    </div>
                </div>
            )}
            {/* ========================================================================= */}
            {/* AUDIO FILE NAMING DIALOG MODAL                                           */}
            {/* ========================================================================= */}
            {namingModalOpen && namingTarget && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
                    <div className="bg-neutral-900 border border-neutral-700 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col space-y-0">
                        {/* Header */}
                        <div className="p-6 bg-gradient-to-r from-neutral-800 to-neutral-850 border-b border-neutral-700 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-warning-500/20 border border-warning-500/40 flex items-center justify-center text-warning-400">
                                    <Tag className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <span>Audio Naming Format</span>
                                        <span className="text-xs bg-neutral-800 text-neutral-300 font-mono px-2 py-0.5 rounded border border-neutral-700">
                                            {namingTarget.type === "zip" ? "ZIP Archive" : "Single WAV"}
                                        </span>
                                    </h3>
                                    <p className="text-xs text-neutral-400 mt-0.5">
                                        Choose how to name the audio file(s) via sample metadata keys
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setNamingModalOpen(false)}
                                className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded-xl transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
                            {/* Presets Grid */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                                    Naming Preset
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    {[
                                        { id: "emotion", label: "By Emotion Tag", desc: "e.g. shocked.wav, surprised.wav", pattern: "{emotion}" },
                                        { id: "phraseId", label: "By Phrase / ID Tag", desc: "e.g. sample_1.wav, PHR_101.wav", pattern: "{phraseId}" },
                                        { id: "speaker_emotion", label: "Speaker + Emotion", desc: "e.g. SPK001_shocked.wav", pattern: "{speakerId}_{emotion}" },
                                        { id: "speaker_phraseId", label: "Speaker + Phrase ID", desc: "e.g. SPK001_sample_1.wav", pattern: "{speakerId}_{phraseId}" },
                                        { id: "full", label: "Full System Metadata", desc: "e.g. SPK_Comp_Lang_1_shocked.wav", pattern: "{speakerId}_{company}_{language}_sample_{sampleIndex}_{emotion}" },
                                        { id: "custom", label: "Custom Template", desc: "Build your own pattern", pattern: customPattern },
                                    ].map((p) => (
                                        <button
                                            key={p.id}
                                            onClick={() => {
                                                setNamingPreset(p.id);
                                                if (p.id !== "custom") {
                                                    setCustomPattern(p.pattern);
                                                }
                                            }}
                                            className={`text-left p-3 rounded-2xl border transition-all ${
                                                namingPreset === p.id
                                                    ? "bg-warning-500/15 border-warning-500 text-white shadow-lg shadow-warning-500/10"
                                                    : "bg-neutral-800/60 border-neutral-700/80 text-neutral-300 hover:bg-neutral-800 hover:border-neutral-600"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-bold">{p.label}</span>
                                                {namingPreset === p.id && (
                                                    <Check className="w-3.5 h-3.5 text-warning-400" />
                                                )}
                                            </div>
                                            <div className="text-[11px] text-neutral-400 font-mono truncate">
                                                {p.desc}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Custom Template Input & Variable Pills */}
                            {namingPreset === "custom" && (
                                <div className="space-y-2 bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
                                    <label className="text-xs font-bold text-neutral-300">
                                        Custom Template Expression
                                    </label>
                                    <input
                                        type="text"
                                        value={customPattern}
                                        onChange={(e) => setCustomPattern(e.target.value)}
                                        placeholder="{emotion} or {speakerId}_{emotion}"
                                        className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:border-warning-500 focus:outline-none"
                                    />
                                    <div className="pt-2">
                                        <span className="text-[11px] text-neutral-400 block mb-1.5 font-medium">Click tag variables to insert:</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {["{emotion}", "{phraseId}", "{speakerId}", "{name}", "{company}", "{language}", "{style}", "{intent}", "{speed}", "{index}"].map((v) => (
                                                <button
                                                    key={v}
                                                    type="button"
                                                    onClick={() => setCustomPattern((prev) => `${prev ? prev + "_" : ""}${v}`)}
                                                    className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-warning-400 text-[11px] font-mono rounded-lg transition-colors"
                                                >
                                                    +{v}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Live Output Preview */}
                            <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800 space-y-2">
                                <div className="flex items-center justify-between text-xs text-neutral-400 font-bold uppercase tracking-wider">
                                    <span>Live Output Preview</span>
                                    <span className="text-warning-400 font-mono lowercase">.wav format</span>
                                </div>

                                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                                    {namingTarget.type === "single" ? (
                                        <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-neutral-900/90 border border-neutral-800 px-3 py-2 rounded-xl">
                                            <FileAudio className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                                            <span className="truncate">{formatSampleFilename(getPatternForPreset(namingPreset, customPattern), namingTarget.app, namingTarget.sample, namingTarget.sampleIndex || 0)}</span>
                                        </div>
                                    ) : (
                                        (() => {
                                            const samples = namingTarget.app?.sampleRecordings && namingTarget.app.sampleRecordings.length > 0
                                                ? namingTarget.app.sampleRecordings
                                                : [{ sampleIndex: 0, phraseId: "sample_1" }];

                                            return samples.map((s, idx) => {
                                                const previewName = formatSampleFilename(getPatternForPreset(namingPreset, customPattern), namingTarget.app, s, idx);
                                                return (
                                                    <div key={idx} className="flex items-center gap-2 text-xs font-mono text-neutral-300 bg-neutral-900/90 border border-neutral-800/80 px-3 py-1.5 rounded-xl">
                                                        <span className="text-neutral-500 text-[10px]">#{idx + 1}</span>
                                                        <FileAudio className="w-3.5 h-3.5 text-warning-400 flex-shrink-0" />
                                                        <span className="text-white truncate">{previewName}</span>
                                                    </div>
                                                );
                                            });
                                        })()
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-6 bg-neutral-850 border-t border-neutral-700 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setNamingModalOpen(false)}
                                disabled={isExecutingDownload}
                                className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmDownload}
                                disabled={isExecutingDownload}
                                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/30 transition-all disabled:opacity-50"
                            >
                                {isExecutingDownload ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                        <span>Downloading...</span>
                                    </>
                                ) : (
                                    <>
                                        <Download className="w-4 h-4" />
                                        <span>Download {namingTarget.type === "zip" ? "ZIP Archive" : "WAV File"}</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
