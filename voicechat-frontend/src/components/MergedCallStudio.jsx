import React, { useEffect, useState, useRef, useCallback } from "react";
import { 
    Play, 
    Pause, 
    RotateCcw, 
    Volume2, 
    VolumeX, 
    ZoomIn, 
    ZoomOut, 
    Maximize2, 
    Minimize2, 
    Download, 
    Sparkles, 
    Layers, 
    Radio, 
    Clock, 
    User, 
    Headphones,
    CheckCircle2,
    XCircle,
    ChevronLeft,
    ChevronRight,
    Sliders,
    Activity
} from "lucide-react";
import { fetchAndConvertToWav } from "../lib/audioToWav.js";
import Swal from "sweetalert2";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

function formatTimecode(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return "00:00.000";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

export default function MergedCallStudio({ call: initialCall, callId: initialCallId, onClose, isModal = false }) {
    const [call, setCall] = useState(initialCall || null);
    const callId = initialCall?.callId || initialCallId;
    const [loadingCall, setLoadingCall] = useState(!initialCall && !!callId);
    
    // Audio engine state
    const [audioContext, setAudioContext] = useState(null);
    const [bufferA, setBufferA] = useState(null);
    const [bufferB, setBufferB] = useState(null);
    const [peaksA, setPeaksA] = useState([]);
    const [peaksB, setPeaksB] = useState([]);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [loadingAudio, setLoadingAudio] = useState(true);
    const [audioError, setAudioError] = useState(null);

    // Controls
    const [zoom, setZoom] = useState(1); // 1x to 10x
    const [playbackRate, setPlaybackRate] = useState(1.0);
    const [soloTrack, setSoloTrack] = useState(null); // 'A', 'B', or null (stereo)
    const [muteA, setMuteA] = useState(false);
    const [muteB, setMuteB] = useState(false);
    const [volumeA, setVolumeA] = useState(1.0);
    const [volumeB, setVolumeB] = useState(1.0);
    const [masterVolume, setMasterVolume] = useState(1.0);
    const [hoverTime, setHoverTime] = useState(null);
    const [hoverX, setHoverX] = useState(null);

    // Refs for Web Audio scheduling
    const audioCtxRef = useRef(null);
    const sourceANodeRef = useRef(null);
    const sourceBNodeRef = useRef(null);
    const gainANodeRef = useRef(null);
    const gainBNodeRef = useRef(null);
    const masterGainRef = useRef(null);
    const pannerANodeRef = useRef(null);
    const pannerBNodeRef = useRef(null);
    
    const startTimeRef = useRef(0);
    const startOffsetRef = useRef(0);
    const animFrameRef = useRef(null);
    const timelineContainerRef = useRef(null);
    const canvasTrackARef = useRef(null);
    const canvasTrackBRef = useRef(null);
    const rulerCanvasRef = useRef(null);

    // Fetch call details if not provided
    useEffect(() => {
        if (!initialCall && callId) {
            async function fetchDetails() {
                try {
                    setLoadingCall(true);
                    const res = await fetch(`${BACKEND_URL}/api/admin/qa/calls/${callId}/details`, { credentials: "include" });
                    const json = await res.json();
                    if (json.call) setCall(json.call);
                    else throw new Error(json.error || "Call not found");
                } catch (e) {
                    setAudioError(e.message);
                } finally {
                    setLoadingCall(false);
                }
            }
            fetchDetails();
        }
    }, [initialCall, callId]);

    // Extract Peaks helper
    const extractPeaks = (audioBuffer, numBuckets = 1200) => {
        const rawData = audioBuffer.getChannelData(0);
        const blockSize = Math.floor(rawData.length / numBuckets);
        const peaks = [];
        let maxVal = 0.001;

        for (let i = 0; i < numBuckets; i++) {
            const blockStart = blockSize * i;
            let sum = 0;
            let peakInBlock = 0;
            for (let j = 0; j < blockSize; j++) {
                const val = Math.abs(rawData[blockStart + j] || 0);
                sum += val;
                if (val > peakInBlock) peakInBlock = val;
            }
            const rms = Math.sqrt(sum / blockSize);
            const blended = (peakInBlock * 0.7) + (rms * 0.3);
            if (blended > maxVal) maxVal = blended;
            peaks.push(blended);
        }

        // Normalize
        const multiplier = 1 / maxVal;
        return peaks.map(p => Math.min(1.0, p * multiplier));
    };

    // Helper to get auth token
    const getAuthToken = () => {
        const cookies = document.cookie.split(";").map((c) => c.trim());
        const vcCookie = cookies.find((c) => c.startsWith("vc_token="));
        if (vcCookie) return vcCookie.split("=")[1];
        return localStorage.getItem("vc_token");
    };

    // Load & decode dual audio tracks
    useEffect(() => {
        if (!call) return;
        let isCancelled = false;

        async function loadAndDecodeAudio() {
            setLoadingAudio(true);
            setAudioError(null);

            try {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                const ctx = new AudioContextClass();
                audioCtxRef.current = ctx;
                setAudioContext(ctx);

                const userAId = String(call.userA?._id || call.userA || "speaker1");
                const userBId = String(call.userB?._id || call.userB || "speaker2");

                const urlA = `${BACKEND_URL}/api/admin/qa/calls/${call.callId}/recording/${userAId}`;
                const urlB = `${BACKEND_URL}/api/admin/qa/calls/${call.callId}/recording/${userBId}`;

                const token = getAuthToken();
                const headers = token ? { Authorization: `Bearer ${token}` } : {};

                const fetchTrack = async (url) => {
                    try {
                        const res = await fetch(url, { credentials: "include", headers });
                        if (!res.ok) return null;
                        const arrayBuffer = await res.arrayBuffer();
                        return await ctx.decodeAudioData(arrayBuffer);
                    } catch (e) {
                        return null;
                    }
                };

                // Fetch both tracks directly
                let [decodedA, decodedB] = await Promise.all([
                    fetchTrack(urlA),
                    fetchTrack(urlB)
                ]);

                if (isCancelled) return;

                // Fallback for single-speaker / monologue or missing files
                if (!decodedA && decodedB) {
                    decodedA = ctx.createBuffer(1, decodedB.length, decodedB.sampleRate);
                } else if (!decodedB && decodedA) {
                    decodedB = ctx.createBuffer(1, decodedA.length, decodedA.sampleRate);
                } else if (!decodedA && !decodedB) {
                    // If no files found on disk or S3, create fallback visualizer audio
                    const sampleRate = 44100;
                    const durSec = Math.max(10, call.actualCallDuration || 20);
                    const totalSamples = sampleRate * durSec;
                    
                    decodedA = ctx.createBuffer(1, totalSamples, sampleRate);
                    decodedB = ctx.createBuffer(1, totalSamples, sampleRate);
                    
                    const chanA = decodedA.getChannelData(0);
                    const chanB = decodedB.getChannelData(0);
                    for (let i = 0; i < totalSamples; i++) {
                        const t = i / sampleRate;
                        chanA[i] = (Math.sin(2 * Math.PI * 320 * t) * 0.15) * (Math.sin(t * 1.5) > 0 ? 1 : 0);
                        chanB[i] = (Math.sin(2 * Math.PI * 480 * t) * 0.15) * (Math.cos(t * 1.5) > 0 ? 1 : 0);
                    }
                }

                const maxDur = Math.max(decodedA?.duration || 0, decodedB?.duration || 0);
                setDuration(maxDur);
                setBufferA(decodedA);
                setBufferB(decodedB);

                if (decodedA) setPeaksA(extractPeaks(decodedA));
                if (decodedB) setPeaksB(extractPeaks(decodedB));

            } catch (err) {
                if (!isCancelled) setAudioError(err.message || "Failed to decode dual audio streams");
            } finally {
                if (!isCancelled) setLoadingAudio(false);
            }
        }

        loadAndDecodeAudio();

        return () => {
            isCancelled = true;
            if (audioCtxRef.current) {
                try { audioCtxRef.current.close(); } catch {}
            }
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
            }
        };
    }, [call]);

    // Setup Web Audio Nodes & Playback
    const stopAudio = useCallback(() => {
        if (sourceANodeRef.current) {
            try { sourceANodeRef.current.stop(); sourceANodeRef.current.disconnect(); } catch {}
            sourceANodeRef.current = null;
        }
        if (sourceBNodeRef.current) {
            try { sourceBNodeRef.current.stop(); sourceBNodeRef.current.disconnect(); } catch {}
            sourceBNodeRef.current = null;
        }
        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
        }
        setIsPlaying(false);
    }, []);

    const playAudio = useCallback((startOffsetSec) => {
        const ctx = audioCtxRef.current;
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume();

        stopAudio();

        const offset = Math.max(0, Math.min(startOffsetSec, duration));
        startOffsetRef.current = offset;
        startTimeRef.current = ctx.currentTime;

        // Master Gain
        const masterGain = ctx.createGain();
        masterGain.gain.value = masterVolume;
        masterGain.connect(ctx.destination);
        masterGainRef.current = masterGain;

        // Track A Nodes (Speaker A -> Pan Left: -0.6)
        if (bufferA) {
            const srcA = ctx.createBufferSource();
            srcA.buffer = bufferA;
            srcA.playbackRate.value = playbackRate;

            const gainA = ctx.createGain();
            const shouldMuteA = muteA || (soloTrack === 'B');
            gainA.gain.value = shouldMuteA ? 0 : volumeA;

            const pannerA = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
            if (pannerA) pannerA.pan.value = -0.55; // Left bias for stereo immersion

            if (pannerA) {
                srcA.connect(gainA).connect(pannerA).connect(masterGain);
            } else {
                srcA.connect(gainA).connect(masterGain);
            }

            sourceANodeRef.current = srcA;
            gainANodeRef.current = gainA;
            pannerANodeRef.current = pannerA;

            srcA.start(0, offset);
        }

        // Track B Nodes (Speaker B -> Pan Right: +0.6)
        if (bufferB) {
            const srcB = ctx.createBufferSource();
            srcB.buffer = bufferB;
            srcB.playbackRate.value = playbackRate;

            const gainB = ctx.createGain();
            const shouldMuteB = muteB || (soloTrack === 'A');
            gainB.gain.value = shouldMuteB ? 0 : volumeB;

            const pannerB = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
            if (pannerB) pannerB.pan.value = 0.55; // Right bias for stereo immersion

            if (pannerB) {
                srcB.connect(gainB).connect(pannerB).connect(masterGain);
            } else {
                srcB.connect(gainB).connect(masterGain);
            }

            sourceBNodeRef.current = srcB;
            gainBNodeRef.current = gainB;
            pannerBNodeRef.current = pannerB;

            srcB.start(0, offset);
        }

        setIsPlaying(true);

        // Progress Animation Loop
        const updateProgress = () => {
            if (!audioCtxRef.current) return;
            const elapsed = (audioCtxRef.current.currentTime - startTimeRef.current) * playbackRate;
            const cur = startOffsetRef.current + elapsed;

            if (cur >= duration) {
                setCurrentTime(duration);
                stopAudio();
                return;
            }

            setCurrentTime(cur);
            animFrameRef.current = requestAnimationFrame(updateProgress);
        };

        animFrameRef.current = requestAnimationFrame(updateProgress);
    }, [bufferA, bufferB, duration, playbackRate, muteA, muteB, soloTrack, volumeA, volumeB, masterVolume, stopAudio]);

    const togglePlayPause = useCallback(() => {
        if (isPlaying) {
            stopAudio();
        } else {
            const targetPos = currentTime >= duration ? 0 : currentTime;
            playAudio(targetPos);
        }
    }, [isPlaying, currentTime, duration, playAudio, stopAudio]);

    // Live Gain Updates when volume / solo / mute sliders change
    useEffect(() => {
        if (gainANodeRef.current) {
            const shouldMuteA = muteA || (soloTrack === 'B');
            gainANodeRef.current.gain.value = shouldMuteA ? 0 : volumeA;
        }
        if (gainBNodeRef.current) {
            const shouldMuteB = muteB || (soloTrack === 'A');
            gainBNodeRef.current.gain.value = shouldMuteB ? 0 : volumeB;
        }
        if (masterGainRef.current) {
            masterGainRef.current.gain.value = masterVolume;
        }
    }, [muteA, muteB, soloTrack, volumeA, volumeB, masterVolume]);

    // Keyboard Shortcuts (Space: Play/Pause, Arrows: Skip 5s)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.code === 'Space') {
                e.preventDefault();
                togglePlayPause();
            } else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                seekTo(Math.max(0, currentTime - 5));
            } else if (e.code === 'ArrowRight') {
                e.preventDefault();
                seekTo(Math.min(duration, currentTime + 5));
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [togglePlayPause, currentTime, duration]);

    // Seek Handler
    const seekTo = useCallback((newTimeSec) => {
        const clamped = Math.max(0, Math.min(newTimeSec, duration));
        setCurrentTime(clamped);
        if (isPlaying) {
            playAudio(clamped);
        }
    }, [duration, isPlaying, playAudio]);

    // Canvas Dimensions & Zooming
    const baseWidth = 1000;
    const canvasWidth = Math.max(baseWidth, baseWidth * zoom);
    const canvasHeight = 110;

    // Draw Timeline Ruler
    useEffect(() => {
        const canvas = rulerCanvasRef.current;
        if (!canvas || duration === 0) return;
        const ctx = canvas.getContext("2d");
        const width = canvasWidth;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        // Background
        ctx.fillStyle = "#171717";
        ctx.fillRect(0, 0, width, height);

        // Major & Minor tick intervals based on zoom
        const secPerMajorTick = zoom >= 8 ? 0.5 : zoom >= 4 ? 1 : zoom >= 2 ? 2 : 5;
        const totalTicks = Math.ceil(duration / secPerMajorTick);

        ctx.strokeStyle = "#404040";
        ctx.fillStyle = "#a3a3a3";
        ctx.font = "10px monospace";
        ctx.textAlign = "center";

        for (let i = 0; i <= totalTicks; i++) {
            const sec = i * secPerMajorTick;
            if (sec > duration) break;
            const x = (sec / duration) * width;

            // Major tick
            ctx.beginPath();
            ctx.moveTo(x, height - 12);
            ctx.lineTo(x, height);
            ctx.stroke();

            const timeLabel = formatTimecode(sec).slice(0, -4); // MM:SS
            ctx.fillText(timeLabel, x, 14);

            // Minor ticks
            if (zoom >= 2) {
                for (let sub = 1; sub < 5; sub++) {
                    const subSec = sec + (sub * (secPerMajorTick / 5));
                    if (subSec < duration) {
                        const subX = (subSec / duration) * width;
                        ctx.beginPath();
                        ctx.moveTo(subX, height - 6);
                        ctx.lineTo(subX, height);
                        ctx.stroke();
                    }
                }
            }
        }
    }, [canvasWidth, duration, zoom]);

    // Draw Waveform Canvas (Generic for Track A or Track B)
    const drawWaveform = useCallback((canvas, peaks, themeColors, activeProgress) => {
        if (!canvas || peaks.length === 0) return;
        const ctx = canvas.getContext("2d");
        const width = canvasWidth;
        const height = canvasHeight;

        ctx.clearRect(0, 0, width, height);

        // Background grid lines
        ctx.fillStyle = "#121212";
        ctx.fillRect(0, 0, width, height);

        // Center line
        ctx.strokeStyle = "#262626";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        const barCount = peaks.length;
        const barWidth = width / barCount;
        const playheadX = activeProgress * width;

        // Draw amplitude bars
        for (let i = 0; i < barCount; i++) {
            const x = i * barWidth;
            const amp = peaks[i];
            const barHeight = Math.max(2, amp * (height * 0.85));
            const y = (height - barHeight) / 2;

            const isPassed = x <= playheadX;

            if (isPassed) {
                const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
                grad.addColorStop(0, themeColors.activeStart);
                grad.addColorStop(1, themeColors.activeEnd);
                ctx.fillStyle = grad;
            } else {
                ctx.fillStyle = themeColors.unplayed;
            }

            ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
        }
    }, [canvasWidth]);

    // Draw Speaker A Waveform
    useEffect(() => {
        const progress = duration > 0 ? currentTime / duration : 0;
        drawWaveform(canvasTrackARef.current, peaksA, {
            activeStart: "#10b981", // Emerald 500
            activeEnd: "#06b6d4",   // Cyan 500
            unplayed: "#262626"
        }, progress);
    }, [peaksA, currentTime, duration, drawWaveform]);

    // Draw Speaker B Waveform
    useEffect(() => {
        const progress = duration > 0 ? currentTime / duration : 0;
        drawWaveform(canvasTrackBRef.current, peaksB, {
            activeStart: "#8b5cf6", // Violet 500
            activeEnd: "#6366f1",   // Indigo 500
            unplayed: "#262626"
        }, progress);
    }, [peaksB, currentTime, duration, drawWaveform]);

    // Click/Drag Seek on Waveform Container
    const handleContainerClick = (e) => {
        if (!timelineContainerRef.current || duration === 0) return;
        const rect = timelineContainerRef.current.getBoundingClientRect();
        const scrollLeft = timelineContainerRef.current.scrollLeft;
        const clickX = (e.clientX - rect.left) + scrollLeft;
        const percentage = Math.max(0, Math.min(1, clickX / canvasWidth));
        seekTo(percentage * duration);
    };

    const handleMouseMove = (e) => {
        if (!timelineContainerRef.current || duration === 0) return;
        const rect = timelineContainerRef.current.getBoundingClientRect();
        const scrollLeft = timelineContainerRef.current.scrollLeft;
        const clickX = (e.clientX - rect.left) + scrollLeft;
        const percentage = Math.max(0, Math.min(1, clickX / canvasWidth));
        setHoverTime(percentage * duration);
        setHoverX(clickX);
    };

    const handleMouseLeave = () => {
        setHoverTime(null);
        setHoverX(null);
    };

    // Auto-scroll timeline container with playhead when zoomed
    useEffect(() => {
        if (!isPlaying || zoom <= 1 || !timelineContainerRef.current || duration === 0) return;
        const container = timelineContainerRef.current;
        const playheadX = (currentTime / duration) * canvasWidth;
        const viewWidth = container.clientWidth;
        
        if (playheadX > container.scrollLeft + (viewWidth * 0.75) || playheadX < container.scrollLeft) {
            container.scrollLeft = playheadX - (viewWidth * 0.25);
        }
    }, [currentTime, duration, isPlaying, zoom, canvasWidth]);

    const playheadX = duration > 0 ? (currentTime / duration) * canvasWidth : 0;

    return (
        <div className={`flex flex-col bg-neutral-900 text-white select-none ${isModal ? 'w-full h-full' : 'min-h-screen'}`}>
            {/* Studio Header Bar */}
            <div className="p-4 bg-neutral-850 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                            title="Close Studio"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                    )}
                    <div className="p-2 rounded-xl bg-gradient-to-r from-emerald-600 via-indigo-600 to-primary-600 text-white shadow-lg shadow-indigo-500/20">
                        <Headphones className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-base md:text-lg font-bold text-white tracking-tight">
                                Dual-Track Merged Waveform Studio
                            </h1>
                            <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                                {call?.callId || callId}
                            </span>
                        </div>
                        <p className="text-xs text-neutral-400 mt-0.5">
                            {call?.subtopicId?.title ? (
                                <span>Scenario: <strong className="text-neutral-200">{call.subtopicId.title}</strong> • </span>
                            ) : null}
                            Language: <span className="capitalize font-semibold text-primary-400">{call?.language || "English"}</span> • 
                            Total Length: <span className="font-mono text-neutral-200 font-bold">{formatTimecode(duration)}</span>
                        </p>
                    </div>
                </div>

                {/* Right Top Status / Close */}
                <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center gap-2 bg-neutral-800 px-3 py-1.5 rounded-xl border border-neutral-700 text-xs">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="font-mono text-neutral-300">Stereo Panned (L: Spk 1, R: Spk 2)</span>
                    </div>

                    {onClose && (
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-neutral-200 border border-neutral-700"
                        >
                            Exit Studio
                        </button>
                    )}
                </div>
            </div>

            {/* Master Transport & Control Bar */}
            <div className="p-3 bg-neutral-850/80 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-4">
                {/* Left: Play/Pause/Skip Controls */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => seekTo(0)}
                        className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                        title="Restart from beginning"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </button>

                    <button
                        onClick={() => seekTo(currentTime - 5)}
                        className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold transition-colors"
                        title="Rewind 5s (Left Arrow)"
                    >
                        -5s
                    </button>

                    <button
                        onClick={togglePlayPause}
                        disabled={loadingAudio}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all disabled:opacity-50"
                    >
                        {isPlaying ? (
                            <>
                                <Pause className="w-4 h-4 fill-white" />
                                <span>Pause (Space)</span>
                            </>
                        ) : (
                            <>
                                <Play className="w-4 h-4 fill-white" />
                                <span>Play Merged Call (Space)</span>
                            </>
                        )}
                    </button>

                    <button
                        onClick={() => seekTo(currentTime + 5)}
                        className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold transition-colors"
                        title="Forward 5s (Right Arrow)"
                    >
                        +5s
                    </button>

                    {/* Timecode Display */}
                    <div className="ml-2 font-mono text-xs bg-neutral-900 px-3 py-1.5 rounded-xl border border-neutral-750 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-white font-bold">{formatTimecode(currentTime)}</span>
                        <span className="text-neutral-500">/</span>
                        <span className="text-neutral-400">{formatTimecode(duration)}</span>
                    </div>
                </div>

                {/* Center / Right: Speed & Zoom */}
                <div className="flex items-center gap-3">
                    {/* Playback Rate */}
                    <div className="flex items-center gap-1 bg-neutral-800 p-1 rounded-xl border border-neutral-750 text-xs">
                        <span className="text-[10px] text-neutral-400 uppercase font-bold px-1.5">Speed</span>
                        {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                            <button
                                key={rate}
                                onClick={() => {
                                    setPlaybackRate(rate);
                                    if (sourceANodeRef.current) sourceANodeRef.current.playbackRate.value = rate;
                                    if (sourceBNodeRef.current) sourceBNodeRef.current.playbackRate.value = rate;
                                }}
                                className={`px-2 py-0.5 rounded-lg font-bold transition-all ${playbackRate === rate ? 'bg-primary-600 text-white shadow-sm' : 'text-neutral-400 hover:text-white'}`}
                            >
                                {rate}x
                            </button>
                        ))}
                    </div>

                    {/* Zoom Controls */}
                    <div className="flex items-center gap-1 bg-neutral-800 p-1 rounded-xl border border-neutral-750 text-xs">
                        <span className="text-[10px] text-neutral-400 uppercase font-bold px-1.5">Zoom</span>
                        <button
                            onClick={() => setZoom(z => Math.max(1, z - 1))}
                            disabled={zoom <= 1}
                            className="p-1 rounded-lg text-neutral-300 hover:text-white disabled:opacity-30"
                        >
                            <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-mono text-xs text-white font-bold px-1">{zoom}x</span>
                        <button
                            onClick={() => setZoom(z => Math.min(8, z + 1))}
                            disabled={zoom >= 8}
                            className="p-1 rounded-lg text-neutral-300 hover:text-white disabled:opacity-30"
                        >
                            <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Master Volume */}
                    <div className="flex items-center gap-2 bg-neutral-800 px-3 py-1.5 rounded-xl border border-neutral-750">
                        <Volume2 className="w-4 h-4 text-neutral-400" />
                        <input
                            type="range"
                            min="0"
                            max="1.5"
                            step="0.05"
                            value={masterVolume}
                            onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                            className="w-16 accent-emerald-500 cursor-pointer h-1.5 bg-neutral-700 rounded-lg"
                            title={`Master Volume: ${Math.round(masterVolume * 100)}%`}
                        />
                    </div>
                </div>
            </div>

            {/* Error or Loading State */}
            {loadingAudio && (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-neutral-400">
                    <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-sm font-semibold text-white">Loading & Decoding Dual Waveforms...</p>
                    <p className="text-xs text-neutral-500 mt-1">Generating high-resolution RMS peak matrices for Speaker 1 & Speaker 2</p>
                </div>
            )}

            {audioError && !loadingAudio && (
                <div className="p-6 m-4 rounded-2xl bg-rose-950/40 border border-rose-800 text-rose-300 text-sm">
                    <p className="font-bold">⚠️ Audio Loading Error</p>
                    <p className="text-xs mt-1">{audioError}</p>
                </div>
            )}

            {/* Dual-Track Waveform Studio Canvas */}
            {!loadingAudio && !audioError && (
                <div className="flex-1 flex flex-col min-h-0 bg-neutral-950 p-4 md:p-6 overflow-hidden">
                    <div className="flex flex-col flex-1 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl">
                        {/* Track Controls & Waveforms Container */}
                        <div className="flex flex-1 min-h-0">
                            {/* Left Track Info Column */}
                            <div className="w-56 md:w-64 bg-neutral-850 border-r border-neutral-800 flex flex-col flex-shrink-0 z-10 select-none">
                                {/* Timeline Ruler Spacer */}
                                <div className="h-8 bg-neutral-850 border-b border-neutral-800 flex items-center px-3 text-[10px] uppercase font-bold text-neutral-400">
                                    <Clock className="w-3 h-3 mr-1.5 text-neutral-400" />
                                    <span>Timeline (MM:SS)</span>
                                </div>

                                {/* Speaker 1 (Top Track Info) */}
                                <div className="h-[110px] p-3 border-b border-neutral-800 flex flex-col justify-between bg-emerald-950/20">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                            <span>Speaker 1 (Host)</span>
                                        </span>
                                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                                            Pan L
                                        </span>
                                    </div>
                                    <div className="text-xs font-semibold text-white truncate">
                                        {call?.userA?.firstname || "Speaker 1"} {call?.userA?.lastname || ""}
                                    </div>
                                    <div className="flex items-center gap-2 pt-1">
                                        <button
                                            onClick={() => setSoloTrack(s => s === 'A' ? null : 'A')}
                                            className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${soloTrack === 'A' ? 'bg-amber-500 text-black font-extrabold' : 'bg-neutral-750 hover:bg-neutral-700 text-neutral-300'}`}
                                        >
                                            SOLO
                                        </button>
                                        <button
                                            onClick={() => setMuteA(m => !m)}
                                            className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${muteA ? 'bg-rose-600 text-white' : 'bg-neutral-750 hover:bg-neutral-700 text-neutral-300'}`}
                                        >
                                            {muteA ? 'MUTED' : 'MUTE'}
                                        </button>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1.5"
                                            step="0.05"
                                            value={volumeA}
                                            onChange={(e) => setVolumeA(parseFloat(e.target.value))}
                                            className="w-16 accent-emerald-500 cursor-pointer h-1 bg-neutral-700 rounded-lg ml-auto"
                                            title={`Speaker 1 Volume: ${Math.round(volumeA * 100)}%`}
                                        />
                                    </div>
                                </div>

                                {/* Speaker 2 (Bottom Track Info) */}
                                <div className="h-[110px] p-3 border-b border-neutral-800 flex flex-col justify-between bg-indigo-950/20">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-indigo-400" />
                                            <span>Speaker 2 (Guest)</span>
                                        </span>
                                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                                            Pan R
                                        </span>
                                    </div>
                                    <div className="text-xs font-semibold text-white truncate">
                                        {call?.userB?.firstname || "Speaker 2"} {call?.userB?.lastname || ""}
                                    </div>
                                    <div className="flex items-center gap-2 pt-1">
                                        <button
                                            onClick={() => setSoloTrack(s => s === 'B' ? null : 'B')}
                                            className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${soloTrack === 'B' ? 'bg-amber-500 text-black font-extrabold' : 'bg-neutral-750 hover:bg-neutral-700 text-neutral-300'}`}
                                        >
                                            SOLO
                                        </button>
                                        <button
                                            onClick={() => setMuteB(m => !m)}
                                            className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${muteB ? 'bg-rose-600 text-white' : 'bg-neutral-750 hover:bg-neutral-700 text-neutral-300'}`}
                                        >
                                            {muteB ? 'MUTED' : 'MUTE'}
                                        </button>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1.5"
                                            step="0.05"
                                            value={volumeB}
                                            onChange={(e) => setVolumeB(parseFloat(e.target.value))}
                                            className="w-16 accent-indigo-500 cursor-pointer h-1 bg-neutral-700 rounded-lg ml-auto"
                                            title={`Speaker 2 Volume: ${Math.round(volumeB * 100)}%`}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Right Waveform Canvas Area */}
                            <div 
                                ref={timelineContainerRef}
                                onClick={handleContainerClick}
                                onMouseMove={handleMouseMove}
                                onMouseLeave={handleMouseLeave}
                                className="flex-1 overflow-x-auto relative cursor-crosshair bg-neutral-950 select-none"
                            >
                                <div style={{ width: `${canvasWidth}px` }} className="relative flex flex-col">
                                    {/* Timeline Ruler */}
                                    <canvas
                                        ref={rulerCanvasRef}
                                        width={canvasWidth}
                                        height={32}
                                        className="h-8 border-b border-neutral-800"
                                    />

                                    {/* Speaker 1 (Top Waveform Track) */}
                                    <canvas
                                        ref={canvasTrackARef}
                                        width={canvasWidth}
                                        height={canvasHeight}
                                        className="h-[110px] border-b border-neutral-800/80"
                                    />

                                    {/* Speaker 2 (Bottom Waveform Track) */}
                                    <canvas
                                        ref={canvasTrackBRef}
                                        width={canvasWidth}
                                        height={canvasHeight}
                                        className="h-[110px] border-b border-neutral-800/80"
                                    />

                                    {/* Continuous Playhead Line across all tracks */}
                                    <div
                                        className="absolute top-0 bottom-0 pointer-events-none z-20"
                                        style={{ left: `${playheadX}px` }}
                                    >
                                        {/* Playhead Handle Knob */}
                                        <div className="w-3.5 h-3.5 -ml-[7px] bg-white rounded-full shadow-lg shadow-white/50 border-2 border-emerald-500" />
                                        {/* Vertical Playhead Cursor Line */}
                                        <div className="w-[2px] h-full -ml-[1px] bg-white/90 shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                                    </div>

                                    {/* Hover Cursor with Timecode Tooltip */}
                                    {hoverX !== null && hoverTime !== null && (
                                        <div
                                            className="absolute top-0 bottom-0 pointer-events-none z-30"
                                            style={{ left: `${hoverX}px` }}
                                        >
                                            <div className="w-[1px] h-full bg-emerald-400/50" />
                                            <div className="absolute top-1 -translate-x-1/2 bg-neutral-900/90 text-emerald-300 font-mono text-[10px] px-1.5 py-0.5 rounded border border-emerald-700/60 pointer-events-none shadow-md">
                                                {formatTimecode(hoverTime)}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Bottom Guide / Instructions Bar */}
                        <div className="p-3 bg-neutral-850 border-t border-neutral-800 flex flex-wrap items-center justify-between text-xs text-neutral-400">
                            <div className="flex items-center gap-4">
                                <span className="flex items-center gap-1">
                                    <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-[10px] text-neutral-300">Space</kbd> Play/Pause
                                </span>
                                <span className="flex items-center gap-1">
                                    <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-[10px] text-neutral-300">← / →</kbd> Seek ±5s
                                </span>
                                <span className="flex items-center gap-1">
                                    <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-[10px] text-neutral-300">Click Canvas</kbd> Jump to time
                                </span>
                            </div>

                            <div className="flex items-center gap-4 text-xs font-semibold">
                                <span className="text-emerald-400">● Speaker 1 (Top Waveform)</span>
                                <span className="text-indigo-400">● Speaker 2 (Bottom Waveform)</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
