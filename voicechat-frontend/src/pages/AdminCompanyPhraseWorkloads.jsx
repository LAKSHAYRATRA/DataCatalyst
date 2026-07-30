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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLanguages = async () => {
      setLoading(true);
      try {
        const data = await apiGet(`/api/admin/companies/${id}/phrase-workloads`);
        setCompany(data.company);
        setLanguages(data.languages || []);
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
              </h1>
              <p className="text-sm text-neutral-400 mt-1">
                Select a language below to inspect its phrase database, assign application test samples, and manage phrase inventory.
              </p>
            </div>
          </div>
        </div>

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
                  className="bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 hover:border-primary-500/60 transition-all cursor-pointer group flex flex-col justify-between p-6 rounded-2xl shadow-xl"
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
                  </div>

                  <div className="mt-6 pt-4 border-t border-neutral-700/80 flex items-center justify-between text-xs font-semibold text-primary-400 group-hover:text-primary-300">
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
