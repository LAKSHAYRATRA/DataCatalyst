import React, { useState, useRef, useEffect } from 'react';
import { analyzeSNR } from '../../../utils/clientNoiseAnalysis';

function encodeWAV(chunks, sampleRate) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const samples = new Float32Array(total);
  let off = 0;
  for (const c of chunks) { samples.set(c, off); off += c.length; }

  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v   = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    o += 2;
  }
  return new Blob([buf], { type: 'audio/wav' });
}

const PHRASE = "A purple pig and a green donkey flew a kite in the middle of the night";
const SPEECH_DURATION  = 3;
const SILENCE_DURATION = 3;

const Phase = {
  IDLE:              'idle',
  SPEAK_RECORDING:   'speak_recording',
  SILENCE_RECORDING: 'silence_recording',
  PROCESSING:        'processing',
  RESULT:            'result',
};

async function getMics() {
  const tempStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
  });
  tempStream.getTracks().forEach(t => t.stop());

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter(d => d.kind === 'audioinput')
    .map(d => ({ deviceId: d.deviceId, label: d.label || `Microphone (${d.deviceId.slice(0, 8)})` }));
}

export default function MicrophoneTest({ onSuccess }) {
  const [mics, setMics]               = useState(null);
  const [selectedMicId, setSelectedMicId] = useState(null);
  const [phase, setPhase]             = useState(Phase.IDLE);
  const [timer, setTimer]             = useState(0);
  const [result, setResult]           = useState(null);
  const [loadError, setLoadError]     = useState(null);
  const [playbackUrl, setPlaybackUrl] = useState(null);
  const [isPlaying, setIsPlaying]     = useState(false);
  const audioRef                      = useRef(null);

  const streamRef        = useRef(null);
  const audioCtxRef      = useRef(null);
  const workletNodeRef   = useRef(null);
  const timerRef         = useRef(null);
  const silenceChunksRef = useRef([]);
  const speechChunksRef  = useRef([]);
  const analyserRef      = useRef(null);
  const animFrameRef     = useRef(null);
  const canvasRef        = useRef(null);

  useEffect(() => { loadMics(); }, []);

  const loadMics = async () => {
    setMics(null); setLoadError(null);
    try {
      const found = await getMics();
      setMics(found);
      if (found.length > 0) setSelectedMicId(found[0].deviceId);
    } catch (err) {
      setLoadError(err?.message || 'Permission denied');
      setMics([]);
    }
  };

  const startStream = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 48000,
        channelCount: 1,
        ...(selectedMicId ? { deviceId: { exact: selectedMicId } } : {}),
      }
    });
    streamRef.current = stream;

    const audioCtx = new AudioContext({ sampleRate: 48000 });
    audioCtxRef.current = audioCtx;
    await audioCtx.audioWorklet.addModule('/pcm-worklet.js');

    const source   = audioCtx.createMediaStreamSource(stream);
    const worklet  = new AudioWorkletNode(audioCtx, 'pcm-processor');
    workletNodeRef.current = worklet;

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    // silent output — we only want the data
    const gain = audioCtx.createGain();
    gain.gain.value = 0;
    source.connect(analyser);
    source.connect(worklet);
    worklet.connect(gain);
    gain.connect(audioCtx.destination);

    return worklet;
  };

  const stopStream = () => {
    clearInterval(timerRef.current);
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = null;
    if (workletNodeRef.current) { workletNodeRef.current.disconnect(); workletNodeRef.current = null; }
    if (audioCtxRef.current)    { audioCtxRef.current.close();         audioCtxRef.current    = null; }
    if (streamRef.current)      { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    analyserRef.current = null;
  };

  const startVisualizer = () => {
    cancelAnimationFrame(animFrameRef.current);
    const canvas   = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx     = canvas.getContext('2d');
    const bufLen  = analyser.frequencyBinCount;
    const dataArr = new Uint8Array(bufLen);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArr);

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const barW = (w / bufLen) * 2.5;
      let x = 0;
      for (let i = 0; i < bufLen; i++) {
        const barH = (dataArr[i] / 255) * h;
        ctx.fillStyle = `hsl(${220 + (dataArr[i] / 255) * 60}, 80%, 60%)`;
        ctx.fillRect(x, h - barH, barW, barH);
        x += barW + 1;
      }
    };
    draw();
  };

  const startTest = async () => {
    try {
      speechChunksRef.current  = [];
      silenceChunksRef.current = [];

      const worklet = await startStream();
      worklet.port.onmessage = e => speechChunksRef.current.push(new Float32Array(e.data));

      setPhase(Phase.SPEAK_RECORDING);
      setTimeout(startVisualizer, 50);
      setTimer(SPEECH_DURATION);

      let remaining = SPEECH_DURATION;
      timerRef.current = setInterval(() => {
        remaining -= 1;
        setTimer(remaining);
        if (remaining <= 0) {
          clearInterval(timerRef.current);
          beginSilencePhase(worklet);
        }
      }, 1000);
    } catch {
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const beginSilencePhase = (worklet) => {
    worklet.port.onmessage = e => silenceChunksRef.current.push(new Float32Array(e.data));
    setPhase(Phase.SILENCE_RECORDING);
    setTimer(SILENCE_DURATION);

    let remaining = SILENCE_DURATION;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setTimer(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        finishRecording();
      }
    }, 1000);
  };

  const finishRecording = () => {
    stopStream();
    setPhase(Phase.PROCESSING);

    try {
      const res = analyzeSNR(silenceChunksRef.current, speechChunksRef.current);
      setResult(res);
      const blob = encodeWAV(speechChunksRef.current, 48000);
      setPlaybackUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
    } catch (err) {
      console.error('RMS analysis failed:', err);
      setResult({ hasNoise: false, rating: 0, label: 'Analysis failed — proceeding anyway.' });
    }
    setPhase(Phase.RESULT);
  };

  const reset = () => {
    stopStream();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPlaybackUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    setIsPlaying(false);
    setResult(null);
    setPhase(Phase.IDLE);
    setTimer(0);
  };

  const togglePlay = () => {
    if (!playbackUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(playbackUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    }
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (mics === null) {
    return (
      <div className="py-12 animate-slide-up w-full flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        <p className="text-neutral-500 text-sm">Checking microphones…</p>
      </div>
    );
  }

  if (mics.length === 0) {
    return (
      <div className="py-12 animate-slide-up w-full">
        <div className="text-center mb-8">
          <h3 className="text-3xl font-bold text-neutral-900 mb-3">Microphone Test</h3>
        </div>
        <div className="rounded-xl border-2 border-dashed border-warning-300 bg-warning-50 p-8 text-center space-y-4 max-w-md mx-auto">
          <p className="font-semibold text-warning-800">
            {loadError ? `Error: ${loadError}` : 'No microphone detected. Please connect one and refresh.'}
          </p>
          <button onClick={loadMics} className="btn btn-primary">Refresh Devices</button>
        </div>
      </div>
    );
  }

  // ── Main UI ──────────────────────────────────────────────────────────────────
  return (
    <div className="py-12 animate-slide-up w-full">
      <div className="text-center mb-8">
        <h3 className="text-3xl font-bold text-neutral-900 mb-3">Microphone Test</h3>
        <p className="text-lg text-neutral-600">
          {phase === Phase.IDLE              && "First you'll speak, then stay silent — takes 6 seconds."}
          {phase === Phase.SPEAK_RECORDING   && 'Read the phrase out loud clearly.'}
          {phase === Phase.SILENCE_RECORDING && 'Now stay completely silent…'}
          {phase === Phase.PROCESSING        && 'Analyzing…'}
          {phase === Phase.RESULT            && (result?.hasNoise ? 'Issues detected.' : 'All clear!')}
        </p>
      </div>

      {/* Mic selector */}
      {phase === Phase.IDLE && mics.length > 1 && (
        <div className="max-w-md mx-auto mb-6">
          <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Select Microphone</label>
          <select
            value={selectedMicId || ''}
            onChange={e => setSelectedMicId(e.target.value)}
            className="input w-full mt-1 text-sm"
          >
            {mics.map(m => <option key={m.deviceId} value={m.deviceId}>🎙 {m.label}</option>)}
          </select>
        </div>
      )}

      <div className="space-y-6 flex flex-col items-center">

        {/* Recording phases — canvas stays mounted so visualizer never restarts */}
        {(phase === Phase.SPEAK_RECORDING || phase === Phase.SILENCE_RECORDING) && (
          <>
            {phase === Phase.SPEAK_RECORDING && (
              <div className="bg-neutral-900 p-8 rounded-xl text-center w-full max-w-xl">
                <p className="text-xs uppercase tracking-widest text-neutral-400 mb-3 font-semibold">Read this phrase aloud</p>
                <p className="text-xl md:text-2xl font-serif italic text-white leading-relaxed">"{PHRASE}"</p>
              </div>
            )}
            <div className="flex flex-col items-center gap-4">
              <canvas ref={canvasRef} width={280} height={64} className="rounded-lg bg-neutral-900" />
              <div className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg ${
                phase === Phase.SPEAK_RECORDING ? 'bg-error-500 animate-pulse' : 'bg-primary-600'
              }`}>
                <span className="text-white text-3xl font-bold">{timer}</span>
              </div>
              <p className="text-xs text-neutral-400">
                {phase === Phase.SPEAK_RECORDING ? 'Speaking…' : 'Listening for silence…'}
              </p>
            </div>
          </>
        )}

        {/* Processing */}
        {phase === Phase.PROCESSING && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            <p className="text-primary-600 font-semibold text-lg animate-pulse">Analyzing…</p>
          </div>
        )}

        {/* Start button */}
        {phase === Phase.IDLE && (
          <button onClick={startTest} className="btn btn-primary">
            Start Microphone Test
          </button>
        )}

        {/* Result */}
        {phase === Phase.RESULT && result && (
          <div className="w-full max-w-md animate-scale-in">
            {result.hasNoise ? (
              <div className="card border-error-200 bg-error-50">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-error-500 flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                        d="M12 9v4m0 4h.01M10.29 3.86l-7.5 13A1 1 0 003.66 18h16.68a1 1 0 00.87-1.5l-7.5-13a1 1 0 00-1.74 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-error-800">Environment Issue Detected</h4>
                    <p className="text-sm text-neutral-600 mt-1">{result.label}</p>
                  </div>
                </div>
                <div className="bg-error-100 rounded-lg p-4 text-sm text-error-800 mb-4">
                  <p className="font-semibold mb-1">💡 What to try:</p>
                  <ul className="list-disc list-inside space-y-1 text-error-700">
                    <li>Move to a quieter room</li>
                    <li>Turn off fans, TVs, or music</li>
                    <li>Close windows facing traffic</li>
                    <li>Speak closer to the microphone</li>
                  </ul>
                </div>
                <button
                  onClick={togglePlay}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg border border-neutral-300 bg-white text-neutral-700 text-sm font-medium hover:bg-neutral-50 transition-colors mb-3"
                >
                  {isPlaying ? (
                    <><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>Stop Playback</>
                  ) : (
                    <><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z"/></svg>Hear What Your Mic Recorded</>
                  )}
                </button>
                <button onClick={reset} className="btn btn-primary w-full">Try Again</button>
              </div>
            ) : (
              <div className="card border-success-200 bg-success-50">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-success-500 flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-success-800">Environment Sounds Clear!</h4>
                    <p className="text-sm text-neutral-600 mt-1">{result.label}</p>
                  </div>
                </div>
                <button
                  onClick={togglePlay}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg border border-neutral-300 bg-white text-neutral-700 text-sm font-medium hover:bg-neutral-50 transition-colors mb-3"
                >
                  {isPlaying ? (
                    <><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>Stop Playback</>
                  ) : (
                    <><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z"/></svg>Hear What Your Mic Recorded</>
                  )}
                </button>
                <button onClick={onSuccess} className="btn btn-success w-full">Continue →</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
