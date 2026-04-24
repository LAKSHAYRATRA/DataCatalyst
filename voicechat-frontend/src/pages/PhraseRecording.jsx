import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Play, UploadCloud, CheckCircle2, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiGet } from '../lib/api';
import { encodeWAV } from '../utils/wavBuilder.js';

export default function PhraseRecording() {
  const [stats, setStats] = useState({ totalSeconds: 0, history: [] });
  const [language, setLanguage] = useState('english');
  const [currentPhrase, setCurrentPhrase] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    fetchStats();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, []);

  async function fetchStats() {
    try {
      const data = await apiGet('/api/phrases/my-stats');
      setStats({ totalSeconds: data.totalSeconds || 0, history: data.history || [] });
    } catch (err) {
      console.error('Failed to fetch stats', err);
    }
  }

  async function fetchNextPhrase() {
    try {
      setLoading(true);
      setError(null);
      resetRecording();
      const data = await apiGet(`/api/phrases/available?language=${language}`);
      if (data.phrase) {
        setCurrentPhrase(data.phrase);
      } else {
        setCurrentPhrase(null);
        setError('No phrases available for this language right now.');
      }
    } catch (err) {
      setError('Failed to fetch phrase.');
    } finally {
      setLoading(false);
    }
  }

  function resetRecording() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    audioChunksRef.current = [];
  }

  const isRecordingRef = useRef(false);
  const audioCtxRef = useRef(null);
  const workletNodeRef = useRef(null);
  const streamRef = useRef(null);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: 1 } });
      resetRecording();
      
      const audioCtx = new AudioContext({ sampleRate: 48000 });
      await audioCtx.audioWorklet.addModule("/pcm-worklet.js");
      const source = audioCtx.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioCtx, "pcm-processor");
      
      // Mute the local playback to prevent feedback loops
      const gain = audioCtx.createGain();
      gain.gain.value = 0;
      
      workletNode.port.onmessage = (e) => {
        if (isRecordingRef.current) {
          audioChunksRef.current.push(new Int16Array(e.data));
        }
      };

      source.connect(workletNode);
      workletNode.connect(gain);
      gain.connect(audioCtx.destination);
      
      audioCtxRef.current = audioCtx;
      workletNodeRef.current = workletNode;
      streamRef.current = stream; // Assume we need to store it to stop it
      isRecordingRef.current = true;
      setIsRecording(true);
      startTimeRef.current = Date.now();
      
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

    } catch (err) {
      console.error(err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setError("Microphone permission denied. Please allow access in browser settings.");
      } else if (err.name === "NotFoundError") {
        setError("No microphone found. Please connect a microphone and try again.");
      } else if (err.name === "SecurityError" || window.location.protocol === "http:") {
        setError("Microphone access requires a secure (HTTPS) connection.");
      } else {
        setError("Could not access microphone. Please check your device and try again.");
      }
    }
  }

  function stopRecording() {
    if (isRecordingRef.current) {
      isRecordingRef.current = false;
      setIsRecording(false);
      clearInterval(timerRef.current);
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (workletNodeRef.current) {
        workletNodeRef.current.disconnect();
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }

      let totalLength = 0;
      for (const arr of audioChunksRef.current) {
        totalLength += arr.length;
      }
      const combined = new Int16Array(totalLength);
      let offset = 0;
      for (const arr of audioChunksRef.current) {
        combined.set(arr, offset);
        offset += arr.length;
      }

      const wavBlob = encodeWAV(combined, 48000, 1);
      setAudioBlob(wavBlob);
      setAudioUrl(URL.createObjectURL(wavBlob));
    }
  }

  async function submitRecording() {
    if (!audioBlob || !currentPhrase) return;
    
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('phraseId', currentPhrase._id);
      formData.append('recording', audioBlob, 'record.wav');
      formData.append('duration', duration);

      const token = document.cookie.split(";").find(c => c.trim().startsWith("vc_token="))?.split("=")[1] || localStorage.getItem("vc_token");
      
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
      const res = await fetch(BACKEND_URL + '/api/phrases/record', {
        method: 'POST',
        credentials: 'include', // THIS is absolutely required to pass the HTTPOnly auth cookies payload!
        body: formData
      });

      if (!res.ok) throw new Error('Failed to upload');
      
      resetRecording();
      await fetchStats();
      await fetchNextPhrase(); // Auto-cycle to the next phrase
    } catch (err) {
      console.error(err);
      setError('Upload failed. Check your network or this phrase may have been claimed by another user.');
    } finally {
      setLoading(false);
    }
  }

  const formatTime = (secs) => {
    let m = Math.floor(secs / 60);
    let s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto min-h-screen text-neutral-900 dark:text-neutral-50 px-4">
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="mb-8 flex flex-col md:flex-row justify-between md:items-end gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold mb-2">TTS Recording Studio</h1>
          <p className="text-neutral-500 dark:text-neutral-400">Contribute your voice to high-quality AI training sets.</p>
        </div>
        <div className="bg-success-100 dark:bg-success-900/30 border border-success-200 dark:border-success-800 p-4 rounded-xl flex items-center gap-4">
          <div className="bg-success-500 text-white p-3 rounded-full">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-success-700 dark:text-success-400">Total Approved Time</p>
            <p className="text-2xl font-mono font-bold text-success-800 dark:text-success-300">{formatTime(stats.totalSeconds)}</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Workspace */}
        <motion.div 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 space-y-6"
        >
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">1. Fetch a Phrase</h2>
            <div className="flex gap-4">
              <select 
                className="input max-w-[200px]"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="english">English</option>
                <option value="hindi">Hindi</option>
                <option value="hinglish">Hinglish</option>
              </select>
              <button 
                className="btn btn-primary"
                onClick={fetchNextPhrase}
                disabled={loading || isRecording}
              >
                {loading && !currentPhrase ? 'Searching...' : 'Get Next Phrase'}
              </button>
            </div>
            {error && <p className="text-error-500 mt-3 text-sm">{error}</p>}
          </div>

          <AnimatePresence mode="popLayout">
            {currentPhrase && (
              <motion.div 
                key={currentPhrase._id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="card border-l-4 border-l-primary-500 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-3 py-1 rounded-bl-xl text-xs font-bold uppercase tracking-wider">
                  {currentPhrase.language}
                </div>
                
                <h2 className="text-lg font-semibold mb-2 opacity-70">Read this text clearly:</h2>
                <div className="bg-neutral-50 dark:bg-neutral-800/80 p-6 rounded-xl border border-neutral-200 dark:border-neutral-700 mb-6">
                  <p className="text-2xl md:text-3xl leading-relaxed font-medium">"{currentPhrase.text}"</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8 bg-neutral-50/50 dark:bg-neutral-900/50 p-4 rounded-lg">
                  {currentPhrase.emotion && <div><span className="block text-xs uppercase opacity-60 mb-1">Emotion</span><span className="font-medium">{currentPhrase.emotion}</span></div>}
                  {currentPhrase.style && <div><span className="block text-xs uppercase opacity-60 mb-1">Style</span><span className="font-medium">{currentPhrase.style}</span></div>}
                  {currentPhrase.speed && <div><span className="block text-xs uppercase opacity-60 mb-1">Speed</span><span className="font-medium">{currentPhrase.speed}</span></div>}
                  {currentPhrase.intent && <div><span className="block text-xs uppercase opacity-60 mb-1">Intent</span><span className="font-medium">{currentPhrase.intent}</span></div>}
                  {currentPhrase.pitch && <div><span className="block text-xs uppercase opacity-60 mb-1">Pitch</span><span className="font-medium">{currentPhrase.pitch}</span></div>}
                  {currentPhrase.volume && <div><span className="block text-xs uppercase opacity-60 mb-1">Volume</span><span className="font-medium">{currentPhrase.volume}</span></div>}
                  {currentPhrase.instructions && <div className="col-span-2 md:col-span-3 mt-2"><span className="block text-xs uppercase opacity-60 mb-1">Notes</span><p className="text-sm border-l-2 border-primary-300 pl-3">{currentPhrase.instructions}</p></div>}
                </div>

                <div className="flex flex-col md:flex-row items-center gap-6 border-t border-neutral-200 dark:border-neutral-700 pt-6">
                  {/* Recorder */}
                  {!isRecording && !audioUrl && (
                    <button 
                      onClick={startRecording}
                      className="w-20 h-20 bg-error-100 hover:bg-error-200 dark:bg-error-900/40 dark:hover:bg-error-900/60 text-error-600 dark:text-error-400 rounded-full flex items-center justify-center transition-all group shadow-inner"
                    >
                      <div className="w-14 h-14 bg-error-500 rounded-full flex items-center justify-center text-white group-hover:scale-105 transition-transform shadow-md">
                        <Mic className="w-6 h-6" />
                      </div>
                    </button>
                  )}

                  {isRecording && (
                    <div className="flex items-center gap-6">
                      <button 
                        onClick={stopRecording}
                        className="w-20 h-20 bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-full flex items-center justify-center transition-all group"
                      >
                        <Square className="w-8 h-8 group-hover:scale-105 transition-transform" />
                      </button>
                      <div className="flex flex-col">
                        <span className="text-error-500 flex items-center gap-2 font-medium tracking-widest pl-2">
                          <span className="w-3 h-3 bg-error-500 rounded-full animate-pulse"></span>
                          RECORDING
                        </span>
                        <span className="text-3xl font-mono mt-1">{formatTime(duration)}</span>
                      </div>
                    </div>
                  )}

                  {audioUrl && !isRecording && (
                    <div className="w-full">
                      <div className="flex items-center justify-between mb-4">
                        <span className="bg-success-100 dark:bg-success-900/40 text-success-700 dark:text-success-400 px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4" /> Recorded ({formatTime(duration)})
                        </span>
                        <button 
                          onClick={resetRecording}
                          className="text-sm font-medium opacity-60 hover:opacity-100 underline transition-opacity"
                        >
                          Rerecord
                        </button>
                      </div>
                      
                      <div className="bg-neutral-100 dark:bg-neutral-800 rounded-xl p-2 mb-4">
                        <audio src={audioUrl} controls controlsList="nodownload noplaybackrate" onContextMenu={(e) => e.preventDefault()} className="w-full h-12" />
                      </div>

                      <button 
                        onClick={submitRecording}
                        disabled={loading}
                        className="w-full btn btn-primary flex items-center justify-center gap-2 py-4 text-lg"
                      >
                        {loading ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <UploadCloud className="w-6 h-6" />}
                        {loading ? 'Submitting...' : 'Submit to QA'}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Sidebar History */}
        <motion.div 
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-1"
        >
          <div className="card h-full">
            <h2 className="text-lg font-semibold mb-4 border-b border-neutral-100 dark:border-neutral-800 pb-3">My Submissions</h2>
            
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {stats.history.map(item => (
                <div key={item._id} className="p-4 rounded-lg border border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-mono opacity-60 truncate mr-2 flex-1">"{item.text.substring(0, 30)}..."</span>
                    <span className={`badge shrink-0 ${
                      item.status === 'approved' ? 'badge-success' : 
                      item.status === 'rejected' ? 'badge-error' : 'badge-warning'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs opacity-70">
                    <span className="capitalize">{item.language}</span>
                    <span>{item.duration > 0 ? formatTime(item.duration) : '--'}</span>
                  </div>
                  {item.qaComment && item.status === 'rejected' && (
                    <div className="mt-2 text-xs text-error-600 dark:text-error-400 bg-error-50 dark:bg-error-900/20 p-2 rounded">
                      <span className="font-semibold block">Feedback:</span> {item.qaComment}
                    </div>
                  )}
                </div>
              ))}
              {stats.history.length === 0 && (
                <p className="text-center opacity-50 text-sm py-8">You haven't submitted any phrases yet.</p>
              )}
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
