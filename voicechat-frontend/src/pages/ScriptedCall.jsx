import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "../components/Nav.jsx";
import { apiGet, apiPostJson, apiFetch } from "../lib/api.js";
import { getUserInfo } from "../lib/auth.js";
import { 
    Radio, 
    Globe, 
    MessageSquare, 
    ChevronRight, 
    ChevronDown, 
    Mic, 
    Play, 
    Pause, 
    RotateCcw, 
    CheckCircle2, 
    Layers, 
    Sparkles, 
    ArrowLeft,
    Volume2,
    Users,
    Clock,
    Search,
    AlertCircle,
    Check,
    Languages,
    FileText,
    Eye,
    X
} from "lucide-react";
import Swal from "sweetalert2";

const FLAG_MAP = {
    hindi: "https://flagcdn.com/w160/in.png",
    english: "https://flagcdn.com/w160/gb.png",
    bengali: "https://flagcdn.com/w160/in.png",
    tamil: "https://flagcdn.com/w160/in.png",
    telugu: "https://flagcdn.com/w160/in.png",
    marathi: "https://flagcdn.com/w160/in.png",
    gujarati: "https://flagcdn.com/w160/in.png",
    kannada: "https://flagcdn.com/w160/in.png",
    malayalam: "https://flagcdn.com/w160/in.png",
    punjabi: "https://flagcdn.com/w160/in.png",
    spanish: "https://flagcdn.com/w160/es.png",
    french: "https://flagcdn.com/w160/fr.png",
    german: "https://flagcdn.com/w160/de.png",
};

export default function ScriptedCall() {
    const navigate = useNavigate();
    const [userInfo, setUserInfo] = useState(null);
    const [languages, setLanguages] = useState([]);
    const [selectedLanguage, setSelectedLanguage] = useState(null); // Language box shown first if null
    const [topics, setTopics] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedTopics, setExpandedTopics] = useState(new Set());

    // Active Scenario Studio State
    const [activeScenario, setActiveScenario] = useState(null);
    const [activeTopic, setActiveTopic] = useState(null);
    const [selectedRole, setSelectedRole] = useState("speaker1"); // "speaker1" | "speaker2"
    const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
    const [viewingScriptModal, setViewingScriptModal] = useState(null); // { scenario, topic }

    // Recording State
    const [isRecording, setIsRecording] = useState(false);
    const [recordedAudios, setRecordedAudios] = useState({});
    const [isPlaying, setIsPlaying] = useState(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const audioPlayerRef = useRef(null);
    const currentClaimIdRef = useRef(null);
    const currentSubtopicIdRef = useRef(null);
    const heartbeatIntervalRef = useRef(null);

    // Lock Release on Window Close / Navigation
    useEffect(() => {
        const handleUnload = () => {
            if (currentClaimIdRef.current) {
                const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
                const payload = JSON.stringify({
                    claimId: currentClaimIdRef.current,
                    subtopicId: currentSubtopicIdRef.current
                });
                if (navigator.sendBeacon) {
                    navigator.sendBeacon(`${BACKEND_URL}/api/scripted-topics/release-claim`, new Blob([payload], { type: 'application/json' }));
                } else {
                    fetch(`${BACKEND_URL}/api/scripted-topics/release-claim`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: payload,
                        keepalive: true
                    }).catch(() => {});
                }
            }
        };

        window.addEventListener("beforeunload", handleUnload);
        window.addEventListener("pagehide", handleUnload);
        return () => {
            window.removeEventListener("beforeunload", handleUnload);
            window.removeEventListener("pagehide", handleUnload);
            releaseCurrentClaim();
        };
    }, []);

    useEffect(() => {
        const u = getUserInfo();
        setUserInfo(u);
        loadLanguages();
    }, []);

    useEffect(() => {
        if (selectedLanguage) {
            loadTopics(selectedLanguage.code || selectedLanguage);
        }
    }, [selectedLanguage]);

    async function loadLanguages() {
        try {
            setLoading(true);
            setError("");
            let langList = [];
            try {
                const res = await apiGet("/api/scripted-languages");
                langList = (res.languages || []).filter(l => l.enabled);
            } catch (e) {
                const res = await apiGet("/api/admin/scripted-languages");
                langList = (res.languages || []).filter(l => l.enabled);
            }

            // Only show projects/languages for which the user is approved for scripted calls
            try {
                const appsRes = await apiGet("/api/language-applications/my").catch(() => ({ applications: [] }));
                const myApps = appsRes?.applications || [];
                const approvedCodes = new Set(
                    myApps
                        .filter(a => a.status === "approved" && a.applicationType === "scripted_call")
                        .map(a => String(a.languageCode || "").toLowerCase().trim())
                );
                langList = langList.filter(l => approvedCodes.has(String(l.code || "").toLowerCase().trim()));
            } catch (err) {
                console.error("Failed to filter approved scripted languages:", err);
            }

            setLanguages(langList);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    async function loadTopics(langCode) {
        try {
            setLoading(true);
            setError("");
            const data = await apiGet(`/api/scripted-topics/enabled?language=${encodeURIComponent(langCode)}`);
            const loaded = data.topics || [];
            setTopics(loaded);
            
            // Auto expand all topics
            const topicIds = new Set(loaded.map(t => t._id));
            setExpandedTopics(topicIds);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    const toggleTopic = (id) => {
        setExpandedTopics(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const releaseCurrentClaim = async () => {
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
        }
        if (currentClaimIdRef.current) {
            const claimId = currentClaimIdRef.current;
            const subtopicId = currentSubtopicIdRef.current;
            currentClaimIdRef.current = null;
            currentSubtopicIdRef.current = null;
            try {
                await apiPostJson("/api/scripted-topics/release-claim", { claimId, subtopicId });
            } catch (_) {}
        }
    };

    const startScenarioStudio = async (scenario, topic) => {
        let assignedRole = "speaker1";

        if (scenario.eligibleRoles && scenario.eligibleRoles.length > 0) {
            assignedRole = scenario.eligibleRoles[0];
        } else {
            const userGen = (userInfo?.gender || "").toLowerCase().trim();
            const s1Gen = (scenario.speaker1Gender || "any").toLowerCase().trim();
            const s2Gen = (scenario.speaker2Gender || "any").toLowerCase().trim();

            if (userGen === "female") {
                if (s1Gen === "female" && s2Gen !== "female") {
                    assignedRole = "speaker1";
                } else if (s2Gen === "female" && s1Gen !== "female") {
                    assignedRole = "speaker2";
                }
            } else if (userGen === "male") {
                if (s1Gen === "male" && s2Gen !== "male") {
                    assignedRole = "speaker1";
                } else if (s2Gen === "male" && s1Gen !== "male") {
                    assignedRole = "speaker2";
                }
            }
        }

        // Claim and lock this scenario role on the backend
        try {
            const claimRes = await apiPostJson("/api/scripted-topics/claim", {
                subtopicId: scenario._id,
                topicId: topic._id,
                role: assignedRole,
                language: selectedLanguage?.code || selectedLanguage?.name || "english"
            });

            currentClaimIdRef.current = claimRes.claimId;
            currentSubtopicIdRef.current = scenario._id;

            // Start heartbeat interval every 15s to keep lock alive while studio window is open
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = setInterval(async () => {
                if (currentClaimIdRef.current) {
                    try {
                        const hb = await apiPostJson("/api/scripted-topics/heartbeat", {
                            claimId: currentClaimIdRef.current,
                            subtopicId: currentSubtopicIdRef.current
                        });
                        if (hb.expired) {
                            console.warn("Claim expired on server");
                        }
                    } catch (e) {
                        console.warn("Heartbeat warning:", e);
                    }
                }
            }, 15000);

            setActiveScenario(scenario);
            setActiveTopic(topic);
            setSelectedRole(assignedRole);
            setCurrentTurnIndex(0);
            setRecordedAudios({});
            setIsRecording(false);
        } catch (err) {
            Swal.fire({
                icon: 'warning',
                title: 'Scenario Unavailable',
                text: err.message || 'This speaker role is currently being recorded by another contributor. Refreshing available topics...',
                confirmButtonColor: '#6366f1'
            });
            loadTopics(selectedLanguage?.code || selectedLanguage);
        }
    };

    const exitScenarioStudio = async () => {
        if (Object.keys(recordedAudios).length > 0) {
            Swal.fire({
                title: 'Exit Scenario?',
                text: 'Your unsubmitted recorded verses will be cleared and the scenario role will be released.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#6366f1',
                cancelButtonColor: '#4b5563',
                confirmButtonText: 'Yes, Exit'
            }).then(async (res) => {
                if (res.isConfirmed) {
                    await releaseCurrentClaim();
                    setActiveScenario(null);
                    setActiveTopic(null);
                    setRecordedAudios({});
                    loadTopics(selectedLanguage?.code || selectedLanguage);
                }
            });
        } else {
            await releaseCurrentClaim();
            setActiveScenario(null);
            setActiveTopic(null);
            loadTopics(selectedLanguage?.code || selectedLanguage);
        }
    };

    // Recording Logic
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorderRef.current.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
                const audioUrl = URL.createObjectURL(audioBlob);
                setRecordedAudios(prev => ({
                    ...prev,
                    [currentTurnIndex]: { blob: audioBlob, url: audioUrl }
                }));
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
        } catch (err) {
            Swal.fire('Microphone Error', 'Please grant microphone access to record scripted verses.', 'error');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (mediaRecorderRef.current.stream) {
                mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
            }
        }
    };

    const playRecordedAudio = (index, url) => {
        if (isPlaying === index) {
            if (audioPlayerRef.current) {
                audioPlayerRef.current.pause();
                setIsPlaying(null);
            }
        } else {
            if (audioPlayerRef.current) {
                audioPlayerRef.current.pause();
            }
            audioPlayerRef.current = new Audio(url);
            audioPlayerRef.current.onended = () => setIsPlaying(null);
            audioPlayerRef.current.play();
            setIsPlaying(index);
        }
    };

    const submitScenarioRecording = async () => {
        const turns = activeScenario.dialogueTurns || [];
        const requiredCount = turns.length;
        const recordedCount = Object.keys(recordedAudios).length;

        if (recordedCount < requiredCount) {
            Swal.fire({
                title: 'Incomplete Script',
                text: `You have recorded ${recordedCount} of ${requiredCount} dialogue verses. Please record all verses before submitting.`,
                icon: 'warning',
                confirmButtonColor: '#6366f1'
            });
            return;
        }

        Swal.fire({
            title: 'Submitting Recording',
            text: 'Uploading your scripted conversation verses...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const formData = new FormData();
            formData.append("subtopicId", activeScenario._id);
            formData.append("topicId", activeTopic._id);
            formData.append("language", selectedLanguage.code || selectedLanguage.name || "english");
            formData.append("role", selectedRole);

            const versesMeta = [];
            for (let i = 0; i < requiredCount; i++) {
                const audioItem = recordedAudios[i];
                if (audioItem && audioItem.blob) {
                    formData.append(`audio_${i}`, audioItem.blob, `turn_${i}.webm`);
                    versesMeta.push({
                        turnIndex: i,
                        durationSec: audioItem.duration || 0,
                        text: selectedRole === "speaker1" ? turns[i]?.speaker1 : turns[i]?.speaker2
                    });
                }
            }
            formData.append("versesMeta", JSON.stringify(versesMeta));

            const data = await apiFetch("/api/scripted-topics/submit-recording", {
                method: "POST",
                body: formData
            });

            // Stop heartbeat and clear local claim tracking
            if (heartbeatIntervalRef.current) {
                clearInterval(heartbeatIntervalRef.current);
                heartbeatIntervalRef.current = null;
            }
            currentClaimIdRef.current = null;
            currentSubtopicIdRef.current = null;

            Swal.fire({
                icon: 'success',
                title: data.matched ? 'Scenario Completed & Matched!' : 'Scenario Submitted!',
                text: data.matched 
                    ? 'Your recording has been matched with a partner and combined for QA review!'
                    : 'Your verses have been submitted and will be stitched as soon as a matching speaker records.',
                confirmButtonColor: '#6366f1'
            }).then(() => {
                setActiveScenario(null);
                setActiveTopic(null);
                setRecordedAudios({});
                loadTopics(selectedLanguage.code || selectedLanguage);
            });
        } catch (err) {
            Swal.fire({
                icon: 'error',
                title: 'Submission Failed',
                text: err.message || 'An error occurred while uploading your recording.',
                confirmButtonColor: '#6366f1'
            });
        }
    };

    const filteredTopics = topics.filter(t => {
        const matchesTopic = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             (t.description || "").toLowerCase().includes(searchQuery.toLowerCase());
        const matchesScenario = (t.subtopics || []).some(s => 
            s.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (s.description || "").toLowerCase().includes(searchQuery.toLowerCase())
        );
        return matchesTopic || matchesScenario;
    });

    const activeTurns = activeScenario ? (activeScenario.dialogueTurns || []) : [];

    return (
        <div className="min-h-screen bg-neutral-950 text-white pt-16 md:pt-0 md:pl-64 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200 transition-colors duration-300">
            <Nav />

            <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-6">

                {/* 1. LANGUAGE SELECTION BOX (SHOWN FIRST) */}
                {!selectedLanguage ? (
                    <div className="max-w-4xl mx-auto py-8 md:py-16 space-y-8 animate-fade-in">
                        {/* Language Box Header */}
                        <div className="text-center space-y-3">
                            <div className="inline-flex p-3 rounded-2xl bg-gradient-to-br from-indigo-500 to-primary-600 text-white shadow-xl shadow-indigo-500/25 mb-1">
                                <Languages className="w-8 h-8" />
                            </div>
                            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
                                Select Scripted Language
                            </h1>
                            <p className="text-sm text-neutral-400 max-w-lg mx-auto leading-relaxed">
                                Choose a language project below to view available 2-person scripted conversation topics & record your verses.
                            </p>
                        </div>

                        {error && (
                            <div className="p-4 rounded-2xl bg-rose-900/30 border border-rose-700/50 text-rose-300 text-sm flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
                                <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
                                <p className="text-sm font-bold">Loading Scripted Languages...</p>
                            </div>
                        ) : languages.length === 0 ? (
                            <div className="text-center py-16 border border-dashed border-neutral-800 rounded-3xl bg-neutral-900/40 p-8 space-y-4 max-w-lg mx-auto">
                                <div className="w-14 h-14 rounded-2xl bg-indigo-950/60 border border-indigo-800/40 flex items-center justify-center text-indigo-400 mx-auto">
                                    <Radio className="w-7 h-7" />
                                </div>
                                <h3 className="text-lg font-bold text-neutral-200">No Approved Scripted Projects</h3>
                                <p className="text-xs text-neutral-400 leading-relaxed">
                                    You must apply and receive QA approval for a scripted call language before accessing scripted conversation studios.
                                </p>
                                <button
                                    onClick={() => navigate("/language-apply?type=scripted_call")}
                                    className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/25 transition-all inline-flex items-center gap-2 cursor-pointer"
                                >
                                    <span>Apply for Scripted Call</span>
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                {languages.map((lang) => {
                                    return (
                                        <div
                                            key={lang._id || lang.code}
                                            className="group relative bg-neutral-900/90 border border-neutral-800 hover:border-indigo-500/80 rounded-3xl p-6 shadow-xl hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-300 flex flex-col justify-between overflow-hidden"
                                        >
                                            {/* Glow Accent */}
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all pointer-events-none" />

                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="p-2.5 rounded-2xl bg-indigo-950/60 border border-indigo-800/40 text-indigo-400">
                                                        <Radio className="w-5 h-5" />
                                                    </div>
                                                    <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-700/50">
                                                        Active
                                                    </span>
                                                </div>

                                                <div>
                                                    <h3 className="text-xl font-black text-white group-hover:text-indigo-300 transition-colors capitalize">
                                                        {lang.name}
                                                    </h3>
                                                    {lang.hourlyPayout !== undefined && (
                                                        <p className="text-sm font-extrabold text-emerald-400 mt-1">
                                                            ${lang.hourlyPayout}/hr
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Action Button */}
                                            <button
                                                onClick={() => setSelectedLanguage(lang)}
                                                className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer mt-6"
                                            >
                                                <span>Open</span>
                                                <ChevronRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : activeScenario ? (
                    /* 2. SCENARIO RECORDING STUDIO MODE */
                    <div className="space-y-6 animate-fade-in">
                        {/* Studio Header */}
                        <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 shadow-2xl backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="space-y-1">
                                <button
                                    onClick={exitScenarioStudio}
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-400 hover:text-white transition-colors mb-2 cursor-pointer"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    <span>Back to Topics ({selectedLanguage.name})</span>
                                </button>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h1 className="text-2xl font-black text-white">{activeScenario.title}</h1>
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                                        {activeTopic?.title}
                                    </span>
                                </div>
                                <p className="text-xs text-neutral-400 max-w-2xl">
                                    {activeScenario.description || "Read and record your assigned conversational verses clearly."}
                                </p>
                            </div>

                            {/* Assigned Speaker Role Display (Locked - No switching allowed) */}
                            <div className="flex items-center gap-2.5 bg-neutral-950 px-4 py-2.5 rounded-2xl border border-neutral-800 shadow-inner">
                                <span className="text-[10px] font-extrabold uppercase text-neutral-500 tracking-wider">
                                    Assigned Role:
                                </span>
                                <div className={`px-3 py-1 rounded-xl text-xs font-black flex items-center gap-2 shadow-sm ${
                                    selectedRole === "speaker1" 
                                        ? "bg-blue-600/20 text-blue-300 border border-blue-500/40" 
                                        : "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40"
                                }`}>
                                    <span className={`w-2 h-2 rounded-full ${selectedRole === "speaker1" ? "bg-blue-400" : "bg-emerald-400"}`} />
                                    <span>{selectedRole === "speaker1" ? "Speaker 1" : "Speaker 2"}</span>
                                </div>
                            </div>
                        </div>

                        {/* Interactive Turn-by-Turn Dialogue Script Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                            {/* Script Timeline (Left 2 Cols) */}
                            <div className="lg:col-span-2 space-y-4">
                                <div className="flex items-center justify-between px-2">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2">
                                        <MessageSquare className="w-4 h-4 text-indigo-400" />
                                        <span>Dialogue Script ({activeTurns.length} Turns)</span>
                                    </h3>
                                    <span className="text-xs font-mono font-bold text-neutral-500">
                                        {Object.keys(recordedAudios).length} of {activeTurns.length} Verses Recorded
                                    </span>
                                </div>

                                <div className="space-y-4">
                                    {activeTurns.map((turn, idx) => {
                                        const isCurrent = currentTurnIndex === idx;
                                        const isRecorded = !!recordedAudios[idx];
                                        const myVerse = selectedRole === "speaker1" ? turn.speaker1 : turn.speaker2;
                                        const partnerVerse = selectedRole === "speaker1" ? turn.speaker2 : turn.speaker1;

                                        return (
                                            <div
                                                key={idx}
                                                onClick={() => setCurrentTurnIndex(idx)}
                                                className={`p-5 rounded-2xl border transition-all cursor-pointer ${
                                                    isCurrent 
                                                        ? "bg-neutral-900 border-indigo-500 shadow-xl shadow-indigo-500/10 ring-1 ring-indigo-500" 
                                                        : "bg-neutral-900/60 border-neutral-800/80 hover:border-neutral-700"
                                                }`}
                                            >
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-6 h-6 rounded-full bg-neutral-800 text-neutral-300 font-mono text-xs font-black flex items-center justify-center">
                                                            {idx + 1}
                                                        </span>
                                                        <span className="text-xs font-bold text-neutral-400 uppercase tracking-wide">
                                                            Turn {idx + 1}
                                                        </span>
                                                    </div>

                                                    {isRecorded ? (
                                                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 text-xs font-bold">
                                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                                            <span>Verse Recorded</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[11px] font-bold text-neutral-500">
                                                            Not Recorded Yet
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Contributor's Assigned Verse To Record */}
                                                <div className={`p-4 rounded-xl border ${
                                                    selectedRole === "speaker1" 
                                                        ? "bg-blue-950/40 border-blue-800/50 text-blue-100" 
                                                        : "bg-emerald-950/40 border-emerald-800/50 text-emerald-100"
                                                }`}>
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                                            Your Verse to Read ({selectedRole === "speaker1" ? "Speaker 1" : "Speaker 2"})
                                                        </span>
                                                        {isCurrent && (
                                                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-indigo-600 text-white">
                                                                Active Turn
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm font-semibold leading-relaxed">
                                                        "{myVerse}"
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Recording Controls & Playback Console (Right Col) */}
                            <div className="space-y-4">
                                <div className="sticky top-6 bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-6 shadow-2xl">
                                    <div className="border-b border-neutral-800 pb-4">
                                        <h4 className="text-base font-bold text-white flex items-center gap-2">
                                            <Mic className="w-5 h-5 text-indigo-400" />
                                            <span>Recording Studio</span>
                                        </h4>
                                        <p className="text-xs text-neutral-400 mt-0.5">
                                            Turn {currentTurnIndex + 1} of {activeTurns.length}
                                        </p>
                                    </div>

                                    {/* Active Target Line Display */}
                                    <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-2">
                                        <span className="text-[10px] font-extrabold uppercase text-indigo-400 block">
                                            Currently Reading Verse:
                                        </span>
                                        <p className="text-sm font-bold text-white leading-relaxed">
                                            "{selectedRole === "speaker1" ? activeTurns[currentTurnIndex]?.speaker1 : activeTurns[currentTurnIndex]?.speaker2}"
                                        </p>
                                    </div>

                                    {/* Recording Button */}
                                    <div className="flex flex-col items-center justify-center py-4 space-y-4">
                                        {isRecording ? (
                                            <button
                                                onClick={stopRecording}
                                                className="w-20 h-20 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-xl shadow-rose-600/30 animate-pulse transition-all cursor-pointer"
                                                title="Stop Recording"
                                            >
                                                <div className="w-6 h-6 rounded-md bg-white" />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={startRecording}
                                                className="w-20 h-20 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-xl shadow-indigo-600/30 hover:scale-105 transition-all cursor-pointer"
                                                title="Start Recording Verse"
                                            >
                                                <Mic className="w-8 h-8" />
                                            </button>
                                        )}

                                        <span className="text-xs font-bold text-neutral-400">
                                            {isRecording ? "Recording in progress... Click to stop." : "Click microphone to record this verse"}
                                        </span>
                                    </div>

                                    {/* Playback Preview if recorded */}
                                    {recordedAudios[currentTurnIndex] && (
                                        <div className="p-3.5 rounded-2xl bg-neutral-950 border border-emerald-800/40 flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => playRecordedAudio(currentTurnIndex, recordedAudios[currentTurnIndex].url)}
                                                    className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md"
                                                >
                                                    {isPlaying === currentTurnIndex ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                                    <span>{isPlaying === currentTurnIndex ? "Pause" : "Play Recording"}</span>
                                                </button>
                                            </div>
                                            <button
                                                onClick={startRecording}
                                                className="p-2 rounded-lg text-neutral-400 hover:text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                                            >
                                                <RotateCcw className="w-3.5 h-3.5" />
                                                <span>Re-record</span>
                                            </button>
                                        </div>
                                    )}

                                    {/* Navigation / Next Turn */}
                                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-800">
                                        <button
                                            onClick={() => setCurrentTurnIndex(Math.max(0, currentTurnIndex - 1))}
                                            disabled={currentTurnIndex === 0}
                                            className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-xs font-bold text-neutral-300 cursor-pointer"
                                        >
                                            Previous Turn
                                        </button>
                                        <button
                                            onClick={() => setCurrentTurnIndex(Math.min(activeTurns.length - 1, currentTurnIndex + 1))}
                                            disabled={currentTurnIndex === activeTurns.length - 1}
                                            className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-xs font-bold text-neutral-300 cursor-pointer"
                                        >
                                            Next Turn
                                        </button>
                                    </div>

                                    {/* Final Submit Button */}
                                    <button
                                        onClick={submitScenarioRecording}
                                        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm shadow-xl shadow-emerald-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
                                    >
                                        <CheckCircle2 className="w-5 h-5" />
                                        <span>Submit Completed Scenario</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* 3. TOPIC & SCENARIO EXPLORER (FOR SELECTED LANGUAGE) */
                    <div className="space-y-6 animate-fade-in">

                        {/* Language Active Banner with "Change Language" Button */}
                        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-xl backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2.5 mb-1">
                                    <div className="p-2 rounded-xl bg-gradient-to-r from-indigo-600 to-primary-600 text-white shadow-lg shadow-indigo-500/20">
                                        <Radio className="w-5 h-5" />
                                    </div>
                                    <h1 className="text-2xl font-black capitalize">Scripted Calls — {selectedLanguage.name}</h1>
                                    <span className="text-xs font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-700/50">
                                        ${selectedLanguage.hourlyPayout || 0}/hr
                                    </span>
                                </div>
                                <p className="text-xs text-neutral-400">
                                    Select any topic and scripted scenario below to record 2-person dialogue verses in {selectedLanguage.name}.
                                </p>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setSelectedLanguage(null)}
                                    className="px-4 py-2.5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                                >
                                    <Languages className="w-4 h-4 text-indigo-400" />
                                    <span>Change Language</span>
                                </button>
                            </div>
                        </div>

                        {/* Search & Topic Stats */}
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-neutral-900/60 p-4 rounded-2xl border border-neutral-800">
                            <div className="relative w-full sm:w-80">
                                <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder={`Search ${selectedLanguage.name} topics or scenarios...`}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-neutral-900 border border-neutral-700 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
                                />
                            </div>

                            <div className="flex items-center gap-2 text-xs font-bold text-neutral-400">
                                <span>Showing {filteredTopics.length} Topic Categories</span>
                            </div>
                        </div>

                        {/* Error Notification */}
                        {error && (
                            <div className="p-4 rounded-2xl bg-rose-900/30 border border-rose-700/50 text-rose-300 text-sm flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Topics and Scenarios List */}
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-24 text-neutral-500">
                                <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
                                <p className="text-sm font-bold">Loading {selectedLanguage.name} Topics...</p>
                            </div>
                        ) : filteredTopics.length === 0 ? (
                            <div className="text-center py-20 border border-dashed border-neutral-800 rounded-3xl bg-neutral-900/40 p-8 space-y-3">
                                <MessageSquare className="w-12 h-12 text-neutral-600 mx-auto" />
                                <h3 className="text-base font-bold text-neutral-300">No Scripted Topics in {selectedLanguage.name}</h3>
                                <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                                    There are currently no active scripted conversation scenarios in {selectedLanguage.name}. You can switch to another language or create topics in Admin Panel.
                                </p>
                                <button
                                    onClick={() => setSelectedLanguage(null)}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs mt-2 cursor-pointer shadow-lg shadow-indigo-600/20"
                                >
                                    <Languages className="w-3.5 h-3.5" />
                                    <span>Select Another Language</span>
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {filteredTopics.map((topic) => {
                                    const isExpanded = expandedTopics.has(topic._id);
                                    const scenarios = topic.subtopics || [];

                                    return (
                                        <div
                                            key={topic._id}
                                            className="bg-neutral-900/80 border border-neutral-800 rounded-3xl overflow-hidden shadow-lg transition-all"
                                        >
                                            {/* Topic Card Header */}
                                            <div
                                                onClick={() => toggleTopic(topic._id)}
                                                className="p-5 flex items-center justify-between gap-4 cursor-pointer hover:bg-neutral-800/60 select-none transition-colors"
                                            >
                                                <div className="flex items-center gap-3.5 min-w-0">
                                                    <div className="p-2 rounded-xl bg-neutral-800 text-neutral-300">
                                                        {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <h3 className="font-black text-white text-base">{topic.title}</h3>
                                                            <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-neutral-800 text-indigo-300 border border-neutral-700">
                                                                {scenarios.length} Scenarios Available
                                                            </span>
                                                        </div>
                                                        {topic.description && (
                                                            <p className="text-xs text-neutral-400 mt-1 line-clamp-1">
                                                                {topic.description}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                <button className="text-xs font-bold text-indigo-400 flex items-center gap-1">
                                                    <span>{isExpanded ? "Collapse" : "View Scenarios"}</span>
                                                </button>
                                            </div>

                                            {/* Scenarios Grid */}
                                            {isExpanded && (
                                                <div className="border-t border-neutral-800/80 bg-neutral-950/60 p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {scenarios.length === 0 ? (
                                                        <div className="col-span-2 text-center py-6 text-neutral-500 text-xs font-semibold">
                                                            No active scenarios in this topic right now.
                                                        </div>
                                                    ) : (
                                                        scenarios.map((scenario) => {
                                                            const turns = scenario.dialogueTurns || [];
                                                            return (
                                                                <div
                                                                    key={scenario._id}
                                                                    className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800/80 hover:border-indigo-500/50 flex flex-col justify-between gap-4 transition-all group"
                                                                >
                                                                    <div className="space-y-2">
                                                                        <div className="flex items-start justify-between gap-2">
                                                                            <h4 className="font-bold text-white text-sm group-hover:text-indigo-300 transition-colors">
                                                                                {scenario.title}
                                                                            </h4>
                                                                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-700/50 shrink-0">
                                                                                {turns.length} Turns
                                                                            </span>
                                                                        </div>

                                                                        {scenario.description && (
                                                                            <p className="text-xs text-neutral-400 line-clamp-2">
                                                                                {scenario.description}
                                                                            </p>
                                                                        )}
                                                                    </div>

                                                                    {/* Action Buttons: View Script & Claim */}
                                                                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-800/80">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setViewingScriptModal({ scenario, topic })}
                                                                            className="py-2.5 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white font-bold text-xs border border-neutral-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                                                                        >
                                                                            <FileText className="w-3.5 h-3.5 text-indigo-400" />
                                                                            <span>View Script</span>
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => startScenarioStudio(scenario, topic)}
                                                                            className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                                                        >
                                                                            <Mic className="w-3.5 h-3.5" />
                                                                            <span>Claim</span>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* VIEW FULL SCRIPT MODAL */}
                {viewingScriptModal && (
                    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
                        <div className="bg-neutral-900 border border-neutral-700 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                            {/* Modal Header */}
                            <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-indigo-400" />
                                        <h3 className="text-lg font-black text-white">
                                            {viewingScriptModal.scenario.title}
                                        </h3>
                                    </div>
                                    <p className="text-xs text-neutral-400">
                                        Topic: <span className="text-indigo-400 font-bold">{viewingScriptModal.topic.title}</span> • {viewingScriptModal.scenario.dialogueTurns?.length || 0} Turns
                                    </p>
                                </div>
                                <button
                                    onClick={() => setViewingScriptModal(null)}
                                    className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Modal Script Dialogue Content */}
                            <div className="p-6 overflow-y-auto space-y-4 flex-1">
                                {viewingScriptModal.scenario.description && (
                                    <div className="p-3.5 rounded-2xl bg-neutral-950/80 border border-neutral-800 text-xs text-neutral-400">
                                        <span className="font-bold text-neutral-300 block mb-1">Scenario Context:</span>
                                        {viewingScriptModal.scenario.description}
                                    </div>
                                )}

                                {(() => {
                                    const userGen = (userInfo?.gender || "").toLowerCase().trim();
                                    const s1Gen = (viewingScriptModal.scenario.speaker1Gender || "any").toLowerCase().trim();
                                    const s2Gen = (viewingScriptModal.scenario.speaker2Gender || "any").toLowerCase().trim();
                                    let modalRole = "speaker1";
                                    if (userGen === "female") {
                                        if (s1Gen === "female" && s2Gen !== "female") modalRole = "speaker1";
                                        else if (s2Gen === "female" && s1Gen !== "female") modalRole = "speaker2";
                                        else if (viewingScriptModal.scenario.eligibleRoles?.[0]) modalRole = viewingScriptModal.scenario.eligibleRoles[0];
                                    } else if (userGen === "male") {
                                        if (s1Gen === "male" && s2Gen !== "male") modalRole = "speaker1";
                                        else if (s2Gen === "male" && s1Gen !== "male") modalRole = "speaker2";
                                        else if (viewingScriptModal.scenario.eligibleRoles?.[0]) modalRole = viewingScriptModal.scenario.eligibleRoles[0];
                                    } else if (viewingScriptModal.scenario.eligibleRoles?.[0]) {
                                        modalRole = viewingScriptModal.scenario.eligibleRoles[0];
                                    }

                                    return (
                                        <div className="space-y-3">
                                            {(viewingScriptModal.scenario.dialogueTurns || []).map((turn, i) => (
                                                <div key={i} className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800/80 space-y-1.5">
                                                    <div className="flex items-center justify-between text-[10px] font-extrabold uppercase text-neutral-500 tracking-wider">
                                                        <span>Verse {i + 1} of {(viewingScriptModal.scenario.dialogueTurns || []).length}</span>
                                                        <span className="text-indigo-400 font-bold">Your Line to Read</span>
                                                    </div>
                                                    <p className="text-sm font-semibold text-neutral-200 leading-relaxed">
                                                        "{turn[modalRole] || "—"}"
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Modal Footer Actions */}
                            <div className="p-5 border-t border-neutral-800 bg-neutral-950 flex items-center justify-between gap-3">
                                <button
                                    onClick={() => setViewingScriptModal(null)}
                                    className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-neutral-300 cursor-pointer"
                                >
                                    Close
                                </button>
                                <button
                                    onClick={() => {
                                        const { scenario, topic } = viewingScriptModal;
                                        setViewingScriptModal(null);
                                        startScenarioStudio(scenario, topic);
                                    }}
                                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/25 flex items-center gap-2 cursor-pointer transition-all"
                                >
                                    <Mic className="w-4 h-4" />
                                    <span>Claim & Record</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
