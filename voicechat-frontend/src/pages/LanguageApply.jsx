import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PhoneCall, FileText, CheckCircle2, Mic, Sliders, Volume2, Settings, X, Activity, Radio } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Swal from "sweetalert2";
import Nav from "../components/Nav.jsx";
import { apiGet } from "../lib/api.js";
import { encodeWAV } from "../utils/wavBuilder.js";

function calculateEbuR128Lufs(pcmSamples, sampleRate = 48000) {
  if (!pcmSamples || pcmSamples.length === 0) return null;

  const len = pcmSamples.length;
  const filtered = new Float32Array(len);

  // K-Weighting Filter Coefficients for 48kHz vs 44.1kHz
  let b0_1, b1_1, b2_1, a1_1, a2_1;
  let b0_2, b1_2, b2_2, a1_2, a2_2;

  if (Math.abs(sampleRate - 44100) < 1000) {
    // 44.1 kHz coefficients
    b0_1 = 1.53084123005035; b1_1 = -2.65097999815682; b2_1 = 1.16907907992956;
    a1_1 = -1.66367375253835; a2_1 = 0.71261405006450;
    b0_2 = 1.0; b1_2 = -2.0; b2_2 = 1.0;
    a1_2 = -1.98916967560867; a2_2 = 0.98919903522204;
  } else {
    // Default 48 kHz coefficients
    b0_1 = 1.53512485958697; b1_1 = -2.69169618940638; b2_1 = 1.19839281085285;
    a1_1 = -1.69065929318241; a2_1 = 0.71623787421588;
    b0_2 = 1.0; b1_2 = -2.0; b2_2 = 1.0;
    a1_2 = -1.99004745483398; a2_2 = 0.99007225036621;
  }

  let f1_z1 = 0, f1_z2 = 0;
  let f2_z1 = 0, f2_z2 = 0;

  for (let i = 0; i < len; i++) {
    const x = pcmSamples[i];
    const y1 = b0_1 * x + f1_z1;
    f1_z1 = b1_1 * x - a1_1 * y1 + f1_z2;
    f1_z2 = b2_1 * x - a2_1 * y1;

    const y2 = b0_2 * y1 + f2_z1;
    f2_z1 = b1_2 * y1 - a1_2 * y2 + f2_z2;
    f2_z2 = b2_2 * y1 - a2_2 * y2;

    filtered[i] = y2;
  }

  // ITU-R BS.1770-4 Standard Gating: 400ms window, 100ms step (Calibrated mono offset: -4.391 LUFS)
  const LUFS_OFFSET = -4.391;
  const windowSize = Math.floor(sampleRate * 0.4);
  const stepSize = Math.floor(sampleRate * 0.1);

  if (len < windowSize) {
    let sumSq = 0;
    for (let i = 0; i < len; i++) sumSq += filtered[i] * filtered[i];
    const ms = sumSq / len;
    if (ms <= 1e-12) return null;
    const l = LUFS_OFFSET + 10 * Math.log10(ms);
    return parseFloat(l.toFixed(1));
  }

  const blockMeanSquares = [];
  for (let start = 0; start + windowSize <= len; start += stepSize) {
    let sumSq = 0;
    for (let i = start; i < start + windowSize; i++) {
      sumSq += filtered[i] * filtered[i];
    }
    blockMeanSquares.push(sumSq / windowSize);
  }

  if (blockMeanSquares.length === 0) return null;

  // Absolute Threshold Gating (-70 LUFS)
  const absGatedMs = blockMeanSquares.filter(ms => {
    if (ms <= 1e-12) return false;
    const l = LUFS_OFFSET + 10 * Math.log10(ms);
    return l > -70.0;
  });

  if (absGatedMs.length === 0) return null; // No speech detected

  // Compute un-gated (absolute-gated) mean square and loudness
  const absAvgMs = absGatedMs.reduce((a, b) => a + b, 0) / absGatedMs.length;
  const absLufs = LUFS_OFFSET + 10 * Math.log10(absAvgMs);

  // Relative Threshold Gating (Un-gated LUFS - 10.0 LUFS)
  const relativeThresholdLufs = absLufs - 10.0;
  const relGatedMs = absGatedMs.filter(ms => {
    const l = LUFS_OFFSET + 10 * Math.log10(ms);
    return l >= relativeThresholdLufs;
  });

  if (relGatedMs.length === 0) return parseFloat(absLufs.toFixed(1));

  const finalAvgMs = relGatedMs.reduce((a, b) => a + b, 0) / relGatedMs.length;
  const finalLufs = LUFS_OFFSET + 10 * Math.log10(finalAvgMs);

  return parseFloat(finalLufs.toFixed(1));
}

const BACKEND = import.meta.env.VITE_BACKEND_URL || (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1" ? "https://api.voclara.com" : "http://localhost:3001");
const MAX_SEC = 120; // 2 minutes

export default function LanguageApply() {
    const navigate = useNavigate();
    const [companies, setCompanies] = useState([]);
    const [globalLanguages, setGlobalLanguages] = useState([]);
    const [scriptedLanguages, setScriptedLanguages] = useState([]);
    const [myApps, setMyApps] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState("");
    const [selectedLanguage, setSelectedLanguage] = useState("");
    const [applicationType, setApplicationType] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        const t = params.get("type");
        if (t === "phrase" || t === "call" || t === "scripted_call" || t === "scripted") {
            return t === "scripted" ? "scripted_call" : t;
        }
        return "call";
    }); // 'call' | 'phrase' | 'scripted_call'
    const [samplePhrase, setSamplePhrase] = useState(null);
    const [samplePhrases, setSamplePhrases] = useState([]);
    const [sampleIndex, setSampleIndex] = useState(0);
    const [sampleRecordings, setSampleRecordings] = useState({});
    const [userCustomizations, setUserCustomizations] = useState([]);
    const [phase, setPhase] = useState("select"); // select | record | done
    const [recording, setRecording] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(MAX_SEC);
    const [audioBlob, setAudioBlob] = useState(null);
    const [audioUrl, setAudioUrl] = useState(null);
    const [loading, setLoading] = useState(false);
    const [pageLoading, setPageLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [userInfo, setUserInfo] = useState(null);
    const [rawPcm, setRawPcm] = useState(null);
    const [recordedLufs, setRecordedLufs] = useState(null);
    const [enforceLufs, setEnforceLufs] = useState(true);

    const [showMicSettingsModal, setShowMicSettingsModal] = useState(false);
    const [activeNoiseGateDb, setActiveNoiseGateDb] = useState(0);

    const [micGainPercent, setMicGainPercent] = useState(() => {
        const saved = localStorage.getItem("phrase_mic_gain_percent");
        return saved !== null ? parseInt(saved) : 0;
    });

    const micGainMultiplier = React.useMemo(() => {
        const pct = Math.max(-100, Math.min(100, parseInt(micGainPercent) || 0));
        return parseFloat((1.0 + (pct / 100)).toFixed(2));
    }, [micGainPercent]);

    const handleMicGainPercentChange = (newVal) => {
        const pct = Math.max(-100, Math.min(100, parseInt(newVal) || 0));
        setMicGainPercent(pct);
        localStorage.setItem("phrase_mic_gain_percent", String(pct));
        if (workletNodeRef.current) {
            const mult = parseFloat((1.0 + (pct / 100)).toFixed(2));
            workletNodeRef.current.port.postMessage({ type: "setGainBoost", gainBoost: mult });
        }
    };

    const [isLufsTesting, setIsLufsTesting] = useState(false);
    const [lufsCountdown, setLufsCountdown] = useState(3);
    const [lufsResult, setLufsResult] = useState(null);

    const runLufsTest = async () => {
        if (isLufsTesting || recording) return;
        setIsLufsTesting(true);
        setLufsCountdown(3);
        setLufsResult(null);

        let testStream;
        try {
            testStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 }, sampleRate: { ideal: 48000 } }
            });
        } catch {
            try {
                testStream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
                });
            } catch {
                testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
        }

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const testCtx = new AudioCtx({ sampleRate: 48000 });
        if (testCtx.state === "suspended") await testCtx.resume();

        try { await testCtx.audioWorklet.addModule("/pcm-worklet.js"); } catch {}

        const source = testCtx.createMediaStreamSource(testStream);
        const workletNode = new AudioWorkletNode(testCtx, "pcm-processor");
        workletNode.port.postMessage({ type: "setNoiseGate", noiseGateDb: activeNoiseGateDb });
        workletNode.port.postMessage({ type: "setGainBoost", gainBoost: micGainMultiplier });

        const gain = testCtx.createGain();
        gain.gain.value = 0;
        source.connect(workletNode);
        workletNode.connect(gain);
        gain.connect(testCtx.destination);

        const capturedChunks = [];
        workletNode.port.onmessage = (e) => {
            capturedChunks.push(new Float32Array(e.data));
        };

        let remaining = 3;
        const interval = setInterval(() => {
            remaining -= 1;
            setLufsCountdown(remaining);
            if (remaining <= 0) {
                clearInterval(interval);
                testStream.getTracks().forEach(t => t.stop());
                workletNode.disconnect();
                testCtx.close().catch(() => {});

                let totalLen = 0;
                for (const c of capturedChunks) totalLen += c.length;
                const combined = new Float32Array(totalLen);
                let offset = 0;
                for (const c of capturedChunks) { combined.set(c, offset); offset += c.length; }

                const score = calculateEbuR128Lufs(combined, testCtx?.sampleRate || 48000);
                let status = "pass";
                if (score > -18.0) status = "too_loud";
                else if (score < -25.0) status = "too_quiet";

                setLufsResult({ lufs: score, status });
                setIsLufsTesting(false);
            }
        }, 1000);
    };

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
            const meRes = await apiGet("/api/auth/me").catch(() => null);
            const companiesRes = await apiGet("/api/admin/companies?forApply=true").catch(() => ({ companies: [] }));
            const appsRes = await apiGet("/api/language-applications/my").catch(() => ({ applications: [] }));
            const langsRes = await apiGet("/api/languages?type=call").catch(() => ({ languages: [] }));
            let scriptedRes = { languages: [] };
            try {
                scriptedRes = await apiGet("/api/scripted-languages");
            } catch (e) {
                scriptedRes = await apiGet("/api/admin/scripted-languages").catch(() => ({ languages: [] }));
            }
            
            if (meRes?.user) setUserInfo(meRes.user);
            setCompanies(companiesRes?.companies || []);
            setMyApps(appsRes?.applications || []);
            setGlobalLanguages(langsRes?.languages || []);
            setScriptedLanguages((scriptedRes?.languages || []).filter(l => l.enabled));
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

        const matching = myApps.filter(a => {
            const appLang = String(a.languageCode || "").trim().toLowerCase();
            const appType = a.applicationType || 'phrase';
            if (appLang !== targetCode) return false;
            if (appType !== type) return false;
            if (type === 'phrase') {
                const appComp = String(a.companyId || "").trim().toLowerCase();
                const appProj = String(a.projectName || "").trim().toLowerCase();
                return !targetCompany || appComp === targetCompany || appProj === targetCompany;
            }
            return true;
        });

        if (matching.length === 0) return null;
        if (matching.some(a => a.status === 'approved')) return 'approved';
        if (matching.some(a => a.status === 'blacklisted')) return 'blacklisted';
        if (matching.some(a => a.status === 'pending')) return 'pending';
        return matching[0].status || null;
    }

    function isCompanyRemovedOrRejected(companyName) {
        if (!companyName) return false;
        const targetComp = String(companyName).trim().toLowerCase();
        return myApps.some(a => {
            const appComp = String(a.companyId || "").trim().toLowerCase();
            const appProj = String(a.projectName || "").trim().toLowerCase();
            const isMatch = appComp === targetComp || appProj === targetComp;
            return isMatch && (a.status === "rejected" || a.status === "blocked");
        });
    }

    function canApply(companyId, code, type) {
        const st = getStatus(companyId, code, type);
        return st === null;
    }

    async function fetchSamplePhrase(companyId, languageCode) {
        setLoading(true);
        setError("");
        try {
            const langQuery = languageCode ? `&language=${encodeURIComponent(languageCode)}` : '';
            const data = await apiGet(`/api/phrases/sample?companyId=${encodeURIComponent(companyId)}${langQuery}`);
            const phrases = data.phrases || (data.phrase ? [data.phrase] : []);
            if (phrases.length > 0) {
                setSamplePhrases(phrases);
                setSampleIndex(0);
                setSampleRecordings({});
                setSamplePhrase(phrases[0]);
                setUserCustomizations(data.userCustomizations || []);
                setEnforceLufs(data.enforceLufs !== false);
                setPhase("record");
                setAudioBlob(null);
                setAudioUrl(null);
                setRecordedLufs(null);
                setRawPcm(null);
            } else {
                setError("No sample phrase found for this project and language.");
            }
        } catch (e) {
            setError(e.message || "Failed to fetch sample phrase.");
        } finally {
            setLoading(false);
        }
    }

    const handleNextSample = () => {
        if (!audioBlob || !rawPcm) return;
        const updated = {
            ...sampleRecordings,
            [sampleIndex]: { pcm: rawPcm, blob: audioBlob, url: audioUrl, lufs: recordedLufs }
        };
        setSampleRecordings(updated);

        const nextIdx = sampleIndex + 1;
        if (nextIdx < samplePhrases.length) {
            setSampleIndex(nextIdx);
            setSamplePhrase(samplePhrases[nextIdx]);
            if (updated[nextIdx]) {
                setRawPcm(updated[nextIdx].pcm);
                setAudioBlob(updated[nextIdx].blob);
                setAudioUrl(updated[nextIdx].url);
                setRecordedLufs(updated[nextIdx].lufs);
            } else {
                setRawPcm(null);
                setAudioBlob(null);
                setAudioUrl(null);
                setRecordedLufs(null);
            }
        }
    };

    const handlePrevSample = () => {
        if (sampleIndex === 0) return;
        const updated = {
            ...sampleRecordings,
            ...(audioBlob && rawPcm ? { [sampleIndex]: { pcm: rawPcm, blob: audioBlob, url: audioUrl, lufs: recordedLufs } } : {})
        };
        setSampleRecordings(updated);

        const prevIdx = sampleIndex - 1;
        setSampleIndex(prevIdx);
        setSamplePhrase(samplePhrases[prevIdx]);
        if (updated[prevIdx]) {
            setRawPcm(updated[prevIdx].pcm);
            setAudioBlob(updated[prevIdx].blob);
            setAudioUrl(updated[prevIdx].url);
            setRecordedLufs(updated[prevIdx].lufs);
        } else {
            setRawPcm(null);
            setAudioBlob(null);
            setAudioUrl(null);
            setRecordedLufs(null);
        }
    };

    async function startRecording() {
        try {
             let stream;
             try {
                 stream = await navigator.mediaDevices.getUserMedia({
                     audio: {
                         echoCancellation: false,
                         noiseSuppression: false,
                         autoGainControl: false,
                         channelCount: { ideal: 2 },
                         sampleRate: { ideal: 48000 }
                     }
                 });
             } catch (err) {
                 try {
                     stream = await navigator.mediaDevices.getUserMedia({
                         audio: {
                             echoCancellation: false,
                             noiseSuppression: false,
                             autoGainControl: false
                         }
                     });
                 } catch (err2) {
                     stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                 }
             }
             streamRef.current = stream;
             chunksRef.current = [];
             
             const track = stream.getAudioTracks()[0];
             const settings = track ? track.getSettings() : {};
             const trackSampleRate = settings.sampleRate || 48000;

             const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
             const audioCtx = new AudioCtxClass({ sampleRate: trackSampleRate });
             audioCtxRef.current = audioCtx;
             if (audioCtx.state === "suspended") {
                 await audioCtx.resume();
             }

             try {
                 await audioCtx.audioWorklet.addModule("/pcm-worklet.js");
             } catch (wErr) {
                 console.warn("Worklet module load note:", wErr);
             }
            
            const source = audioCtx.createMediaStreamSource(stream);
            const workletNode = new AudioWorkletNode(audioCtx, "pcm-processor");
            workletNodeRef.current = workletNode;

            const assignedNoiseGateDb = activeNoiseGateDb || (userInfo?.noiseGateDb !== undefined ? userInfo.noiseGateDb : 0);
            workletNode.port.postMessage({ type: "setNoiseGate", noiseGateDb: assignedNoiseGateDb });
            workletNode.port.postMessage({ type: "setGainBoost", gainBoost: micGainMultiplier });
            
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
        } catch (e) {
            console.error("Recording start error:", e);
            setError(e.message || "Failed to start recording. Please try again.");
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
        setRawPcm(combined);
        let lufs = null;
        if (combined.length > 0) {
            lufs = calculateEbuR128Lufs(combined, 48000);
        }
        setRecordedLufs(lufs);
        const blob = encodeWAV(combined, 48000, 1);
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setRecording(false);
    }

    async function submit() {
        if (!audioBlob || !selectedLanguage) return;
        if (applicationType === 'phrase' && !selectedCompany) return;

        // Strict LUFS Verification for Phrase Studio Applications (-18.0 to -25.0 LUFS)
        if (applicationType === 'phrase' && enforceLufs !== false) {
            let lufsScore = recordedLufs;
            if (lufsScore === null && rawPcm && rawPcm.length > 0) {
                lufsScore = calculateEbuR128Lufs(rawPcm, 48000);
            }

            if (lufsScore !== null) {
                if (lufsScore > -18.0) {
                    // LUFS > -18 (e.g. -17, -15) => Too loud! Decrease gain!
                    Swal.fire({
                        icon: "warning",
                        title: "Mic Calibration Required (Too Loud)",
                        background: "#171717",
                        color: "#ffffff",
                        html: `<div class="text-left space-y-2 text-sm text-neutral-300">
                            <p>Your sample recording loudness is <b class="font-mono text-base text-rose-400">${lufsScore} LUFS</b> (Target range: <b class="text-white">-18.0 to -25.0 LUFS</b>).</p>
                            <p class="text-rose-400 font-bold">⚠️ Audio is too loud (over -18.0 LUFS)!</p>
                            <p>Please open <b>Mic Settings</b> and <b>decrease your mic gain</b> (try -10% or -20%) or speak slightly softer, then re-record your sample phrase.</p>
                        </div>`,
                        confirmButtonText: "Adjust Mic Settings",
                        confirmButtonColor: "#3b82f6"
                    });
                    setShowMicSettingsModal(true);
                    return;
                }

                if (lufsScore < -25.0) {
                    // LUFS < -25 (e.g. -26, -28) => Too quiet! Increase gain!
                    Swal.fire({
                        icon: "warning",
                        title: "Mic Calibration Required (Too Quiet)",
                        background: "#171717",
                        color: "#ffffff",
                        html: `<div class="text-left space-y-2 text-sm text-neutral-300">
                            <p>Your sample recording loudness is <b class="font-mono text-base text-amber-400">${lufsScore} LUFS</b> (Target range: <b class="text-white">-18.0 to -25.0 LUFS</b>).</p>
                            <p class="text-amber-400 font-bold">⚠️ Audio is too quiet (under -25.0 LUFS)!</p>
                            <p>Please open <b>Mic Settings</b> and <b>increase your mic gain</b> (try +10% or +20%) or speak slightly louder, then re-record your sample phrase.</p>
                        </div>`,
                        confirmButtonText: "Adjust Mic Settings",
                        confirmButtonColor: "#3b82f6"
                    });
                    setShowMicSettingsModal(true);
                    return;
                }
            }
        }

        setLoading(true);
        setError("");
        try {
            const form = new FormData();
            form.append("applicationType", applicationType);
            if (applicationType === 'phrase') {
                form.append("companyId", selectedCompany);
            }
            form.append("languageCode", selectedLanguage);

            if (applicationType === 'phrase' && samplePhrases.length > 1) {
                const allRecordings = {
                    ...sampleRecordings,
                    [sampleIndex]: { pcm: rawPcm, blob: audioBlob, url: audioUrl, lufs: recordedLufs }
                };

                // Check all samples are recorded
                for (let i = 0; i < samplePhrases.length; i++) {
                    if (!allRecordings[i] || !allRecordings[i].blob) {
                        setLoading(false);
                        Swal.fire("Incomplete Samples", `Please record Sample Phrase ${i + 1} of ${samplePhrases.length} before submitting.`, "warning");
                        setSampleIndex(i);
                        setSamplePhrase(samplePhrases[i]);
                        return;
                    }
                }

                // Append metadata
                const metadata = samplePhrases.map((p, idx) => ({
                    sampleIndex: idx,
                    phraseId: p.phraseId,
                    text: p.text,
                    emotion: p.emotion,
                    style: p.style,
                    speed: p.speed,
                    intent: p.intent,
                    pitch: p.pitch,
                    volume: p.volume,
                    instructions: p.instructions,
                    tags: p.tags,
                    lufs: allRecordings[idx]?.lufs !== undefined ? allRecordings[idx].lufs : null
                }));
                form.append("samplesMetadata", JSON.stringify(metadata));

                // Append each sample file
                for (let i = 0; i < samplePhrases.length; i++) {
                    const sampleItem = samplePhrases[i];
                    form.append("recording", allRecordings[i].blob, `sample_${i + 1}_${sampleItem.phraseId || i}.wav`);
                }
            } else {
                form.append("recording", audioBlob, `app_${applicationType}_${selectedCompany || 'call'}_${selectedLanguage}.wav`);
            }

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
            } else if (applicationType === 'scripted_call') {
                setSuccess(`Your scripted call application for (${selectedLanguage}) has been submitted!`);
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

                {/* Highlighted Application Type Cards (3 Tracks) */}
                {(phase === "select" || phase === "done") && (
                    <div className="max-w-4xl mx-auto mb-8">
                        <label className="block text-center text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3">
                            Step 1: Choose Application Track
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {/* Call Application Card */}
                            <button
                                type="button"
                                onClick={() => { setApplicationType("call"); setSelectedLanguage(""); setSelectedCompany(""); }}
                                className={`relative text-left p-5 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                                    applicationType === "call"
                                        ? "border-primary-500 bg-primary-50/50 dark:bg-primary-950/40 shadow-lg ring-2 ring-primary-500/30 scale-[1.02]"
                                        : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 opacity-80 hover:opacity-100"
                                }`}
                            >
                                {applicationType === "call" && (
                                    <div className="absolute top-3 right-3 text-primary-500">
                                        <CheckCircle2 className="w-5 h-5 fill-primary-500 text-white" />
                                    </div>
                                )}
                                <div className="flex items-center gap-3 mb-3">
                                    <div className={`p-3 rounded-xl ${applicationType === "call" ? "bg-primary-500 text-white shadow-md" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"}`}>
                                        <PhoneCall className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider block">Live Voice Chat</span>
                                        <h3 className="font-bold text-sm text-neutral-900 dark:text-white">Call Application</h3>
                                    </div>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                                    Apply for 1-on-1 live voice calls, pair audio dialogues, and real-time conversations.
                                </p>
                            </button>

                            {/* Scripted Call Application Card */}
                            <button
                                type="button"
                                onClick={() => { setApplicationType("scripted_call"); setSelectedLanguage(""); setSelectedCompany(""); }}
                                className={`relative text-left p-5 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                                    applicationType === "scripted_call"
                                        ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 shadow-lg ring-2 ring-indigo-500/30 scale-[1.02]"
                                        : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 opacity-80 hover:opacity-100"
                                }`}
                            >
                                {applicationType === "scripted_call" && (
                                    <div className="absolute top-3 right-3 text-indigo-500">
                                        <CheckCircle2 className="w-5 h-5 fill-indigo-500 text-white" />
                                    </div>
                                )}
                                <div className="flex items-center gap-3 mb-3">
                                    <div className={`p-3 rounded-xl ${applicationType === "scripted_call" ? "bg-indigo-600 text-white shadow-md" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"}`}>
                                        <Radio className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider block">Scripted Dialogues</span>
                                        <h3 className="font-bold text-sm text-neutral-900 dark:text-white">Scripted Call Application</h3>
                                    </div>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                                    Apply for 2-person scripted dialogues, scenario turns, and verse recordings.
                                </p>
                            </button>

                            {/* Phrase Studio Application Card */}
                            <button
                                type="button"
                                onClick={() => { setApplicationType("phrase"); setSelectedLanguage(""); setSelectedCompany(""); }}
                                className={`relative text-left p-5 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                                    applicationType === "phrase"
                                        ? "border-primary-500 bg-primary-50/50 dark:bg-primary-950/40 shadow-lg ring-2 ring-primary-500/30 scale-[1.02]"
                                        : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 opacity-80 hover:opacity-100"
                                }`}
                            >
                                {applicationType === "phrase" && (
                                    <div className="absolute top-3 right-3 text-primary-500">
                                        <CheckCircle2 className="w-5 h-5 fill-primary-500 text-white" />
                                    </div>
                                )}
                                <div className="flex items-center gap-3 mb-3">
                                    <div className={`p-3 rounded-xl ${applicationType === "phrase" ? "bg-primary-500 text-white shadow-md" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"}`}>
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider block">Scripted Recording</span>
                                        <h3 className="font-bold text-sm text-neutral-900 dark:text-white">Phrase Studio Application</h3>
                                    </div>
                                </div>
                                <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                                    Apply for single phrase recording projects and script reading.
                                </p>
                            </button>
                        </div>
                    </div>
                )}

                {/* Project Selection */}
                {(phase === "select" || phase === "done") && (
                    <div className="card animate-slide-up max-w-2xl mx-auto">
                        <h2 className="text-lg font-bold text-neutral-900 dark:text-white mb-1">
                            {applicationType === 'phrase' ? 'Select Phrase Project' : applicationType === 'scripted_call' ? 'Select Scripted Call Language' : 'Select Call Language'}
                        </h2>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-5">
                            {applicationType === 'phrase' ? 'Choose a project and language to apply for.' : applicationType === 'scripted_call' ? 'Choose an active scripted language to apply for.' : 'Choose a language you want to participate in calls for.'}
                        </p>

                        {pageLoading ? (
                            <div className="flex justify-center py-8">
                                <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                            </div>
                        ) : (applicationType === 'call' && globalLanguages.filter(l => l.enabled).length === 0) ? (
                            <p className="text-neutral-400 dark:text-neutral-500 text-sm py-6 text-center">No call languages available to apply for right now.</p>
                        ) : (applicationType === 'scripted_call' && scriptedLanguages.length === 0) ? (
                            <p className="text-neutral-400 dark:text-neutral-500 text-sm py-6 text-center">No scripted languages available to apply for right now.</p>
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
                                                 {companies.filter(c => !isCompanyRemovedOrRejected(c.name)).map(c => (
                                                     <option key={c._id} value={c.name}>
                                                         {c.projectName || c.name} - ${Number(c.hourlyPayout || 0).toFixed(2)}/hour
                                                     </option>
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

                                {(applicationType === 'call' || applicationType === 'scripted_call' || selectedCompany) && (
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
                                                     if (applicationType === 'scripted_call') {
                                                         return scriptedLanguages.filter(lang => {
                                                             const st = getStatus(null, lang.code, 'scripted_call');
                                                             return st !== 'rejected' && st !== 'blocked';
                                                         }).map(lang => {
                                                             const st = getStatus(null, lang.code, 'scripted_call');
                                                             const statusSuffix = st === 'pending' ? ' (Already Applied - Pending)' : st === 'approved' ? ' (Already Applied - Approved)' : '';
                                                             return (
                                                                 <option key={lang._id || lang.code} value={lang.code}>
                                                                     {lang.name} - ${Number(lang.hourlyPayout || 0).toFixed(2)}/hour{statusSuffix}
                                                                 </option>
                                                             );
                                                         });
                                                     }
                                                     return globalLanguages.filter(lang => {
                                                          const st = getStatus(null, lang.code, 'call');
                                                          return st !== 'rejected' && st !== 'blocked';
                                                     }).map(lang => {
                                                          const st = getStatus(null, lang.code, 'call');
                                                          const statusSuffix = st === 'pending' ? ' (Already Applied - Pending)' : st === 'approved' ? ' (Already Applied - Approved)' : '';
                                                          return (
                                                               <option key={lang._id || lang.code} value={lang.code}>
                                                                   {lang.name} - ${Number(lang.hourlyPayout || 0).toFixed(2)}/hour{statusSuffix}
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
                                
                                {((applicationType === 'call' || applicationType === 'scripted_call') ? selectedLanguage : (selectedCompany && selectedLanguage)) && (
                                    <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800">
                                        <div className="mb-4">
                                            <span className="block text-sm font-semibold mb-1">Status:</span>
                                            {statusBadge(getStatus(selectedCompany, selectedLanguage, applicationType)) || <span className="text-neutral-500 dark:text-neutral-400 text-sm">Not Applied</span>}
                                        </div>
                                        
                                        {(() => {
                                            const currentSt = getStatus(selectedCompany, selectedLanguage, applicationType);
                                            const langInfo = applicationType === 'call' 
                                                ? globalLanguages.find(l => l.code === selectedLanguage)
                                                : applicationType === 'scripted_call'
                                                ? scriptedLanguages.find(l => l.code === selectedLanguage)
                                                : null;
                                            const isLangLimitReached = langInfo && langInfo.maxHoursPerContributor !== undefined && langInfo.maxHoursPerContributor !== -1 && (langInfo.userDurationSeconds || 0) >= langInfo.maxHoursPerContributor * 3600;
                                            
                                            const isApplied = currentSt === "pending" || currentSt === "approved" || isLangLimitReached;
                                            let buttonLabel = "Apply Now";
                                            if (isLangLimitReached) buttonLabel = "Language Limit Reached";
                                            else if (currentSt === "pending") buttonLabel = "Already Applied (Pending Review)";
                                            else if (currentSt === "approved") buttonLabel = "Already Approved";
                                            else if (currentSt === "rejected") buttonLabel = "Re-apply Now";

                                            return (
                                                <button
                                                    onClick={() => {
                                                        if (isApplied) return;
                                                        if (applicationType === 'phrase') {
                                                            fetchSamplePhrase(selectedCompany, selectedLanguage);
                                                        } else if (applicationType === 'scripted_call') {
                                                            const foundLang = scriptedLanguages.find(l => l.code === selectedLanguage);
                                                            const promptText = (foundLang?.testPhrase || "").trim() || "Please read this sample scripted dialogue clearly and naturally into the microphone to verify audio quality.";
                                                            setSamplePhrase({ text: promptText });
                                                            setSamplePhrases([{ text: promptText, phraseId: `scripted_test_${selectedLanguage}` }]);
                                                            setPhase("record");
                                                            setAudioBlob(null);
                                                            setAudioUrl(null);
                                                            setRecordedLufs(null);
                                                            setRawPcm(null);
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
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Record Sample: {applicationType === 'phrase' ? (companies.find(c => c.name === selectedCompany)?.projectName || selectedCompany) : ''} {selectedLanguage && `(${selectedLanguage})`}</h2>
                            <div className="flex items-center gap-3">
                                {applicationType === 'phrase' && (
                                    <button 
                                        type="button"
                                        onClick={() => setShowMicSettingsModal(true)}
                                        disabled={loading || recording}
                                        className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-semibold rounded-xl flex items-center gap-1.5 text-xs transition-all border border-neutral-200 dark:border-neutral-700 shadow-sm"
                                    >
                                        <Settings className="w-3.5 h-3.5 text-primary-500" /> Mic Settings
                                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400">
                                            {micGainPercent > 0 ? `+${micGainPercent}%` : `${micGainPercent}%`}
                                        </span>
                                    </button>
                                )}
                                <button onClick={() => { stopRecording(); setPhase("select"); }} className="text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-white transition-colors">
                                    ← Change
                                </button>
                            </div>
                        </div>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-7">
                            {applicationType === 'phrase' ? 'Read the sample phrase below naturally.' : 'Please record a brief introductory message speaking naturally in this language.'} Recording auto-stops when time runs out.
                        </p>

                        {/* Mic Settings Popup Modal */}
                        <AnimatePresence>
                            {showMicSettingsModal && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                                    <motion.div 
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 w-full max-w-md shadow-2xl relative text-left"
                                    >
                                        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-4 mb-5">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-primary-500/10 text-primary-500 p-2 rounded-xl">
                                                    <Settings className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">Microphone Settings</h3>
                                                    <p className="text-xs text-neutral-500">Noise gate & gain adjustment</p>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => setShowMicSettingsModal(false)}
                                                className="p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-lg transition-colors"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>

                                        {/* Noise Gate Section */}
                                        <div className="mb-6">
                                            <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                                <Sliders className="w-4 h-4 text-warning-500" /> Noise Gate
                                            </label>
                                            <select 
                                                className="input w-full font-semibold border-warning-500/40 text-warning-700 dark:text-warning-300" 
                                                value={activeNoiseGateDb} 
                                                onChange={(e) => setActiveNoiseGateDb(parseInt(e.target.value) || 0)}
                                                disabled={loading || recording}
                                            >
                                                <option value={0}>0 dB (RAW / Off)</option>
                                                <option value={-6}>-6 dB (Light Attenuation)</option>
                                                <option value={-10}>-10 dB (Medium Attenuation)</option>
                                                <option value={-12}>-12 dB (Strong Attenuation)</option>
                                                <option value={-15}>-15 dB (Heavy Attenuation)</option>
                                                <option value={-18}>-18 dB (Maximum Attenuation)</option>
                                            </select>
                                        </div>

                                        {/* Gain Control Section */}
                                        <div className="mb-6">
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                                                    <Volume2 className="w-4 h-4 text-success-500" /> Volume / Gain Control
                                                </label>
                                                <span className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full ${micGainPercent < 0 ? 'bg-error-100 dark:bg-error-900/30 text-error-600 dark:text-error-400' : micGainPercent > 0 ? 'bg-success-100 dark:bg-success-900/30 text-success-600 dark:text-success-400' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'}`}>
                                                    {micGainPercent > 0 ? `+${micGainPercent}%` : `${micGainPercent}%`} ({micGainMultiplier.toFixed(2)}x)
                                                </span>
                                            </div>
                                            <input 
                                                type="range"
                                                min="-100"
                                                max="100"
                                                step="1"
                                                value={micGainPercent}
                                                onChange={(e) => handleMicGainPercentChange(e.target.value)}
                                                disabled={loading || recording}
                                                className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-success-500"
                                            />
                                            <div className="flex justify-between text-[11px] text-neutral-400 font-mono font-semibold px-0.5 mt-1">
                                                <span>-100% (Mute)</span>
                                                <span>0% (Raw Input)</span>
                                                <span>+100% (2x Louder)</span>
                                            </div>
                                        </div>

                                        {/* LUFS Calibration Section */}
                                        {enforceLufs !== false && (
                                            <div className="mb-6 p-4 rounded-2xl border border-primary-500/30 bg-primary-950/20 dark:bg-neutral-800/90 text-neutral-900 dark:text-white shadow-inner">
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className="block text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider flex items-center gap-2">
                                                        <Activity className="w-4 h-4 text-primary-500" /> Check LUFS (3s Calibration)
                                                    </label>
                                                    <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-300 font-mono px-2 py-0.5 rounded bg-primary-500/10 border border-primary-500/20">Target: -18 to -25 LUFS</span>
                                                </div>

                                                <p className="text-xs text-neutral-600 dark:text-neutral-300 mb-3 font-medium">
                                                    Click below and speak naturally for 3 seconds to test your mic volume calibration.
                                                </p>

                                                <button
                                                    type="button"
                                                    onClick={runLufsTest}
                                                    disabled={isLufsTesting || recording || loading}
                                                    className={`w-full py-3 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-md ${
                                                        isLufsTesting 
                                                            ? "bg-error-600 text-white animate-pulse" 
                                                            : "bg-primary-600 hover:bg-primary-500 text-white shadow-primary-600/20"
                                                    }`}
                                                >
                                                    {isLufsTesting ? (
                                                        <>
                                                            <span className="w-2.5 h-2.5 bg-white rounded-full animate-ping"></span>
                                                            Recording & Measuring... ({lufsCountdown}s)
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Activity className="w-4 h-4 text-white" /> Check Mic LUFS (3s)
                                                        </>
                                                    )}
                                                </button>

                                                {/* LUFS Result Display */}
                                                {lufsResult && (
                                                    <div className={`mt-3 p-3.5 rounded-xl border flex items-center justify-between text-xs font-bold shadow-sm ${
                                                        lufsResult.status === "pass" 
                                                            ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                                                            : lufsResult.status === "too_loud"
                                                            ? "bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300"
                                                            : "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300"
                                                    }`}>
                                                        <span className="flex items-center gap-1.5 font-semibold">
                                                            {lufsResult.status === "pass" ? "✓ Perfect Volume (-18 to -25 LUFS)" : lufsResult.status === "too_loud" ? "⚠️ Too Loud (Reduce Gain)" : "⚠️ Too Quiet (Boost Gain)"}
                                                        </span>
                                                        <span className="font-mono text-sm font-black px-2 py-0.5 rounded bg-neutral-900 text-white">{lufsResult.lufs} LUFS</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex justify-end pt-2">
                                            <button 
                                                onClick={() => setShowMicSettingsModal(false)}
                                                className="btn btn-primary w-full py-2.5"
                                            >
                                                Done
                                            </button>
                                        </div>
                                    </motion.div>
                                </div>
                            )}
                        </AnimatePresence>

                        {/* Multi-sample Step Tracker */}
                        {applicationType === 'phrase' && samplePhrases.length > 1 && (
                            <div className="mb-5 bg-neutral-100 dark:bg-neutral-800/80 p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-700">
                                <div className="flex items-center justify-between text-xs font-bold mb-2">
                                    <span className="text-primary-600 dark:text-primary-400">
                                        Sample Phrase {sampleIndex + 1} of {samplePhrases.length}
                                    </span>
                                    <span className="text-neutral-500 font-mono">
                                        {Object.keys(sampleRecordings).length + (audioBlob && !sampleRecordings[sampleIndex] ? 1 : 0)} / {samplePhrases.length} Recorded
                                    </span>
                                </div>
                                <div className="flex gap-1.5">
                                    {samplePhrases.map((_, idx) => {
                                        const isRecorded = (idx === sampleIndex && audioBlob) || sampleRecordings[idx];
                                        const isCurrent = idx === sampleIndex;
                                        return (
                                            <div 
                                                key={idx}
                                                onClick={() => {
                                                    if (!recording) {
                                                        if (audioBlob && rawPcm) {
                                                            setSampleRecordings(prev => ({
                                                                ...prev,
                                                                [sampleIndex]: { pcm: rawPcm, blob: audioBlob, url: audioUrl, lufs: recordedLufs }
                                                            }));
                                                        }
                                                        setSampleIndex(idx);
                                                        setSamplePhrase(samplePhrases[idx]);
                                                        if (sampleRecordings[idx]) {
                                                            setRawPcm(sampleRecordings[idx].pcm);
                                                            setAudioBlob(sampleRecordings[idx].blob);
                                                            setAudioUrl(sampleRecordings[idx].url);
                                                            setRecordedLufs(sampleRecordings[idx].lufs);
                                                        } else if (idx !== sampleIndex) {
                                                            setRawPcm(null);
                                                            setAudioBlob(null);
                                                            setAudioUrl(null);
                                                            setRecordedLufs(null);
                                                        }
                                                    }
                                                }}
                                                className={`h-2 flex-1 rounded-full cursor-pointer transition-all ${
                                                    isCurrent 
                                                        ? 'bg-primary-500 ring-2 ring-primary-400' 
                                                        : isRecorded 
                                                        ? 'bg-emerald-500' 
                                                        : 'bg-neutral-300 dark:bg-neutral-700'
                                                }`}
                                                title={`Sample ${idx + 1}`}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Scripted Call Test Phrase Box */}
                        {applicationType === 'scripted_call' && samplePhrase && (
                            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl mb-5 space-y-3">
                                <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                                    <Radio className="w-4 h-4" />
                                    <span>Scripted Call Test Phrase ({selectedLanguage})</span>
                                </div>
                                <p className="text-lg md:text-xl font-semibold text-white leading-relaxed whitespace-pre-wrap">
                                    "{samplePhrase.text}"
                                </p>
                                <p className="text-xs text-neutral-400">
                                    Please read the above script line naturally into your microphone to verify your tone, pronunciation, and clarity.
                                </p>
                            </div>
                        )}

                        {/* Sample Phrase Box */}
                        {applicationType === 'phrase' && samplePhrase && (
                            <>
                                <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 rounded-xl mb-4">
                                    <p className="text-xl md:text-2xl font-medium leading-relaxed">"{samplePhrase.text}"</p>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6 bg-neutral-100/50 dark:bg-neutral-900/50 p-4 rounded-xl text-neutral-800 dark:text-neutral-200 text-sm border border-neutral-200 dark:border-neutral-800">
                                    {samplePhrase.emotion && (!userCustomizations || userCustomizations.length === 0 || userCustomizations.some(uk => uk.toLowerCase() === 'emotion')) && <div><span className="block text-xs uppercase opacity-60 mb-1">Emotion</span><span className="font-medium">{samplePhrase.emotion}</span></div>}
                                    {samplePhrase.style && (!userCustomizations || userCustomizations.length === 0 || userCustomizations.some(uk => uk.toLowerCase() === 'style')) && <div><span className="block text-xs uppercase opacity-60 mb-1">Style</span><span className="font-medium">{samplePhrase.style}</span></div>}
                                    {samplePhrase.speed && (!userCustomizations || userCustomizations.length === 0 || userCustomizations.some(uk => uk.toLowerCase() === 'speed')) && <div><span className="block text-xs uppercase opacity-60 mb-1">Speed</span><span className="font-medium">{samplePhrase.speed}</span></div>}
                                    {samplePhrase.intent && (!userCustomizations || userCustomizations.length === 0 || userCustomizations.some(uk => uk.toLowerCase() === 'intent')) && <div><span className="block text-xs uppercase opacity-60 mb-1">Intent</span><span className="font-medium">{samplePhrase.intent}</span></div>}
                                    {samplePhrase.pitch && (!userCustomizations || userCustomizations.length === 0 || userCustomizations.some(uk => uk.toLowerCase() === 'pitch')) && <div><span className="block text-xs uppercase opacity-60 mb-1">Pitch</span><span className="font-medium">{samplePhrase.pitch}</span></div>}
                                    {samplePhrase.volume && (!userCustomizations || userCustomizations.length === 0 || userCustomizations.some(uk => uk.toLowerCase() === 'volume')) && <div><span className="block text-xs uppercase opacity-60 mb-1">Volume</span><span className="font-medium">{samplePhrase.volume}</span></div>}
                                    {samplePhrase.tags && Object.entries(samplePhrase.tags)
                                        .filter(([key]) => {
                                             if (userCustomizations && userCustomizations.length > 0) {
                                                 return userCustomizations.some(uk => uk.toLowerCase() === key.toLowerCase());
                                             }
                                             return true;
                                        })
                                        .map(([key, val]) => (
                                            <div key={key}>
                                                <span className="block text-xs uppercase opacity-60 mb-1">{key.replace(/_/g, ' ')}</span>
                                                <span className="font-medium">{val}</span>
                                            </div>
                                        ))
                                    }
                                    {samplePhrase.instructions && <div className="col-span-2 md:col-span-3 mt-2"><span className="block text-xs uppercase opacity-60 mb-1">Notes</span><p className="text-xs border-l-2 border-primary-300 pl-3">{samplePhrase.instructions}</p></div>}
                                </div>
                            </>
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
                                    
                                    {applicationType === 'phrase' && recordedLufs !== null && enforceLufs !== false && (
                                        <div className={`w-full p-3.5 rounded-xl border flex items-center justify-between text-xs font-bold shadow-sm ${
                                            recordedLufs >= -25.0 && recordedLufs <= -18.0
                                                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                                                : recordedLufs > -18.0
                                                ? "bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300"
                                                : "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300"
                                        }`}>
                                            <span className="flex items-center gap-1.5 font-semibold">
                                                {recordedLufs >= -25.0 && recordedLufs <= -18.0
                                                    ? "✓ Loudness Calibration Passed (-18 to -25 LUFS)"
                                                    : recordedLufs > -18.0
                                                    ? "⚠️ Loudness Too High (Reduce Mic Gain & Re-record)"
                                                    : "⚠️ Loudness Too Low (Increase Mic Gain & Re-record)"
                                                }
                                            </span>
                                            <span className="font-mono text-sm font-black px-2.5 py-0.5 rounded bg-neutral-900 text-white">
                                                {recordedLufs} LUFS
                                            </span>
                                        </div>
                                    )}

                                    <div className="flex gap-3 w-full">
                                        {sampleIndex > 0 && applicationType === 'phrase' && samplePhrases.length > 1 && (
                                            <button
                                                onClick={handlePrevSample}
                                                disabled={recording || loading}
                                                className="px-4 py-2.5 border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-xl text-sm font-semibold transition-colors"
                                            >
                                                ← Prev
                                            </button>
                                        )}
                                        <button
                                            onClick={() => { setAudioBlob(null); setAudioUrl(null); setRecordedLufs(null); setRawPcm(null); }}
                                            className="flex-1 py-2.5 border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-xl text-sm font-semibold transition-colors"
                                        >
                                            Re-record
                                        </button>
                                        {applicationType === 'phrase' && samplePhrases.length > 1 && sampleIndex < samplePhrases.length - 1 ? (
                                            <button
                                                onClick={handleNextSample}
                                                disabled={!audioBlob || loading}
                                                className="flex-1 btn-primary py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
                                            >
                                                <span>Next Sample ({sampleIndex + 2}/{samplePhrases.length})</span>
                                                <span>→</span>
                                            </button>
                                        ) : (
                                            <button
                                                onClick={submit}
                                                disabled={loading}
                                                className="flex-1 btn-primary py-2.5 text-sm font-semibold disabled:opacity-50"
                                            >
                                                {loading ? "Submitting…" : samplePhrases.length > 1 ? `Submit Application (${samplePhrases.length} Samples)` : "Submit Application"}
                                            </button>
                                        )}
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
