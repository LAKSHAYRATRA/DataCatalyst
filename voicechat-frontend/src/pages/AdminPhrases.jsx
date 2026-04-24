import React, { useState, useEffect } from 'react';
import { Upload, FileJson, CheckCircle2, AlertCircle, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import { apiGet, apiPostJson } from '../lib/api';
import AdminNav from '../components/AdminNav.jsx';

export default function AdminPhrases() {
  const [phrasesList, setPhrasesList] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [file, setFile] = useState(null);
  const [pastedJson, setPastedJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPhrases();
  }, []);

  async function handleDownload() {
    setDownloading(true);
    try {
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const res = await fetch(`${BACKEND_URL}/api/phrases/admin/download`, { credentials: 'include' });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `datacatalyst_phrases_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Download failed: ' + err.message);
    } finally {
      setDownloading(false);
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

  const handleUpload = async () => {
    if (!file && !pastedJson.trim()) return setError('Please select a JSON file or paste JSON payload.');
    
    setLoading(true);
    setMessage('');
    setError('');

    if (pastedJson.trim()) {
      try {
        const json = JSON.parse(pastedJson);
        const res = await apiPostJson('/api/phrases/admin/upload', {
          companyId: companyId.trim(),
          phrases: Array.isArray(json) ? json : [json],
        });
        setMessage(`Success! Inserted: ${res.inserted}, Updated: ${res.updated}`);
        setPastedJson('');
        setCompanyId('');
        fetchPhrases();
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
          phrases: Array.isArray(json) ? json : [json],
        });
        setMessage(`Success! Inserted: ${res.inserted}, Updated: ${res.updated}`);
        setFile(null);
        setCompanyId('');
        fetchPhrases();
      } catch (err) {
        setError('Failed to parse file JSON or upload failed: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
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
        <h1 className="text-3xl font-bold mb-2">TTS Phrases Admin</h1>
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
            <label className="block text-sm font-medium mb-2 opacity-80">Company Identifier (Optional)</label>
            <input 
              type="text" 
              className="input mb-4" 
              placeholder="e.g. Acme Corp..." 
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            />
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
              placeholder={'[\n  {\n    "id": "tts_en_001",\n    "text": "Hello world"\n  }\n]'}
              value={pastedJson}
              onChange={(e) => setPastedJson(e.target.value)}
              disabled={!!file}
            ></textarea>
            {file && <p className="text-xs text-warning-500 mt-1">Clear the selected file above to enable pasting.</p>}
            
            {error && <p className="text-error-500 text-sm mt-2 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {error}</p>}
            {message && <p className="text-success-600 text-sm mt-2 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {message}</p>}
          </div>
        </div>
        
        <div className="mt-6 flex justify-end">
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

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="card overflow-hidden"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Database Overview</h2>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="btn btn-secondary flex items-center gap-2 text-sm"
          >
            {downloading
              ? <div className="w-4 h-4 border-2 border-neutral-400/30 border-t-neutral-600 rounded-full animate-spin" />
              : <Download className="w-4 h-4" />}
            {downloading ? 'Preparing...' : 'Download Approved JSON'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-700">
                <th className="p-3 opacity-70">Company</th>
                <th className="p-3 opacity-70">Phrase ID</th>
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
              {phrasesList.map((p) => (
                <tr key={p._id} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors text-sm">
                  <td className="p-3 font-medium">{p.companyId || 'N/A'}</td>
                  <td className="p-3 font-mono opacity-80">{p.phraseId}</td>
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
                  <td className="p-3">{p.contributorId ? p.contributorId.username : '-'}</td>
                  <td className="p-3">{p.qaId ? p.qaId.username : '-'}</td>
                  <td className="p-3 opacity-70">{p.reviewedAt ? new Date(p.reviewedAt).toLocaleString() : '-'}</td>
                  <td className="p-3 truncate max-w-[200px]" title={p.qaComment}>{p.qaComment || '-'}</td>
                </tr>
              ))}
              {phrasesList.length === 0 && (
                <tr>
                  <td colSpan="10" className="p-8 text-center opacity-50">No phrases uploaded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
      </main>
    </div>
  );
}
