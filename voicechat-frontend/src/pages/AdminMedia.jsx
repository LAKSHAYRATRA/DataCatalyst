import React, { useEffect, useState } from "react";
import { Folder, FileAudio, Trash2, ChevronRight, HardDrive, RefreshCw, Download, FileText } from "lucide-react";
import Swal from "sweetalert2";
import { apiGet, apiFetch } from "../lib/api.js";
import { getUserInfo } from "../lib/auth.js";

export default function AdminMedia() {
  const user = getUserInfo();
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [prefixPath, setPrefixPath] = useState("");

  const loadExplorer = async (pathTarget = "") => {
    setLoading(true);
    try {
      const data = await apiGet(`/api/admin/s3-explorer?prefix=${encodeURIComponent(pathTarget)}`);
      setFolders(data.folders || []);
      setFiles(data.files || []);
      setPrefixPath(pathTarget);
    } catch (e) {
      Swal.fire("Error", e.body?.error || e.message || "Failed to load S3 objects", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExplorer();
  }, []);

  const handleDelete = async (key) => {
    const confirm = await Swal.fire({
      title: "Delete this permanently?",
      text: `AWS Object: ${key}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Yes, destroy it"
    });

    if (!confirm.isConfirmed) return;

    try {
      const data = await apiFetch("/api/admin/s3-explorer", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key })
      });
      Swal.fire("Deleted!", "Removed from AWS completely.", "success");
      loadExplorer(prefixPath);
    } catch (e) {
      Swal.fire("Error", e.body?.error || e.message || "Network issue removing file.", "error");
    }
  };

  const traverseUp = () => {
    const segments = prefixPath.split("/").filter(Boolean);
    segments.pop();
    const upPath = segments.length > 0 ? segments.join("/") + "/" : "";
    loadExplorer(upPath);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <HardDrive className="w-8 h-8 text-primary-500" /> Amazon S3 Library
          </h1>
          <p className="text-neutral-500 mt-2">Visually manage, review, and delete synchronized AWS blocks globally.</p>
        </div>
        <button className="btn btn-secondary flex items-center gap-2" onClick={() => loadExplorer(prefixPath)}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="card p-0 overflow-hidden border border-neutral-200 dark:border-neutral-800">
        <div className="bg-neutral-100 dark:bg-neutral-800 p-4 flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-700">
          <span className="font-mono text-sm opacity-60">s3://bucket/</span>
          {prefixPath.split("/").filter(Boolean).map((seg, i, arr) => (
            <React.Fragment key={i}>
              <button 
                onClick={() => loadExplorer(arr.slice(0, i + 1).join("/") + "/")}
                className="hover:underline font-mono text-sm text-primary-600 dark:text-primary-400"
              >
                {seg}
              </button>
              <ChevronRight className="w-4 h-4 opacity-40 mx-1" />
            </React.Fragment>
          ))}
        </div>

        <div className="p-4 bg-white dark:bg-neutral-900 min-h-[400px]">
          {loading && <div className="p-10 flex justify-center"><div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div></div>}

          {!loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {prefixPath !== "" && (
                <div onClick={traverseUp} className="flex items-center gap-3 p-4 rounded-lg bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 cursor-pointer border border-transparent transition-colors group">
                  <Folder className="w-8 h-8 text-neutral-400 fill-neutral-200 dark:fill-neutral-700" />
                  <span className="font-medium group-hover:underline">.. (Go Up)</span>
                </div>
              )}

              {folders.map(f => (
                <div key={f} onClick={() => loadExplorer(f)} className="flex items-center gap-3 p-4 rounded-lg bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 hover:border-primary-200 cursor-pointer border border-neutral-200 dark:border-neutral-700 transition-all shadow-sm">
                  <Folder className="w-8 h-8 text-blue-500 fill-blue-200" />
                  <span className="font-medium font-mono text-sm truncate">{f.split('/').slice(-2)[0]}</span>
                </div>
              ))}

              {files.map(f => (
                <div key={f.key} className="flex flex-col justify-between p-4 rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 transition-all shadow-sm">
                  <div className="flex items-start gap-3 mb-4">
                    <FileAudio className="w-8 h-8 text-green-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium font-mono text-xs truncate" title={f.key.split('/').pop()}>{f.key.split('/').pop()}</p>
                      <p className="text-[10px] opacity-60 mt-1 uppercase tracking-wider">{(f.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>

                  {f.context && (
                    <div className="bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-700/50 rounded-md p-3 mb-4 text-sm mt-auto shadow-sm">
                      <button 
                        onClick={() => {
                          const htmlBlock = `
                            <div class="text-left bg-neutral-900 text-green-400 p-4 rounded-lg text-xs font-mono overflow-auto max-h-[400px]">
                              <pre>${JSON.stringify(f.context, null, 2)}</pre>
                            </div>
                          `;
                          Swal.fire({ title: 'Raw Phrase Document', html: htmlBlock, width: 800, showConfirmButton: true, confirmButtonText: "Close" });
                        }}
                        className="flex items-center gap-2 mb-2 hover:bg-primary-50 dark:hover:bg-primary-900/20 px-2 py-1 -ml-2 rounded transition-colors group cursor-pointer w-full text-left"
                      >
                        <FileText className="w-4 h-4 text-primary-500 group-hover:text-primary-600" />
                        <span className="font-bold text-xs uppercase text-primary-600 group-hover:text-primary-700 group-hover:underline">Raw Mongo Data Trace</span>
                      </button>
                      <p className="italic text-neutral-600 dark:text-neutral-400 text-xs mb-3 line-clamp-2">"{f.context.text || 'No text linked'}"</p>
                      
                      <div className="flex flex-wrap gap-2 text-xs mb-2">
                        <span className="bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 rounded font-medium border border-neutral-300 dark:border-neutral-700" title="Company">🏢 {typeof f.context.companyId === 'string' ? f.context.companyId : (f.context.companyId?.name || "No Company")}</span>
                        <span className="bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 rounded font-medium border border-neutral-300 dark:border-neutral-700" title="Contributor">👤 {f.context.contributorId?.username || "Unknown"}</span>
                      </div>
                      <div className="flex gap-2 text-xs">
                        <span className="bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 rounded">{f.context.language || '?'}</span>
                        <span className={`px-2 py-0.5 rounded ${f.context.status === 'approved' ? 'bg-success-100 text-success-700' : f.context.status === 'rejected' ? 'bg-error-100 text-error-700' : 'bg-warning-100 text-warning-700'}`}>{f.context.status || 'unknown'}</span>
                      </div>
                    </div>
                  )}
                  
                  <div className="mb-4 mt-auto">
                    <audio 
                      controls 
                      controlsList="nodownload noplaybackrate"
                      onContextMenu={(e) => e.preventDefault()}
                      className="w-full h-8" 
                      src={`${import.meta.env.VITE_BACKEND_URL || "http://localhost:3001"}/api/admin/s3-download?key=${encodeURIComponent(f.key)}`} 
                      preload="none" 
                    />
                  </div>

                  <div className="flex justify-between border-t border-neutral-200 dark:border-neutral-700 pt-3">
                    {user?.isAdmin && (
                      <a href={`${import.meta.env.VITE_BACKEND_URL || "http://localhost:3001"}/api/admin/s3-download?key=${encodeURIComponent(f.key)}&dl=1`} className="text-xs flex items-center gap-1 text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 dark:bg-primary-900/20 px-3 py-1 rounded">
                        <Download className="w-3 h-3" /> Download
                      </a>
                    )}
                    <button onClick={() => handleDelete(f.key)} className="text-xs flex items-center gap-1 text-error-600 hover:text-error-700 bg-error-50 hover:bg-error-100 dark:bg-error-900/20 px-3 py-1 rounded">
                      <Trash2 className="w-3 h-3" /> Destroy
                    </button>
                  </div>
                </div>
              ))}
              
              {!loading && folders.length === 0 && files.length === 0 && prefixPath === "" && (
                <div className="col-span-full p-10 text-center opacity-50">
                  <p>Your S3 bucket is completely empty.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
