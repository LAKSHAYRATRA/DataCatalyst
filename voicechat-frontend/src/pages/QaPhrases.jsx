import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, AlertCircle } from 'lucide-react';
import { apiGet, apiPostJson } from '../lib/api';
import SecureAudioPlayer from '../components/SecureAudioPlayer';
import AdminNav from '../components/AdminNav.jsx';

export default function QaPhrases() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState({});
  const [processing, setProcessing] = useState(null);
  const [filterCompany, setFilterCompany] = useState('All');

  // QC States
  const [expandedQc, setExpandedQc] = useState({});
  const [qcData, setQcData] = useState({});
  const [loadingQc, setLoadingQc] = useState({});
  const [errorQc, setErrorQc] = useState({});
  const [lightboxSrc, setLightboxSrc] = useState(null);

  useEffect(() => {
    fetchQueue();
  }, []);

  async function fetchQueue() {
    try {
      setLoading(true);
      const data = await apiGet('/api/phrases/qa/queue');
      setQueue(data.phrases || []);
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

  const toggleQc = async (phraseId) => {
    setExpandedQc(prev => {
      const next = { ...prev, [phraseId]: !prev[phraseId] };
      if (next[phraseId] && !qcData[phraseId]) {
        // Preload cached result if present on the document
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
        className="mb-8"
      >
        <h1 className="text-3xl font-bold mb-2">QA Queue: Phrases</h1>
        <p className="text-neutral-500 dark:text-neutral-400">Review contributor recordings and pass or reject them.</p>
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
                value={filterCompany}
                onChange={(e) => setFilterCompany(e.target.value)}
              >
                <option value="All">All Companies</option>
                {[...new Set(queue.map(q => q.companyId).filter(Boolean))].sort().map(company => (
                  <option key={company} value={company}>{company}</option>
                ))}
              </select>
            </div>
          )}

          <AnimatePresence>
            {(filterCompany === 'All' ? queue : queue.filter(q => q.companyId === filterCompany)).map((p) => (
              <motion.div 
                key={p._id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, height: 0 }}
                className="card border-l-4 border-l-warning-500"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="badge badge-warning">Pending Review</span>
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
                        <span className="font-semibold">{p.contributorId?.username}</span>
                        {p.companyId && (
                          <>
                            <span className="mx-2 opacity-30">|</span>
                            <span className="opacity-70">Company: </span>
                            <span className="font-semibold">{p.companyId}</span>
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

                      <div>
                        <input 
                          type="text" 
                          placeholder="Add QA comment (optional)"
                          className="input text-sm mb-3"
                          value={comments[p._id] || ''}
                          onChange={(e) => setComments(prev => ({ ...prev, [p._id]: e.target.value }))}
                          disabled={processing === p._id}
                        />
                        <div className="flex gap-2">
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

          {(filterCompany === 'All' ? queue : queue.filter(q => q.companyId === filterCompany)).length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              className="text-center py-20 opacity-50"
            >
              <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-xl">The queue is empty!</p>
              <p>No phrases currently awaiting review.</p>
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
