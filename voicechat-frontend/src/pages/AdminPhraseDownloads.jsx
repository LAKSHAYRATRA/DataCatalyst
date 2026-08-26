import React, { useEffect, useState } from "react";
import { 
  Download, 
  RefreshCw, 
  Layers, 
  CheckCircle, 
  Clock, 
  XCircle, 
  FileAudio, 
  Filter, 
  X, 
  Loader2, 
  Sparkles,
  ChevronRight,
  FolderArchive,
  Globe,
  ArrowLeft,
  Building2,
  Tag
} from "lucide-react";
import Swal from "sweetalert2";
import { apiGet } from "../lib/api.js";

export default function AdminPhraseDownloads() {
  const [companies, setCompanies] = useState([]);
  const [stats, setStats] = useState({});
  const [languageStats, setLanguageStats] = useState({});
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filter Dialog Modal State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogCompany, setDialogCompany] = useState("");
  const [dialogStatus, setDialogStatus] = useState("approved"); // 'approved' | 'recorded'
  const [dialogLanguage, setDialogLanguage] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [filterOptionsData, setFilterOptionsData] = useState([]);
  const [dialogTotalCount, setDialogTotalCount] = useState(0);
  const [dialogFreshCount, setDialogFreshCount] = useState(0);
  const [selectedFilterKey, setSelectedFilterKey] = useState("");
  const [selectedFilterValue, setSelectedFilterValue] = useState("");
  const [downloadMode, setDownloadMode] = useState("all"); // 'all' | 'custom'
  const [dateFormat, setDateFormat] = useState("DD-MM-YYYY"); // 'DD-MM-YYYY' | 'YYYY-MM-DD'
  const [limitPerSpeakerMinutes, setLimitPerSpeakerMinutes] = useState("");

  const getClientToken = () => {
    const vcCookie = document.cookie.split("; ").find((row) => row.startsWith("vc_token="));
    if (vcCookie) return vcCookie.split("=")[1];
    return localStorage.getItem("vc_token") || "";
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [compRes, statsRes] = await Promise.all([
        apiGet("/api/admin/companies"),
        apiGet("/api/admin/phrases/download-stats")
      ]);
      setCompanies(compRes.companies || []);
      setStats(statsRes.stats || {});
      setLanguageStats(statsRes.languageStats || {});

      // Keep selectedCompany updated if already open
      if (selectedCompany) {
        const updatedComp = (compRes.companies || []).find(c => c._id === selectedCompany._id || c.name === selectedCompany.name);
        if (updatedComp) setSelectedCompany(updatedComp);
      }
    } catch (e) {
      Swal.fire("Error", e.message || "Failed to load download dashboard", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const fetchFilterOptions = async (companyName, status = dialogStatus, format = dateFormat, language = dialogLanguage) => {
    setLoadingOptions(true);
    try {
      let url = `/api/admin/phrases/download-filter-options?company=${encodeURIComponent(companyName)}&status=${status}&dateFormat=${encodeURIComponent(format)}`;
      if (language && language !== "all") {
        url += `&language=${encodeURIComponent(language)}`;
      }
      const res = await apiGet(url);
      const options = res.filterOptions || [];
      setFilterOptionsData(options);
      setDialogTotalCount(res.totalCount || 0);
      setDialogFreshCount(res.freshCount || 0);

      setSelectedFilterKey((prevKey) => {
        const keyToUse = prevKey && options.some(opt => opt.key === prevKey) ? prevKey : (options.length > 0 ? options[0].key : "");
        const found = options.find((opt) => opt.key === keyToUse);
        if (found && found.values && found.values.length > 0) {
          setSelectedFilterValue(found.values[0].value);
        } else {
          setSelectedFilterValue("");
        }
        return keyToUse;
      });
    } catch (e) {
      Swal.fire("Error", e.message || "Failed to fetch filter options", "error");
    } finally {
      setLoadingOptions(false);
    }
  };

  const openDownloadModal = async (companyName, status = "approved", language = "") => {
    setDialogCompany(companyName);
    setDialogStatus(status);
    setDialogLanguage(language);
    setDialogOpen(true);
    setDownloadMode("all");
    setSelectedFilterKey("");
    setSelectedFilterValue("");
    setLimitPerSpeakerMinutes("");
    setFilterOptionsData([]);
    setDialogTotalCount(0);
    setDialogFreshCount(0);
    await fetchFilterOptions(companyName, status, dateFormat, language);
  };

  const handleKeyChange = (newKey) => {
    setSelectedFilterKey(newKey);
    const found = filterOptionsData.find((opt) => opt.key === newKey);
    if (found && found.values && found.values.length > 0) {
      setSelectedFilterValue(found.values[0].value);
    } else {
      setSelectedFilterValue("");
    }
  };

  const executeDownload = async (isAll = false, isFresh = false) => {
    const targetCount = isFresh ? dialogFreshCount : dialogTotalCount;
    if (targetCount === 0) {
      Swal.fire("No Phrases", isFresh ? "There are no newly approved phrases available for download." : "There are no phrases available for download matching this selection.", "warning");
      return;
    }

    const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
    let url = `${backendUrl}/api/admin/phrases/download-company?company=${encodeURIComponent(dialogCompany)}&status=${dialogStatus}&dateFormat=${encodeURIComponent(dateFormat)}`;

    if (dialogLanguage && dialogLanguage !== "all") {
      url += `&language=${encodeURIComponent(dialogLanguage)}`;
    }

    if (isFresh) {
      url += `&type=fresh_phrases&isFresh=true`;
    }

    if (!isAll && selectedFilterKey && selectedFilterValue) {
      url += `&filterKey=${encodeURIComponent(selectedFilterKey)}&filterValue=${encodeURIComponent(selectedFilterValue)}`;
    }

    if (limitPerSpeakerMinutes && parseFloat(limitPerSpeakerMinutes) > 0) {
      url += `&limitPerSpeakerMinutes=${encodeURIComponent(limitPerSpeakerMinutes)}`;
    }

    setDialogOpen(false);
    Swal.fire({
      title: "Generating ZIP Package...",
      text: "Packaging audio files and metadata catalog...",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        let errText = "Failed to download ZIP";
        try {
          const json = await res.json();
          errText = json.error || errText;
        } catch {}
        throw new Error(errText);
      }

      const disposition = res.headers.get("content-disposition") || "";
      let filename = `${dialogCompany}_${dialogStatus}_phrases.zip`;
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
        text: `Successfully packaged ${filename}`,
        timer: 2500,
        showConfirmButton: false
      });
      loadData();
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Download Failed",
        text: err.message,
        confirmButtonColor: "#ea580c"
      });
    }
  };

  const handleAppDownload = async (companyName, type) => {
    const isApprovedOnly = type === "approved_apps";
    const confirm = await Swal.fire({
      title: isApprovedOnly ? "Download Approved Applications?" : "Download All Applications?",
      text: isApprovedOnly
        ? `This will download only approved mic check applications for "${companyName}" as a ZIP archive, organized language-wise.`
        : `This will bundle all mic check applications (approved, pending, or rejected) for "${companyName}" into a ZIP archive, organized language-wise.`,
      icon: "info",
      showCancelButton: true,
      confirmButtonText: "Download ZIP",
      cancelButtonText: "Cancel"
    });

    if (!confirm.isConfirmed) return;

    Swal.fire({
      title: "Packaging Applications...",
      text: "Generating application recordings ZIP...",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
      const url = `${backendUrl}/api/admin/phrases/download-company?company=${encodeURIComponent(companyName)}&type=${type}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        let errText = "Failed to download ZIP";
        try {
          const json = await res.json();
          errText = json.error || errText;
        } catch {}
        throw new Error(errText);
      }

      const disposition = res.headers.get("content-disposition") || "";
      let filename = `${companyName}_${type}.zip`;
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
        title: "Download Complete!",
        text: `Successfully downloaded ${filename}`,
        timer: 3000,
        showConfirmButton: false
      });
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Download Failed",
        text: err.message,
        confirmButtonColor: "#ea580c"
      });
    }
  };

  const currentKeyOption = filterOptionsData.find((opt) => opt.key === selectedFilterKey);
  const selectedCount = currentKeyOption?.values?.find((v) => v.value === selectedFilterValue)?.count || 0;

  // Render View 2: Company Detail Page (Language-Wise Downloads)
  if (selectedCompany) {
    const comp = selectedCompany;
    const compLower = (comp.name || "").toLowerCase();
    const cStats = stats[comp.name] || stats[compLower] || { pending: 0, recorded: 0, approved: 0, rejected: 0 };
    const cLangMap = languageStats[comp.name] || languageStats[compLower] || {};

    const definedLangs = Array.isArray(comp.languages) ? comp.languages : [];
    const detectedLangs = Object.keys(cLangMap);
    const activeLangs = Array.from(new Set([...definedLangs, ...detectedLangs])).filter(Boolean);
    if (activeLangs.length === 0) {
      activeLangs.push("hindi");
    }

    const hasApproved = (cStats.approved || 0) > 0;
    const hasRecorded = (cStats.recorded || 0) > 0;

    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Top Breadcrumb Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-700 pb-5">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedCompany(null)}
              className="p-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 transition-colors flex items-center gap-2 text-sm font-bold shadow-xs"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Companies</span>
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
                  {comp.name}
                </h1>
                {comp.projectName && (
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 border border-primary-300 dark:border-primary-700/50">
                    {comp.projectName}
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-primary-500" />
                <span>{activeLangs.length} {activeLangs.length === 1 ? 'Language' : 'Languages'} Active in this Project</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="btn btn-outline btn-sm flex items-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Naming Pattern Info Banner */}
        <div className="bg-white dark:bg-neutral-800 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <span className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
              Naming Pattern Template
            </span>
            <code className="text-sm text-neutral-800 dark:text-neutral-200 font-mono bg-neutral-100 dark:bg-neutral-900 px-2.5 py-1 rounded-md">
              {comp.namingPattern || "{phraseId}"}
            </code>
          </div>
          {comp.availableTags && comp.availableTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-neutral-400 font-semibold mr-1">Dynamic Tags:</span>
              {comp.availableTags.map(tag => (
                <span key={tag} className="text-xs font-mono font-bold bg-warning-50 dark:bg-warning-900/30 text-warning-700 dark:text-warning-300 px-2 py-0.5 rounded-md border border-warning-200 dark:border-warning-800/50">{`{${tag}}`}</span>
              ))}
            </div>
          )}
        </div>

        {/* 4 KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-neutral-800 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-xs flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <span className="block text-xs text-neutral-400 font-bold uppercase tracking-wider">Approved</span>
              <span className="text-2xl font-black text-neutral-900 dark:text-white">{cStats.approved || 0}</span>
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-800 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-xs flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <span className="block text-xs text-neutral-400 font-bold uppercase tracking-wider">Recorded / QA</span>
              <span className="text-2xl font-black text-neutral-900 dark:text-white">{cStats.recorded || 0}</span>
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-800 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-xs flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
              <XCircle className="w-6 h-6" />
            </div>
            <div>
              <span className="block text-xs text-neutral-400 font-bold uppercase tracking-wider">Rejected</span>
              <span className="text-2xl font-black text-neutral-900 dark:text-white">{cStats.rejected || 0}</span>
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-800 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-700 shadow-xs flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
              <FileAudio className="w-6 h-6" />
            </div>
            <div>
              <span className="block text-xs text-neutral-400 font-bold uppercase tracking-wider">Total Phrases</span>
              <span className="text-2xl font-black text-neutral-900 dark:text-white">
                {Object.values(cStats).reduce((a, b) => a + b, 0)}
              </span>
            </div>
          </div>
        </div>

        {/* LANGUAGE-WISE DOWNLOADS SECTION */}
        <div className="bg-white dark:bg-neutral-800 rounded-2xl p-6 border border-neutral-200 dark:border-neutral-700 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary-500" />
                <span>Languages Active in {comp.name}</span>
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Download phrases scoped to each individual language with custom metadata filters and speaker duration caps.
              </p>
            </div>
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
              {activeLangs.length} {activeLangs.length === 1 ? 'Language' : 'Languages'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 pt-2">
            {activeLangs.map((lang) => {
              const langKey = lang.toLowerCase();
              const lStat = cLangMap[langKey] || { approved: 0, recorded: 0, pending: 0, rejected: 0 };
              const lTotal = (lStat.approved || 0) + (lStat.recorded || 0) + (lStat.rejected || 0);
              const hasLangApproved = (lStat.approved || 0) > 0;
              const hasLangRecorded = (lStat.recorded || 0) > 0;

              return (
                <div
                  key={lang}
                  className="bg-neutral-50 dark:bg-neutral-850 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-primary-500/50 transition-all shadow-xs"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-primary-500"></div>
                      <span className="text-base font-black text-neutral-900 dark:text-white capitalize">{lang}</span>
                      <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-750 text-neutral-700 dark:text-neutral-300">
                        {lTotal} total phrases
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" />
                        {lStat.approved || 0} Approved
                      </span>
                      <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {lStat.recorded || 0} Pending (Recorded)
                      </span>
                      {lStat.rejected > 0 && (
                        <span className="text-rose-500 font-bold flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" />
                          {lStat.rejected} Rejected
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Language Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => openDownloadModal(comp.name, "approved", langKey)}
                      disabled={!hasLangApproved}
                      className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-xs ${
                        hasLangApproved
                          ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 active:scale-95 cursor-pointer"
                          : "bg-neutral-200 dark:bg-neutral-750 text-neutral-400 dark:text-neutral-500 cursor-not-allowed"
                      }`}
                      title={hasLangApproved ? `Download ${lStat.approved} approved phrases in ${lang}` : `No approved phrases in ${lang}`}
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Approved ({lStat.approved || 0})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openDownloadModal(comp.name, "recorded", langKey)}
                      disabled={!hasLangRecorded}
                      className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-xs ${
                        hasLangRecorded
                          ? "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20 active:scale-95 cursor-pointer"
                          : "bg-neutral-200 dark:bg-neutral-750 text-neutral-400 dark:text-neutral-500 cursor-not-allowed"
                      }`}
                      title={hasLangRecorded ? `Download ${lStat.recorded} recorded phrases in ${lang}` : `No recorded phrases in ${lang}`}
                    >
                      <Clock className="w-4 h-4" />
                      <span>Download Pending ({lStat.recorded || 0})</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* MASTER PROJECT-WIDE DOWNLOADS SECTION */}
        <div className="bg-white dark:bg-neutral-800 rounded-2xl p-6 border border-neutral-200 dark:border-neutral-700 shadow-xs space-y-4">
          <div>
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              <FolderArchive className="w-5 h-5 text-primary-500" />
              <span>Download Complete Project (All Languages Combined)</span>
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Bundles all phrases across all languages in this project into a structured ZIP archive with language folders and root manifests.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
            <button
              onClick={() => openDownloadModal(comp.name, "approved", "")}
              disabled={!hasApproved}
              className={`p-4 rounded-xl font-bold flex flex-col items-center justify-center gap-2 text-center transition-all ${
                hasApproved
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 active:scale-95"
                  : "bg-neutral-100 dark:bg-neutral-750 text-neutral-400 dark:text-neutral-500 cursor-not-allowed text-xs"
              }`}
            >
              <Download className="w-5 h-5" />
              <span className="text-sm">All Approved Phrases</span>
              <span className="text-xs opacity-80 font-normal">({cStats.approved || 0} Phrases)</span>
            </button>

            <button
              onClick={() => openDownloadModal(comp.name, "recorded", "")}
              disabled={!hasRecorded}
              className={`p-4 rounded-xl font-bold flex flex-col items-center justify-center gap-2 text-center transition-all ${
                hasRecorded
                  ? "bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/20 active:scale-95"
                  : "bg-neutral-100 dark:bg-neutral-750 text-neutral-400 dark:text-neutral-500 cursor-not-allowed text-xs"
              }`}
            >
              <Clock className="w-5 h-5" />
              <span className="text-sm">All Pending Phrases</span>
              <span className="text-xs opacity-80 font-normal">({cStats.recorded || 0} Phrases)</span>
            </button>

            <button
              onClick={() => handleAppDownload(comp.name, "approved_apps")}
              className="p-4 rounded-xl font-bold flex flex-col items-center justify-center gap-2 text-center bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-650 text-neutral-800 dark:text-neutral-200 text-sm transition-all shadow-xs"
            >
              <Download className="w-5 h-5 text-primary-500" />
              <span className="text-sm">Approved Mic Apps</span>
              <span className="text-xs opacity-80 font-normal">(Language-Wise)</span>
            </button>

            <button
              onClick={() => handleAppDownload(comp.name, "all_apps")}
              className="p-4 rounded-xl font-bold flex flex-col items-center justify-center gap-2 text-center border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-750 text-sm transition-all"
            >
              <Download className="w-5 h-5 text-neutral-400" />
              <span className="text-sm">All Mic Check Apps</span>
              <span className="text-xs opacity-80 font-normal">(All Submissions)</span>
            </button>
          </div>
        </div>

        {/* Modal rendering is outside the view condition below */}
        {renderDownloadModal()}
      </div>
    );
  }

  // Render View 1: Companies Overview List
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-neutral-900 dark:text-white flex items-center gap-3">
            <Download className="w-8 h-8 text-warning-500" />
            <span>Phrase Downloads</span>
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Click any company / project to manage and download phrases language-wise with complete metadata JSONs and duration caps.
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="btn btn-outline flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh Projects
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-12 h-12 border-4 border-warning-200 border-t-warning-600 rounded-full animate-spin"></div>
        </div>
      ) : companies.length === 0 ? (
        <div className="bg-white dark:bg-neutral-800 rounded-2xl p-12 text-center border border-neutral-200 dark:border-neutral-700">
          <p className="text-neutral-500 dark:text-neutral-400">No companies found in database.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {companies.map((c) => {
            const compLower = (c.name || "").toLowerCase();
            const cStats = stats[c.name] || stats[compLower] || { pending: 0, recorded: 0, approved: 0, rejected: 0 };
            const cLangMap = languageStats[c.name] || languageStats[compLower] || {};

            const definedLangs = Array.isArray(c.languages) ? c.languages : [];
            const detectedLangs = Object.keys(cLangMap);
            const cLangs = Array.from(new Set([...definedLangs, ...detectedLangs])).filter(Boolean);
            if (cLangs.length === 0) {
              cLangs.push("hindi");
            }

            const totalPhrases = Object.values(cStats).reduce((a, b) => a + b, 0);

            return (
              <div
                key={c._id}
                onClick={() => setSelectedCompany(c)}
                className="bg-white dark:bg-neutral-800 rounded-2xl p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm hover:shadow-xl hover:border-primary-500/80 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-3 rounded-xl bg-primary-50 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400 group-hover:bg-primary-600 group-hover:text-white transition-all shadow-xs">
                        <Building2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-black text-neutral-900 dark:text-white group-hover:text-primary-500 transition-colors">
                          {c.name}
                        </h2>
                        {c.projectName && (
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 inline-block mt-0.5">
                            {c.projectName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Active Languages Pills */}
                  <div className="mt-3 mb-5 flex flex-wrap gap-1.5 items-center">
                    <span className="text-[11px] text-neutral-400 font-semibold mr-1 flex items-center gap-1">
                      <Globe className="w-3 h-3 text-primary-400" />
                      Languages:
                    </span>
                    {cLangs.slice(0, 3).map((l) => (
                      <span key={l} className="text-xs font-bold capitalize px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40">
                        {l}
                      </span>
                    ))}
                    {cLangs.length > 3 && (
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-700 text-neutral-500">
                        +{cLangs.length - 3} more
                      </span>
                    )}
                  </div>

                  {/* Quick Metrics Bar */}
                  <div className="grid grid-cols-2 gap-2.5 mb-4">
                    <div className="bg-neutral-50 dark:bg-neutral-850 p-2.5 rounded-xl border border-neutral-100 dark:border-neutral-750">
                      <span className="block text-[10px] text-neutral-400 font-bold uppercase">Approved</span>
                      <span className="text-base font-black text-emerald-600 dark:text-emerald-400">{cStats.approved || 0}</span>
                    </div>
                    <div className="bg-neutral-50 dark:bg-neutral-850 p-2.5 rounded-xl border border-neutral-100 dark:border-neutral-750">
                      <span className="block text-[10px] text-neutral-400 font-bold uppercase">Pending / QA</span>
                      <span className="text-base font-black text-amber-600 dark:text-amber-400">{cStats.recorded || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Card Action Banner */}
                <div className="pt-3 border-t border-neutral-100 dark:border-neutral-750 flex items-center justify-between text-xs font-bold text-primary-600 dark:text-primary-400 group-hover:translate-x-1 transition-transform">
                  <span>Open Project & Languages ({totalPhrases} Phrases)</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {renderDownloadModal()}
    </div>
  );

  function renderDownloadModal() {
    if (!dialogOpen) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div 
          className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-white"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className={`p-5 flex items-center justify-between border-b ${
            dialogStatus === "approved" ? "border-emerald-700/40 bg-emerald-950/30" : "border-amber-700/40 bg-amber-950/30"
          }`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${
                dialogStatus === "approved" ? "bg-emerald-600/30 text-emerald-400 border border-emerald-500/40" : "bg-amber-600/30 text-amber-400 border border-amber-500/40"
              }`}>
                <FolderArchive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2 flex-wrap">
                  <span>{dialogCompany}</span>
                  {dialogLanguage && dialogLanguage !== "all" && (
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-indigo-950/80 text-indigo-300 border border-indigo-600/50 flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      {dialogLanguage}
                    </span>
                  )}
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    dialogStatus === "approved" 
                      ? "bg-emerald-900/60 text-emerald-300 border border-emerald-600/50" 
                      : "bg-amber-900/60 text-amber-300 border border-amber-600/50"
                  }`}>
                    {dialogStatus === "approved" ? "Approved Phrases" : "Pending (Recorded) Phrases"}
                  </span>
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {dialogStatus === "approved" 
                    ? `Download QA-Approved phrases${dialogLanguage ? ` in ${dialogLanguage}` : ''} packaged as WAVs with info.txt manifest` 
                    : `Download phrases recorded by contributors${dialogLanguage ? ` in ${dialogLanguage}` : ''} awaiting QA review`}
                </p>
              </div>
            </div>
            <button
              onClick={() => setDialogOpen(false)}
              className="text-neutral-400 hover:text-white p-1.5 rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-6 space-y-6">
            {loadingOptions ? (
              <div className="py-12 text-center space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto" />
                <p className="text-sm text-neutral-400">Scanning phrase records & available keys...</p>
              </div>
            ) : dialogTotalCount === 0 ? (
              <div className="py-8 text-center bg-neutral-800/60 rounded-xl border border-neutral-700 p-4">
                <p className="text-sm text-neutral-400">No {dialogStatus} phrases with audio found for this selection.</p>
              </div>
            ) : (
              <>
                {/* Mode Selector Tabs */}
                <div className="grid grid-cols-2 gap-2 bg-neutral-800 p-1.5 rounded-xl border border-neutral-700">
                  <button
                    type="button"
                    onClick={() => setDownloadMode("all")}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                      downloadMode === "all"
                        ? "bg-primary-600 text-white shadow-md"
                        : "text-neutral-400 hover:text-white hover:bg-neutral-750"
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Download All ({dialogTotalCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDownloadMode("custom")}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                      downloadMode === "custom"
                        ? "bg-primary-600 text-white shadow-md"
                        : "text-neutral-400 hover:text-white hover:bg-neutral-750"
                    }`}
                  >
                    <Filter className="w-3.5 h-3.5" />
                    <span>Custom Filter</span>
                  </button>
                </div>

                {downloadMode === "all" ? (
                  <div className="bg-neutral-800/80 border border-neutral-700/80 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-neutral-700/60 pb-3">
                      <span className="text-sm font-semibold text-neutral-300">Total {dialogStatus === "approved" ? "Approved" : "Pending"} Phrases:</span>
                      <span className="text-base font-mono font-bold text-primary-400">{dialogTotalCount} Phrases</span>
                    </div>

                    {dialogStatus === "approved" && (
                      <div className="flex items-center justify-between border-b border-neutral-700/60 pb-3">
                        <div>
                          <span className="text-sm font-semibold text-neutral-300 block">Newly Approved (Undownloaded):</span>
                          <span className="text-[11px] text-neutral-400">Approved phrases not downloaded in any previous batch</span>
                        </div>
                        <span className={`text-base font-mono font-bold px-2.5 py-0.5 rounded-full ${
                          dialogFreshCount > 0 
                            ? "text-cyan-300 bg-cyan-950/80 border border-cyan-700/50" 
                            : "text-neutral-500 bg-neutral-850"
                        }`}>
                          {dialogFreshCount} Phrases
                        </span>
                      </div>
                    )}

                    <p className="text-xs text-neutral-400">
                      {dialogStatus === "approved"
                        ? "Download all approved phrases or only the newly approved batch. Bundles audio WAVs, info.txt manifest, and metadata JSON catalogs."
                        : `Will generate complete ZIP archive with all ${dialogTotalCount} pending audio files, info.txt manifest, and JSON metadata catalogs.`}
                    </p>
                  </div>
                ) : (
                  <div className="bg-neutral-800/80 border border-neutral-700/80 rounded-xl p-5 space-y-4">
                    {/* Dropdown 1: Select JSON Filter Key */}
                    <div>
                      <label className="block text-xs font-bold text-neutral-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-primary-900/60 text-primary-300 border border-primary-600/50 flex items-center justify-center text-[10px]">1</span>
                        <span>Select Filter Key (Metadata Field)</span>
                      </label>
                      <select
                        value={selectedFilterKey}
                        onChange={(e) => handleKeyChange(e.target.value)}
                        className="input w-full text-xs font-mono bg-neutral-900 border border-neutral-700 text-white rounded-lg p-2.5 focus:border-primary-500"
                      >
                        {filterOptionsData.map((opt) => (
                          <option key={opt.key} value={opt.key}>
                            {opt.label} ({opt.values?.length || 0} unique {opt.values?.length === 1 ? 'value' : 'values'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Date Format Order Toggle (DD-MM-YYYY vs YYYY-MM-DD) */}
                    {selectedFilterKey === "recording_date" && (
                      <div className="bg-neutral-900/90 border border-neutral-700/70 rounded-xl p-3 flex items-center justify-between">
                        <div>
                          <span className="block text-xs font-bold text-neutral-300">Date Format Order</span>
                          <span className="text-[11px] text-neutral-400">Choose date structure for filtering & downloaded filenames</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-neutral-950 p-1 rounded-lg border border-neutral-800">
                          <button
                            type="button"
                            onClick={() => {
                              setDateFormat("DD-MM-YYYY");
                              fetchFilterOptions(dialogCompany, dialogStatus, "DD-MM-YYYY", dialogLanguage);
                            }}
                            className={`px-3 py-1.5 text-xs font-mono font-bold rounded-md transition-all ${
                              dateFormat === "DD-MM-YYYY"
                                ? "bg-primary-600 text-white shadow-sm"
                                : "text-neutral-400 hover:text-white"
                            }`}
                          >
                            DD-MM-YYYY
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDateFormat("YYYY-MM-DD");
                              fetchFilterOptions(dialogCompany, dialogStatus, "YYYY-MM-DD", dialogLanguage);
                            }}
                            className={`px-3 py-1.5 text-xs font-mono font-bold rounded-md transition-all ${
                              dateFormat === "YYYY-MM-DD"
                                ? "bg-primary-600 text-white shadow-sm"
                                : "text-neutral-400 hover:text-white"
                            }`}
                          >
                            YYYY-MM-DD
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Dropdown 2: Select Filter Value */}
                    <div>
                      <label className="block text-xs font-bold text-neutral-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-primary-900/60 text-primary-300 border border-primary-600/50 flex items-center justify-center text-[10px]">2</span>
                        <span>Select Available Value</span>
                      </label>
                      <select
                        value={selectedFilterValue}
                        onChange={(e) => setSelectedFilterValue(e.target.value)}
                        className="input w-full text-xs font-mono bg-neutral-900 border border-neutral-700 text-white rounded-lg p-2.5 focus:border-primary-500"
                      >
                        {(currentKeyOption?.values || []).map((valObj) => (
                          <option key={valObj.value} value={valObj.value}>
                            {valObj.value} ({valObj.count} {valObj.count === 1 ? 'phrase' : 'phrases'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Filter Match Counter Badge */}
                    <div className="pt-2 flex items-center justify-between border-t border-neutral-700/60 text-xs">
                      <span className="text-neutral-400">Matching subset:</span>
                      <span className="font-mono font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-700/50 px-2.5 py-0.5 rounded-full">
                        {selectedCount} Phrases
                      </span>
                    </div>
                  </div>
                )}

                {/* Limit Per Speaker (Duration Cap) */}
                <div className="bg-neutral-800/90 border border-neutral-700/80 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-xs font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Limit Per Speaker (Duration Cap)</span>
                      </label>
                      <span className="text-[11px] text-neutral-400">
                        Caps audio to max minutes per unique speaker (e.g. 30 min per speaker). Leave blank for all.
                      </span>
                    </div>
                    {limitPerSpeakerMinutes && (
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-mono font-bold">
                        {limitPerSpeakerMinutes} min / speaker
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[130px]">
                      <input
                        type="number"
                        min="1"
                        max="600"
                        placeholder="Minutes (e.g. 30)"
                        value={limitPerSpeakerMinutes}
                        onChange={(e) => setLimitPerSpeakerMinutes(e.target.value)}
                        className="w-full pl-3 pr-9 py-2 bg-neutral-900 border border-neutral-700 text-white text-xs rounded-lg focus:border-primary-500 focus:outline-none font-mono"
                      />
                      <span className="absolute right-2.5 top-2 text-xs text-neutral-500 font-mono">min</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {["15", "30", "45", "60"].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setLimitPerSpeakerMinutes(mins)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
                            limitPerSpeakerMinutes === mins
                              ? "bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20"
                              : "bg-neutral-750 hover:bg-neutral-700 text-neutral-300 border border-neutral-700"
                          }`}
                        >
                          {mins}m
                        </button>
                      ))}
                      {limitPerSpeakerMinutes && (
                        <button
                          type="button"
                          onClick={() => setLimitPerSpeakerMinutes("")}
                          className="px-2.5 py-1.5 rounded-lg text-xs text-rose-300 hover:text-white bg-rose-950/60 hover:bg-rose-900 border border-rose-800/50 transition-all font-semibold"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Modal Footer Actions */}
          <div className="p-5 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              className="btn btn-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 px-4"
            >
              Cancel
            </button>

            {downloadMode === "all" ? (
              <div className="flex items-center gap-2">
                {dialogStatus === "approved" && (
                  <button
                    type="button"
                    onClick={() => executeDownload(true, true)}
                    disabled={loadingOptions || dialogFreshCount === 0}
                    className={`btn btn-sm font-bold flex items-center gap-2 px-4 shadow-lg transition-all ${
                      dialogFreshCount > 0
                        ? "bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-600/20"
                        : "bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700"
                    }`}
                    title={dialogFreshCount === 0 ? "No newly approved phrases available" : `Download ${dialogFreshCount} newly approved phrases`}
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Download Newly Approved ({dialogFreshCount})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => executeDownload(true, false)}
                  disabled={loadingOptions || dialogTotalCount === 0}
                  className={`btn btn-sm font-bold flex items-center gap-2 px-5 shadow-lg ${
                    dialogStatus === "approved"
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                      : "bg-amber-600 hover:bg-amber-500 text-white"
                  }`}
                >
                  <Download className="w-4 h-4" />
                  <span>Download All ({dialogTotalCount})</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => executeDownload(false, false)}
                disabled={loadingOptions || !selectedFilterKey || !selectedFilterValue || selectedCount === 0}
                className={`btn btn-sm font-bold flex items-center gap-2 px-5 shadow-lg ${
                  dialogStatus === "approved"
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                    : "bg-amber-600 hover:bg-amber-500 text-white"
                }`}
              >
                <Download className="w-4 h-4" />
                <span>Download Filtered ({selectedCount} Phrases)</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
