import React, { useState, useEffect } from 'react';
import { Upload, FileJson, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { apiGet, apiPostJson } from '../lib/api';
import AdminNav from '../components/AdminNav.jsx';

export default function AdminPhrases() {
  const [phrasesList, setPhrasesList] = useState([]);
  const [companiesList, setCompaniesList] = useState([]);
  const [phraseLanguagesList, setPhraseLanguagesList] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [language, setLanguage] = useState('');
  const [speakerId, setSpeakerId] = useState('');
  const [file, setFile] = useState(null);
  const [pastedJson, setPastedJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [metadataKeys, setMetadataKeys] = useState([]);
  const [newKey, setNewKey] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [allocationFilter, setAllocationFilter] = useState('all'); // 'all', 'reserved', 'open'
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState('all');

  const handleAddKey = () => {
    const trimmed = newKey.trim();
    if (trimmed && !metadataKeys.includes(trimmed)) {
      setMetadataKeys([...metadataKeys, trimmed]);
    }
    setNewKey('');
  };

  const handleRemoveKey = (keyToRemove) => {
    setMetadataKeys(metadataKeys.filter(k => k !== keyToRemove));
  };

  useEffect(() => {
    fetchPhrases();
    fetchCompanies();
    fetchPhraseLanguages();
  }, []);

  async function fetchPhraseLanguages() {
    try {
      const data = await apiGet('/api/admin/languages?type=phrase');
      setPhraseLanguagesList(data.languages || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchCompanies() {
    try {
      const data = await apiGet('/api/admin/companies?forAdminSelect=true');
      setCompaniesList(data.companies || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchPhrases() {
    try {
      const data = await apiGet('/api/phrases/admin/all');
      setPhrasesList(data.phrases || []);
    } catch (err) {
      console.error(err);
    }
  }

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected && selected.type === 'application/json') {
      setFile(selected);
      setError('');
    } else {
      setFile(null);
      setError('Please select a valid JSON file.');
    }
  };

  const extractPhrasesArray = (json) => {
    if (Array.isArray(json)) return json;
    if (typeof json === 'object' && json !== null) {
      // Look for the first array value inside the object
      for (const key in json) {
        if (Array.isArray(json[key])) return json[key];
      }
      return [json];
    }
    return [];
  };

  const handleUpload = async () => {
    if (!companyId.trim()) return setError('Company / Project selection is required to upload a phrase batch.');
    if (!language.trim()) return setError('Language selection is required to upload a phrase batch.');
    if (!file && !pastedJson.trim()) return setError('Please select a JSON file or paste JSON payload.');
    
    setLoading(true);
    setMessage('');
    setError('');

    if (pastedJson.trim()) {
      try {
        const json = JSON.parse(pastedJson);
        const res = await apiPostJson('/api/phrases/admin/upload', {
          companyId: companyId.trim(),
          language: language.trim(),
          speakerId: speakerId.trim(),
          phrases: extractPhrasesArray(json),
          metadataKeys,
        });
        const dupMsg = res.duplicates > 0 ? ` (${res.duplicates} duplicate ID${res.duplicates !== 1 ? 's' : ''} found, not uploaded and ignored)` : '';
        setMessage(`Success! Inserted: ${res.inserted}${dupMsg}${speakerId.trim() ? ` (Allocated to ${speakerId.trim()})` : ''}`);
        setPastedJson('');
        setCompanyId('');
        setLanguage('');
        setSpeakerId('');
        setMetadataKeys([]);
        fetchPhrases();
        fetchCompanies();
        fetchPhraseLanguages();
      } catch (err) {
        setError('Failed to parse pasted JSON or upload failed: ' + err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target.result);
        const res = await apiPostJson('/api/phrases/admin/upload', {
          companyId: companyId.trim(),
          language: language.trim(),
          speakerId: speakerId.trim(),
          phrases: extractPhrasesArray(json),
          metadataKeys,
        });
        const dupMsg = res.duplicates > 0 ? ` (${res.duplicates} duplicate ID${res.duplicates !== 1 ? 's' : ''} found, not uploaded and ignored)` : '';
        setMessage(`Success! Inserted: ${res.inserted}${dupMsg}${speakerId.trim() ? ` (Allocated to ${speakerId.trim()})` : ''}`);
        setFile(null);
        setCompanyId('');
        setLanguage('');
        setSpeakerId('');
        setMetadataKeys([]);
        fetchPhrases();
        fetchCompanies();
        fetchPhraseLanguages();
      } catch (err) {
        setError('Failed to parse file JSON or upload failed: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const handleDeduplicate = async () => {
    if (!window.confirm('Remove duplicate phrases, keeping only 1 copy per sentence?')) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await apiPostJson('/api/phrases/admin/deduplicate', { companyId: companyId.trim() });
      setMessage(res.message || `Cleaned duplicates successfully! Removed: ${res.deletedCount}`);
      fetchPhrases();
    } catch (err) {
      setError('Deduplication failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClearBatch = async () => {
    const targetName = companyId.trim() ? `for project "${companyId.trim()}"` : 'ALL phrases';
    if (!window.confirm(`Are you sure you want to delete ${targetName}? This cannot be undone.`)) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await apiPostJson('/api/phrases/admin/clear', { companyId: companyId.trim() });
      setMessage(res.message || `Cleared batch successfully!`);
      fetchPhrases();
    } catch (err) {
      setError('Clear failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex transition-colors duration-300">
      <AdminNav />
      <main className="flex-1 md:ml-64 p-8 max-w-6xl mx-auto text-neutral-900 dark:text-neutral-50">
        <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold mb-2">Phrases Admin</h1>
        <p className="text-neutral-500 dark:text-neutral-400">Upload JSON manifests and track script recording progress.</p>
      </motion.div>

      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="card mb-8"
      >
        <h2 className="text-xl font-semibold mb-4">Upload New Batch</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 opacity-80">
                Company / Project <span className="text-error-500 font-bold">*</span> (Mandatory)
              </label>
              <select 
                className="input w-full bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 cursor-pointer" 
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                required
              >
                <option value="">-- Select Company / Project --</option>
                {companiesList.map(c => (
                  <option key={c._id} value={c.name}>
                    {c.name}{c.projectName && c.projectName !== c.name ? ` (${c.projectName})` : ''}
                  </option>
                ))}
              </select>
              {(() => {
                const comp = companiesList.find(c => c.name === companyId);
                if (!comp) return null;
                return (
                  <div className="mt-2 p-2.5 bg-neutral-100 dark:bg-neutral-800/80 rounded-lg text-xs flex flex-wrap gap-x-4 gap-y-1 items-center border border-neutral-200 dark:border-neutral-700">
                    <div><span className="font-bold text-neutral-500 dark:text-neutral-400">Company:</span> {comp.name}</div>
                    <div><span className="font-bold text-neutral-500 dark:text-neutral-400">Display Name:</span> {comp.projectName || comp.name}</div>
                    <div><span className="font-bold text-neutral-500 dark:text-neutral-400">Hourly Pay:</span> ${comp.hourlyPayout ?? 0}/hr</div>
                    <div><span className="font-bold text-neutral-500 dark:text-neutral-400">Max Limit:</span> {comp.maxContributionMinutes ?? 195}m</div>
                  </div>
                );
              })()}
              {companiesList.length === 0 && (
                <p className="text-xs text-warning-500 mt-1">
                  No companies created yet. Create a company first under Company Configs.
                </p>
              )}
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 opacity-80">
                Language <span className="text-error-500 font-bold">*</span> (Mandatory)
              </label>
              <select 
                className="input w-full bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 cursor-pointer" 
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                required
              >
                <option value="">-- Select Phrase Language --</option>
                {phraseLanguagesList.map(lang => (
                  <option key={lang._id || lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
              {phraseLanguagesList.length === 0 && (
                <p className="text-xs text-warning-500 mt-1">
                  No phrase languages created yet. Add a phrase language first under Phrase Languages in the sidebar.
                </p>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 opacity-80 flex items-center justify-between">
                <span>Allocate to Speaker ID (Optional)</span>
                <span className="text-xs text-indigo-400 font-mono">🔒 Reserved for Speaker</span>
              </label>
              <input 
                type="text" 
                className="input w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 font-mono text-sm" 
                placeholder="e.g. spk_129 (Leave blank for Open Pool)" 
                value={speakerId}
                onChange={(e) => setSpeakerId(e.target.value)}
              />
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                If specified, all phrases in this uploaded batch will be reserved exclusively for this speaker ID.
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 opacity-80">
                Custom JSON Metadata Tags
              </label>
              <div className="flex gap-2 mb-2">
                <input 
                  type="text" 
                  className="input flex-1 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100"
                  placeholder="Enter JSON key (e.g. domain)"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddKey();
                    }
                  }}
                />
                <button 
                  type="button" 
                  onClick={handleAddKey}
                  className="btn btn-secondary px-4 py-2 border border-neutral-300 dark:border-neutral-700 text-sm font-semibold"
                >
                  + Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {metadataKeys.map(k => (
                  <span 
                    key={k} 
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-neutral-200 dark:bg-neutral-800 text-sm font-semibold rounded-full border border-neutral-300 dark:border-neutral-700"
                  >
                    {k}
                    <button 
                      type="button" 
                      onClick={() => handleRemoveKey(k)}
                      className="text-error-500 hover:text-error-600 font-bold ml-1 focus:outline-none"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1.5">
                Type the exact keys from your JSON elements (e.g., age, gender, domain). Matching values will be displayed to contributors in the recording studio.
              </p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 opacity-80">Method 1: JSON File Upload</label>
            <div className="flex items-center gap-4 mb-6">
              <input 
                type="file" 
                accept=".json"
                onChange={handleFileChange}
                className="hidden" 
                id="json-upload"
              />
              <label 
                htmlFor="json-upload" 
                className="btn btn-secondary flex items-center gap-2 cursor-pointer"
              >
                <FileJson className="w-5 h-5" />
                Select File
              </label>
              <span className="text-sm opacity-70 truncate max-w-[200px]">
                {file ? file.name : 'No file selected'}
              </span>
            </div>

            <label className="block text-sm font-medium mb-2 opacity-80">Method 2: Paste Raw JSON Array</label>
            <textarea
              className="w-full h-48 bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 custom-scrollbar resize-none"
              placeholder={'[\n  {\n    "id": "phrase_en_001",\n    "text": "Hello world"\n  }\n]'}
              value={pastedJson}
              onChange={(e) => setPastedJson(e.target.value)}
              disabled={!!file}
            ></textarea>
            {file && <p className="text-xs text-warning-500 mt-1">Clear the selected file above to enable pasting.</p>}
            
            {error && <p className="text-error-500 text-sm mt-2 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {error}</p>}
            {message && <p className="text-success-600 text-sm mt-2 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {message}</p>}
          </div>
        </div>
        
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              onClick={handleDeduplicate}
              disabled={loading}
              title="Remove duplicate phrases keeping only 1 copy per unique sentence"
            >
              🧹 Remove Duplicates
            </button>
            <button
              type="button"
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              onClick={handleClearBatch}
              disabled={loading}
              title="Delete all phrases for selected project to restart upload cleanly"
            >
              🗑️ Clear Project Phrases
            </button>
          </div>
          <button 
            className="btn btn-primary flex items-center gap-2"
            onClick={handleUpload}
            disabled={loading || (!file && !pastedJson.trim())}
          >
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Upload className="w-5 h-5" />}
            {loading ? 'Processing...' : 'Upload Database'}
          </button>
        </div>
      </motion.div>

      {/* Database Overview Table with Search & Allocation Filter */}
      {(() => {
        const filteredPhrases = phrasesList.filter(p => {
          const isReserved = Boolean(p.assigned_speaker_id || (p.status === 'pending' && p.speaker_id));
          if (allocationFilter === 'reserved' && !isReserved) return false;
          if (allocationFilter === 'open' && isReserved) return false;
          if (statusFilter !== 'all' && p.status !== statusFilter) return false;
          if (selectedCompanyFilter !== 'all' && (p.companyId || '').toLowerCase() !== selectedCompanyFilter.toLowerCase()) return false;
          if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            const matchId = String(p.phraseId || '').toLowerCase().includes(q);
            const matchText = String(p.text || '').toLowerCase().includes(q);
            const matchSpeaker = String(p.assigned_speaker_id || p.speaker_id || '').toLowerCase().includes(q);
            const matchContributor = String(p.contributorId?.username || '').toLowerCase().includes(q);
            if (!matchId && !matchText && !matchSpeaker && !matchContributor) return false;
          }
          return true;
        });

        const reservedCount = phrasesList.filter(p => p.assigned_speaker_id || (p.status === 'pending' && p.speaker_id)).length;
        const openPoolCount = phrasesList.length - reservedCount;

        return (
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="card overflow-hidden space-y-4"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Database Overview ({phrasesList.length} Total Phrases)</h2>
                <p className="text-xs opacity-70 mt-0.5">
                  Showing {filteredPhrases.length} of {phrasesList.length} phrases • <span className="text-indigo-400 font-semibold">{reservedCount} Reserved</span> • <span className="text-emerald-400 font-semibold">{openPoolCount} Open Pool</span>
                </p>
              </div>

              {/* Filters & Search */}
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  type="text"
                  placeholder="🔍 Search ID, text, spk_..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input input-sm text-xs bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 rounded-lg w-48"
                />

                <select
                  value={allocationFilter}
                  onChange={(e) => setAllocationFilter(e.target.value)}
                  className="input input-sm text-xs bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 px-2.5 py-1.5 rounded-lg font-medium"
                >
                  <option value="all">All Allocations</option>
                  <option value="reserved">🔒 Reserved Only ({reservedCount})</option>
                  <option value="open">🌐 Open Pool Only ({openPoolCount})</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="input input-sm text-xs bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 px-2.5 py-1.5 rounded-lg capitalize"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="locked">Locked</option>
                  <option value="recorded">Recorded</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>

                <select
                  value={selectedCompanyFilter}
                  onChange={(e) => setSelectedCompanyFilter(e.target.value)}
                  className="input input-sm text-xs bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 px-2.5 py-1.5 rounded-lg"
                >
                  <option value="all">All Projects</option>
                  {companiesList.map(c => (
                    <option key={c._id || c.name} value={c.name}>{c.projectName || c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-700 text-xs uppercase font-bold tracking-wider">
                    <th className="p-3 opacity-70">Company</th>
                    <th className="p-3 opacity-70">Phrase ID</th>
                    <th className="p-3 opacity-70">Allocation</th>
                    <th className="p-3 opacity-70">Lang</th>
                    <th className="p-3 opacity-70">Status</th>
                    <th className="p-3 opacity-70">Duration</th>
                    <th className="p-3 opacity-70">Recorded At</th>
                    <th className="p-3 opacity-70">Contributor</th>
                    <th className="p-3 opacity-70">QA User</th>
                    <th className="p-3 opacity-70">QA Reviewed</th>
                    <th className="p-3 opacity-70 max-w-xs">QA Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPhrases.map((p) => {
                    const assignedSpk = p.assigned_speaker_id || (p.status === 'pending' ? p.speaker_id : null);

                    return (
                      <tr key={p._id} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors text-sm">
                        <td className="p-3 font-medium">
                          {(() => {
                            const comp = companiesList.find(c => c.name.toLowerCase() === (p.companyId || '').toLowerCase());
                            if (!comp) return p.companyId || 'N/A';
                            return (
                              <div>
                                <span>{comp.name}</span>
                                {comp.projectName && comp.projectName !== comp.name && (
                                  <span className="text-xs opacity-75 block text-primary-500 font-normal">{comp.projectName}</span>
                                )}
                                <span className="text-[11px] opacity-60 block font-mono">
                                  ${comp.hourlyPayout ?? 0}/hr • {comp.maxContributionMinutes ?? 195}m max
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="p-3 font-mono opacity-80">{p.phraseId}</td>
                        <td className="p-3">
                          {assignedSpk ? (
                            <span className="px-2.5 py-1 rounded-md bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 font-mono text-xs font-bold inline-flex items-center gap-1">
                              <span>🔒</span>
                              <span>{assignedSpk}</span>
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-md bg-neutral-800/90 text-neutral-400 border border-neutral-700 font-mono text-xs inline-flex items-center gap-1">
                              <span>🌐</span>
                              <span>Open Pool</span>
                            </span>
                          )}
                        </td>
                        <td className="p-3 capitalize">{p.language}</td>
                        <td className="p-3">
                          <span className={`badge ${
                            p.status === 'approved' ? 'badge-success' : 
                            p.status === 'rejected' ? 'badge-error' : 
                            p.status === 'recorded' ? 'badge-warning' : 
                            p.status === 'locked' ? 'badge-secondary bg-blue-100 text-blue-800' : 'badge-neutral'
                          }`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="p-3">{p.duration > 0 ? `${p.duration}s` : '-'}</td>
                        <td className="p-3 opacity-70">{p.recordedAt ? new Date(p.recordedAt).toLocaleString() : '-'}</td>
                        <td className="p-3">{p.contributorId ? `${p.contributorId.username} (${p.speaker_id || p.contributorId.speaker_id || '-'})` : '-'}</td>
                        <td className="p-3">{p.qaId ? p.qaId.username : '-'}</td>
                        <td className="p-3 opacity-70">{p.reviewedAt ? new Date(p.reviewedAt).toLocaleString() : '-'}</td>
                        <td className="p-3 truncate max-w-[200px]" title={p.qaComment}>{p.qaComment || '-'}</td>
                      </tr>
                    );
                  })}
                  {filteredPhrases.length === 0 && (
                    <tr>
                      <td colSpan="11" className="p-8 text-center opacity-50">No phrases found matching your search or filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        );
      })()}
      </main>
    </div>
  );
}
