import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FolderGit2, Save, Loader2, CheckCircle2 } from 'lucide-react';
import { apiGet, apiPutJson } from '../lib/api';
import AdminNav from '../components/AdminNav.jsx';

export default function AdminProjects() {
  const [projects, setProjects] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [projRes, langRes] = await Promise.all([
        apiGet('/api/projects'),
        apiGet('/api/languages')
      ]);
      setProjects(projRes.projects || []);
      setLanguages(langRes.languages || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleRateChange = (projectId, langCode, value) => {
    setProjects(prev => prev.map(p => {
      if (p._id !== projectId) return p;
      const newRates = [...(p.languageRates || [])];
      const idx = newRates.findIndex(r => r.languageCode === langCode);
      if (idx > -1) {
        newRates[idx].hourlyPayout = Number(value);
      } else {
        newRates.push({ languageCode: langCode, hourlyPayout: Number(value) });
      }
      return { ...p, languageRates: newRates };
    }));
  };

  const getRate = (project, langCode) => {
    const rate = project.languageRates?.find(r => r.languageCode === langCode);
    return rate ? rate.hourlyPayout : '';
  };

  const saveRates = async (projectId) => {
    setSavingId(projectId);
    setMessage('');
    try {
      const project = projects.find(p => p._id === projectId);
      await apiPutJson(`/api/projects/${projectId}/rates`, {
        languageRates: project.languageRates || []
      });
      setMessage('Rates saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      alert('Failed to save rates: ' + err.message);
    } finally {
      setSavingId(null);
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
              <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
                <FolderGit2 className="w-8 h-8 text-primary-500" />
                Project Payrates
              </h1>
              <p className="text-neutral-500 dark:text-neutral-400">Manage custom hourly payouts for specific projects.</p>
            </div>
            {message && (
              <span className="flex items-center gap-1 text-success-600 bg-success-100 dark:bg-success-900/30 px-4 py-2 rounded-lg font-medium text-sm">
                <CheckCircle2 className="w-4 h-4" /> {message}
              </span>
            )}
          </div>
        </motion.div>

        {projects.length === 0 ? (
          <div className="card text-center py-12">
            <FolderGit2 className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Projects Found</h3>
            <p className="text-neutral-500">Upload phrases with a Project Name to automatically create projects here.</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {projects.map((project) => (
              <motion.div 
                key={project._id}
                initial={{ scale: 0.98, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="card"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold">{project.name}</h2>
                  <button 
                    onClick={() => saveRates(project._id)}
                    disabled={savingId === project._id}
                    className="btn btn-primary btn-sm flex items-center gap-2"
                  >
                    {savingId === project._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Rates
                  </button>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {languages.map(lang => (
                    <div key={lang.code} className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                        {lang.name}
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">$</span>
                        <input 
                          type="number"
                          min="0"
                          step="0.01"
                          className="input w-full pl-7"
                          placeholder={lang.hourlyPayout}
                          value={getRate(project, lang.code.toLowerCase())}
                          onChange={(e) => handleRateChange(project._id, lang.code.toLowerCase(), e.target.value)}
                        />
                      </div>
                      <p className="text-[10px] text-neutral-400 mt-1">Default: ${lang.hourlyPayout}/hr</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
