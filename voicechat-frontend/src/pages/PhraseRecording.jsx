import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Play, Pause, UploadCloud, CheckCircle2, Clock, DollarSign, FolderGit2, RotateCcw, Sliders, Volume2, Settings, X, Activity, AlertCircle, RefreshCw, Send, Loader2, Sparkles, Radio, Shield } from 'lucide-react';
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

export default function PhraseRecording() {
  const navigate = useNavigate();
  const userInfo = getUserInfo();
  
  // These will be populated from the API
  const [approvedApps, setApprovedApps] = useState([]);
  const [approvedCompanies, setApprovedCompanies] = useState([]);
  const [serverUserRoles, setServerUserRoles] = useState({ isAdmin: false, isQA: false, loaded: false });
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
    let newLangs = Array.from(new Set(
      approvedApps
        .filter(a => a.status === 'approved' && (a.applicationType === 'phrase' || !a.applicationType) && (!projectName || String(a.companyId || "").toLowerCase().trim() === String(projectName || "").toLowerCase().trim()))
        .map(a => String(a.languageCode || "").toLowerCase().trim())
    )).filter(Boolean);

    if (newLangs.length === 0 && (userInfo?.isAdmin || userInfo?.isQA)) {
      newLangs = (allLanguages || []).map(l => l.code).filter(Boolean);
      if (newLangs.length === 0) newLangs = ['hindi', 'english'];
    }

    setAvailableLanguages(newLangs);
    if (!language || !newLangs.includes(language)) {
      setLanguage(newLangs[0] || '');
    }
  }, [projectName, approvedApps, allLanguages, userInfo]);

  const activeApp = React.useMemo(() => {
    return approvedApps.find(a => {
      const projClean = String(projectName || "").replace(/_downloaded$/i, "").toLowerCase().trim();
      const appComp = String(a.companyId || "").toLowerCase().trim();
      const appClean = String(a.cleanCompanyId || a.companyId || "").replace(/_downloaded$/i, "").toLowerCase().trim();
      const appProj = String(a.projectName || "").toLowerCase().trim();

      const compMatch = !projectName || 
        appComp === String(projectName || "").toLowerCase().trim() ||
        appClean === projClean ||
        appProj === projClean ||
        appComp === projClean;

      const langMatch = !language || String(a.languageCode || "").toLowerCase().trim() === String(language || "").toLowerCase().trim();
      return compMatch && langMatch;
    });
  }, [approvedApps, projectName, language]);

  const activeNoiseGateDb = activeApp?.noiseGateDb !== undefined ? activeApp.noiseGateDb : (userInfo?.noiseGateDb || 0);
  const activeNotch5k = activeApp?.notch5kEnabled !== undefined ? activeApp.notch5kEnabled : (userInfo?.notch5kEnabled ?? true);
  const activeDeHiss = activeApp?.deHissMode || userInfo?.deHissMode || "off";
  const activeDeEsser = activeApp?.deEsserMode || userInfo?.deEsserMode || "off";

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
    if (isLufsTesting || activeSlotId !== null) return;
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
    workletNode.port.postMessage({
      type: "setAudioConfig",
      noiseGateDb: activeNoiseGateDb,
      gainBoost: micGainMultiplier,
      notch5kEnabled: activeNotch5k,
      deHissMode: activeDeHiss,
      deEsserMode: activeDeEsser
    });

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
        if (score === null) status = "no_speech";
        else if (score > -18.0) status = "too_loud";
        else if (score < -25.0) status = "too_quiet";

        setLufsResult({ lufs: score, status });
        setIsLufsTesting(false);
      }
    }, 1000);
  };

  async function handleAudioConfigChange(changes) {
    const newNoiseGateDb = changes.noiseGateDb !== undefined ? (parseInt(changes.noiseGateDb) || 0) : activeNoiseGateDb;
    const newNotch5k = changes.notch5kEnabled !== undefined ? changes.notch5kEnabled : activeNotch5k;
    const newDeHiss = changes.deHissMode !== undefined ? changes.deHissMode : activeDeHiss;
    const newDeEsser = changes.deEsserMode !== undefined ? changes.deEsserMode : activeDeEsser;

    try {
      await apiPostJson('/api/language-applications/noise-gate', {
        applicationType: 'phrase',
        companyId: projectName,
        languageCode: language,
        noiseGateDb: newNoiseGateDb,
        notch5kEnabled: newNotch5k,
        deHissMode: newDeHiss,
        deEsserMode: newDeEsser
      });

      setApprovedApps(prevApps => {
        let updated = false;
        const newApps = prevApps.map(app => {
          const compMatch = !projectName || String(app.companyId || "").toLowerCase().trim() === String(projectName || "").toLowerCase().trim();
          const langMatch = !language || String(app.languageCode || "").toLowerCase().trim() === String(language || "").toLowerCase().trim();
          if (compMatch && langMatch && (app.applicationType || 'phrase') === 'phrase') {
            updated = true;
            return {
              ...app,
              noiseGateDb: newNoiseGateDb,
              notch5kEnabled: newNotch5k,
              deHissMode: newDeHiss,
              deEsserMode: newDeEsser
            };
          }
          return app;
        });
        if (!updated) {
          newApps.push({
            applicationType: 'phrase',
            companyId: projectName,
            languageCode: language,
            noiseGateDb: newNoiseGateDb,
            notch5kEnabled: newNotch5k,
            deHissMode: newDeHiss,
            deEsserMode: newDeEsser,
            status: 'approved'
          });
        }
        return newApps;
      });

      if (workletNodeRef.current) {
        workletNodeRef.current.port.postMessage({
          type: "setAudioConfig",
          noiseGateDb: newNoiseGateDb,
          gainBoost: micGainMultiplier,
          notch5kEnabled: newNotch5k,
          deHissMode: newDeHiss,
          deEsserMode: newDeEsser
        });
      }

      const Toast = Swal.mixin({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 1500,
        timerProgressBar: true,
        background: "#1f2937",
        color: "#fff"
      });
      Toast.fire({
        icon: "success",
        title: "Audio settings updated"
      });
    } catch (err) {
      console.error("Failed to update audio configuration:", err);
    }
  }

  const [slots, setSlots] = useState([
    { id: 0, phrase: null, isRecording: false, audioBlob: null, audioUrl: null, duration: 0, recordedLufs: null, rawPcm: null, isSubmitting: false },
    { id: 1, phrase: null, isRecording: false, audioBlob: null, audioUrl: null, duration: 0, recordedLufs: null, rawPcm: null, isSubmitting: false },
    { id: 2, phrase: null, isRecording: false, audioBlob: null, audioUrl: null, duration: 0, recordedLufs: null, rawPcm: null, isSubmitting: false },
    { id: 3, phrase: null, isRecording: false, audioBlob: null, audioUrl: null, duration: 0, recordedLufs: null, rawPcm: null, isSubmitting: false },
    { id: 4, phrase: null, isRecording: false, audioBlob: null, audioUrl: null, duration: 0, recordedLufs: null, rawPcm: null, isSubmitting: false }
  ]);

  const [activeSlotId, setActiveSlotId] = useState(null);
  const [userCustomizations, setUserCustomizations] = useState([]);
  const [enforceLufs, setEnforceLufs] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const getPhraseTagValue = (phraseObj, tagKey) => {
    if (!phraseObj || typeof phraseObj !== 'object') return null;
    const lowerKey = String(tagKey).trim().toLowerCase();
    
    // 1. Check top-level properties
    for (const [k, v] of Object.entries(phraseObj)) {
      if (k.toLowerCase() === lowerKey) {
        if (v !== null && v !== undefined && String(v).trim() !== '' && typeof v !== 'object') {
          return String(v);
        }
      }
    }

    // 2. Check nested phraseObj.tags if present (e.g. phrase.tags.domain)
    if (phraseObj.tags && typeof phraseObj.tags === 'object') {
      for (const [k, v] of Object.entries(phraseObj.tags)) {
        if (k.toLowerCase() === lowerKey) {
          if (v !== null && v !== undefined && String(v).trim() !== '' && typeof v !== 'object') {
            return String(v);
          }
        }
      }
    }

    // 3. Check nested phraseObj.metadata if present
    if (phraseObj.metadata && typeof phraseObj.metadata === 'object') {
      for (const [k, v] of Object.entries(phraseObj.metadata)) {
        if (k.toLowerCase() === lowerKey) {
          if (v !== null && v !== undefined && String(v).trim() !== '' && typeof v !== 'object') {
            return String(v);
          }
        }
      }
    }

    return null;
  };

  const isTagVisible = (key) => {
    if (!key) return false;
    if (!userCustomizations || userCustomizations.length === 0) {
      return ['emotion', 'style', 'speed', 'intent', 'pitch', 'volume'].includes(key.toLowerCase());
    }
    return userCustomizations.some(uk => uk.toLowerCase() === key.toLowerCase());
  };

  // Recording State Refs
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const workletNodeRef = useRef(null);
  const audioChunksRef = useRef([]);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        const [statsData, projectsData, languagesData, appsData, companiesData] = await Promise.all([
          apiGet('/api/phrases/my-stats'),
          apiGet('/api/projects'),
          apiGet('/api/languages'),
          apiGet('/api/language-applications/my'),
          apiGet('/api/admin/companies').catch(() => ({ companies: [] }))
        ]);

        if (!isMounted) return;

        const myApps = appsData.applications || [];
        const isUserAdmin = appsData.isAdmin === true;
        const isUserQA = appsData.isQA === true;
        setServerUserRoles({ isAdmin: isUserAdmin, isQA: isUserQA, loaded: true });

        const rawApproved = myApps.filter(app => app.status === 'approved' && (app.applicationType === 'phrase' || !app.applicationType));
        const allComps = companiesData.companies || [];
        const hiddenCompNames = new Set(allComps.filter(c => c.isHidden).map(c => String(c.name || '').toLowerCase().trim()));

        const approved = (!isUserAdmin && !isUserQA)
          ? rawApproved.filter(app => {
              const compKey = String(app.companyId || '').toLowerCase().trim();
              if (hiddenCompNames.has(compKey)) return false;
              const compObj = allComps.find(c => String(c.name || '').toLowerCase().trim() === compKey);
              if (compObj) {
                const hiddenLangs = new Set((compObj.hiddenLanguages || []).map(l => String(l).toLowerCase().trim()));
                if (hiddenLangs.has(String(app.languageCode || '').toLowerCase().trim())) return false;
              }
              return true;
            })
          : rawApproved;

        setApprovedApps(approved);

        const uniqueCompanyIds = Array.from(new Set(approved.map(a => a.companyId).filter(Boolean)));
        let companies = uniqueCompanyIds.map(id => {
          const app = approved.find(a => a.companyId === id);
          return {
            id: id,
            label: app?.projectName || id
          };
        });

        if (companies.length === 0 && (isUserAdmin || isUserQA)) {
          companies = (companiesData.companies || []).map(c => ({ id: c.name, label: c.projectName || c.name }));
          if (companies.length === 0) companies = [{ id: 'General Phrases', label: 'General Phrases' }];
        }

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

    init();

    return () => {
      isMounted = false;
      apiPostJson('/api/phrases/unlock-my-phrases', {}).catch(() => {});
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (language) {
      fetchFiveSlots();
    } else {
      setSlots(prev => prev.map(s => ({ ...s, phrase: null })));
    }
  }, [language, projectName]);

  async function fetchStats() {
    try {
      const statsData = await apiGet('/api/phrases/my-stats');
      setStats({ 
        totalSeconds: statsData.totalSeconds || 0, 
        history: statsData.history || [],
        dailyPhraseLimit: statsData.dailyPhraseLimit !== undefined ? statsData.dailyPhraseLimit : 1000,
        phrasesRecordedToday: statsData.phrasesRecordedToday || 0,
        overallPhraseLimit: statsData.overallPhraseLimit !== undefined ? statsData.overallPhraseLimit : -1,
        totalPhrasesRecorded: statsData.totalPhrasesRecorded || 0
      });
    } catch (err) {
      console.error('Failed to fetch phrase stats', err);
    }
  }

  // Calculate current payrate based on selection
  const currentPayrate = React.useMemo(() => {
    let rate = 0;
    if (!language) return 0;

    const baseLang = allLanguages.find(l => l.code && l.code.toLowerCase() === language.toLowerCase());
    if (baseLang) rate = Number(baseLang.hourlyPayout) || 0;

    if (projectName && projectName !== 'Any') {
      const proj = projects.find(p => p.name === projectName);
      if (proj && proj.languageRates) {
        const specRate = proj.languageRates.find(r => r.languageCode && r.languageCode.toLowerCase() === language.toLowerCase());
        if (specRate && Number(specRate.hourlyPayout) > 0) {
          rate = Number(specRate.hourlyPayout);
        }
      }
    }

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

  async function fetchFiveSlots(isRefresh = false) {
    if (!language) return;
    const isAdminOrQA = serverUserRoles.loaded ? (serverUserRoles.isAdmin || serverUserRoles.isQA) : (userInfo?.isAdmin || userInfo?.isQA);
    if (!isAdminOrQA) {
      if (!approvedApps || approvedApps.length === 0) {
        setSlots(prev => prev.map(s => ({ ...s, phrase: null })));
        return;
      }
      const isApprovedForSelection = approvedApps.some(a => 
        a.status === 'approved' && 
        (a.applicationType === 'phrase' || !a.applicationType) &&
        (!projectName || String(a.companyId || "").toLowerCase().trim() === String(projectName || "").toLowerCase().trim()) &&
        String(a.languageCode || "").toLowerCase().trim() === String(language || "").toLowerCase().trim()
      );
      if (!isApprovedForSelection) {
        setError("You are not approved for this project and language.");
        setSlots(prev => prev.map(s => ({ ...s, phrase: null })));
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      let url = `/api/phrases/available?language=${encodeURIComponent(language)}`;
      if (projectName && projectName !== 'Any') {
        url += `&projectName=${encodeURIComponent(projectName)}`;
      }
      if (isRefresh === true) {
        url += `&refresh=true`;
      }
      const data = await apiGet(url);
      if (data.redirect && !userInfo?.isAdmin && !userInfo?.isQA) {
        navigate(data.redirect, { replace: true });
        return;
      }
      const rawFetchedPhrases = data.phrases || (data.phrase ? [data.phrase] : []);
      setUserCustomizations(data.userCustomizations || []);
      setEnforceLufs(data.enforceLufs !== false);

      // Client-side deduplication safety net
      const seenBaseIds = new Set();
      const seenTexts = new Set();
      const fetchedPhrases = [];
      for (const p of rawFetchedPhrases) {
        if (!p) continue;
        const pId = p.phraseId ? String(p.phraseId).trim().toLowerCase() : "";
        const baseId = pId.replace(/_c\d+$/, "").trim();
        const textNorm = p.text ? String(p.text).trim().toLowerCase() : "";

        if ((baseId && seenBaseIds.has(baseId)) || (pId && seenBaseIds.has(pId)) || (textNorm && seenTexts.has(textNorm))) {
          continue;
        }
        if (baseId) seenBaseIds.add(baseId);
        if (pId) seenBaseIds.add(pId);
        if (textNorm) seenTexts.add(textNorm);
        fetchedPhrases.push(p);
      }

      setSlots(prev => prev.map((s, idx) => ({
        ...s,
        phrase: fetchedPhrases[idx] || null,
        isRecording: false,
        audioBlob: null,
        audioUrl: null,
        duration: 0,
        recordedLufs: null,
        rawPcm: null,
        isSubmitting: false
      })));

      if (fetchedPhrases.length === 0) {
        setError(data.message || 'No phrases available to record for your account right now.');
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "info",
          title: "No phrases available to record",
          text: "There are no unallocated or assigned phrases available for your speaker account in this project.",
          timer: 3500,
          showConfirmButton: false
        });
      }
    } catch (err) {
      console.error('Failed to fetch 5 phrases', err);
      setError('Failed to fetch phrases.');
    } finally {
      setLoading(false);
    }
  }

  async function startRecordingSlot(slotId) {
    if (activeSlotId !== null && activeSlotId !== slotId) {
      stopRecordingSlot(activeSlotId);
      await new Promise(r => setTimeout(r, 150));
    }

    setSlots(prev => prev.map(s => s.id === slotId ? {
      ...s,
      isRecording: true,
      audioBlob: null,
      audioUrl: null,
      duration: 0,
      recordedLufs: null,
      rawPcm: null
    } : s));

    setActiveSlotId(slotId);
    audioChunksRef.current = [];

    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: { ideal: 48000 }
          }
        });
      } catch (e1) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      streamRef.current = stream;

      const track = stream.getAudioTracks()[0];
      const settings = track ? track.getSettings() : {};
      const trackSampleRate = settings.sampleRate || 48000;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx({ sampleRate: trackSampleRate });
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      try {
        await audioCtx.audioWorklet.addModule('/pcm-worklet.js');
      } catch (wErr) {
        console.warn('Worklet module note:', wErr);
      }

      const mult = parseFloat((1.0 + ((parseInt(micGainPercent) || 0) / 100)).toFixed(2));
      const workletNode = new AudioWorkletNode(audioCtx, 'pcm-processor');
      workletNodeRef.current = workletNode;

      workletNode.port.postMessage({
        type: "setAudioConfig",
        noiseGateDb: activeNoiseGateDb,
        gainBoost: mult,
        notch5kEnabled: activeNotch5k,
        deHissMode: activeDeHiss,
        deEsserMode: activeDeEsser
      });

      const gain = audioCtx.createGain();
      gain.gain.value = 0;

      workletNode.port.onmessage = (event) => {
        if (event.data) {
          audioChunksRef.current.push(new Float32Array(event.data));
        }
      };

      source.connect(workletNode);
      workletNode.connect(gain);
      gain.connect(audioCtx.destination);

      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setSlots(prev => prev.map(s => s.id === slotId ? { ...s, duration: elapsed } : s));
      }, 500);
    } catch (err) {
      console.error('Failed to start recording slot:', err);
      setActiveSlotId(null);
      setSlots(prev => prev.map(s => s.id === slotId ? { ...s, isRecording: false } : s));
      Swal.fire({
        icon: 'error',
        title: 'Microphone Access Required',
        text: 'Please allow microphone access to record phrases.',
        background: '#171717',
        color: '#ffffff'
      });
    }
  }

  function stopRecordingSlot(slotId) {
    const targetId = slotId !== undefined ? slotId : activeSlotId;
    if (targetId === null) return;

    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
    }

    let totalLen = 0;
    for (const arr of audioChunksRef.current) totalLen += arr.length;

    const combined = new Float32Array(totalLen);
    let offset = 0;
    for (const arr of audioChunksRef.current) {
      combined.set(arr, offset);
      offset += arr.length;
    }

    let score = null;
    let wavBlob = null;
    let url = null;

    if (combined && combined.length > 0) {
      score = calculateEbuR128Lufs(combined, 48000);
      wavBlob = encodeWAV(combined, 48000, 1);
      url = URL.createObjectURL(wavBlob);
    }

    setSlots(prev => prev.map(s => s.id === targetId ? {
      ...s,
      isRecording: false,
      audioBlob: wavBlob,
      audioUrl: url,
      recordedLufs: score,
      rawPcm: combined
    } : s));

    setActiveSlotId(null);
  }

  function resetSlot(slotId) {
    setSlots(prev => prev.map(s => s.id === slotId ? {
      ...s,
      isRecording: false,
      audioBlob: null,
      audioUrl: null,
      duration: 0,
      recordedLufs: null,
      rawPcm: null
    } : s));
  }

  async function submitSlot(slotId) {
    const slot = slots[slotId];
    if (!slot || !slot.phrase || !slot.audioBlob) return;

    let lufsScore = null;
    if (slot.rawPcm && slot.rawPcm.length > 0) {
      lufsScore = calculateEbuR128Lufs(slot.rawPcm, 48000);
    }

    // Determine if LUFS constraint is enforced for this project
    const isLufsEnforced = activeApp?.enforceLufs !== undefined 
      ? activeApp.enforceLufs === true 
      : enforceLufs === true;

    if (isLufsEnforced) {
      if (lufsScore === null) {
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

      if (lufsScore > -18.0) {
        Swal.fire({
          icon: "warning",
          title: "Mic Calibration Required (Too Loud)",
          background: "#171717",
          color: "#ffffff",
          html: `<div class="text-left space-y-2 text-sm text-neutral-300">
            <p>Your phrase recording loudness is <b class="font-mono text-base text-rose-400">${lufsScore} LUFS</b> (Target range: <b class="text-white">-18.0 to -25.0 LUFS</b>).</p>
            <p class="text-rose-400 font-bold">⚠️ Audio is too loud (over -18.0 LUFS)!</p>
            <p>Please open <b>Mic Settings</b> and <b>decrease your mic gain</b> (try -10% or -20%) or speak slightly softer, then re-record this phrase.</p>
          </div>`,
          confirmButtonText: "Adjust Mic Settings",
          confirmButtonColor: "#3b82f6"
        });
        setShowMicSettingsModal(true);
        return;
      }

      if (lufsScore < -25.0) {
        Swal.fire({
          icon: "warning",
          title: "Mic Calibration Required (Too Quiet)",
          background: "#171717",
          color: "#ffffff",
          html: `<div class="text-left space-y-2 text-sm text-neutral-300">
            <p>Your phrase recording loudness is <b class="font-mono text-base text-amber-400">${lufsScore} LUFS</b> (Target range: <b class="text-white">-18.0 to -25.0 LUFS</b>).</p>
            <p class="text-amber-400 font-bold">⚠️ Audio is too quiet (under -25.0 LUFS)!</p>
            <p>Please open <b>Mic Settings</b> and <b>increase your mic gain</b> (try +10% or +20%) or speak slightly louder, then re-record this phrase.</p>
          </div>`,
          confirmButtonText: "Adjust Mic Settings",
          confirmButtonColor: "#3b82f6"
        });
        setShowMicSettingsModal(true);
        return;
      }
    }

    // Mark ONLY this slot as submitting
    setSlots(prev => prev.map(s => s.id === slotId ? { ...s, isSubmitting: true } : s));

    try {
      const formData = new FormData();
      formData.append('phraseId', slot.phrase._id);
      formData.append('recording', slot.audioBlob, 'record.wav');
      formData.append('duration', slot.duration);
      if (lufsScore !== null && lufsScore !== undefined) {
        formData.append('lufs', lufsScore);
      }

      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
      const res = await fetch(BACKEND_URL + '/api/phrases/record', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      // Fetch 1 replacement phrase for ONLY slotId!
      const otherSlots = slots.filter(s => s.id !== slotId && s.phrase);
      const currentOtherIds = otherSlots.map(s => s.phrase._id);
      const currentOtherBaseIds = otherSlots.map(s => String(s.phrase.phraseId || '').replace(/_c\d+$/, '').trim()).filter(Boolean);
      const currentOtherTexts = otherSlots.map(s => String(s.phrase.text || '').trim()).filter(Boolean);

      // Also exclude submitted phrase's base ID and text explicitly
      if (slot.phrase) {
        if (slot.phrase.phraseId) {
          const subBaseId = String(slot.phrase.phraseId).replace(/_c\d+$/, '').trim();
          if (subBaseId) currentOtherBaseIds.push(subBaseId);
        }
        if (slot.phrase.text) {
          currentOtherTexts.push(String(slot.phrase.text).trim());
        }
      }

      let url = `/api/phrases/available?language=${encodeURIComponent(language)}`;
      if (projectName && projectName !== 'Any') {
        url += `&projectName=${encodeURIComponent(projectName)}`;
      }
      if (currentOtherIds.length > 0) {
        url += `&excludeIds=${currentOtherIds.join(',')}`;
      }
      if (currentOtherBaseIds.length > 0) {
        url += `&excludeBaseIds=${encodeURIComponent(Array.from(new Set(currentOtherBaseIds)).join(','))}`;
      }
      if (currentOtherTexts.length > 0) {
        url += `&excludeTexts=${encodeURIComponent(Array.from(new Set(currentOtherTexts)).join(','))}`;
      }
      if (slot.phrase && slot.phrase.emotion) {
        url += `&lastEmotion=${encodeURIComponent(slot.phrase.emotion)}`;
      }

      const repData = await apiGet(url).catch(() => null);
      const newPhrase = repData?.phrase || repData?.phrases?.[0] || null;
      if (repData && repData.enforceLufs !== undefined) {
        setEnforceLufs(repData.enforceLufs !== false);
      }
      if (repData && repData.userCustomizations) {
        setUserCustomizations(repData.userCustomizations);
      }

      // Replace ONLY slotId in-place! All other slots maintain their exact position & state!
      setSlots(prev => prev.map(s => s.id === slotId ? {
        id: slotId,
        phrase: newPhrase,
        isRecording: false,
        audioBlob: null,
        audioUrl: null,
        duration: 0,
        recordedLufs: null,
        rawPcm: null,
        isSubmitting: false
      } : s));

      fetchStats().catch(() => {});
    } catch (err) {
      console.error('Submit slot error:', err);
      setSlots(prev => prev.map(s => s.id === slotId ? { ...s, isSubmitting: false } : s));
      fetchStats().catch(() => {});
    }
  }



  const formatTime = (secs) => {
    let m = Math.floor(secs / 60);
    let s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };



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
          <h1 className="text-3xl font-bold mb-2">Phrase Recording Studio</h1>
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

      {!serverUserRoles.isAdmin && !serverUserRoles.isQA && serverUserRoles.loaded && approvedCompanies.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card text-center py-16 px-6 max-w-2xl mx-auto space-y-4"
        >
          <div className="w-16 h-16 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-2">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white">No Approved Phrase Projects</h2>
          <p className="text-neutral-400 text-sm max-w-md mx-auto">
            You do not currently have access to any active phrase projects. If you were recently removed or reset, please submit an application for an active project.
          </p>
          <div className="pt-4 flex justify-center gap-3">
            <button
              onClick={() => navigate('/language-apply?type=phrase')}
              className="btn btn-primary px-6 py-2.5 flex items-center gap-2"
            >
              Apply for Projects →
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="btn btn-secondary px-6 py-2.5"
            >
              Return to Dashboard
            </button>
          </div>
        </motion.div>
      ) : (
        <>
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
                      }}
                      disabled={loading || activeSlotId !== null}
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
                      }}
                      disabled={loading || activeSlotId !== null}
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
                      disabled={loading || activeSlotId !== null}
                      className="input w-full bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-semibold flex items-center justify-between transition-all"
                      title="Configure Noise Gate, 5kHz Notch, De-Hiss, De-Esser & Gain Control"
                    >
                      <span className="flex items-center gap-1.5 truncate mr-1">
                        <Settings className="w-4 h-4 text-primary-500 shrink-0" /> <span className="truncate">Mic & Audio DSP</span>
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {activeNotch5k && (
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                            5k
                          </span>
                        )}
                        {activeDeHiss !== "off" && (
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-600 dark:text-cyan-400">
                            {activeDeHiss}
                          </span>
                        )}
                        {activeDeEsser !== "off" && (
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-600 dark:text-purple-400">
                            Ess
                          </span>
                        )}
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400">
                          {activeNoiseGateDb}dB
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

            {/* Mic Settings Popup Modal */}
            <AnimatePresence>
              {showMicSettingsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto"
                  >
                    <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-4 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="bg-primary-500/10 text-primary-500 p-2 rounded-xl">
                          <Settings className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">Audio DSP & Mic Settings</h3>
                          <p className="text-xs text-neutral-500">Real-time filters, noise gate & gain</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setShowMicSettingsModal(false)}
                        className="p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-lg transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                      {/* Noise Gate Section */}
                      <div className="bg-neutral-50 dark:bg-neutral-800/60 p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-700/60">
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                          <Sliders className="w-3.5 h-3.5 text-warning-500" /> Noise Gate
                        </label>
                        <select 
                          className="input w-full font-semibold text-xs py-2 border-warning-500/40 text-warning-700 dark:text-warning-300 bg-white dark:bg-neutral-800" 
                          value={activeNoiseGateDb} 
                          onChange={(e) => handleAudioConfigChange({ noiseGateDb: e.target.value })}
                          disabled={loading || activeSlotId !== null}
                        >
                          <option value={0}>0 dB (RAW / Off)</option>
                          <option value={-6}>-6 dB (Light)</option>
                          <option value={-10}>-10 dB (Medium)</option>
                          <option value={-12}>-12 dB (Standard)</option>
                          <option value={-15}>-15 dB (Heavy)</option>
                          <option value={-18}>-18 dB (Maximum)</option>
                        </select>
                        <p className="text-[10px] text-neutral-500 mt-1">Attenuates silence between words.</p>
                      </div>

                      {/* 5 kHz Notch Filter */}
                      <div className="bg-neutral-50 dark:bg-neutral-800/60 p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-700/60">
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                          <Radio className="w-3.5 h-3.5 text-emerald-500" /> 5 kHz Whine Filter
                        </label>
                        <select 
                          className="input w-full font-semibold text-xs py-2 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-white dark:bg-neutral-800" 
                          value={activeNotch5k ? "true" : "false"} 
                          onChange={(e) => handleAudioConfigChange({ notch5kEnabled: e.target.value === "true" })}
                          disabled={loading || activeSlotId !== null}
                        >
                          <option value="true">Enabled (Removes 5kHz line)</option>
                          <option value="false">Disabled (Bypassed)</option>
                        </select>
                        <p className="text-[10px] text-neutral-500 mt-1">Eliminates USB coil whine / 5kHz line.</p>
                      </div>

                      {/* De-Hiss Filter */}
                      <div className="bg-neutral-50 dark:bg-neutral-800/60 p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-700/60">
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-cyan-500" /> De-Hiss Filter
                        </label>
                        <select 
                          className="input w-full font-semibold text-xs py-2 border-cyan-500/40 text-cyan-700 dark:text-cyan-300 bg-white dark:bg-neutral-800" 
                          value={activeDeHiss} 
                          onChange={(e) => handleAudioConfigChange({ deHissMode: e.target.value })}
                          disabled={loading || activeSlotId !== null}
                        >
                          <option value="off">Off (Full Spectrum)</option>
                          <option value="14k">14 kHz (Light Air Cut)</option>
                          <option value="12k">12 kHz (Standard Clean)</option>
                          <option value="10k">10 kHz (Max Hiss Cut)</option>
                        </select>
                        <p className="text-[10px] text-neutral-500 mt-1">High-shelf cut for preamp white noise.</p>
                      </div>

                      {/* De-Esser */}
                      <div className="bg-neutral-50 dark:bg-neutral-800/60 p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-700/60">
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-purple-500" /> De-Esser (Sibilance)
                        </label>
                        <select 
                          className="input w-full font-semibold text-xs py-2 border-purple-500/40 text-purple-700 dark:text-purple-300 bg-white dark:bg-neutral-800" 
                          value={activeDeEsser} 
                          onChange={(e) => handleAudioConfigChange({ deEsserMode: e.target.value })}
                          disabled={loading || activeSlotId !== null}
                        >
                          <option value="off">Off (No De-Essing)</option>
                          <option value="light">Light (-3 dB)</option>
                          <option value="medium">Medium (-6 dB)</option>
                          <option value="strong">Strong (-9 dB)</option>
                        </select>
                        <p className="text-[10px] text-neutral-500 mt-1">Softens harsh "S" and "Sh" sounds.</p>
                      </div>
                    </div>

                    {/* Gain Control Section */}
                    <div className="mb-5 bg-neutral-50 dark:bg-neutral-800/40 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700/60">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider flex items-center gap-2">
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
                        disabled={loading || activeSlotId !== null}
                        className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-success-500"
                      />
                      <div className="flex justify-between text-[10px] text-neutral-400 font-mono font-semibold px-0.5 mt-1">
                        <span>-100% (Mute)</span>
                        <span>0% (Raw Input)</span>
                        <span>+100% (2x Louder)</span>
                      </div>
                    </div>

                    {/* LUFS Calibration Section */}
                    {enforceLufs !== false && (
                      <div className="mb-5 p-4 rounded-2xl border border-primary-500/30 bg-primary-950/20 dark:bg-neutral-800/90 text-neutral-900 dark:text-white shadow-inner">
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider flex items-center gap-2">
                            <Activity className="w-4 h-4 text-primary-500" /> Check LUFS (3s Calibration)
                          </label>
                          <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-300 font-mono px-2 py-0.5 rounded bg-primary-500/10 border border-primary-500/20">Target: -18 to -25 LUFS</span>
                        </div>

                        <p className="text-xs text-neutral-600 dark:text-neutral-300 mb-3 font-medium">
                          Click below and speak naturally for 3 seconds to test your mic volume calibration with active DSP.
                        </p>

                        <button
                          type="button"
                          onClick={runLufsTest}
                          disabled={isLufsTesting || activeSlotId !== null || loading}
                          className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-md ${
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
                          <div className={`mt-3 p-3 rounded-xl border flex items-center justify-between text-xs font-bold shadow-sm ${
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
                                ? "✓ Perfect Volume (-18 to -25 LUFS)" 
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
                    )}

                    <div className="flex justify-end pt-1">
                      <button 
                        onClick={() => setShowMicSettingsModal(false)}
                        className="btn btn-primary w-full py-2.5 font-bold"
                      >
                        Done & Apply Settings
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
                onClick={() => fetchFiveSlots(true)}
                disabled={loading || activeSlotId !== null || (stats.dailyPhraseLimit !== -1 && stats.phrasesRecordedToday >= stats.dailyPhraseLimit)}
              >
                {loading ? 'Refreshing Phrases...' : 'Refresh 5 Phrases'}
              </button>
            </div>
            {error && <p className="text-error-500 mt-3 text-sm">{error}</p>}
            {stats.dailyPhraseLimit !== -1 && stats.phrasesRecordedToday >= stats.dailyPhraseLimit && (
                <p className="text-warning-500 mt-3 text-sm font-semibold">You have reached your daily phrase limit! Please come back tomorrow.</p>
            )}
          </div>

          {/* 5 Independent Stationary Phrase Containers */}
          <div className="space-y-6">
            {slots.every(s => !s.phrase) && !loading && (
              <div className="card text-center py-12 px-6 border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900/60 rounded-2xl shadow-xl">
                {approvedApps.length === 0 && !serverUserRoles.isAdmin && !serverUserRoles.isQA ? (
                  <>
                    <div className="w-12 h-12 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-3 text-xl font-bold">
                      📝
                    </div>
                    <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-1">No Approved Phrase Projects Yet</h3>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-md mx-auto mb-4">
                      You need at least one approved phrase project application to record phrases. If you recently applied, your submission is pending QA review.
                    </p>
                    <button
                      onClick={() => navigate('/language-apply?type=phrase')}
                      className="btn btn-primary px-6 py-2.5 text-sm font-bold shadow-lg shadow-primary-500/20"
                    >
                      View / Apply for Projects →
                    </button>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-full bg-neutral-200 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-300 flex items-center justify-center mx-auto mb-3 text-xl">
                      🔒
                    </div>
                    <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-1">No Phrases Available to Record</h3>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-md mx-auto">
                      There are no unallocated phrases in the open pool or phrases reserved for your speaker ID (<strong>{userInfo?.speaker_id || 'your account'}</strong>) in this project right now.
                    </p>
                  </>
                )}
              </div>
            )}
            {slots.map((slot, index) => {
              const phrase = slot.phrase;
              if (!phrase) return null;

              return (
                <div
                  key={`container_slot_${index}`}
                  className="card border-l-4 border-l-primary-500 relative overflow-hidden transition-all duration-300"
                >
                  {/* Phrase Number & Language Badge */}
                  <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-extrabold text-xs text-primary-600 dark:text-primary-400 bg-primary-500/10 border border-primary-500/20 px-2.5 py-1 rounded-lg">
                        Phrase #{index + 1}
                      </span>
                      {slot.isSubmitting && (
                        <span className="text-xs text-emerald-400 font-bold flex items-center gap-1.5 animate-pulse">
                          <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
                          Submitting & Fetching Replacement...
                        </span>
                      )}
                    </div>

                    <span className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                      {phrase.language}
                    </span>
                  </div>

                  <h2 className="text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Read this text clearly:</h2>
                  <div className="bg-neutral-50 dark:bg-neutral-800/80 p-5 rounded-xl border border-neutral-200 dark:border-neutral-700 mb-4">
                    <p className="text-xl md:text-2xl leading-relaxed font-medium">"{phrase.text}"</p>
                  </div>

                  {/* Metadata Tags */}
                  <div className="flex flex-wrap items-center gap-3 mb-6 bg-neutral-50/50 dark:bg-neutral-900/50 p-3.5 rounded-lg text-xs">
                    {(() => {
                      const INTERNAL_KEYS = ['text', '_id', 'phraseid', 'companyid', 'projectname', 'language', 'status', 'createdat', 'updatedat', '__v', 'lockedat', 'lockedby', 'istestphrase', 'issample', 'needssecondqareview', 'isedited', 'originaltext', 'editedby', 'editedat', 'editedphrasestatus', 'audiofile', 'duration', 'lufs', 'recordedat', 'qaid', 'qacomment', 'reviewedat', 'qalockedby', 'qalockedat', 'qcresult', 'contributorid'];

                      let visibleKeys = [];
                      if (userCustomizations && userCustomizations.length > 0) {
                        visibleKeys = userCustomizations;
                      } else {
                        visibleKeys = ['emotion', 'style', 'speed', 'intent', 'pitch', 'volume', 'instructions', 'script_type', 'speaker_id', 'freq', 'domain'];
                      }

                      const renderedBadges = [];

                      for (const tagKey of visibleKeys) {
                        if (INTERNAL_KEYS.includes(tagKey.toLowerCase())) continue;
                        const val = getPhraseTagValue(phrase, tagKey);
                        if (val !== null && val !== undefined) {
                          renderedBadges.push(
                            <div key={tagKey} className="bg-neutral-100 dark:bg-neutral-800 px-3 py-1.5 rounded-md border border-neutral-200/50 dark:border-neutral-700/50">
                              <span className="block opacity-60 mb-0.5 uppercase tracking-wider text-[10px]">{tagKey}</span>
                              <span className="font-semibold text-neutral-800 dark:text-neutral-200 capitalize">{val}</span>
                            </div>
                          );
                        }
                      }

                      if (!userCustomizations || userCustomizations.length === 0) {
                        for (const [k, v] of Object.entries(phrase)) {
                          if (!v || typeof v === 'object') continue;
                          if (INTERNAL_KEYS.includes(k.toLowerCase())) continue;
                          if (!visibleKeys.some(vk => vk.toLowerCase() === k.toLowerCase())) {
                            renderedBadges.push(
                              <div key={k} className="bg-neutral-100 dark:bg-neutral-800 px-3 py-1.5 rounded-md border border-neutral-200/50 dark:border-neutral-700/50">
                                <span className="block opacity-60 mb-0.5 uppercase tracking-wider text-[10px]">{k}</span>
                                <span className="font-semibold text-neutral-800 dark:text-neutral-200 capitalize">{String(v)}</span>
                              </div>
                            );
                          }
                        }
                      }

                      return renderedBadges.length > 0 ? renderedBadges : (
                        <span className="text-neutral-400 text-xs italic">No metadata tags configured for this phrase.</span>
                      );
                    })()}
                  </div>

                  {/* Controls below Phrase Container */}
                  <div className="flex flex-col md:flex-row items-center gap-4 border-t border-neutral-200 dark:border-neutral-800 pt-4">
                    {!slot.isRecording && !slot.audioUrl && (
                      <button
                        onClick={() => startRecordingSlot(slot.id)}
                        disabled={slot.isSubmitting || (activeSlotId !== null && activeSlotId !== slot.id)}
                        className="btn btn-primary flex items-center justify-center gap-2 py-3 px-6 text-sm font-bold w-full md:w-auto"
                      >
                        <Mic className="w-4 h-4" /> Record
                      </button>
                    )}

                    {slot.isRecording && (
                      <div className="flex flex-wrap items-center gap-4 w-full">
                        <button
                          onClick={() => stopRecordingSlot(slot.id)}
                          className="py-3 px-6 bg-error-600 hover:bg-error-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-error-500/20"
                        >
                          <Square className="w-4 h-4 fill-white" /> Stop Recording
                        </button>
                        <div className="flex items-center gap-3 bg-error-500/10 border border-error-500/20 py-2 px-4 rounded-xl">
                          <span className="w-3 h-3 bg-error-500 rounded-full animate-pulse"></span>
                          <span className="text-error-500 font-bold text-xs uppercase tracking-wider">Recording</span>
                          <span className="font-mono text-lg font-bold ml-1 text-error-400">{formatTime(slot.duration)}</span>
                        </div>
                      </div>
                    )}

                    {slot.audioUrl && !slot.isRecording && (
                      <div className="w-full space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="bg-success-100 dark:bg-success-900/40 text-success-700 dark:text-success-400 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Recorded ({formatTime(slot.duration)})
                          </span>

                          {slot.recordedLufs !== null && enforceLufs !== false && (
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${
                              slot.recordedLufs >= -25.0 && slot.recordedLufs <= -18.0
                                ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40"
                                : slot.recordedLufs > -18.0
                                ? "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40"
                                : "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40"
                            }`}>
                              {slot.recordedLufs} LUFS
                            </span>
                          )}
                        </div>

                        <div className="bg-neutral-100 dark:bg-neutral-800 rounded-xl p-2">
                          <audio src={slot.audioUrl} controls controlsList="nodownload noplaybackrate" className="w-full h-10" />
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={() => resetSlot(slot.id)}
                            disabled={slot.isSubmitting}
                            className="flex-1 py-2.5 px-4 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl text-xs font-semibold text-neutral-700 dark:text-neutral-200 flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <RotateCcw className="w-4 h-4" /> Re-record
                          </button>
                          <button
                            onClick={() => submitSlot(slot.id)}
                            disabled={slot.isSubmitting}
                            className="flex-1 btn btn-primary flex items-center justify-center gap-1.5 py-2.5 px-4 text-xs font-semibold"
                          >
                            {slot.isSubmitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                            {slot.isSubmitting ? 'Submitting...' : 'Submit Phrase'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}


          </div>
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
                    <span className="text-xs font-mono opacity-60 truncate mr-2 flex-1">"{item.text ? (item.text.length > 30 ? item.text.substring(0, 30) + '...' : item.text) : 'Phrase Recording'}"</span>
                    <span className={`badge shrink-0 ${
                      item.status === 'approved' ? 'badge-success' : 
                      item.status === 'rejected' ? 'badge-error' : 'badge-warning'
                    }`}>
                      {item.status === 'recorded' || item.status === 'pending' ? 'Pending Review' : item.status}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs opacity-70">
                    <span className="capitalize">{item.language}</span>
                    <span>{item.duration > 0 ? formatTime(item.duration) : '--'}</span>
                  </div>
                  {item.qaComment && (
                    <div className={`mt-2 text-xs p-2.5 rounded-lg font-medium ${
                      item.status === 'approved' ? 'text-success-800 dark:text-success-300 bg-success-50 dark:bg-success-950/40 border border-success-200/60 dark:border-success-800/60' :
                      item.status === 'rejected' ? 'text-error-800 dark:text-error-300 bg-error-50 dark:bg-error-950/40 border border-error-200/60 dark:border-error-800/60' :
                      'text-neutral-800 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700'
                    }`}>
                      <span className="font-bold block mb-0.5 uppercase tracking-wider text-[10px] opacity-80">Feedback Note:</span>
                      <span className="italic font-medium">"{item.qaComment}"</span>
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
      </>
    )}
    </div>
  </div>
);
}
