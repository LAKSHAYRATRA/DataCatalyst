import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "../components/Nav.jsx";
import { apiGet } from "../lib/api.js";
import { encodeWAV } from "../utils/wavBuilder.js";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
const MAX_SEC = 120; // 2 minutes

export default function LanguageApply() {
    const navigate = useNavigate();
    const [companies, setCompanies] = useState([]);
    const [myApps, setMyApps] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState("");
    const [selectedLanguage, setSelectedLanguage] = useState("");
    const [samplePhrase, setSamplePhrase] = useState(null);
    const [phase, setPhase] = useState("select"); // select | record | done
    const [recording, setRecording] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(MAX_SEC);
    const [audioBlob, setAudioBlob] = useState(null);
    const [audioUrl, setAudioUrl] = useState(null);
    const [loading, setLoading] = useState(false);
    const [pageLoading, setPageLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const audioCtxRef = useRef(null);
    const workletNodeRef = useRef(null);
    const streamRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);

    useEffect(() => { load(); }, []);

    async function load() {
        setPageLoading(true);
        try {
            const [companiesRes, appsRes] = await Promise.all([
                apiGet("/api/admin/companies"),
                apiGet("/api/language-applications/my"),
            ]);
            setCompanies(companiesRes.companies || []);
            setMyApps(appsRes.applications || []);
        } catch (e) {
            setError("Failed to load projects.");
        } finally {
            setPageLoading(false);
        }
    }

    function getStatus(companyId, code) {
        return myApps.find(a => a.languageCode === code && a.companyId === companyId)?.status || null;
    }

    function canApply(companyId, code) {
        const st = getStatus(companyId, code);
        return st === null || st === "rejected";
    }

    async function fetchSamplePhrase(companyId, languageCode) {
        setLoading(true);
        setError("");
        try {
            const data = await apiGet(`/api/phrases/sample?companyId=${encodeURIComponent(companyId)}&language=${encodeURIComponent(languageCode)}`);
            if (data.phrase) {
                setSamplePhrase(data.phrase);
                setPhase("record");
                setAudioBlob(null);
                setAudioUrl(null);
            } else {
                setError("No sample phrase found for this project and language.");
            }
        } catch (e) {
            setError(e.message || "Failed to fetch sample phrase.");
        } finally {
            setLoading(false);
        }
    }

    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: 1 } });
            streamRef.current = stream;
            chunksRef.current = [];
            
            const audioCtx = new AudioContext({ sampleRate: 48000 });
            audioCtxRef.current = audioCtx;
            await audioCtx.audioWorklet.addModule("/pcm-worklet.js");
            
            const source = audioCtx.createMediaStreamSource(stream);
            const workletNode = new AudioWorkletNode(audioCtx, "pcm-processor");
            workletNodeRef.current = workletNode;
            
            workletNode.port.onmessage = (e) => {
                chunksRef.current.push(new Int16Array(e.data));
            };
            
            const gain = audioCtx.createGain();
            gain.gain.value = 0;
            source.connect(workletNode);
            workletNode.connect(gain);
            gain.connect(audioCtx.destination);
            
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
        if (workletNodeRef.current) {
            workletNodeRef.current.disconnect();
            workletNodeRef.current = null;
        }
        if (audioCtxRef.current) {
            audioCtxRef.current.close();
            audioCtxRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }

        let totalLength = 0;
        for (const arr of chunksRef.current) totalLength += arr.length;
        const combined = new Int16Array(totalLength);
        let offset = 0;
        for (const arr of chunksRef.current) {
            combined.set(arr, offset);
            offset += arr.length;
        }
        const blob = encodeWAV(combined, 48000, 1);
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setRecording(false);
    }

    async function submit() {
        if (!audioBlob || !selectedCompany || !selectedLanguage) return;
        setLoading(true);
        setError("");
        try {
            const form = new FormData();
            form.append("companyId", selectedCompany);
            form.append("languageCode", selectedLanguage);
            form.append("recording", audioBlob, `app_${selectedCompany}_${selectedLanguage}.wav`);
            const res = await fetch(`${BACKEND}/api/language-applications`, {
                method: "POST", body: form, credentials: "include",
            });
            const data = await res.json();
            if (!res.ok) {
                if (data.error === "already_pending") throw new Error("You already have a pending application for this language.");
                if (data.error === "already_approved") throw new Error("You're already approved for this language!");
                throw new Error(data.error || "Upload failed");
            }
            setSuccess(`Your application for ${selectedCompany} (${selectedLanguage}) has been submitted!`);
            setPhase("done");
            load();
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

    const statusBadge = (st) => {
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

                {/* Project Selection */}
                {(phase === "select" || phase === "done") && (
                    <div className="card animate-slide-up max-w-2xl">
                        <h2 className="text-lg font-bold text-neutral-900 mb-1">Select Project</h2>
                        <p className="text-sm text-neutral-500 mb-5">Choose a project and language to apply for.</p>

                        {pageLoading ? (
                            <div className="flex justify-center py-8">
                                <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                            </div>
                        ) : companies.length === 0 ? (
                            <p className="text-neutral-400 text-sm py-6 text-center">No projects available yet.</p>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold mb-2">Project</label>
                                    <select 
                                        className="input w-full"
                                        value={selectedCompany}
                                        onChange={(e) => {
                                            setSelectedCompany(e.target.value);
                                            setSelectedLanguage("");
                                        }}
                                    >
                                        <option value="">-- Select Project --</option>
                                        {companies.map(c => (
                                            <option key={c._id} value={c.name}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                                {selectedCompany && (
                                    <div>
                                        <label className="block text-sm font-semibold mb-2">Language</label>
                                        <select 
                                            className="input w-full"
                                            value={selectedLanguage}
                                            onChange={(e) => setSelectedLanguage(e.target.value)}
                                        >
                                            <option value="">-- Select Language --</option>
                                            {companies.find(c => c.name === selectedCompany)?.languages?.map(lang => (
                                                <option key={lang} value={lang}>{lang.charAt(0).toUpperCase() + lang.slice(1)}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                
                                {selectedCompany && selectedLanguage && (
                                    <div className="pt-4 border-t border-neutral-100">
                                        <div className="mb-4">
                                            <span className="block text-sm font-semibold mb-1">Status:</span>
                                            {statusBadge(getStatus(selectedCompany, selectedLanguage)) || <span className="text-neutral-500 text-sm">Not Applied</span>}
                                        </div>
                                        
                                        <button
                                            onClick={() => {
                                                if (!canApply(selectedCompany, selectedLanguage)) return;
                                                fetchSamplePhrase(selectedCompany, selectedLanguage);
                                            }}
                                            disabled={!canApply(selectedCompany, selectedLanguage) || loading}
                                            className="btn btn-primary w-full py-3 font-semibold"
                                        >
                                            {loading ? "Fetching Sample Phrase..." : (getStatus(selectedCompany, selectedLanguage) === "rejected" ? "Re-apply Now" : "Apply Now")}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Recording Phase */}
                {phase === "record" && samplePhrase && (
                    <div className="card animate-slide-up">
                        <div className="flex items-center justify-between mb-1">
                            <h2 className="text-lg font-bold text-neutral-900">Record Sample: {selectedCompany} ({selectedLanguage})</h2>
                            <button onClick={() => { stopRecording(); setPhase("select"); }} className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors">
                                ← Change
                            </button>
                        </div>
                        <p className="text-sm text-neutral-500 mb-7">Read the sample phrase below naturally. Recording auto-stops when time runs out.</p>

                        {/* Sample Phrase Box */}
                        <div className="bg-neutral-50 border border-neutral-200 p-6 rounded-xl mb-6">
                            <p className="text-xl md:text-2xl font-medium leading-relaxed">"{samplePhrase.text}"</p>
                        </div>

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
