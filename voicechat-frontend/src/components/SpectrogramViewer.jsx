import React, { useState, useEffect, useRef } from "react";
import { Maximize2, X, Settings2, Sparkles } from "lucide-react";

// Roseus / Magma high-contrast spectrogram colormap
function getRoseusColor(normVal) {
    const v = Math.max(0, Math.min(1, normVal));
    let r, g, b;

    if (v < 0.2) {
        // Deep purple / black
        const t = v / 0.2;
        r = Math.round(15 + t * 45);
        g = Math.round(10 + t * 10);
        b = Math.round(30 + t * 70);
    } else if (v < 0.45) {
        // Purple to Vivid Magenta
        const t = (v - 0.2) / 0.25;
        r = Math.round(60 + t * 120);
        g = Math.round(20 + t * 15);
        b = Math.round(100 + t * 40);
    } else if (v < 0.75) {
        // Magenta to Flame Orange
        const t = (v - 0.45) / 0.3;
        r = Math.round(180 + t * 65);
        g = Math.round(35 + t * 85);
        b = Math.round(140 - t * 110);
    } else if (v < 0.92) {
        // Orange to Electric Yellow
        const t = (v - 0.75) / 0.17;
        r = Math.round(245 + t * 10);
        g = Math.round(120 + t * 110);
        b = Math.round(30 + t * 40);
    } else {
        // Yellow to White Core
        const t = (v - 0.92) / 0.08;
        r = 255;
        g = Math.round(230 + t * 25);
        b = Math.round(70 + t * 185);
    }
    return [r, g, b];
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

// Precompute Blackman-Harris window
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
    gainDb = 20,
    rangeDb = 120,
    height = 200
}) {
    const canvasRef = useRef(null);
    const [loading, setLoading] = useState(false);
    const [scale, setScale] = useState(scaleType); // "linear" | "mel"
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

            // FFT Parameters matching Audacity Settings (Window: 2048/4096, Hop: 256)
            const fftSize = 2048;
            const hopSize = Math.max(128, Math.floor(totalSamples / 1200));
            const numFrames = Math.floor((totalSamples - fftSize) / hopSize);
            if (numFrames <= 0) return;

            const windowFunc = getBlackmanHarrisWindow(fftSize);
            const numBins = fftSize / 2;
            const nyquist = sr / 2;
            const targetMaxFreq = Math.min(nyquist, maxFreq);

            // Allocate rendering canvas
            const width = Math.min(1400, Math.max(700, numFrames));
            const plotHeight = 320;
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = plotHeight;
            const ctx = canvas.getContext("2d");

            const imgData = ctx.createImageData(width, plotHeight);
            const data = imgData.data;

            const real = new Float32Array(fftSize);
            const imag = new Float32Array(fftSize);

            // Compute STFT & Map to Pixels
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
                    // Vertical frequency mapping: y = 0 is top (Max Freq = 24k), y = plotHeight - 1 is bottom (0k)
                    const normY = 1 - (y / plotHeight);
                    let targetF;

                    if (scale === "mel") {
                        // Mel scale mapping
                        const melMax = 2595 * Math.log10(1 + targetMaxFreq / 700);
                        const mel = normY * melMax;
                        targetF = 700 * (Math.pow(10, mel / 2595) - 1);
                    } else {
                        // Linear scale mapping (0 to 24000 Hz)
                        targetF = normY * targetMaxFreq;
                    }

                    const bin = Math.min(numBins - 1, Math.max(0, Math.round((targetF / nyquist) * numBins)));
                    const mag = Math.sqrt(real[bin] * real[bin] + imag[bin] * imag[bin]) / fftSize;

                    // Convert to dB with Gain & Range
                    const db = 20 * Math.log10(mag + 1e-7) + gainDb;
                    // Normalized amplitude: 0 (noise floor / -100dB) to 1 (0dB / peak)
                    const normAmp = Math.max(0, Math.min(1, (db + rangeDb - gainDb) / rangeDb));

                    const [r, g, b] = getRoseusColor(normAmp);
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
    }, [audioUrl, audioBuffer, scale, maxFreq, gainDb, rangeDb]);

    // Frequency Rulers at 0k, 5k, 10k, 15k, 20k, 24k
    const frequencyTicks = [
        { label: "24k", ratio: 1.0 },
        { label: "20k", ratio: 20000 / maxFreq },
        { label: "15k", ratio: 15000 / maxFreq },
        { label: "10k", ratio: 10000 / maxFreq },
        { label: "5k",  ratio: 5000 / maxFreq },
        { label: "0k",  ratio: 0.0 }
    ];

    return (
        <div className="w-full bg-[#0c0f17] border border-neutral-800 rounded-xl p-3.5 shadow-xl text-neutral-200">
            {/* Header Toolbar */}
            <div className="flex items-center justify-between gap-3 mb-2.5 pb-2 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-violet-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                        {title} ({scale === "linear" ? "Linear 0–24kHz" : "Mel Scale"})
                    </span>
                    <span className="text-[10px] text-neutral-400 font-mono bg-neutral-900/80 px-2 py-0.5 rounded border border-neutral-800">
                        {duration > 0 ? `${duration.toFixed(2)}s` : "48kHz"}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {/* Scale Toggle: Linear vs Mel */}
                    <div className="flex bg-neutral-900 border border-neutral-700 rounded-lg p-0.5 text-[11px] font-semibold">
                        <button
                            type="button"
                            onClick={() => setScale("linear")}
                            className={`px-2 py-0.5 rounded ${scale === "linear" ? "bg-violet-600 text-white shadow-sm" : "text-neutral-400 hover:text-neutral-200"}`}
                        >
                            Linear (0–24k)
                        </button>
                        <button
                            type="button"
                            onClick={() => setScale("mel")}
                            className={`px-2 py-0.5 rounded ${scale === "mel" ? "bg-violet-600 text-white shadow-sm" : "text-neutral-400 hover:text-neutral-200"}`}
                        >
                            Mel Scale
                        </button>
                    </div>

                    {renderedDataUrl && (
                        <button
                            type="button"
                            onClick={() => setIsLightboxOpen(true)}
                            className="p-1 text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-md transition-colors border border-neutral-700"
                            title="Open Fullscreen Lightbox Spectrogram"
                        >
                            <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Spectrogram Canvas with 0k, 5k, 10k, 15k, 20k, 24k Ruler */}
            <div className="relative flex items-stretch bg-black rounded-lg overflow-hidden border border-neutral-800" style={{ height }}>
                {/* Vertical Frequency Axis (Left Ruler) */}
                <div className="w-10 bg-[#090b10] border-r border-neutral-800/80 flex flex-col justify-between py-1 px-1 text-right select-none">
                    {frequencyTicks.map((tick, idx) => (
                        <div key={idx} className="flex items-center justify-end gap-1">
                            <span className="text-[9px] font-mono font-bold text-neutral-400 leading-none">
                                {tick.label}
                            </span>
                            <span className="w-1 h-[1px] bg-neutral-600 inline-block" />
                        </div>
                    ))}
                </div>

                {/* Spectrogram Heatmap Image */}
                <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
                    {loading ? (
                        <div className="flex items-center gap-2 text-xs text-neutral-400">
                            <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                            <span>Computing 0–24kHz Mel Spectrogram...</span>
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
            <div className="flex justify-between items-center px-10 pt-1 text-[9px] font-mono text-neutral-500 select-none">
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
                    <div className="relative max-w-[95vw] w-full bg-[#0a0d14] border border-neutral-700 rounded-2xl p-6 shadow-2xl flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
                        <div className="w-full flex items-center justify-between pb-3 mb-3 border-b border-neutral-800">
                            <div className="flex items-center gap-3">
                                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-violet-400" />
                                    {title} — {scale === "linear" ? "Linear Scale (0–24000 Hz)" : "Mel Scale Spectrogram"}
                                </h3>
                                <span className="text-xs font-mono text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                                    Audacity Spec: 20dB Gain | 120dB Range | Roseus Colormap
                                </span>
                            </div>
                            <button 
                                onClick={() => setIsLightboxOpen(false)}
                                className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* High-Resolution Expanded Spectrogram View */}
                        <div className="w-full flex items-stretch bg-black rounded-xl overflow-hidden border border-neutral-800" style={{ height: "60vh" }}>
                            {/* Frequency Axis */}
                            <div className="w-14 bg-[#090b10] border-r border-neutral-800 flex flex-col justify-between py-2 px-1.5 text-right select-none">
                                {frequencyTicks.map((tick, idx) => (
                                    <div key={idx} className="flex items-center justify-end gap-1.5">
                                        <span className="text-[11px] font-mono font-bold text-violet-300 leading-none">
                                            {tick.label}
                                        </span>
                                        <span className="w-2 h-[1px] bg-neutral-500 inline-block" />
                                    </div>
                                ))}
                            </div>

                            <div className="flex-1 relative bg-black">
                                <img 
                                    src={renderedDataUrl} 
                                    alt="Zoomed Spectrogram" 
                                    className="w-full h-full object-fill"
                                />
                            </div>
                        </div>

                        {/* Timeline ruler */}
                        <div className="w-full flex justify-between items-center px-14 pt-2 text-[11px] font-mono text-neutral-400 select-none">
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
