import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';

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
  const [playheadSec, setPlayheadSec] = useState(startTrimSec || 0);
  const audioRef = useRef(null);
  const animFrameRef = useRef(null);

  const startRef = useRef(startTrimSec);
  const endRef = useRef(endTrimSec);
  const draggingHandleRef = useRef(null);

  useEffect(() => {
    startRef.current = startTrimSec;
    endRef.current = endTrimSec;
  }, [startTrimSec, endTrimSec]);

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (blobUrl) {
        try { URL.revokeObjectURL(blobUrl); } catch (e) {}
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
              const fetchedDur = decodedBuffer.duration || duration || 1;
              setTotalDuration(fetchedDur);

              // If endTrimSec was not explicitly initialized or set higher than duration, sync it
              if (!endRef.current || endRef.current <= 0 || endRef.current > fetchedDur) {
                onTrimChange(startRef.current, parseFloat(fetchedDur.toFixed(2)));
              }

              const channelData = decodedBuffer.getChannelData(0);
              const numBars = 150;
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

      const width = canvas.width || 400;
      const height = canvas.height || 120;

      ctx.clearRect(0, 0, width, height);

      if (loadingAudio) {
        ctx.fillStyle = "#737373";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Loading Visual Audio Waveform...", width / 2, height / 2 + 4);
        return;
      }

      const dur = Math.max(0.1, Number(totalDuration) || 1);
      const safeStart = Math.max(0, isNaN(startTrimSec) ? 0 : Number(startTrimSec));
      const safeEnd = Math.max(safeStart + 0.1, isNaN(endTrimSec) ? dur : Number(endTrimSec));
      const safePlay = isNaN(playheadSec) ? safeStart : Number(playheadSec);

      const startX = Math.min(width, Math.max(0, (safeStart / dur) * width));
      const endX = Math.min(width, Math.max(startX + 1, (safeEnd / dur) * width));
      const playX = Math.min(width, Math.max(0, (safePlay / dur) * width));

      // Draw background waveform bars
      const numBars = (pcmPeaks && pcmPeaks.length) ? pcmPeaks.length : 100;
      const barGap = 1.5;
      const barWidth = Math.max(1, (width - numBars * barGap) / numBars);

      for (let i = 0; i < numBars; i++) {
        const x = i * (barWidth + barGap);
        const val = (pcmPeaks && pcmPeaks[i] !== undefined) ? pcmPeaks[i] : 0.1;
        const barHeight = Math.max(4, val * (height - 28));
        const y = (height - barHeight) / 2;

        if (x >= startX && x <= endX) {
          ctx.fillStyle = "#a855f7"; // Purple-500 for active speech region
        } else {
          ctx.fillStyle = "#334155"; // Slate-700 dimmed for trimmed silence
        }

        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, barHeight, 2);
        } else {
          ctx.rect(x, y, barWidth, barHeight);
        }
        ctx.fill();
      }

      // Draw dark overlay mask outside trim boundaries
      ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
      if (startX > 0) {
        ctx.fillRect(0, 0, startX, height);
      }
      if (endX < width) {
        ctx.fillRect(endX, 0, width - endX, height);
      }

      // Draw Playhead line if playing
      if (isPlaying && playX >= startX && playX <= endX) {
        ctx.strokeStyle = "#fbbf24"; // Amber playhead
        ctx.lineWidth = 2;
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
        canvasRef.current.width = containerRef.current.clientWidth || 400;
        canvasRef.current.height = 120;
        drawWaveform();
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [drawWaveform]);

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

  const togglePlay = () => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    } else {
      audio.currentTime = startTrimSec;
      audio.play();
      setIsPlaying(true);

      const updatePlayhead = () => {
        if (audio.currentTime >= endTrimSec) {
          audio.pause();
          setIsPlaying(false);
          setPlayheadSec(startTrimSec);
        } else {
          setPlayheadSec(audio.currentTime);
          animFrameRef.current = requestAnimationFrame(updatePlayhead);
        }
      };
      animFrameRef.current = requestAnimationFrame(updatePlayhead);
    }
  };

  const dur = Math.max(0.1, Number(totalDuration) || 1);
  const startPercent = Math.min(100, Math.max(0, (startTrimSec / dur) * 100));
  const endPercent = Math.min(100, Math.max(0, (endTrimSec / dur) * 100));

  return (
    <div className="w-full space-y-4">
      {blobUrl && (
        <audio ref={audioRef} src={blobUrl} onEnded={() => setIsPlaying(false)} className="hidden" />
      )}

      {/* Visual Canvas Waveform Container with Overlay Knob Handles */}
      <div 
        ref={containerRef}
        className="relative w-full h-32 bg-neutral-950 rounded-xl border border-neutral-800 p-2 overflow-hidden select-none shadow-inner"
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Dedicated Green Start Knob Handle */}
        {!loadingAudio && (
          <div
            style={{ left: `${startPercent}%` }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setDraggingHandle('start');
              draggingHandleRef.current = 'start';
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              setDraggingHandle('start');
              draggingHandleRef.current = 'start';
            }}
            className="absolute top-0 bottom-0 w-8 -ml-4 flex flex-col items-center justify-between cursor-ew-resize group z-30 touch-none"
            title="Drag Start Trim Handle (Green L)"
          >
            <div className="w-7 h-7 rounded-lg bg-emerald-500 text-white text-[11px] font-black flex items-center justify-center shadow-lg group-hover:scale-115 transition-transform border border-emerald-300">
              L
            </div>
            <div className="w-1 flex-1 bg-emerald-500 shadow-md" />
            <div className="w-3 h-3 rounded-full bg-emerald-400 border-2 border-white shadow" />
          </div>
        )}

        {/* Dedicated Red End Knob Handle */}
        {!loadingAudio && (
          <div
            style={{ left: `${endPercent}%` }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setDraggingHandle('end');
              draggingHandleRef.current = 'end';
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              setDraggingHandle('end');
              draggingHandleRef.current = 'end';
            }}
            className="absolute top-0 bottom-0 w-8 -ml-4 flex flex-col items-center justify-between cursor-ew-resize group z-30 touch-none"
            title="Drag End Trim Handle (Red R)"
          >
            <div className="w-7 h-7 rounded-lg bg-rose-500 text-white text-[11px] font-black flex items-center justify-center shadow-lg group-hover:scale-115 transition-transform border border-rose-300">
              R
            </div>
            <div className="w-1 flex-1 bg-rose-500 shadow-md" />
            <div className="w-3 h-3 rounded-full bg-rose-400 border-2 border-white shadow" />
          </div>
        )}
      </div>

      {/* Controls & Time Badges */}
      <div className="flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
          <span className="text-neutral-400">Start (L):</span>
          <span className="font-bold text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded border border-emerald-800 shadow-sm">
            {Number(startTrimSec).toFixed(2)}s
          </span>
        </div>

        <button
          type="button"
          onClick={togglePlay}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-all flex items-center gap-2 shadow-md shadow-purple-600/20 active:scale-95"
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          {isPlaying ? "Pause Preview" : "▶ Preview Selection"}
        </button>

        <div className="flex items-center gap-2">
          <span className="text-neutral-400">End (R):</span>
          <span className="font-bold text-rose-400 bg-rose-950/80 px-2.5 py-1 rounded border border-rose-800 shadow-sm">
            {Number(endTrimSec).toFixed(2)}s
          </span>
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block animate-pulse" />
        </div>
      </div>
    </div>
  );
}
