import React, { useEffect, useState } from "react";
import { Download, RefreshCw, Layers, CheckCircle, Clock, XCircle, FileAudio, AlertTriangle } from "lucide-react";
import Swal from "sweetalert2";
import { apiGet } from "../lib/api.js";

export default function AdminPhraseDownloads() {
  const [companies, setCompanies] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

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

  const handleDownload = async (companyName) => {
    const companyStats = stats[companyName] || { approved: 0 };
    if (!companyStats.approved || companyStats.approved === 0) {
      Swal.fire("No Approved Phrases", "There are no QA-approved phrases available for download under this company.", "warning");
      return;
    }

    const confirm = await Swal.fire({
      title: "Download QA Approved ZIP?",
      text: `This will bundle all ${companyStats.approved} approved phrases for "${companyName}" into a ZIP archive and archive them in S3.`,
      icon: "info",
      showCancelButton: true,
      confirmButtonText: "Download ZIP",
      cancelButtonText: "Cancel"
    });

    if (!confirm.isConfirmed) return;

    try {
      const token = getClientToken();
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
      const url = `${backendUrl}/api/admin/phrases/download-company?company=${encodeURIComponent(companyName)}${token ? `&token=${encodeURIComponent(token)}` : ""}`;
      
      // Trigger download
      window.location.href = url;

      Swal.fire("Success", "ZIP archive compilation started. Your download will begin shortly.", "success");
      
      // Reload stats after compilation start to reflect moving
      setTimeout(() => {
        loadData();
      }, 4000);
    } catch (e) {
      Swal.fire("Error", e.message || "Failed to initiate download.", "error");
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white flex items-center gap-3">
            <Download className="w-8 h-8 text-warning-500" />
            Phrase Downloads
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Download QA-approved phrases packaged by company. composes audio files (.wav) and metadata mapping JSONs.
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
            const hasApproved = cStats.approved > 0;

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
                        <span className="text-lg font-bold text-neutral-900 dark:text-white">{cStats.approved}</span>
                      </div>
                    </div>
                    <div className="bg-neutral-50 dark:bg-neutral-850 p-3 rounded-xl border border-neutral-100 dark:border-neutral-750 flex items-center gap-3">
                      <Clock className="w-5 h-5 text-warning-500" />
                      <div>
                        <span className="block text-xs text-neutral-400 font-semibold uppercase">Recorded / QA</span>
                        <span className="text-lg font-bold text-neutral-900 dark:text-white">
                          {(cStats.recorded || 0) + (cStats.pending || 0)}
                        </span>
                      </div>
                    </div>
                    <div className="bg-neutral-50 dark:bg-neutral-850 p-3 rounded-xl border border-neutral-100 dark:border-neutral-750 flex items-center gap-3">
                      <XCircle className="w-5 h-5 text-error-500" />
                      <div>
                        <span className="block text-xs text-neutral-400 font-semibold uppercase">Rejected</span>
                        <span className="text-lg font-bold text-neutral-900 dark:text-white">{cStats.rejected}</span>
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

                <button
                  onClick={() => handleDownload(c.name)}
                  disabled={!hasApproved}
                  className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                    hasApproved
                      ? "bg-warning-500 hover:bg-warning-600 text-neutral-950 shadow-lg shadow-warning-500/10 hover:shadow-warning-500/25"
                      : "bg-neutral-200 dark:bg-neutral-700 text-neutral-400 dark:text-neutral-500 cursor-not-allowed"
                  }`}
                >
                  <Download className="w-5 h-5" />
                  {hasApproved ? "Download Approved Phrases ZIP" : "No Approved Phrases Available"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
