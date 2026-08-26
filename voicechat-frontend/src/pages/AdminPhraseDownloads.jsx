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
  FolderArchive
} from "lucide-react";
import Swal from "sweetalert2";
import { apiGet } from "../lib/api.js";

export default function AdminPhraseDownloads() {
  const [companies, setCompanies] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  // Filter Dialog Modal State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogCompany, setDialogCompany] = useState("");
  const [dialogStatus, setDialogStatus] = useState("approved"); // 'approved' | 'recorded'
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
    } catch (e) {
      Swal.fire("Error", e.message || "Failed to load download dashboard", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const fetchFilterOptions = async (companyName, status = dialogStatus, format = dateFormat) => {
    setLoadingOptions(true);
    try {
      const res = await apiGet(`/api/admin/phrases/download-filter-options?company=${encodeURIComponent(companyName)}&status=${status}&dateFormat=${encodeURIComponent(format)}`);
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

  const openDownloadModal = async (companyName, status = "approved") => {
    setDialogCompany(companyName);
    setDialogStatus(status);
    setDialogOpen(true);
    setDownloadMode("all");
    setSelectedFilterKey("");
    setSelectedFilterValue("");
    setLimitPerSpeakerMinutes("");
    setFilterOptionsData([]);
    setDialogTotalCount(0);
    setDialogFreshCount(0);
    await fetchFilterOptions(companyName, status, dateFormat);
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
        title: "Download Complete!",
        text: `Successfully downloaded ${filename}`,
        timer: 3000,
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

  const handleAppDownload = async (companyName, type = "approved_apps") => {
    const isApprovedOnly = type === "approved_apps";
    const confirm = await Swal.fire({
      title: isApprovedOnly ? "Download Approved Apps?" : "Download All Apps?",
      text: isApprovedOnly
        ? `This will bundle all approved mic check applications for "${companyName}" into a ZIP archive, organized language-wise.`
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

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white flex items-center gap-3">
            <Download className="w-8 h-8 text-warning-500" />
            Phrase Downloads
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Download QA-approved or Pending (Recorded) phrases packaged by company with full metadata JSONs and dynamic filtering.
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="btn btn-outline flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh Stats
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {companies.map((c) => {
            const cStats = stats[c.name] || { pending: 0, recorded: 0, approved: 0, rejected: 0 };
            const hasApproved = (cStats.approved || 0) > 0;
            const hasRecorded = (cStats.recorded || 0) > 0;

            return (
              <div
                key={c._id}
                className="bg-white dark:bg-neutral-800 rounded-2xl p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow"
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-neutral-900 dark:text-white">{c.name}</h2>
                      {c.projectName && (
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400">
                          {c.projectName}
                        </span>
                      )}
                    </div>
                    <Layers className="w-6 h-6 text-neutral-400" />
                  </div>

                  {/* Naming Pattern Info */}
                  <div className="mb-6 bg-neutral-50 dark:bg-neutral-850 p-3.5 rounded-xl border border-neutral-100 dark:border-neutral-750">
                    <span className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">Naming Pattern Template</span>
                    <code className="text-sm text-neutral-800 dark:text-neutral-200 font-mono block break-all bg-neutral-200/50 dark:bg-neutral-900 px-2 py-1 rounded">
                      {c.namingPattern || "{phraseId}"}
                    </code>
                    {c.availableTags && c.availableTags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1 items-center">
                        <span className="text-[10px] text-neutral-400 font-semibold mr-1">Dynamic:</span>
                        {c.availableTags.map(tag => (
                          <span key={tag} className="text-[10px] font-semibold bg-warning-50 dark:bg-warning-900/20 text-warning-700 dark:text-warning-400 px-1.5 py-0.5 rounded font-mono">{`{${tag}}`}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Counts Grid */}
                  <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="bg-neutral-50 dark:bg-neutral-850 p-3 rounded-xl border border-neutral-100 dark:border-neutral-750 flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-success-500" />
                      <div>
                        <span className="block text-xs text-neutral-400 font-semibold uppercase">Approved</span>
                        <span className="text-lg font-bold text-neutral-900 dark:text-white">{cStats.approved || 0}</span>
                      </div>
                    </div>
                    <div className="bg-neutral-50 dark:bg-neutral-850 p-3 rounded-xl border border-neutral-100 dark:border-neutral-750 flex items-center gap-3">
                      <Clock className="w-5 h-5 text-amber-500" />
                      <div>
                        <span className="block text-xs text-neutral-400 font-semibold uppercase">Recorded / QA</span>
                        <span className="text-lg font-bold text-neutral-900 dark:text-white">
                          {cStats.recorded || 0}
                        </span>
                      </div>
                    </div>
                    <div className="bg-neutral-50 dark:bg-neutral-850 p-3 rounded-xl border border-neutral-100 dark:border-neutral-750 flex items-center gap-3">
                      <XCircle className="w-5 h-5 text-error-500" />
                      <div>
                        <span className="block text-xs text-neutral-400 font-semibold uppercase">Rejected</span>
                        <span className="text-lg font-bold text-neutral-900 dark:text-white">{cStats.rejected || 0}</span>
                      </div>
                    </div>
                    <div className="bg-neutral-50 dark:bg-neutral-850 p-3 rounded-xl border border-neutral-100 dark:border-neutral-750 flex items-center gap-3">
                      <FileAudio className="w-5 h-5 text-neutral-400" />
                      <div>
                        <span className="block text-xs text-neutral-400 font-semibold uppercase">Total Phrases</span>
                        <span className="text-lg font-bold text-neutral-900 dark:text-white">
                          {Object.values(cStats).reduce((a, b) => a + b, 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-700">
                  <span className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Download Packages</span>
                  <div className="flex flex-col gap-2">
                    {/* Download Approved Phrases with Filter Dialog */}
                    <button
                      onClick={() => openDownloadModal(c.name, "approved")}
                      disabled={!hasApproved}
                      className={`w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                        hasApproved
                          ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 text-sm"
                          : "bg-neutral-100 dark:bg-neutral-750 text-neutral-400 dark:text-neutral-500 cursor-not-allowed text-xs"
                      }`}
                    >
                      <Download className="w-4 h-4" />
                      {hasApproved ? `Download Approved Phrases (${cStats.approved})` : "No Approved Phrases"}
                    </button>

                    {/* Download Pending (Recorded) Phrases with Filter Dialog */}
                    <button
                      onClick={() => openDownloadModal(c.name, "recorded")}
                      disabled={!hasRecorded}
                      className={`w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                        hasRecorded
                          ? "bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/20 text-sm"
                          : "bg-neutral-100 dark:bg-neutral-750 text-neutral-400 dark:text-neutral-500 cursor-not-allowed text-xs"
                      }`}
                    >
                      <Clock className="w-4 h-4" />
                      {hasRecorded ? `Download Pending (Recorded) Phrases (${cStats.recorded})` : "No Pending (Recorded) Phrases"}
                    </button>
                    
                    <button
                      onClick={() => handleAppDownload(c.name, "approved_apps")}
                      className="w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-650 text-neutral-800 dark:text-neutral-200 text-sm transition-all shadow-sm"
                    >
                      <Download className="w-4 h-4" />
                      Download Approved Apps
                    </button>
                    
                    <button
                      onClick={() => handleAppDownload(c.name, "all_apps")}
                      className="w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 border border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-750 text-sm transition-all"
                    >
                      <Download className="w-4 h-4" />
                      Download All Apps (Language Wise)
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Interactive Download Dialog Modal */}
      {dialogOpen && (
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
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span>{dialogCompany}</span>
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
                      ? "Download QA-Approved phrases packaged as WAVs and metadata JSON" 
                      : "Download phrases recorded by contributors awaiting QA review"}
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
                  <p className="text-sm text-neutral-400">No {dialogStatus} phrases with audio found for this company.</p>
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
                          ? "Download all approved phrases or only the newly approved batch. Bundles audio WAVs and metadata JSON catalogs."
                          : `Will generate complete ZIP archive with all ${dialogTotalCount} pending audio files and complete JSON metadata catalogs.`}
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
                                fetchFilterOptions(dialogCompany, dialogStatus, "DD-MM-YYYY");
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
                                fetchFilterOptions(dialogCompany, dialogStatus, "YYYY-MM-DD");
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
      )}
    </div>
  );
}
