import React, { useState, useEffect, useRef, useMemo } from "react";
import { Maximize2, X, Settings2, Sparkles, Sliders } from "lucide-react";

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

// Fast In-Place Cooley-Tukey Radix-2 FFT
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
        const wStepR = Math.cos(angle);
        const wStepI = Math.sin(angle);

        for (let i = 0; i < n; i += len) {
            let wr = 1;
            let wi = 0;
            for (let k = 0; k < half; k++) {
                const uR = real[i + k];
                const uI = imag[i + k];
                const vR = real[i + k + half] * wr - imag[i + k + half] * wi;
                const vI = real[i + k + half] * wi + imag[i + k + half] * wr;

                real[i + k] = uR + vR;
                imag[i + k] = uI + vI;
                real[i + k + half] = uR - vR;
                imag[i + k + half] = uI - vI;

                const nextWr = wr * wStepR - wi * wStepI;
                wi = wr * wStepI + wi * wStepR;
                wr = nextWr;
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

export default function SpectrogramViewer({ 
    audioUrl, 
    audioBuffer = null, 
    title = "Mel Spectrogram", 
    scaleType = "linear", // "linear" | "mel"
    maxFreq = 24000,
    gainDb: initialGain = 20,
    rangeDb: initialRange = 120,
    height = 220
}) {
    const [loading, setLoading] = useState(false);
    const [scale, setScale] = useState(scaleType); // "linear" | "mel"
    const [gain, setGain] = useState(initialGain); // Audacity: 20 dB
    const [range, setRange] = useState(initialRange); // Audacity: 120 dB
    const [showSettings, setShowSettings] = useState(false);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [renderedDataUrl, setRenderedDataUrl] = useState(null);
    const [duration, setDuration] = useState(0);

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

                for (let y = 0; y < plotHeight; y++) {
                    // Vertical frequency mapping: y = 0 is 24k (top), y = plotHeight - 1 is 0k (bottom)
                    const normY = 1 - (y / plotHeight);
                    let targetF;

                    if (scale === "mel") {
                        const melMax = 2595 * Math.log10(1 + targetMaxFreq / 700);
                        const mel = normY * melMax;
                        targetF = 700 * (Math.pow(10, mel / 2595) - 1);
                    } else {
                        targetF = normY * targetMaxFreq;
                    }

                    // Linear interpolation between FFT frequency bins
                    const exactBin = Math.max(0, Math.min(numBins - 1, (targetF / nyquist) * numBins));
                    const binLow = Math.floor(exactBin);
                    const binHigh = Math.min(numBins - 1, binLow + 1);
                    const binFrac = exactBin - binLow;

                    const magLow = Math.sqrt(real[binLow] * real[binLow] + imag[binLow] * imag[binLow]) / winNorm;
                    const magHigh = Math.sqrt(real[binHigh] * real[binHigh] + imag[binHigh] * imag[binHigh]) / winNorm;
                    const mag = magLow * (1 - binFrac) + magHigh * binFrac;

                    // Audacity exact dBFS formulation:
                    // rawDb = 20 * log10(mag)
                    // effectiveDb = rawDb + Gain
                    // normVal = (effectiveDb - (-Range)) / Range = (effectiveDb + Range) / Range
                    const rawDb = 20 * Math.log10(Math.max(1e-9, mag));
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

    // Frequency Rulers at 24k, 20k, 15k, 10k, 5k, 0k (matching Audacity)
    const frequencyTicks = [
        { label: "24k", ratio: 1.0 },
        { label: "20k", ratio: 20000 / maxFreq },
        { label: "15k", ratio: 15000 / maxFreq },
        { label: "10k", ratio: 10000 / maxFreq },
        { label: "5k",  ratio: 5000 / maxFreq },
        { label: "0k",  ratio: 0.0 }
    ];

    return (
        <div className="w-full bg-[#181a24] border border-[#2d3248] rounded-xl p-3 shadow-2xl text-neutral-200">
            {/* Header Control Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5 pb-2 border-b border-[#2d3248]">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-violet-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                        {title}
                    </span>
                    <span className="text-[10px] text-amber-300 font-mono bg-[#0f111a] px-2 py-0.5 rounded border border-[#2d3248]">
                        Color (Roseus) • +{gain}dB Gain • {range}dB Range
                    </span>
                    <span className="text-[10px] text-neutral-400 font-mono bg-[#0f111a] px-2 py-0.5 rounded border border-[#2d3248]">
                        {duration > 0 ? `${duration.toFixed(2)}s` : "48kHz"}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {/* Scale Toggle: Linear vs Mel */}
                    <div className="flex bg-[#0f111a] border border-[#2d3248] rounded-lg p-0.5 text-[11px] font-semibold">
                        <button
                            type="button"
                            onClick={() => setScale("linear")}
                            className={`px-2.5 py-0.5 rounded transition-all ${scale === "linear" ? "bg-violet-600 text-white shadow-sm" : "text-neutral-400 hover:text-neutral-200"}`}
                        >
                            Linear (0–24k)
                        </button>
                        <button
                            type="button"
                            onClick={() => setScale("mel")}
                            className={`px-2.5 py-0.5 rounded transition-all ${scale === "mel" ? "bg-violet-600 text-white shadow-sm" : "text-neutral-400 hover:text-neutral-200"}`}
                        >
                            Mel Scale
                        </button>
                    </div>

                    {/* Live Gain / Range Settings Toggle */}
                    <button
                        type="button"
                        onClick={() => setShowSettings(!showSettings)}
                        className={`p-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 transition-colors ${showSettings ? "bg-violet-700 border-violet-500 text-white" : "bg-[#0f111a] border-[#2d3248] text-neutral-300 hover:text-white"}`}
                        title="Tuning Settings (Gain & Range)"
                    >
                        <Sliders className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Tuning</span>
                    </button>

                    {renderedDataUrl && (
                        <button
                            type="button"
                            onClick={() => setIsLightboxOpen(true)}
                            className="p-1.5 text-neutral-300 hover:text-white bg-[#0f111a] hover:bg-[#2d3248] rounded-lg transition-colors border border-[#2d3248]"
                            title="Open Fullscreen High-Res Spectrogram"
                        >
                            <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Tuning Drawer */}
            {showSettings && (
                <div className="mb-3 p-3 bg-[#0d0f17] border border-violet-500/30 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                        <div className="flex justify-between items-center mb-1 text-neutral-300 font-semibold">
                            <span>Gain (dB): <b className="text-violet-400">+{gain} dB</b></span>
                            <span className="text-[10px] text-neutral-500">Audacity: +20 dB</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="50"
                            step="5"
                            value={gain}
                            onChange={(e) => setGain(Number(e.target.value))}
                            className="w-full accent-violet-500 cursor-pointer"
                        />
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-1 text-neutral-300 font-semibold">
                            <span>Dynamic Range (dB): <b className="text-violet-400">{range} dB</b></span>
                            <span className="text-[10px] text-neutral-500">Audacity: 120 dB</span>
                        </div>
                        <input
                            type="range"
                            min="60"
                            max="140"
                            step="10"
                            value={range}
                            onChange={(e) => setRange(Number(e.target.value))}
                            className="w-full accent-violet-500 cursor-pointer"
                        />
                    </div>
                </div>
            )}

            {/* Spectrogram Canvas with 0k, 5k, 10k, 15k, 20k, 24k Ruler (Audacity Track Style) */}
            <div className="relative flex items-stretch bg-[#101030] rounded-lg overflow-hidden border border-[#2d3248]" style={{ height }}>
                {/* Vertical Frequency Axis (Audacity Grey Track Ruler) */}
                <div className="w-12 bg-[#202334] border-r border-[#3a3f5c] flex flex-col justify-between py-1.5 px-1.5 text-right select-none shadow-inner">
                    {frequencyTicks.map((tick, idx) => (
                        <div key={idx} className="flex items-center justify-end gap-1.5">
                            <span className="text-[10px] font-mono font-bold text-neutral-300 leading-none">
                                {tick.label}
                            </span>
                            <span className="w-2 h-[1px] bg-neutral-400 inline-block" />
                        </div>
                    ))}
                </div>

                {/* Spectrogram Heatmap Image */}
                <div className="flex-1 relative bg-[#101030] flex items-center justify-center overflow-hidden">
                    {loading ? (
                        <div className="flex items-center gap-2 text-xs text-violet-300 font-medium">
                            <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                            <span>Rendering Audacity Roseus Spectrogram...</span>
                        </div>
                    ) : renderedDataUrl ? (
                        <img 
                            src={renderedDataUrl} 
                            alt="Spectrogram" 
                            className="w-full h-full object-fill cursor-zoom-in hover:brightness-105 transition-all"
                            onClick={() => setIsLightboxOpen(true)}
                        />
                    ) : (
                        <span className="text-xs text-neutral-500">Audio not loaded</span>
                    )}
                </div>
            </div>

            {/* Bottom Time Axis */}
            <div className="flex justify-between items-center px-12 pt-1 text-[10px] font-mono text-neutral-400 select-none">
                <span>0.00s</span>
                <span>{duration > 0 ? `${(duration / 2).toFixed(2)}s` : "Mid"}</span>
                <span>{duration > 0 ? `${duration.toFixed(2)}s` : "End"}</span>
            </div>

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
                                    {title} — {scale === "linear" ? "Linear Scale (0–24000 Hz)" : "Mel Scale Spectrogram"}
                                </h3>
                                <span className="text-xs font-mono text-amber-300 bg-[#0f111a] px-2.5 py-1 rounded-lg border border-[#2d3248]">
                                    Color (Roseus) • +{gain}dB Gain • {range}dB Range • Blackman-Harris
                                </span>
                            </div>
                            <button 
                                onClick={() => setIsLightboxOpen(false)}
                                className="p-1.5 rounded-lg bg-[#202334] hover:bg-[#2d3248] text-neutral-300 hover:text-white border border-[#3a3f5c]"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* High-Resolution Expanded Spectrogram View */}
                        <div className="w-full flex items-stretch bg-[#101030] rounded-xl overflow-hidden border border-[#2d3248]" style={{ height: "62vh" }}>
                            {/* Frequency Axis */}
                            <div className="w-16 bg-[#202334] border-r border-[#3a3f5c] flex flex-col justify-between py-2 px-2 text-right select-none shadow-inner">
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
