import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Building2, 
  Save, 
  Loader2, 
  CheckCircle2, 
  ArrowLeft, 
  Layers, 
  Settings, 
  FileAudio, 
  FileText, 
  Download, 
  Users, 
  Eye, 
  EyeOff, 
  Hash, 
  Clock, 
  DollarSign, 
  Repeat, 
  Sparkles,
  Edit3,
  Volume2
} from 'lucide-react';
import { apiGet, apiPatchJson } from '../lib/api';
import AdminNav from '../components/AdminNav.jsx';
import Swal from 'sweetalert2';

export default function AdminCompanyConfig() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchCompany();
  }, [id]);

  async function fetchCompany() {
    setLoading(true);
    try {
      const res = await apiGet(`/api/admin/companies/${id}`);
      setCompany(res.company || null);
    } catch (err) {
      Swal.fire('Error', 'Failed to load company config: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  const handleFieldChange = (field, value) => {
    if (field === 'isBoosted' && value === true && company.isHidden) {
      Swal.fire({
        icon: "warning",
        title: "Project is Hidden",
        text: "Cannot boost this project because it is currently hidden. Please unhide the project first before boosting.",
        confirmButtonColor: "#f59e0b"
      });
      return;
    }
    setCompany(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (company.isBoosted && company.isHidden) {
      Swal.fire({
        icon: "warning",
        title: "Project is Hidden",
        text: "Cannot boost this project because it is currently hidden. Please unhide the project first before boosting.",
        confirmButtonColor: "#f59e0b"
      });
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const res = await apiPatchJson(`/api/admin/companies/${id}`, {
        projectName: company.projectName || '',
        numberOfSamples: Math.max(1, Number(company.numberOfSamples) || 1),
        maxContributionMinutes: Number(company.maxContributionMinutes) || 195,
        hourlyPayout: Number(company.hourlyPayout) || 0,
        singlePhraseFrequency: Math.max(1, Number(company.singlePhraseFrequency) || 1),
        namingPattern: company.namingPattern || '{phraseId}',
        allowPhraseTextEdit: Boolean(company.allowPhraseTextEdit),
        enforceLufs: company.enforceLufs !== false,
        isBoosted: Boolean(company.isBoosted)
      });
      setCompany(res.company);
      setMessage('Configuration saved successfully!');
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Project configurations saved!',
        timer: 2500,
        showConfirmButton: false
      });
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      Swal.fire('Cannot Save Configuration', err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleBoost = async () => {
    const nextBoost = !company.isBoosted;
    if (nextBoost && company.isHidden) {
      Swal.fire({
        icon: "warning",
        title: "Project is Hidden",
        text: "Cannot boost this project because it is currently hidden. Please unhide the project first before boosting.",
        confirmButtonColor: "#f59e0b"
      });
      return;
    }
    try {
      await apiPatchJson(`/api/admin/companies/${id}`, { isBoosted: nextBoost });
      setCompany(prev => ({ ...prev, isBoosted: nextBoost }));
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: nextBoost ? `"${company.projectName || company.name}" boosted & recommended on Dashboard!` : `"${company.projectName || company.name}" unboosted`,
        timer: 2500,
        showConfirmButton: false
      });
    } catch (err) {
      Swal.fire("Cannot Boost Project", err.message, "error");
    }
  };

  const toggleHide = async () => {
    const actionText = company.isHidden ? "Unhide" : "Hide";
    const confirm = await Swal.fire({
      title: `${actionText} Project?`,
      text: company.isHidden 
        ? `Unhiding "${company.name}" will make it visible to contributors on Project Applications and Phrase Studio.`
        : `Hiding "${company.name}" will hide it from contributors (e.g. if the project is completed) without deleting data.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: company.isHidden ? "#10b981" : "#f59e0b",
      confirmButtonText: `Yes, ${actionText} Project`
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await apiPatchJson(`/api/admin/companies/${id}/toggle-hide`, {});
      setCompany(prev => ({ ...prev, isHidden: res.isHidden, isBoosted: res.isBoosted !== undefined ? res.isBoosted : prev.isBoosted }));
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

  if (!company) {
    return (
      <div className="min-h-screen bg-neutral-900 flex text-white">
        <AdminNav />
        <main className="flex-1 md:ml-64 p-8 text-center py-20">
          <p className="text-xl text-neutral-400 mb-4">Company not found.</p>
          <button onClick={() => navigate('/admin/companies')} className="btn btn-primary">
            Back to Companies
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-900 flex text-neutral-100 transition-colors duration-300">
      <AdminNav />
      <main className="flex-1 md:ml-64 p-6 md:p-10 max-w-6xl mx-auto">
        
        {/* Header navigation */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/admin/companies')}
              className="p-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 hover:text-white rounded-xl transition-all flex items-center gap-2 text-xs font-bold shadow-md"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Companies</span>
            </button>
            <span className="text-neutral-500">/</span>
            <span className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">Project Configuration</span>
          </div>

          <div className="flex items-center gap-3">
            {message && (
              <span className="flex items-center gap-1 text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-3 py-1.5 rounded-lg font-medium text-xs">
                <CheckCircle2 className="w-4 h-4" /> {message}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 bg-gradient-to-r from-warning-600 to-amber-600 hover:from-warning-500 hover:to-amber-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg hover:shadow-warning-600/30 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Configuration</span>
            </button>
          </div>
        </div>

        {/* Project Title Card */}
        <div className="bg-neutral-800/80 border border-neutral-700/80 rounded-2xl p-6 mb-8 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-neutral-700 to-neutral-900 border border-neutral-600 flex items-center justify-center shadow-inner">
                <Building2 className="w-6 h-6 text-warning-400" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-extrabold text-white">
                    {company.projectName || company.name}
                  </h1>
                  {company.isHidden ? (
                    <span className="text-xs bg-rose-900/50 text-rose-300 border border-rose-600/60 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                      <EyeOff className="w-3 h-3" /> Hidden
                    </span>
                  ) : (
                    <span className="text-xs bg-emerald-900/40 text-emerald-300 border border-emerald-600/50 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                      <Eye className="w-3 h-3" /> Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-400 mt-1 font-mono">
                  Internal Identifier / Folder: <span className="text-neutral-200 font-semibold">{company.name}</span>
                </p>
              </div>
            </div>

            {/* Quick Links Menu */}
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => navigate(`/admin/companies/${company._id}/phrase-workloads`)}
                className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-warning-300 hover:text-warning-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors border border-neutral-600 shadow-sm"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Phrase Workloads</span>
              </button>
              <button 
                onClick={() => navigate(`/admin/companies/${company._id}/user-customizations`)}
                className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors border border-neutral-600 shadow-sm"
              >
                <Users className="w-3.5 h-3.5" />
                <span>User Tags</span>
              </button>
              <button 
                onClick={() => navigate(`/admin/companies/${company._id}/download-customizations`)}
                className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors border border-neutral-600 shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Tags</span>
              </button>
              <button 
                onClick={() => navigate(`/admin/companies/${company._id}/contributors-summary`)}
                className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <span>📊 Summary</span>
              </button>
              <button 
                type="button"
                onClick={toggleBoost}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                  company.isBoosted
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                    : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300 hover:text-white'
                }`}
                title={company.isBoosted ? "Unboost from Dashboard" : "Boost & Recommend on Contributor Dashboard"}
              >
                <span>🚀 {company.isBoosted ? 'Boosted' : 'Boost Project'}</span>
              </button>
              <button
                onClick={toggleHide}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                  company.isHidden 
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white" 
                    : "bg-neutral-800 hover:bg-neutral-700 text-rose-300 border border-rose-500/40"
                }`}
              >
                {company.isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span>{company.isHidden ? "Unhide" : "Hide"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Configuration Form Sections */}
        <form onSubmit={handleSave} className="space-y-6">
          
          {/* Boost Project Banner Card */}
          <div className="bg-neutral-800/80 border border-amber-500/30 p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="space-y-1">
              <label className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>🚀 Boost Project (Recommended on Dashboard)</span>
              </label>
              <p className="text-xs text-neutral-400 max-w-2xl">
                Pin and feature this phrase project prominently under "Recommended Projects" on the contributor dashboard for rapid applicant acquisition.
              </p>
            </div>
            <div className="flex items-center gap-3 self-start sm:self-center">
              <span className={`text-xs font-bold transition-colors duration-200 ${company.isBoosted ? 'text-amber-400' : 'text-neutral-400'}`}>
                {company.isBoosted ? "🔥 Active on Dashboard" : "Unboosted"}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(company.isBoosted)}
                onClick={() => handleFieldChange('isBoosted', !company.isBoosted)}
                className={`relative inline-flex h-7 w-14 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-neutral-900 ${
                  company.isBoosted
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-[0_0_12px_rgba(245,158,11,0.45)]'
                    : 'bg-neutral-700 hover:bg-neutral-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-300 ease-in-out ${
                    company.isBoosted ? 'translate-x-7' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
          
          {/* General & Application Settings Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Project Display Name */}
            <div className="bg-neutral-800/80 border border-neutral-700/70 p-5 rounded-2xl shadow-lg">
              <label className="block text-sm font-bold text-white mb-1 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-warning-400" />
                <span>Project Display Name</span>
              </label>
              <p className="text-xs text-neutral-400 mb-3">
                The public name shown to contributors on their dashboard and recording studio.
              </p>
              <input 
                type="text"
                className="w-full px-4 py-2.5 bg-neutral-900/90 border border-neutral-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-warning-500 transition-all"
                placeholder="e.g. Acme Speech Project..."
                value={company.projectName || ''}
                onChange={(e) => handleFieldChange('projectName', e.target.value)}
              />
            </div>

            {/* Number of Samples Input (NEW) */}
            <div className="bg-neutral-800/80 border border-warning-500/30 p-5 rounded-2xl shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-warning-500/5 rounded-full blur-2xl pointer-events-none" />
              <label className="block text-sm font-bold text-white mb-1 flex items-center gap-2">
                <FileAudio className="w-4 h-4 text-warning-400" />
                <span>Number Of Samples</span>
                <span className="text-[10px] uppercase px-2 py-0.5 bg-warning-500/20 text-warning-300 font-extrabold rounded-md border border-warning-500/30">
                  Application Gate
                </span>
              </label>
              <p className="text-xs text-neutral-400 mb-3">
                Number of test recordings a contributor must submit when applying for this project (e.g. 5 samples).
              </p>
              <div className="relative">
                <input 
                  type="number"
                  min="1"
                  max="20"
                  step="1"
                  className="w-full px-4 py-2.5 pr-28 bg-neutral-900/90 border border-neutral-700 rounded-xl text-white text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-warning-500 transition-all"
                  value={company.numberOfSamples !== undefined ? company.numberOfSamples : 1}
                  onChange={(e) => handleFieldChange('numberOfSamples', Math.max(1, Number(e.target.value) || 1))}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs font-semibold">
                  Sample Recording(s)
                </span>
              </div>
            </div>
          </div>

          {/* Phrase Naming Pattern Section */}
          <div className="bg-neutral-800/80 border border-neutral-700/70 p-5 rounded-2xl shadow-lg">
            <label className="block text-sm font-bold text-white mb-1 flex items-center gap-2">
              <FileText className="w-4 h-4 text-warning-400" />
              <span>Phrase Naming Pattern</span>
            </label>
            <p className="text-xs text-neutral-400 mb-3">
              Define the file naming convention for exported phrase audio recordings.
            </p>
            <div className="flex flex-wrap items-center gap-1.5 mb-3 text-xs">
              <span className="text-neutral-400 text-[11px] font-semibold">Tags:</span>
              {['{phraseId}', '{speaker_id}', '{first_name}', '{last_name}', '{gender}', '{recording_date}', '{language}', '{freq}', '{spkfreq}'].map(tag => (
                <button
                  type="button"
                  key={tag}
                  onClick={() => handleFieldChange('namingPattern', (company.namingPattern || '') + tag)}
                  className="bg-neutral-900 hover:bg-neutral-700 text-neutral-300 px-2 py-0.5 rounded-lg border border-neutral-700 font-mono text-[11px] transition-colors"
                  title="Click to append tag"
                >
                  {tag}
                </button>
              ))}
              {company.availableTags && company.availableTags.length > 0 && company.availableTags.map(tag => (
                <button
                  type="button"
                  key={tag}
                  onClick={() => handleFieldChange('namingPattern', (company.namingPattern || '') + `{${tag}}`)}
                  className="bg-warning-950/60 hover:bg-warning-900/80 text-warning-300 border border-warning-700/60 px-2 py-0.5 rounded-lg font-mono text-[11px] font-semibold transition-colors"
                  title="Click to append custom metadata tag"
                >
                  {`{${tag}}`}
                </button>
              ))}
            </div>
            <input 
              type="text"
              className="w-full px-4 py-2.5 bg-neutral-900/90 border border-neutral-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-warning-500 transition-all"
              placeholder="e.g. {language}_{speaker_id}_{phraseId}"
              value={company.namingPattern || '{phraseId}'}
              onChange={(e) => handleFieldChange('namingPattern', e.target.value)}
            />
          </div>

          {/* Limits, Payrates & Frequency Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Max Contribution Limit */}
            <div className="bg-neutral-800/80 border border-neutral-700/70 p-5 rounded-2xl shadow-lg">
              <label className="block text-sm font-bold text-white mb-1 flex items-center gap-2">
                <Clock className="w-4 h-4 text-warning-400" />
                <span>Max Contribution Limit</span>
              </label>
              <p className="text-xs text-neutral-400 mb-3">Total recording minutes allowed per contributor for this project.</p>
              <div className="relative">
                <input 
                  type="number"
                  min="0"
                  className="w-full px-4 py-2.5 pr-20 bg-neutral-900/90 border border-neutral-700 rounded-xl text-white text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-warning-500"
                  value={company.maxContributionMinutes !== undefined ? company.maxContributionMinutes : 195}
                  onChange={(e) => handleFieldChange('maxContributionMinutes', e.target.value)}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs font-semibold">Minutes</span>
              </div>
            </div>

            {/* Hourly Payrate */}
            <div className="bg-neutral-800/80 border border-neutral-700/70 p-5 rounded-2xl shadow-lg">
              <label className="block text-sm font-bold text-white mb-1 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-warning-400" />
                <span>Flat Hourly Payrate</span>
              </label>
              <p className="text-xs text-neutral-400 mb-3">Project-specific hourly payrate (0 = fallback to defaults).</p>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 font-bold">$</span>
                <input 
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full pl-8 pr-20 px-4 py-2.5 bg-neutral-900/90 border border-neutral-700 rounded-xl text-white text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-warning-500"
                  value={company.hourlyPayout !== undefined ? company.hourlyPayout : 0}
                  onChange={(e) => handleFieldChange('hourlyPayout', e.target.value)}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs font-semibold">USD / hr</span>
              </div>
            </div>

            {/* Single Phrase Frequency */}
            <div className="bg-neutral-800/80 border border-neutral-700/70 p-5 rounded-2xl shadow-lg">
              <label className="block text-sm font-bold text-white mb-1 flex items-center gap-2">
                <Repeat className="w-4 h-4 text-warning-400" />
                <span>Single Phrase Frequency</span>
              </label>
              <p className="text-xs text-neutral-400 mb-3">Unique contributors per phrase before retiring.</p>
              <div className="relative">
                <input 
                  type="number"
                  min="1"
                  step="1"
                  className="w-full px-4 py-2.5 pr-28 bg-neutral-900/90 border border-neutral-700 rounded-xl text-white text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-warning-500"
                  value={company.singlePhraseFrequency !== undefined ? company.singlePhraseFrequency : 1}
                  onChange={(e) => handleFieldChange('singlePhraseFrequency', e.target.value)}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs font-semibold">Contributor(s)</span>
              </div>
            </div>
          </div>

          {/* Phrase Text Editing Toggle */}
          <div className="bg-neutral-800/80 border border-neutral-700/70 p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-warning-400" />
                <span>Editable Phrases in Review</span>
              </label>
              <p className="text-xs text-neutral-400 max-w-2xl">
                Allow QA reviewers and Admins to edit script text during review (e.g. cleaning laughs or skipped words).
              </p>
            </div>
            <div className="flex items-center gap-3 self-start sm:self-center">
              <span className={`text-xs font-bold transition-colors duration-200 ${company.allowPhraseTextEdit ? 'text-warning-400' : 'text-neutral-400'}`}>
                {company.allowPhraseTextEdit ? "✓ Editing Enabled" : "Disabled (Read-Only)"}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(company.allowPhraseTextEdit)}
                onClick={() => handleFieldChange('allowPhraseTextEdit', !company.allowPhraseTextEdit)}
                className={`relative inline-flex h-7 w-14 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-warning-500 focus:ring-offset-2 focus:ring-offset-neutral-900 ${
                  company.allowPhraseTextEdit
                    ? 'bg-gradient-to-r from-amber-500 to-warning-500 shadow-[0_0_12px_rgba(245,158,11,0.45)]'
                    : 'bg-neutral-700 hover:bg-neutral-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-300 ease-in-out ${
                    company.allowPhraseTextEdit ? 'translate-x-7' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* LUFS Constraint Toggle */}
          <div className="bg-neutral-800/80 border border-neutral-700/70 p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-white flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-warning-400" />
                <span>LUFS Constraint</span>
              </label>
              <p className="text-xs text-neutral-400 max-w-2xl">
                Enforce EBU R128 speech loudness constraints (-18.0 to -25.0 LUFS) during contributor recordings. If disabled, contributors can record and submit phrases for this company without loudness restrictions.
              </p>
            </div>
            <div className="flex items-center gap-3 self-start sm:self-center">
              <span className={`text-xs font-bold transition-colors duration-200 ${company.enforceLufs !== false ? 'text-warning-400' : 'text-neutral-400'}`}>
                {company.enforceLufs !== false ? "✓ Constraint Active (-18 to -25 LUFS)" : "Disabled (Unrestricted)"}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={company.enforceLufs !== false}
                onClick={() => handleFieldChange('enforceLufs', company.enforceLufs === false ? true : false)}
                className={`relative inline-flex h-7 w-14 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-warning-500 focus:ring-offset-2 focus:ring-offset-neutral-900 ${
                  company.enforceLufs !== false
                    ? 'bg-gradient-to-r from-amber-500 to-warning-500 shadow-[0_0_12px_rgba(245,158,11,0.45)]'
                    : 'bg-neutral-700 hover:bg-neutral-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-300 ease-in-out ${
                    company.enforceLufs !== false ? 'translate-x-7' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Bottom Save Action */}
          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-gradient-to-r from-warning-600 to-amber-600 hover:from-warning-500 hover:to-amber-500 text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg hover:shadow-warning-600/30 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Configuration</span>
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
