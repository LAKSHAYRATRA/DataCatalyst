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
    const [globalLanguages, setGlobalLanguages] = useState([]);
    const [myApps, setMyApps] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState("");
    const [selectedLanguage, setSelectedLanguage] = useState("");
    const [applicationType, setApplicationType] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        const t = params.get("type");
        return (t === "phrase" || t === "call") ? t : "call";
    }); // 'call' or 'phrase'
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
        setError("");
        try {
            const companiesRes = await apiGet("/api/admin/companies?forApply=true").catch(() => ({ companies: [] }));
            const appsRes = await apiGet("/api/language-applications/my").catch(() => ({ applications: [] }));
            const langsRes = await apiGet("/api/languages?type=call").catch(() => ({ languages: [] }));
            
            setCompanies(companiesRes?.companies || []);
            setMyApps(appsRes?.applications || []);
            setGlobalLanguages(langsRes?.languages || []);
        } catch (e) {
            console.error("Load error:", e);
            setError("Failed to load projects: " + e.message);
        } finally {
            setPageLoading(false);
        }
    }

    function getStatus(companyId, code, type) {
        if (!code) return null;
        const targetCode = String(code).trim().toLowerCase();
        const targetCompany = companyId ? String(companyId).trim().toLowerCase() : "";

        return myApps.find(a => {
            const appLang = String(a.languageCode || "").trim().toLowerCase();
            const appType = a.applicationType || 'phrase';
            if (appLang !== targetCode) return false;
            if (appType !== type) return false;
            if (type === 'phrase') {
                const appComp = String(a.companyId || "").trim().toLowerCase();
                const appProj = String(a.projectName || "").trim().toLowerCase();
                return appComp === targetCompany || appProj === targetCompany;
            }
            return true;
        })?.status || null;
    }

    function canApply(companyId, code, type) {
        const st = getStatus(companyId, code, type);
        return st === null || st === "rejected";
    }

    async function fetchSamplePhrase(companyId, languageCode) {
        setLoading(true);
        setError("");
        try {
            const langQuery = languageCode ? `&language=${encodeURIComponent(languageCode)}` : '';
            const data = await apiGet(`/api/phrases/sample?companyId=${encodeURIComponent(companyId)}${langQuery}`);
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
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
            streamRef.current = stream;
            chunksRef.current = [];
            
            const audioCtx = new AudioContext({ sampleRate: 48000 });
            audioCtxRef.current = audioCtx;
            await audioCtx.audioWorklet.addModule("/pcm-worklet.js");
            
            const source = audioCtx.createMediaStreamSource(stream);
            const workletNode = new AudioWorkletNode(audioCtx, "pcm-processor");
            workletNodeRef.current = workletNode;
            
            workletNode.port.onmessage = (e) => {
                chunksRef.current.push(new Float32Array(e.data));
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
        const combined = new Float32Array(totalLength);
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
        if (!audioBlob || !selectedLanguage) return;
        if (applicationType === 'phrase' && !selectedCompany) return;
        setLoading(true);
        setError("");
        try {
            const form = new FormData();
            form.append("applicationType", applicationType);
            if (applicationType === 'phrase') {
                form.append("companyId", selectedCompany);
            }
            form.append("languageCode", selectedLanguage);
            form.append("recording", audioBlob, `app_${applicationType}_${selectedCompany || 'call'}_${selectedLanguage}.wav`);
            const res = await fetch(`${BACKEND}/api/language-applications`, {
                method: "POST", body: form, credentials: "include",
            });
            const data = await res.json();
            if (!res.ok) {
                if (data.error === "already_pending") throw new Error("You already have a pending application for this language.");
                if (data.error === "already_approved") throw new Error("You're already approved for this language!");
                throw new Error(data.error || "Upload failed");
            }
            if (applicationType === 'phrase') {
                const displayName = companies.find(c => c.name === selectedCompany)?.projectName || selectedCompany;
                setSuccess(`Your application for ${displayName} (${selectedLanguage}) has been submitted!`);
            } else {
                setSuccess(`Your call application for (${selectedLanguage}) has been submitted!`);
            }
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
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 pt-16 md:pt-0 md:pl-64 transition-colors duration-300">
            <Nav />
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12">

                {/* Header */}
                <div className="mb-8 animate-fade-in flex flex-col items-center justify-center text-center">
                    <button
                        onClick={() => navigate(-1)}
                        className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium mb-4 transition-colors"
                    >
                        ← Back
                    </button>
                    <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-white mb-2">Apply for a Language</h1>
                    <p className="text-neutral-600 dark:text-neutral-400 max-w-xl mx-auto">Record a 2‑minute sample to demonstrate your fluency. An admin will review and approve your application.</p>
                </div>

                {/* Alerts */}
                {error && (
                    <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-xl mb-5 flex justify-between items-start animate-fade-in max-w-2xl mx-auto">
                        <span>{error}</span>
                        <button onClick={() => setError("")} className="ml-3 text-error-500 hover:text-error-700 font-bold">✕</button>
                    </div>
                )}
                {success && (
                    <div className="bg-success-50 border border-success-200 text-success-700 px-4 py-3 rounded-xl mb-5 animate-fade-in max-w-2xl mx-auto">
                        ✓ {success}
                    </div>
                )}

                {/* Application Type Toggle */}
                {(phase === "select" || phase === "done") && (
                    <div className="flex bg-neutral-200/50 dark:bg-neutral-800 p-1 rounded-xl w-fit mb-6 mx-auto">
                        <button
                            onClick={() => { setApplicationType("call"); setSelectedLanguage(""); setSelectedCompany(""); }}
                            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${applicationType === "call" ? "bg-white dark:bg-neutral-700 text-primary-700 dark:text-white shadow-sm" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"}`}
                        >
                            Call Application
                        </button>
                        <button
                            onClick={() => { setApplicationType("phrase"); setSelectedLanguage(""); setSelectedCompany(""); }}
                            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${applicationType === "phrase" ? "bg-white dark:bg-neutral-700 text-primary-700 dark:text-white shadow-sm" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"}`}
                        >
                            Phrase Studio Application
                        </button>
                    </div>
                )}

                {/* Project Selection */}
                {(phase === "select" || phase === "done") && (
                    <div className="card animate-slide-up max-w-2xl mx-auto">
                        <h2 className="text-lg font-bold text-neutral-900 dark:text-white mb-1">
                            {applicationType === 'phrase' ? 'Select Phrase Project' : 'Select Call Language'}
                        </h2>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-5">
                            {applicationType === 'phrase' ? 'Choose a project and language to apply for.' : 'Choose a language you want to participate in calls for.'}
                        </p>

                        {pageLoading ? (
                            <div className="flex justify-center py-8">
                                <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                            </div>
                        ) : (applicationType === 'call' && globalLanguages.filter(l => l.enabled).length === 0) ? (
                            <p className="text-neutral-400 dark:text-neutral-500 text-sm py-6 text-center">No call languages available to apply for right now.</p>
                        ) : (applicationType === 'phrase' && companies.length === 0) ? (
                            <p className="text-neutral-400 dark:text-neutral-500 text-sm py-6 text-center">No phrase projects available yet.</p>
                        ) : (
                            <div className="space-y-6">
                                {applicationType === 'phrase' && (
                                    <div className="flex flex-col">
                                        <label className="block text-sm font-bold text-neutral-600 dark:text-neutral-400 mb-2">Project</label>
                                        <div className="relative">
                                            <select 
                                                className="w-full bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-700 rounded-xl pl-4 pr-10 py-3.5 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all cursor-pointer shadow-sm appearance-none font-semibold text-sm"
                                                value={selectedCompany}
                                                onChange={(e) => {
                                                    setSelectedCompany(e.target.value);
                                                    setSelectedLanguage("");
                                                }}
                                            >
                                                 <option value="">-- Select Project --</option>
                                                 {companies.map(c => (
                                                     <option key={c._id} value={c.name}>{c.projectName || c.name}</option>
                                                 ))}
                                            </select>
                                            <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-neutral-500 dark:text-neutral-400">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path>
                                                </svg>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {(applicationType === 'call' || selectedCompany) && (
                                    <div className="flex flex-col">
                                        <label className="block text-sm font-bold text-neutral-600 dark:text-neutral-400 mb-2">Language</label>
                                        <div className="relative">
                                            <select 
                                                className="w-full bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-700 rounded-xl pl-4 pr-10 py-3.5 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all cursor-pointer shadow-sm appearance-none font-semibold text-sm"
                                                value={selectedLanguage}
                                                onChange={(e) => setSelectedLanguage(e.target.value)}
                                            >
                                                <option value="">-- Select Language --</option>
                                                {(() => {
                                                     if (applicationType === 'phrase') {
                                                         const comp = companies.find(c => c.name === selectedCompany);
                                                         if (!comp || !comp.languages) return null;
                                                         const compLangs = comp.languages.map(l => String(l).toLowerCase());
                                                         
                                                         return compLangs.map(code => {
                                                              const match = globalLanguages.find(g => g.code?.toLowerCase() === code);
                                                              const displayName = match ? match.name : (code.charAt(0).toUpperCase() + code.slice(1));
                                                              const st = getStatus(selectedCompany, code, 'phrase');
                                                              const statusSuffix = st === 'pending' ? ' (Already Applied - Pending)' : st === 'approved' ? ' (Already Applied - Approved)' : '';
                                                              return (
                                                                  <option key={code} value={code}>
                                                                      {displayName}{statusSuffix}
                                                                  </option>
                                                              );
                                                          });
                                                     }
                                                     return globalLanguages.map(lang => {
                                                          const st = getStatus(null, lang.code, 'call');
                                                          const statusSuffix = st === 'pending' ? ' (Already Applied - Pending)' : st === 'approved' ? ' (Already Applied - Approved)' : '';
                                                          return (
                                                              <option key={lang._id || lang.code} value={lang.code}>
                                                                  {lang.name}{statusSuffix}
                                                              </option>
                                                          );
                                                      });
                                                 })()}
                                            </select>
                                            <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-neutral-500 dark:text-neutral-400">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path>
                                                </svg>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                
                                {(applicationType === 'call' ? selectedLanguage : (selectedCompany && selectedLanguage)) && (
                                    <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800">
                                        <div className="mb-4">
                                            <span className="block text-sm font-semibold mb-1">Status:</span>
                                            {statusBadge(getStatus(selectedCompany, selectedLanguage, applicationType)) || <span className="text-neutral-500 dark:text-neutral-400 text-sm">Not Applied</span>}
                                        </div>
                                        
                                        {(() => {
                                            const currentSt = getStatus(selectedCompany, selectedLanguage, applicationType);
                                            const isApplied = currentSt === "pending" || currentSt === "approved";
                                            let buttonLabel = "Apply Now";
                                            if (currentSt === "pending") buttonLabel = "Already Applied (Pending Review)";
                                            else if (currentSt === "approved") buttonLabel = "Already Approved";
                                            else if (currentSt === "rejected") buttonLabel = "Re-apply Now";

                                            return (
                                                <button
                                                    onClick={() => {
                                                        if (isApplied) return;
                                                        if (applicationType === 'phrase') {
                                                            fetchSamplePhrase(selectedCompany, selectedLanguage);
                                                        } else {
                                                            setPhase("record");
                                                            setSamplePhrase(null);
                                                            setAudioBlob(null);
                                                            setAudioUrl(null);
                                                        }
                                                    }}
                                                    disabled={isApplied || loading}
                                                    className={`btn w-full py-3 font-semibold ${isApplied ? 'bg-neutral-300 dark:bg-neutral-700 text-neutral-500 cursor-not-allowed' : 'btn-primary'}`}
                                                >
                                                    {loading ? "Fetching Sample Phrase..." : buttonLabel}
                                                </button>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Recording Phase */}
                {phase === "record" && (applicationType === 'call' || samplePhrase) && (
                    <div className="card animate-slide-up max-w-2xl mx-auto">
                        <div className="flex items-center justify-between mb-1">
                            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Record Sample: {applicationType === 'phrase' ? (companies.find(c => c.name === selectedCompany)?.projectName || selectedCompany) : ''} {selectedLanguage && `(${selectedLanguage})`}</h2>
                            <button onClick={() => { stopRecording(); setPhase("select"); }} className="text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-white transition-colors">
                                ← Change
                            </button>
                        </div>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-7">
                            {applicationType === 'phrase' ? 'Read the sample phrase below naturally.' : 'Please record a brief introductory message speaking naturally in this language.'} Recording auto-stops when time runs out.
                        </p>

                        {/* Sample Phrase Box */}
                        {applicationType === 'phrase' && samplePhrase && (
                            <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 rounded-xl mb-6">
                                <p className="text-xl md:text-2xl font-medium leading-relaxed">"{samplePhrase.text}"</p>
                            </div>
                        )}

                        {/* Timer Ring */}
                        <div className="flex justify-center mb-7">
                            <div className={`w-32 h-32 rounded-full border-4 flex flex-col items-center justify-center transition-all ${recording ? "border-error-500 animate-pulse" : audioBlob ? "border-success-500" : "border-neutral-200 dark:border-neutral-800"}`}>
                                <span className={`text-2xl font-bold ${recording ? "text-error-600" : audioBlob ? "text-success-600" : "text-neutral-500 dark:text-neutral-400"}`}>
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
                                            className="flex-1 py-2.5 border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-xl text-sm font-semibold transition-colors"
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
