import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "../components/Nav.jsx";
import { apiGet } from "../lib/api.js";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
const MAX_SEC = 120; // 2 minutes

export default function LanguageApply() {
    const navigate = useNavigate();
    const [languages, setLanguages] = useState([]);
    const [myApps, setMyApps] = useState([]);
    const [selected, setSelected] = useState(null);
    const [phase, setPhase] = useState("select"); // select | record | done
    const [recording, setRecording] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(MAX_SEC);
    const [audioBlob, setAudioBlob] = useState(null);
    const [audioUrl, setAudioUrl] = useState(null);
    const [loading, setLoading] = useState(false);
    const [pageLoading, setPageLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);

    useEffect(() => { load(); }, []);

    async function load() {
        setPageLoading(true);
        try {
            const [langsRes, appsRes] = await Promise.all([
                apiGet("/api/languages"),
                apiGet("/api/language-applications/my"),
            ]);
            setLanguages(langsRes.languages || []);
            setMyApps(appsRes.applications || []);
        } catch (e) {
            setError("Failed to load languages.");
        } finally {
            setPageLoading(false);
        }
    }

    function getStatus(code) {
        return myApps.find(a => a.languageCode === code)?.status || null;
    }

    function canApply(code) {
        const st = getStatus(code);
        return st === null || st === "rejected";
    }

    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: 1 } });
            chunksRef.current = [];
            const mr = new MediaRecorder(stream, { audioBitsPerSecond: 128000 });
            mediaRecorderRef.current = mr;
            mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            mr.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: "audio/webm" });
                setAudioBlob(blob);
                setAudioUrl(URL.createObjectURL(blob));
                stream.getTracks().forEach(t => t.stop());
            };
            mr.start();
            setRecording(true);
            setSecondsLeft(MAX_SEC);

            let secs = MAX_SEC;
            timerRef.current = setInterval(() => {
                secs--;
                setSecondsLeft(secs);
                if (secs <= 0) stopRecording();
            }, 1000);
        } catch {
            setError("Microphone access denied. Please allow microphone and try again.");
        }
    }

    function stopRecording() {
        clearInterval(timerRef.current);
        mediaRecorderRef.current?.stop();
        setRecording(false);
    }

    async function submit() {
        if (!audioBlob || !selected) return;
        setLoading(true);
        setError("");
        try {
            const form = new FormData();
            form.append("languageCode", selected.code);
            form.append("recording", audioBlob, `lang_${selected.code}.webm`);
            const res = await fetch(`${BACKEND}/api/language-applications`, {
                method: "POST", body: form, credentials: "include",
            });
            const data = await res.json();
            if (!res.ok) {
                if (data.error === "already_pending") throw new Error("You already have a pending application for this language.");
                if (data.error === "already_approved") throw new Error("You're already approved for this language!");
                throw new Error(data.error || "Upload failed");
            }
            setSuccess(`Your ${selected.name} application has been submitted! An admin will review it soon.`);
            setPhase("done");
            load();
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

    const statusBadge = (code) => {
        const st = getStatus(code);
        if (!st) return null;
        const cfg = {
            approved: "bg-success-100 text-success-700",
            pending: "bg-warning-100 text-warning-700",
            rejected: "bg-error-100 text-error-700",
        };
        const icon = st === "approved" ? "✓" : st === "pending" ? "⏳" : "✗";
        return (
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg[st]}`}>
                {icon} {st.charAt(0).toUpperCase() + st.slice(1)}
            </span>
        );
    };

    return (
        <div className="min-h-screen bg-gradient-subtle pt-16 md:pt-0 md:pl-64">
            <Nav />
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12">

                {/* Header */}
                <div className="mb-8 animate-fade-in">
                    <button
                        onClick={() => navigate("/call")}
                        className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium mb-4 transition-colors"
                    >
                        ← Back to Call
                    </button>
                    <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-2">Apply for a Language</h1>
                    <p className="text-neutral-600">Record a 2‑minute sample to demonstrate your fluency. An admin will review and approve your application.</p>
                </div>

                {/* Alerts */}
                {error && (
                    <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-xl mb-5 flex justify-between items-start animate-fade-in">
                        <span>{error}</span>
                        <button onClick={() => setError("")} className="ml-3 text-error-500 hover:text-error-700 font-bold">✕</button>
                    </div>
                )}
                {success && (
                    <div className="bg-success-50 border border-success-200 text-success-700 px-4 py-3 rounded-xl mb-5 animate-fade-in">
                        ✓ {success}
                    </div>
                )}

                {/* Language Selection */}
                {(phase === "select" || phase === "done") && (
                    <div className="card animate-slide-up">
                        <h2 className="text-lg font-bold text-neutral-900 mb-1">Select Language</h2>
                        <p className="text-sm text-neutral-500 mb-5">Choose a language to apply for. Already approved or pending languages cannot be reapplied.</p>

                        {pageLoading ? (
                            <div className="flex justify-center py-8">
                                <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                            </div>
                        ) : languages.length === 0 ? (
                            <p className="text-neutral-400 text-sm py-6 text-center">No languages available yet. Ask an admin to add languages.</p>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                {languages.map(lang => {
                                    const st = getStatus(lang.code);
                                    const applicable = canApply(lang.code);
                                    return (
                                        <button
                                            key={lang.code}
                                            onClick={() => {
                                                if (!applicable) return;
                                                setSelected(lang);
                                                setPhase("record");
                                                setAudioBlob(null);
                                                setAudioUrl(null);
                                                setError("");
                                            }}
                                            disabled={!applicable}
                                            className={`p-4 rounded-xl border-2 text-left transition-all ${applicable
                                                ? "border-primary-200 hover:border-primary-500 hover:bg-primary-50 cursor-pointer"
                                                : "border-neutral-200 bg-neutral-50 opacity-60 cursor-not-allowed"
                                                }`}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-semibold text-neutral-800">{lang.name}</span>
                                                {statusBadge(lang.code)}
                                            </div>
                                            <p className="text-xs text-neutral-400">
                                                {!st ? "Click to apply →" : st === "rejected" ? "Rejected — click to re-apply" : ""}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Recording Phase */}
                {phase === "record" && selected && (
                    <div className="card animate-slide-up">
                        <div className="flex items-center justify-between mb-1">
                            <h2 className="text-lg font-bold text-neutral-900">Record: {selected.name}</h2>
                            <button onClick={() => { stopRecording(); setPhase("select"); }} className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors">
                                ← Change
                            </button>
                        </div>
                        <p className="text-sm text-neutral-500 mb-7">Speak naturally in {selected.name} for up to 2 minutes. Recording auto‑stops when time runs out.</p>

                        {/* Timer Ring */}
                        <div className="flex justify-center mb-7">
                            <div className={`w-32 h-32 rounded-full border-4 flex flex-col items-center justify-center transition-all ${recording ? "border-error-500 animate-pulse" : audioBlob ? "border-success-500" : "border-neutral-200"}`}>
                                <span className={`text-2xl font-bold ${recording ? "text-error-600" : audioBlob ? "text-success-600" : "text-neutral-500"}`}>
                                    {audioBlob ? "✓" : fmt(recording ? secondsLeft : MAX_SEC)}
                                </span>
                                {recording && <span className="text-xs text-error-400 mt-0.5">recording</span>}
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="flex flex-col items-center gap-4">
                            {!recording && !audioBlob && (
                                <button onClick={startRecording} className="btn-primary px-8 py-3 text-base font-semibold flex items-center gap-2">
                                    🎙️ Start Recording
                                </button>
                            )}
                            {recording && (
                                <button onClick={stopRecording} className="px-8 py-3 bg-error-600 hover:bg-error-700 text-white font-semibold rounded-xl transition-colors flex items-center gap-2">
                                    ⏹ Stop
                                </button>
                            )}
                            {audioBlob && (
                                <>
                                    <audio src={audioUrl} controls className="w-full rounded-lg" controlsList="nodownload noplaybackrate" onContextMenu={(e) => e.preventDefault()} />
                                    <div className="flex gap-3 w-full">
                                        <button
                                            onClick={() => { setAudioBlob(null); setAudioUrl(null); }}
                                            className="flex-1 py-2.5 border border-neutral-300 text-neutral-700 hover:bg-neutral-50 rounded-xl text-sm font-semibold transition-colors"
                                        >
                                            Re-record
                                        </button>
                                        <button
                                            onClick={submit}
                                            disabled={loading}
                                            className="flex-1 btn-primary py-2.5 text-sm font-semibold disabled:opacity-50"
                                        >
                                            {loading ? "Submitting…" : "Submit Application"}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
