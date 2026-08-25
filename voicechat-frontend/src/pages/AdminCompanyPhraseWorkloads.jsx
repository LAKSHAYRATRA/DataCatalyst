import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminNav from "../components/AdminNav";
import { 
  ArrowLeft, 
  Building2, 
  Globe, 
  Loader2, 
  FileText, 
  ChevronRight,
  Layers
} from "lucide-react";
import Swal from "sweetalert2";
import { apiGet } from "../lib/api.js";

export default function AdminCompanyPhraseWorkloads() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [company, setCompany] = useState(null);
  const [languages, setLanguages] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLanguages = async () => {
      setLoading(true);
      try {
        const data = await apiGet(`/api/admin/companies/${id}/phrase-workloads`);
        setCompany(data.company);
        setLanguages(data.languages || []);
        setSummary(data.summary || null);
      } catch (err) {
        Swal.fire({
          icon: "error",
          title: "Error Loading Workloads",
          text: err.message,
          confirmButtonColor: "#ea580c"
        });
      } finally {
        setLoading(false);
      }
    };

    fetchLanguages();
  }, [id]);

  return (
    <div className="min-h-screen bg-neutral-900 flex text-white transition-colors duration-300">
      <AdminNav />
      <main className="flex-1 md:ml-64 p-6 md:p-8 max-w-7xl mx-auto text-neutral-100">
        {/* Header Navigation */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/admin/companies")}
              className="btn btn-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Companies
            </button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3 text-white">
                <Building2 className="w-7 h-7 text-primary-500" />
                {company ? company.name : "Company"} Phrase Workloads
                {company && (
                  <span className="text-xs bg-primary-900/40 text-primary-300 border border-primary-700/50 px-3 py-1 rounded-full font-semibold">
                    Target Frequency: {company.singlePhraseFrequency || 1} unique {company.singlePhraseFrequency === 1 ? 'contributor' : 'contributors'} / phrase
                  </span>
                )}
              </h1>
              <p className="text-sm text-neutral-400 mt-1">
                Inspect phrase databases by language, monitor speaker allocations (Reserved vs Open Pool), and manage workload inventory.
              </p>
            </div>
          </div>
        </div>

        {/* Company Allocation & Progress Summary Banner */}
        {summary && summary.totalPhrases > 0 && (
          <div className="mb-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-neutral-800/90 border border-neutral-700 p-4 rounded-xl shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Total Workload</div>
              <div className="text-2xl font-black text-white mt-1">{summary.totalPhrases}</div>
              <div className="text-[11px] text-neutral-400 mt-0.5">{languages.length} {languages.length === 1 ? 'Language' : 'Languages'}</div>
            </div>

            <div className="bg-indigo-950/40 border border-indigo-700/60 p-4 rounded-xl shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1">
                <span>🔒</span> Reserved
              </div>
              <div className="text-2xl font-black text-indigo-200 mt-1">{summary.totalReserved}</div>
              <div className="text-[11px] text-indigo-400 mt-0.5">
                {summary.totalPhrases > 0 ? Math.round((summary.totalReserved / summary.totalPhrases) * 100) : 0}% of workload
              </div>
            </div>

            <div className="bg-teal-950/40 border border-teal-700/60 p-4 rounded-xl shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-teal-300 flex items-center gap-1">
                <span>🌐</span> Open Pool
              </div>
              <div className="text-2xl font-black text-teal-200 mt-1">{summary.totalOpenPool}</div>
              <div className="text-[11px] text-teal-400 mt-0.5">
                {summary.totalPhrases > 0 ? Math.round((summary.totalOpenPool / summary.totalPhrases) * 100) : 0}% of workload
              </div>
            </div>

            <div className="bg-neutral-800/90 border border-neutral-700 p-4 rounded-xl shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Pending</div>
              <div className="text-2xl font-black text-amber-400 mt-1">{summary.totalPending}</div>
              <div className="text-[11px] text-neutral-400 mt-0.5">Awaiting recording</div>
            </div>

            <div className="bg-neutral-800/90 border border-neutral-700 p-4 rounded-xl shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Recorded</div>
              <div className="text-2xl font-black text-blue-400 mt-1">{summary.totalRecorded}</div>
              <div className="text-[11px] text-neutral-400 mt-0.5">In QA review queue</div>
            </div>

            <div className="bg-neutral-800/90 border border-neutral-700 p-4 rounded-xl shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Approved</div>
              <div className="text-2xl font-black text-emerald-400 mt-1">{summary.totalApproved}</div>
              <div className="text-[11px] text-neutral-400 mt-0.5">QA Completed</div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="bg-neutral-800 border border-neutral-700 rounded-2xl text-center py-20 shadow-xl">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto mb-3" />
            <p className="text-neutral-400">Loading workload languages...</p>
          </div>
        ) : languages.length === 0 ? (
          <div className="bg-neutral-800 border border-neutral-700 rounded-2xl text-center py-20 shadow-xl">
            <FileText className="w-12 h-12 text-neutral-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2 text-white">No Phrase Workloads Found</h3>
            <p className="text-neutral-400 mb-6">
              No phrase batches have been ingested for {company ? company.name : "this company"} yet.
            </p>
            <button
              onClick={() => navigate("/admin/phrases")}
              className="btn btn-primary btn-sm inline-flex items-center gap-2"
            >
              Upload Phrases Batch
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-white">
                <Globe className="w-5 h-5 text-primary-500" />
                Workload Languages ({languages.length})
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {languages.map((lang) => (
                <div
                  key={lang.code}
                  onClick={() => navigate(`/admin/companies/${id}/phrase-workloads/${lang.code}`)}
                  className="bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 hover:border-primary-500/60 transition-all cursor-pointer group flex flex-col justify-between p-6 rounded-2xl shadow-xl space-y-4"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 rounded-xl bg-neutral-700 text-warning-400 flex items-center justify-center font-bold text-lg group-hover:scale-110 transition-transform border border-neutral-600">
                        {lang.code.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="text-xs font-semibold px-3 py-1 rounded-full bg-neutral-900/80 border border-neutral-700 text-neutral-300 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-primary-500" />
                        {lang.count} {lang.count === 1 ? "Phrase" : "Phrases"}
                      </span>
                    </div>

                    <h3 className="text-xl font-bold text-white group-hover:text-primary-400 transition-colors">
                      {lang.name}
                    </h3>
                    <p className="text-xs text-neutral-400 mt-1">
                      Language Code: <span className="font-mono text-neutral-300">{lang.code}</span>
                    </p>

                    {/* Allocation Breakdown Chips */}
                    <div className="mt-4 pt-3 border-t border-neutral-700/60 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 font-mono flex items-center gap-1">
                        <span>🔒</span> {lang.reservedCount ?? 0} Reserved
                      </span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-teal-950/80 text-teal-300 border border-teal-700/60 font-mono flex items-center gap-1">
                        <span>🌐</span> {lang.openPoolCount ?? 0} Open
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-neutral-700/80 flex items-center justify-between text-xs font-semibold text-primary-400 group-hover:text-primary-300">
                    <span>View Phrase Database</span>
                    <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
