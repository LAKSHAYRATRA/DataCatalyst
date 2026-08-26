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
  const [selectedFilterKey, setSelectedFilterKey] = useState("");
  const [selectedFilterValue, setSelectedFilterValue] = useState("");
  const [downloadMode, setDownloadMode] = useState("all"); // 'all' | 'custom'

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

  const openDownloadModal = async (companyName, status = "approved") => {
    setDialogCompany(companyName);
    setDialogStatus(status);
    setDialogOpen(true);
    setLoadingOptions(true);
    setDownloadMode("all");
    setSelectedFilterKey("");
    setSelectedFilterValue("");
    setFilterOptionsData([]);
    setDialogTotalCount(0);

    try {
      const res = await apiGet(`/api/admin/phrases/download-filter-options?company=${encodeURIComponent(companyName)}&status=${status}`);
      const options = res.filterOptions || [];
      setFilterOptionsData(options);
      setDialogTotalCount(res.totalCount || 0);

      if (options.length > 0) {
        setSelectedFilterKey(options[0].key);
        if (options[0].values && options[0].values.length > 0) {
          setSelectedFilterValue(options[0].values[0].value);
        }
      }
    } catch (e) {
      Swal.fire("Error", e.message || "Failed to fetch filter options", "error");
    } finally {
      setLoadingOptions(false);
    }
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

  const executeDownload = (isAll = false) => {
    if (dialogTotalCount === 0) {
      Swal.fire("No Phrases", "There are no phrases available for download matching this selection.", "warning");
      return;
    }

    const token = getClientToken();
    const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
    let url = `${backendUrl}/api/admin/phrases/download-company?company=${encodeURIComponent(dialogCompany)}&status=${dialogStatus}`;

    if (!isAll && selectedFilterKey && selectedFilterValue) {
      url += `&filterKey=${encodeURIComponent(selectedFilterKey)}&filterValue=${encodeURIComponent(selectedFilterValue)}`;
    }
    if (token) {
      url += `&token=${encodeURIComponent(token)}`;
    }

    // Trigger download in browser
    window.location.href = url;

    setDialogOpen(false);
    Swal.fire({
      toast: true,
      position: "top-end",
      icon: "success",
      title: "ZIP compilation started. Your download will begin shortly.",
      timer: 3500,
      showConfirmButton: false
    });

    setTimeout(() => {
      loadData();
    }, 4000);
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

    const token = getClientToken();
    const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
    const url = `${backendUrl}/api/admin/phrases/download-company?company=${encodeURIComponent(companyName)}&type=${type}${token ? `&token=${encodeURIComponent(token)}` : ""}`;
    window.location.href = url;

    Swal.fire({
      toast: true,
      position: "top-end",
      icon: "success",
      title: "ZIP archive download initiated.",
      timer: 3000,
      showConfirmButton: false
    });
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
                    <div className="bg-neutral-800/80 border border-neutral-700/80 rounded-xl p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-neutral-300">Total Phrases to Bundle:</span>
                        <span className="text-base font-mono font-bold text-primary-400">{dialogTotalCount} Phrases</span>
                      </div>
                      <p className="text-xs text-neutral-400">
                        Will generate complete ZIP archive with all {dialogTotalCount} {dialogStatus} audio files and complete JSON metadata catalogs.
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
                <button
                  type="button"
                  onClick={() => executeDownload(true)}
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
              ) : (
                <button
                  type="button"
                  onClick={() => executeDownload(false)}
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
