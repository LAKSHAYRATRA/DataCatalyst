import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Layers,
  Users,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  BarChart2,
  BarChart3,
  Globe,
  DollarSign,
  TrendingUp,
  Award,
  ChevronRight,
  Sparkles,
  X,
  FileText
} from "lucide-react";
import Swal from "sweetalert2";
import { apiGet } from "../lib/api.js";

function formatSecs(secs) {
  if (!secs || secs <= 0) return "0m 0s";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export default function VendorProjectSquadSummary() {
  const { subprojectId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const categoryParam = searchParams.get("category") || "";

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  // Filters
  const [squadSearchQuery, setSquadSearchQuery] = useState("");
  const [squadTabFilter, setSquadTabFilter] = useState("all"); // 'all' | 'active' | 'pending' | 'rejected'
  const [squadLangFilter, setSquadLangFilter] = useState("all");

  // Contributor Analytics Modal State
  const [selectedAnalyticsArtist, setSelectedAnalyticsArtist] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsCategoryFilter, setAnalyticsCategoryFilter] = useState("all");

  useEffect(() => {
    fetchSquadSummary();
  }, [subprojectId, categoryParam]);

  async function fetchSquadSummary() {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/vendor/projects/${subprojectId}/squad-summary${
        categoryParam ? `?category=${categoryParam}` : ""
      }`;
      const res = await apiGet(url);
      setData(res);
    } catch (err) {
      console.error("Failed to load project squad summary:", err);
      setError(err.message || "Failed to load project squad summary.");
      if (err.status === 401) {
        navigate("/vendor/login");
      }
    } finally {
      setLoading(false);
    }
  }

  // Contributor Analytics Modal
  const handleOpenAnalyticsModal = async (artist) => {
    setSelectedAnalyticsArtist(artist);
    setAnalyticsData(null);
    setLoadingAnalytics(true);
    setAnalyticsCategoryFilter("all");
    try {
      const res = await apiGet(`/api/vendor/artists/${artist._id}/analytics`);
      setAnalyticsData(res);
    } catch (err) {
      console.error("Failed to load contributor analytics:", err);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: err.message || "Failed to load contributor analytics.",
        background: "#171717",
        color: "#fff"
      });
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const project = data?.project || {};
  const overview = data?.overview || {};
  const squad = data?.squad || [];
  const isStudio = Boolean(project.isStudio);

  // Collect unique languages across project & squad
  const allLanguages = new Set();
  (project.assignedLanguages || []).forEach((l) => {
    if (l && l !== "all") allLanguages.add(String(l).toLowerCase().trim());
  });
  squad.forEach((m) => {
    (m.languages || []).forEach((l) => {
      if (l) allLanguages.add(String(l).toLowerCase().trim());
    });
  });
  const languageList = Array.from(allLanguages);

  // Filter squad list
  const filteredSquad = squad.filter((m) => {
    // Language filter
    if (squadLangFilter !== "all" && m.languages && m.languages.length > 0) {
      if (!m.languages.some((l) => l.toLowerCase() === squadLangFilter.toLowerCase())) {
        return false;
      }
    }

    // Status tab filter
    if (squadTabFilter === "active" && m.totalSubmitted === 0) return false;
    if (squadTabFilter === "pending" && m.pendingCount === 0) return false;
    if (squadTabFilter === "rejected" && m.rejectedCount === 0) return false;

    // Search filter
    if (squadSearchQuery.trim()) {
      const q = squadSearchQuery.toLowerCase();
      const matchName = (m.name || "").toLowerCase().includes(q);
      const matchSpk = (m.speaker_id || "").toLowerCase().includes(q);
      const matchEmail = (m.email || "").toLowerCase().includes(q);
      const matchUser = (m.username || "").toLowerCase().includes(q);
      if (!matchName && !matchSpk && !matchEmail && !matchUser) return false;
    }

    return true;
  });

  // Collect all rejection coaching feedback across squad members
  const allProjectRejections = [];
  squad.forEach((m) => {
    (m.rejectionComments || []).forEach((r) => {
      allProjectRejections.push({
        contributorName: m.name,
        speaker_id: m.speaker_id,
        ...r
      });
    });
  });

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans flex flex-col transition-colors duration-300">
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-30 bg-neutral-900/90 backdrop-blur-md border-b border-neutral-800 px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/vendor/dashboard")}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-neutral-800 hover:bg-neutral-750 text-neutral-200 hover:text-white border border-neutral-700/80 rounded-xl text-xs font-semibold transition-all shadow-sm group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
              <span>Back to Portal</span>
            </button>
            <div>
              <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-medium">
                <span>Vendor Portal</span>
                <ChevronRight className="w-3 h-3 text-neutral-600" />
                <span>Assigned Sub-Projects</span>
                <ChevronRight className="w-3 h-3 text-neutral-600" />
                <span className="text-purple-400 font-semibold">{project.subprojectName || "Squad Summary"}</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5 mt-0.5">
                <Layers className="w-6 h-6 text-purple-400" />
                <span>{project.subprojectName || "Project"} Squad Analytics</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {project.category && (
              <span className="text-xs uppercase font-bold tracking-wider px-2.5 py-1 rounded-lg bg-neutral-800 text-neutral-300 border border-neutral-700">
                {String(project.category).replace("_", " ").toUpperCase()}
              </span>
            )}
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-purple-950/60 text-purple-300 border border-purple-800/60">
              Base: ${Number(project.projectRate || 25).toFixed(2)}/hr
            </span>
            <button
              onClick={fetchSquadSummary}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded-xl border border-neutral-700 transition-colors disabled:opacity-50"
              title="Refresh Analytics"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {loading ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl text-center py-24 shadow-2xl space-y-4">
            <RefreshCw className="w-10 h-10 animate-spin text-purple-500 mx-auto" />
            <div>
              <h3 className="text-lg font-bold text-white">Loading Squad Analytics...</h3>
              <p className="text-xs text-neutral-400 mt-1">Aggregating contributor output, approved audio hours, and QA metrics.</p>
            </div>
          </div>
        ) : error ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl text-center py-20 shadow-2xl p-6 space-y-4">
            <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
            <h3 className="text-lg font-bold text-white">Error Loading Squad Summary</h3>
            <p className="text-xs text-rose-300 max-w-md mx-auto">{error}</p>
            <button
              onClick={fetchSquadSummary}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold rounded-xl"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* 1. Whole Project Squad Collection Overview (6 Metric Cards - Patterned after Company Phrase Configs -> Summary) */}
            <div className="relative overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 border border-neutral-800 rounded-3xl p-6 shadow-2xl">
              <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-purple-400" />
                    <span>Project Squad Collection Overview</span>
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Aggregated output & quality pass rate across all {squad.length} squad members on this project.
                  </p>
                </div>
                {isStudio ? (
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30 shadow-sm">
                    Studio Revenue Split Mode Active
                  </span>
                ) : (
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 shadow-sm">
                    Direct Contributor Fair Pay Mode
                  </span>
                )}
              </div>

              <div className="relative z-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
                {/* Card 1: Total Volume */}
                <div className="bg-gradient-to-br from-neutral-900/90 via-neutral-950 to-neutral-900/70 border border-neutral-800 p-4 rounded-2xl flex flex-col justify-between shadow-lg hover:border-neutral-700 transition-all">
                  <span className="text-[11px] text-neutral-400 font-medium block">Total Squad Output</span>
                  <div className="my-1.5">
                    <span className="text-xl font-black text-white block">
                      {formatSecs(overview.totalApprovedDurationSec + overview.totalPendingDurationSec + overview.totalRejectedDurationSec)}
                    </span>
                    <span className="text-[11px] text-neutral-400 mt-0.5 block font-mono">
                      {overview.totalDone || 0} total tasks
                    </span>
                  </div>
                  <span className="text-[10px] text-neutral-500">{overview.activeContributorsCount || 0} active contributors</span>
                </div>

                {/* Card 2: Approved Duration */}
                <div className="bg-gradient-to-br from-emerald-950/30 via-neutral-950 to-neutral-900/80 border border-emerald-500/30 p-4 rounded-2xl flex flex-col justify-between shadow-lg hover:border-emerald-500/50 transition-all">
                  <span className="text-[11px] text-emerald-400 font-medium block">Approved Volume</span>
                  <div className="my-1.5">
                    <span className="text-xl font-black text-emerald-400 block">
                      {formatSecs(overview.totalApprovedDurationSec)}
                    </span>
                    <span className="text-[11px] text-emerald-500/80 mt-0.5 block font-mono">
                      {overview.totalApproved || 0} approved tasks
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-400/80 font-mono font-semibold">
                    {overview.totalApprovedHours || 0} approved hrs
                  </span>
                </div>

                {/* Card 3: Pending Duration */}
                <div className="bg-gradient-to-br from-amber-950/30 via-neutral-950 to-neutral-900/80 border border-amber-500/30 p-4 rounded-2xl flex flex-col justify-between shadow-lg hover:border-amber-500/50 transition-all">
                  <span className="text-[11px] text-amber-400 font-medium block">Pending Review</span>
                  <div className="my-1.5">
                    <span className="text-xl font-black text-amber-400 block">
                      {formatSecs(overview.totalPendingDurationSec)}
                    </span>
                    <span className="text-[11px] text-amber-500/80 mt-0.5 block font-mono">
                      {overview.totalPending || 0} awaiting review
                    </span>
                  </div>
                  <span className="text-[10px] text-amber-500/70">In QA evaluation</span>
                </div>

                {/* Card 4: Rejected Duration */}
                <div className="bg-gradient-to-br from-rose-950/30 via-neutral-950 to-neutral-900/80 border border-rose-500/30 p-4 rounded-2xl flex flex-col justify-between shadow-lg hover:border-rose-500/50 transition-all">
                  <span className="text-[11px] text-rose-400 font-medium block">Rejected Volume</span>
                  <div className="my-1.5">
                    <span className="text-xl font-black text-rose-400 block">
                      {formatSecs(overview.totalRejectedDurationSec)}
                    </span>
                    <span className="text-[11px] text-rose-500/80 mt-0.5 block font-mono">
                      {overview.totalRejected || 0} rejected tasks
                    </span>
                  </div>
                  <span className="text-[10px] text-rose-500/70">Requires coaching</span>
                </div>

                {/* Card 5: Approval Rate */}
                <div className="bg-gradient-to-br from-teal-950/30 via-neutral-950 to-neutral-900/80 border border-teal-500/30 p-4 rounded-2xl flex flex-col justify-between shadow-lg hover:border-teal-500/50 transition-all">
                  <span className="text-[11px] text-emerald-300 font-medium block">Approval Rate</span>
                  <div className="my-1.5">
                    <span className="text-xl font-black text-emerald-300 block">
                      {overview.approvalRate ?? 0}%
                    </span>
                    <span className="text-[11px] text-neutral-400 mt-0.5 block">
                      {overview.rejectionRate ?? 0}% rejection
                    </span>
                  </div>
                  <span className="text-[10px] text-neutral-500">Evaluated audio</span>
                </div>

                {/* Card 6: Studio Margin / Economics */}
                <div className="bg-gradient-to-br from-purple-950/40 via-neutral-950 to-neutral-900/80 border border-purple-500/35 p-4 rounded-2xl flex flex-col justify-between shadow-lg hover:border-purple-500/55 transition-all">
                  <span className="text-[11px] text-purple-300 font-medium block">
                    {isStudio ? "Studio Net Margin" : "Vendor Net Margin"}
                  </span>
                  <div className="my-1.5">
                    <span className="text-xl font-black text-purple-400 block font-mono">
                      ${(overview.totalVendorMargin || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {isStudio ? (
                      <span className="text-[11px] text-neutral-400 mt-0.5 block font-mono">
                        ${overview.totalSquadEarnings || 0} to artists
                      </span>
                    ) : (
                      <span className="text-[11px] text-emerald-400 mt-0.5 block font-mono">
                        Direct margin
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-purple-400 font-semibold">Accrued balance</span>
                </div>
              </div>
            </div>

            {/* 2. Language Filter Pills (If project has multiple languages) */}
            {languageList.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <span className="text-xs text-neutral-400 font-medium shrink-0 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-purple-400" /> Filter Language:
                </span>
                <button
                  onClick={() => setSquadLangFilter("all")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                    squadLangFilter === "all"
                      ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/25"
                      : "bg-gradient-to-br from-neutral-900 to-neutral-850 text-neutral-400 hover:text-white border border-neutral-800"
                  }`}
                >
                  All Languages ({squad.length})
                </button>
                {languageList.map((lang) => {
                  const count = squad.filter((m) =>
                    m.languages?.some((l) => l.toLowerCase() === lang.toLowerCase())
                  ).length;
                  return (
                    <button
                      key={lang}
                      onClick={() => setSquadLangFilter(lang)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-all shrink-0 font-mono ${
                        squadLangFilter === lang
                          ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/25"
                          : "bg-gradient-to-br from-neutral-900 to-neutral-850 text-neutral-400 hover:text-white border border-neutral-800"
                      }`}
                    >
                      {lang} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            {/* 3. Squad Contributor Performance Breakdown Table */}
            <div className="relative overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 border border-neutral-800 rounded-3xl p-6 shadow-2xl space-y-5">
              <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
              {/* Table Filter Tabs & Search Bar */}
              <div className="relative z-10 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 border-b border-neutral-800 pb-4">
                {/* Status Tabs */}
                <div className="flex items-center gap-2 overflow-x-auto text-xs pb-1 md:pb-0">
                  <button
                    onClick={() => setSquadTabFilter("all")}
                    className={`px-3.5 py-2 rounded-xl font-bold transition-all shrink-0 ${
                      squadTabFilter === "all"
                        ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/20"
                        : "bg-gradient-to-br from-neutral-950 to-neutral-900 text-neutral-400 hover:text-white border border-neutral-800"
                    }`}
                  >
                    All Squad ({squad.length})
                  </button>
                  <button
                    onClick={() => setSquadTabFilter("active")}
                    className={`px-3.5 py-2 rounded-xl font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                      squadTabFilter === "active"
                        ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/20"
                        : "bg-gradient-to-br from-neutral-950 to-neutral-900 text-neutral-400 hover:text-white border border-neutral-800"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                    Active ({overview.activeContributorsCount || 0})
                  </button>
                  <button
                    onClick={() => setSquadTabFilter("pending")}
                    className={`px-3.5 py-2 rounded-xl font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                      squadTabFilter === "pending"
                        ? "bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md shadow-amber-600/20"
                        : "bg-gradient-to-br from-neutral-950 to-neutral-900 text-neutral-400 hover:text-white border border-neutral-800"
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-300" />
                    Pending ({squad.filter((m) => m.pendingCount > 0).length})
                  </button>
                  <button
                    onClick={() => setSquadTabFilter("rejected")}
                    className={`px-3.5 py-2 rounded-xl font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                      squadTabFilter === "rejected"
                        ? "bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-600/20"
                        : "bg-gradient-to-br from-neutral-950 to-neutral-900 text-neutral-400 hover:text-white border border-neutral-800"
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-300" />
                    With Rejections ({squad.filter((m) => m.rejectedCount > 0).length})
                  </button>
                </div>

                {/* Search Bar */}
                <div className="relative min-w-[260px]">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search squad by name, speaker ID, email..."
                    value={squadSearchQuery}
                    onChange={(e) => setSquadSearchQuery(e.target.value)}
                    className="w-full bg-neutral-950/90 border border-neutral-800 text-white text-xs rounded-xl pl-9 pr-3.5 py-2.5 focus:outline-none focus:border-purple-500 transition-colors shadow-inner"
                  />
                </div>
              </div>

              {/* Table Rendering */}
              {filteredSquad.length === 0 ? (
                <div className="py-16 text-center text-neutral-400 text-xs bg-gradient-to-br from-neutral-950/80 via-neutral-950/60 to-neutral-900/60 rounded-2xl border border-neutral-800 space-y-2 relative z-10">
                  <Users className="w-8 h-8 text-neutral-600 mx-auto" />
                  <p>No squad contributors match the selected filter criteria.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-neutral-800/80 bg-gradient-to-br from-neutral-950/90 via-neutral-950/60 to-neutral-900/80 shadow-inner relative z-10">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-950 border-b border-neutral-800 text-neutral-400 uppercase font-semibold">
                      <tr>
                        <th className="py-3.5 px-4">Speaker ID</th>
                        <th className="py-3.5 px-4">Contributor</th>
                        <th className="py-3.5 px-3">Languages</th>
                        <th className="py-3.5 px-3 text-center">Done</th>
                        <th className="py-3.5 px-3 text-center">Approved</th>
                        <th className="py-3.5 px-3 text-center">Pending</th>
                        <th className="py-3.5 px-3 text-center">Rejected</th>
                        <th className="py-3.5 px-3 text-center">Pass Rate</th>
                        {isStudio && <th className="py-3.5 px-3 text-right">Artist Payout</th>}
                        <th className="py-3.5 px-3 text-right">{isStudio ? "Studio Margin" : "Vendor Margin"}</th>
                        <th className="py-3.5 px-4 text-right">Deep Analytics</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/60">
                      {filteredSquad.map((m) => (
                        <tr key={m._id} className="hover:bg-neutral-850/50 transition-colors">
                          <td className="py-3.5 px-4">
                            <span className="font-mono font-bold text-xs text-purple-300 bg-purple-950/60 border border-purple-800/60 px-2 py-0.5 rounded-lg">
                              {m.speaker_id || "N/A"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-white">{m.name}</div>
                            <div className="text-[11px] text-neutral-400">{m.email}</div>
                          </td>
                          <td className="py-3.5 px-3 font-mono text-[11px] uppercase text-neutral-300">
                            {m.languages && m.languages.length > 0 ? (
                              m.languages.map((l) => (
                                <span
                                  key={l}
                                  className="inline-block mr-1 px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 font-medium"
                                >
                                  {l}
                                </span>
                              ))
                            ) : (
                              <span className="text-neutral-500">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-3 text-center font-mono font-bold text-white">
                            {m.totalSubmitted}
                          </td>
                          <td className="py-3.5 px-3 text-center">
                            <span className="font-mono font-bold text-emerald-400">
                              {m.approvedCount}
                            </span>
                            {m.approvedDurationSec > 0 && (
                              <span className="text-[10px] text-neutral-400 block font-mono">
                                {formatSecs(m.approvedDurationSec)}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-3 text-center font-mono font-bold text-amber-400">
                            {m.pendingCount}
                          </td>
                          <td className="py-3.5 px-3 text-center font-mono font-bold text-rose-400">
                            {m.rejectedCount}
                          </td>
                          <td className="py-3.5 px-3 text-center">
                            <span
                              className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                                m.approvalRate >= 90
                                  ? "bg-emerald-500/15 text-emerald-400"
                                  : m.approvalRate >= 80
                                  ? "bg-amber-500/15 text-amber-400"
                                  : m.totalSubmitted > 0
                                  ? "bg-rose-500/15 text-rose-400"
                                  : "text-neutral-500"
                              }`}
                            >
                              {m.totalSubmitted > 0 ? `${m.approvalRate}%` : "—"}
                            </span>
                          </td>
                          {isStudio && (
                            <td className="py-3.5 px-3 text-right font-mono">
                              <span className="text-purple-300 font-semibold">${m.artistRate}/hr</span>
                              {m.earnedAmount > 0 && (
                                <span className="text-[10px] text-neutral-400 block">
                                  ${m.earnedAmount}
                                </span>
                              )}
                            </td>
                          )}
                          <td className="py-3.5 px-3 text-right font-mono font-bold text-emerald-400">
                            ${m.marginAmount}
                            {isStudio && (
                              <span className="text-[10px] text-neutral-400 block font-normal">
                                (${m.studioRate}/hr)
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => handleOpenAnalyticsModal(m)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white rounded-xl text-xs font-semibold transition-colors border border-neutral-700 shadow-sm"
                              title="View Contributor Full Analytics"
                            >
                              <BarChart2 className="w-3.5 h-3.5 text-purple-400" />
                              <span>Analytics</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 4. Squad QA Rejection Coaching & Diagnostic Section */}
            {allProjectRejections.length > 0 && (
              <div className="relative overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-rose-950/20 border border-rose-500/30 rounded-3xl p-6 shadow-2xl space-y-4">
                <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
                <div className="relative z-10 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-rose-300 flex items-center gap-2 uppercase tracking-wider">
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      <span>Live Squad Quality Audit & QA Rejection Feedback ({allProjectRejections.length})</span>
                    </h3>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Review specific rejection rationales left by internal QA to coach contributors and eliminate recurring mistakes.
                    </p>
                  </div>
                </div>

                <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {allProjectRejections.slice(0, 12).map((r, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-2xl bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900/90 border border-neutral-800 space-y-1.5 text-xs hover:border-neutral-700 transition-colors shadow-sm"
                    >
                      <div className="flex items-center justify-between text-[11px] text-neutral-400">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{r.contributorName}</span>
                          <span className="font-mono text-purple-300 bg-purple-950/60 px-1.5 py-0.5 rounded text-[10px]">
                            {r.speaker_id}
                          </span>
                        </div>
                        <span>{r.rejectedAt ? new Date(r.rejectedAt).toLocaleDateString() : ""}</span>
                      </div>
                      <p className="text-rose-300 font-medium flex items-start gap-1">
                        <span className="shrink-0">⚠️</span>
                        <span>{r.comment}</span>
                      </p>
                      {r.text && (
                        <p className="text-neutral-400 text-[11px] italic bg-neutral-900/60 p-2 rounded-xl border border-neutral-850 line-clamp-2">
                          "{r.text}"
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* 5. Contributor Detailed Analytics Modal */}
      {selectedAnalyticsArtist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div
            className="w-full max-w-4xl bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 border border-neutral-800 rounded-3xl p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
            {/* Modal Header */}
            <div className="relative z-10 flex items-center justify-between border-b border-neutral-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-purple-400" />
                  <span>Contributor Performance Analytics</span>
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Detailed task execution, audio duration, and approval/rejection rates across all assigned projects.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAnalyticsArtist(null)}
                className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loadingAnalytics ? (
              <div className="py-16 text-center space-y-3 relative z-10">
                <RefreshCw className="w-8 h-8 animate-spin text-purple-500 mx-auto" />
                <p className="text-xs text-neutral-400">Loading contributor performance data...</p>
              </div>
            ) : analyticsData ? (
              <div className="space-y-6 relative z-10">
                {/* Contributor Profile Banner */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-neutral-950 via-purple-950/20 to-neutral-900 border border-purple-500/30 flex flex-wrap items-center justify-between gap-3 shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-purple-500/20 text-purple-400 font-bold flex items-center justify-center border border-purple-500/30 shadow-inner">
                      {selectedAnalyticsArtist.name?.charAt(0)?.toUpperCase() || "A"}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">{analyticsData.artist?.name}</div>
                      <div className="text-xs text-neutral-400 flex items-center gap-2">
                        <span>@{analyticsData.artist?.username}</span>
                        <span>•</span>
                        <span className="font-mono text-purple-300 font-semibold">{analyticsData.artist?.speaker_id}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <div>
                      <span className="text-neutral-500 block">Overall Pass Rate</span>
                      <span className={`font-bold font-mono text-sm ${
                        (analyticsData.summary?.overallApprovalRate || 0) >= 90
                          ? "text-emerald-400"
                          : (analyticsData.summary?.overallApprovalRate || 0) >= 80
                          ? "text-amber-400"
                          : "text-rose-400"
                      }`}>
                        {analyticsData.summary?.overallApprovalRate || 0}%
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block">Total Approved Hrs</span>
                      <span className="font-bold font-mono text-sm text-emerald-400">
                        {analyticsData.summary?.totalApprovedHours || 0} hrs
                      </span>
                    </div>
                  </div>
                </div>

                {/* Overall Summary 4-Card Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3.5 rounded-2xl bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 border border-neutral-800 shadow-md">
                    <span className="text-neutral-400 block text-[11px]">Done (Submitted)</span>
                    <span className="text-lg font-black text-white font-mono mt-0.5 block">
                      {analyticsData.summary?.totalDone || 0}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-950/30 via-neutral-950 to-neutral-900 border border-emerald-500/30 shadow-md">
                    <span className="text-emerald-400 block text-[11px]">Approved Tasks</span>
                    <span className="text-lg font-black text-emerald-400 font-mono mt-0.5 block">
                      {analyticsData.summary?.totalApproved || 0}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-950/30 via-neutral-950 to-neutral-900 border border-amber-500/30 shadow-md">
                    <span className="text-amber-400 block text-[11px]">Pending Evaluation</span>
                    <span className="text-lg font-black text-amber-400 font-mono mt-0.5 block">
                      {analyticsData.summary?.totalPending || 0}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-gradient-to-br from-rose-950/30 via-neutral-950 to-neutral-900 border border-rose-500/30 shadow-md">
                    <span className="text-rose-400 block text-[11px]">Rejected Tasks</span>
                    <span className="text-lg font-black text-rose-400 font-mono mt-0.5 block">
                      {analyticsData.summary?.totalRejected || 0}
                    </span>
                  </div>
                </div>

                {/* Project-Wise Breakdown */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                      Project-Wise Output Breakdown
                    </h4>
                    <div className="flex gap-1.5 text-[11px]">
                      {["all", "phrase", "call", "scripted_call"].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setAnalyticsCategoryFilter(cat)}
                          className={`px-2.5 py-1 rounded-lg font-bold capitalize transition-colors ${
                            analyticsCategoryFilter === cat
                              ? "bg-purple-600 text-white"
                              : "bg-neutral-800 text-neutral-400 hover:text-white"
                          }`}
                        >
                          {cat.replace("_", " ")}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-neutral-950 border-b border-neutral-800 text-neutral-400 uppercase font-semibold">
                        <tr>
                          <th className="py-3 px-4">Project</th>
                          <th className="py-3 px-3">Type</th>
                          <th className="py-3 px-3">Lang</th>
                          <th className="py-3 px-3 text-center">Done</th>
                          <th className="py-3 px-3 text-center">Approved</th>
                          <th className="py-3 px-3 text-center">Pending</th>
                          <th className="py-3 px-3 text-center">Rejected</th>
                          <th className="py-3 px-3 text-center">Pass %</th>
                          {isStudio && <th className="py-3 px-4 text-right">Payrate</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-800/60 font-mono">
                        {(analyticsData.projectBreakdown || [])
                          .filter((p) => analyticsCategoryFilter === "all" || p.category === analyticsCategoryFilter)
                          .map((p, idx) => (
                            <tr key={idx} className="hover:bg-neutral-900/50">
                              <td className="py-3 px-4 font-sans font-semibold text-white">
                                {p.subprojectName}
                              </td>
                              <td className="py-3 px-3 font-sans uppercase text-[10px] text-neutral-400">
                                {p.category.replace("_", " ")}
                              </td>
                              <td className="py-3 px-3 uppercase text-neutral-300">
                                {p.language || "All"}
                              </td>
                              <td className="py-3 px-3 text-center text-white">{p.totalSubmitted}</td>
                              <td className="py-3 px-3 text-center text-emerald-400">
                                {p.approved} ({p.approvedHours}h)
                              </td>
                              <td className="py-3 px-3 text-center text-amber-400">{p.pending}</td>
                              <td className="py-3 px-3 text-center text-rose-400">{p.rejected}</td>
                              <td className="py-3 px-3 text-center">
                                <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                                  p.approvalRate >= 90
                                    ? "bg-emerald-500/15 text-emerald-400"
                                    : p.approvalRate >= 80
                                    ? "bg-amber-500/15 text-amber-400"
                                    : p.totalSubmitted > 0
                                    ? "bg-rose-500/15 text-rose-400"
                                    : "text-neutral-500"
                                }`}>
                                  {p.totalSubmitted > 0 ? `${p.approvalRate}%` : "—"}
                                </span>
                              </td>
                              {isStudio && (
                                <td className="py-3 px-4 text-right text-purple-300 font-semibold">
                                  ${p.artistRate}/hr
                                </td>
                              )}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="pt-4 border-t border-neutral-800 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedAnalyticsArtist(null)}
                className="px-5 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
