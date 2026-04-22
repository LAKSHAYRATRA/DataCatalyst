import React, { useState, useRef, useEffect } from 'react';
import AudioVisualizer from '../../AudioVisualizer';
import { analyzeNoiseYAMNet } from '../../../utils/yamnetAnalysis';
import { encodeWAV } from '../../../utils/wavBuilder';

const PHRASE = "A purple pig and a green donkey flew a kite in the middle of the night";

const MicState = {
    IDLE: 'idle',
    RECORDING: 'recording',
    PROCESSING: 'processing',
    RESULT: 'result',
};

// ── USB-mic heuristic (same logic as IntroRecording) ──────────────────────────
function isUsbMic(label) {
    const l = label.toLowerCase();
    if (l.includes("built-in") || l.includes("internal") || l.includes("default")) return false;
    return (
        l.includes("usb") ||
        l.includes("external") ||
        l.includes("headset") ||
        l.includes("condenser") ||
        l.includes("yeti") ||
        l.includes("rode") ||
        l.includes("blue") ||
        l.includes("samson")
    );
}

async function getUsbMics() {
    // Request permission so labels become visible
    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: 1 } });
    tempStream.getTracks().forEach((t) => t.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((d) => d.kind === "audioinput");

    // In dev: show all; in production: USB/external only
    return audioInputs
        .filter((d) => import.meta.env.DEV || isUsbMic(d.label || ""))
        .map((d) => ({ deviceId: d.deviceId, label: d.label || `Microphone (${d.deviceId.slice(0, 8)})` }));
}

export default function MicrophoneTest({ onSuccess }) {
    const [mics, setMics] = useState(null);   // null = loading
    const [selectedMicId, setSelectedMicId] = useState(null);
    const [micState, setMicState] = useState(MicState.IDLE);
    const [micTimer, setMicTimer] = useState(10);
    const [noiseResult, setNoiseResult] = useState(null);
    const [loadError, setLoadError] = useState(null);

    const audioCtxRef = useRef(null);
    const workletNodeRef = useRef(null);
    const streamRef = useRef(null);
    const audioChunksRef = useRef([]);
    const timerIntervalRef = useRef(null);

    useEffect(() => {
        loadMics();
    }, []);

    const loadMics = async () => {
        setMics(null);
        setLoadError(null);
        try {
            const found = await getUsbMics();
            setMics(found);
            if (found.length > 0) setSelectedMicId(found[0].deviceId);
        } catch (err) {
            console.error("Mic enumeration failed:", err);
            setLoadError(err?.message || "Permission denied");
            setMics([]);
        }
    };

    const startRecording = async () => {
        try {
            const constraints = {
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: 48000,
                    channelCount: 1,
                    ...(selectedMicId ? { deviceId: { exact: selectedMicId } } : {})
                }
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;

            const audioCtx = new AudioContext({ sampleRate: 48000 });
            audioCtxRef.current = audioCtx;
            await audioCtx.audioWorklet.addModule("/pcm-worklet.js");
            
            const source = audioCtx.createMediaStreamSource(stream);
            const workletNode = new AudioWorkletNode(audioCtx, "pcm-processor");
            workletNodeRef.current = workletNode;
            
            audioChunksRef.current = [];
            workletNode.port.onmessage = (e) => {
                audioChunksRef.current.push(new Int16Array(e.data));
            };
            
            const gain = audioCtx.createGain();
            gain.gain.value = 0;
            source.connect(workletNode);
            workletNode.connect(gain);
            gain.connect(audioCtx.destination);

            setMicState(MicState.RECORDING);
            setMicTimer(10);

            timerIntervalRef.current = setInterval(() => {
                setMicTimer((prev) => {
                    if (prev <= 1) {
                        clearInterval(timerIntervalRef.current);
                        stopRecording();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

        } catch (err) {
            console.error("Error accessing microphone:", err);
            alert("Could not access the selected microphone. Please check your device.");
        }
    };

    const stopRecording = () => {
        setMicState(MicState.PROCESSING);
        clearInterval(timerIntervalRef.current);

        if (workletNodeRef.current) {
            workletNodeRef.current.disconnect();
            workletNodeRef.current = null;
        }
        if (audioCtxRef.current) {
            audioCtxRef.current.close();
            audioCtxRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }

        let totalLength = 0;
        for (const arr of audioChunksRef.current) totalLength += arr.length;
        const combined = new Int16Array(totalLength);
        let offset = 0;
        for (const arr of audioChunksRef.current) {
            combined.set(arr, offset);
            offset += arr.length;
        }

        const audioBlob = encodeWAV(combined, 48000, 1);
        processAudio(audioBlob);
    };

    // Analyze noise entirely in the browser — no server call needed
    const processAudio = async (blob) => {
        try {
            const result = await analyzeNoiseYAMNet(blob);
            setNoiseResult(result);
            setMicState(MicState.RESULT);
        } catch (err) {
            console.error('Client-side noise analysis failed:', err);
            setMicState(MicState.IDLE);
            alert('Noise check failed. Please try again.');
        }
    };

    const resetMicTest = () => {
        setNoiseResult(null);
        setMicState(MicState.IDLE);
        setMicTimer(10);
    };

    // ── Loading ───────────────────────────────────────────────────────────────
    if (mics === null) {
        return (
            <div className="py-12 animate-slide-up w-full flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                <p className="text-neutral-500 text-sm">Checking for USB microphone…</p>
            </div>
        );
    }

    // ── No USB mic found (production) ─────────────────────────────────────────
    if (mics.length === 0) {
        return (
            <div className="py-12 animate-slide-up w-full">
                <div className="text-center mb-8">
                    <h3 className="text-3xl font-bold text-neutral-900 mb-3">Microphone Test</h3>
                </div>
                <div className="rounded-xl border-2 border-dashed border-warning-300 bg-warning-50 p-8 text-center space-y-4 max-w-md mx-auto">
                    <div className="flex justify-center">
                        <svg className="w-14 h-14 text-warning-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                    </div>
                    <div>
                        <p className="font-semibold text-warning-800 text-base">No external USB microphone detected</p>
                        <p className="text-warning-700 text-sm mt-1">
                            {loadError
                                ? `Error: ${loadError}`
                                : "Please connect a USB microphone before running the system check."}
                        </p>
                    </div>
                    <button
                        onClick={loadMics}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-warning-600 hover:bg-warning-700 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh Devices
                    </button>
                </div>
            </div>
        );
    }

    // ── Main test UI ─────────────────────────────────────────────────────────
    return (
        <div className="py-12 animate-slide-up w-full">
            <div className="text-center mb-8">
                <h3 className="text-3xl font-bold text-neutral-900 mb-3">Microphone Test</h3>
                <p className="text-lg text-neutral-600">Read the phrase below out loud so we can check for background noise</p>
            </div>

            {/* Mic selector */}
            {mics.length > 1 && micState === MicState.IDLE && (
                <div className="max-w-md mx-auto mb-6 space-y-1">
                    <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                        Select Microphone
                    </label>
                    <div className="relative">
                        <select
                            value={selectedMicId || ""}
                            onChange={(e) => setSelectedMicId(e.target.value)}
                            className="input w-full pr-10 appearance-none cursor-pointer text-sm"
                        >
                            {mics.map((m) => (
                                <option key={m.deviceId} value={m.deviceId}>🎙 {m.label}</option>
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
                        USB mic ready
                    </p>
                </div>
            )}

            {/* Single mic label (no dropdown needed) */}
            {mics.length === 1 && micState === MicState.IDLE && (
                <div className="max-w-md mx-auto mb-6">
                    <p className="text-xs text-success-600 flex items-center gap-1 justify-center">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        🎙 {mics[0].label} — USB mic ready
                    </p>
                </div>
            )}

            <div className="space-y-6">
                {/* Phrase card */}
                <div className="bg-neutral-900 p-8 rounded-xl text-center relative">
                    <p className="text-xs uppercase tracking-widest text-neutral-400 mb-3 font-semibold">Read this phrase aloud</p>
                    <p className="text-xl md:text-2xl font-serif italic text-white leading-relaxed">
                        "{PHRASE}"
                    </p>
                    {micState === MicState.IDLE && (
                        <p className="text-neutral-400 text-sm mt-4">
                            Press <span className="text-primary-400 font-semibold">Start Recording</span>, speak clearly, then stop.
                        </p>
                    )}
                </div>

                <div className="flex flex-col items-center space-y-4">
                    {micState === MicState.IDLE && (
                        <button onClick={startRecording} className="btn btn-primary">
                            <svg className="w-5 h-5 mr-2 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                            Start Recording
                        </button>
                    )}

                    {micState === MicState.RECORDING && (
                        <div className="flex flex-col items-center space-y-4">
                            <AudioVisualizer isRecording={true} />
                            <div
                                className="w-24 h-24 bg-error-500 rounded-full flex items-center justify-center shadow-lg animate-pulse cursor-pointer"
                                onClick={stopRecording}
                                title="Stop early"
                            >
                                <span className="text-white text-3xl font-bold">{micTimer}</span>
                            </div>
                            <p className="text-xs text-neutral-400">Tap the timer to stop early</p>
                        </div>
                    )}

                    {micState === MicState.PROCESSING && (
                        <div className="flex flex-col items-center space-y-4">
                            <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                            <p className="text-primary-600 font-semibold text-lg animate-pulse">Analyzing background noise…</p>
                        </div>
                    )}

                    {micState === MicState.RESULT && noiseResult && (
                        <div className="w-full max-w-md animate-scale-in">
                            {noiseResult.hasNoise ? (
                                /* ── Noisy result ─────────────────────────────────────────── */
                                <div className="card border-error-200 bg-error-50">
                                    <div className="flex items-start space-x-4 mb-4">
                                        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-error-500 flex-shrink-0">
                                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v4m0 4h.01M10.29 3.86l-7.5 13A1 1 0 003.66 18h16.68a1 1 0 00.87-1.5l-7.5-13a1 1 0 00-1.74 0z" />
                                            </svg>
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="text-lg font-bold text-error-800">Background Noise Detected</h4>
                                            <p className="text-sm text-neutral-600 mt-1">
                                                {noiseResult.label || "Your environment is too noisy for a call."}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="bg-error-100 rounded-lg p-4 text-sm text-error-800">
                                        <p className="font-semibold mb-1">💡 What to try:</p>
                                        <ul className="list-disc list-inside space-y-1 text-error-700">
                                            <li>Move to a quieter room</li>
                                            <li>Turn off fans, TVs, or music</li>
                                            <li>Close windows facing traffic</li>
                                        </ul>
                                    </div>
                                    <div className="mt-4">
                                        <button onClick={resetMicTest} className="btn btn-primary w-full">
                                            Try Again
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* ── Clean result ─────────────────────────────────────────── */
                                <div className="card border-success-200 bg-success-50">
                                    <div className="flex items-start space-x-4 mb-4">
                                        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-success-500 flex-shrink-0">
                                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="text-lg font-bold text-success-800">
                                                {noiseResult.fallback ? 'Check Skipped' : 'Environment Sounds Clear!'}
                                            </h4>
                                            <p className="text-sm text-neutral-600 mt-1">
                                                {noiseResult.fallback
                                                    ? 'YAMNet analysis unavailable — you may proceed.'
                                                    : 'No significant background noise detected. You\'re good to go!'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-4 flex gap-3">
                                        <button onClick={resetMicTest} className="btn btn-secondary flex-1">
                                            Try Again
                                        </button>
                                        <button onClick={onSuccess} className="btn btn-success flex-1">
                                            Continue →
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
