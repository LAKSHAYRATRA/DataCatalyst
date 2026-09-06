import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUserInfo, setUserInfo, clearToken } from "../lib/auth.js";
import { encodeWAV } from "../utils/wavBuilder.js";
import {
    Mic,
    MicOff,
    Square,
    RotateCcw,
    Send,
    Loader2,
    CheckCircle2,
    AlertTriangle,
    ChevronDown,
    RefreshCw,
    LogOut,
    Radio,
    Sparkles
} from "lucide-react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
const MAX_SECONDS = 120; // 2 minutes
const MODE = import.meta.env.VITE_MODE; // "dev" or "prod"

function isUsbMic(label) {
    // External mic check (temporarily permissive per configuration)
    return true;
}

export default function IntroRecording() {
    const navigate = useNavigate();
    const userInfo = getUserInfo();

    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const streamRef = useRef(null);
    const canvasRef = useRef(null);
    const animFrameRef = useRef(null);
    const analyserRef = useRef(null);
    const audioCtxRef = useRef(null);
    const workletNodeRef = useRef(null);

    const [phase, setPhase] = useState("idle"); // idle | recording | preview | uploading
    const [secondsLeft, setSecondsLeft] = useState(MAX_SECONDS);
    const [audioBlobUrl, setAudioBlobUrl] = useState(null);
    const [audioBlob, setAudioBlob] = useState(null);
    const [error, setError] = useState("");

    // Mic device list
    const [mics, setMics] = useState([]); // [{ deviceId, label }]
    const [selectedMicId, setSelectedMicId] = useState(""); // "" = browser default

    // Consent (must be re-affirmed each time — including on re-record after rejection)
    const [agreeTos, setAgreeTos] = useState(false);
    const [agreePrivacy, setAgreePrivacy] = useState(false);
    const [agreeSample, setAgreeSample] = useState(false);
    const allConsentGiven = agreeTos && agreePrivacy && agreeSample;

    const isRejected = userInfo?.accountStatus === "rejected";
    const rejectionReason = userInfo?.rejectionReason || null;

    const handleLogout = async () => {
        clearInterval(timerRef.current);
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
        await clearToken();
        navigate("/login", { replace: true });
    };

    // ─── Enumerate microphones ────────────────────────────────────────────────
    async function loadMics(autoSelect = false) {
        try {
            if (window.voclaraRecorder?.isNative && window.voclaraRecorder?.getDevices) {
                try {
                    const nativeDevs = await window.voclaraRecorder.getDevices();
                    if (nativeDevs && nativeDevs.length > 0) {
                        const nativeMicList = nativeDevs.map(d => ({
                            deviceId: String(d.id),
                            label: d.name || `Microphone ${d.id}`
                        }));
                        setMics(nativeMicList);
                        if (autoSelect && nativeMicList.length > 0) {
                            setSelectedMicId(nativeMicList[0].deviceId);
                        }
                        return;
                    }
                } catch (e) {
                    console.warn("Native WASAPI device query error, falling back to WebRTC:", e);
                }
            }

            let tmp;
            try {
                tmp = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 }, sampleRate: { ideal: 48000 } } });
            } catch (e) {
                tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            tmp.getTracks().forEach((t) => t.stop());

            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter((d) => d.kind === "audioinput");

            const filteredMics =
                MODE === "dev"
                    ? audioInputs
                    : audioInputs.filter((d) => isUsbMic(d.label || ""));

            const micList = filteredMics.map((d) => ({
                deviceId: d.deviceId,
                label: d.label || `Microphone (${d.deviceId.slice(0, 8)}…)`,
            }));

            setMics(micList);

            if (autoSelect && micList.length > 0) {
                setSelectedMicId(micList[0].deviceId);
            }
        } catch (err) {
            console.log("Mic permission denied:", err);
        }
    }

    useEffect(() => {
        loadMics(true);

        const handleDeviceChange = async () => {
            const oldSelected = selectedMicId;
            await loadMics(false);

            // Auto select USB if connected
            if (MODE !== "dev") {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const usb = devices.find(
                    (d) => d.kind === "audioinput" && isUsbMic(d.label || "")
                );

                if (usb && usb.deviceId !== oldSelected) {
                    setSelectedMicId(usb.deviceId);
                }
            }
        };

        navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

        return () => {
            navigator.mediaDevices.removeEventListener(
                "devicechange",
                handleDeviceChange
            );
        };
    }, []);

    // ─── Voice-activity frequency bars ────────────────────────────────────────
    function drawWaveform() {
        const canvas = canvasRef.current;
        const analyser = analyserRef.current;
        if (!canvas || !analyser) return;
        const ctx = canvas.getContext("2d");
        const data = new Uint8Array(analyser.frequencyBinCount);

        const BAR_COUNT = 36;
        const GAP = 3;
        const VOICE_BIN_RANGE = 128;
        const binsPerBar = Math.floor(VOICE_BIN_RANGE / BAR_COUNT);

        function draw() {
            animFrameRef.current = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(data);

            const w = canvas.width;
            const h = canvas.height;
            ctx.clearRect(0, 0, w, h);

            const barW = (w - GAP * (BAR_COUNT - 1)) / BAR_COUNT;
            const gradient = ctx.createLinearGradient(0, 0, 0, h);
            gradient.addColorStop(0, "#a855f7"); // purple
            gradient.addColorStop(0.5, "#6366f1"); // indigo
            gradient.addColorStop(1, "#3b82f6"); // blue
            ctx.fillStyle = gradient;

            for (let i = 0; i < BAR_COUNT; i++) {
                let sum = 0;
                for (let j = 0; j < binsPerBar; j++) sum += data[i * binsPerBar + j];
                const avg = sum / binsPerBar;
                const barH = Math.max(3, (avg / 255) * h * 1.3);
                const x = i * (barW + GAP);
                const y = h - barH;
                const r = Math.min(barW / 2, 4);
                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(x, y, barW, barH, r);
                    ctx.fill();
                } else {
                    ctx.fillRect(x, y, barW, barH);
                }
            }
        }
        draw();
    }

    // ─── Recording ────────────────────────────────────────────────────────────
    async function startRecording() {
        setError("");
        try {
            const audioConstraints = {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                sampleRate: 48000,
                channelCount: 1,
                ...(selectedMicId ? { deviceId: { exact: selectedMicId } } : {})
            };

            const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
            streamRef.current = stream;

            const audioCtx = new AudioContext({ sampleRate: 48000 });
            audioCtxRef.current = audioCtx;
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            analyserRef.current = analyser;

            await audioCtx.audioWorklet.addModule("/pcm-worklet.js");
            const workletNode = new AudioWorkletNode(audioCtx, "pcm-processor");
            workletNodeRef.current = workletNode;

            chunksRef.current = [];
            workletNode.port.onmessage = (e) => {
                chunksRef.current.push(new Float32Array(e.data));
            };

            const gain = audioCtx.createGain();
            gain.gain.value = 0;
            source.connect(workletNode);
            workletNode.connect(gain);
            gain.connect(audioCtx.destination);

            setPhase("recording");
            setSecondsLeft(MAX_SECONDS);
            animFrameRef.current = requestAnimationFrame(() => drawWaveform());

            timerRef.current = setInterval(() => {
                setSecondsLeft((s) => {
                    if (s <= 1) { stopRecording(); return 0; }
                    return s - 1;
                });
            }, 1000);
        } catch (e) {
            if (e.name === "OverconstrainedError" || e.name === "NotFoundError") {
                setError("The selected microphone is not available. Please choose another mic and try again.");
            } else {
                setError("Microphone access denied. Please allow microphone access and try again.");
            }
        }
    }

    function stopRecording() {
        if (workletNodeRef.current) {
            workletNodeRef.current.disconnect();
            workletNodeRef.current = null;
        }
        if (audioCtxRef.current) {
            audioCtxRef.current.close();
            audioCtxRef.current = null;
        }

        let totalLength = 0;
        for (const arr of chunksRef.current) totalLength += arr.length;
        const combined = new Float32Array(totalLength);
        let offset = 0;
        for (const arr of chunksRef.current) {
            combined.set(arr, offset);
            offset += arr.length;
        }

        const wavBlob = encodeWAV(combined, 48000, 1);
        setAudioBlob(wavBlob);
        setAudioBlobUrl(URL.createObjectURL(wavBlob));
        setPhase("preview");

        clearInterval(timerRef.current);
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    }

    function discardAndReRecord() {
        setPhase("idle");
        setAudioBlobUrl(null);
        setAudioBlob(null);
        setError("");
    }

    async function submitRecording() {
        if (!audioBlob) return;
        setPhase("uploading");
        setError("");
        try {
            const formData = new FormData();
            formData.append("recording", audioBlob, `intro.wav`);
            formData.append("consent_tos", "true");
            formData.append("consent_privacy", "true");
            formData.append("consent_sample", "true");
            formData.append("consent_timestamp", new Date().toISOString());

            const res = await fetch(`${BACKEND_URL}/api/user/intro-recording`, {
                method: "POST",
                credentials: "include",
                headers: {
                    ...(localStorage.getItem("vc_token") ? { "Authorization": `Bearer ${localStorage.getItem("vc_token")}` } : {})
                },
                body: formData,
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Upload failed");

            const current = getUserInfo();
            if (current) setUserInfo({ ...current, accountStatus: "pending_approval" });
            navigate("/pending-approval");
        } catch (e) {
            setError(e.message || "Upload failed. Please try again.");
            setPhase("preview");
        }
    }

    useEffect(() => {
        return () => {
            clearInterval(timerRef.current);
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
            if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
        };
    }, []);

    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    const progress = ((MAX_SECONDS - secondsLeft) / MAX_SECONDS) * 100;

    const selectedMicLabel = mics.find((m) => m.deviceId === selectedMicId)?.label
        ?? (mics[0]?.label || "Default Microphone");

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-primary-500 selection:text-white relative overflow-hidden">
            {/* Background Ambient Glows */}
            <div className="absolute top-0 right-1/4 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-1/4 -left-32 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

            {/* Top Navigation Bar */}
            <header className="bg-neutral-900/80 border-b border-neutral-800 sticky top-0 z-30 backdrop-blur-md">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center p-1 shadow-md shadow-black/40">
                            <img src="/logo.png" alt="Voclara Logo" className="w-7 h-7 object-contain" />
                        </div>
                        <div>
                            <span className="font-extrabold text-white text-base tracking-tight">Voclara</span>
                            <span className="text-[11px] text-neutral-400 block -mt-0.5">Voice Verification</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {userInfo?.email && (
                            <span className="text-xs text-neutral-400 hidden sm:inline font-mono">{userInfo.email}</span>
                        )}
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold transition-colors"
                        >
                            <LogOut className="w-3.5 h-3.5" />
                            Sign Out
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 max-w-xl mx-auto px-4 py-8 w-full relative z-10 flex flex-col justify-center">
                <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl animate-slide-up space-y-6">

                    {/* Agency partner badge if contributor belongs to a vendor */}
                    {userInfo?.vendorCode && (
                        <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl flex items-center justify-between text-xs text-purple-200">
                            <span className="font-medium">
                                Agency Partner: <strong className="font-mono font-bold text-purple-300">{userInfo.vendorCode}</strong>
                            </span>
                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-500/30">
                                Direct Contributor
                            </span>
                        </div>
                    )}

                    {/* Header */}
                    <div className="text-center space-y-2">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-primary-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-primary-500/25 mx-auto mb-3">
                            <Mic className="w-7 h-7 text-white" />
                        </div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">Voice Introduction</h1>
                        <p className="text-neutral-400 text-xs sm:text-sm max-w-sm mx-auto">
                            Record a brief voice sample (up to 2 minutes) so our verification team can evaluate your audio clarity.
                        </p>
                    </div>

                    {/* Rejection notice */}
                    {isRejected && (
                        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs animate-scale-in">
                            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="font-semibold text-rose-200 text-sm">Previous Recording Not Approved</p>
                                {rejectionReason && (
                                    <p className="font-mono text-[11px] bg-rose-950/50 p-2 rounded-lg border border-rose-500/20 text-rose-200">
                                        Reason: {rejectionReason}
                                    </p>
                                )}
                                <p className="text-rose-300/80">Please re-record your voice sample using an external microphone with minimal background noise.</p>
                            </div>
                        </div>
                    )}

                    {/* Mic Selector */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Radio className="w-3.5 h-3.5 text-primary-400" />
                            Audio Input Device
                        </label>

                        {mics.length > 0 ? (
                            <>
                                <div className="relative">
                                    <select
                                        value={selectedMicId}
                                        onChange={(e) => setSelectedMicId(e.target.value)}
                                        disabled={phase === "recording" || phase === "uploading"}
                                        className="w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-white focus:outline-none focus:border-primary-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed pr-10 appearance-none transition-all"
                                    >
                                        {mics.map((mic) => (
                                            <option key={mic.deviceId} value={mic.deviceId} className="bg-neutral-900 text-white">
                                                🎙 {mic.label}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                                </div>
                                <p className="text-xs text-emerald-400 flex items-center gap-1.5 font-medium">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Microphone ready for capture (48kHz Mono)
                                </p>
                            </>
                        ) : (
                            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-center space-y-3">
                                <div className="flex justify-center">
                                    <MicOff className="w-8 h-8 text-amber-400" />
                                </div>
                                <div>
                                    <p className="font-semibold text-amber-200 text-sm">No Microphone Detected</p>
                                    <p className="text-amber-300/80 text-xs mt-1">
                                        Please connect your microphone or grant browser microphone permissions.
                                    </p>
                                </div>
                                <button
                                    onClick={() => loadMics(true)}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600/90 hover:bg-amber-600 text-white text-xs font-semibold rounded-xl transition-all shadow-md"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    Refresh Devices
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Recording in Progress UI */}
                    {phase === "recording" && (
                        <div className="space-y-4 pt-2">
                            <div className="flex flex-col items-center gap-3">
                                {/* Ring timer */}
                                <div className="relative w-28 h-28">
                                    <svg className="w-28 h-28 -rotate-90" viewBox="0 0 112 112">
                                        <circle cx="56" cy="56" r="48" fill="none" stroke="#262626" strokeWidth="8" />
                                        <circle cx="56" cy="56" r="48" fill="none"
                                            stroke={secondsLeft < 15 ? "#f43f5e" : "#6366f1"}
                                            strokeWidth="8" strokeLinecap="round"
                                            strokeDasharray={`${2 * Math.PI * 48}`}
                                            strokeDashoffset={`${2 * Math.PI * 48 * (1 - progress / 100)}`}
                                            className="transition-all duration-1000"
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className={`text-2xl font-bold font-mono ${secondsLeft < 15 ? "text-rose-400" : "text-white"}`}>
                                            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
                                        </span>
                                        <span className="text-[10px] text-neutral-400 uppercase tracking-wider">remaining</span>
                                    </div>
                                </div>

                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
                                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                                    <span>Recording Active — {selectedMicLabel.length > 28 ? selectedMicLabel.slice(0, 28) + "…" : selectedMicLabel}</span>
                                </div>
                            </div>

                            {/* Voice activity waveform */}
                            <div className="rounded-2xl bg-neutral-950 border border-neutral-800 p-2 shadow-inner">
                                <canvas ref={canvasRef} width={400} height={64} className="w-full h-16 rounded-xl" />
                            </div>

                            <button
                                onClick={stopRecording}
                                className="w-full py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl shadow-lg shadow-rose-600/30 transition-all flex items-center justify-center gap-2 text-sm"
                            >
                                <Square className="w-4 h-4 fill-current" />
                                Stop Recording
                            </button>
                        </div>
                    )}

                    {/* Preview State UI */}
                    {phase === "preview" && audioBlobUrl && (
                        <div className="space-y-4 pt-2">
                            <div className="flex items-center gap-2 text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 text-xs font-medium">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                <span>Recording captured successfully! Listen below to verify audio clarity before submitting.</span>
                            </div>

                            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-3 shadow-inner">
                                <audio controls src={audioBlobUrl} controlsList="nodownload noplaybackrate" onContextMenu={(e) => e.preventDefault()} className="w-full" />
                            </div>

                            <div className="flex gap-3 pt-1">
                                <button
                                    onClick={discardAndReRecord}
                                    className="flex-1 py-3 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 font-semibold rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center gap-2"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    Re-record
                                </button>
                                <button
                                    onClick={submitRecording}
                                    className="flex-1 py-3 px-4 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white font-semibold rounded-xl text-xs sm:text-sm transition-all shadow-lg shadow-primary-500/25 flex items-center justify-center gap-2"
                                >
                                    <Send className="w-4 h-4" />
                                    Submit Introduction
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Uploading State UI */}
                    {phase === "uploading" && (
                        <div className="flex flex-col items-center justify-center gap-3 py-8">
                            <Loader2 className="w-10 h-10 text-primary-400 animate-spin" />
                            <p className="text-white font-medium text-sm">Uploading your voice introduction…</p>
                            <p className="text-neutral-500 text-xs">Please do not close this browser window</p>
                        </div>
                    )}

                    {/* Error Display */}
                    {error && (
                        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs font-medium animate-scale-in">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Consent Checkboxes (idle phase only) */}
                    {phase === "idle" && (
                        <div className="space-y-3 rounded-2xl bg-neutral-950/80 border border-neutral-800/80 p-4 text-xs text-neutral-300">
                            <label className="flex items-start gap-2.5 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={agreeTos}
                                    onChange={(e) => setAgreeTos(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 shrink-0 rounded bg-neutral-900 border-neutral-700 text-primary-600 focus:ring-primary-500/40 focus:ring-offset-neutral-900 cursor-pointer"
                                />
                                <span>
                                    I have read and agree to the{" "}
                                    <a href="/Legal/Voclara-ToS.html" target="_blank" rel="noopener noreferrer" className="text-primary-400 underline hover:text-primary-300">
                                        Terms of Service
                                    </a>.
                                </span>
                            </label>
                            <label className="flex items-start gap-2.5 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={agreePrivacy}
                                    onChange={(e) => setAgreePrivacy(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 shrink-0 rounded bg-neutral-900 border-neutral-700 text-primary-600 focus:ring-primary-500/40 focus:ring-offset-neutral-900 cursor-pointer"
                                />
                                <span>
                                    I have read and agree to the{" "}
                                    <a href="/Legal/Voclara-Privacy-Policy.html" target="_blank" rel="noopener noreferrer" className="text-primary-400 underline hover:text-primary-300">
                                        Privacy Policy
                                    </a>.
                                </span>
                            </label>
                            <label className="flex items-start gap-2.5 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={agreeSample}
                                    onChange={(e) => setAgreeSample(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 shrink-0 rounded bg-neutral-900 border-neutral-700 text-primary-600 focus:ring-primary-500/40 focus:ring-offset-neutral-900 cursor-pointer"
                                />
                                <span className="leading-relaxed text-neutral-400">
                                    I consent to submitting my voice sample. I understand it will be used <strong className="text-neutral-200">solely</strong> for approval assessment, will <strong className="text-neutral-200">not</strong> be sold, licensed, or used to train AI models, and will be deleted within 180 days of upload.
                                </span>
                            </label>
                        </div>
                    )}

                    {/* Start Button (idle) */}
                    {phase === "idle" && (
                        <button
                            onClick={startRecording}
                            disabled={mics.length === 0 || !allConsentGiven}
                            className="w-full py-3.5 px-4 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-primary-500/25 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Mic className="w-4 h-4 shrink-0" />
                            <span className="whitespace-nowrap">
                                {mics.length === 0
                                    ? "Connect a Microphone to Continue"
                                    : !allConsentGiven
                                        ? "Accept all agreements to continue"
                                        : "Start Voice Recording"}
                            </span>
                        </button>
                    )}
                </div>

                <div className="mt-6 text-center text-xs text-neutral-500">
                    Your recording is only reviewed by our team and kept secure.
                </div>
            </main>
        </div>
    );
}
