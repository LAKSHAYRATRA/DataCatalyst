import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, Save, Loader2, CheckCircle2, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { apiGet, apiPostJson, apiPatchJson, apiDeleteJson } from '../lib/api';
import AdminNav from '../components/AdminNav.jsx';
import Swal from 'sweetalert2';

export default function AdminCompanies() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState('');
  
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
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

  const handleFieldChange = (companyId, field, value) => {
    setCompanies(prev => prev.map(c => {
      if (c._id !== companyId) return c;
      return { ...c, [field]: value };
    }));
  };

  const toggleHideCompany = async (companyId, companyName, currentIsHidden) => {
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

  const saveCompany = async (companyId) => {
    setSavingId(companyId);
    setMessage('');
    try {
      const company = companies.find(c => c._id === companyId);
      await apiPatchJson(`/api/admin/companies/${companyId}`, {
        maxContributionMinutes: Number(company.maxContributionMinutes),
        hourlyPayout: Number(company.hourlyPayout),
        singlePhraseFrequency: Math.max(1, Number(company.singlePhraseFrequency) || 1),
        projectName: company.projectName || '',
        namingPattern: company.namingPattern || '{phraseId}',
        allowPhraseTextEdit: Boolean(company.allowPhraseTextEdit)
      });
      setMessage('Company saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      Swal.fire('Error', 'Failed to save company: ' + err.message, 'error');
    } finally {
      setSavingId(null);
    }
  };

  const createCompany = async () => {
    if (!newCompanyName.trim()) return;
    setIsCreating(true);
    try {
      await apiPostJson('/api/admin/companies', {
        name: newCompanyName.trim(),
        projectName: newProjectName.trim(),
        maxContributionMinutes: 195,
        hourlyPayout: 0,
        namingPattern: '{phraseId}'
      });
      setNewCompanyName('');
      setNewProjectName('');
      setMessage('Company created successfully!');
      setTimeout(() => setMessage(''), 3000);
      fetchData();
    } catch (err) {
      Swal.fire('Error', 'Failed to create company: ' + err.message, 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const deleteCompany = async (companyId, companyName) => {
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
      setMessage(`Company deleted!${phraseMsg}`);
      setTimeout(() => setMessage(''), 4000);
      fetchData();
    } catch (err) {
      Swal.fire('Error', 'Failed to delete company: ' + err.message, 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex transition-colors duration-300">
        <AdminNav />
        <main className="flex-1 md:ml-64 p-8 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex transition-colors duration-300">
      <AdminNav />
      <main className="flex-1 md:ml-64 p-8 max-w-6xl mx-auto text-neutral-900 dark:text-neutral-50">
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                <Building2 className="w-8 h-8 text-primary-500" />
                Company Configurations
              </h1>
              <p className="text-neutral-500 dark:text-neutral-400">Manage custom contribution time limits, visibility, and payrates per company.</p>
            </div>
            {message && (
              <span className="flex items-center gap-1 text-success-600 bg-success-100 dark:bg-success-900/30 px-4 py-2 rounded-lg font-medium text-sm">
                <CheckCircle2 className="w-4 h-4" /> {message}
              </span>
            )}
          </div>
        </motion.div>

        {/* Create New Company Card */}
        <motion.div 
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="card mb-8 flex flex-wrap items-end gap-4 bg-primary-50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/30"
        >
          <div className="flex-1 min-w-[250px]">
            <label className="block text-sm font-semibold mb-2">Company Name (Internal/S3 Folder)</label>
            <input 
              type="text" 
              className="input w-full mb-3" 
              placeholder="e.g. Acme Corp..." 
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.target.value)}
            />
            <label className="block text-sm font-semibold mb-2">Project Name (Shown to Contributors)</label>
            <input 
              type="text" 
              className="input w-full" 
              placeholder="e.g. Acme Speech Project..." 
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createCompany()}
            />
          </div>
          <button 
            className="btn btn-primary flex items-center gap-2 h-[42px]"
            onClick={createCompany}
            disabled={isCreating || !newCompanyName.trim()}
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Company
          </button>
        </motion.div>

        {companies.length === 0 ? (
          <div className="card text-center py-12">
            <Building2 className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Companies Found</h3>
            <p className="text-neutral-500">Upload phrases with a Company ID or create one above to get started.</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {companies.map((company) => (
              <motion.div 
                key={company._id}
                initial={{ scale: 0.98, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`card transition-all ${company.isHidden ? 'opacity-85 border-dashed border-rose-500/40 bg-rose-950/10' : ''}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-neutral-100 dark:border-neutral-800 pb-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-bold">{company.name}</h2>
                      {company.isHidden ? (
                        <span className="text-xs bg-rose-900/50 text-rose-300 border border-rose-600/60 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                          <EyeOff className="w-3 h-3" /> Hidden (Completed)
                        </span>
                      ) : (
                        <span className="text-xs bg-emerald-900/40 text-emerald-300 border border-emerald-600/50 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                          <Eye className="w-3 h-3" /> Active
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button 
                        onClick={() => navigate(`/admin/companies/${company._id}/user-customizations`)}
                        className="btn btn-primary btn-xs font-semibold px-3 py-1.5"
                      >
                        Users Customizations
                      </button>
                      <button 
                        onClick={() => navigate(`/admin/companies/${company._id}/download-customizations`)}
                        className="btn btn-primary btn-xs font-semibold px-3 py-1.5"
                      >
                        Downloads Customizations
                      </button>
                      <button 
                        onClick={() => navigate(`/admin/companies/${company._id}/phrase-workloads`)}
                        className="btn btn-primary btn-xs font-semibold px-3 py-1.5 flex items-center gap-1"
                      >
                        Phrase Workloads
                      </button>
                      <button 
                        onClick={() => navigate(`/admin/companies/${company._id}/contributors-summary`)}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1 shadow-md"
                      >
                        📊 Contributors Summary
                      </button>
                      <button 
                        onClick={() => toggleHideCompany(company._id, company.name, company.isHidden)}
                        className={`px-3 py-1.5 font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow-sm ${
                          company.isHidden 
                            ? "bg-emerald-600 hover:bg-emerald-500 text-white" 
                            : "bg-neutral-800 hover:bg-neutral-700 text-rose-300 border border-rose-500/40"
                        }`}
                        title={company.isHidden ? "Unhide project for contributors" : "Hide project from contributors"}
                      >
                        {company.isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        <span>{company.isHidden ? "Unhide Project" : "Hide Project"}</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button 
                      onClick={() => deleteCompany(company._id, company.name)}
                      className="btn btn-sm bg-error-50 text-error-600 hover:bg-error-100 dark:bg-error-900/20 dark:hover:bg-error-900/40 p-2.5"
                      title="Delete Company"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => saveCompany(company._id)}
                      disabled={savingId === company._id}
                      className="btn btn-primary btn-sm flex items-center gap-2 px-4 shadow-sm"
                    >
                      {savingId === company._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save Changes
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {/* Project Display Name (Shown to Contributors) */}
                  <div className="bg-neutral-100 dark:bg-neutral-800 p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
                    <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                      Project Display Name (Shown to Contributors)
                    </label>
                    <p className="text-xs text-neutral-500 mb-4">The name of the project shown to contributors in their dashboard</p>
                    <input 
                      type="text"
                      className="input w-full"
                      placeholder="e.g. Acme Speech Project..."
                      value={company.projectName || ''}
                      onChange={(e) => handleFieldChange(company._id, 'projectName', e.target.value)}
                    />
                  </div>

                  {/* Phrase Naming Pattern */}
                  <div className="bg-neutral-100 dark:bg-neutral-800 p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
                    <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                      Phrase Naming Pattern
                    </label>
                    <p className="text-xs text-neutral-500 mb-4 flex flex-wrap items-center gap-1.5">
                      <span>Placeholders:</span>
                      <code className="bg-neutral-200 dark:bg-neutral-750 px-1.5 py-0.5 rounded">{`{phraseId}`}</code>
                      <code className="bg-neutral-200 dark:bg-neutral-750 px-1.5 py-0.5 rounded">{`{speaker_id}`}</code>
                      <code className="bg-neutral-200 dark:bg-neutral-750 px-1.5 py-0.5 rounded">{`{first_name}`}</code>
                      <code className="bg-neutral-200 dark:bg-neutral-750 px-1.5 py-0.5 rounded">{`{last_name}`}</code>
                      <code className="bg-neutral-200 dark:bg-neutral-750 px-1.5 py-0.5 rounded">{`{gender}`}</code>
                      <code className="bg-neutral-200 dark:bg-neutral-750 px-1.5 py-0.5 rounded">{`{recording_date}`}</code>
                      <code className="bg-neutral-200 dark:bg-neutral-750 px-1.5 py-0.5 rounded">{`{language}`}</code>
                      <code className="bg-neutral-200 dark:bg-neutral-750 px-1.5 py-0.5 rounded">{`{freq}`}</code>
                      <code className="bg-neutral-200 dark:bg-neutral-750 px-1.5 py-0.5 rounded">{`{spkfreq}`}</code>
                      {company.availableTags && company.availableTags.length > 0 && (
                        <>
                          <span className="text-neutral-400">| Custom:</span>
                          {company.availableTags.map(tag => (
                            <code key={tag} className="bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-400 px-1.5 py-0.5 rounded font-mono font-semibold">{`{${tag}}`}</code>
                          ))}
                        </>
                      )}
                    </p>
                    <input 
                      type="text"
                      className="input w-full"
                      placeholder="e.g. {language}_{speaker_id}_{phraseId}"
                      value={company.namingPattern || '{phraseId}'}
                      onChange={(e) => handleFieldChange(company._id, 'namingPattern', e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Contribution Limit */}
                  <div className="bg-neutral-100 dark:bg-neutral-800 p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
                    <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                      Max Contribution Limit
                    </label>
                    <p className="text-xs text-neutral-500 mb-4">Total time allowed per contributor for this company</p>
                    
                    <div className="relative">
                      <input 
                        type="number"
                        min="0"
                        className="input w-full pr-16"
                        value={company.maxContributionMinutes !== undefined ? company.maxContributionMinutes : 195}
                        onChange={(e) => handleFieldChange(company._id, 'maxContributionMinutes', e.target.value)}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm font-medium">Minutes</span>
                    </div>
                  </div>

                  {/* Hourly Payrate */}
                  <div className="bg-neutral-100 dark:bg-neutral-800 p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
                    <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                      Flat Hourly Payrate
                    </label>
                    <p className="text-xs text-neutral-500 mb-4">Overrides project and language defaults (0 = use defaults)</p>
                    
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 font-medium">$</span>
                      <input 
                        type="number"
                        min="0"
                        step="0.01"
                        className="input w-full pl-7 pr-12"
                        value={company.hourlyPayout !== undefined ? company.hourlyPayout : 0}
                        onChange={(e) => handleFieldChange(company._id, 'hourlyPayout', e.target.value)}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm font-medium">USD / hr</span>
                    </div>
                  </div>

                  {/* Single Phrase Frequency */}
                  <div className="bg-neutral-100 dark:bg-neutral-800 p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
                    <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                      Single Phrase Frequency
                    </label>
                    <p className="text-xs text-neutral-500 mb-4">Unique contributors per phrase before retiring (1 = 1 contributor, 2 = 2 unique contributors)</p>
                    
                    <div className="relative">
                      <input 
                        type="number"
                        min="1"
                        step="1"
                        className="input w-full pr-28"
                        value={company.singlePhraseFrequency !== undefined ? company.singlePhraseFrequency : 1}
                        onChange={(e) => handleFieldChange(company._id, 'singlePhraseFrequency', e.target.value)}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm font-medium">Contributor(s)</span>
                    </div>
                  </div>

                  {/* Editable Phrases Checkbox */}
                  <div className="bg-neutral-100 dark:bg-neutral-800 p-5 rounded-xl border border-neutral-200 dark:border-neutral-700 flex flex-col justify-between">
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Editable Phrases in Review
                      </label>
                      <p className="text-xs text-neutral-500 mb-4">Allow QA reviewers and Admins to edit phrase text during review (e.g. remove gasps/laughs or minor skipped words)</p>
                    </div>

                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={Boolean(company.allowPhraseTextEdit)}
                        onChange={(e) => handleFieldChange(company._id, 'allowPhraseTextEdit', e.target.checked)}
                        className="w-5 h-5 text-amber-600 bg-neutral-900 border-neutral-600 rounded focus:ring-amber-500 cursor-pointer"
                      />
                      <span className="text-sm font-bold text-neutral-200">
                        {company.allowPhraseTextEdit ? "✓ Phrase Editing Enabled" : "Disabled (Read-Only)"}
                      </span>
                    </label>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
