import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, AlertCircle, Download, Trash2, Clock, CheckCircle2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { apiGet, apiPostJson } from '../lib/api';
import { getUserInfo } from '../lib/auth';
import SecureAudioPlayer from '../components/SecureAudioPlayer';
import AdminNav from '../components/AdminNav.jsx';

export default function QaPhrases() {
  const userInfo = getUserInfo();
  const isAdmin = Boolean(userInfo?.isAdmin);
  const [activeTab, setActiveTab] = useState('recorded'); // 'recorded' (Pending) | 'approved' (Approved)
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState({});
  const [processing, setProcessing] = useState(null);
  const [filterProject, setFilterProject] = useState('All');

  // QC States
  const [expandedQc, setExpandedQc] = useState({});
  const [qcData, setQcData] = useState({});
  const [loadingQc, setLoadingQc] = useState({});
  const [errorQc, setErrorQc] = useState({});
  const [lightboxSrc, setLightboxSrc] = useState(null);

  useEffect(() => {
    fetchQueue(activeTab);
  }, [activeTab]);

  async function fetchQueue(tabStatus = activeTab) {
    try {
      setLoading(true);
      const data = await apiGet(`/api/phrases/qa/queue?status=${tabStatus}`);
      const phrases = data.phrases || [];
      setQueue(phrases);
      
      // Auto-reset project filter if the selected project is no longer in the active queue
      if (filterProject !== 'All') {
        const activeProjects = new Set(phrases.map(q => q.projectName || q.companyId).filter(Boolean));
        if (!activeProjects.has(filterProject)) {
          setFilterProject('All');
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleReview = async (phraseId, action) => {
    setProcessing(phraseId);
    try {
      await apiPostJson(`/api/phrases/qa/review/${phraseId}`, { action, comment: comments[phraseId] || '' });
      setComments(prev => { const next = { ...prev }; delete next[phraseId]; return next; });
      setQueue(queue.filter(q => q._id !== phraseId));
    } catch (err) {
      console.error(err);
      alert('Failed to submit review');
    } finally {
      setProcessing(null);
    }
  };

  const handleDeletePhrase = async (phrase) => {
    const result = await Swal.fire({
      title: 'Delete Phrase Options',
      html: `
        <div class="text-left text-sm space-y-3">
          <p class="font-medium text-neutral-300">Select how you would like to delete this phrase recording:</p>
          <div class="p-3 bg-red-950/50 border border-red-800/80 rounded-lg">
            <strong class="text-red-400 block mb-1">🗑️ Delete Whole</strong>
            <span class="text-xs text-neutral-300">Permanently removes the phrase from workloads. It will NOT go back to phrase workloads for anyone else to record.</span>
          </div>
          <div class="p-3 bg-amber-950/50 border border-amber-800/80 rounded-lg">
            <strong class="text-amber-400 block mb-1">🎙️ Delete Recording</strong>
            <span class="text-xs text-neutral-300">Deletes the recorded audio and speaker metadata, resetting status to pending so it GOES BACK to phrase workloads for re-recording.</span>
          </div>
        </div>
      `,
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: 'Delete Whole',
      confirmButtonColor: '#dc2626',
      denyButtonText: 'Delete Recording',
      denyButtonColor: '#d97706',
      cancelButtonText: 'Cancel',
      cancelButtonColor: '#4b5563',
      customClass: {
        popup: 'dark:bg-neutral-800 dark:text-white',
      }
    });

    if (result.isConfirmed) {
      // Delete Whole
      try {
        setProcessing(phrase._id);
        await apiPostJson(`/api/phrases/admin/delete/${phrase._id}`, { mode: 'delete-whole' });
        setQueue(queue.filter(q => q._id !== phrase._id));
        Swal.fire({ icon: 'success', title: 'Deleted Permanently', text: 'Phrase removed from workloads entirely.', timer: 2000, showConfirmButton: false });
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Deletion Failed', text: err.message });
      } finally {
        setProcessing(null);
      }
    } else if (result.isDenied) {
      // Delete Recording
      try {
        setProcessing(phrase._id);
        await apiPostJson(`/api/phrases/admin/delete/${phrase._id}`, { mode: 'delete-recording' });
        setQueue(queue.filter(q => q._id !== phrase._id));
        Swal.fire({ icon: 'success', title: 'Recording Deleted', text: 'Phrase returned to workloads for re-recording.', timer: 2000, showConfirmButton: false });
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Deletion Failed', text: err.message });
      } finally {
        setProcessing(null);
      }
    }
  };

  const toggleQc = async (phraseId) => {
    setExpandedQc(prev => {
      const next = { ...prev, [phraseId]: !prev[phraseId] };
      if (next[phraseId] && !qcData[phraseId]) {
        const item = queue.find(q => q._id === phraseId);
        if (item && item.qcResult) {
          setQcData(p => ({ ...p, [phraseId]: item.qcResult }));
        } else {
          runQC(phraseId);
        }
      }
      return next;
    });
  };

  const runQC = async (phraseId, force = false) => {
    setLoadingQc(prev => ({ ...prev, [phraseId]: true }));
    setErrorQc(prev => ({ ...prev, [phraseId]: null }));
    try {
      const url = `/api/phrases/qa/analyze/${phraseId}${force ? '?force=true' : ''}`;
      const res = await apiPostJson(url, {});
      setQcData(prev => ({ ...prev, [phraseId]: res }));
    } catch (err) {
      console.error(err);
      setErrorQc(prev => ({ ...prev, [phraseId]: err.message || 'Analysis failed' }));
    } finally {
      setLoadingQc(prev => ({ ...prev, [phraseId]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex transition-colors duration-300">
      <AdminNav />
      <main className="flex-1 md:ml-64 p-8 max-w-5xl mx-auto text-neutral-900 dark:text-neutral-50">
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div>
            <h1 className="text-3xl font-bold mb-1">QA Queue: Phrases</h1>
            <p className="text-neutral-500 dark:text-neutral-400">Review contributor recordings and pass or reject them.</p>
          </div>

          {/* Top Status Tabs */}
          <div className="flex items-center gap-2 bg-neutral-200 dark:bg-neutral-800 p-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 w-max">
            <button
              onClick={() => setActiveTab('recorded')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'recorded'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" /> Pending Review
            </button>
            <button
              onClick={() => setActiveTab('approved')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'approved'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Approved Phrases
            </button>
          </div>
        </motion.div>

        {loading ? (
          <div className="flex justify-center p-12">
            <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {queue.length > 0 && (
              <div className="flex justify-end mb-4">
                <select 
                  className="input w-full md:w-64"
                  value={filterProject}
                  onChange={(e) => setFilterProject(e.target.value)}
                >
                  <option value="All">All Projects</option>
                  {[...new Set(queue.map(q => q.projectName || q.companyId).filter(Boolean))].sort().map(project => (
                    <option key={project} value={project}>{project}</option>
                  ))}
                </select>
              </div>
            )}

            <AnimatePresence>
              {(filterProject === 'All' ? queue : queue.filter(q => (q.projectName || q.companyId) === filterProject)).map((p) => (
                <motion.div 
                  key={p._id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95, height: 0 }}
                  className={`card border-l-4 ${activeTab === 'approved' ? 'border-l-emerald-500' : 'border-l-warning-500'}`}
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row gap-6">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {p.status === 'approved' ? (
                            <span className="badge bg-emerald-600 text-white font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Approved
                            </span>
                          ) : (
                            <span className="badge badge-warning">Pending Review</span>
                          )}
                          {p.isTestPhrase && (
                            <span className="badge bg-error-500 text-white font-bold animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                              TEST PHRASE
                            </span>
                          )}
                          <span className="text-sm font-mono opacity-60">ID: {p.phraseId}</span>
                          <span className="text-sm font-semibold capitalize bg-neutral-100 dark:bg-neutral-700 px-2 rounded">{p.language}</span>
                        </div>
                        
                        <h3 className="text-xl font-medium mb-4 leading-relaxed bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-lg border border-neutral-100 dark:border-neutral-700">
                          "{p.text}"
                        </h3>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4 opacity-80">
                          {p.emotion && <div><span className="font-semibold block text-xs uppercase tracking-wider opacity-70">Emotion</span> {p.emotion}</div>}
                          {p.style && <div><span className="font-semibold block text-xs uppercase tracking-wider opacity-70">Style</span> {p.style}</div>}
                          {p.speed && <div><span className="font-semibold block text-xs uppercase tracking-wider opacity-70">Speed</span> {p.speed}</div>}
                          {p.intent && <div><span className="font-semibold block text-xs uppercase tracking-wider opacity-70">Intent</span> {p.intent}</div>}
                          {p.pitch && <div><span className="font-semibold block text-xs uppercase tracking-wider opacity-70">Pitch</span> {p.pitch}</div>}
                          {p.volume && <div><span className="font-semibold block text-xs uppercase tracking-wider opacity-70">Volume</span> {p.volume}</div>}
                          {p.instructions && <div className="col-span-2 md:col-span-4 mt-2"><span className="font-semibold block text-xs uppercase tracking-wider opacity-70">Instructions</span> {p.instructions}</div>}
                        </div>

                        <p className="text-sm border-t border-neutral-200 dark:border-neutral-700 pt-3 mt-3">
                          <span className="opacity-70">Contributor: </span>
                          <span className="font-semibold">{p.contributorId?.username || p.contributorId?.firstname || 'Unknown'}</span>
                          {p.contributorId?.speaker_id && (
                            <>
                              <span className="mx-2 opacity-30">|</span>
                              <span className="opacity-70">Speaker ID: </span>
                              <span className="font-mono text-xs font-semibold bg-neutral-200 dark:bg-neutral-800 px-1.5 py-0.5 rounded">{p.contributorId.speaker_id}</span>
                            </>
                          )}
                          {(p.projectName || p.companyId) && (
                            <>
                              <span className="mx-2 opacity-30">|</span>
                              <span className="opacity-70">Project: </span>
                              <span className="font-semibold">{p.projectName || p.companyId}</span>
                            </>
                          )}
                        </p>
                      </div>

                      <div className="md:w-80 flex flex-col justify-between bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
                        <div className="mb-4">
                          <h4 className="font-medium mb-3 flex justify-between items-center text-sm">
                            Playback Audio
                            <span className="opacity-50 font-mono text-xs">NO DOWNLOADING</span>
                          </h4>
                          <SecureAudioPlayer url={`/api/phrases/${p._id}/audio`} />
                        </div>

                        <div className="space-y-2">
                          {isAdmin && p.audioFile && (
                            <button
                              type="button"
                              onClick={() => window.open(`${import.meta.env.VITE_BACKEND_URL || "http://localhost:3001"}/api/phrases/admin/download-zip/${p._id}`, '_blank')}
                              className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
                              title="Download ZIP bundle containing audio.wav, speaker_metadata.json, and utterance.json"
                            >
                              <Download className="w-4 h-4" /> Download Phrase ZIP
                            </button>
                          )}

                          {activeTab === 'recorded' && (
                            <div>
                              <input 
                                type="text" 
                                placeholder="Add QA comment (optional)"
                                className="input text-sm mb-2"
                                value={comments[p._id] || ''}
                                onChange={(e) => setComments(prev => ({ ...prev, [p._id]: e.target.value }))}
                                disabled={processing === p._id}
                              />
                              <div className="flex gap-2 mb-2">
                                <button 
                                  className="flex-1 btn btn-success flex items-center justify-center gap-2 py-2"
                                  onClick={() => handleReview(p._id, 'approve')}
                                  disabled={processing === p._id}
                                >
                                  <Check className="w-4 h-4" /> Approve
                                </button>
                                <button 
                                  className="flex-1 btn btn-error flex items-center justify-center gap-2 py-2"
                                  onClick={() => handleReview(p._id, 'reject')}
                                  disabled={processing === p._id}
                                >
                                  <X className="w-4 h-4" /> Reject
                                </button>
                              </div>
                            </div>
                          )}

                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleDeletePhrase(p)}
                              disabled={processing === p._id}
                              className="w-full py-2 px-3 bg-red-600/90 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
                              title="Delete phrase options"
                            >
                              <Trash2 className="w-4 h-4" /> Delete Phrase
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* QC Collapse drawer */}
                    <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4">
                      <button
                        onClick={() => toggleQc(p._id)}
                        className="w-full flex items-center justify-between text-sm font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
                      >
                        <span className="flex items-center gap-2">📊 {expandedQc[p._id] ? 'Close QC Analysis' : 'Open QC Analysis'}</span>
                        <span>{expandedQc[p._id] ? '▲' : '▼'}</span>
                      </button>

                      {expandedQc[p._id] && (
                        <div className="mt-4 bg-neutral-100/50 dark:bg-neutral-900/50 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs">
                          {loadingQc[p._id] ? (
                            <div className="flex flex-col items-center justify-center py-6 gap-2">
                              <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                              <span className="opacity-60 font-medium">Running frequency checks...</span>
                            </div>
                          ) : errorQc[p._id] ? (
                            <div className="text-error-500 font-semibold p-2 flex flex-col gap-2">
                              <span>⚠️ {errorQc[p._id]}</span>
                              <button 
                                onClick={() => runQC(p._id, true)}
                                className="px-3 py-1 bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-100 rounded font-semibold text-xxs w-max transition-colors"
                              >
                                Retry
                              </button>
                            </div>
                          ) : qcData[p._id] ? (
                            <div className="space-y-4">
                              <div className="flex justify-between items-center border-b border-neutral-200 dark:border-neutral-800 pb-2">
                                <span className="font-bold uppercase tracking-wider text-neutral-400">QC Analysis Metrics</span>
                                <button 
                                  onClick={() => runQC(p._id, true)}
                                  className="px-2 py-1 bg-neutral-700 hover:bg-neutral-600 text-warning-400 hover:text-warning-300 rounded font-semibold transition-colors"
                                >
                                  🔄 Re-run
                                </button>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="p-3 bg-white dark:bg-neutral-850 rounded-lg border border-neutral-200/50 dark:border-neutral-800/80">
                                  <span className="block text-neutral-400 font-bold uppercase tracking-wider mb-1">Bit Depth</span>
                                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">{qcData[p._id].freq.bit_depth || '—'}</span>
                                </div>
                                <div className="p-3 bg-white dark:bg-neutral-850 rounded-lg border border-neutral-200/50 dark:border-neutral-800/80">
                                  <span className="block text-neutral-400 font-bold uppercase tracking-wider mb-1">Noise Floor</span>
                                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">{qcData[p._id].freq.noise_floor ? `${qcData[p._id].freq.noise_floor} dBFS` : '—'}</span>
                                </div>
                                <div className="p-3 bg-white dark:bg-neutral-850 rounded-lg border border-neutral-200/50 dark:border-neutral-800/80">
                                  <span className="block text-neutral-400 font-bold uppercase tracking-wider mb-1">Crest Factor</span>
                                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">{qcData[p._id].freq.crest_factor ? `${qcData[p._id].freq.crest_factor} dB` : '—'}</span>
                                </div>
                                <div className="p-3 bg-white dark:bg-neutral-850 rounded-lg border border-neutral-200/50 dark:border-neutral-800/80">
                                  <span className="block text-neutral-400 font-bold uppercase tracking-wider mb-1">Processing Verdict</span>
                                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">{qcData[p._id].freq.processing_verdict || 'Clean ✅'}</span>
                                </div>
                              </div>

                              <div className="pt-2">
                                <span className="block text-neutral-400 font-bold uppercase tracking-wider mb-2">Spectrogram Plot (20Hz - 20kHz)</span>
                                {qcData[p._id].freq.spectrogram_img ? (
                                  <div className="rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800">
                                    <img 
                                      src={`data:image/png;base64,${qcData[p._id].freq.spectrogram_img}`} 
                                      alt="Spectrogram Plot" 
                                      className="w-full object-contain cursor-zoom-in hover:brightness-110 transition-all"
                                      onClick={() => setLightboxSrc(qcData[p._id].freq.spectrogram_img)}
                                    />
                                  </div>
                                ) : (
                                  <div className="p-4 text-center text-neutral-400 bg-white dark:bg-neutral-850 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl">
                                    No spectrogram plot generated.
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {(filterProject === 'All' ? queue : queue.filter(q => (q.projectName || q.companyId) === filterProject)).length === 0 && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                className="text-center py-20 opacity-50"
              >
                <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-xl">The queue is empty!</p>
                <p>No phrases currently in the {activeTab === 'approved' ? 'Approved Phrases' : 'Pending Review'} view.</p>
              </motion.div>
            )}
          </div>
        )}
        {/* Spectrogram Lightbox Modal */}
        {lightboxSrc && (
          <div 
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/95 backdrop-blur-sm cursor-zoom-out animate-fade-in"
            onClick={() => setLightboxSrc(null)}
          >
            <div className="relative max-w-[95vw] max-h-[85vh] flex flex-col items-center">
              <img 
                src={`data:image/png;base64,${lightboxSrc}`} 
                alt="Spectrogram Zoomed" 
                className="max-w-full max-h-[80vh] object-contain rounded-lg border border-neutral-700 shadow-2xl"
              />
              <div className="mt-4 text-xs font-semibold text-neutral-400 bg-neutral-900/80 px-3 py-1.5 rounded-full border border-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                <span>📊 Zoomed Spectrogram Plot (Click anywhere to close)</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
