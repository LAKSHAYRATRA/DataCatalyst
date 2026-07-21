import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUserInfo, setUserInfo } from "../lib/auth.js";
import { encodeWAV } from "../utils/wavBuilder.js";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
const MAX_SECONDS = 120; // 2 minutes
const MODE = import.meta.env.VITE_MODE; // "dev" or "prod"


/** Returns true if the device label looks like an external USB mic */
// function isUsbMic(label) {
//     const l = label.toLowerCase();
//     // Must have at least one positive signal
//     const positive = l.includes("usb") || l.includes("external") || l.includes("headset");
//     const negative = l.includes("built-in") || l.includes("internal");
//     return positive && !negative;
// }

function isUsbMic(label) {
    // TEMPORARILY DISABLED: User requested to remove external mic check for now
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

    // ─── Enumerate microphones ────────────────────────────────────────────────
    // async function loadMics(autoSelect = false) {
    //     try {
    //         // Temporary permission grant to read device labels
    //         const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
    //         tmp.getTracks().forEach((t) => t.stop());

    //         const devices = await navigator.mediaDevices.enumerateDevices();
    //         // In dev: show all mics. In production: USB/external only.
    //         const usbMics = devices
    //             .filter((d) => d.kind === "audioinput")
    //             .filter((d) => import.meta.env.DEV || isUsbMic(d.label || ""))
    //             .map((d) => ({
    //                 deviceId: d.deviceId,
    //                 label: d.label || `Microphone (${d.deviceId.slice(0, 8)}…)`,
    //             }));

    //         setMics(usbMics);

    //         if (autoSelect && usbMics.length > 0) {
    //             setSelectedMicId(usbMics[0].deviceId);
    //         }
    //     } catch {
    //         // Permission denied — we'll show the no-mic message
    //     }
    // }


    async function loadMics(autoSelect = false) {
        try {
            const tmp = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: 1 } });
            tmp.getTracks().forEach((t) => t.stop());

            const devices = await navigator.mediaDevices.enumerateDevices();

            const audioInputs = devices.filter((d) => d.kind === "audioinput");
            // console.log("audioInputs", audioInputs);
            // console.log("[IntroRecording] All detected audio inputs:", audioInputs.map(d => ({ deviceId: d.deviceId, label: d.label, kind: d.kind })));

            const filteredMics =
                MODE === "dev"
                    ? audioInputs
                    : audioInputs.filter((d) => isUsbMic(d.label || ""));

            const micList = filteredMics.map((d) => ({
                deviceId: d.deviceId,
                label: d.label || `Microphone (${d.deviceId.slice(0, 8)}…)`,
            }));

            setMics(micList);
            // console.log("[IntroRecording] Filtered mic list (shown to user):", micList);

            if (autoSelect && micList.length > 0) {
                setSelectedMicId(micList[0].deviceId);
            }

        } catch (err) {
            console.log("Mic permission denied");
        }
    }

    // useEffect(() => {
    //     loadMics(true);
    //     navigator.mediaDevices.addEventListener("devicechange", () => loadMics(false));
    //     return () => {
    //         navigator.mediaDevices.removeEventListener("devicechange", () => loadMics(false));
    //     };
    // }, []);

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

        const BAR_COUNT = 32;
        const GAP = 3;
        // Focus on voice-relevant frequency bins (~0-3 kHz at 48kHz sample rate).
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
            gradient.addColorStop(0, "#60a5fa");
            gradient.addColorStop(1, "#2563eb");
            ctx.fillStyle = gradient;

            for (let i = 0; i < BAR_COUNT; i++) {
                let sum = 0;
                for (let j = 0; j < binsPerBar; j++) sum += data[i * binsPerBar + j];
                const avg = sum / binsPerBar;
                const barH = Math.max(2, (avg / 255) * h * 1.3);
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

    // Label helper
    const selectedMicLabel = mics.find((m) => m.deviceId === selectedMicId)?.label
        ?? (mics[0]?.label || "Default Microphone");

    return (
        <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
            <div className="w-full max-w-lg animate-fade-in">

                {/* Brand */}
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-primary rounded-2xl mb-3 shadow-lg">
                        <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-neutral-900">Voice Introduction</h1>
                    <p className="text-neutral-500 text-sm mt-1">Record a short intro so our team can verify your account</p>
                </div>

                <div className="card animate-slide-up space-y-5">

                    {/* Rejection banner */}
                    {isRejected && (
                        <div className="bg-error-50 border border-error-200 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <svg className="w-5 h-5 text-error-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <div>
                                    <p className="font-semibold text-error-700 text-sm">Your previous recording was not approved</p>
                                    <p className="text-error-600 text-xs mt-2">Please record a new introduction below.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Mic Selector ─────────────────────────────────────────────── */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                            External USB Microphone
                        </label>

                        {mics.length > 0 ? (
                            <>
                                <div className="relative">
                                    <select
                                        value={selectedMicId}
                                        onChange={(e) => setSelectedMicId(e.target.value)}
                                        disabled={phase === "recording" || phase === "uploading"}
                                        className="input w-full pr-10 appearance-none cursor-pointer text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {mics.map((mic) => (
                                            <option key={mic.deviceId} value={mic.deviceId}>
                                                🎙 {mic.label}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                                        <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </div>
                                <p className="text-xs text-success-600 flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                    </svg>
                                    USB mic detected — ready to record
                                </p>
                            </>
                        ) : (
                            /* ── No USB mic found ── */
                            <div className="rounded-xl border-2 border-dashed border-warning-300 bg-warning-50 p-5 text-center space-y-3">
                                <div className="flex justify-center">
                                    <svg className="w-10 h-10 text-warning-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                                            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="font-semibold text-warning-800 text-sm">No external USB microphone detected</p>
                                    <p className="text-warning-700 text-xs mt-1">
                                        Please connect a USB microphone before recording your introduction.
                                    </p>
                                </div>
                                <button
                                    onClick={() => loadMics(true)}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-warning-600 hover:bg-warning-700 text-white text-sm font-semibold rounded-lg transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Refresh Devices
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Recording UI */}
                    {phase === "recording" && (
                        <div className="space-y-4">
                            <div className="flex flex-col items-center gap-3">
                                {/* Ring timer */}
                                <div className="relative w-28 h-28">
                                    <svg className="w-28 h-28 -rotate-90" viewBox="0 0 112 112">
                                        <circle cx="56" cy="56" r="48" fill="none" stroke="#eff6ff" strokeWidth="8" />
                                        <circle cx="56" cy="56" r="48" fill="none"
                                            stroke={secondsLeft < 15 ? "#ef4444" : "#6366f1"}
                                            strokeWidth="8" strokeLinecap="round"
                                            strokeDasharray={`${2 * Math.PI * 48}`}
                                            strokeDashoffset={`${2 * Math.PI * 48 * (1 - progress / 100)}`}
                                            className="transition-all duration-1000"
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className={`text-2xl font-bold font-mono ${secondsLeft < 15 ? "text-error-600 dark:text-error-400" : "text-neutral-800 dark:text-neutral-100"}`}>
                                            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
                                        </span>
                                        <span className="text-xs text-neutral-500 dark:text-neutral-400">remaining</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-full bg-error-500 animate-pulse" />
                                    <span className="text-sm font-medium text-neutral-700">
                                        Recording — {selectedMicLabel.length > 32 ? selectedMicLabel.slice(0, 32) + "…" : selectedMicLabel}
                                    </span>
                                </div>
                            </div>

                            {/* Voice activity bars */}
                            <canvas ref={canvasRef} width={400} height={64}
                                className="w-full h-16 rounded-lg bg-neutral-100/60 dark:bg-neutral-900/40" />

                            <button onClick={stopRecording}
                                className="btn w-full inline-flex items-center justify-center bg-error-600 hover:bg-error-700 text-white border-0 gap-2">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <rect x="6" y="6" width="12" height="12" rx="2" />
                                </svg>
                                Stop Recording
                            </button>
                        </div>
                    )}

                    {/* Preview UI */}
                    {phase === "preview" && audioBlobUrl && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-success-700 bg-success-50 border border-success-200 rounded-lg px-4 py-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-sm font-medium">Recording complete! Listen before submitting.</span>
                            </div>
                            <audio controls src={audioBlobUrl} controlsList="nodownload noplaybackrate" onContextMenu={(e) => e.preventDefault()} className="w-full" />
                            <div className="flex gap-3">
                                <button onClick={discardAndReRecord} className="btn btn-outline flex-1">↺ Re-record</button>
                                <button onClick={submitRecording} className="btn btn-primary flex-1">Submit →</button>
                            </div>
                        </div>
                    )}

                    {/* Uploading */}
                    {phase === "uploading" && (
                        <div className="flex flex-col items-center gap-4 py-6">
                            <svg className="animate-spin h-10 w-10 text-primary-500" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <p className="text-neutral-600 font-medium">Uploading your introduction…</p>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    {/* Consent checkboxes (idle phase only) */}
                    {phase === "idle" && (
                        <div className="space-y-2.5 rounded-lg bg-neutral-50 border border-neutral-200 p-4">
                            <label className="flex items-start gap-2.5 text-sm text-neutral-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={agreeTos}
                                    onChange={(e) => setAgreeTos(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span>
                                    I have read and agree to the{" "}
                                    <a href="/Legal/Voclara-ToS.html" target="_blank" rel="noopener noreferrer" className="text-primary-600 underline hover:text-primary-700">
                                        Terms of Service
                                    </a>.
                                </span>
                            </label>
                            <label className="flex items-start gap-2.5 text-sm text-neutral-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={agreePrivacy}
                                    onChange={(e) => setAgreePrivacy(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span>
                                    I have read and agree to the{" "}
                                    <a href="/Legal/Voclara-Privacy-Policy.html" target="_blank" rel="noopener noreferrer" className="text-primary-600 underline hover:text-primary-700">
                                        Privacy Policy
                                    </a>.
                                </span>
                            </label>
                            <label className="flex items-start gap-2.5 text-sm text-neutral-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={agreeSample}
                                    onChange={(e) => setAgreeSample(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span>
                                    I consent to submitting my voice sample. I understand it will be used <strong>solely</strong> for approval assessment, will <strong>not</strong> be sold, licensed, or used to train AI models, and will be deleted within 180 days of upload (sooner if my account is rejected).
                                </span>
                            </label>
                        </div>
                    )}

                    {/* Start button (idle) */}
                    {phase === "idle" && (
                        <button
                            onClick={startRecording}
                            disabled={mics.length === 0 || !allConsentGiven}
                            className="btn btn-primary w-full inline-flex items-center justify-center gap-2 text-base py-3 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {mics.length > 0 && allConsentGiven && (
                                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                </svg>
                            )}
                            <span className="whitespace-nowrap">
                                {mics.length === 0
                                    ? "Connect a USB Mic to Continue"
                                    : !allConsentGiven
                                        ? "Tick agreements to continue"
                                        : "Start Recording"}
                            </span>
                        </button>
                    )}
                </div>

                <div className="mt-6 text-center text-xs text-neutral-400">
                    Your recording is only reviewed by our admin team and is kept private.
                </div>
            </div>
        </div>
    );
}
