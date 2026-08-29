import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Building2, 
  Settings, 
  Loader2, 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff, 
  Layers, 
  ChevronRight, 
  Search, 
  FileAudio, 
  Clock, 
  DollarSign, 
  Users 
} from 'lucide-react';
import { apiGet, apiPostJson, apiPatchJson, apiDeleteJson } from '../lib/api';
import AdminNav from '../components/AdminNav.jsx';
import Swal from 'sweetalert2';

export default function AdminCompanies() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newSamples, setNewSamples] = useState(1);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const res = await apiGet('/api/admin/companies');
      setCompanies(res.companies || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const toggleHideCompany = async (e, companyId, companyName, currentIsHidden) => {
    e.stopPropagation();
    const actionText = currentIsHidden ? "Unhide" : "Hide";
    const confirm = await Swal.fire({
      title: `${actionText} Project?`,
      text: currentIsHidden 
        ? `Unhiding "${companyName}" will make it visible to contributors on Project Applications and Phrase Studio.`
        : `Hiding "${companyName}" will hide it from contributors (e.g. if the project is completed) without deleting data.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: currentIsHidden ? "#10b981" : "#f59e0b",
      confirmButtonText: `Yes, ${actionText} Project`
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await apiPatchJson(`/api/admin/companies/${companyId}/toggle-hide`, {});
      setCompanies(prev => prev.map(c => {
        if (c._id === companyId) {
          return { ...c, isHidden: res.isHidden };
        }
        return c;
      }));
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: res.message || `Project ${actionText.toLowerCase()}d`,
        timer: 2500,
        showConfirmButton: false
      });
    } catch (err) {
      Swal.fire("Error", "Failed to toggle project visibility: " + err.message, "error");
    }
  };

  const toggleBoostCompany = async (e, companyId, companyName, currentIsBoosted, isHidden) => {
    e.stopPropagation();
    const nextBoost = !currentIsBoosted;
    if (nextBoost && isHidden) {
      Swal.fire({
        icon: "warning",
        title: "Project is Hidden",
        text: `Cannot boost "${companyName}" because the project is hidden. Please unhide the project first before boosting.`,
        confirmButtonColor: "#f59e0b"
      });
      return;
    }
    try {
      await apiPatchJson(`/api/admin/companies/${companyId}`, { isBoosted: nextBoost });
      setCompanies(prev => prev.map(c => {
        if (c._id === companyId) {
          return { ...c, isBoosted: nextBoost };
        }
        return c;
      }));
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: nextBoost ? `"${companyName}" boosted & recommended on Dashboard!` : `"${companyName}" unboosted`,
        timer: 2500,
        showConfirmButton: false
      });
    } catch (err) {
      Swal.fire("Cannot Boost Project", err.message, "error");
    }
  };

  const createCompany = async () => {
    if (!newCompanyName.trim()) return;
    setIsCreating(true);
    try {
      await apiPostJson('/api/admin/companies', {
        name: newCompanyName.trim(),
        projectName: newProjectName.trim(),
        numberOfSamples: Math.max(1, Number(newSamples) || 1),
        maxContributionMinutes: 195,
        hourlyPayout: 0,
        namingPattern: '{phraseId}'
      });
      setNewCompanyName('');
      setNewProjectName('');
      setNewSamples(1);
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Company project created successfully!',
        timer: 2500,
        showConfirmButton: false
      });
      fetchData();
    } catch (err) {
      Swal.fire('Error', 'Failed to create company: ' + err.message, 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const deleteCompany = async (e, companyId, companyName) => {
    e.stopPropagation();
    const confirm = await Swal.fire({
      title: "Delete Company?",
      text: `Are you sure you want to delete ${companyName}? All its pending phrases will also be permanently deleted. This action cannot be undone.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Yes, delete it!"
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await apiDeleteJson(`/api/admin/companies/${companyId}`);
      const phraseMsg = res?.deletedPhrases > 0
        ? ` (${res.deletedPhrases} pending phrase${res.deletedPhrases !== 1 ? 's' : ''} also deleted)`
        : '';
      Swal.fire('Deleted!', `Company deleted.${phraseMsg}`, 'success');
      fetchData();
    } catch (err) {
      Swal.fire('Error', 'Failed to delete company: ' + err.message, 'error');
    }
  };

  const filteredCompanies = companies.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.projectName && c.projectName.toLowerCase().includes(q))
    );
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-900 flex text-white">
        <AdminNav />
        <main className="flex-1 md:ml-64 p-8 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-warning-500" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-900 flex text-neutral-100 transition-colors duration-300">
      <AdminNav />
      <main className="flex-1 md:ml-64 p-6 md:p-10 max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-neutral-800/60 border border-neutral-700/60 p-6 rounded-2xl shadow-xl">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white flex items-center gap-3">
              <Building2 className="w-7 h-7 text-warning-400" />
              <span>Company Phrase Configs</span>
            </h1>
            <p className="text-neutral-400 text-sm mt-1">
              Select a project to configure payrates, sample requirements, naming patterns, and tags.
            </p>
          </div>
        </div>

        {/* Add New Company Card */}
        <div className="bg-neutral-800/80 border border-neutral-700/70 p-6 rounded-2xl mb-8 shadow-xl">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-warning-400" />
            <span>Create New Company Project</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1">Company Internal Name / S3 Folder</label>
              <input 
                type="text" 
                className="w-full px-3.5 py-2.5 bg-neutral-900/90 border border-neutral-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-warning-500" 
                placeholder="e.g. Acme_Corp" 
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1">Project Display Name (Contributors)</label>
              <input 
                type="text" 
                className="w-full px-3.5 py-2.5 bg-neutral-900/90 border border-neutral-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-warning-500" 
                placeholder="e.g. Acme Speech Project" 
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-neutral-300 mb-1">Samples Required</label>
                <input 
                  type="number"
                  min="1"
                  max="20"
                  className="w-full px-3.5 py-2.5 bg-neutral-900/90 border border-neutral-700 rounded-xl text-white text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-warning-500" 
                  value={newSamples}
                  onChange={(e) => setNewSamples(e.target.value)}
                />
              </div>
              <button 
                className="px-5 py-2.5 bg-gradient-to-r from-warning-600 to-amber-600 hover:from-warning-500 hover:to-amber-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg disabled:opacity-50 h-[42px]"
                onClick={createCompany}
                disabled={isCreating || !newCompanyName.trim()}
              >
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>Add Project</span>
              </button>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
          <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search company configs by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-neutral-800/90 border border-neutral-700 text-white text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-warning-500 transition-all placeholder:text-neutral-500 shadow-md"
          />
        </div>

        {/* Companies Grid */}
        {filteredCompanies.length === 0 ? (
          <div className="text-center py-20 bg-neutral-800/40 border border-neutral-700/50 rounded-2xl text-neutral-500">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30 text-neutral-400" />
            <p className="text-base font-semibold text-neutral-300">No company configs found</p>
            <p className="text-xs text-neutral-500 mt-1">Create a new company above to configure its phrase settings.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCompanies.map((company) => (
              <div 
                key={company._id}
                onClick={() => navigate(`/admin/companies/${company._id}/config`)}
                className={`group bg-neutral-800/80 hover:bg-neutral-800 border rounded-2xl p-6 transition-all duration-300 shadow-lg hover:shadow-2xl hover:scale-[1.01] cursor-pointer flex flex-col justify-between ${
                  company.isHidden 
                    ? 'border-dashed border-rose-500/40 bg-rose-950/10' 
                    : 'border-neutral-700/70 hover:border-warning-500/60'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neutral-700 to-neutral-900 border border-neutral-600 flex items-center justify-center group-hover:border-warning-500/50 transition-colors">
                        <Building2 className="w-5 h-5 text-warning-400" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white group-hover:text-warning-300 transition-colors leading-tight">
                          {company.projectName || company.name}
                        </h3>
                        <span className="text-xs text-neutral-400 font-mono block mt-0.5">
                          {company.name}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {company.isBoosted && (
                        <span className="text-[11px] bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 border border-amber-500/50 px-2 py-0.5 rounded-full font-extrabold flex items-center gap-1 shadow-sm">
                          🔥 Boosted
                        </span>
                      )}
                      {company.isHidden ? (
                        <span className="text-[11px] bg-rose-900/50 text-rose-300 border border-rose-600/60 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                          <EyeOff className="w-3 h-3" /> Hidden
                        </span>
                      ) : (
                        <span className="text-[11px] bg-emerald-900/40 text-emerald-300 border border-emerald-600/50 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                          <Eye className="w-3 h-3" /> Active
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Config Highlights Grid */}
                  <div className="grid grid-cols-2 gap-2 bg-neutral-900/60 border border-neutral-700/40 rounded-xl p-3 text-xs mb-4">
                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase font-bold flex items-center gap-1">
                        <FileAudio className="w-3 h-3 text-warning-400" />
                        <span>Samples Req.</span>
                      </span>
                      <span className="text-white font-bold font-mono text-sm">
                        {company.numberOfSamples || 1} sample{company.numberOfSamples !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase font-bold flex items-center gap-1">
                        <DollarSign className="w-3 h-3 text-emerald-400" />
                        <span>Payrate</span>
                      </span>
                      <span className="text-white font-bold font-mono text-sm">
                        {company.hourlyPayout ? `$${company.hourlyPayout}/hr` : 'Default'}
                      </span>
                    </div>

                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase font-bold flex items-center gap-1">
                        <Clock className="w-3 h-3 text-neutral-400" />
                        <span>Max Limit</span>
                      </span>
                      <span className="text-white font-bold font-mono text-sm">
                        {company.maxContributionMinutes || 195} mins
                      </span>
                    </div>

                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase font-bold flex items-center gap-1">
                        <Users className="w-3 h-3 text-neutral-400" />
                        <span>Frequency</span>
                      </span>
                      <span className="text-white font-bold font-mono text-sm">
                        {company.singlePhraseFrequency || 1}x / phrase
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Actions & Footer */}
                <div className="pt-3 border-t border-neutral-700/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); navigate(`/admin/companies/${company._id}/phrase-workloads`); }}
                      className="p-1.5 px-2.5 bg-neutral-700/80 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="View phrase workloads"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Workloads</span>
                    </button>
                    <button 
                      onClick={(e) => toggleBoostCompany(e, company._id, company.projectName || company.name, company.isBoosted, company.isHidden)}
                      className={`p-1.5 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                        company.isBoosted
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                          : 'bg-neutral-700/80 hover:bg-neutral-700 text-neutral-300 hover:text-white'
                      }`}
                      title={company.isBoosted ? "Unboost from Dashboard" : "Boost & Recommend on Dashboard"}
                    >
                      <span>🚀 {company.isBoosted ? 'Boosted' : 'Boost'}</span>
                    </button>
                    <button 
                      onClick={(e) => toggleHideCompany(e, company._id, company.name, company.isHidden)}
                      className={`p-1.5 rounded-lg text-xs font-bold transition-colors ${
                        company.isHidden 
                          ? 'bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200' 
                          : 'bg-neutral-700/80 hover:bg-neutral-700 text-neutral-300'
                      }`}
                      title={company.isHidden ? "Unhide project" : "Hide project"}
                    >
                      {company.isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    <button 
                      onClick={(e) => deleteCompany(e, company._id, company.name)}
                      className="p-1.5 bg-neutral-700/80 hover:bg-rose-900/60 text-neutral-400 hover:text-rose-300 rounded-lg text-xs transition-colors"
                      title="Delete company"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1 text-xs text-warning-400 font-bold group-hover:text-warning-300">
                    <span>Configure</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
