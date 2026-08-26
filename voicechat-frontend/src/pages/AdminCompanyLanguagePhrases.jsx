import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminNav from "../components/AdminNav";
import { 
  ArrowLeft, 
  Building2, 
  Globe, 
  Search, 
  Trash2, 
  Star, 
  Loader2, 
  FileText, 
  Tag, 
  ChevronLeft, 
  ChevronRight,
  Download,
  CheckSquare,
  Square,
  SlidersHorizontal,
  X,
  Eye,
  EyeOff
} from "lucide-react";
import Swal from "sweetalert2";
import { apiGet, apiPostJson, apiPatchJson, apiDeleteJson } from "../lib/api.js";

const STANDARD_FIELDS = [
  { key: "phraseId", label: "Phrase ID" },
  { key: "text", label: "Script Text" },
  { key: "language", label: "Language Code" },
  { key: "script_type", label: "Script Type" },
  { key: "speaker_id", label: "Speaker ID" },
  { key: "emotion", label: "Emotion" },
  { key: "style", label: "Style" },
  { key: "intent", label: "Intent" },
  { key: "pitch", label: "Pitch" },
  { key: "speed", label: "Speed" },
  { key: "volume", label: "Volume" },
  { key: "instructions", label: "Instructions" },
  { key: "status", label: "Recording Status" },
  { key: "duration", label: "Audio Duration (sec)" },
  { key: "lufs", label: "LUFS Score" },
  { key: "recordedAt", label: "Recorded Timestamp" },
  { key: "isSample", label: "Is Test Sample" }
];

export default function AdminCompanyLanguagePhrases() {
  const { id, language } = useParams();
  const navigate = useNavigate();

  const [company, setCompany] = useState(null);
  const [phrases, setPhrases] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [allocationFilter, setAllocationFilter] = useState("all"); // "all", "reserved", "open"
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPhrases, setTotalPhrases] = useState(0);
  const [actionLoading, setActionLoading] = useState({});

  // Export JSON Modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportPhrasesList, setExportPhrasesList] = useState([]);
  const [availableStdKeys, setAvailableStdKeys] = useState([]);
  const [availableTagKeys, setAvailableTagKeys] = useState([]);
  const [selectedKeysMap, setSelectedKeysMap] = useState({});

  const openExportModal = async () => {
    setShowExportModal(true);
    setExporting(true);
    try {
      const data = await apiGet(`/api/admin/companies/${id}/phrase-workloads/${encodeURIComponent(language)}?limit=all`);
      const allPhrases = data.phrases || [];
      setExportPhrasesList(allPhrases);

      const stdSet = new Set();
      const tagSet = new Set();

      allPhrases.forEach((p) => {
        STANDARD_FIELDS.forEach((f) => {
          if (p[f.key] !== undefined && p[f.key] !== null && p[f.key] !== "") {
            stdSet.add(f.key);
          }
        });
        if (p.tags && typeof p.tags === "object" && !Array.isArray(p.tags)) {
          Object.keys(p.tags).forEach((k) => tagSet.add(k));
        }
      });

      const discoveredStd = STANDARD_FIELDS.filter((f) => stdSet.has(f.key));
      const discoveredTagList = Array.from(tagSet);

      setAvailableStdKeys(discoveredStd);
      setAvailableTagKeys(discoveredTagList);

      const initialMap = {};
      discoveredStd.forEach((f) => { initialMap[f.key] = true; });
      discoveredTagList.forEach((k) => { initialMap[`tag:${k}`] = true; });
      setSelectedKeysMap(initialMap);
    } catch (err) {
      console.error("Failed to load export workload data:", err);
      Swal.fire({ icon: "error", title: "Export Error", text: err.message, confirmButtonColor: "#ea580c" });
      setShowExportModal(false);
    } finally {
      setExporting(false);
    }
  };

  const toggleKey = (key) => {
    setSelectedKeysMap((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectAllKeys = (val) => {
    const next = {};
    availableStdKeys.forEach((f) => { next[f.key] = val; });
    availableTagKeys.forEach((k) => { next[`tag:${k}`] = val; });
    setSelectedKeysMap(next);
  };

  const executeDownloadJson = () => {
    if (!exportPhrasesList.length) return;

    const exportedData = exportPhrasesList.map((p) => {
      const row = {};

      availableStdKeys.forEach((f) => {
        if (selectedKeysMap[f.key] && p[f.key] !== undefined && p[f.key] !== null) {
          row[f.key] = p[f.key];
        }
      });

      availableTagKeys.forEach((k) => {
        if (selectedKeysMap[`tag:${k}`]) {
          const val = p.tags ? p.tags[k] : undefined;
          if (val !== undefined && val !== null) {
            row[k] = val;
          }
        }
      });

      return row;
    });

    const jsonStr = JSON.stringify(exportedData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${company ? company.name.replace(/\s+/g, '_') : 'Company'}_${language}_workload.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setShowExportModal(false);
    Swal.fire({
      icon: "success",
      title: "JSON Exported!",
      text: `Downloaded ${exportedData.length} phrase records with custom selected tags.`,
      timer: 2000,
      showConfirmButton: false
    });
  };

  const fetchPhrases = async (pageNum = page, searchQuery = search, alloc = allocationFilter, st = statusFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      if (alloc && alloc !== "all") params.append("allocation", alloc);
      if (st && st !== "all") params.append("status", st);
      params.append("page", pageNum);
      params.append("limit", "50");

      const data = await apiGet(`/api/admin/companies/${id}/phrase-workloads/${encodeURIComponent(language)}?${params.toString()}`);

      setCompany(data.company);
      setPhrases(data.phrases || []);
      setTotalPhrases(data.totalPhrases || 0);
      setTotalPages(data.totalPages || 1);
      setSummary(data.summary || null);
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Error Loading Phrases",
        text: err.message,
        confirmButtonColor: "#ea580c"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPhrases(1, search, allocationFilter, statusFilter);
  }, [id, language, allocationFilter, statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchPhrases(1, search, allocationFilter, statusFilter);
  };

  const handleSetSample = async (phrase) => {
    const key = `sample_${phrase._id}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));

    try {
      await apiPostJson(`/api/admin/phrases/${phrase._id}/set-sample`, {});

      setPhrases((prev) =>
        prev.map((p) => ({
          ...p,
          isSample: p._id === phrase._id
        }))
      );

      Swal.fire({
        icon: "success",
        title: "Sample Phrase Updated!",
        text: `"${phrase.text.slice(0, 40)}..." is now set as the application test sample for ${language.toUpperCase()}.`,
        timer: 2000,
        showConfirmButton: false
      });
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Action Failed",
        text: err.message,
        confirmButtonColor: "#ea580c"
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleDeletePhrase = async (phrase) => {
    const confirm = await Swal.fire({
      title: "Delete Phrase?",
      text: `Are you sure you want to delete phrase "${phrase.phraseId}"? This action cannot be undone.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#404040",
      confirmButtonText: "Yes, Delete"
    });

    if (!confirm.isConfirmed) return;

    const key = `delete_${phrase._id}`;
    setActionLoading((prev) => ({ ...prev, [key]: true }));

    try {
      await apiDeleteJson(`/api/admin/phrases/${phrase._id}`);

      setPhrases((prev) => prev.filter((p) => p._id !== phrase._id));
      setTotalPhrases((prev) => Math.max(0, prev - 1));

      Swal.fire({
        icon: "success",
        title: "Phrase Deleted",
        text: `Phrase "${phrase.phraseId}" removed from workload.`,
        timer: 1500,
        showConfirmButton: false
      });
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Delete Failed",
        text: err.message,
        confirmButtonColor: "#ea580c"
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleDeduplicate = async () => {
    const confirm = await Swal.fire({
      title: "Remove Duplicate Phrases?",
      text: `Clean up duplicate phrases for ${company ? company.name : "this company"}, keeping 1 copy per unique sentence?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Remove Duplicates",
      confirmButtonColor: "#ea580c"
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await apiPostJson("/api/phrases/admin/deduplicate", { companyId: company ? company.name : "" });
      Swal.fire({
        icon: "success",
        title: "Deduplication Complete!",
        text: res.message || `Removed ${res.deletedCount} duplicate phrases.`,
        timer: 3000
      });
      fetchPhrases(1, search);
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Deduplication Failed",
        text: err.message,
        confirmButtonColor: "#ea580c"
      });
    }
  };

  const handleDeletePending = async () => {
    const confirm = await Swal.fire({
      title: "Delete Pending Phrases?",
      text: `Are you sure you want to delete all PENDING (unrecorded) phrases for ${company ? company.name : "this company"} (${language.toUpperCase()})? Recorded, approved, locked, and edited phrases will NOT be deleted.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete Pending Phrases",
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#404040"
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await apiPostJson(`/api/admin/companies/${id}/phrase-workloads/${encodeURIComponent(language)}/delete-pending`, {});
      Swal.fire({
        icon: "success",
        title: "Pending Phrases Deleted!",
        text: res.message || `Deleted ${res.deletedCount} pending phrases.`,
        timer: 3000
      });
      fetchPhrases(1, search);
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Deletion Failed",
        text: err.message,
        confirmButtonColor: "#ea580c"
      });
    }
  };

  const renderTags = (tags) => {
    if (!tags) return null;
    let tagList = [];
    if (Array.isArray(tags)) tagList = tags;
    else if (typeof tags === "object") tagList = Object.entries(tags).map(([k, v]) => `${k}: ${v}`);
    else tagList = [String(tags)];

    if (!tagList.length) return null;

    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {tagList.map((tag, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-neutral-900 text-neutral-300 border border-neutral-700"
          >
            <Tag className="w-2.5 h-2.5 text-primary-400" />
            {tag}
          </span>
        ))}
      </div>
    );
  };

  const isLanguageHidden = (company?.hiddenLanguages || []).map(l => String(l).toLowerCase().trim()).includes(String(language || "").toLowerCase().trim());

  const toggleHideThisLanguage = async () => {
    const actionText = isLanguageHidden ? "Unhide" : "Hide";
    const confirm = await Swal.fire({
      title: `${actionText} "${language.toUpperCase()}" for ${company ? company.name : "this project"}?`,
      text: isLanguageHidden
        ? `This language will become visible to contributors for ${company ? company.name : "this project"}.`
        : `This will ONLY hide "${language.toUpperCase()}" for ${company ? company.name : "this project"} without affecting other projects' "${language.toUpperCase()}".`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: isLanguageHidden ? "#10b981" : "#f59e0b",
      confirmButtonText: `Yes, ${actionText} Language`
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await apiPatchJson(`/api/admin/companies/${id}/languages/${encodeURIComponent(language)}/toggle-hide`, {});
      setCompany(prev => ({
        ...prev,
        hiddenLanguages: res.hiddenLanguages
      }));
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: res.message || `Language ${actionText.toLowerCase()}d`,
        timer: 2500,
        showConfirmButton: false
      });
    } catch (err) {
      Swal.fire("Error", "Failed to toggle language visibility: " + err.message, "error");
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 flex text-white transition-colors duration-300">
      <AdminNav />
      <main className="flex-1 md:ml-64 p-6 md:p-8 max-w-7xl mx-auto text-neutral-100">
        {/* Header Navigation */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(`/admin/companies/${id}/phrase-workloads`)}
              className="btn btn-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Languages
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3 text-white">
                  <Globe className="w-7 h-7 text-primary-500" />
                  {company ? company.name : "Company"} — {language.toUpperCase()} Phrases
                </h1>
                {isLanguageHidden ? (
                  <span className="text-xs bg-rose-900/50 text-rose-300 border border-rose-600/60 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <EyeOff className="w-3 h-3" /> Hidden (Completed)
                  </span>
                ) : (
                  <span className="text-xs bg-emerald-900/40 text-emerald-300 border border-emerald-600/50 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <Eye className="w-3 h-3" /> Active
                  </span>
                )}
              </div>
              <p className="text-sm text-neutral-400 mt-1">
                Viewing phrase workload database for {language.toUpperCase()}. Set application test samples and manage phrase items.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleHideThisLanguage}
              className={`px-3 py-1.5 font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow-md ${
                isLanguageHidden
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : "bg-neutral-800 hover:bg-neutral-700 text-rose-300 border border-rose-500/40"
              }`}
              title={isLanguageHidden ? "Unhide this language for contributors" : "Hide this language for contributors"}
            >
              {isLanguageHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>{isLanguageHidden ? "Unhide Language" : "Hide Language"}</span>
            </button>
          </div>
        </div>

        {/* Language Allocation & Workload Summary Banner */}
        {summary && summary.totalCount > 0 && (
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-neutral-800/90 border border-neutral-700 p-3.5 rounded-xl shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Total Phrases</div>
              <div className="text-xl font-black text-white mt-0.5">{summary.totalCount}</div>
              <div className="text-[10px] text-neutral-400 mt-0.5">{language.toUpperCase()} Workload</div>
            </div>

            <div className="bg-indigo-950/40 border border-indigo-700/60 p-3.5 rounded-xl shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1">
                <span>🔒</span> Reserved
              </div>
              <div className="text-xl font-black text-indigo-200 mt-0.5">{summary.reservedCount}</div>
              <div className="text-[10px] text-indigo-400 mt-0.5">
                {summary.totalCount > 0 ? Math.round((summary.reservedCount / summary.totalCount) * 100) : 0}% of lang
              </div>
            </div>

            <div className="bg-teal-950/40 border border-teal-700/60 p-3.5 rounded-xl shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-teal-300 flex items-center gap-1">
                <span>🌐</span> Open Pool
              </div>
              <div className="text-xl font-black text-teal-200 mt-0.5">{summary.openPoolCount}</div>
              <div className="text-[10px] text-teal-400 mt-0.5">
                {summary.totalCount > 0 ? Math.round((summary.openPoolCount / summary.totalCount) * 100) : 0}% of lang
              </div>
            </div>

            <div className="bg-neutral-800/90 border border-neutral-700 p-3.5 rounded-xl shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Pending</div>
              <div className="text-xl font-black text-amber-400 mt-0.5">{summary.pendingCount}</div>
              <div className="text-[10px] text-neutral-400 mt-0.5">Unrecorded</div>
            </div>

            <div className="bg-neutral-800/90 border border-neutral-700 p-3.5 rounded-xl shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Recorded</div>
              <div className="text-xl font-black text-blue-400 mt-0.5">{summary.recordedCount}</div>
              <div className="text-[10px] text-neutral-400 mt-0.5">In QA Queue</div>
            </div>

            <div className="bg-neutral-800/90 border border-neutral-700 p-3.5 rounded-xl shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Approved</div>
              <div className="text-xl font-black text-emerald-400 mt-0.5">{summary.approvedCount}</div>
              <div className="text-[10px] text-neutral-400 mt-0.5">QA Approved</div>
            </div>
          </div>
        )}

        {/* Search & Filters Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-2xl">
            <form onSubmit={handleSearchSubmit} className="flex-1 min-w-[200px] relative">
              <input
                type="text"
                placeholder="Search phrases by ID, text, spk_..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input w-full pl-9 pr-3 py-1.5 text-xs bg-neutral-800 border-neutral-700 text-white placeholder-neutral-500 focus:border-primary-500 rounded-lg"
              />
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-2.5" />
            </form>

            <select
              value={allocationFilter}
              onChange={(e) => {
                setAllocationFilter(e.target.value);
                setPage(1);
              }}
              className="input input-sm text-xs bg-neutral-800 border border-neutral-700 text-white px-2.5 py-1.5 rounded-lg font-medium"
            >
              <option value="all">All Allocations</option>
              <option value="reserved">🔒 Reserved Only ({summary?.reservedCount ?? 0})</option>
              <option value="open">🌐 Open Pool Only ({summary?.openPoolCount ?? 0})</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="input input-sm text-xs bg-neutral-800 border border-neutral-700 text-white px-2.5 py-1.5 rounded-lg capitalize"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="locked">Locked</option>
              <option value="recorded">Recorded</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={openExportModal}
              className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-md"
              title="Download JSON data of this company workload with customized tags"
            >
              <Download className="w-3.5 h-3.5" /> Download JSON Data
            </button>
            <button
              onClick={handleDeduplicate}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-md"
              title="Remove duplicate phrases for this company"
            >
              🧹 Remove Duplicates
            </button>
            <button
              onClick={handleDeletePending}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-md"
              title="Delete all pending unrecorded phrases for this language"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Pending Phrases
            </button>
          </div>
        </div>

        {/* Phrase Workload Table */}
        {loading ? (
          <div className="bg-neutral-800 border border-neutral-700 rounded-2xl text-center py-16 shadow-xl">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto mb-3" />
            <p className="text-neutral-400">Loading {language.toUpperCase()} phrases...</p>
          </div>
        ) : phrases.length === 0 ? (
          <div className="bg-neutral-800 border border-neutral-700 rounded-2xl text-center py-16 shadow-xl">
            <FileText className="w-12 h-12 text-neutral-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2 text-white">No Phrases Found</h3>
            <p className="text-neutral-400">
              {search || allocationFilter !== "all" || statusFilter !== "all" 
                ? "No phrases match your selected filter or search query." 
                : `No phrases available for ${language.toUpperCase()}.`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-2xl border border-neutral-700 bg-neutral-800 shadow-xl">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-neutral-900/90 border-b border-neutral-700 text-neutral-300 font-semibold text-xs uppercase tracking-wider">
                    <th className="p-3.5">Phrase ID</th>
                    <th className="p-3.5">Allocation</th>
                    <th className="p-3.5 min-w-[240px]">Phrase Content / Text</th>
                    <th className="p-3.5">Emotion / Domain</th>
                    <th className="p-3.5">Style / Intent</th>
                    <th className="p-3.5">Audio Attributes</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-700/60">
                  {phrases.map((phrase) => {
                    const isSample = phrase.isSample;
                    const sampleLoading = actionLoading[`sample_${phrase._id}`];
                    const deleteLoading = actionLoading[`delete_${phrase._id}`];
                    const assignedSpk = phrase.assigned_speaker_id || (phrase.status === 'pending' ? phrase.speaker_id : null);

                    return (
                      <tr
                        key={phrase._id}
                        className={`hover:bg-neutral-750/50 transition-colors ${
                          isSample ? "bg-amber-950/20 border-l-4 border-l-amber-500" : ""
                        }`}
                      >
                        {/* Phrase ID */}
                        <td className="p-3.5 font-mono text-xs font-semibold text-neutral-300 align-top">
                          <div className="flex flex-col gap-1">
                            <span>{phrase.phraseId}</span>
                            {isSample && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white w-max shadow-sm">
                                <Star className="w-3 h-3 fill-current" /> Sample Phrase
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Allocation Badge */}
                        <td className="p-3.5 align-top">
                          {assignedSpk ? (
                            <span className="px-2.5 py-1 rounded-md bg-indigo-950/90 text-indigo-300 border border-indigo-700/60 font-mono text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap">
                              <span>🔒</span>
                              <span>{assignedSpk}</span>
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-md bg-neutral-900 text-neutral-400 border border-neutral-700 font-mono text-xs inline-flex items-center gap-1 whitespace-nowrap">
                              <span>🌐</span>
                              <span>Open Pool</span>
                            </span>
                          )}
                        </td>

                        {/* Phrase Text */}
                        <td className="p-3.5 align-top">
                          <p className="text-sm font-medium text-white leading-relaxed">
                            {phrase.text}
                          </p>
                          {phrase.instructions && (
                            <p className="text-xs text-neutral-400 mt-1 italic">
                              <span className="font-semibold text-neutral-300">Notes:</span> {phrase.instructions}
                            </p>
                          )}
                          {renderTags(phrase.tags)}
                        </td>

                        {/* Emotion & Domain */}
                        <td className="p-3.5 align-top text-xs">
                          <div className="space-y-1">
                            {phrase.emotion && (
                              <span className="inline-block px-2 py-0.5 rounded bg-purple-900/40 text-purple-300 border border-purple-800/50 font-medium">
                                {phrase.emotion}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Style & Intent */}
                        <td className="p-3.5 align-top text-xs">
                          <div className="space-y-1">
                            {phrase.style && (
                              <span className="inline-block px-2 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-800/50 font-medium">
                                {phrase.style}
                              </span>
                            )}
                            {phrase.intent && (
                              <p className="text-neutral-400 text-[11px] mt-0.5">
                                Intent: {phrase.intent}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Audio Attributes (Pitch, Speed, Volume) */}
                        <td className="p-3.5 align-top text-xs text-neutral-400">
                          <div className="space-y-0.5 font-mono text-[11px]">
                            {phrase.pitch && <div>Pitch: {phrase.pitch}</div>}
                            {phrase.speed && <div>Speed: {phrase.speed}</div>}
                            {phrase.volume && <div>Vol: {phrase.volume}</div>}
                            {!phrase.pitch && !phrase.speed && !phrase.volume && (
                              <span className="text-neutral-500 italic">Default</span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="p-3.5 align-top text-xs">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                              phrase.status === "approved"
                                ? "bg-success-900/40 text-success-300 border border-success-800/50"
                                : phrase.status === "recorded"
                                ? "bg-blue-900/40 text-blue-300 border border-blue-800/50"
                                : phrase.status === "rejected"
                                ? "bg-error-900/40 text-error-300 border border-error-800/50"
                                : "bg-neutral-900 text-neutral-400 border border-neutral-700"
                            }`}
                          >
                            {phrase.status}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="p-3.5 align-top text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Set as Sample Button */}
                            <button
                              onClick={() => handleSetSample(phrase)}
                              disabled={isSample || sampleLoading}
                              className={`btn btn-xs px-3 py-1.5 flex items-center gap-1.5 font-semibold transition-all ${
                                isSample
                                  ? "bg-amber-900/50 text-amber-300 border border-amber-700/50 cursor-default"
                                  : "bg-amber-500 hover:bg-amber-600 text-white shadow-sm hover:shadow"
                              }`}
                              title={isSample ? "Currently active sample phrase for applications" : "Set as sample phrase for contributor application"}
                            >
                              {sampleLoading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Star className={`w-3.5 h-3.5 ${isSample ? "fill-current" : ""}`} />
                              )}
                              {isSample ? "Sample Set" : "Set as Sample"}
                            </button>

                            {/* Delete Phrase Button */}
                            <button
                              onClick={() => handleDeletePhrase(phrase)}
                              disabled={deleteLoading}
                              className="btn btn-xs px-2.5 py-1.5 bg-error-900/30 hover:bg-error-900/50 text-error-300 border border-error-800/50 font-semibold"
                              title="Delete phrase from workload"
                            >
                              {deleteLoading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 bg-neutral-800 p-3 rounded-2xl border border-neutral-700">
                <span className="text-xs text-neutral-400">
                  Page {page} of {totalPages} ({totalPhrases} phrases)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const newPage = Math.max(1, page - 1);
                      setPage(newPage);
                      fetchPhrases(newPage, search);
                    }}
                    disabled={page === 1}
                    className="btn btn-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-200 border border-neutral-600 disabled:opacity-50"
                  >
                    <ChevronLeft className="w-4 h-4" /> Previous
                  </button>
                  <button
                    onClick={() => {
                      const newPage = Math.min(totalPages, page + 1);
                      setPage(newPage);
                      fetchPhrases(newPage, search);
                    }}
                    disabled={page === totalPages}
                    className="btn btn-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-200 border border-neutral-600 disabled:opacity-50"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Custom JSON Exporter Modal */}
        {showExportModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-neutral-900 border border-neutral-700 rounded-3xl max-w-2xl w-full p-6 text-white shadow-2xl space-y-5 animate-in fade-in zoom-in duration-200">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-900/50 border border-primary-500/40 text-primary-400 flex items-center justify-center">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      Export Custom JSON Data
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-300 font-mono">
                        {language.toUpperCase()}
                      </span>
                    </h3>
                    <p className="text-xs text-neutral-400">
                      Select the exact properties and custom tags to include in the exported JSON file.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {exporting ? (
                <div className="py-16 text-center space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto" />
                  <p className="text-neutral-400 text-sm">Inspecting workload tags and preparing dataset...</p>
                </div>
              ) : (
                <>
                  {/* Controls Bar */}
                  <div className="flex items-center justify-between bg-neutral-950 p-3 rounded-2xl border border-neutral-800">
                    <div className="text-xs font-semibold text-neutral-400">
                      Total Workload Records: <span className="text-primary-400 font-mono font-bold">{exportPhrasesList.length}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => selectAllKeys(true)}
                        className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg border border-neutral-700 font-semibold transition-colors flex items-center gap-1.5"
                      >
                        <CheckSquare className="w-3.5 h-3.5 text-emerald-400" /> Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => selectAllKeys(false)}
                        className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg border border-neutral-700 font-semibold transition-colors flex items-center gap-1.5"
                      >
                        <Square className="w-3.5 h-3.5 text-neutral-400" /> Deselect All
                      </button>
                    </div>
                  </div>

                  {/* Fields Selection Grid */}
                  <div className="max-h-[360px] overflow-y-auto pr-2 space-y-4 text-sm">
                    
                    {/* Standard Attributes */}
                    {availableStdKeys.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                          <SlidersHorizontal className="w-3.5 h-3.5 text-primary-400" /> Standard Phrase Attributes ({availableStdKeys.length})
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {availableStdKeys.map((f) => {
                            const isChecked = Boolean(selectedKeysMap[f.key]);
                            return (
                              <label
                                key={f.key}
                                onClick={() => toggleKey(f.key)}
                                className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                                  isChecked 
                                    ? "bg-primary-950/40 border-primary-500/50 text-white" 
                                    : "bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:border-neutral-700"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                  className="w-4 h-4 rounded accent-primary-500"
                                />
                                <span className="text-xs font-semibold truncate">{f.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Custom Tag Attributes */}
                    {availableTagKeys.length > 0 ? (
                      <div className="space-y-2 pt-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-amber-400" /> Uploaded Custom Tags ({availableTagKeys.length})
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {availableTagKeys.map((tagKey) => {
                            const fullKey = `tag:${tagKey}`;
                            const isChecked = Boolean(selectedKeysMap[fullKey]);
                            return (
                              <label
                                key={tagKey}
                                onClick={() => toggleKey(fullKey)}
                                className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                                  isChecked 
                                    ? "bg-amber-950/40 border-amber-500/50 text-amber-200" 
                                    : "bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:border-neutral-700"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                  className="w-4 h-4 rounded accent-amber-500"
                                />
                                <span className="text-xs font-semibold font-mono truncate">{tagKey}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-neutral-950/50 rounded-xl border border-neutral-800 text-xs text-neutral-500 italic">
                        No custom tag keys found in this workload batch.
                      </div>
                    )}
                  </div>

                  {/* Footer Action */}
                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
                    <button
                      type="button"
                      onClick={() => setShowExportModal(false)}
                      className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={executeDownloadJson}
                      className="px-5 py-2 bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-primary-600/20 active:scale-95"
                    >
                      <Download className="w-4 h-4" /> Download Custom JSON Data
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
