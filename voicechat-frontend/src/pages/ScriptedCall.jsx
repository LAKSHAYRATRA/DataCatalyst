import React, { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

export default function ScriptedCall() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const urlSubtopicId = searchParams.get("subtopicId");
    const urlLanguage = searchParams.get("language");
    const hasAutoOpenedRef = useRef(false);

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
    const [existingSubmission, setExistingSubmission] = useState(null); // Previous submission with approval/rejection status

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

    const [myApps, setMyApps] = useState([]);
    const [myReRecords, setMyReRecords] = useState([]);

    // Direct Deep-Link to Scenario Studio from Dashboard Action Required Banner
    useEffect(() => {
        if (!urlSubtopicId || languages.length === 0 || hasAutoOpenedRef.current) return;

        hasAutoOpenedRef.current = true;
        (async () => {
            try {
                // Find target language
                let targetLang = null;
                if (urlLanguage) {
                    targetLang = languages.find(l => 
                        (l.code && l.code.toLowerCase() === urlLanguage.toLowerCase()) ||
                        (l.name && l.name.toLowerCase() === urlLanguage.toLowerCase()) ||
                        (l.language && l.language.toLowerCase() === urlLanguage.toLowerCase())
                    );
                }
                if (!targetLang && languages.length > 0) {
                    targetLang = languages.find(l => l.code === "english" || l.language?.toLowerCase() === "english") || languages[0];
                }
                if (targetLang) {
                    setSelectedLanguage(targetLang);
                }

                // Load topics
                const langCode = targetLang?.code || urlLanguage || "english";
                const topicRes = await apiGet(`/api/scripted-topics/enabled?language=${encodeURIComponent(langCode)}`);
                const loaded = topicRes?.topics || [];
                setTopics(loaded);
                setExpandedTopics(new Set(loaded.map(t => t._id)));

                // Locate scenario and launch studio
                let opened = false;
                for (const t of loaded) {
                    const foundSub = (t.subtopics || []).find(s => String(s._id) === String(urlSubtopicId));
                    if (foundSub) {
                        await startScenarioStudio(foundSub, t);
                        opened = true;
                        break;
                    }
                }

                // Fallback: check myReRecords if not in loaded list
                if (!opened && myReRecords.length > 0) {
                    const matchedRec = myReRecords.find(r => String(r.subtopicId) === String(urlSubtopicId));
                    if (matchedRec) {
                        await handleFixReRecord(matchedRec);
                    }
                }
            } catch (e) {
                console.error("Auto-open scenario error:", e);
            }
        })();
    }, [urlSubtopicId, languages, myReRecords]);

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

            try {
                const [appsRes, rerecordRes] = await Promise.all([
                    apiGet("/api/language-applications/my").catch(() => ({ applications: [] })),
                    apiGet("/api/scripted-topics/my-rerecords").catch(() => ({ rerecords: [] }))
                ]);
                setMyApps(appsRes?.applications || []);
                setMyReRecords(rerecordRes?.rerecords || []);
            } catch (err) {
                console.error("Failed to load user applications or rerecords:", err);
            }

            setLanguages(langList);

            // Only auto-select language if explicitly provided in URL params (?lang=)
            if (urlLanguage) {
                const matched = langList.find(l => 
                    (l.code && l.code.toLowerCase() === urlLanguage.toLowerCase()) ||
                    (l.name && l.name.toLowerCase() === urlLanguage.toLowerCase()) ||
                    (l.language && l.language.toLowerCase() === urlLanguage.toLowerCase())
                );
                if (matched && !selectedLanguage) {
                    setSelectedLanguage(matched);
                }
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    function getScriptedStatus(code) {
        return myApps.find(a => a.languageCode === code && a.applicationType === 'scripted_call')?.status || null;
    }

    function getBaseLanguage(lang) {
        if (lang.language) return String(lang.language).trim().toLowerCase();
        const match = lang.name?.match(/\(([^)]+)\)$/);
        if (match) return match[1].trim().toLowerCase();
        return (lang.name || lang.code || "").trim().toLowerCase();
    }

    const [randomApplyScriptedLang, setRandomApplyScriptedLang] = useState(null);

    // Pick randomly ONE unapplied scripted subproject in the SAME language the user is approved for
    useEffect(() => {
        if (!languages || languages.length === 0) return;
        const approvedBaseLangs = new Set();
        (myApps || []).forEach(a => {
            if (a.applicationType === 'scripted_call' && a.status === 'approved') {
                const matchLang = languages.find(l => l.code === a.languageCode);
                if (matchLang) {
                    approvedBaseLangs.add(getBaseLanguage(matchLang));
                }
            }
        });

        const eligibleUnapplied = languages.filter(l => {
            const st = getScriptedStatus(l.code);
            const baseLang = getBaseLanguage(l);
            return !st && approvedBaseLangs.has(baseLang);
        });

        if (eligibleUnapplied.length > 0) {
            const chosen = eligibleUnapplied[Math.floor(Math.random() * eligibleUnapplied.length)];
            setRandomApplyScriptedLang(chosen);
        } else {
            setRandomApplyScriptedLang(null);
        }
    }, [languages, myApps]);

    const displayScriptedLanguages = languages;

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

    const handleFixReRecord = async (item) => {
        try {
            setLoading(true);
            setError("");

            // 1. Identify matching language object
            let targetLang = languages.find(l => 
                (l.code && l.code.toLowerCase() === (item.language || "").toLowerCase()) ||
                (l.name && l.name.toLowerCase() === (item.language || "").toLowerCase()) ||
                (l.language && l.language.toLowerCase() === (item.language || "").toLowerCase())
            );
            if (!targetLang && languages.length > 0) {
                targetLang = languages.find(l => l.code === "english" || l.language?.toLowerCase() === "english") || languages[0];
            }

            if (targetLang) {
                setSelectedLanguage(targetLang);
            }

            // 2. Query enabled topics for this language
            const langParam = targetLang?.code || item.language || "english";
            const topicRes = await apiGet(`/api/scripted-topics/enabled?language=${encodeURIComponent(langParam)}`);
            const loaded = topicRes?.topics || [];
            setTopics(loaded);
            setExpandedTopics(new Set(loaded.map(t => t._id)));

            // 3. Find the scenario inside loaded topics
            let scenarioObj = null;
            let topicObj = null;
            for (const t of loaded) {
                const sub = (t.subtopics || []).find(s => String(s._id) === String(item.subtopicId));
                if (sub) {
                    scenarioObj = sub;
                    topicObj = t;
                    break;
                }
            }

            // 4. Fallback if not found in loaded list
            if (!scenarioObj) {
                scenarioObj = item.scenario || {
                    _id: item.subtopicId,
                    title: item.scenarioTitle,
                    dialogueTurns: item.verses || [],
                    isReRecord: true,
                    eligibleRoles: [item.role]
                };
                topicObj = { _id: item.topicId, title: item.topicTitle };
            }

            // 5. Open recording studio directly!
            await startScenarioStudio(scenarioObj, topicObj);
        } catch (err) {
            console.error("Failed to start re-record studio:", err);
            setError("Failed to open studio for re-recording: " + (err.message || "Unknown error"));
        } finally {
            setLoading(false);
        }
    };

    const startScenarioStudio = async (scenario, topic) => {
        let assignedRole = "speaker1";

        // Check if user already has an existing submission for this scenario (e.g. with QA approval/rejection status)
        let subStatus = null;
        try {
            const statusData = await apiGet(`/api/scripted-topics/submission-status/${scenario._id}`);
            if (statusData && statusData.submission) {
                subStatus = statusData.submission;
                setExistingSubmission(subStatus);
                if (subStatus.role) assignedRole = subStatus.role;
            } else {
                setExistingSubmission(null);
            }
        } catch (_) {
            setExistingSubmission(null);
        }

        if (!subStatus) {
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

            // Pre-fill existing recorded audio URLs if existing submission exists
            const prefilledAudios = {};
            if (subStatus && subStatus.verses) {
                subStatus.verses.forEach(v => {
                    const fullAudioUrl = v.audioUrl ? (v.audioUrl.startsWith("http") ? v.audioUrl : `${BACKEND_URL}${v.audioUrl}`) : null;
                    prefilledAudios[v.turnIndex] = {
                        url: fullAudioUrl,
                        isExisting: true,
                        status: v.status || "pending",
                        rejectionReason: v.rejectionReason,
                        reviewNote: v.reviewNote,
                        hasNewTake: false
                    };
                });
            }

            // Find first rejected turn index if any, to jump straight to re-recording
            let initialTurnIndex = 0;
            if (subStatus && subStatus.verses) {
                const firstRejected = subStatus.verses.find(v => v.status === "rejected");
                if (firstRejected && firstRejected.turnIndex !== undefined) {
                    initialTurnIndex = firstRejected.turnIndex;
                }
            }

            setActiveScenario(scenario);
            setActiveTopic(topic);
            setSelectedRole(assignedRole);
            setCurrentTurnIndex(initialTurnIndex);
            setRecordedAudios(prefilledAudios);
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
        const hasUnsavedNewTakes = Object.values(recordedAudios).some(a => a.hasNewTake);
        if (hasUnsavedNewTakes) {
            Swal.fire({
                title: 'Exit Scenario?',
                text: 'Your newly recorded takes will be cleared and the scenario role will be released.',
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
                    setExistingSubmission(null);
                    setRecordedAudios({});
                    loadTopics(selectedLanguage?.code || selectedLanguage);
                }
            });
        } else {
            await releaseCurrentClaim();
            setActiveScenario(null);
            setActiveTopic(null);
            setExistingSubmission(null);
            setRecordedAudios({});
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
                    [currentTurnIndex]: {
                        blob: audioBlob,
                        url: audioUrl,
                        hasNewTake: true,
                        status: "new_take"
                    }
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
                setExistingSubmission(null);
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

    const submitRerecordedVerses = async () => {
        const turns = activeScenario.dialogueTurns || [];
        const rejectedVerses = (existingSubmission?.verses || []).filter(v => v.status === "rejected");
        const pendingReRecordIndices = rejectedVerses.map(v => v.turnIndex);

        // Check if user recorded new takes for all rejected verses
        const missingNewTakes = pendingReRecordIndices.filter(idx => !recordedAudios[idx]?.hasNewTake && !recordedAudios[idx]?.blob);

        if (missingNewTakes.length > 0) {
            Swal.fire({
                title: 'Incomplete Re-recording',
                text: `Please re-record all ${rejectedVerses.length} rejected verse(s) before submitting. (${missingNewTakes.length} remaining)`,
                icon: 'warning',
                confirmButtonColor: '#6366f1'
            });
            return;
        }

        Swal.fire({
            title: 'Submitting Re-recorded Verses',
            text: 'Uploading updated audio for QA audit...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const formData = new FormData();
            formData.append("submissionId", existingSubmission._id);
            formData.append("subtopicId", activeScenario._id);
            formData.append("role", selectedRole);

            const versesMeta = [];
            pendingReRecordIndices.forEach((idx, i) => {
                const item = recordedAudios[idx];
                if (item && item.blob) {
                    formData.append(`audio_${i}`, item.blob, `turn_${idx}.webm`);
                    versesMeta.push({
                        turnIndex: idx,
                        durationSec: item.duration || 0,
                        text: selectedRole === "speaker1" ? turns[idx]?.speaker1 : turns[idx]?.speaker2
                    });
                }
            });

            formData.append("versesMeta", JSON.stringify(versesMeta));

            await apiFetch("/api/scripted-topics/rerecord-verses", {
                method: "POST",
                body: formData
            });

            if (heartbeatIntervalRef.current) {
                clearInterval(heartbeatIntervalRef.current);
                heartbeatIntervalRef.current = null;
            }
            currentClaimIdRef.current = null;
            currentSubtopicIdRef.current = null;

            Swal.fire({
                icon: 'success',
                title: 'Re-recorded Verses Submitted!',
                text: 'Your updated verses have been sent back to QA for review.',
                confirmButtonColor: '#6366f1'
            }).then(() => {
                setActiveScenario(null);
                setActiveTopic(null);
                setExistingSubmission(null);
                setRecordedAudios({});
                loadTopics(selectedLanguage.code || selectedLanguage);
            });
        } catch (err) {
            Swal.fire({
                icon: 'error',
                title: 'Submission Failed',
                text: err.message || 'Failed to submit re-recorded verses',
                confirmButtonColor: '#6366f1'
            });
        }
    };

    // Extract all dialogue scripts across all topics for direct display without accordions
    const allScenarios = useMemo(() => {
        const list = [];
        (topics || []).forEach(t => {
            (t.subtopics || []).forEach(s => {
                list.push({
                    ...s,
                    topicId: t._id,
                    topicTitle: t.title,
                    topicDescription: t.description,
                    parentTopic: t
                });
            });
        });
        return list;
    }, [topics]);

    const filteredScenarios = useMemo(() => {
        if (!searchQuery.trim()) return allScenarios;
        const q = searchQuery.toLowerCase().trim();
        return allScenarios.filter(s => 
            s.title?.toLowerCase().includes(q) ||
            (s.description || "").toLowerCase().includes(q) ||
            (s.topicTitle || "").toLowerCase().includes(q) ||
            (s.dialogueTurns || []).some(turn => 
                (turn.speaker1 || "").toLowerCase().includes(q) ||
                (turn.speaker2 || "").toLowerCase().includes(q)
            )
        );
    }, [allScenarios, searchQuery]);

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

                {/* ACTION REQUIRED: PENDING RE-RECORDINGS BANNER */}
                {myReRecords.length > 0 && (
                    <div className="p-5 rounded-3xl bg-gradient-to-r from-rose-950/90 via-rose-900/60 to-amber-950/70 border-2 border-rose-600/80 shadow-2xl shadow-rose-950/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-pulse">
                        <div className="flex items-center gap-3.5">
                            <div className="p-3 rounded-2xl bg-rose-600 text-white shadow-lg shadow-rose-600/40 shrink-0">
                                <AlertCircle className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-base font-black text-white">Action Required: Re-record Flagged Verses</h3>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-500 text-white">
                                        {myReRecords.length} Scenario{myReRecords.length > 1 ? "s" : ""}
                                    </span>
                                </div>
                                <p className="text-xs text-rose-200 mt-0.5">
                                    Our QA team audited your scripted calls and requested a quick re-take on specific verses.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            {myReRecords.map(item => (
                                <button
                                    key={item.submissionId}
                                    onClick={() => handleFixReRecord(item)}
                                    className="px-4 py-2.5 rounded-xl bg-white hover:bg-neutral-100 text-rose-950 font-black text-xs shadow-lg transition-all flex items-center gap-1.5 cursor-pointer"
                                >
                                    <span>Fix {item.scenarioTitle} →</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

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
                        ) : displayScriptedLanguages.length === 0 ? (
                            <div className="text-center py-16 border border-dashed border-neutral-800 rounded-3xl bg-neutral-900/40 p-8 space-y-4 max-w-lg mx-auto">
                                <div className="w-14 h-14 rounded-2xl bg-indigo-950/60 border border-indigo-800/40 flex items-center justify-center text-indigo-400 mx-auto">
                                    <Radio className="w-7 h-7" />
                                </div>
                                <h3 className="text-lg font-bold text-neutral-200">No Approved Scripted Languages</h3>
                                <p className="text-xs text-neutral-400 leading-relaxed">
                                    You have not been approved for any scripted conversation languages yet. Submit a voice sample under Project Apply in the sidebar to get started.
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
                                {displayScriptedLanguages.map((lang) => {
                                    const status = getScriptedStatus(lang.code);
                                    const isApproved = status === 'approved';
                                    const isPending = status === 'pending';
                                    const isRejected = status === 'rejected';

                                    return (
                                        <div
                                            key={lang._id || lang.code}
                                            className={`group relative bg-neutral-900/90 border rounded-3xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300 flex flex-col justify-between overflow-hidden ${
                                                isApproved 
                                                    ? 'border-neutral-800 hover:border-emerald-500/80 hover:shadow-emerald-500/10' 
                                                    : isPending
                                                    ? 'border-amber-900/50 bg-amber-950/10'
                                                    : 'border-neutral-800 hover:border-primary-500/80 hover:shadow-primary-500/10'
                                            }`}
                                        >
                                            {/* Glow Accent */}
                                            <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl transition-all pointer-events-none ${
                                                isApproved ? 'bg-emerald-500/10 group-hover:bg-emerald-500/20' : 'bg-primary-500/10 group-hover:bg-primary-500/20'
                                            }`} />

                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className={`p-2.5 rounded-2xl border ${
                                                        isApproved 
                                                            ? 'bg-emerald-950/60 border-emerald-800/40 text-emerald-400' 
                                                            : isPending
                                                            ? 'bg-amber-950/60 border-amber-800/40 text-amber-400'
                                                            : 'bg-primary-950/60 border-primary-800/40 text-primary-400'
                                                    }`}>
                                                        <Radio className="w-5 h-5" />
                                                    </div>

                                                    {/* Status Badge */}
                                                    {isApproved ? (
                                                        <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 flex items-center gap-1">
                                                            <CheckCircle2 className="w-3 h-3" />
                                                            <span>Approved</span>
                                                        </span>
                                                    ) : isPending ? (
                                                        <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full bg-amber-900/60 text-amber-300 border border-amber-700/50 flex items-center gap-1">
                                                            <Clock className="w-3 h-3" />
                                                            <span>Under Review</span>
                                                        </span>
                                                    ) : isRejected ? (
                                                        <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full bg-rose-900/60 text-rose-300 border border-rose-700/50 flex items-center gap-1">
                                                            <AlertCircle className="w-3 h-3" />
                                                            <span>Rejected</span>
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full bg-primary-950 text-primary-300 border border-primary-800/60 flex items-center gap-1">
                                                            <Sparkles className="w-3 h-3 text-primary-400" />
                                                            <span>Apply Available</span>
                                                        </span>
                                                    )}
                                                </div>

                                                <div>
                                                    <h3 className="text-xl font-black text-white group-hover:text-primary-300 transition-colors">
                                                        {lang.name}
                                                    </h3>
                                                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                        {lang.enableCallRoles ? (
                                                            <span className="text-[10px] font-bold text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800/60">
                                                                🎭 {lang.role1 || "Role 1"} vs {lang.role2 || "Role 2"}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                                                                ⚪ Scripted Conversation
                                                            </span>
                                                        )}
                                                        {lang.noisy && (
                                                            <span className="text-[10px] font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800/60">
                                                                ⚠️ Noisy
                                                            </span>
                                                        )}
                                                    </div>
                                                    {lang.hourlyPayout !== undefined && (
                                                        <p className="text-sm font-extrabold text-emerald-400 mt-2.5 font-mono">
                                                            ${Number(lang.hourlyPayout || 0).toFixed(2)} <span className="text-xs text-neutral-400 font-normal">/ hour</span>
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Action Buttons: Open Studio if Approved, Apply if Not Enrolled */}
                                            <div className="mt-6">
                                                {isApproved ? (
                                                    <button
                                                        onClick={() => setSelectedLanguage(lang)}
                                                        className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
                                                    >
                                                        <span>Open Scripts</span>
                                                        <ChevronRight className="w-4 h-4" />
                                                    </button>
                                                ) : isPending ? (
                                                    <button
                                                        disabled
                                                        className="w-full py-3 rounded-2xl font-bold text-xs bg-amber-950/60 text-amber-300/80 border border-amber-800/40 cursor-not-allowed flex items-center justify-center gap-2"
                                                    >
                                                        <Clock className="w-4 h-4" />
                                                        <span>Application Pending Review</span>
                                                    </button>
                                                ) : isRejected ? (
                                                    <button
                                                        onClick={() => navigate(`/language-apply?type=scripted_call&code=${encodeURIComponent(lang.code)}`)}
                                                        className="w-full py-3 rounded-2xl font-bold text-xs bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                                                    >
                                                        <span>Re-Apply for Scripted Call</span>
                                                        <ChevronRight className="w-4 h-4" />
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => navigate(`/language-apply?type=scripted_call&code=${encodeURIComponent(lang.code)}`)}
                                                        className="w-full py-3 rounded-2xl font-bold text-xs bg-primary-600 hover:bg-primary-500 text-white shadow-lg shadow-primary-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
                                                    >
                                                        <span>Apply for Project</span>
                                                        <ChevronRight className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
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
                                    <span>
                                        {selectedRole === "speaker1" 
                                            ? (selectedLanguage?.enableCallRoles ? (selectedLanguage.role1 || "Role 1") : "Speaker 1")
                                            : (selectedLanguage?.enableCallRoles ? (selectedLanguage.role2 || "Role 2") : "Speaker 2")}
                                    </span>
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
                                    <span className="text-xs font-mono font-bold text-neutral-400">
                                        {existingSubmission?.verses?.some(v => v.status === "rejected") ? (
                                            <span className="text-rose-400">
                                                {activeTurns.filter((_, idx) => recordedAudios[idx]?.hasNewTake).length} of {existingSubmission.verses.filter(v => v.status === "rejected").length} Flagged Verses Re-recorded
                                            </span>
                                        ) : (
                                            <span>
                                                {Object.keys(recordedAudios).length} of {activeTurns.length} Verses Recorded
                                            </span>
                                        )}
                                    </span>
                                </div>

                                <div className="space-y-4">
                                    {activeTurns.map((turn, idx) => {
                                        const isCurrent = currentTurnIndex === idx;
                                        const recordedItem = recordedAudios[idx];
                                        const isRecorded = !!recordedItem;
                                        const myVerse = selectedRole === "speaker1" ? turn.speaker1 : turn.speaker2;
                                        const myRoleName = selectedRole === "speaker1"
                                            ? (selectedLanguage?.enableCallRoles ? (selectedLanguage.role1 || "Role 1") : "Speaker 1")
                                            : (selectedLanguage?.enableCallRoles ? (selectedLanguage.role2 || "Role 2") : "Speaker 2");

                                        // Lookup review status for this verse
                                        const verseReview = existingSubmission?.verses?.find(v => Number(v.turnIndex) === idx);
                                        const isApproved = verseReview?.status === "approved";
                                        const isRejected = verseReview?.status === "rejected";
                                        const isPending = verseReview?.status === "pending";

                                        return (
                                            <div
                                                key={idx}
                                                onClick={() => setCurrentTurnIndex(idx)}
                                                className={`p-5 rounded-2xl border transition-all cursor-pointer ${
                                                    isCurrent 
                                                        ? isRejected
                                                            ? "bg-rose-950/30 border-rose-500 shadow-xl shadow-rose-500/10 ring-2 ring-rose-500"
                                                            : isApproved
                                                            ? "bg-emerald-950/30 border-emerald-500 shadow-xl shadow-emerald-500/10 ring-2 ring-emerald-500"
                                                            : "bg-neutral-900 border-indigo-500 shadow-xl shadow-indigo-500/10 ring-2 ring-indigo-500" 
                                                        : isRejected
                                                        ? "bg-rose-950/20 border-rose-800/60 hover:border-rose-600/80"
                                                        : isApproved
                                                        ? "bg-emerald-950/20 border-emerald-800/50 hover:border-emerald-700/70"
                                                        : "bg-neutral-900/60 border-neutral-800/80 hover:border-neutral-700"
                                                }`}
                                            >
                                                {/* Header with Status Badge */}
                                                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-6 h-6 rounded-full bg-neutral-800 text-neutral-300 font-mono text-xs font-black flex items-center justify-center">
                                                            {idx + 1}
                                                        </span>
                                                        <span className="text-xs font-bold text-neutral-400 uppercase tracking-wide">
                                                            Turn {idx + 1}
                                                        </span>
                                                    </div>

                                                    {/* Status Badges: Approved in Green, Re-record in Red */}
                                                    <div>
                                                        {isApproved ? (
                                                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-900/80 text-emerald-300 border border-emerald-600/60 text-xs font-black shadow-sm">
                                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                                <span>Approved</span>
                                                            </div>
                                                        ) : isRejected ? (
                                                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-900/90 text-rose-200 border border-rose-600 text-xs font-black shadow-md shadow-rose-900/40 animate-pulse">
                                                                <AlertCircle className="w-3.5 h-3.5 text-rose-300" />
                                                                <span>Re-record</span>
                                                            </div>
                                                        ) : isPending ? (
                                                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-900/60 text-amber-300 border border-amber-600/50 text-xs font-bold">
                                                                <Clock className="w-3.5 h-3.5" />
                                                                <span>Pending QA</span>
                                                            </div>
                                                        ) : isRecorded ? (
                                                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 text-xs font-bold">
                                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                                <span>Recorded</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-[11px] font-bold text-neutral-500">
                                                                Not Recorded Yet
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Reviewer Note Banner for Rejected Verses */}
                                                {isRejected && (
                                                    <div className="mb-3 p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-xs space-y-1">
                                                        <div className="flex items-center gap-1.5 font-bold text-rose-300">
                                                            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                                                            <span>QA Feedback: {verseReview.rejectionReason || "Needs Re-recording"}</span>
                                                        </div>
                                                        {verseReview.reviewNote && (
                                                            <div className="pl-5 text-neutral-200 text-xs font-medium">
                                                                <span className="font-bold text-rose-400">Reviewer Note: </span>
                                                                "{verseReview.reviewNote}"
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Contributor's Assigned Verse To Read */}
                                                <div className={`p-4 rounded-xl border ${
                                                    isApproved
                                                        ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-100"
                                                        : isRejected
                                                        ? "bg-rose-950/30 border-rose-800/40 text-rose-100"
                                                        : selectedRole === "speaker1" 
                                                        ? "bg-blue-950/40 border-blue-800/50 text-blue-100" 
                                                        : "bg-emerald-950/40 border-emerald-800/50 text-emerald-100"
                                                }`}>
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                                            Your Verse to Read ({myRoleName})
                                                        </span>
                                                        {isCurrent && (
                                                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                                                                isRejected ? "bg-rose-600 text-white" : isApproved ? "bg-emerald-600 text-white" : "bg-indigo-600 text-white"
                                                            }`}>
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
                                <div className="sticky top-6 bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-5 shadow-2xl">
                                    <div className="border-b border-neutral-800 pb-3 flex items-center justify-between">
                                        <div>
                                            <h4 className="text-base font-bold text-white flex items-center gap-2">
                                                <Mic className="w-5 h-5 text-indigo-400" />
                                                <span>Recording Studio</span>
                                            </h4>
                                            <p className="text-xs text-neutral-400 mt-0.5">
                                                Turn {currentTurnIndex + 1} of {activeTurns.length}
                                            </p>
                                        </div>

                                        {/* Status Badge for Current Turn */}
                                        {existingSubmission?.verses?.find(v => Number(v.turnIndex) === currentTurnIndex)?.status === "approved" ? (
                                            <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-emerald-900/80 text-emerald-300 border border-emerald-600/50">
                                                Approved
                                            </span>
                                        ) : existingSubmission?.verses?.find(v => Number(v.turnIndex) === currentTurnIndex)?.status === "rejected" ? (
                                            <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-rose-900/80 text-rose-300 border border-rose-600/50 animate-pulse">
                                                Re-record
                                            </span>
                                        ) : null}
                                    </div>

                                    {/* Active Target Line Display */}
                                    <div className={`p-4 rounded-2xl border space-y-2 ${
                                        existingSubmission?.verses?.find(v => Number(v.turnIndex) === currentTurnIndex)?.status === "rejected"
                                            ? "bg-rose-950/40 border-rose-800/60"
                                            : existingSubmission?.verses?.find(v => Number(v.turnIndex) === currentTurnIndex)?.status === "approved"
                                            ? "bg-emerald-950/30 border-emerald-800/60"
                                            : "bg-neutral-950 border-neutral-800"
                                    }`}>
                                        <span className={`text-[10px] font-extrabold uppercase block ${
                                            existingSubmission?.verses?.find(v => Number(v.turnIndex) === currentTurnIndex)?.status === "rejected"
                                                ? "text-rose-400"
                                                : existingSubmission?.verses?.find(v => Number(v.turnIndex) === currentTurnIndex)?.status === "approved"
                                                ? "text-emerald-400"
                                                : "text-indigo-400"
                                        }`}>
                                            Currently Reading Verse:
                                        </span>
                                        <p className="text-sm font-bold text-white leading-relaxed">
                                            "{selectedRole === "speaker1" ? activeTurns[currentTurnIndex]?.speaker1 : activeTurns[currentTurnIndex]?.speaker2}"
                                        </p>
                                    </div>

                                    {/* QA Reviewer Note Display in Studio Console */}
                                    {existingSubmission?.verses?.find(v => Number(v.turnIndex) === currentTurnIndex)?.status === "rejected" && (
                                        <div className="p-3.5 rounded-xl bg-rose-900/30 border border-rose-700/60 text-xs space-y-1">
                                            <div className="font-bold text-rose-300 flex items-center gap-1.5">
                                                <AlertCircle className="w-4 h-4 text-rose-400" />
                                                <span>QA Reason: {existingSubmission.verses.find(v => Number(v.turnIndex) === currentTurnIndex)?.rejectionReason}</span>
                                            </div>
                                            {existingSubmission.verses.find(v => Number(v.turnIndex) === currentTurnIndex)?.reviewNote && (
                                                <p className="text-rose-200 pl-5 text-[11px]">
                                                    <span className="font-bold text-rose-400">Reviewer Note: </span>
                                                    "{existingSubmission.verses.find(v => Number(v.turnIndex) === currentTurnIndex)?.reviewNote}"
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Recording Button */}
                                    <div className="flex flex-col items-center justify-center py-3 space-y-3">
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
                                                className={`w-20 h-20 rounded-full text-white flex items-center justify-center shadow-xl hover:scale-105 transition-all cursor-pointer ${
                                                    existingSubmission?.verses?.find(v => Number(v.turnIndex) === currentTurnIndex)?.status === "rejected"
                                                        ? "bg-rose-600 hover:bg-rose-500 shadow-rose-600/30"
                                                        : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30"
                                                }`}
                                                title="Start Recording Verse"
                                            >
                                                <Mic className="w-8 h-8" />
                                            </button>
                                        )}

                                        <span className="text-xs font-bold text-neutral-400">
                                            {isRecording 
                                                ? "Recording in progress... Click to stop." 
                                                : existingSubmission?.verses?.find(v => Number(v.turnIndex) === currentTurnIndex)?.status === "rejected"
                                                ? "Click mic to record new take for this verse"
                                                : "Click microphone to record this verse"}
                                        </span>
                                    </div>

                                    {/* Playback Preview if recorded */}
                                    {recordedAudios[currentTurnIndex] && (
                                        <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => playRecordedAudio(currentTurnIndex, recordedAudios[currentTurnIndex].url)}
                                                    className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md"
                                                >
                                                    {isPlaying === currentTurnIndex ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                                    <span>{isPlaying === currentTurnIndex ? "Pause" : recordedAudios[currentTurnIndex].hasNewTake ? "Play New Take" : "Play Recording"}</span>
                                                </button>
                                            </div>
                                            <button
                                                onClick={startRecording}
                                                className="p-2 rounded-lg text-neutral-400 hover:text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                                            >
                                                <RotateCcw className="w-3.5 h-3.5" />
                                                <span>Retake</span>
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

                                    {/* Submit Button: Re-record Mode vs Standard Submit */}
                                    {existingSubmission?.verses?.some(v => v.status === "rejected") ? (
                                        <button
                                            onClick={submitRerecordedVerses}
                                            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-black text-sm shadow-xl shadow-rose-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
                                        >
                                            <CheckCircle2 className="w-5 h-5" />
                                            <span>Submit Re-recorded Verses</span>
                                        </button>
                                    ) : (
                                        <button
                                            onClick={submitScenarioRecording}
                                            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm shadow-xl shadow-emerald-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
                                        >
                                            <CheckCircle2 className="w-5 h-5" />
                                            <span>Submit Completed Scenario</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* 3. TOPIC & SCENARIO EXPLORER (FOR SELECTED LANGUAGE) */
                    <div className="space-y-6 animate-fade-in">

                        {/* Language Active Banner with Back Button */}
                        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-xl backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="space-y-2">
                                <button
                                    onClick={() => {
                                        setSelectedLanguage(null);
                                        setTopics([]);
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-neutral-300 border border-neutral-700/60 transition-all cursor-pointer shadow-sm"
                                    title="View All Scripted Languages"
                                >
                                    <ArrowLeft className="w-4 h-4 text-indigo-400" />
                                    <span>← Back to Languages</span>
                                </button>
                                <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                                    <div className="p-2 rounded-xl bg-gradient-to-r from-indigo-600 to-primary-600 text-white shadow-lg shadow-indigo-500/20">
                                        <Radio className="w-5 h-5" />
                                    </div>
                                    <h1 className="text-2xl font-black capitalize">Scripted Conversations — {selectedLanguage.name}</h1>
                                    <span className="text-xs font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-700/50">
                                        ${selectedLanguage.hourlyPayout || 0}/hr
                                    </span>
                                </div>
                                <p className="text-xs text-neutral-400">
                                    All available scripts in {selectedLanguage.name} are shown below. Preview any script or claim it directly to start recording.
                                </p>
                            </div>
                        </div>

                        {/* Search & Scripts Count Stats */}
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-neutral-900/60 p-4 rounded-2xl border border-neutral-800">
                            <div className="relative w-full sm:w-80">
                                <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder={`Search ${selectedLanguage.name} scripts by title, topic, or dialogue...`}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-neutral-900 border border-neutral-700 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
                                />
                            </div>

                            <div className="flex items-center gap-2 text-xs font-bold text-neutral-400">
                                <span>Showing {filteredScenarios.length} Dialogue Script{filteredScenarios.length === 1 ? "" : "s"}</span>
                            </div>
                        </div>

                        {/* Error Notification */}
                        {error && (
                            <div className="p-4 rounded-2xl bg-rose-900/30 border border-rose-700/50 text-rose-300 text-sm flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Direct Scripts Grid — All Scripts Immediately Visible to Claim */}
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-24 text-neutral-500">
                                <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
                                <p className="text-sm font-bold">Loading {selectedLanguage.name} Scripts...</p>
                            </div>
                        ) : filteredScenarios.length === 0 ? (
                            <div className="text-center py-20 border border-dashed border-neutral-800 rounded-3xl bg-neutral-900/40 p-8 space-y-3">
                                <MessageSquare className="w-12 h-12 text-neutral-600 mx-auto" />
                                <h3 className="text-base font-bold text-neutral-300">No Scripted Conversations Found</h3>
                                <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                                    {searchQuery ? "No scripts match your search criteria." : `There are currently no active scripted conversations in ${selectedLanguage.name}.`}
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {filteredScenarios.map((scenario) => {
                                    const turns = scenario.dialogueTurns || [];
                                    const isReRecord = !!scenario.isReRecord;
                                    const parentTopicObj = scenario.parentTopic || { _id: scenario.topicId, title: scenario.topicTitle };

                                    return (
                                        <div
                                            key={scenario._id}
                                            className={`p-6 rounded-3xl border flex flex-col justify-between gap-5 transition-all duration-200 group ${
                                                isReRecord
                                                    ? "bg-rose-950/25 border-rose-600/80 shadow-xl shadow-rose-950/40 hover:border-rose-500"
                                                    : "bg-neutral-900/90 border-neutral-800 hover:border-indigo-500/60 hover:shadow-xl hover:shadow-indigo-500/10"
                                            }`}
                                        >
                                            <div className="space-y-3">
                                                {/* Header: Topic Tag & Turns Count */}
                                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                                    <span className="text-[11px] font-bold text-indigo-300 bg-indigo-950/80 px-2.5 py-1 rounded-xl border border-indigo-800/60 truncate max-w-[180px]">
                                                        {scenario.topicTitle || "Scripted Conversation"}
                                                    </span>

                                                    {isReRecord ? (
                                                        <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-rose-900/90 text-rose-200 border border-rose-600 shadow-md shadow-rose-950/50 flex items-center gap-1 animate-pulse">
                                                            <AlertCircle className="w-3 h-3 text-rose-300" />
                                                            <span>Re-record Required ({scenario.rejectedVersesCount || 1} flagged)</span>
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                                                            {turns.length} Turns
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Title & Description */}
                                                <div>
                                                    <h4 className="font-black text-white text-base group-hover:text-indigo-300 transition-colors">
                                                        {scenario.title}
                                                    </h4>
                                                    {scenario.description && (
                                                        <p className="text-xs text-neutral-400 mt-1.5 line-clamp-2 leading-relaxed">
                                                            {scenario.description}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Preview dialogue snippet if available */}
                                                {(turns[0]?.speaker1 || turns[0]?.speaker2) && (
                                                    <div className="p-3 rounded-2xl bg-neutral-950/80 border border-neutral-800/80 space-y-1">
                                                        <div className="text-[10px] font-extrabold uppercase text-neutral-500 tracking-wider">
                                                            Dialogue Sample
                                                        </div>
                                                        <p className="text-xs text-neutral-300 italic line-clamp-2 leading-relaxed">
                                                            "{turns[0]?.speaker1 || turns[0]?.speaker2}"
                                                        </p>
                                                    </div>
                                                )}

                                                {isReRecord && scenario.rejectedReasons && scenario.rejectedReasons.length > 0 && (
                                                    <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-800 text-[11px] text-rose-200">
                                                        <span className="font-bold text-rose-400">QA Feedback: </span>
                                                        {scenario.rejectedReasons[0]}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Action Buttons: View Script & Claim */}
                                            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-neutral-800/80">
                                                <button
                                                    type="button"
                                                    onClick={() => setViewingScriptModal({ scenario, topic: parentTopicObj })}
                                                    className="py-2.5 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs border border-neutral-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                                                >
                                                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                                                    <span>View Script</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => startScenarioStudio(scenario, parentTopicObj)}
                                                    className={`py-2.5 px-3 rounded-xl text-white font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                                        isReRecord
                                                            ? "bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 shadow-rose-600/30"
                                                            : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/25"
                                                    }`}
                                                >
                                                    <Mic className="w-3.5 h-3.5" />
                                                    <span>{isReRecord ? "Re-record →" : "Claim"}</span>
                                                </button>
                                            </div>
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
