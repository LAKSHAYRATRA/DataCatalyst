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
      </main>
    </div>
  );
}
