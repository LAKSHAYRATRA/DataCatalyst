import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Play, UploadCloud, CheckCircle2, Clock, DollarSign, FolderGit2, RotateCcw, Sliders, Volume2, Settings, X, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiGet, apiPostJson } from '../lib/api';
import { encodeWAV } from '../utils/wavBuilder.js';
import { getUserInfo } from '../lib/auth.js';
import { useNavigate, Link } from 'react-router-dom';
import Nav from "../components/Nav.jsx";
import Swal from 'sweetalert2';

function calculateEbuR128Lufs(pcmSamples, sampleRate = 48000) {
  if (!pcmSamples || pcmSamples.length === 0) return null;

  const len = pcmSamples.length;
  const filtered = new Float32Array(len);

  // K-Weighting Stage 1: High Shelf Filter (48kHz)
  let f1_z1 = 0, f1_z2 = 0;
  const b0_1 = 1.53512485958697, b1_1 = -2.69169618940638, b2_1 = 1.19839281085285;
  const a1_1 = -1.69065929318241, a2_1 = 0.71623787421588;

  // K-Weighting Stage 2: High Pass RLB Filter
  let f2_z1 = 0, f2_z2 = 0;
  const b0_2 = 1.0, b1_2 = -2.0, b2_2 = 1.0;
  const a1_2 = -1.99004745483398, a2_2 = 0.99007225036621;

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

export default function PhraseRecording() {
  const navigate = useNavigate();
  const userInfo = getUserInfo();
  
  // These will be populated from the API
  const [approvedApps, setApprovedApps] = useState([]);
  const [approvedCompanies, setApprovedCompanies] = useState([]);
  const approvedPhraseApps = approvedApps.filter(app => app.applicationType === 'phrase');

  const [stats, setStats] = useState({ 
    totalSeconds: 0, 
    history: [],
    dailyPhraseLimit: 1000,
    phrasesRecordedToday: 0
  });
  
  const [projects, setProjects] = useState([]);
  const [allLanguages, setAllLanguages] = useState([]);
  const [allCompanies, setAllCompanies] = useState([]);
  
  const [projectName, setProjectName] = useState('');
  const [language, setLanguage] = useState('');
  const [availableLanguages, setAvailableLanguages] = useState([]);

  useEffect(() => {
    const newLangs = Array.from(new Set(
      approvedApps
        .filter(a => a.companyId === projectName)
        .map(a => a.languageCode)
    ));
    setAvailableLanguages(newLangs);
    if (!newLangs.includes(language)) {
      setLanguage(newLangs[0] || '');
    }
  }, [projectName, approvedApps]);

  const activeApp = React.useMemo(() => {
    return approvedApps.find(a => {
      const compMatch = !projectName || String(a.companyId || "").toLowerCase().trim() === String(projectName || "").toLowerCase().trim();
      const langMatch = !language || String(a.languageCode || "").toLowerCase().trim() === String(language || "").toLowerCase().trim();
      return compMatch && langMatch;
    });
  }, [approvedApps, projectName, language]);

  const activeNoiseGateDb = activeApp?.noiseGateDb !== undefined ? activeApp.noiseGateDb : (userInfo?.noiseGateDb || 0);

  const [rawPcm, setRawPcm] = useState(null);
  const [recordedLufs, setRecordedLufs] = useState(null);
  const [showMicSettingsModal, setShowMicSettingsModal] = useState(false);

  const [micGainPercent, setMicGainPercent] = useState(() => {
    const saved = localStorage.getItem("phrase_mic_gain_percent");
    return saved !== null ? parseInt(saved) : 0; // Default 0% (Original)
  });

  const micGainMultiplier = React.useMemo(() => {
    const pct = Math.max(-100, Math.min(100, parseInt(micGainPercent) || 0));
    return parseFloat((1.0 + (pct / 100)).toFixed(2));
  }, [micGainPercent]);

  const approvedDurationSec = React.useMemo(() => {
    return (stats.history || [])
      .filter(item => item.status === 'approved')
      .reduce((acc, item) => acc + (Number(item.duration) || 0), 0);
  }, [stats.history]);

  const pendingDurationSec = React.useMemo(() => {
    return (stats.history || [])
      .filter(item => item.status === 'pending' || item.status === 'recorded' || !item.status)
      .reduce((acc, item) => acc + (Number(item.duration) || 0), 0);
  }, [stats.history]);

  const formatHHMMSS = (totalSecs) => {
    const secs = Math.max(0, Math.floor(totalSecs || 0));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleMicGainPercentChange = (newVal) => {
    const pct = Math.max(-100, Math.min(100, parseInt(newVal) || 0));
    setMicGainPercent(pct);
    localStorage.setItem("phrase_mic_gain_percent", String(pct));
    const mult = parseFloat((1.0 + (pct / 100)).toFixed(2));
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: "setGainBoost", gainBoost: mult });
    }
  };

  const [isLufsTesting, setIsLufsTesting] = useState(false);
  const [lufsCountdown, setLufsCountdown] = useState(3);
  const [lufsResult, setLufsResult] = useState(null);

  const runLufsTest = async () => {
    if (isLufsTesting || isRecording) return;
    setIsLufsTesting(true);
    setLufsCountdown(3);
    setLufsResult(null);

    let testStream;
    try {
      testStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: { ideal: 48000 } }
      });
    } catch {
      testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

        const score = calculateEbuR128Lufs(combined);
        let status = "pass";
        if (score === null) status = "no_speech";
        else if (score > -18.0) status = "too_loud";
        else if (score < -24.0) status = "too_quiet";

        setLufsResult({ lufs: score, status });
        setIsLufsTesting(false);
      }
    }, 1000);
  };

  async function handleNoiseGateChange(newDbVal) {
    const valNum = parseInt(newDbVal) || 0;
    try {
      await apiPostJson('/api/language-applications/noise-gate', {
        applicationType: 'phrase',
        companyId: projectName,
        languageCode: language,
        noiseGateDb: valNum
      });

      setApprovedApps(prevApps => {
        let updated = false;
        const newApps = prevApps.map(app => {
          const compMatch = !projectName || String(app.companyId || "").toLowerCase().trim() === String(projectName || "").toLowerCase().trim();
          const langMatch = !language || String(app.languageCode || "").toLowerCase().trim() === String(language || "").toLowerCase().trim();
          if (compMatch && langMatch && (app.applicationType || 'phrase') === 'phrase') {
            updated = true;
            return { ...app, noiseGateDb: valNum };
          }
          return app;
        });
        if (!updated) {
          newApps.push({
            applicationType: 'phrase',
            companyId: projectName,
            languageCode: language,
            noiseGateDb: valNum,
            status: 'approved'
          });
        }
        return newApps;
      });

      if (workletNodeRef.current) {
        workletNodeRef.current.port.postMessage({ type: "setNoiseGate", noiseGateDb: valNum });
      }

      const Toast = Swal.mixin({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
        background: "#1f2937",
        color: "#fff"
      });
      Toast.fire({
        icon: "success",
        title: `Noise gate set to ${valNum === 0 ? "RAW (0 dB)" : valNum + " dB"}`
      });
    } catch (err) {
      console.error("Failed to update noise gate:", err);
      Swal.fire({
        title: "Error",
        text: err.message || "Failed to update noise gate",
        icon: "error",
        background: "#1f2937",
        color: "#fff"
      });
    }
  }

  const [currentPhrase, setCurrentPhrase] = useState(null);
  const [userCustomizations, setUserCustomizations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    fetchInitialData();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, []);

  async function fetchInitialData() {
    try {
      const [statsData, projectsData, languagesData, appsData, companiesData] = await Promise.all([
        apiGet('/api/phrases/my-stats'),
        apiGet('/api/projects'),
        apiGet('/api/languages'),
        apiGet('/api/language-applications/my'),
        apiGet('/api/admin/companies').catch(() => ({ companies: [] }))
      ]);

      const myApps = appsData.applications || [];
      const approved = myApps.filter(app => app.status === 'approved');
      
      setApprovedApps(approved);
      const uniqueCompanyIds = Array.from(new Set(approved.map(a => a.companyId).filter(Boolean)));
      const companies = uniqueCompanyIds.map(id => {
        const app = approved.find(a => a.companyId === id);
        return {
          id: id,
          label: app?.projectName || id
        };
      });
      setApprovedCompanies(companies);
      setProjectName(companies[0]?.id || '');

      setStats({ 
          totalSeconds: statsData.totalSeconds || 0, 
          history: statsData.history || [],
          dailyPhraseLimit: statsData.dailyPhraseLimit !== undefined ? statsData.dailyPhraseLimit : 1000,
          phrasesRecordedToday: statsData.phrasesRecordedToday || 0,
          overallPhraseLimit: statsData.overallPhraseLimit !== undefined ? statsData.overallPhraseLimit : -1,
          totalPhrasesRecorded: statsData.totalPhrasesRecorded || 0
      });
      setProjects(projectsData.projects || []);
      setAllLanguages(languagesData.languages || []);
      setAllCompanies(companiesData.companies || []);
    } catch (err) {
      console.error('Failed to fetch initial data', err);
    }
  }

  // Calculate current payrate based on selection
  const currentPayrate = React.useMemo(() => {
    let rate = 0;
    if (!language) return 0;

    // 1. Base language rate
    const baseLang = allLanguages.find(l => l.code && l.code.toLowerCase() === language.toLowerCase());
    if (baseLang) rate = Number(baseLang.hourlyPayout) || 0;

    // 2. Specific project language rate
    if (projectName && projectName !== 'Any') {
      const proj = projects.find(p => p.name === projectName);
      if (proj && proj.languageRates) {
        const specRate = proj.languageRates.find(r => r.languageCode && r.languageCode.toLowerCase() === language.toLowerCase());
        if (specRate && Number(specRate.hourlyPayout) > 0) {
          rate = Number(specRate.hourlyPayout);
        }
      }
    }

    // 3. Company phrase config rate overrides all other rates if set (> 0)
    if (projectName && projectName !== 'Any') {
      const coreCompanyId = String(projectName).replace("_downloaded", "").trim();
      const comp = allCompanies.find(c => 
        (c.name && (c.name.toLowerCase() === projectName.toLowerCase() || c.name.toLowerCase() === coreCompanyId.toLowerCase())) ||
        c._id === projectName
      );
      if (comp && Number(comp.hourlyPayout) > 0) {
        rate = Number(comp.hourlyPayout);
      }
    }

    return rate;
  }, [language, projectName, projects, allLanguages, allCompanies]);

  async function fetchNextPhrase() {
    try {
      setLoading(true);
      setError(null);
      resetRecording();
      let url = `/api/phrases/available?language=${language}`;
      if (projectName !== 'Any') {
        url += `&projectName=${encodeURIComponent(projectName)}`;
      }
      const data = await apiGet(url);
      if (data.phrase) {
        setCurrentPhrase(data.phrase);
        setUserCustomizations(data.userCustomizations || []);
      } else {
        setCurrentPhrase(null);
        setUserCustomizations([]);
        setError(data.message || 'No phrases available for this language right now.');
      }
    } catch (err) {
      setError('Failed to fetch phrase.');
    } finally {
      setLoading(false);
    }
  }

  function resetRecording() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    setRawPcm(null);
    setRecordedLufs(null);
    audioChunksRef.current = [];
  }

  const isRecordingRef = useRef(false);
  const audioCtxRef = useRef(null);
  const workletNodeRef = useRef(null);
  const streamRef = useRef(null);

  async function startRecording() {
    try {
      if (window.voclaraRecorder?.isNative) {
        // Native Electron path — 24-bit WASAPI exclusive, bypasses Windows audio engine.
        // Release any active browser mic tracks first so Chromium stops holding the device
        // in WASAPI shared mode. If another app holds it exclusively, audify would fail;
        // releasing Chromium's hold is what lets exclusive mode succeed here.
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
        if (audioCtxRef.current) {
          audioCtxRef.current.close().catch(() => {});
          audioCtxRef.current = null;
        }
        resetRecording();
        await window.voclaraRecorder.startRecording(currentPhrase._id, { bitDepth: 24, sampleRate: 48000, channels: 1 });
        isRecordingRef.current = true;
        setIsRecording(true);
        startTimeRef.current = Date.now();
        timerRef.current = setInterval(() => {
          setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }, 1000);
        return;
      }

      // Browser fallback path
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: { ideal: 1 },
            sampleRate: { ideal: 48000 }
          }
        });
      } catch (err) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      resetRecording();

      const track = stream.getAudioTracks()[0];
      const settings = track ? track.getSettings() : {};
      const trackSampleRate = settings.sampleRate || 48000;

      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtxClass({ sampleRate: trackSampleRate });
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

      // Pass assigned noise gate setting to worklet processor
      const activeApp = approvedApps.find(a => {
        const compMatch = !projectName || String(a.companyId || "").toLowerCase().trim() === String(projectName || "").toLowerCase().trim();
        const langMatch = !language || String(a.languageCode || "").toLowerCase().trim() === String(language || "").toLowerCase().trim();
        return compMatch && langMatch;
      });
      const assignedNoiseGateDb = activeApp?.noiseGateDb !== undefined ? activeApp.noiseGateDb : 0;
      workletNode.port.postMessage({ type: "setNoiseGate", noiseGateDb: assignedNoiseGateDb });
      workletNode.port.postMessage({ type: "setGainBoost", gainBoost: micGainMultiplier });

      const gain = audioCtx.createGain();
      gain.gain.value = 0;

      workletNode.port.onmessage = (e) => {
        if (isRecordingRef.current) {
          audioChunksRef.current.push(new Float32Array(e.data));
        }
      };

      source.connect(workletNode);
      workletNode.connect(gain);
      gain.connect(audioCtx.destination);

      audioCtxRef.current = audioCtx;
      workletNodeRef.current = workletNode;
      streamRef.current = stream;
      isRecordingRef.current = true;
      setIsRecording(true);
      startTimeRef.current = Date.now();

      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

    } catch (err) {
      console.error(err);
      alert(err.message || 'Microphone access denied or not available.');
    }
  }

  async function stopRecording() {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    clearInterval(timerRef.current);

    if (window.voclaraRecorder?.isNative) {
      try {
        const { data, options } = await window.voclaraRecorder.stopRecordingRaw();
        const binary = atob(data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const wavBlob = new Blob([bytes], { type: 'audio/wav' });
        setAudioBlob(wavBlob);
        setAudioUrl(URL.createObjectURL(wavBlob));
      } catch (err) {
        console.error('Native stop failed:', err);
        alert('Failed to stop recording.');
      }
      return;
    }

    // Browser fallback cleanup
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (workletNodeRef.current) workletNodeRef.current.disconnect();
    if (audioCtxRef.current) audioCtxRef.current.close();

    let totalLength = 0;
    for (const arr of audioChunksRef.current) totalLength += arr.length;
    const combined = new Float32Array(totalLength);
    let offset = 0;
    for (const arr of audioChunksRef.current) { combined.set(arr, offset); offset += arr.length; }

    setRawPcm(combined);
    if (combined && combined.length > 0) {
      const score = calculateEbuR128Lufs(combined);
      setRecordedLufs(score);
    }
    const wavBlob = encodeWAV(combined, audioCtxRef.current?.sampleRate || 48000, 1);
    setAudioBlob(wavBlob);
    setAudioUrl(URL.createObjectURL(wavBlob));
  }

  async function submitRecording() {
    if (!audioBlob || !currentPhrase) return;

    // Strict LUFS Check (-18.0 to -24.0 LUFS Target)
    let lufsScore = null;
    if (rawPcm && rawPcm.length > 0) {
      lufsScore = calculateEbuR128Lufs(rawPcm);
    }

    if (lufsScore === null) {
      // No speech detected!
      Swal.fire({
        icon: "warning",
        title: "No Speech Found",
        background: "#171717",
        color: "#ffffff",
        html: `<div class="text-left space-y-2 text-sm text-neutral-300">
          <p class="text-amber-400 font-bold">⚠️ No speech detected in your recording!</p>
          <p>Please make sure your microphone is unmuted, speak clearly into your mic, and re-record this phrase.</p>
        </div>`,
        confirmButtonText: "Adjust Mic Settings",
        confirmButtonColor: "#3b82f6"
      });
      setShowMicSettingsModal(true);
      return;
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
            <p>Your phrase recording loudness is <b class="font-mono text-base text-rose-400">${lufsScore} LUFS</b> (Target range: <b class="text-white">-18.0 to -24.0 LUFS</b>).</p>
            <p class="text-rose-400 font-bold">⚠️ Audio is too loud (over -18.0 LUFS)!</p>
            <p>Please open <b>Mic Settings</b> and <b>decrease your mic gain</b> (try -10% or -20%) or speak slightly softer, then re-record this phrase.</p>
          </div>`,
          confirmButtonText: "Adjust Mic Settings",
          confirmButtonColor: "#3b82f6"
        });
        setShowMicSettingsModal(true);
        return;
      }

      if (lufsScore < -24.0) {
        // LUFS < -24 (e.g. -25, -28) => Too quiet! Increase gain!
        Swal.fire({
          icon: "warning",
          title: "Mic Calibration Required (Too Quiet)",
          background: "#171717",
          color: "#ffffff",
          html: `<div class="text-left space-y-2 text-sm text-neutral-300">
            <p>Your phrase recording loudness is <b class="font-mono text-base text-amber-400">${lufsScore} LUFS</b> (Target range: <b class="text-white">-18.0 to -24.0 LUFS</b>).</p>
            <p class="text-amber-400 font-bold">⚠️ Audio is too quiet (under -24.0 LUFS)!</p>
            <p>Please open <b>Mic Settings</b> and <b>increase your mic gain</b> (try +10% or +20%) or speak slightly louder, then re-record this phrase.</p>
          </div>`,
          confirmButtonText: "Adjust Mic Settings",
          confirmButtonColor: "#3b82f6"
        });
        setShowMicSettingsModal(true);
        return;
      }
    }
    
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('phraseId', currentPhrase._id);
      formData.append('recording', audioBlob, 'record.wav');
      formData.append('duration', duration);
      if (lufsScore !== null && lufsScore !== undefined) {
        formData.append('lufs', lufsScore);
      }

      const token = document.cookie.split(";").find(c => c.trim().startsWith("vc_token="))?.split("=")[1] || localStorage.getItem("vc_token");
      
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
      const res = await fetch(BACKEND_URL + '/api/phrases/record', {
        method: 'POST',
        credentials: 'include', // THIS is absolutely required to pass the HTTPOnly auth cookies payload!
        body: formData
      });

      if (!res.ok) {
        let body = {};
        try { body = await res.json(); } catch {}
        // "Already recorded" means a previous submit went through but the response
        // was lost in transit — treat it as success.
        if (body.error === 'Phrase has already been successfully recorded.') {
          resetRecording();
          setCurrentPhrase(null);
          await fetchStats().catch(() => {});
          await fetchNextPhrase().catch(() => {});
          return;
        }
        throw new Error(body.error || 'Upload failed');
      }

      resetRecording();
      setCurrentPhrase(null);
      await fetchStats();
      await fetchNextPhrase();
    } catch (err) {
      console.error('Submit error:', err);
      try {
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
        const check = await fetch(`${BACKEND_URL}/api/phrases/${currentPhrase._id}/status`, {
          credentials: 'include'
        });
        if (check.ok) {
          const { status } = await check.json();
          if (status !== 'recorded' && status !== 'approved') {
            alert(err.message || 'Upload failed. Please try again.');
            return;
          }
        }
      } catch {}
      resetRecording();
      setCurrentPhrase(null);
      await fetchStats().catch(() => {});
      await fetchNextPhrase().catch(() => {});
    } finally {
      setLoading(false);
    }
  }

  const formatTime = (secs) => {
    let m = Math.floor(secs / 60);
    let s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (approvedPhraseApps.length === 0) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 pt-16 md:pt-0 md:pl-72 transition-colors duration-300">
        <Nav />
        <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
          <motion.div 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="mb-8 flex flex-col md:flex-row justify-between md:items-end gap-4"
          >
            <div>
              <button
                onClick={() => navigate('/dashboard')}
                className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-semibold mb-4 transition-colors"
              >
                ← Back to Dashboard
              </button>
              <h1 className="text-3xl font-bold mb-2">TTS Recording Studio</h1>
              <p className="text-neutral-500 dark:text-neutral-400">Contribute your voice to high-quality AI training sets.</p>
            </div>
          </motion.div>

          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-primary-900 to-indigo-950 text-white shadow-2xl shadow-primary-900/20 border border-primary-800/50 p-8 md:p-12 max-w-xl mx-auto mt-12 text-center animate-fade-in flex flex-col items-center justify-center">
            {/* Background Deco */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500 rounded-full blur-[60px] opacity-20 pointer-events-none transform translate-x-1/2 -translate-y-1/2"></div>
            
            <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center mb-6 border-4 border-white/20 text-white shadow-inner">
              <Mic className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-extrabold text-white mb-3">No Approved Phrase Projects</h2>
            <p className="text-primary-100/80 max-w-sm leading-relaxed mb-8 text-center px-6">
              You have not applied to any phrase projects yet. Apply for a project under Project Apply in the sidebar to start recording scripts.
            </p>
            <button 
              onClick={() => navigate('/language-apply?type=phrase')}
              className="bg-white text-primary-900 font-extrabold text-base px-8 py-3.5 rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.25)] hover:shadow-[0_0_35px_rgba(255,255,255,0.4)] transition-all"
            >
              Project Apply
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 pt-16 md:pt-0 md:pl-72 transition-colors duration-300">
      <Nav />
      <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mb-8 flex flex-col md:flex-row justify-between md:items-end gap-4"
        >
        <div>
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-semibold mb-4 transition-colors"
          >
            ← Back to Dashboard
          </button>
          <h1 className="text-3xl font-bold mb-2">TTS Recording Studio</h1>
          <p className="text-neutral-500 dark:text-neutral-400">Contribute your voice to high-quality AI training sets.</p>
        </div>
        <div className="bg-success-100 dark:bg-success-900/30 border border-success-200 dark:border-success-800 p-4 rounded-xl flex items-center gap-4">
          <div className="bg-success-500 text-white p-3 rounded-full">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-success-700 dark:text-success-400">Total Approved Time</p>
            <p className="text-2xl font-mono font-bold text-success-800 dark:text-success-300">{formatTime(stats.totalSeconds)}</p>
          </div>
        </div>
      </motion.div>

      {/* Progress Bar */}
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="mb-8"
      >
        <div className="flex justify-between items-end mb-2">
            <div>
                <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wider">Daily Phrase Limit</h3>
                <p className="text-xl font-bold text-white">
                    {stats.phrasesRecordedToday} <span className="text-neutral-500 text-lg">/ {stats.dailyPhraseLimit === -1 ? '∞' : stats.dailyPhraseLimit}</span>
                </p>
            </div>
            {stats.dailyPhraseLimit !== -1 && (
                <div className="text-sm font-medium text-neutral-400">
                    {Math.round((stats.phrasesRecordedToday / stats.dailyPhraseLimit) * 100)}%
                </div>
            )}
        </div>
        {stats.dailyPhraseLimit !== -1 && (
            <div className="h-3 w-full bg-neutral-800 rounded-full overflow-hidden border border-neutral-700">
                <div 
                    className={`h-full transition-all duration-1000 ${stats.phrasesRecordedToday >= stats.dailyPhraseLimit ? 'bg-error-500' : 'bg-primary-500'}`}
                    style={{ width: `${Math.min(100, (stats.phrasesRecordedToday / stats.dailyPhraseLimit) * 100)}%` }}
                />
            </div>
        )}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Workspace */}
        <motion.div 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 space-y-6"
        >
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">1. Fetch a Phrase</h2>
            
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <div className="flex-1">
                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <FolderGit2 className="w-4 h-4" /> Project
                </label>
                <select 
                  className="input w-full"
                  value={projectName} 
                  onChange={(e) => {
                    setProjectName(e.target.value);
                    setCurrentPhrase(null);
                  }}
                  disabled={loading || isRecording}
                >
                  {approvedCompanies.map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex-1">
                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Mic className="w-4 h-4" /> Language
                </label>
                <select 
                  className="input w-full capitalize" 
                  value={language} 
                  onChange={(e) => {
                    setLanguage(e.target.value);
                    setCurrentPhrase(null);
                  }}
                  disabled={loading || isRecording}
                >
                  {availableLanguages.map(lang => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>

              <div className="flex-1 flex items-end">
                <button 
                  type="button"
                  onClick={() => setShowMicSettingsModal(true)}
                  disabled={loading || isRecording}
                  className="input w-full bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-semibold flex items-center justify-between transition-all"
                  title="Configure Noise Gate and Gain Control"
                >
                  <span className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-primary-500" /> Mic Settings
                  </span>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400">
                    {micGainPercent > 0 ? `+${micGainPercent}%` : `${micGainPercent}%`} | {activeNoiseGateDb}dB
                  </span>
                </button>
              </div>
            </div>

            {/* Mic Settings Popup Modal */}
            <AnimatePresence>
              {showMicSettingsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 w-full max-w-md shadow-2xl relative"
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
                        onChange={(e) => handleNoiseGateChange(e.target.value)}
                        disabled={loading || isRecording}
                      >
                        <option value={0}>0 dB (RAW / Off)</option>
                        <option value={-6}>-6 dB (Light Attenuation)</option>
                        <option value={-10}>-10 dB (Medium Attenuation)</option>
                        <option value={-12}>-12 dB (Strong Attenuation)</option>
                        <option value={-15}>-15 dB (Heavy Attenuation)</option>
                        <option value={-18}>-18 dB (Maximum Attenuation)</option>
                      </select>
                      <p className="text-[11px] text-neutral-500 mt-1">Attenuates background room noise during quiet pauses.</p>
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
                        disabled={loading || isRecording}
                        className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-success-500"
                      />
                      <div className="flex justify-between text-[11px] text-neutral-400 font-mono font-semibold px-0.5 mt-1">
                        <span>-100% (Mute)</span>
                        <span>0% (Raw Input)</span>
                        <span>+100% (2x Louder)</span>
                      </div>
                    </div>

                    {/* LUFS Calibration Section */}
                    <div className="mb-6 p-4 rounded-2xl border border-primary-500/30 bg-primary-950/20 dark:bg-neutral-800/90 text-neutral-900 dark:text-white shadow-inner">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider flex items-center gap-2">
                          <Activity className="w-4 h-4 text-primary-500" /> Check LUFS (3s Calibration)
                        </label>
                        <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-300 font-mono px-2 py-0.5 rounded bg-primary-500/10 border border-primary-500/20">Target: -18 to -24 LUFS</span>
                      </div>

                      <p className="text-xs text-neutral-600 dark:text-neutral-300 mb-3 font-medium">
                        Click below and speak naturally for 3 seconds to test your mic volume calibration.
                      </p>

                      <button
                        type="button"
                        onClick={runLufsTest}
                        disabled={isLufsTesting || isRecording || loading}
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
                            : lufsResult.status === "no_speech"
                            ? "bg-neutral-800 border-neutral-700 text-neutral-300"
                            : lufsResult.status === "too_loud"
                            ? "bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300"
                            : "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300"
                        }`}>
                          <span className="flex items-center gap-1.5 font-semibold">
                            {lufsResult.status === "pass" 
                              ? "✓ Perfect Volume (-18 to -24 LUFS)" 
                              : lufsResult.status === "no_speech"
                              ? "⚠️ No speech found"
                              : lufsResult.status === "too_loud" 
                              ? "⚠️ Too Loud (Reduce Gain)" 
                              : "⚠️ Too Quiet (Boost Gain)"}
                          </span>
                          <span className="font-mono text-sm font-black px-2 py-0.5 rounded bg-neutral-900 text-white">
                            {lufsResult.lufs !== null ? `${lufsResult.lufs} LUFS` : "No Speech"}
                          </span>
                        </div>
                      )}
                    </div>

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

            <div className="flex justify-end mb-4">
               <Link to="/language-apply" className="text-sm font-medium text-primary-600 hover:text-primary-700">
                 + Apply for New Project/Language
               </Link>
            </div>

            <div className="flex items-center justify-between bg-primary-900/20 border border-primary-500/30 p-4 rounded-xl mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-primary-500 p-2 rounded-lg text-white">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-primary-400 uppercase tracking-wider">Current Payrate</p>
                  <p className="font-bold text-lg text-white">${currentPayrate.toFixed(2)} / hour</p>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <button 
                className="btn btn-primary w-full"
                onClick={fetchNextPhrase}
                disabled={loading || isRecording || (stats.dailyPhraseLimit !== -1 && stats.phrasesRecordedToday >= stats.dailyPhraseLimit)}
              >
                {loading && !currentPhrase ? 'Searching...' : 'Get Next Phrase'}
              </button>
            </div>
            {error && <p className="text-error-500 mt-3 text-sm">{error}</p>}
            {stats.dailyPhraseLimit !== -1 && stats.phrasesRecordedToday >= stats.dailyPhraseLimit && (
                <p className="text-warning-500 mt-3 text-sm font-semibold">You have reached your daily phrase limit! Please come back tomorrow.</p>
            )}
          </div>

          <AnimatePresence mode="popLayout">
            {currentPhrase && (
              <motion.div 
                key={currentPhrase._id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="card border-l-4 border-l-primary-500 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-3 py-1 rounded-bl-xl text-xs font-bold uppercase tracking-wider">
                  {currentPhrase.language}
                </div>
                
                <h2 className="text-lg font-semibold mb-2 opacity-70">Read this text clearly:</h2>
                <div className="bg-neutral-50 dark:bg-neutral-800/80 p-6 rounded-xl border border-neutral-200 dark:border-neutral-700 mb-6">
                  <p className="text-2xl md:text-3xl leading-relaxed font-medium">"{currentPhrase.text}"</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8 bg-neutral-50/50 dark:bg-neutral-900/50 p-4 rounded-lg">
                  {currentPhrase.emotion && (!userCustomizations || userCustomizations.length === 0 || userCustomizations.some(uk => uk.toLowerCase() === 'emotion')) && <div><span className="block text-xs uppercase opacity-60 mb-1">Emotion</span><span className="font-medium">{currentPhrase.emotion}</span></div>}
                  {currentPhrase.style && (!userCustomizations || userCustomizations.length === 0 || userCustomizations.some(uk => uk.toLowerCase() === 'style')) && <div><span className="block text-xs uppercase opacity-60 mb-1">Style</span><span className="font-medium">{currentPhrase.style}</span></div>}
                  {currentPhrase.speed && (!userCustomizations || userCustomizations.length === 0 || userCustomizations.some(uk => uk.toLowerCase() === 'speed')) && <div><span className="block text-xs uppercase opacity-60 mb-1">Speed</span><span className="font-medium">{currentPhrase.speed}</span></div>}
                  {currentPhrase.intent && (!userCustomizations || userCustomizations.length === 0 || userCustomizations.some(uk => uk.toLowerCase() === 'intent')) && <div><span className="block text-xs uppercase opacity-60 mb-1">Intent</span><span className="font-medium">{currentPhrase.intent}</span></div>}
                  {currentPhrase.pitch && (!userCustomizations || userCustomizations.length === 0 || userCustomizations.some(uk => uk.toLowerCase() === 'pitch')) && <div><span className="block text-xs uppercase opacity-60 mb-1">Pitch</span><span className="font-medium">{currentPhrase.pitch}</span></div>}
                  {currentPhrase.volume && (!userCustomizations || userCustomizations.length === 0 || userCustomizations.some(uk => uk.toLowerCase() === 'volume')) && <div><span className="block text-xs uppercase opacity-60 mb-1">Volume</span><span className="font-medium">{currentPhrase.volume}</span></div>}
                  {currentPhrase.tags && Object.entries(currentPhrase.tags)
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
                  {currentPhrase.instructions && <div className="col-span-2 md:col-span-3 mt-2"><span className="block text-xs uppercase opacity-60 mb-1">Notes</span><p className="text-sm border-l-2 border-primary-300 pl-3">{currentPhrase.instructions}</p></div>}
                </div>

                <div className="flex flex-col md:flex-row items-center gap-6 border-t border-neutral-200 dark:border-neutral-700 pt-6">
                  {/* Recorder */}
                  {!isRecording && !audioUrl && (
                    <button 
                      onClick={startRecording}
                      className="w-20 h-20 bg-error-100 hover:bg-error-200 dark:bg-error-900/40 dark:hover:bg-error-900/60 text-error-600 dark:text-error-400 rounded-full flex items-center justify-center transition-all group shadow-inner"
                    >
                      <div className="w-14 h-14 bg-error-500 rounded-full flex items-center justify-center text-white group-hover:scale-105 transition-transform shadow-md">
                        <Mic className="w-6 h-6" />
                      </div>
                    </button>
                  )}

                  {isRecording && (
                    <div className="flex items-center gap-6">
                      <button 
                        onClick={stopRecording}
                        className="w-20 h-20 bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-full flex items-center justify-center transition-all group"
                      >
                        <Square className="w-8 h-8 group-hover:scale-105 transition-transform" />
                      </button>
                      <div className="flex flex-col">
                        <span className="text-error-500 flex items-center gap-2 font-medium tracking-widest pl-2">
                          <span className="w-3 h-3 bg-error-500 rounded-full animate-pulse"></span>
                          RECORDING
                        </span>
                        <span className="text-3xl font-mono mt-1">{formatTime(duration)}</span>
                      </div>
                    </div>
                  )}

                  {audioUrl && !isRecording && (
                    <div className="w-full">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="bg-success-100 dark:bg-success-900/40 text-success-700 dark:text-success-400 px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" /> Recorded ({formatTime(duration)})
                          </span>

                          {recordedLufs !== undefined && (
                            <span className={`px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1.5 border font-mono shadow-sm ${
                              recordedLufs === null
                                ? "bg-neutral-800 text-neutral-300 border-neutral-700"
                                : recordedLufs >= -24.0 && recordedLufs <= -18.0
                                ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40"
                                : recordedLufs > -18.0
                                ? "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40"
                                : "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40"
                            }`}>
                              <Activity className="w-3.5 h-3.5" />
                              {recordedLufs !== null ? `${recordedLufs} LUFS` : "No Speech"}
                              <span className="text-[11px] font-sans font-bold ml-0.5">
                                ({recordedLufs === null 
                                  ? "⚠️ No speech found" 
                                  : recordedLufs >= -24.0 && recordedLufs <= -18.0 
                                  ? "✓ Perfect" 
                                  : recordedLufs > -18.0 
                                  ? "⚠️ Too Loud" 
                                  : "⚠️ Too Quiet"})
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="bg-neutral-100 dark:bg-neutral-800 rounded-xl p-2 mb-4">
                        <audio src={audioUrl} controls controlsList="nodownload noplaybackrate" onContextMenu={(e) => e.preventDefault()} className="w-full h-12" />
                      </div>

                      <div className="flex gap-4">
                        <button 
                          onClick={resetRecording}
                          disabled={loading}
                          className="flex-1 py-3.5 px-4 border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl font-semibold text-base transition-colors flex items-center justify-center gap-2"
                        >
                          <RotateCcw className="w-5 h-5" />
                          Re-record
                        </button>
                        <button 
                          onClick={submitRecording}
                          disabled={loading}
                          className="flex-1 btn btn-primary flex items-center justify-center gap-2 py-3.5 px-4 text-base font-semibold"
                        >
                          {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <UploadCloud className="w-5 h-5" />}
                          {loading ? 'Submitting...' : 'Submit'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Sidebar History */}
        <motion.div 
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-1"
        >
          <div className="card h-full">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              My Submissions
            </h3>
            
            {/* Approved & Pending Duration Counters */}
            <div className="grid grid-cols-2 gap-2 mb-4 bg-neutral-50 dark:bg-neutral-800/60 p-3 rounded-xl border border-neutral-200/60 dark:border-neutral-700/60">
              <div>
                <span className="block text-[10px] font-bold text-success-600 dark:text-success-400 uppercase tracking-wider">Approved Duration</span>
                <span className="font-mono font-bold text-sm text-neutral-900 dark:text-white">
                  {formatHHMMSS(approvedDurationSec)}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-bold text-warning-600 dark:text-warning-400 uppercase tracking-wider">Pending Duration</span>
                <span className="font-mono font-bold text-sm text-neutral-900 dark:text-white">
                  {formatHHMMSS(pendingDurationSec)}
                </span>
              </div>
            </div>
            
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {stats.history.map(item => (
                <div key={item._id} className="p-4 rounded-lg border border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-mono opacity-60 truncate mr-2 flex-1">"{item.text.substring(0, 30)}..."</span>
                    <span className={`badge shrink-0 ${
                      item.status === 'approved' ? 'badge-success' : 
                      item.status === 'rejected' ? 'badge-error' : 'badge-warning'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs opacity-70">
                    <span className="capitalize">{item.language}</span>
                    <span>{item.duration > 0 ? formatTime(item.duration) : '--'}</span>
                  </div>
                  {item.qaComment && item.status === 'rejected' && (
                    <div className="mt-2 text-xs text-error-600 dark:text-error-400 bg-error-50 dark:bg-error-900/20 p-2 rounded">
                      <span className="font-semibold block">Feedback:</span> {item.qaComment}
                    </div>
                  )}
                </div>
              ))}
              {stats.history.length === 0 && (
                <p className="text-center opacity-50 text-sm py-8">You haven't submitted any phrases yet.</p>
              )}
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  </div>
);
}
