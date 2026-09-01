import React, { useState, useEffect, useRef, useMemo } from "react";
import { Maximize2, X, Settings2, Sparkles, Sliders, Bot, ShieldAlert, ShieldCheck, Eye, EyeOff, AlertTriangle, CheckCircle2, Zap, Columns, Layers, Activity } from "lucide-react";
import { apiPostJson } from "../lib/api";

// Exact Audacity "Color (Roseus)" Colormap Multi-Stop Palette
const ROSEUS_STOPS = [
    { t: 0.00, r: 16,  g: 16,  b: 44 },   // Dark navy / deep indigo silence
    { t: 0.18, r: 46,  g: 18,  b: 86 },   // Midnight violet
    { t: 0.35, r: 95,  g: 20,  b: 125 },  // Royal vibrant purple
    { t: 0.50, r: 160, g: 24,  b: 115 },  // Vivid magenta
    { t: 0.62, r: 205, g: 45,  b: 75 },   // Hot ruby / red-orange
    { t: 0.74, r: 240, g: 105, b: 25 },   // Fiery bright orange
    { t: 0.86, r: 255, g: 185, b: 35 },   // Golden amber yellow
    { t: 0.95, r: 255, g: 240, b: 110 },  // Brilliant canary yellow
    { t: 1.00, r: 255, g: 255, b: 225 }   // Warm white core
];

function getAudacityRoseusColor(normVal) {
    const v = Math.max(0, Math.min(1, normVal));
    
    for (let i = 0; i < ROSEUS_STOPS.length - 1; i++) {
        const s0 = ROSEUS_STOPS[i];
        const s1 = ROSEUS_STOPS[i + 1];
        if (v >= s0.t && v <= s1.t) {
            const range = s1.t - s0.t;
            const frac = range > 0 ? (v - s0.t) / range : 0;
            const r = Math.round(s0.r + frac * (s1.r - s0.r));
            const g = Math.round(s0.g + frac * (s1.g - s0.g));
            const b = Math.round(s0.b + frac * (s1.b - s0.b));
            return [r, g, b];
        }
    }
    const last = ROSEUS_STOPS[ROSEUS_STOPS.length - 1];
    return [last.r, last.g, last.b];
}

// Exact Cooley-Tukey Radix-2 FFT with exact trigonometry (prevents cumulative multiplier drift)
function fftRadix2(real, imag) {
    const n = real.length;
    let j = 0;
    for (let i = 0; i < n - 1; i++) {
        if (i < j) {
            let tr = real[i]; real[i] = real[j]; real[j] = tr;
            let ti = imag[i]; imag[i] = imag[j]; imag[j] = ti;
        }
        let k = n >> 1;
        while (k <= j) {
            j -= k;
            k >>= 1;
        }
        j += k;
    }

    for (let len = 2; len <= n; len <<= 1) {
        const half = len >> 1;
        const angle = (-2 * Math.PI) / len;

        for (let k = 0; k < half; k++) {
            const theta = angle * k;
            const wr = Math.cos(theta);
            const wi = Math.sin(theta);

            for (let i = k; i < n; i += len) {
                const uR = real[i];
                const uI = imag[i];
                const vR = real[i + half] * wr - imag[i + half] * wi;
                const vI = real[i + half] * wi + imag[i + half] * wr;

                real[i] = uR + vR;
                imag[i] = uI + vI;
                real[i + half] = uR - vR;
                imag[i + half] = uI - vI;
            }
        }
    }
}

// 4-term Blackman-Harris window for maximum dynamic range (>92 dB side-lobe suppression)
function getBlackmanHarrisWindow(size) {
    const w = new Float32Array(size);
    const a0 = 0.35875, a1 = 0.48829, a2 = 0.14128, a3 = 0.01168;
    for (let i = 0; i < size; i++) {
        w[i] = a0 - a1 * Math.cos((2 * Math.PI * i) / (size - 1)) +
                    a2 * Math.cos((4 * Math.PI * i) / (size - 1)) -
                    a3 * Math.cos((6 * Math.PI * i) / (size - 1));
    }
    return w;
}

/**
 * Mathematically translates frequency strings (e.g. "5438 Hz", "164 Hz", "19kHz")
 * into exact percentage coordinates (0% = 24kHz top, 100% = 0Hz bottom)
 */
function getExactFrequencyYPct(freqStr, fallbackYmin, maxFreq = 24000) {
    if (!freqStr) return fallbackYmin / 10;
    const match = freqStr.match(/([\d\.]+)\s*(k?hz)/i);
    if (match) {
        let val = parseFloat(match[1]);
        if (match[2].toLowerCase().startsWith("k")) val *= 1000;
        val = Math.max(0, Math.min(maxFreq, val));
        return (1 - (val / maxFreq)) * 100;
    }
    return fallbackYmin / 10;
}

function getSeverityBadgeStyle(sev) {
    const s = (sev || "High").toLowerCase();
    if (s.includes("crit")) return "bg-red-600 text-white border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.7)]";
    if (s.includes("high")) return "bg-orange-600 text-white border-orange-400 shadow-[0_0_8px_rgba(249,115,22,0.6)]";
    if (s.includes("med"))  return "bg-amber-600 text-neutral-900 font-black border-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]";
    return "bg-emerald-600 text-white border-emerald-400";
}

export default function SpectrogramViewer({ 
    audioUrl, 
    audioBuffer = null, 
    title = "Mel Spectrogram", 
    scaleType = "linear", // "linear" | "mel"
    maxFreq = 24000,
    gainDb: initialGain = 20,
    rangeDb: initialRange = 120,
    height = 200,
    phraseId = null,
    initialAiAudit = null,
    autoRunAudit = false,
    allowReAudit = false,
    onAuditCompleted = null
}) {
    const [loading, setLoading] = useState(false);
    const [scale, setScale] = useState(scaleType); // "linear" | "mel"
    const [gain, setGain] = useState(initialGain); // Audacity default: +20 dB
    const [range, setRange] = useState(initialRange); // Audacity default: 120 dB
    const [showSettings, setShowSettings] = useState(false);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [renderedDataUrl, setRenderedDataUrl] = useState(null);
    const [duration, setDuration] = useState(0);

    // AI Noise Audit & Box Visibility Controls
    const [aiAudit, setAiAudit] = useState(initialAiAudit);
    const [auditing, setAuditing] = useState(false);
    const [showComparisonCopy, setShowComparisonCopy] = useState(true);
    const [showDefectBoxes, setShowDefectBoxes] = useState(true);
    const [hiddenBoxIds, setHiddenBoxIds] = useState(new Set());
    const [activeBoxHover, setActiveBoxHover] = useState(null);
    const [auditError, setAuditError] = useState(null);

    useEffect(() => {
        setAiAudit(initialAiAudit || null);
        if (!initialAiAudit) {
            setAuditError(null);
            setHiddenBoxIds(new Set());
        }
    }, [initialAiAudit, audioUrl, audioBuffer]);

    const toggleBoxVisibility = (boxId) => {
        setHiddenBoxIds(prev => {
            const next = new Set(prev);
            if (next.has(boxId)) {
                next.delete(boxId);
            } else {
                next.add(boxId);
            }
            return next;
        });
    };

    const computeAndRenderSpectrogram = async () => {
        setLoading(true);
        try {
            let buffer = audioBuffer;

            if (!buffer && audioUrl) {
                const token = (() => {
                    const cookies = document.cookie.split(";").map((c) => c.trim());
                    const vcCookie = cookies.find((c) => c.startsWith("vc_token="));
                    if (vcCookie) return vcCookie.split("=")[1];
                    return localStorage.getItem("vc_token");
                })();

                const res = await fetch(audioUrl, {
                    credentials: "include",
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const arrayBuffer = await res.arrayBuffer();

                const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
                const ctx = new AudioCtxClass();
                buffer = await ctx.decodeAudioData(arrayBuffer);
                try { ctx.close(); } catch {}
            }

            if (!buffer) return;

            const sr = buffer.sampleRate;
            const totalSamples = buffer.length;
            const channelData = buffer.getChannelData(0);
            const dur = buffer.duration;
            setDuration(dur);

            // Audacity spec: Window size 2048/4096 with Blackman-Harris window
            const fftSize = 2048;
            const hopSize = Math.max(64, Math.floor(totalSamples / 1600));
            const numFrames = Math.floor((totalSamples - fftSize) / hopSize);
            if (numFrames <= 0) return;

            const windowFunc = getBlackmanHarrisWindow(fftSize);
            let winSum = 0;
            for (let i = 0; i < fftSize; i++) winSum += windowFunc[i];
            const winNorm = winSum > 0 ? winSum / 2 : fftSize / 2;

            const numBins = fftSize / 2;
            const nyquist = sr / 2;
            const targetMaxFreq = Math.min(nyquist, maxFreq);

            // High-resolution Canvas Buffer
            const width = Math.min(1600, Math.max(800, numFrames));
            const plotHeight = 360;
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = plotHeight;
            const ctx = canvas.getContext("2d");

            const imgData = ctx.createImageData(width, plotHeight);
            const data = imgData.data;

            const real = new Float32Array(fftSize);
            const imag = new Float32Array(fftSize);

            // Pre-calculate frame FFT magnitudes
            for (let x = 0; x < width; x++) {
                const frameIdx = Math.floor((x / width) * numFrames);
                const sampleStart = frameIdx * hopSize;

                for (let i = 0; i < fftSize; i++) {
                    const sample = sampleStart + i < totalSamples ? channelData[sampleStart + i] : 0;
                    real[i] = sample * windowFunc[i];
                    imag[i] = 0;
                }

                fftRadix2(real, imag);

                // Pre-calculate linear magnitudes for this time slice
                const frameMags = new Float32Array(numBins);
                for (let b = 0; b < numBins; b++) {
                    frameMags[b] = Math.sqrt(real[b] * real[b] + imag[b] * imag[b]) / winNorm;
                }

                for (let y = 0; y < plotHeight; y++) {
                    // Vertical frequency mapping: y = 0 is 24k (top), y = plotHeight - 1 is 0k (bottom)
                    const normY1 = 1 - (y / plotHeight);
                    const normY0 = 1 - ((y + 1) / plotHeight);

                    let fLow, fHigh;
                    if (scale === "mel") {
                        const melMax = 2595 * Math.log10(1 + targetMaxFreq / 700);
                        fLow = 700 * (Math.pow(10, (normY0 * melMax) / 2595) - 1);
                        fHigh = 700 * (Math.pow(10, (normY1 * melMax) / 2595) - 1);
                    } else {
                        fLow = normY0 * targetMaxFreq;
                        fHigh = normY1 * targetMaxFreq;
                    }

                    const binStart = Math.max(0, Math.min(numBins - 1, Math.floor((fLow / nyquist) * numBins)));
                    const binEnd = Math.max(binStart, Math.min(numBins - 1, Math.ceil((fHigh / nyquist) * numBins)));

                    // Peak power pooling across all bins in this pixel frequency slice (matches Audacity rendering)
                    let maxMag = 0;
                    for (let b = binStart; b <= binEnd; b++) {
                        if (frameMags[b] > maxMag) maxMag = frameMags[b];
                    }

                    const rawDb = 20 * Math.log10(Math.max(1e-9, maxMag));
                    const effectiveDb = rawDb + gain;
                    const normAmp = Math.max(0, Math.min(1, (effectiveDb + range) / range));

                    const [r, g, b] = getAudacityRoseusColor(normAmp);
                    const pixelIdx = (y * width + x) * 4;
                    data[pixelIdx] = r;
                    data[pixelIdx + 1] = g;
                    data[pixelIdx + 2] = b;
                    data[pixelIdx + 3] = 255;
                }
            }

            ctx.putImageData(imgData, 0, 0);
            const dataUrl = canvas.toDataURL("image/png");
            setRenderedDataUrl(dataUrl);

        } catch (err) {
            console.error("Spectrogram computation error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        computeAndRenderSpectrogram();
    }, [audioUrl, audioBuffer, scale, maxFreq, gain, range]);

    // Auto-run AI Noise Audit if autoRunAudit prop is true
    useEffect(() => {
        if (autoRunAudit && renderedDataUrl && !aiAudit && !auditing && !auditError) {
            handleRunAiAudit();
        }
    }, [autoRunAudit, renderedDataUrl, aiAudit, auditing, auditError]);

    // Handle Groq AI Zero-Tolerance Noise Audit
    const handleRunAiAudit = async () => {
        if (!renderedDataUrl) return;
        setAuditing(true);
        setAuditError(null);
        try {
            let audioBase64 = null;
            if (audioUrl) {
                try {
                    const token = (() => {
                        const cookies = document.cookie.split(";").map((c) => c.trim());
                        const vcCookie = cookies.find((c) => c.startsWith("vc_token="));
                        if (vcCookie) return vcCookie.split("=")[1];
                        return localStorage.getItem("vc_token");
                    })();
                    const aRes = await fetch(audioUrl, {
                        credentials: "include",
                        headers: token ? { Authorization: `Bearer ${token}` } : {}
                    });
                    if (aRes.ok) {
                        const aBuf = await aRes.arrayBuffer();
                        const bytes = new Uint8Array(aBuf);
                        let binary = "";
                        const chunkSize = 8192;
                        for (let i = 0; i < bytes.length; i += chunkSize) {
                            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
                        }
                        audioBase64 = btoa(binary);
                    }
                } catch (e) {
                    console.warn("Failed to serialize audio buffer for DSP telemetry:", e);
                }
            }

            const res = await apiPostJson("/api/phrases/qa/analyze-spectrogram-noise", {
                phraseId: phraseId || null,
                imageBase64: renderedDataUrl,
                audioBase64: audioBase64
            });

            if (res.success && res.audit) {
                setAiAudit(res.audit);
                setShowDefectBoxes(true);
                setShowComparisonCopy(true);
                setHiddenBoxIds(new Set());
                if (onAuditCompleted) {
                    onAuditCompleted(res.audit);
                }
            } else {
                throw new Error(res.error || "Failed to complete AI Spectrogram analysis");
            }
        } catch (err) {
            console.error("AI Spectrogram Audit Error:", err);
            setAuditError(err.message || "AI Audit failed. Check backend/Groq connection.");
        } finally {
            setAuditing(false);
        }
    };

    // Frequency Rulers at 24k, 20k, 15k, 10k, 5k, 0k (matching Audacity)
    const frequencyTicks = [
        { label: "24k", ratio: 1.0 },
        { label: "20k", ratio: 20000 / maxFreq },
        { label: "15k", ratio: 15000 / maxFreq },
        { label: "10k", ratio: 10000 / maxFreq },
        { label: "5k",  ratio: 5000 / maxFreq },
        { label: "0k",  ratio: 0.0 }
    ];

    // Client-side Sanitization & Non-Maximum Suppression (NMS) to eliminate duplicate/overlapping boxes
    const sanitizedDefectBoxes = useMemo(() => {
        if (!aiAudit?.defectBoxes || !Array.isArray(aiAudit.defectBoxes) || aiAudit.defectBoxes.length === 0) return [];

        const lines = [];
        const hiss = [];

        aiAudit.defectBoxes.forEach((b, idx) => {
            if (!b.box_2d || !Array.isArray(b.box_2d) || b.box_2d.length < 4) return;
            const [ymin, xmin, ymax, xmax] = b.box_2d.map(v => Number(v) || 0);
            const label = (b.label || "").toUpperCase();
            const freq = (b.frequencyBand || "").toLowerCase();
            const desc = (b.issueDescription || "").toLowerCase();

            const isHiss = label.includes("HISS") || label.includes("FLOOR") || freq.includes("0khz") || freq.includes("4khz") || desc.includes("hiss");
            const isTone = !isHiss && (label.includes("TONE") || label.includes("LINE") || label.includes("WHISTLE") || label.includes("NOTCH") || freq.includes("hz"));

            if (isTone) {
                lines.push({ ...b, id: b.id || `line-${idx + 1}` });
            } else {
                hiss.push({ ...b, id: b.id || `hiss-${idx + 1}`, _xmin: Math.min(xmin, xmax), _xmax: Math.max(xmin, xmax) });
            }
        });

        // 1. Deduplicate tone lines within 22 units (~500Hz)
        const filteredLines = [];
        lines.forEach(l => {
            const [ymin, , ymax] = l.box_2d;
            const midY = (ymin + ymax) / 2;
            const existingIdx = filteredLines.findIndex(fl => {
                const [fymin, , fymax] = fl.box_2d;
                return Math.abs(midY - (fymin + fymax) / 2) < 22;
            });
            if (existingIdx === -1) {
                filteredLines.push(l);
            } else {
                const rank = { "Critical": 4, "High": 3, "Medium": 2, "Low": 1 };
                if ((rank[l.severity] || 0) > (rank[filteredLines[existingIdx].severity] || 0)) {
                    filteredLines[existingIdx] = l;
                }
            }
        });

        // 2. Deduplicate and merge overlapping or adjacent silence hiss boxes
        hiss.sort((a, b) => a._xmin - b._xmin);
        const filteredHiss = [];
        hiss.forEach(h => {
            const overlapIdx = filteredHiss.findIndex(fh => {
                const overlap = Math.max(0, Math.min(h._xmax, fh._xmax) - Math.max(h._xmin, fh._xmin));
                const minLen = Math.min(h._xmax - h._xmin, fh._xmax - fh._xmin);
                const isAdjacent = (h._xmin <= fh._xmax + 25) && (fh._xmin <= h._xmax + 25);
                return (minLen > 0 && overlap / minLen > 0.10) || isAdjacent;
            });

            if (overlapIdx >= 0) {
                const existing = filteredHiss[overlapIdx];
                const rank = { "Critical": 4, "High": 3, "Medium": 2, "Low": 1 };
                const bestSev = (rank[h.severity] || 0) > (rank[existing.severity] || 0) ? h.severity : existing.severity;
                const newXmin = Math.min(existing._xmin, h._xmin);
                const newXmax = Math.max(existing._xmax, h._xmax);

                filteredHiss[overlapIdx] = {
                    ...existing,
                    _xmin: newXmin,
                    _xmax: newXmax,
                    severity: bestSev,
                    box_2d: [833, newXmin, 990, newXmax]
                };
            } else {
                filteredHiss.push({
                    ...h,
                    box_2d: [833, h._xmin, 990, h._xmax]
                });
            }
        });

        return [...filteredLines, ...filteredHiss];
    }, [aiAudit?.defectBoxes]);

    // Render Exact Mathematical Precision Defect Annotations with Non-Overlapping Severity Badges
    const renderBoundingBoxes = (isModal = false) => {
        if (!sanitizedDefectBoxes || !showDefectBoxes || sanitizedDefectBoxes.length === 0) return null;

        return (
            <div className="absolute inset-0 pointer-events-none z-10">
                {sanitizedDefectBoxes.map((box, idx) => {
                    if (!box.box_2d || box.box_2d.length < 4) return null;
                    if (hiddenBoxIds.has(box.id || idx + 1)) return null;

                    const [ymin, xmin, ymax, xmax] = box.box_2d;
                    const isHovered = activeBoxHover === box.id;
                    const label = (box.label || "").toUpperCase();
                    const freq = (box.frequencyBand || "").toLowerCase();
                    const isToneLine = !label.includes("HISS") && !freq.includes("0khz") && (label.includes("TONE") || label.includes("LINE") || label.includes("WHISTLE") || label.includes("NOTCH") || freq.includes("hz"));
                    const isHum = label.includes("HUM");
                    const sev = box.severity || "High";

                    // Calculate clean, non-overlapping Y percentages
                    let exactTopPct;
                    let heightPct;

                    if (isToneLine) {
                        exactTopPct = box.frequencyBand 
                            ? getExactFrequencyYPct(box.frequencyBand, ymin, maxFreq) 
                            : (ymin / 10);
                        exactTopPct = Math.max(1, Math.min(80, exactTopPct));
                        heightPct = isModal ? 2.0 : 2.5;
                    } else if (isHum) {
                        exactTopPct = 95.0;
                        heightPct = 4.5;
                    } else {
                        // Strict 0kHz - 4kHz hiss box (stays strictly below 4kHz = 83.3%)
                        exactTopPct = (1 - (4000 / maxFreq)) * 100; // 83.33%
                        heightPct = (4000 / maxFreq) * 100 - 1.5;   // 15.1%
                    }

                    const leftPct = Math.max(0, Math.min(97, xmin / 10));
                    const widthPct = Math.max(2.5, Math.min(100 - leftPct, (xmax - xmin) / 10));

                    return (
                        <div
                            key={box.id || idx}
                            className={`absolute pointer-events-auto transition-all ${
                                isToneLine
                                    ? `border-t-2 border-b-2 border-dashed ${isHovered ? "border-amber-300 bg-amber-400/30 shadow-[0_0_20px_rgba(251,191,36,0.9)]" : "border-amber-400/90 bg-amber-400/15 shadow-[0_0_10px_rgba(251,191,36,0.5)]"} z-30`
                                    : isHum
                                    ? `border border-red-500 bg-red-600/25 shadow-[0_0_12px_rgba(239,68,68,0.6)] z-25`
                                    : `border-2 rounded ${isHovered ? "border-red-400 bg-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.8)]" : "border-red-500/80 bg-red-500/15 shadow-[0_0_10px_rgba(239,68,68,0.4)]"} z-20`
                            }`}
                            style={{
                                top: `${exactTopPct}%`,
                                left: `${leftPct}%`,
                                height: `${heightPct}%`,
                                width: `${widthPct}%`,
                            }}
                            onMouseEnter={() => setActiveBoxHover(box.id)}
                            onMouseLeave={() => setActiveBoxHover(null)}
                        >
                            {/* Non-overlapping Badges: Tone Lines top-right, Hiss Boxes top-left inside */}
                            <div className={`absolute select-none pointer-events-none font-mono text-[9px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap flex items-center gap-1.5 z-30 ${
                                isToneLine
                                    ? "right-2 -top-3.5 bg-neutral-950/95 text-amber-200 border border-amber-500/70 shadow-lg"
                                    : "left-1.5 top-1 bg-neutral-950/90 text-red-200 border border-red-500/70 shadow-md"
                            }`}>
                                {/* Severity Pill */}
                                <span className={`px-1 py-0.2 rounded text-[8px] uppercase tracking-wider font-black ${getSeverityBadgeStyle(sev)}`}>
                                    {sev}
                                </span>
                                <span>{box.frequencyBand || box.label}</span>
                                {box.measuredDb && (
                                    <span className="text-amber-300 font-normal">({box.measuredDb})</span>
                                )}
                            </div>

                            {/* Detailed Hover Tooltip */}
                            {isHovered && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2.5 bg-[#0e1017] border border-red-500/70 rounded-lg shadow-2xl text-[11px] text-white z-50 backdrop-blur-md pointer-events-none">
                                    <div className="flex items-center justify-between font-bold text-red-400 mb-1">
                                        <div className="flex items-center gap-1.5">
                                            <AlertTriangle className="w-3.5 h-3.5" />
                                            <span>{box.label}</span>
                                        </div>
                                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${getSeverityBadgeStyle(sev)}`}>
                                            {sev}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-neutral-200 mb-1 leading-snug">
                                        {box.issueDescription}
                                    </div>
                                    <div className="flex items-center justify-between text-[9px] font-mono text-neutral-400 border-t border-neutral-800 pt-1 mt-1">
                                        <span>Freq: <b className="text-amber-300">{box.frequencyBand || "N/A"}</b></span>
                                        <span>Level: <b className="text-amber-300">{box.measuredDb || "N/A"}</b></span>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="w-full bg-[#181a24] border border-[#2d3248] rounded-xl p-3 shadow-2xl text-neutral-200">
            {/* Header Control Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 mb-2.5 pb-2 border-b border-[#2d3248]">
                <div className="flex items-center flex-wrap gap-2">
                    <span className="text-xs font-bold text-violet-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                        {title}
                    </span>
                    <span className="text-[10px] text-amber-300 font-mono bg-[#0f111a] px-2 py-0.5 rounded border border-[#2d3248]">
                        Linear • {gain >= 0 ? `+${gain}` : gain}dB • {range}dB
                    </span>
                    {duration > 0 && (
                        <span className="text-[10px] text-neutral-400 font-mono bg-[#0f111a] px-2 py-0.5 rounded border border-[#2d3248]">
                            {duration.toFixed(2)}s
                        </span>
                    )}
                </div>

                <div className="flex items-center flex-wrap gap-2">
                    {/* AI Audit Status Indicator Pill */}
                    {aiAudit && (
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 border shadow-sm ${
                            aiAudit.verdict === "PASS"
                                ? "bg-emerald-950/90 text-emerald-300 border-emerald-500/60 shadow-emerald-950/40"
                                : "bg-rose-950/90 text-rose-300 border-rose-500/70 animate-pulse shadow-rose-950/40"
                        }`}>
                            {aiAudit.verdict === "PASS" ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> : <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />}
                            <span>AI Verdict: <b>{aiAudit.verdict}</b> {aiAudit.defectBoxes?.length > 0 ? `(${aiAudit.defectBoxes.length} Issues)` : "(0 Issues)"}</span>
                        </span>
                    )}

                    {/* Admin Re-Audit AI Trigger Button */}
                    {allowReAudit && (
                        <button
                            type="button"
                            onClick={handleRunAiAudit}
                            disabled={auditing || loading || !renderedDataUrl}
                            className="px-2.5 py-1 rounded-lg border border-violet-500/50 bg-violet-950/80 hover:bg-violet-900 text-violet-200 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                            title="Re-run AI Noise & Defect Audit (Admin only)"
                        >
                            <Sparkles className={`w-3.5 h-3.5 text-violet-400 ${auditing ? "animate-spin" : ""}`} />
                            <span>{auditing ? "Auditing..." : "Re-Audit AI"}</span>
                        </button>
                    )}

                    {/* Master Red Boxes Toggle Button */}
                    {aiAudit?.defectBoxes?.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setShowDefectBoxes(!showDefectBoxes)}
                            className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer ${
                                showDefectBoxes 
                                    ? "bg-rose-600 hover:bg-rose-500 text-white border-rose-400 shadow-rose-600/30" 
                                    : "bg-[#0f111a] border-neutral-700 text-neutral-400 hover:text-neutral-200"
                            }`}
                            title="Hide or Show All Red AI Highlight Boxes & Laser Lines"
                        >
                            {showDefectBoxes ? <Eye className="w-3.5 h-3.5 text-white" /> : <EyeOff className="w-3.5 h-3.5 text-neutral-400" />}
                            <span>{showDefectBoxes ? "Red Boxes: ON" : "Red Boxes: OFF (Hidden)"}</span>
                        </button>
                    )}

                    {renderedDataUrl && (
                        <button
                            type="button"
                            onClick={() => setIsLightboxOpen(true)}
                            className="p-1.5 text-neutral-300 hover:text-white bg-[#0f111a] hover:bg-[#2d3248] rounded-lg transition-all border border-[#2d3248] hover:border-violet-500/60 shadow-sm cursor-pointer"
                            title="Open Fullscreen High-Res Spectrogram"
                        >
                            <Maximize2 className="w-4 h-4 text-violet-300" />
                        </button>
                    )}
                </div>
            </div>

            {/* Error banner if audit failed */}
            {auditError && (
                <div className="mb-2 p-2 bg-red-950/60 border border-red-500/50 rounded-lg text-xs text-red-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{auditError}</span>
                </div>
            )}

            {/* ========================================================================= */}
            {/* VIEW 1: ORIGINAL RAW SPECTROGRAM (Clean & Untouched) */}
            {/* ========================================================================= */}
            <div className="space-y-3">
                <div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-neutral-400 mb-1 px-1">
                        <span className="flex items-center gap-1.5 text-indigo-300">
                            <span className="w-2 h-2 rounded-full bg-indigo-500" />
                            1. ORIGINAL RAW SPECTROGRAM (Clean / Unmodified)
                        </span>
                        <span className="font-mono text-[10px] text-neutral-500">Raw Audio Heatmap</span>
                    </div>

                    <div className="relative flex items-stretch bg-[#101030] rounded-lg overflow-hidden border border-[#2d3248]" style={{ height }}>
                        {/* Frequency Axis */}
                        <div className="w-12 bg-[#202334] border-r border-[#3a3f5c] flex flex-col justify-between py-1.5 px-1.5 text-right select-none shadow-inner z-20">
                            {frequencyTicks.map((tick, idx) => (
                                <div key={idx} className="flex items-center justify-end gap-1.5">
                                    <span className="text-[10px] font-mono font-bold text-neutral-300 leading-none">
                                        {tick.label}
                                    </span>
                                    <span className="w-2 h-[1px] bg-neutral-400 inline-block" />
                                </div>
                            ))}
                        </div>

                        {/* Raw Canvas Image (No Overlay) */}
                        <div className="flex-1 relative bg-[#101030] flex items-center justify-center overflow-hidden">
                            {loading ? (
                                <div className="flex items-center gap-2 text-xs text-violet-300 font-medium">
                                    <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                                    <span>Rendering Audacity Roseus Spectrogram...</span>
                                </div>
                            ) : renderedDataUrl ? (
                                <img 
                                    src={renderedDataUrl} 
                                    alt="Raw Spectrogram" 
                                    className="w-full h-full object-fill cursor-zoom-in hover:brightness-105 transition-all"
                                    onClick={() => setIsLightboxOpen(true)}
                                />
                            ) : (
                                <span className="text-xs text-neutral-500">Audio not loaded</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* ========================================================================= */}
                {/* VIEW 2: AI DEFECT ANNOTATED SPECTROGRAM (DUAL COMPARISON VIEW) */}
                {/* ========================================================================= */}
                {aiAudit && showComparisonCopy && (
                    <div className="pt-2 border-t border-dashed border-[#2d3248] animate-fade-in">
                        <div className="flex items-center justify-between text-[11px] font-bold text-neutral-400 mb-1 px-1">
                            <span className="flex items-center gap-1.5 text-red-300">
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                2. AI STATIC NOISE AUDIT (Defect Highlighting Overlay)
                            </span>
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-[10px] text-amber-400">
                                    {showDefectBoxes ? `${sanitizedDefectBoxes.length - hiddenBoxIds.size} Visible` : "All Hidden"}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setShowDefectBoxes(!showDefectBoxes)}
                                    className="text-[10px] font-bold text-red-300 hover:text-white bg-red-950/60 px-2 py-0.5 rounded border border-red-500/50 flex items-center gap-1"
                                >
                                    {showDefectBoxes ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                    <span>{showDefectBoxes ? "Hide Boxes" : "Show Boxes"}</span>
                                </button>
                            </div>
                        </div>

                        <div className="relative flex items-stretch bg-[#101030] rounded-lg overflow-hidden border border-red-500/40 shadow-inner" style={{ height }}>
                            {/* Frequency Axis */}
                            <div className="w-12 bg-[#202334] border-r border-[#3a3f5c] flex flex-col justify-between py-1.5 px-1.5 text-right select-none shadow-inner z-20">
                                {frequencyTicks.map((tick, idx) => (
                                    <div key={idx} className="flex items-center justify-end gap-1.5">
                                        <span className="text-[10px] font-mono font-bold text-neutral-300 leading-none">
                                            {tick.label}
                                        </span>
                                        <span className="w-2 h-[1px] bg-neutral-400 inline-block" />
                                    </div>
                                ))}
                            </div>

                            {/* Synchronized Spectrogram Image + Mathematical Defect Overlay */}
                            <div className="flex-1 relative bg-[#101030] flex items-center justify-center overflow-hidden">
                                {renderedDataUrl && (
                                    <div className="relative w-full h-full">
                                        <img 
                                            src={renderedDataUrl} 
                                            alt="Annotated Spectrogram" 
                                            className="w-full h-full object-fill cursor-zoom-in hover:brightness-105 transition-all"
                                            onClick={() => setIsLightboxOpen(true)}
                                        />
                                        {/* Overlay Laser Lines & Boxes */}
                                        {renderBoundingBoxes(false)}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Time Axis */}
            <div className="flex justify-between items-center px-12 pt-1 text-[10px] font-mono text-neutral-400 select-none">
                <span>0.00s</span>
                <span>{duration > 0 ? `${(duration / 2).toFixed(2)}s` : "Mid"}</span>
                <span>{duration > 0 ? `${duration.toFixed(2)}s` : "End"}</span>
            </div>

            {/* AI Audit Defect Details Card */}
            {aiAudit && (
                <div className={`mt-3 p-3 rounded-xl border transition-all ${
                    aiAudit.verdict === "PASS"
                        ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200"
                        : "bg-red-950/40 border-red-500/40 text-red-200"
                }`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5 pb-1.5 border-b border-white/10">
                        <div className="flex items-center gap-2">
                            {aiAudit.verdict === "PASS" ? (
                                <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-600 text-white font-bold text-xs rounded-md shadow-sm">
                                    <ShieldCheck className="w-3.5 h-3.5" /> PASSED (Studio Clean)
                                </span>
                            ) : (
                                <span className="flex items-center gap-1 px-2 py-0.5 bg-red-600 text-white font-bold text-xs rounded-md shadow-sm animate-pulse">
                                    <ShieldAlert className="w-3.5 h-3.5" /> REJECTED (Static Noise Detected)
                                </span>
                            )}
                            <span className="text-xs text-neutral-300 font-medium">
                                Overall Severity: <b className={aiAudit.overallSeverity === "Critical" || aiAudit.overallSeverity === "High" ? "text-red-400" : "text-amber-400"}>{aiAudit.overallSeverity || "N/A"}</b>
                            </span>
                        </div>
                    </div>

                    <p className="text-xs text-neutral-200 mb-2 leading-relaxed font-sans">
                        {aiAudit.summary}
                    </p>

                    {/* Identified Defect Boxes List with Individual Severity Badges */}
                    {sanitizedDefectBoxes.length > 0 && (
                        <div className="space-y-1.5 mt-2">
                            <div className="flex items-center justify-between text-[11px] font-bold text-neutral-300 uppercase tracking-wider">
                                <span>Pinpointed Defect Regions ({sanitizedDefectBoxes.length}):</span>
                                <span className="text-[10px] text-neutral-400 font-normal normal-case">Click eye icon to toggle individual boxes</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {sanitizedDefectBoxes.map((d, i) => {
                                    const isHidden = hiddenBoxIds.has(d.id || i + 1);
                                    const sev = d.severity || "High";
                                    return (
                                        <div 
                                            key={d.id || i}
                                            onMouseEnter={() => setActiveBoxHover(d.id)}
                                            onMouseLeave={() => setActiveBoxHover(null)}
                                            className={`p-2.5 rounded-lg border text-xs transition-all ${
                                                isHidden
                                                    ? "bg-[#0a0c12] border-neutral-800 opacity-60"
                                                    : activeBoxHover === d.id
                                                    ? "bg-red-900/60 border-red-400 shadow-md translate-x-1"
                                                    : "bg-[#0d0f17] border-red-500/30 hover:border-red-500/60"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between text-red-300 font-bold mb-1.5">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {/* Individual Severity Pill */}
                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-black ${getSeverityBadgeStyle(sev)}`}>
                                                        {sev}
                                                    </span>
                                                    <span className={isHidden ? "line-through text-neutral-400" : ""}>{d.label}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] font-mono text-amber-300 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800">
                                                        {d.frequencyBand} {d.measuredDb ? `• ${d.measuredDb}` : ""}
                                                    </span>
                                                    {/* Individual Box Visibility Toggle Button */}
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleBoxVisibility(d.id || i + 1);
                                                        }}
                                                        className={`p-1 rounded transition-colors ${
                                                            isHidden 
                                                                ? "text-neutral-500 hover:text-neutral-200 bg-neutral-900" 
                                                                : "text-red-400 hover:text-white bg-red-950/80"
                                                        }`}
                                                        title={isHidden ? "Show this defect box" : "Hide this defect box"}
                                                    >
                                                        {isHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className={`text-[11px] leading-snug ${isHidden ? "text-neutral-500" : "text-neutral-300"}`}>
                                                {d.issueDescription}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Fullscreen Lightbox Modal */}
            {isLightboxOpen && renderedDataUrl && (
                <div 
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md cursor-zoom-out animate-fade-in"
                    onClick={() => setIsLightboxOpen(false)}
                >
                    <div className="relative max-w-[96vw] w-full bg-[#151722] border border-[#343b59] rounded-2xl p-6 shadow-2xl flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
                        <div className="w-full flex items-center justify-between pb-3 mb-3 border-b border-[#2d3248]">
                            <div className="flex items-center gap-3">
                                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-violet-400" />
                                    {title} — Fullscreen View
                                </h3>
                                {aiAudit && (
                                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                                        aiAudit.verdict === "PASS"
                                            ? "bg-emerald-950 text-emerald-300 border-emerald-500/50"
                                            : "bg-red-950 text-red-300 border-red-500/50"
                                    }`}>
                                        AI Verdict: {aiAudit.verdict}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2.5">
                                {aiAudit?.defectBoxes?.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setShowDefectBoxes(!showDefectBoxes)}
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg cursor-pointer ${
                                            showDefectBoxes 
                                                ? "bg-rose-600 hover:bg-rose-500 text-white border border-rose-400 shadow-rose-600/30" 
                                                : "bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-600 shadow-sm"
                                        }`}
                                    >
                                        {showDefectBoxes ? <Eye className="w-4 h-4 text-white" /> : <EyeOff className="w-4 h-4 text-neutral-400" />}
                                        <span>{showDefectBoxes ? "Red Boxes: ON" : "Red Boxes: OFF (Hidden)"}</span>
                                    </button>
                                )}
                                <button 
                                    onClick={() => setIsLightboxOpen(false)}
                                    className="p-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-600 transition-colors cursor-pointer"
                                    title="Close Fullscreen"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* High-Resolution Expanded Spectrogram View */}
                        <div className="w-full flex items-stretch bg-[#101030] rounded-xl overflow-hidden border border-[#2d3248]" style={{ height: "62vh" }}>
                            {/* Frequency Axis */}
                            <div className="w-16 bg-[#202334] border-r border-[#3a3f5c] flex flex-col justify-between py-2 px-2 text-right select-none shadow-inner z-20">
                                {frequencyTicks.map((tick, idx) => (
                                    <div key={idx} className="flex items-center justify-end gap-1.5">
                                        <span className="text-xs font-mono font-bold text-violet-200 leading-none">
                                            {tick.label}
                                        </span>
                                        <span className="w-2.5 h-[1.5px] bg-neutral-400 inline-block" />
                                    </div>
                                ))}
                            </div>

                            <div className="flex-1 relative bg-[#101030]">
                                <img 
                                    src={renderedDataUrl} 
                                    alt="Zoomed Spectrogram" 
                                    className="w-full h-full object-fill"
                                />
                                {renderBoundingBoxes(true)}
                            </div>
                        </div>

                        {/* Timeline ruler */}
                        <div className="w-full flex justify-between items-center px-16 pt-2 text-xs font-mono text-neutral-400 select-none">
                            <span>0.00s</span>
                            <span>{duration > 0 ? `${(duration * 0.25).toFixed(2)}s` : "1/4"}</span>
                            <span>{duration > 0 ? `${(duration * 0.5).toFixed(2)}s` : "1/2"}</span>
                            <span>{duration > 0 ? `${(duration * 0.75).toFixed(2)}s` : "3/4"}</span>
                            <span>{duration > 0 ? `${duration.toFixed(2)}s` : "End"}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
