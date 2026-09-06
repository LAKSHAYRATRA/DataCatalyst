import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import AdminNav from "../components/AdminNav.jsx";
import {
  ArrowLeft,
  Building2,
  Building,
  Globe,
  Loader2,
  Users,
  ChevronRight,
  BarChart3,
  Search,
  CheckCircle,
  Clock,
  XCircle,
  Layers,
  Sparkles,
  TrendingUp,
  DollarSign,
  User,
  ShieldCheck,
  Check,
  Percent,
  FileText
} from "lucide-react";
import Swal from "sweetalert2";
import { apiGet } from "../lib/api.js";

export default function AdminVendorAnalytics() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [analyticsData, setAnalyticsData] = useState(null);

  // Selected Project & Language from URL query params (or defaults)
  const selectedProjectId = searchParams.get("project") || null;
  const selectedLangCode = searchParams.get("lang") || null;

  // Search & Status Tab State for Screen 1 & Screen 2/3
  const [projectSearch, setProjectSearch] = useState("");
  const [userTab, setUserTab] = useState("approved"); // "approved" | "pending" | "rejected" | "all"
  const [userSearch, setUserSearch] = useState("");

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true);
      try {
        const res = await apiGet(`/api/admin/vendors/${id}/analytics`);
        setAnalyticsData(res);
      } catch (err) {
        console.error("Failed to load vendor analytics:", err);
        Swal.fire({
          icon: "error",
          title: "Analytics Failed",
          text: err.message || "Failed to load vendor performance analytics.",
          background: "#171717",
          color: "#fff"
        });
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      fetchAnalytics();
    }
  }, [id]);

  const vendor = analyticsData?.vendor || null;
  const summary = analyticsData?.summary || {};
  const projects = analyticsData?.projects || [];

  // Active Project if selected
  const activeProject = selectedProjectId
    ? projects.find((p) => String(p.subprojectId) === String(selectedProjectId)) || null
    : null;

  // Active Language if selected, or default to first language of active project
  const projectLanguages = activeProject?.languages || [];
  const activeLanguage = selectedLangCode
    ? projectLanguages.find((l) => l.language.toLowerCase() === selectedLangCode.toLowerCase()) || projectLanguages[0]
    : projectLanguages[0] || null;

  // Handler for selecting a project
  const handleSelectProject = (subprojectId) => {
    setSearchParams({ project: subprojectId });
    setUserTab("approved");
    setUserSearch("");
  };

  // Handler for going back to Projects screen
  const handleBackToProjects = () => {
    setSearchParams({});
    setUserSearch("");
  };

  // Handler for selecting a language
  const handleSelectLanguage = (langCode) => {
    setSearchParams({ project: selectedProjectId, lang: langCode });
    setUserTab("approved");
    setUserSearch("");
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex text-white transition-colors duration-300">
      <AdminNav />
      <main className="flex-1 md:ml-64 p-6 md:p-8 max-w-7xl mx-auto text-neutral-100">
        {loading ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl text-center py-24 shadow-xl">
            <Loader2 className="w-10 h-10 animate-spin text-primary-500 mx-auto mb-4" />
            <p className="text-neutral-400 text-sm">Aggregating vendor projects, allocated languages, and contributor quality data...</p>
          </div>
        ) : !vendor ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl text-center py-20 shadow-xl">
            <XCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
            <h3 className="text-xl font-bold text-white">Vendor Not Found</h3>
            <p className="text-neutral-400 text-sm mt-1 mb-6">The requested vendor account does not exist or has been removed.</p>
            <button
              onClick={() => navigate("/admin/vendors")}
              className="btn btn-sm bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl px-4 py-2"
            >
              Back to Vendors
            </button>
          </div>
        ) : !activeProject ? (
          /* ═════════════════════════════════════════════════════════════════════════
             SCREEN 1: PROJECTS ASSIGNED TO THIS VENDOR (Company Workload Style)
             ═════════════════════════════════════════════════════════════════════════ */
          <div className="space-y-8">
            {/* Header Navigation */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => navigate("/admin/vendors")}
                  className="btn btn-sm bg-neutral-900 hover:bg-neutral-850 text-neutral-200 border border-neutral-800 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to Vendors
                </button>
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-primary-600/20 text-primary-400 border border-primary-500/30">
                      {vendor.vendorCode}
                    </span>
                    {vendor.isStudio ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase px-2.5 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm shadow-purple-900/30">
                        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                        Studio Partner
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase px-2.5 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm shadow-blue-900/30">
                        <Building className="w-3.5 h-3.5 text-blue-400" />
                        Normal Vendor
                      </span>
                    )}
                    <h1 className="text-2xl md:text-3xl font-black text-white flex items-center gap-2.5">
                      {vendor.name} — Performance Analytics
                    </h1>
                  </div>
                  <p className="text-xs text-neutral-400 mt-1">
                    Select an assigned project below to inspect its allocated languages and contributor quality roster.
                  </p>
                </div>
              </div>
            </div>

            {/* Whole Vendor Collection Overview Banner */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
              <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary-400" />
                Vendor Overview Across All Projects
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="bg-neutral-850 border border-neutral-800 p-3.5 rounded-xl">
                  <span className="text-[11px] text-neutral-400 font-medium block uppercase tracking-wider">Assigned Projects</span>
                  <div className="text-2xl font-black text-white mt-1">{summary.totalAssignedProjects || projects.length}</div>
                  <span className="text-[10px] text-neutral-400 mt-0.5 block">{summary.totalActiveLanguages || 0} active languages</span>
                </div>

                <div className="bg-neutral-850 border border-neutral-800 p-3.5 rounded-xl">
                  <span className="text-[11px] text-emerald-400 font-medium block uppercase tracking-wider">Delivered Audio</span>
                  <div className="text-2xl font-black text-emerald-400 mt-1">
                    {(summary.totalApprovedHours || 0).toFixed(1)} <span className="text-xs font-normal text-neutral-400">hrs</span>
                  </div>
                  <span className="text-[10px] text-emerald-500/80 mt-0.5 block">{summary.totalApproved || 0} approved tasks</span>
                </div>

                <div className="bg-neutral-850 border border-neutral-800 p-3.5 rounded-xl">
                  <span className="text-[11px] text-emerald-300 font-medium block uppercase tracking-wider">Approval Rate</span>
                  <div className="text-2xl font-black text-emerald-300 mt-1">
                    {summary.overallApprovalRating !== null ? `${summary.overallApprovalRating}%` : "—"}
                  </div>
                  <span className="text-[10px] text-neutral-400 mt-0.5 block">QA Verified</span>
                </div>

                <div className="bg-neutral-850 border border-neutral-800 p-3.5 rounded-xl">
                  <span className="text-[11px] text-rose-300 font-medium block uppercase tracking-wider">Rejection Rate</span>
                  <div className={`text-2xl font-black mt-1 ${(summary.overallRejectionRating || 0) > 15 ? "text-rose-400" : "text-neutral-200"}`}>
                    {summary.overallRejectionRating !== null ? `${summary.overallRejectionRating}%` : "—"}
                  </div>
                  <span className="text-[10px] text-rose-400/80 mt-0.5 block">{summary.totalRejected || 0} rejected tasks</span>
                </div>

                <div className="bg-neutral-850 border border-neutral-800 p-3.5 rounded-xl">
                  <span className="text-[11px] text-amber-400 font-medium block uppercase tracking-wider">Pending QA</span>
                  <div className="text-2xl font-black text-amber-400 mt-1">{summary.totalPending || 0}</div>
                  <span className="text-[10px] text-amber-500/80 font-semibold mt-0.5 block">Awaiting review</span>
                </div>

                <div className="bg-neutral-850 border border-neutral-800 p-3.5 rounded-xl">
                  <span className="text-[11px] font-medium block uppercase tracking-wider text-purple-300">
                    {vendor.isStudio ? "Est. Studio Margin" : "Est. Vendor Margin"}
                  </span>
                  <div className={`text-2xl font-black mt-1 ${vendor.isStudio ? "text-purple-400" : "text-amber-400"}`}>
                    ${(summary.totalEstimatedMargin || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span className="text-[10px] text-neutral-400 mt-0.5 block">
                    {vendor.isStudio ? `$${(summary.totalArtistPayout || 0).toFixed(2)} to artists` : "Direct verified margin"}
                  </span>
                </div>
              </div>
            </div>

            {/* Assigned Projects Grid */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2 text-white">
                    <Layers className="w-5 h-5 text-primary-500" />
                    Assigned Projects ({projects.length})
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Click any project card to view its allocated languages and contributor breakdown.
                  </p>
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search assigned project..."
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    className="bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 text-xs rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 w-full"
                  />
                </div>
              </div>

              {projects.length === 0 ? (
                <div className="bg-neutral-800 border border-neutral-700 rounded-2xl text-center py-20 shadow-xl">
                  <FileText className="w-12 h-12 text-neutral-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2 text-white">No Assigned Projects Found</h3>
                  <p className="text-neutral-400 text-xs mb-6 max-w-sm mx-auto">
                    This vendor has not been assigned any call, scripted, or phrase projects yet.
                  </p>
                  <button
                    onClick={() => navigate("/admin/vendors")}
                    className="btn btn-primary btn-sm inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold rounded-xl cursor-pointer"
                  >
                    Assign Projects Now
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {projects
                    .filter((p) => {
                      if (!projectSearch.trim()) return true;
                      const q = projectSearch.toLowerCase();
                      return (
                        p.subprojectName?.toLowerCase().includes(q) ||
                        p.category?.toLowerCase().includes(q) ||
                        p.categoryLabel?.toLowerCase().includes(q)
                      );
                    })
                    .map((proj) => {
                      const hasAudits = proj.totalAudited > 0;

                      return (
                        <div
                          key={proj.subprojectId}
                          onClick={() => handleSelectProject(proj.subprojectId)}
                          className="relative overflow-hidden rounded-3xl p-6 transition-all duration-300 flex flex-col justify-between shadow-xl border bg-gradient-to-br from-neutral-900 via-neutral-900/90 to-amber-950/30 border-amber-500/40 hover:border-amber-400/80 shadow-amber-500/5 cursor-pointer group space-y-4"
                        >
                          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-amber-500/20 transition-all" />
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <span
                                className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-md border ${
                                  proj.category === "call"
                                    ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                    : proj.category === "scripted_call"
                                    ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                }`}
                              >
                                {proj.categoryLabel || proj.category}
                              </span>
                              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-neutral-900 border border-neutral-700 text-neutral-300 flex items-center gap-1">
                                <Globe className="w-3.5 h-3.5 text-primary-400" />
                                {proj.languages?.length || 0} Languages
                              </span>
                            </div>

                            <h3 className="text-lg font-bold text-white group-hover:text-primary-400 transition-colors">
                              {proj.subprojectName}
                            </h3>
                            <p className="text-xs text-neutral-400 mt-1">
                              <strong>{proj.totalWorkersAssigned || 0}</strong> contributors assigned •{" "}
                              <span className="text-emerald-400 font-semibold">{proj.totalApprovedHours} hrs approved</span>
                            </p>

                            <div className="flex flex-wrap gap-1.5 mt-4 text-[11px]">
                              <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-900/50 font-medium">
                                ✓ {hasAudits ? `${proj.approvalRating}% Appr.` : "No Audits"}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-900/50 font-medium">
                                ✕ {hasAudits ? `${proj.rejectionRating}% Rej.` : "0% Rej."}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-900/50 font-medium">
                                ⏳ {proj.totalPendingCount || 0} Pending
                              </span>
                            </div>
                          </div>

                          <div className="pt-3 border-t border-neutral-700/80 flex items-center justify-between text-xs font-semibold text-primary-400 group-hover:text-primary-300">
                            <span>Inspect Languages & Quality</span>
                            <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ═════════════════════════════════════════════════════════════════════════
             SCREEN 2 & 3: LANGUAGES & CONTRIBUTORS DRILLDOWN (Exact Company Style)
             ═════════════════════════════════════════════════════════════════════════ */
          <div className="space-y-8">
            {/* Header Navigation */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={handleBackToProjects}
                  className="btn btn-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to Assigned Projects
                </button>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-primary-600/20 text-primary-400 border border-primary-500/30">
                      {vendor.name} ({vendor.vendorCode})
                    </span>
                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${
                        activeProject.category === "call"
                          ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                          : activeProject.category === "scripted_call"
                          ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      }`}
                    >
                      {activeProject.categoryLabel}
                    </span>
                  </div>
                  <h1 className="text-2xl md:text-3xl font-black text-white mt-1 flex items-center gap-2">
                    <Layers className="w-6 h-6 text-primary-500" />
                    {activeProject.subprojectName} — Languages & Contributors Summary
                  </h1>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Select an allocated language below to view contributor user lists (Approved, Pending, Rejected) and quality stats.
                  </p>
                </div>
              </div>
            </div>

            {/* Whole Project Overview Banner */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
              <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary-400" />
                Project Collection Overview (All Languages Assigned to Vendor)
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="bg-neutral-850 border border-neutral-800 p-3.5 rounded-xl">
                  <span className="text-[11px] text-neutral-400 font-medium block uppercase tracking-wider">Allocated Languages</span>
                  <div className="text-2xl font-black text-white mt-1">{projectLanguages.length}</div>
                  <span className="text-[10px] text-neutral-400 mt-0.5 block">{activeProject.totalWorkersAssigned || 0} contributors</span>
                </div>

                <div className="bg-neutral-850 border border-neutral-800 p-3.5 rounded-xl">
                  <span className="text-[11px] text-emerald-400 font-medium block uppercase tracking-wider">Approved Duration</span>
                  <div className="text-2xl font-black text-emerald-400 mt-1">
                    {activeProject.totalApprovedHours} <span className="text-xs font-normal text-neutral-400">hrs</span>
                  </div>
                  <span className="text-[10px] text-emerald-500/80 mt-0.5 block">{activeProject.totalApprovedCount} phrases / tasks</span>
                </div>

                <div className="bg-neutral-850 border border-neutral-800 p-3.5 rounded-xl">
                  <span className="text-[11px] text-emerald-300 font-medium block uppercase tracking-wider">Approval Rate</span>
                  <div className="text-2xl font-black text-emerald-300 mt-1">
                    {activeProject.approvalRating !== null ? `${activeProject.approvalRating}%` : "—"}
                  </div>
                  <span className="text-[10px] text-neutral-400 mt-0.5 block">QA Verified</span>
                </div>

                <div className="bg-neutral-850 border border-neutral-800 p-3.5 rounded-xl">
                  <span className="text-[11px] text-rose-300 font-medium block uppercase tracking-wider">Rejection Rate</span>
                  <div className={`text-2xl font-black mt-1 ${(activeProject.rejectionRating || 0) > 15 ? "text-rose-400" : "text-neutral-200"}`}>
                    {activeProject.rejectionRating !== null ? `${activeProject.rejectionRating}%` : "—"}
                  </div>
                  <span className="text-[10px] text-rose-400/80 mt-0.5 block">{activeProject.totalRejectedCount} rejected tasks</span>
                </div>

                <div className="bg-neutral-850 border border-neutral-800 p-3.5 rounded-xl">
                  <span className="text-[11px] text-amber-400 font-medium block uppercase tracking-wider">Pending Duration</span>
                  <div className="text-2xl font-black text-amber-400 mt-1">{activeProject.totalPendingCount}</div>
                  <span className="text-[10px] text-amber-500/80 font-semibold mt-0.5 block">Awaiting QA audit</span>
                </div>

                <div className="bg-neutral-850 border border-neutral-800 p-3.5 rounded-xl">
                  <span className="text-[11px] font-medium block uppercase tracking-wider text-purple-300">
                    {vendor.isStudio ? "Est. Studio Margin" : "Est. Vendor Margin"}
                  </span>
                  <div className={`text-2xl font-black mt-1 ${vendor.isStudio ? "text-purple-400" : "text-amber-400"}`}>
                    ${(activeProject.totalEstimatedMargin || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span className="text-[10px] text-neutral-400 mt-0.5 block">
                    {vendor.isStudio ? `$${(activeProject.totalArtistPayout || 0).toFixed(2)} to artists` : "Direct verified margin"}
                  </span>
                </div>
              </div>
            </div>

            {/* Workload Languages Cards (Exact Company Style) */}
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2 text-white mb-4">
                <Globe className="w-5 h-5 text-primary-500" />
                Workload Languages Allocated ({projectLanguages.length})
              </h2>

              {projectLanguages.length === 0 ? (
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl text-center py-16">
                  <Globe className="w-10 h-10 text-neutral-500 mx-auto mb-2" />
                  <p className="text-sm text-neutral-400">No languages configured for this project assignment.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {projectLanguages.map((lang) => {
                    const isSelected = activeLanguage?.language.toLowerCase() === lang.language.toLowerCase();
                    const hasLangAudits = lang.totalAudited > 0;

                    return (
                      <div
                        key={lang.language}
                        onClick={() => handleSelectLanguage(lang.language)}
                        className={`relative overflow-hidden rounded-3xl p-6 transition-all duration-300 shadow-xl border flex flex-col justify-between cursor-pointer group ${
                          isSelected
                            ? "bg-gradient-to-br from-neutral-900 via-neutral-900/90 to-primary-950/40 border-primary-500/80 ring-2 ring-primary-500/30 shadow-primary-500/10"
                            : "bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 hover:to-neutral-800/80 border-neutral-800 hover:border-neutral-700"
                        }`}
                      >
                        <div className={`absolute top-0 right-0 w-28 h-28 rounded-full blur-2xl pointer-events-none transition-all ${isSelected ? "bg-primary-500/15" : "bg-neutral-700/10 group-hover:bg-primary-500/10"}`} />
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <div className="w-10 h-10 rounded-xl bg-neutral-800 text-primary-400 flex items-center justify-center font-bold text-sm border border-neutral-700">
                              {lang.language.substring(0, 2).toUpperCase()}
                            </div>
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-neutral-950 border border-neutral-800 text-neutral-300 flex items-center gap-1">
                              <Users className="w-3.5 h-3.5 text-primary-400" />
                              {lang.workerCount || 0} Bande
                            </span>
                          </div>

                          <h3 className="text-lg font-bold text-white">
                            {lang.languageLabel || lang.language}
                          </h3>
                          <p className="text-xs text-neutral-400 mt-0.5">
                            {lang.totalApprovedHours} hrs approved •{" "}
                            <span className="text-emerald-400 font-medium">${lang.projectRate}/hr base</span>
                          </p>

                          <div className="flex flex-wrap gap-1.5 mt-3 text-[11px]">
                            <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-900/50 font-medium">
                              ✓ {hasLangAudits ? `${lang.approvalRating}% Appr.` : "No Audits"}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-900/50 font-medium">
                              ✕ {hasLangAudits ? `${lang.rejectionRating}% Rej.` : "0% Rej."}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-900/50 font-medium">
                              ⏳ {lang.totalPendingCount}
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-neutral-700/80 flex items-center justify-between text-xs font-semibold text-primary-400">
                          <span>{isSelected ? "Active View" : "Select Language"}</span>
                          <ChevronRight className={`w-4 h-4 transform transition-transform ${isSelected ? "rotate-90" : ""}`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Selected Language Detail & Contributors List (Exact Company Style) */}
            {activeLanguage && (
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-4">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <BarChart3 className="w-6 h-6 text-primary-500" />
                      Contributor Quality Roster & Status
                      <span className="text-primary-400 font-semibold">— {activeLanguage.languageLabel || activeLanguage.language}</span>
                    </h2>
                    <p className="text-xs text-neutral-400 mt-1">
                      Showing detailed contributor user lists for {activeLanguage.languageLabel || activeLanguage.language} in {activeProject.subprojectName}.
                    </p>
                  </div>
                </div>

                {/* Language Specific KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="bg-neutral-850 border border-neutral-800 p-3.5 rounded-xl">
                    <span className="text-[11px] text-neutral-400 font-medium block">Delivered Audio</span>
                    <div className="text-base font-bold text-white mt-1">{activeLanguage.totalApprovedHours} hrs</div>
                    <span className="text-[10px] text-neutral-400 font-normal block mt-0.5">{activeLanguage.totalApprovedCount} approved tasks</span>
                  </div>

                  <div className="bg-neutral-850 border border-neutral-800 p-3.5 rounded-xl">
                    <span className="text-[11px] text-emerald-400 font-medium block">Approved Tasks</span>
                    <div className="text-base font-bold text-emerald-400 mt-1">{activeLanguage.totalApprovedCount}</div>
                    <span className="text-[10px] text-emerald-500/80 font-normal block mt-0.5">QA Accepted</span>
                  </div>

                  <div className="bg-neutral-850 border border-neutral-800 p-3.5 rounded-xl">
                    <span className="text-[11px] text-rose-400 font-medium block">Rejected Tasks</span>
                    <div className="text-base font-bold text-rose-400 mt-1">{activeLanguage.totalRejectedCount}</div>
                    <span className="text-[10px] text-rose-500/80 font-normal block mt-0.5">Quality Failures</span>
                  </div>

                  <div className="bg-neutral-850 border border-neutral-800 p-3.5 rounded-xl">
                    <span className="text-[11px] text-amber-400 font-medium block">Pending Tasks</span>
                    <div className="text-base font-bold text-amber-400 mt-1">{activeLanguage.totalPendingCount}</div>
                    <span className="text-[10px] text-amber-500/80 font-semibold block mt-0.5">In QA Queue</span>
                  </div>

                  <div className="bg-neutral-850 border border-neutral-800 p-3.5 rounded-xl">
                    <span className="text-[11px] text-emerald-300 font-medium block">Approval Rate</span>
                    <div className="text-base font-bold text-emerald-300 mt-1">
                      {activeLanguage.approvalRating !== null ? `${activeLanguage.approvalRating}%` : "—"}
                    </div>
                    <span className="text-[10px] text-neutral-400 font-normal block mt-0.5">Evaluated</span>
                  </div>

                  <div className="bg-neutral-850 border border-neutral-800 p-3.5 rounded-xl">
                    <span className="text-[11px] text-rose-300 font-medium block">Rejection Rate</span>
                    <div className="text-base font-bold text-rose-300 mt-1">
                      {activeLanguage.rejectionRating !== null ? `${activeLanguage.rejectionRating}%` : "0%"}
                    </div>
                    <span className="text-[10px] text-neutral-400 font-normal block mt-0.5">Evaluated</span>
                  </div>
                </div>

                {/* Contributors User Lists Tabs (Approved, Pending, Rejected, All) */}
                <div className="pt-4 border-t border-neutral-800">
                  {(() => {
                    const allContribs = activeLanguage.contributors || [];
                    const approvedUsers = allContribs.filter((c) => c.approvedCount > 0);
                    const pendingUsers = allContribs.filter((c) => c.pendingCount > 0);
                    const rejectedUsers = allContribs.filter((c) => c.rejectedCount > 0);

                    const activeList =
                      userTab === "approved"
                        ? approvedUsers
                        : userTab === "pending"
                        ? pendingUsers
                        : userTab === "rejected"
                        ? rejectedUsers
                        : allContribs;

                    const filteredContribs = activeList.filter((c) => {
                      if (!userSearch.trim()) return true;
                      const q = userSearch.toLowerCase();
                      return (
                        c.name?.toLowerCase().includes(q) ||
                        c.email?.toLowerCase().includes(q) ||
                        c.speaker_id?.toLowerCase().includes(q) ||
                        c.username?.toLowerCase().includes(q)
                      );
                    });

                    return (
                      <div className="space-y-4">
                        {/* Tab Buttons & Search */}
                        <div className="flex items-center justify-between border-b border-neutral-800 pb-3 gap-4 flex-wrap">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => setUserTab("approved")}
                              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                                userTab === "approved"
                                  ? "bg-emerald-600 text-white"
                                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-750 border border-neutral-700"
                              }`}
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              Approved Contributors ({approvedUsers.length})
                            </button>

                            <button
                              onClick={() => setUserTab("pending")}
                              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                                userTab === "pending"
                                  ? "bg-amber-600 text-white"
                                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-750 border border-neutral-700"
                              }`}
                            >
                              <Clock className="w-3.5 h-3.5" />
                              Pending Contributors ({pendingUsers.length})
                            </button>

                            <button
                              onClick={() => setUserTab("rejected")}
                              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                                userTab === "rejected"
                                  ? "bg-red-600 text-white"
                                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-750 border border-neutral-700"
                              }`}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Rejected Contributors ({rejectedUsers.length})
                            </button>

                            <button
                              onClick={() => setUserTab("all")}
                              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                                userTab === "all"
                                  ? "bg-primary-600 text-white"
                                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-750 border border-neutral-700"
                              }`}
                            >
                              <Users className="w-3.5 h-3.5" />
                              All Enrolled Bande ({allContribs.length})
                            </button>
                          </div>

                          <div className="relative min-w-[260px]">
                            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              placeholder="Search by name, email, speaker_id..."
                              value={userSearch}
                              onChange={(e) => setUserSearch(e.target.value)}
                              className="bg-neutral-850 border border-neutral-700 text-white placeholder-neutral-500 text-xs rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 w-full"
                            />
                          </div>
                        </div>

                        {/* Table */}
                        {filteredContribs.length === 0 ? (
                          <div className="text-center py-12 text-neutral-400 text-sm">
                            No {userTab} contributors found for {activeLanguage.languageLabel || activeLanguage.language}.
                          </div>
                        ) : (
                          <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900">
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead className="bg-neutral-850 text-neutral-300 uppercase tracking-wider font-semibold text-[11px]">
                                  <tr>
                                    <th className="px-4 py-2.5 text-left">Speaker ID</th>
                                    <th className="px-4 py-2.5 text-left">Contributor ("Banda")</th>
                                    <th className="px-4 py-2.5 text-left">Approved Dur.</th>
                                    <th className="px-4 py-2.5 text-left">Rejected Tasks</th>
                                    <th className="px-4 py-2.5 text-left">Pending Tasks</th>
                                    <th className="px-4 py-2.5 text-center">Approval %</th>
                                    <th className="px-4 py-2.5 text-center">Rejection %</th>
                                    <th className="px-4 py-2.5 text-left">
                                      {vendor.isStudio ? "Artist Rate / Studio Split" : "Payrate & Margin"}
                                    </th>
                                    <th className="px-4 py-2.5 text-left">Payment Setup</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-800">
                                  {filteredContribs.map((c) => {
                                    const hasUserAudits = c.totalAudited > 0;

                                    return (
                                      <tr key={c.userId} className="hover:bg-neutral-850/80 transition-colors">
                                        {/* Speaker ID */}
                                        <td className="px-4 py-2.5">
                                          <div className="font-mono text-primary-400 font-bold text-xs bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800 inline-block">
                                            {c.speaker_id || "N/A"}
                                          </div>
                                        </td>

                                        {/* Contributor Name & Contact */}
                                        <td className="px-4 py-2.5">
                                          <div className="font-bold text-white flex items-center gap-1.5">
                                            <User className="w-3.5 h-3.5 text-neutral-400" />
                                            <span>{c.name}</span>
                                          </div>
                                          <div className="text-[11px] text-neutral-400">{c.email}</div>
                                          {c.mobileNumber && c.mobileNumber !== "N/A" && (
                                            <div className="text-[10px] text-neutral-500 font-mono">{c.mobileNumber}</div>
                                          )}
                                        </td>

                                        {/* Approved Duration */}
                                        <td className="px-4 py-2.5">
                                          <div className="font-bold text-emerald-400">{c.approvedHours} hrs</div>
                                          <div className="text-[10px] text-neutral-400">{c.approvedCount} approved phrases</div>
                                        </td>

                                        {/* Rejected Tasks */}
                                        <td className="px-4 py-2.5">
                                          <div className={`font-bold ${c.rejectedCount > 0 ? "text-rose-400" : "text-neutral-400"}`}>
                                            {c.rejectedCount}
                                          </div>
                                          <div className="text-[10px] text-neutral-500">rejected</div>
                                        </td>

                                        {/* Pending Tasks */}
                                        <td className="px-4 py-2.5">
                                          <div className={`font-bold ${c.pendingCount > 0 ? "text-amber-400" : "text-neutral-400"}`}>
                                            {c.pendingCount}
                                          </div>
                                          <div className="text-[10px] text-neutral-500">pending QA</div>
                                        </td>

                                        {/* Approval % */}
                                        <td className="px-4 py-2.5 text-center">
                                          <span
                                            className={`inline-block font-black text-xs px-2.5 py-0.5 rounded-full border ${
                                              !hasUserAudits
                                                ? "bg-neutral-800 text-neutral-400 border-neutral-700"
                                                : c.approvalRating >= 90
                                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                                : c.approvalRating >= 80
                                                ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                                : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                                            }`}
                                          >
                                            {hasUserAudits ? `${c.approvalRating}%` : "—"}
                                          </span>
                                        </td>

                                        {/* Rejection % */}
                                        <td className="px-4 py-2.5 text-center">
                                          <span
                                            className={`inline-block font-black text-xs px-2.5 py-0.5 rounded-full border ${
                                              !hasUserAudits
                                                ? "bg-neutral-800 text-neutral-400 border-neutral-800"
                                                : c.rejectionRating > 15
                                                ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                                                : "bg-neutral-800 text-neutral-300 border-neutral-800"
                                            }`}
                                          >
                                            {hasUserAudits ? `${c.rejectionRating}%` : "0%"}
                                          </span>
                                        </td>

                                        {/* Payrates & Margin */}
                                        <td className="px-4 py-2.5">
                                          {vendor.isStudio ? (
                                            <div>
                                              <div className="flex items-center gap-1">
                                                <span className="text-neutral-400 text-[10px]">Artist:</span>
                                                <span className="text-emerald-400 font-mono font-bold">${c.artistRate}/hr</span>
                                              </div>
                                              <div className="flex items-center gap-1 text-[11px] text-purple-300">
                                                <span className="text-neutral-400 text-[10px]">Studio:</span>
                                                <span className="font-mono font-bold">${c.studioMarginRate}/hr</span>
                                                <span className="text-neutral-500 text-[10px]">(${c.earnedMargin})</span>
                                              </div>
                                            </div>
                                          ) : (
                                            <div>
                                              <div className="flex items-center gap-1">
                                                <span className="text-neutral-400 text-[10px]">Worker:</span>
                                                <span className="text-emerald-400 font-mono font-bold">${c.projectRate}/hr</span>
                                              </div>
                                              <div className="flex items-center gap-1 text-[11px] text-amber-300">
                                                <span className="text-neutral-400 text-[10px]">Margin:</span>
                                                <span className="font-mono font-bold">${c.studioMarginRate}/hr</span>
                                                <span className="text-neutral-500 text-[10px]">(${c.earnedMargin})</span>
                                              </div>
                                            </div>
                                          )}
                                        </td>

                                        {/* Payment Setup */}
                                        <td className="px-4 py-2.5">
                                          {c.upiConfigured ? (
                                            <span className="text-emerald-400 font-medium flex items-center gap-1 text-[11px]">
                                              <Check className="w-3.5 h-3.5" /> Direct UPI
                                            </span>
                                          ) : (
                                            <span className="text-neutral-500 text-[11px]">Pending UPI</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
