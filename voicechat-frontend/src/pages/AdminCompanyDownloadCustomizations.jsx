import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { DownloadCloud, Save, Loader2, CheckCircle2, ChevronLeft, Plus, Trash2, CheckSquare, Square } from 'lucide-react';
import { apiGet, apiPatchJson } from '../lib/api';
import AdminNav from '../components/AdminNav.jsx';
import Swal from 'sweetalert2';

export default function AdminCompanyDownloadCustomizations() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [newKey, setNewKey] = useState('');

  useEffect(() => {
    fetchCompanyData();
  }, [id]);

  async function fetchCompanyData() {
    try {
      const res = await apiGet(`/api/admin/companies/${id}`);
      if (res.company) {
        setCompany(res.company);
        setSelectedKeys(res.company.downloadCustomizations || []);
      }
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'Failed to load company download configurations: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  const handleToggleKey = (key) => {
    setSelectedKeys(prev => 
      prev.includes(key) 
        ? prev.filter(k => k !== key) 
        : [...prev, key]
    );
  };

  const handleAddManualKey = () => {
    const cleanKey = newKey.trim();
    if (!cleanKey) return;
    if (selectedKeys.includes(cleanKey)) {
      setNewKey('');
      return;
    }
    setSelectedKeys(prev => [...prev, cleanKey]);
    setNewKey('');
  };

  const handleRemoveKey = (keyToRemove) => {
    setSelectedKeys(prev => prev.filter(k => k !== keyToRemove));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      await apiPatchJson(`/api/admin/companies/${id}`, {
        downloadCustomizations: selectedKeys
      });
      setMessage('Download metadata configurations updated successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      Swal.fire('Error', 'Failed to save configurations: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex text-white transition-colors duration-300">
        <AdminNav />
        <main className="flex-1 md:ml-64 p-8 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </main>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen bg-neutral-950 flex text-white transition-colors duration-300">
        <AdminNav />
        <main className="flex-1 md:ml-64 p-8 max-w-2xl mx-auto text-center py-20">
          <p className="text-xl text-error-500 mb-4">Company not found.</p>
          <Link to="/admin/companies" className="btn btn-primary inline-flex items-center gap-2">
            <ChevronLeft className="w-4 h-4" /> Back to Companies
          </Link>
        </main>
      </div>
    );
  }

  // Combine already configured keys and automatically detected tags to list them all
  const allAvailableKeys = Array.from(new Set([
    ...(company.availableTags || []),
    ...selectedKeys
  ])).sort();

  return (
    <div className="min-h-screen bg-neutral-950 flex text-white transition-colors duration-300">
      <AdminNav />
      <main className="flex-1 md:ml-64 p-8 max-w-4xl mx-auto text-neutral-100">
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mb-8"
        >
          <button
            onClick={() => navigate('/admin/companies')}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary-400 hover:underline mb-4"
          >
            <ChevronLeft className="w-4 h-4" /> Back to Company Configs
          </button>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                <DownloadCloud className="w-8 h-8 text-primary-500" />
                Download Customizations
              </h1>
              <p className="text-neutral-400">
                Select metadata fields downloaded in the ZIP package for <span className="font-semibold text-primary-400">{company.projectName || company.name}</span>.
              </p>
            </div>
            {message && (
              <span className="flex items-center gap-1 text-success-400 bg-success-950/60 border border-success-800/80 px-4 py-2 rounded-lg font-medium text-sm self-start sm:self-center">
                <CheckCircle2 className="w-4 h-4" /> {message}
              </span>
            )}
          </div>
        </motion.div>

        <div className="grid gap-8 grid-cols-1 lg:grid-cols-3">
          {/* Main Select list */}
          <div className="lg:col-span-2 space-y-6">
            <div className="card bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 border border-neutral-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
              <h2 className="text-lg font-bold mb-4 text-white relative z-10">Select Downloaded Tag Keys</h2>
              <p className="text-xs text-neutral-400 mb-6 relative z-10">
                Check the metadata keys you want to be included in the downloaded JSON file alongside the audio recordings. Checked items will be included; unchecked custom tags will be omitted.
              </p>
              
              {allAvailableKeys.length === 0 ? (
                <div className="text-center py-10 bg-neutral-950/60 rounded-2xl border border-dashed border-neutral-800 relative z-10">
                  <p className="text-neutral-400 text-sm">No custom metadata tags detected for this project yet.</p>
                  <p className="text-xs text-neutral-400 mt-1">Use the right panel to add tags manually.</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 relative z-10">
                  {allAvailableKeys.map(key => {
                    const isChecked = selectedKeys.includes(key);
                    return (
                      <button
                        key={key}
                        onClick={() => handleToggleKey(key)}
                        className={`flex items-center gap-3 p-3.5 rounded-2xl border text-left font-medium transition-all ${
                          isChecked 
                            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 border-emerald-400 text-white shadow-lg ring-2 ring-emerald-500/30' 
                            : 'bg-neutral-950/80 border-neutral-800 text-neutral-300 hover:bg-neutral-850'
                        }`}
                      >
                        {isChecked ? (
                          <CheckSquare className="w-5 h-5 text-white fill-white/20 shrink-0" />
                        ) : (
                          <Square className="w-5 h-5 text-neutral-400 shrink-0" />
                        )}
                        <span className="truncate">{key}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              
              <div className="mt-8 border-t border-neutral-800 pt-6 flex justify-end relative z-10">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn btn-primary flex items-center gap-2 px-6 py-2.5 font-semibold rounded-xl shadow-lg hover:shadow-primary-500/20"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  Save Configurations
                </button>
              </div>
            </div>
          </div>

          {/* Add Manual Keys Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <div className="card bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 border border-neutral-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
              <h2 className="text-md font-bold mb-3 flex items-center gap-2 text-white relative z-10">
                <Plus className="w-4 h-4 text-primary-500" />
                Add Tag Manually
              </h2>
              <p className="text-xs text-neutral-400 mb-4 relative z-10">
                If the script tag hasn't been uploaded yet, you can add it manually here.
              </p>
              
              <div className="space-y-3 relative z-10">
                <input
                  type="text"
                  className="input w-full bg-neutral-950/80 border border-neutral-700 text-white focus:border-primary-500 rounded-xl"
                  placeholder="e.g. domain, gender, age..."
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddManualKey()}
                />
                <button
                  type="button"
                  onClick={handleAddManualKey}
                  disabled={!newKey.trim()}
                  className="btn bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 text-white w-full py-2.5 flex items-center justify-center gap-1.5 font-semibold rounded-xl shadow-sm"
                >
                  <Plus className="w-4 h-4" /> Add to List
                </button>
              </div>
            </div>

            {selectedKeys.length > 0 && (
              <div className="card bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 border border-neutral-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-400 mb-3">Active Selection</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedKeys.map(k => (
                    <span 
                      key={k} 
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-950/60 text-emerald-300 text-xs font-semibold rounded-full border border-emerald-800/60"
                    >
                      {k}
                      <button 
                        type="button" 
                        onClick={() => handleRemoveKey(k)}
                        className="text-neutral-400 hover:text-rose-400 font-bold ml-1 focus:outline-none"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
