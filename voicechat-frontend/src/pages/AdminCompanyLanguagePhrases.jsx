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
  ChevronRight
} from "lucide-react";
import Swal from "sweetalert2";
import { apiGet, apiPostJson, apiDeleteJson } from "../lib/api.js";

export default function AdminCompanyLanguagePhrases() {
  const { id, language } = useParams();
  const navigate = useNavigate();

  const [company, setCompany] = useState(null);
  const [phrases, setPhrases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPhrases, setTotalPhrases] = useState(0);
  const [actionLoading, setActionLoading] = useState({});

  const fetchPhrases = async (pageNum = page, searchQuery = search) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      params.append("page", pageNum);
      params.append("limit", "50");

      const data = await apiGet(`/api/admin/companies/${id}/phrase-workloads/${encodeURIComponent(language)}?${params.toString()}`);

      setCompany(data.company);
      setPhrases(data.phrases || []);
      setTotalPhrases(data.totalPhrases || 0);
      setTotalPages(data.totalPages || 1);
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
    fetchPhrases(1, search);
  }, [id, language]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchPhrases(1, search);
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
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3 text-white">
                <Globe className="w-7 h-7 text-primary-500" />
                {company ? company.name : "Company"} — {language.toUpperCase()} Phrases
              </h1>
              <p className="text-sm text-neutral-400 mt-1">
                Viewing phrase workload database for {language.toUpperCase()}. Set application test samples and manage phrase items.
              </p>
            </div>
          </div>
        </div>

        {/* Search & Stats Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md relative">
            <input
              type="text"
              placeholder="Search phrases by ID, text, emotion, style..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input w-full pl-10 pr-4 py-2 text-sm bg-neutral-800 border-neutral-700 text-white placeholder-neutral-500 focus:border-primary-500"
            />
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-3" />
          </form>

          <div className="flex items-center gap-4">
            <button
              onClick={handleDeduplicate}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-md"
              title="Remove duplicate phrases for this company"
            >
              🧹 Remove Duplicates
            </button>
            <div className="text-sm font-medium text-neutral-400">
              Total Phrases for <span className="font-bold text-white">{language.toUpperCase()}</span>: {totalPhrases}
            </div>
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
              {search ? "No phrases match your search query." : `No phrases available for ${language.toUpperCase()}.`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-2xl border border-neutral-700 bg-neutral-800 shadow-xl">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-neutral-900/90 border-b border-neutral-700 text-neutral-300 font-semibold">
                    <th className="p-3.5">Phrase ID</th>
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
      </main>
    </div>
  );
}
