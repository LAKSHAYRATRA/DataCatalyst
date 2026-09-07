import React, { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  FolderArchive, 
  Layers, 
  Globe, 
  Users, 
  Download, 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  ArrowLeft, 
  Search, 
  ChevronRight, 
  FileAudio, 
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Zap,
  Tag,
  Building2,
  X
} from "lucide-react";
import Swal from "sweetalert2";
import AdminNav from "../components/AdminNav.jsx";
import { apiGet } from "../lib/api.js";

const BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

export default function AdminScriptedPhraseProjects() {
  const navigate = useNavigate();

  // Data States
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Navigation State: null (Level 1: All Projects) or selected project object (Level 2: Project's Languages)
  const [selectedProject, setSelectedProject] = useState(null);

  // Download Dialog Modal State
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [downloadTarget, setDownloadTarget] = useState(null); // { project, language: null | langObj }
  const [downloadScope, setDownloadScope] = useState("approved"); // 'approved' | 'fresh' | 'recorded'
  const [downloadNamingPattern, setDownloadNamingPattern] = useState("{phraseId}");
  const [isExecutingDownload, setIsExecutingDownload] = useState(false);

  useEffect(() => {
    loadHierarchy();
  }, []);

  async function loadHierarchy() {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet("/api/admin/phrase-projects/hierarchy");
      const list = data.projects || [];
      setProjects(list);

      // If user had a project open, keep it updated
      if (selectedProject) {
        const updated = list.find(p => p.normalizedKey === selectedProject.normalizedKey);
        if (updated) setSelectedProject(updated);
      }
    } catch (e) {
      console.error("Failed to load phrase projects:", e);
      setError(e.message || "Failed to load phrase projects");
    } finally {
      setLoading(false);
    }
  }

  // Filter projects by search query (project name, company name, or running languages)
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase().trim();
    return projects.filter(p => {
      const nameMatch = (p.projectName || "").toLowerCase().includes(q);
      const companyMatch = (p.companyIds || []).some(c => String(c).toLowerCase().includes(q));
      const langMatch = (p.languages || []).some(l => 
        (l.name || "").toLowerCase().includes(q) || (l.code || "").toLowerCase().includes(q)
      );
      return nameMatch || companyMatch || langMatch;
    });
  }, [projects, searchQuery]);

  // Overall Global Aggregates across all projects
  const globalStats = useMemo(() => {
    let totalLanguages = 0;
    let totalPhrases = 0;
    let approvedPhrases = 0;
    let pendingPhrases = 0;
    let totalApprovedSeconds = 0;
    const contributorSet = new Set();
    const allLangsSet = new Set();

    projects.forEach(p => {
      totalPhrases += p.totalPhrases || 0;
      approvedPhrases += p.approvedPhrases || 0;
      pendingPhrases += p.recordedPhrases || 0;
      (p.languages || []).forEach(l => {
        allLangsSet.add(l.code);
        totalApprovedSeconds += (l.approvedDurationSeconds || 0);
      });
    });

    return {
      totalProjects: projects.length,
      totalLanguages: allLangsSet.size,
      totalPhrases,
      approvedPhrases,
      pendingPhrases,
      totalApprovedHours: Number((totalApprovedSeconds / 3600).toFixed(1))
    };
  }, [projects]);

  // Handle Opening Download Modal
  const openDownloadModal = (project, language = null) => {
    setDownloadTarget({ project, language });
    setDownloadScope(language?.freshApproved > 0 ? "fresh" : "approved");
    setDownloadNamingPattern("{phraseId}");
    setDownloadModalOpen(true);
  };

  // Execute Audio & Metadata ZIP Download
  const triggerDownload = async () => {
    if (!downloadTarget || !downloadTarget.project) return;
    const { project, language } = downloadTarget;
    setIsExecutingDownload(true);

    try {
      const isFresh = downloadScope === "fresh";
      const statusParam = downloadScope === "recorded" ? "recorded" : "approved";
      const primaryCompany = (project.companyIds && project.companyIds[0]) || project.projectName;

      let url = `${BASE}/api/admin/phrases/download-company?project=${encodeURIComponent(project.projectName)}&company=${encodeURIComponent(primaryCompany)}&status=${statusParam}`;

      if (language && language.code) {
        url += `&language=${encodeURIComponent(language.code)}`;
      }
      if (downloadNamingPattern && downloadNamingPattern.trim()) {
        url += `&namingPattern=${encodeURIComponent(downloadNamingPattern.trim())}`;
      }
      if (isFresh) {
        url += `&type=fresh_phrases&isFresh=true`;
      }

      setDownloadModalOpen(false);

      Swal.fire({
        title: "Packaging Audio Archive...",
        text: `Generating ZIP for "${project.projectName}"${language ? ` (${language.name})` : " (All Languages)"}...`,
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        let errText = "Failed to download ZIP archive";
        try {
          const json = await res.json();
          errText = json.error || errText;
        } catch {}
        throw new Error(errText);
      }

      const disposition = res.headers.get("content-disposition") || "";
      let filename = `${project.projectName}_${language ? language.code : "all_languages"}_${downloadScope}.zip`;
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);

      Swal.fire({
        icon: "success",
        title: "Download Started!",
        text: `Successfully packaged and saved ${filename}`,
        timer: 3000,
        showConfirmButton: false
      });

      // Refresh hierarchy stats to reflect downloaded counts
      loadHierarchy();
    } catch (err) {
      console.error("Download Error:", err);
      Swal.fire({
        icon: "error",
        title: "Download Failed",
        text: err.message || "An error occurred while generating download package.",
        confirmButtonColor: "#ea580c"
      });
    } finally {
      setIsExecutingDownload(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex transition-colors duration-300">
      <AdminNav />

      <main className="flex-1 md:ml-64 p-4 md:p-8 w-full max-w-[1720px] mx-auto space-y-7">
        
        {/* ========================================================================= */}
        {/* LEVEL 1: ALL SCRIPTED PHRASE PROJECTS                                     */}
        {/* ========================================================================= */}
        {!selectedProject && (
          <div className="space-y-7 animate-fade-in">
            {/* Header Banner */}
            <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 p-6 md:p-8 shadow-2xl">
              <div className="absolute top-0 right-0 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-primary-500/10 border border-primary-500/30 flex items-center justify-center text-primary-400 shadow-inner">
                      <FolderArchive className="w-6 h-6" />
                    </div>
                    <div>
                      <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                        Scripted Phrase Projects
                      </h1>
                      <p className="text-xs md:text-sm text-neutral-400 mt-1">
                        Unified project catalog grouping identical projects together. Inspect running languages and download audio archives effortlessly.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={loadHierarchy}
                    disabled={loading}
                    className="p-3 bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 text-neutral-300 hover:text-white rounded-2xl transition-all shadow-sm flex items-center gap-2 text-xs font-bold disabled:opacity-50 cursor-pointer"
                    title="Refresh hierarchy"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                  <Link
                    to="/admin/companies"
                    className="p-3 bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 text-neutral-300 hover:text-white rounded-2xl transition-all shadow-sm flex items-center gap-2 text-xs font-bold"
                  >
                    <Building2 className="w-4 h-4 text-warning-400" />
                    <span>Company Phrase Configs</span>
                  </Link>
                </div>
              </div>

              {/* Global Quick Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6 pt-6 border-t border-neutral-800/80">
                <div className="p-3.5 rounded-2xl bg-neutral-900/80 border border-neutral-800">
                  <span className="text-[10px] uppercase font-extrabold text-neutral-400 tracking-wider block">
                    Unique Projects
                  </span>
                  <span className="text-xl font-black text-white font-mono mt-1 block">
                    {globalStats.totalProjects}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-neutral-900/80 border border-neutral-800">
                  <span className="text-[10px] uppercase font-extrabold text-neutral-400 tracking-wider block">
                    Active Languages
                  </span>
                  <span className="text-xl font-black text-primary-400 font-mono mt-1 block">
                    {globalStats.totalLanguages}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-neutral-900/80 border border-neutral-800">
                  <span className="text-[10px] uppercase font-extrabold text-neutral-400 tracking-wider block">
                    Total Phrases
                  </span>
                  <span className="text-xl font-black text-neutral-200 font-mono mt-1 block">
                    {globalStats.totalPhrases.toLocaleString()}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-neutral-900/80 border border-neutral-800">
                  <span className="text-[10px] uppercase font-extrabold text-neutral-400 tracking-wider block">
                    Approved Phrases
                  </span>
                  <span className="text-xl font-black text-emerald-400 font-mono mt-1 block">
                    {globalStats.approvedPhrases.toLocaleString()}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-neutral-900/80 border border-neutral-800 col-span-2 sm:col-span-1">
                  <span className="text-[10px] uppercase font-extrabold text-neutral-400 tracking-wider block">
                    Approved Duration
                  </span>
                  <span className="text-xl font-black text-amber-400 font-mono mt-1 block">
                    {globalStats.totalApprovedHours} hrs
                  </span>
                </div>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="w-5 h-5 absolute left-4 top-3.5 text-neutral-500" />
              <input
                type="text"
                placeholder="Search projects by name, company identifier, or active language (e.g. Falcon, Hindi, Bengali)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-neutral-900/90 border border-neutral-800 text-white rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all placeholder:text-neutral-500 shadow-lg"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-3.5 text-neutral-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Projects Grid */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <div className="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
                <span className="text-sm text-neutral-400 font-medium">Aggregating project workload catalogs...</span>
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="text-center py-20 bg-neutral-900/60 border border-neutral-800 rounded-3xl p-8 space-y-3">
                <FolderArchive className="w-12 h-12 text-neutral-600 mx-auto" />
                <h3 className="text-lg font-bold text-white">No Matching Phrase Projects</h3>
                <p className="text-xs text-neutral-400 max-w-md mx-auto">
                  {searchQuery ? "No projects match your current search query." : "No phrase workloads found in database. Create a company or upload phrases to start."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProjects.map((proj) => {
                  const hasApproved = (proj.approvedPhrases || 0) > 0;
                  const hasLanguages = (proj.languages || []).length > 0;

                  return (
                    <div
                      key={proj.normalizedKey}
                      className="group relative overflow-hidden rounded-3xl border border-neutral-800 hover:border-neutral-700 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 p-6 flex flex-col justify-between transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-[1.01]"
                    >
                      <div className="absolute top-0 right-0 w-40 h-40 bg-primary-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-primary-500/10 transition-colors" />

                      <div className="relative z-10 space-y-5">
                        {/* Project Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <span className="text-[10px] font-mono uppercase font-bold text-primary-400 bg-primary-950/80 px-2 py-0.5 rounded-lg border border-primary-800/50">
                              {proj.totalLanguages} {proj.totalLanguages === 1 ? "Language" : "Languages"} Active
                            </span>
                            <h3 className="text-xl font-black text-white group-hover:text-primary-400 transition-colors leading-snug">
                              {proj.projectName}
                            </h3>
                            {proj.companyIds && proj.companyIds.length > 0 && (
                              <p className="text-[11px] text-neutral-400 font-mono truncate max-w-[280px]">
                                Companies: {proj.companyIds.join(", ")}
                              </p>
                            )}
                          </div>

                          <span className="px-2.5 py-1 rounded-xl bg-neutral-800 border border-neutral-700/80 text-[11px] font-bold text-neutral-300">
                            {proj.completionRate}% Done
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono">
                            <span>Approved: {proj.approvedPhrases.toLocaleString()}</span>
                            <span>Total: {proj.totalPhrases.toLocaleString()}</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 to-primary-500 transition-all duration-500 rounded-full"
                              style={{ width: `${Math.min(100, Math.max(0, proj.completionRate))}%` }}
                            />
                          </div>
                        </div>

                        {/* Active Languages Badges */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-500">
                            Running Languages:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {(proj.languages || []).map(l => (
                              <span
                                key={l.code}
                                className="px-2 py-1 rounded-lg bg-neutral-800/80 text-neutral-300 border border-neutral-700/60 text-xs font-semibold flex items-center gap-1"
                              >
                                <Globe className="w-3 h-3 text-primary-400" />
                                <span>{l.name}</span>
                                <span className="text-[10px] font-mono text-neutral-500">({l.approvedPhrases})</span>
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-neutral-900/80 border border-neutral-800/80 text-center font-mono">
                          <div>
                            <span className="text-[9px] uppercase text-neutral-500 block">Pending QA</span>
                            <span className="text-xs font-bold text-amber-400">{proj.recordedPhrases}</span>
                          </div>
                          <div>
                            <span className="text-[9px] uppercase text-neutral-500 block">Duration</span>
                            <span className="text-xs font-bold text-neutral-200">{proj.approvedDurationHours}h</span>
                          </div>
                          <div>
                            <span className="text-[9px] uppercase text-neutral-500 block">Contributors</span>
                            <span className="text-xs font-bold text-primary-400">{proj.contributorCount}</span>
                          </div>
                        </div>
                      </div>

                      {/* Footer Actions */}
                      <div className="relative z-10 pt-4 mt-5 border-t border-neutral-800 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedProject(proj)}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer group-hover:text-white"
                        >
                          <span>Languages ({proj.totalLanguages})</span>
                          <ChevronRight className="w-3.5 h-3.5 text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
                        </button>

                        <button
                          type="button"
                          onClick={() => openDownloadModal(proj, null)}
                          disabled={!hasApproved}
                          title={hasApproved ? "Download all approved phrases across all languages" : "No approved phrases yet"}
                          className="py-2.5 px-3.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-primary-600/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>ZIP</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* LEVEL 2: SELECTED PROJECT & RUNNING LANGUAGES BREAKDOWN                   */}
        {/* ========================================================================= */}
        {selectedProject && (
          <div className="space-y-7 animate-fade-in">
            {/* Top Navigation & Breadcrumbs */}
            <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 p-6 md:p-8 shadow-2xl">
              <div className="absolute top-0 right-0 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl pointer-events-none" />
              
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setSelectedProject(null)}
                    className="p-3 bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 text-neutral-300 hover:text-white rounded-2xl transition-all shadow-sm flex items-center gap-2 text-xs font-bold cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>All Projects</span>
                  </button>
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                        {selectedProject.projectName}
                      </h1>
                      <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg bg-primary-950/80 border border-primary-800/60 text-primary-300">
                        {selectedProject.totalLanguages} {selectedProject.totalLanguages === 1 ? "Language" : "Languages"}
                      </span>
                    </div>
                    <p className="text-xs md:text-sm text-neutral-400 mt-1">
                      Choose a language to inspect workloads, check contributor stats, or download audio packages.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => openDownloadModal(selectedProject, null)}
                    disabled={selectedProject.approvedPhrases === 0}
                    className="py-3 px-5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-primary-600/25 transition-all cursor-pointer disabled:opacity-40"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Entire Project ZIP</span>
                  </button>
                  <button
                    onClick={loadHierarchy}
                    disabled={loading}
                    className="p-3 bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 text-neutral-300 hover:text-white rounded-2xl transition-colors cursor-pointer"
                    title="Refresh language stats"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Project Metric Highlights */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-neutral-800/80 font-mono">
                <div className="p-3.5 rounded-2xl bg-neutral-900/80 border border-neutral-800">
                  <span className="text-[10px] uppercase text-neutral-500 block">Total Phrases</span>
                  <span className="text-lg font-bold text-white mt-1 block">
                    {selectedProject.totalPhrases.toLocaleString()}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-neutral-900/80 border border-neutral-800">
                  <span className="text-[10px] uppercase text-neutral-500 block">Approved Phrases</span>
                  <span className="text-lg font-bold text-emerald-400 mt-1 block">
                    {selectedProject.approvedPhrases.toLocaleString()}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-neutral-900/80 border border-neutral-800">
                  <span className="text-[10px] uppercase text-neutral-500 block">Approved Duration</span>
                  <span className="text-lg font-bold text-amber-400 mt-1 block">
                    {selectedProject.approvedDurationHours} Hours
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-neutral-900/80 border border-neutral-800">
                  <span className="text-[10px] uppercase text-neutral-500 block">Contributors</span>
                  <span className="text-lg font-bold text-primary-400 mt-1 block">
                    {selectedProject.contributorCount} Active
                  </span>
                </div>
              </div>
            </div>

            {/* Languages Grid */}
            {(!selectedProject.languages || selectedProject.languages.length === 0) ? (
              <div className="text-center py-20 bg-neutral-900/50 border border-neutral-800 rounded-3xl text-neutral-400 space-y-2">
                <Globe className="w-12 h-12 mx-auto opacity-30" />
                <h3 className="text-lg font-bold text-white">No Active Languages Detected</h3>
                <p className="text-xs">No phrase records or language configurations exist for this project yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {selectedProject.languages.map((lang) => {
                  const hasApproved = (lang.approvedPhrases || 0) > 0;
                  const hasFresh = (lang.freshApproved || 0) > 0;
                  const firstComp = (lang.companyIds && lang.companyIds[0]) || (selectedProject.companyIds && selectedProject.companyIds[0]);

                  return (
                    <div
                      key={lang.code}
                      className="group relative overflow-hidden rounded-3xl border border-neutral-800 hover:border-neutral-700 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 p-6 flex flex-col justify-between transition-all duration-300 shadow-xl hover:shadow-2xl"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/5 rounded-full blur-2xl pointer-events-none" />

                      <div className="relative z-10 space-y-5">
                        {/* Header: Language & Code */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center text-primary-400">
                              <Globe className="w-5 h-5" />
                            </div>
                            <div>
                              <h3 className="text-lg font-black text-white leading-snug">
                                {lang.name}
                              </h3>
                              <span className="text-[11px] font-mono uppercase text-neutral-400 font-bold block">
                                Code: {lang.code}
                              </span>
                            </div>
                          </div>

                          {hasFresh ? (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[10px] font-black font-mono animate-pulse">
                              {lang.freshApproved} Fresh
                            </span>
                          ) : hasApproved ? (
                            <span className="px-2.5 py-1 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-300 text-[10px] font-bold">
                              Archived
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full bg-neutral-800/60 border border-neutral-700/60 text-neutral-500 text-[10px] font-bold">
                              Pending
                            </span>
                          )}
                        </div>

                        {/* Breakdown Metrics */}
                        <div className="space-y-2 p-3.5 rounded-2xl bg-neutral-900/90 border border-neutral-800/80 text-xs font-mono">
                          <div className="flex items-center justify-between text-neutral-400">
                            <span>Approved Phrases:</span>
                            <span className="font-bold text-emerald-400">{lang.approvedPhrases.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between text-neutral-400">
                            <span>Pending QA:</span>
                            <span className="font-bold text-amber-400">{lang.recordedPhrases.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between text-neutral-400">
                            <span>Total Phrases:</span>
                            <span className="font-bold text-neutral-200">{lang.totalPhrases.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between text-neutral-400 pt-1.5 border-t border-neutral-800">
                            <span>Duration:</span>
                            <span className="font-bold text-white">{lang.approvedDurationMinutes} mins ({lang.approvedDurationHours}h)</span>
                          </div>
                          <div className="flex items-center justify-between text-neutral-400">
                            <span>Contributors:</span>
                            <span className="font-bold text-primary-400">{lang.contributorCount} Active</span>
                          </div>
                        </div>
                      </div>

                      {/* Language Action Buttons */}
                      <div className="relative z-10 pt-4 mt-5 border-t border-neutral-800 space-y-2">
                        {/* Primary Download Action */}
                        <button
                          type="button"
                          onClick={() => openDownloadModal(selectedProject, lang)}
                          disabled={!hasApproved}
                          className="w-full py-2.5 px-4 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-bold text-xs shadow-md shadow-primary-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download {lang.name} Audio ZIP</span>
                        </button>

                        {/* Secondary Links: Review & Summary */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (firstComp) {
                                navigate(`/admin/companies/${encodeURIComponent(firstComp)}/phrase-workloads/${encodeURIComponent(lang.code)}`);
                              } else {
                                navigate(`/admin/qaphrase?language=${encodeURIComponent(lang.code)}`);
                              }
                            }}
                            className="py-2 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <FileAudio className="w-3 h-3 text-primary-400" />
                            <span>Workload</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (firstComp) {
                                navigate(`/admin/companies/${encodeURIComponent(firstComp)}/contributors-summary`);
                              } else {
                                navigate(`/admin/qaphrase`);
                              }
                            }}
                            className="py-2 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Users className="w-3 h-3 text-purple-400" />
                            <span>Roster</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* DOWNLOAD OPTIONS MODAL                                                    */}
        {/* ========================================================================= */}
        {downloadModalOpen && downloadTarget && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-neutral-900 border border-neutral-700 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col p-6 space-y-6">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                <div className="flex items-center gap-2.5">
                  <Download className="w-5 h-5 text-primary-400" />
                  <div>
                    <h3 className="text-lg font-black text-white">
                      Download Audio ZIP
                    </h3>
                    <p className="text-xs text-neutral-400">
                      Project: <span className="text-white font-bold">{downloadTarget.project.projectName}</span>
                      {downloadTarget.language && (
                        <span> • Language: <span className="text-primary-400 font-bold">{downloadTarget.language.name}</span></span>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDownloadModalOpen(false)}
                  className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scope Selection */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-400 block">
                  Select Phrases Scope:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDownloadScope("approved")}
                    className={`p-3 rounded-2xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                      downloadScope === "approved"
                        ? "bg-primary-950/80 border-primary-500 text-white"
                        : "bg-neutral-800/60 border-neutral-700/80 text-neutral-300 hover:bg-neutral-800"
                    }`}
                  >
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      All Approved
                    </span>
                    <span className="text-[11px] text-neutral-400">
                      All verified & approved recordings
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDownloadScope("fresh")}
                    className={`p-3 rounded-2xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                      downloadScope === "fresh"
                        ? "bg-primary-950/80 border-primary-500 text-white"
                        : "bg-neutral-800/60 border-neutral-700/80 text-neutral-300 hover:bg-neutral-800"
                    }`}
                  >
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      Fresh Approved Only
                    </span>
                    <span className="text-[11px] text-neutral-400">
                      Not yet marked as downloaded
                    </span>
                  </button>
                </div>
              </div>

              {/* Custom Naming Pattern */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-400 block">
                  Audio Filename Pattern:
                </label>
                <input
                  type="text"
                  value={downloadNamingPattern}
                  onChange={(e) => setDownloadNamingPattern(e.target.value)}
                  placeholder="{phraseId}"
                  className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-xs font-mono text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-[11px] text-neutral-500 font-mono">
                  Supported tokens: {"{phraseId}"}, {"{speaker_id}"}, {"{language}"}, {"{emotion}"}
                </p>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setDownloadModalOpen(false)}
                  disabled={isExecutingDownload}
                  className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-neutral-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={triggerDownload}
                  disabled={isExecutingDownload}
                  className="px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 active:scale-[0.98] text-white font-bold text-xs shadow-lg shadow-primary-600/30 flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                >
                  {isExecutingDownload ? (
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>Download ZIP Package</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
