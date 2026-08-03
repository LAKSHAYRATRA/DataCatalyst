import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminNav from "../components/AdminNav.jsx";
import { 
  ArrowLeft, 
  Building2, 
  Globe, 
  Loader2, 
  Users, 
  ChevronRight,
  BarChart3,
  Search,
  CheckCircle,
  Clock
} from "lucide-react";
import Swal from "sweetalert2";
import { apiGet, apiPostJson } from "../lib/api.js";

export default function AdminCompanyContributorsSummary() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [company, setCompany] = useState(null);
  const [languages, setLanguages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLangCode, setSelectedLangCode] = useState(null);
  const [userTab, setUserTab] = useState("approved"); // "approved" | "pending"
  const [userSearch, setUserSearch] = useState("");

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    setLoading(true);
    try {
      const data = await apiGet(`/api/admin/companies/${id}/contributors-summary`);
      setCompany(data.company);
      const langs = data.languages || [];
      setLanguages(langs);
      if (langs.length > 0) {
        setSelectedLangCode(langs[0].code);
      }
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Error Loading Summary",
        text: err.message,
        confirmButtonColor: "#ea580c"
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveContributor(userObj) {
    const compName = company ? (company.projectName || company.name) : "this company";
    const result = await Swal.fire({
      title: "Remove Contributor?",
      text: `Are you sure you want to remove ${userObj.firstname || userObj.username} from doing phrases for ${compName}? Doing so will hide all projects for this company from this contributor and prevent phrase access.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#475569",
      confirmButtonText: "Yes, Remove Contributor",
      background: "#1f2937",
      color: "#fff"
    });

    if (result.isConfirmed) {
      try {
        await apiPostJson(`/api/admin/companies/${id}/remove-contributor`, {
          userId: userObj._id,
          languageCode: selectedLangCode
        });
        Swal.fire({
          title: "Removed!",
          text: `${userObj.firstname || userObj.username} has been removed from ${compName}.`,
          icon: "success",
          background: "#1f2937",
          color: "#fff"
        });
        fetchData();
      } catch (e) {
        Swal.fire({
          title: "Error",
          text: e.message,
          icon: "error",
          background: "#1f2937",
          color: "#fff"
        });
      }
    }
  }

  const selectedLangData = languages.find(l => l.code === selectedLangCode) || languages[0];

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
                <Building2 className="w-7 h-7 text-warning-500" />
                {company ? (company.projectName || company.name) : "Company"} Contributors Summary
              </h1>
              <p className="text-sm text-neutral-400 mt-1">
                Select a language below to view contributor demographics (male, female, 18-30, 30-45, 45-60) and approved/pending user lists.
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="bg-neutral-800 border border-neutral-700 rounded-2xl text-center py-20 shadow-xl">
            <Loader2 className="w-8 h-8 animate-spin text-warning-500 mx-auto mb-3" />
            <p className="text-neutral-400">Loading contributor summary data...</p>
          </div>
        ) : languages.length === 0 ? (
          <div className="bg-neutral-800 border border-neutral-700 rounded-2xl text-center py-20 shadow-xl">
            <Users className="w-12 h-12 text-neutral-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2 text-white">No Workload Languages Found</h3>
            <p className="text-neutral-400 mb-6">
              No phrase recordings or applications found for {company ? company.name : "this company"}.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Workload Languages Cards */}
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2 text-white mb-4">
                <Globe className="w-5 h-5 text-warning-500" />
                Workload Languages ({languages.length})
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {languages.map((lang) => {
                  const isSelected = selectedLangCode === lang.code;
                  return (
                    <div
                      key={lang.code}
                      onClick={() => {
                        setSelectedLangCode(lang.code);
                        setUserTab("approved");
                        setUserSearch("");
                      }}
                      className={`border transition-all cursor-pointer p-5 rounded-2xl shadow-lg flex flex-col justify-between ${
                        isSelected 
                          ? "bg-neutral-800 border-warning-500 ring-2 ring-warning-500/30" 
                          : "bg-neutral-800/80 hover:bg-neutral-800 border-neutral-700 hover:border-neutral-600"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="w-10 h-10 rounded-xl bg-neutral-700 text-warning-400 flex items-center justify-center font-bold text-sm border border-neutral-600">
                            {lang.code.substring(0, 2).toUpperCase()}
                          </div>
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-neutral-900 border border-neutral-700 text-neutral-300 flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-warning-400" />
                            {lang.summary.totalContributors} Contributors
                          </span>
                        </div>

                        <h3 className="text-lg font-bold text-white">
                          {lang.name}
                        </h3>
                        <p className="text-xs text-neutral-400 mt-0.5">
                          {lang.phraseCount} Recorded Phrases
                        </p>

                        <div className="flex flex-wrap gap-1.5 mt-3 text-[11px]">
                          <span className="px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-900/50">
                            ♂ {lang.summary.male}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-pink-950/80 text-pink-300 border border-pink-900/50">
                            ♀ {lang.summary.female}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-warning-950/80 text-warning-300 border border-warning-900/50">
                            18-30: {lang.summary.age_18_30}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-neutral-700/80 flex items-center justify-between text-xs font-semibold text-warning-400">
                        <span>{isSelected ? "Active View" : "Select Language"}</span>
                        <ChevronRight className={`w-4 h-4 transform transition-transform ${isSelected ? "rotate-90" : ""}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected Language Demographics & Users Detail */}
            {selectedLangData && (
              <div className="bg-neutral-800 border border-neutral-700 rounded-2xl p-6 shadow-2xl space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-700 pb-4">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <BarChart3 className="w-6 h-6 text-warning-500" />
                      Demographics & Contributor Summary
                      <span className="text-warning-400 font-semibold">— {selectedLangData.name}</span>
                    </h2>
                    <p className="text-xs text-neutral-400 mt-1">
                      Showing detailed age, gender, and contributor user lists for {selectedLangData.name} in {company ? company.name : "Company"}.
                    </p>
                  </div>
                </div>

                {/* Demographics Overview Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-neutral-750 border border-neutral-700 p-4 rounded-xl">
                    <span className="text-xs text-neutral-400 font-medium">Total Contributors</span>
                    <div className="text-2xl font-bold text-white mt-1">{selectedLangData.summary.totalContributors}</div>
                  </div>
                  <div className="bg-neutral-750 border border-neutral-700 p-4 rounded-xl">
                    <span className="text-xs text-blue-400 font-medium">Male Contributors</span>
                    <div className="text-2xl font-bold text-blue-400 mt-1">{selectedLangData.summary.male}</div>
                  </div>
                  <div className="bg-neutral-750 border border-neutral-700 p-4 rounded-xl">
                    <span className="text-xs text-pink-400 font-medium">Female Contributors</span>
                    <div className="text-2xl font-bold text-pink-400 mt-1">{selectedLangData.summary.female}</div>
                  </div>
                  <div className="bg-neutral-750 border border-neutral-700 p-4 rounded-xl">
                    <span className="text-xs text-emerald-400 font-medium">Approved / Pending Users</span>
                    <div className="text-2xl font-bold text-emerald-400 mt-1">
                      {selectedLangData.summary.approvedUsers.length} <span className="text-neutral-500 text-sm font-normal">/ {selectedLangData.summary.pendingUsers.length}</span>
                    </div>
                  </div>
                </div>

                {/* Gender & Age Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Gender Breakdown */}
                  <div className="bg-neutral-750 border border-neutral-700 p-5 rounded-xl">
                    <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-wider mb-4">Gender Breakdown</h3>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-neutral-300 font-medium">Male</span>
                          <span className="text-blue-400 font-semibold">
                            {selectedLangData.summary.male} ({selectedLangData.summary.totalContributors > 0 ? Math.round((selectedLangData.summary.male / selectedLangData.summary.totalContributors) * 100) : 0}%)
                          </span>
                        </div>
                        <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                          <div className="bg-blue-500 h-full rounded-full" style={{ width: `${selectedLangData.summary.totalContributors > 0 ? (selectedLangData.summary.male / selectedLangData.summary.totalContributors) * 100 : 0}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-neutral-300 font-medium">Female</span>
                          <span className="text-pink-400 font-semibold">
                            {selectedLangData.summary.female} ({selectedLangData.summary.totalContributors > 0 ? Math.round((selectedLangData.summary.female / selectedLangData.summary.totalContributors) * 100) : 0}%)
                          </span>
                        </div>
                        <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                          <div className="bg-pink-500 h-full rounded-full" style={{ width: `${selectedLangData.summary.totalContributors > 0 ? (selectedLangData.summary.female / selectedLangData.summary.totalContributors) * 100 : 0}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-neutral-300 font-medium">Other / Unspecified</span>
                          <span className="text-neutral-400 font-semibold">{selectedLangData.summary.otherGender}</span>
                        </div>
                        <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                          <div className="bg-neutral-500 h-full rounded-full" style={{ width: `${selectedLangData.summary.totalContributors > 0 ? (selectedLangData.summary.otherGender / selectedLangData.summary.totalContributors) * 100 : 0}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Age Distribution */}
                  <div className="bg-neutral-750 border border-neutral-700 p-5 rounded-xl">
                    <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-wider mb-4">Age Distribution</h3>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-neutral-300 font-medium">18 – 30 Years</span>
                          <span className="text-warning-400 font-semibold">{selectedLangData.summary.age_18_30} contributors</span>
                        </div>
                        <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                          <div className="bg-warning-500 h-full rounded-full" style={{ width: `${selectedLangData.summary.totalContributors > 0 ? (selectedLangData.summary.age_18_30 / selectedLangData.summary.totalContributors) * 100 : 0}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-neutral-300 font-medium">30 – 45 Years</span>
                          <span className="text-warning-400 font-semibold">{selectedLangData.summary.age_30_45} contributors</span>
                        </div>
                        <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                          <div className="bg-amber-500 h-full rounded-full" style={{ width: `${selectedLangData.summary.totalContributors > 0 ? (selectedLangData.summary.age_30_45 / selectedLangData.summary.totalContributors) * 100 : 0}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-neutral-300 font-medium">45 – 60 Years</span>
                          <span className="text-warning-400 font-semibold">{selectedLangData.summary.age_45_60} contributors</span>
                        </div>
                        <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                          <div className="bg-orange-500 h-full rounded-full" style={{ width: `${selectedLangData.summary.totalContributors > 0 ? (selectedLangData.summary.age_45_60 / selectedLangData.summary.totalContributors) * 100 : 0}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-neutral-300 font-medium">60+ Years</span>
                          <span className="text-warning-400 font-semibold">{selectedLangData.summary.age_60_plus} contributors</span>
                        </div>
                        <div className="w-full bg-neutral-700 h-2 rounded-full overflow-hidden">
                          <div className="bg-red-500 h-full rounded-full" style={{ width: `${selectedLangData.summary.totalContributors > 0 ? (selectedLangData.summary.age_60_plus / selectedLangData.summary.totalContributors) * 100 : 0}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contributors User Lists Tab */}
                <div className="pt-4 border-t border-neutral-700">
                  <div className="flex items-center justify-between border-b border-neutral-700 pb-3 mb-4 gap-4 flex-wrap">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setUserTab("approved")}
                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                          userTab === "approved" ? "bg-emerald-600 text-white" : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
                        }`}
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Approved Contributors ({selectedLangData.summary.approvedUsers.length})
                      </button>
                      <button
                        onClick={() => setUserTab("pending")}
                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                          userTab === "pending" ? "bg-amber-600 text-white" : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        Pending Contributors ({selectedLangData.summary.pendingUsers.length})
                      </button>
                    </div>

                    <div className="relative min-w-[240px]">
                      <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search by name, email, speaker_id..."
                        value={userSearch}
                        onChange={e => setUserSearch(e.target.value)}
                        className="bg-neutral-700 border border-neutral-600 text-white placeholder-neutral-400 text-xs rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-warning-500 w-full"
                      />
                    </div>
                  </div>

                  {/* Table */}
                  {(() => {
                    const list = userTab === "approved" ? selectedLangData.summary.approvedUsers : selectedLangData.summary.pendingUsers;
                    const filtered = list.filter(u => {
                      if (!userSearch.trim()) return true;
                      const q = userSearch.toLowerCase();
                      return (
                        (u.firstname + " " + u.lastname).toLowerCase().includes(q) ||
                        (u.username || "").toLowerCase().includes(q) ||
                        (u.email || "").toLowerCase().includes(q) ||
                        (u.speaker_id || "").toLowerCase().includes(q) ||
                        (u.state || "").toLowerCase().includes(q)
                      );
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="text-center py-12 text-neutral-400 text-sm">
                          No {userTab} contributors found for {selectedLangData.name}.
                        </div>
                      );
                    }

                    return (
                      <div className="border border-neutral-700 rounded-xl overflow-hidden bg-neutral-850">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-neutral-700 text-neutral-300 uppercase tracking-wider font-semibold">
                              <tr>
                                <th className="px-4 py-2.5 text-left">Speaker ID</th>
                                <th className="px-4 py-2.5 text-left">Contributor</th>
                                <th className="px-4 py-2.5 text-left">Email</th>
                                <th className="px-4 py-2.5 text-left">Gender / Age</th>
                                <th className="px-4 py-2.5 text-left">State / Locality</th>
                                <th className="px-4 py-2.5 text-left">Status</th>
                                <th className="px-4 py-2.5 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-700/80">
                              {filtered.map(u => (
                                <tr key={u._id} className="hover:bg-neutral-700/40">
                                  <td className="px-4 py-2.5 font-mono text-warning-400 font-semibold">{u.speaker_id}</td>
                                  <td className="px-4 py-2.5 font-medium text-white">
                                    {u.firstname} {u.lastname}
                                    <div className="text-[10px] text-neutral-400 font-normal">@{u.username}</div>
                                  </td>
                                  <td className="px-4 py-2.5 text-neutral-300">{u.email}</td>
                                  <td className="px-4 py-2.5 capitalize text-neutral-300">
                                    {u.gender} <span className="text-neutral-400">({u.age} yrs)</span>
                                  </td>
                                  <td className="px-4 py-2.5 text-neutral-300">
                                    {u.state} <span className="text-neutral-400">({u.locality})</span>
                                  </td>
                                  <td className="px-4 py-2.5">
                                    {u.status === "approved" ? (
                                      <span className="px-2 py-0.5 bg-emerald-900/60 text-emerald-300 text-[10px] font-bold rounded-full">Approved</span>
                                    ) : (
                                      <span className="px-2 py-0.5 bg-amber-900/60 text-amber-300 text-[10px] font-bold rounded-full">Pending</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5 text-right">
                                    {userTab === "approved" && (
                                      <button
                                        onClick={() => handleRemoveContributor(u)}
                                        className="px-2.5 py-1 bg-red-600/90 hover:bg-red-600 text-white text-[11px] font-bold rounded-lg transition-colors shadow-sm whitespace-nowrap"
                                      >
                                        Remove Contributor
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
