import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, Sparkles, Loader2 } from 'lucide-react';

export default function InteractiveWaveformTrimmer({
  audioUrl,
  duration,
  startTrimSec,
  endTrimSec,
  onTrimChange
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [pcmPeaks, setPcmPeaks] = useState([]);
  const [blobUrl, setBlobUrl] = useState(null);
  const [totalDuration, setTotalDuration] = useState(duration || 1);
  const [loadingAudio, setLoadingAudio] = useState(true);
  const [draggingHandle, setDraggingHandle] = useState(null); // 'start' | 'end' | null
  const [isPlaying, setIsPlaying] = useState(false);
  const [activePlayMode, setActivePlayMode] = useState(null); // 'start2s' | 'end2s' | 'full' | null
  const [playheadSec, setPlayheadSec] = useState(startTrimSec || 0);
  const [isVadRunning, setIsVadRunning] = useState(false);
  const [vadFeedback, setVadFeedback] = useState(null);

  const audioRef = useRef(null);
  const animFrameRef = useRef(null);

  const pcmDataRef = useRef(null);
  const sampleRateRef = useRef(44100);

  const startRef = useRef(startTrimSec);
  const endRef = useRef(endTrimSec);
  const draggingHandleRef = useRef(null);

  useEffect(() => {
    startRef.current = startTrimSec;
    endRef.current = endTrimSec;
  }, [startTrimSec, endTrimSec]);

  // Cleanup object URL & audio
  useEffect(() => {
    return () => {
      if (blobUrl) {
        try { URL.revokeObjectURL(blobUrl); } catch (e) {}
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [blobUrl]);

  // 1. Single authenticated fetch & safe PCM decode
  useEffect(() => {
    let isCancelled = false;
    async function loadAudioData() {
      if (!audioUrl) return;
      setLoadingAudio(true);
      try {
        const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
        const fullUrl = String(audioUrl).startsWith("http") ? audioUrl : BACKEND + audioUrl;

        let token = null;
        try {
          const cookies = document.cookie.split(";").map((c) => c.trim());
          const vcCookie = cookies.find((c) => c.startsWith("vc_token="));
          if (vcCookie) token = vcCookie.split("=")[1];
          else token = localStorage.getItem("vc_token");
        } catch (e) {}

        const res = await fetch(fullUrl, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();

        if (isCancelled) return;

        // Blob URL for Audio Player
        const blob = new Blob([arrayBuffer], { type: res.headers.get("content-type") || "audio/wav" });
        const bUrl = URL.createObjectURL(blob);
        setBlobUrl(bUrl);

        // Safe PCM Peak Extraction
        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) {
            const audioCtx = new AudioCtx();
            const bufferCopy = arrayBuffer.slice(0);
            const decodedBuffer = await audioCtx.decodeAudioData(bufferCopy);
            
            if (!isCancelled && decodedBuffer) {
              const fetchedDur = parseFloat((decodedBuffer.duration || duration || 1).toFixed(2));
              setTotalDuration(fetchedDur);

              // ALWAYS select the WHOLE audio by default when audio is loaded
              onTrimChange(0, fetchedDur);

              const channelData = decodedBuffer.getChannelData(0);
              pcmDataRef.current = channelData;
              sampleRateRef.current = decodedBuffer.sampleRate;

              const numBars = 160;
              const blockSize = Math.floor(channelData.length / numBars);
              const peaks = new Float32Array(numBars);
              for (let i = 0; i < numBars; i++) {
                const start = i * blockSize;
                let max = 0;
                for (let j = 0; j < blockSize; j++) {
                  const val = Math.abs(channelData[start + j]);
                  if (val > max) max = val;
                }
                peaks[i] = max;
              }
              setPcmPeaks(peaks);
            }
            try { audioCtx.close(); } catch (e) {}
          }
        } catch (decErr) {
          console.warn("Waveform PCM decode fallback:", decErr);
        }

        setLoadingAudio(false);
      } catch (err) {
        console.error("Failed to load trim audio:", err);
        setLoadingAudio(false);
      }
    }

    loadAudioData();
    return () => {
      isCancelled = true;
    };
  }, [audioUrl, duration]);

  // 2. Draw canvas waveform & speech regions
  const drawWaveform = useCallback(() => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width || 600;
      const height = canvas.height || 140;

      ctx.clearRect(0, 0, width, height);

      if (loadingAudio) {
        ctx.fillStyle = "#a3a3a3";
        ctx.font = "bold 13px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Decoding & Rendering Visual Audio Waveform...", width / 2, height / 2 + 4);
        return;
      }

      const dur = Math.max(0.1, Number(totalDuration) || 1);
      const safeStart = Math.max(0, isNaN(startTrimSec) ? 0 : Number(startTrimSec));
      const safeEnd = Math.max(safeStart + 0.05, isNaN(endTrimSec) ? dur : Number(endTrimSec));
      const safePlay = isNaN(playheadSec) ? safeStart : Number(playheadSec);

      const startX = Math.min(width, Math.max(0, (safeStart / dur) * width));
      const endX = Math.min(width, Math.max(startX + 1, (safeEnd / dur) * width));
      const playX = Math.min(width, Math.max(0, (safePlay / dur) * width));

      // Draw subtle centerline
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Draw background waveform bars
      const numBars = (pcmPeaks && pcmPeaks.length) ? pcmPeaks.length : 120;
      const barGap = 2;
      const barWidth = Math.max(1.5, (width - numBars * barGap) / numBars);

      for (let i = 0; i < numBars; i++) {
        const x = i * (barWidth + barGap);
        const val = (pcmPeaks && pcmPeaks[i] !== undefined) ? pcmPeaks[i] : 0.08;
        const barHeight = Math.max(6, val * (height - 24));
        const y = (height - barHeight) / 2;

        if (x >= startX && x <= endX) {
          // Vibrant Violet/Purple gradient for selected speech
          const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
          grad.addColorStop(0, "#c084fc");
          grad.addColorStop(0.5, "#a855f7");
          grad.addColorStop(1, "#7e22ce");
          ctx.fillStyle = grad;
        } else {
          // Dimmed slate for trimmed/silent edges
          ctx.fillStyle = "#334155";
        }

        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, barHeight, 3);
        } else {
          ctx.rect(x, y, barWidth, barHeight);
        }
        ctx.fill();
      }

      // Draw dark semi-transparent overlay mask outside trim boundaries
      ctx.fillStyle = "rgba(0, 0, 0, 0.68)";
      if (startX > 0) {
        ctx.fillRect(0, 0, startX, height);
      }
      if (endX < width) {
        ctx.fillRect(endX, 0, width - endX, height);
      }

      // Draw Playhead line if playing
      if (isPlaying && playX >= startX && playX <= endX) {
        ctx.strokeStyle = "#fbbf24"; // Bright amber playhead
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(playX, 0);
        ctx.lineTo(playX, height);
        ctx.stroke();
      }
    } catch (err) {
      console.error("drawWaveform error:", err);
    }
  }, [pcmPeaks, totalDuration, startTrimSec, endTrimSec, playheadSec, isPlaying, loadingAudio]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  // Handle Canvas Resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth || 600;
        canvasRef.current.height = 140;
        drawWaveform();
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [drawWaveform]);

  // Stop current playback
  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setIsPlaying(false);
    setActivePlayMode(null);
  }, []);

  // Global pointer drag handlers for 100% smooth dragging anywhere on screen
  useEffect(() => {
    const handleGlobalMove = (e) => {
      if (!draggingHandleRef.current || !containerRef.current || !totalDuration) return;
      const rect = containerRef.current.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const moveX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const dur = Math.max(0.1, Number(totalDuration) || 1);
      const timeSec = parseFloat(((moveX / rect.width) * dur).toFixed(2));

      if (draggingHandleRef.current === 'start') {
        const newStart = Math.max(0, Math.min(timeSec, endRef.current - 0.1));
        onTrimChange(newStart, endRef.current);
      } else if (draggingHandleRef.current === 'end') {
        const newEnd = Math.min(dur, Math.max(timeSec, startRef.current + 0.1));
        onTrimChange(startRef.current, newEnd);
      }
    };

    const handleGlobalUp = () => {
      setDraggingHandle(null);
      draggingHandleRef.current = null;
    };

    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('mouseup', handleGlobalUp);
    window.addEventListener('touchmove', handleGlobalMove);
    window.addEventListener('touchend', handleGlobalUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('touchmove', handleGlobalMove);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, [totalDuration, onTrimChange]);

  // Range-bounded playback for 2s Start, 2s End, or Full selection
  const playRange = useCallback((fromSec, toSec, mode) => {
    if (!audioRef.current) return;
    const audio = audioRef.current;

    // Toggle off if currently playing in this mode
    if (isPlaying && activePlayMode === mode) {
      stopPlayback();
      return;
    }

    stopPlayback();

    const dur = Math.max(0.1, Number(totalDuration) || 1);
    const safeFrom = Math.max(0, Math.min(Number(fromSec) || 0, dur - 0.05));
    const safeTo = Math.max(safeFrom + 0.05, Math.min(Number(toSec) || dur, dur));

    audio.currentTime = safeFrom;
    setPlayheadSec(safeFrom);

    audio.play().then(() => {
      setIsPlaying(true);
      setActivePlayMode(mode);

      const checkPlayhead = () => {
        if (!audioRef.current || audioRef.current.paused) {
          setIsPlaying(false);
          setActivePlayMode(null);
          return;
        }

        if (audioRef.current.currentTime >= safeTo) {
          audioRef.current.pause();
          setIsPlaying(false);
          setActivePlayMode(null);
          setPlayheadSec(startRef.current);
        } else {
          setPlayheadSec(audioRef.current.currentTime);
          animFrameRef.current = requestAnimationFrame(checkPlayhead);
        }
      };

      animFrameRef.current = requestAnimationFrame(checkPlayhead);
    }).catch(err => {
      console.warn("Audio playback failed:", err);
      setIsPlaying(false);
      setActivePlayMode(null);
    });
  }, [isPlaying, activePlayMode, totalDuration, stopPlayback]);

  // Voice Activity Detection (VAD) Algorithm
  const runVadDetection = useCallback(() => {
    if (!pcmDataRef.current || !totalDuration) {
      setVadFeedback("Audio data still loading...");
      setTimeout(() => setVadFeedback(null), 3000);
      return;
    }

    setIsVadRunning(true);
    stopPlayback();

    try {
      const channelData = pcmDataRef.current;
      const sampleRate = sampleRateRef.current || 44100;
      const totalDur = totalDuration;

      // 25ms frame window
      const frameDurationSec = 0.025;
      const frameSize = Math.max(1, Math.floor(sampleRate * frameDurationSec));
      const numFrames = Math.floor(channelData.length / frameSize);

      if (numFrames < 10) {
        setVadFeedback("Audio too short for VAD detection.");
        setIsVadRunning(false);
        setTimeout(() => setVadFeedback(null), 3000);
        return;
      }

      // Compute frame RMS
      const frameRms = new Float32Array(numFrames);
      for (let f = 0; f < numFrames; f++) {
        let sum = 0;
        const start = f * frameSize;
        const end = Math.min(start + frameSize, channelData.length);
        const count = end - start;
        for (let j = start; j < end; j++) {
          const sample = channelData[j];
          sum += sample * sample;
        }
        frameRms[f] = count > 0 ? Math.sqrt(sum / count) : 0;
      }

      // Extract statistical percentiles
      const sortedRms = Array.from(frameRms).sort((a, b) => a - b);
      const noiseFloor = sortedRms[Math.floor(sortedRms.length * 0.15)] || 0.001;
      const peakSpeech = sortedRms[Math.floor(sortedRms.length * 0.95)] || 0.05;

      if (peakSpeech < 0.004) {
        setVadFeedback("No voice activity detected (audio appears silent).");
        setIsVadRunning(false);
        setTimeout(() => setVadFeedback(null), 3500);
        return;
      }

      // Dynamic adaptive threshold
      const energyThreshold = Math.max(0.007, noiseFloor * 2.2, peakSpeech * 0.08);

      // Forward scan for speech start (2 of 3 consecutive frames to ignore single-sample pops)
      let startFrame = -1;
      for (let f = 0; f < numFrames - 2; f++) {
        const c1 = frameRms[f] >= energyThreshold;
        const c2 = frameRms[f + 1] >= energyThreshold;
        const c3 = frameRms[f + 2] >= energyThreshold;
        if ((c1 && c2) || (c1 && c3) || (c2 && c3)) {
          startFrame = f;
          break;
        }
      }

      // Backward scan for speech end
      let endFrame = -1;
      for (let f = numFrames - 1; f >= 2; f--) {
        const c1 = frameRms[f] >= energyThreshold;
        const c2 = frameRms[f - 1] >= energyThreshold;
        const c3 = frameRms[f - 2] >= energyThreshold;
        if ((c1 && c2) || (c1 && c3) || (c2 && c3)) {
          endFrame = f;
          break;
        }
      }

      if (startFrame === -1 || endFrame === -1 || endFrame <= startFrame) {
        setVadFeedback("Speech could not be separated from noise floor.");
        setIsVadRunning(false);
        setTimeout(() => setVadFeedback(null), 3500);
        return;
      }

      // Apply lead-in (150ms) and trail-out (180ms) padding
      const leadInPadSec = 0.15;
      const trailOutPadSec = 0.18;

      let detectedStart = Math.max(0, (startFrame * frameDurationSec) - leadInPadSec);
      let detectedEnd = Math.min(totalDur, ((endFrame + 1) * frameDurationSec) + trailOutPadSec);

      if (detectedEnd - detectedStart < 0.25) {
        detectedEnd = Math.min(totalDur, detectedStart + 0.5);
      }

      detectedStart = parseFloat(detectedStart.toFixed(2));
      detectedEnd = parseFloat(detectedEnd.toFixed(2));

      // Trigger trim change callback to snap pointers and update inputs
      onTrimChange(detectedStart, detectedEnd);

      const trimmedSec = (totalDur - (detectedEnd - detectedStart)).toFixed(2);
      setVadFeedback(`VAD Snapped: ${detectedStart}s – ${detectedEnd}s (Trimmed ${trimmedSec}s silence)`);
      setTimeout(() => setVadFeedback(null), 4500);
    } catch (err) {
      console.error("VAD error:", err);
      setVadFeedback("VAD error: " + (err?.message || "Check console"));
      setTimeout(() => setVadFeedback(null), 3500);
    } finally {
      setIsVadRunning(false);
    }
  }, [totalDuration, onTrimChange, stopPlayback]);

  const dur = Math.max(0.1, Number(totalDuration) || 1);
  const startPercent = Math.min(100, Math.max(0, (startTrimSec / dur) * 100));
  const endPercent = Math.min(100, Math.max(0, (endTrimSec / dur) * 100));

  return (
    <div className="w-full space-y-3.5">
      {blobUrl && (
        <audio ref={audioRef} src={blobUrl} onEnded={stopPlayback} className="hidden" />
      )}

      {/* Visual Canvas Waveform Container with Overlay Knob Handles */}
      <div 
        ref={containerRef}
        className="relative w-full h-36 bg-neutral-950 rounded-2xl border border-neutral-800/90 p-2 overflow-hidden select-none shadow-[inset_0_2px_12px_rgba(0,0,0,0.8)]"
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Dedicated Green Start Knob Handle */}
        {!loadingAudio && (
          <div
            style={{ left: `${startPercent}%` }}
            onMouseDown={(e) => {
              e.stopPropagation();
              stopPlayback();
              setDraggingHandle('start');
              draggingHandleRef.current = 'start';
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              stopPlayback();
              setDraggingHandle('start');
              draggingHandleRef.current = 'start';
            }}
            className="absolute top-0 bottom-0 w-8 -ml-4 flex flex-col items-center justify-between cursor-ew-resize group z-30 touch-none"
            title="Drag Start Trim Handle (Green L)"
          >
            <div className="w-7 h-7 rounded-xl bg-emerald-500 text-white text-[11px] font-black flex items-center justify-center shadow-lg shadow-emerald-500/40 group-hover:scale-115 transition-transform border border-emerald-300">
              L
            </div>
            <div className="w-1 flex-1 bg-emerald-500/90 shadow-md" />
            <div className="w-3 h-3 rounded-full bg-emerald-400 border-2 border-white shadow-sm" />
          </div>
        )}

        {/* Dedicated Red End Knob Handle */}
        {!loadingAudio && (
          <div
            style={{ left: `${endPercent}%` }}
            onMouseDown={(e) => {
              e.stopPropagation();
              stopPlayback();
              setDraggingHandle('end');
              draggingHandleRef.current = 'end';
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              stopPlayback();
              setDraggingHandle('end');
              draggingHandleRef.current = 'end';
            }}
            className="absolute top-0 bottom-0 w-8 -ml-4 flex flex-col items-center justify-between cursor-ew-resize group z-30 touch-none"
            title="Drag End Trim Handle (Red R)"
          >
            <div className="w-7 h-7 rounded-xl bg-rose-500 text-white text-[11px] font-black flex items-center justify-center shadow-lg shadow-rose-500/40 group-hover:scale-115 transition-transform border border-rose-300">
              R
            </div>
            <div className="w-1 flex-1 bg-rose-500/90 shadow-md" />
            <div className="w-3 h-3 rounded-full bg-rose-400 border-2 border-white shadow-sm" />
          </div>
        )}
      </div>

      {/* 3-Button Action Row: Left: 2s Start | Center: VAD | Right: 2s End */}
      <div className="grid grid-cols-3 gap-3">
        {/* Left: 2s Start Audition Button */}
        <button
          type="button"
          onClick={() => playRange(startTrimSec, Math.min(endTrimSec, Number(startTrimSec) + 2.0), 'start2s')}
          disabled={loadingAudio}
          className={`h-12 px-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all border shadow-sm ${
            isPlaying && activePlayMode === 'start2s'
              ? "bg-emerald-500 text-neutral-950 border-emerald-400 font-extrabold shadow-emerald-500/30 scale-102"
              : "bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border-emerald-800/80 hover:border-emerald-600 active:scale-95"
          }`}
          title="Audition opening 2 seconds from start cut point"
        >
          {isPlaying && activePlayMode === 'start2s' ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current" />
          )}
          <span className="truncate">2s Start</span>
        </button>

        {/* Middle: Voice Activity Detection (VAD) Auto-Snap Button */}
        <button
          type="button"
          onClick={runVadDetection}
          disabled={loadingAudio || isVadRunning}
          className="h-12 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-white bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 border border-purple-400/50 transition-all shadow-md shadow-purple-600/25 active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          title="Run Voice Activity Detection to auto-snap markers to speech boundaries"
        >
          {isVadRunning ? (
            <Loader2 className="w-4.5 h-4.5 animate-spin" />
          ) : (
            <Sparkles className="w-4.5 h-4.5 text-amber-300 fill-amber-300" />
          )}
          <span>Voice Activity Detection</span>
        </button>

        {/* Right: 2s End Audition Button */}
        <button
          type="button"
          onClick={() => playRange(Math.max(startTrimSec, Number(endTrimSec) - 2.0), endTrimSec, 'end2s')}
          disabled={loadingAudio}
          className={`h-12 px-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all border shadow-sm ${
            isPlaying && activePlayMode === 'end2s'
              ? "bg-rose-500 text-neutral-950 border-rose-400 font-extrabold shadow-rose-500/30 scale-102"
              : "bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border-rose-800/80 hover:border-rose-600 active:scale-95"
          }`}
          title="Audition closing 2 seconds up to end cut point"
        >
          {isPlaying && activePlayMode === 'end2s' ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current" />
          )}
          <span className="truncate">2s End</span>
        </button>
      </div>

      {/* VAD Feedback Toast / Notification */}
      {vadFeedback && (
        <div className="text-[11px] text-center text-purple-200 bg-purple-950/80 border border-purple-700/60 py-1.5 px-3 rounded-xl animate-fade-in font-mono flex items-center justify-center gap-1.5 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span>{vadFeedback}</span>
        </div>
      )}

      {/* Clean Audio Status & Full Preview Bar */}
      <div className="flex items-center justify-between bg-neutral-950/80 border border-neutral-800 rounded-xl px-3.5 py-2 text-xs font-mono">
        {/* Start Badge */}
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-sm shadow-emerald-500/50" />
          <span className="text-neutral-400 font-sans font-semibold text-xs">Start (L)</span>
          <span className="font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-md border border-emerald-800 shadow-sm">
            {Number(startTrimSec).toFixed(2)}s
          </span>
        </div>

        {/* Center: Full Preview Button */}
        <button
          type="button"
          onClick={() => playRange(startTrimSec, endTrimSec, 'full')}
          disabled={loadingAudio}
          className={`px-4 py-1.5 rounded-lg font-sans font-bold text-xs transition-all flex items-center gap-1.5 border shadow-sm ${
            isPlaying && activePlayMode === 'full'
              ? "bg-purple-600 text-white border-purple-400 shadow-purple-600/30"
              : "bg-neutral-800/90 hover:bg-neutral-750 text-neutral-200 border-neutral-700 active:scale-95"
          }`}
          title="Play entire trimmed selection"
        >
          {isPlaying && activePlayMode === 'full' ? (
            <Pause className="w-3.5 h-3.5 fill-current" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
          <span>{isPlaying && activePlayMode === 'full' ? "Pause Preview" : "Play Selection"}</span>
        </button>

        {/* End Badge */}
        <div className="flex items-center gap-2">
          <span className="text-neutral-400 font-sans font-semibold text-xs">End (R)</span>
          <span className="font-bold text-rose-400 bg-rose-950/80 px-2 py-0.5 rounded-md border border-rose-800 shadow-sm">
            {Number(endTrimSec).toFixed(2)}s
          </span>
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shadow-sm shadow-rose-500/50" />
        </div>
      </div>
    </div>
  );
}
