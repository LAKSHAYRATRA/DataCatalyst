import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Check, 
  X, 
  AlertCircle, 
  Download, 
  Trash2, 
  Clock, 
  CheckCircle2, 
  Volume2,
  Filter,
  Calendar,
  Search,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Layers,
  Tag,
  SlidersHorizontal,
  Sparkles,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import Swal from 'sweetalert2';
import { apiGet, apiPostJson, apiPatchJson } from '../lib/api';
import { getUserInfo } from '../lib/auth';
import SecureAudioPlayer from '../components/SecureAudioPlayer';
import AdminNav from '../components/AdminNav.jsx';
import InteractiveWaveformTrimmer from '../components/InteractiveWaveformTrimmer.jsx';
import SpectrogramViewer from '../components/SpectrogramViewer.jsx';

function formatPhraseDate(dateVal, format = 'DD-MM-YYYY') {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return null;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return format === 'YYYY-MM-DD' ? `${year}-${month}-${day}` : `${day}-${month}-${year}`;
}

function normalizeProjectName(name) {
  if (!name) return '';
  return String(name).replace(/_downloaded$/i, '').trim();
}

function matchesProject(phrase, targetProject) {
  if (!targetProject || targetProject === 'All') return true;
  const target = normalizeProjectName(targetProject).toLowerCase();
  const phraseProj = normalizeProjectName(phrase?.projectName).toLowerCase();
  const phraseComp = normalizeProjectName(phrase?.companyId).toLowerCase();
  return phraseProj === target || phraseComp === target;
}

export default function QaPhrases() {
  const userInfo = getUserInfo();
  const isAdmin = Boolean(userInfo?.isAdmin);
  const [activeTab, setActiveTab] = useState('recorded'); // 'recorded' (Pending) | 'approved' (Approved)
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState({});
  const [processing, setProcessing] = useState(null);
  const [filterProject, setFilterProject] = useState('All');
  const [filterLanguage, setFilterLanguage] = useState('All');
  const [filterSpeaker, setFilterSpeaker] = useState('All');
  const [selectedPhrases, setSelectedPhrases] = useState(new Set());
  const [listenedOnce, setListenedOnce] = useState({});

  // Admin-only Advanced Filters (modeled after Phrase Downloads)
  const [filterDateFormat, setFilterDateFormat] = useState("DD-MM-YYYY"); // 'DD-MM-YYYY' | 'YYYY-MM-DD'
  const [filterDate, setFilterDate] = useState("All");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterMetaKey, setFilterMetaKey] = useState("All");
  const [filterMetaValue, setFilterMetaValue] = useState("All");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterDuration, setFilterDuration] = useState("All");
  const [filterLufs, setFilterLufs] = useState("All");
  const [filterTrimmed, setFilterTrimmed] = useState("All");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);

  // Text Editing States
  const [editingTextId, setEditingTextId] = useState(null);
  const [editTextValue, setEditTextValue] = useState({});
  const [savingText, setSavingText] = useState({});
  const [adminNotes, setAdminNotes] = useState({});
  const [adminEdits, setAdminEdits] = useState({});

  // QC States
  const [expandedQc, setExpandedQc] = useState({});
  const [qcData, setQcData] = useState({});
  const [loadingQc, setLoadingQc] = useState({});
  const [errorQc, setErrorQc] = useState({});
  const [loadingLufs, setLoadingLufs] = useState({});
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [showSpectrogram, setShowSpectrogram] = useState({});

  const toggleSpectrogram = (phraseId) => {
    setShowSpectrogram(prev => ({ ...prev, [phraseId]: !prev[phraseId] }));
  };

  // Audio Trimming States
  const [showTrimModal, setShowTrimModal] = useState(false);
  const [trimmingPhrase, setTrimmingPhrase] = useState(null);
  const [startTrimSec, setStartTrimSec] = useState(0);
  const [endTrimSec, setEndTrimSec] = useState(0);
  const [trimSaving, setTrimSaving] = useState(false);
  const [trimAudioUrl, setTrimAudioUrl] = useState(null);
  const trimAudioRef = useRef(null);

  const getSpeakerId = (p) => {
    return p.speaker_id || p.assigned_speaker_id || p.contributorId?.speaker_id || (p.contributorId?.username ? `user_${p.contributorId.username}` : null);
  };

  const toggleSelectPhrase = (id) => {
    setSelectedPhrases(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkReview = async (action) => {
    if (selectedPhrases.size === 0) return;
    const count = selectedPhrases.size;

    const result = await Swal.fire({
      title: `${action === 'approve' ? 'Approve' : 'Reject'} ${count} Selected Phrases?`,
      text: action === 'approve'
        ? `Are you sure you want to approve all ${count} selected phrases?`
        : `Are you sure you want to reject all ${count} selected phrases? Audio files will be removed from S3.`,
      icon: action === 'approve' ? 'question' : 'warning',
      showCancelButton: true,
      confirmButtonText: `Yes, ${action === 'approve' ? 'Approve' : 'Reject'} All (${count})`,
      cancelButtonText: 'Cancel',
      confirmButtonColor: action === 'approve' ? '#10b981' : '#ef4444',
      background: '#171717',
      color: '#ffffff'
    });

    if (!result.isConfirmed) return;

    setProcessing('bulk');
    try {
      const ids = Array.from(selectedPhrases);
      const res = await apiPostJson('/api/phrases/admin/bulk-review', {
        phraseIds: ids,
        action,
        comment: `Bulk Admin ${action === 'approve' ? 'Approval' : 'Rejection'}`
      });

      Swal.fire({
        icon: 'success',
        title: `Phrases ${action === 'approve' ? 'Approved' : 'Rejected'}!`,
        text: res.message || `Successfully processed ${count} phrases.`,
        timer: 1800,
        showConfirmButton: false,
        background: '#171717',
        color: '#ffffff'
      });

      setSelectedPhrases(new Set());
      fetchQueue(activeTab);
    } catch (err) {
      console.error("Bulk review error:", err);
      Swal.fire({
        icon: 'error',
        title: 'Bulk Action Failed',
        text: err.message || 'Failed to bulk review phrases',
        background: '#171717',
        color: '#ffffff'
      });
    } finally {
      setProcessing(null);
    }
  };

  const openTrimModal = (p) => {
    setTrimmingPhrase(p);
    const fullDur = p.originalDuration || p.duration || 5;
    setStartTrimSec(0);
    setEndTrimSec(p.duration || fullDur);
    setTrimAudioUrl(`${import.meta.env.VITE_BACKEND_URL || "http://localhost:3001"}/api/phrases/${p._id}/audio?t=${Date.now()}`);
    setShowTrimModal(true);
  };

  const handlePreviewTrim = () => {
    if (!trimAudioRef.current) return;
    const audio = trimAudioRef.current;
    audio.currentTime = startTrimSec;
    audio.play();

    const checkStop = () => {
      if (audio.currentTime >= endTrimSec) {
        audio.pause();
        audio.removeEventListener("timeupdate", checkStop);
      }
    };
    audio.addEventListener("timeupdate", checkStop);
  };

  const handleSaveTrim = async (verdict = null) => {
    if (!trimmingPhrase) return;
    if (endTrimSec <= startTrimSec) {
      Swal.fire({ icon: "warning", title: "Invalid Trim Range", text: "End time must be greater than start time.", background: "#171717", color: "#ffffff" });
      return;
    }

    setTrimSaving(true);
    try {
      const res = await apiPostJson(`/api/phrases/qa/trim/${trimmingPhrase._id}`, {
        startTrimSec: Number(startTrimSec),
        endTrimSec: Number(endTrimSec),
        verdict
      });
      if (res && res.phrase) {
        const newStatus = res.phrase.status;

        // If QA trimmed it or Admin approved/rejected, filter out of current view queue
        if (!isAdmin || verdict === 'approved' || verdict === 'rejected') {
          setQueue(prev => prev.filter(q => q._id !== trimmingPhrase._id));
        } else {
          setQueue(prev => prev.map(q => q._id === trimmingPhrase._id ? {
            ...q,
            duration: res.duration,
            lufs: res.lufs,
            audioFile: res.phrase.audioFile,
            status: newStatus
          } : q));
        }

        setShowTrimModal(false);
        setTrimmingPhrase(null);

        let msg = `Phrase audio trimmed to ${res.duration}s! (LUFS: ${res.lufs})`;
        if (!isAdmin) {
          msg = `Phrase trimmed & moved to Edited Phrases for Admin audit! (${res.duration}s, LUFS: ${res.lufs})`;
        } else if (verdict === 'approved') {
          msg = `Phrase trimmed & APPROVED! (${res.duration}s, LUFS: ${res.lufs})`;
        } else if (verdict === 'rejected') {
          msg = `Phrase trimmed & REJECTED! (${res.duration}s)`;
        }

        Swal.fire({
          icon: "success",
          title: "Audio Trimmed!",
          text: msg,
          timer: 2200,
          showConfirmButton: false,
          background: "#171717",
          color: "#ffffff"
        });
      }
    } catch (err) {
      console.error("Failed to trim phrase audio:", err);
      Swal.fire({
        icon: "error",
        title: "Trim Failed",
        text: err.message || "Failed to trim phrase audio.",
        background: "#171717",
        color: "#ffffff"
      });
    } finally {
      setTrimSaving(false);
    }
  };

  const handleRevertTrim = async (phraseId) => {
    try {
      const res = await apiPostJson(`/api/phrases/qa/revert-trim/${phraseId}`, {});
      if (res && res.phrase) {
        setQueue(prev => prev.map(q => q._id === phraseId ? {
          ...q,
          duration: res.duration,
          lufs: res.lufs,
          wasAudioTrimmed: false,
          originalAudioFile: null
        } : q));
        Swal.fire({
          icon: "success",
          title: "Trim Reverted!",
          text: `Phrase audio restored to original recording! (${res.duration}s)`,
          timer: 2000,
          showConfirmButton: false,
          background: "#171717",
          color: "#ffffff"
        });
      }
    } catch (err) {
      console.error("Failed to revert audio trim:", err);
      Swal.fire({ icon: "error", title: "Revert Failed", text: err.message, background: "#171717", color: "#ffffff" });
    }
  };

  const handleCheckLufs = async (phraseId) => {
    setLoadingLufs(prev => ({ ...prev, [phraseId]: true }));
    try {
      const res = await apiPostJson(`/api/phrases/qa/lufs/${phraseId}?force=true`, {});
      if (res && res.lufs !== undefined) {
        setQueue(prev => prev.map(q => q._id === phraseId ? { ...q, lufs: res.lufs } : q));
        if (res.lufs === null) {
          Swal.fire({
            icon: "warning",
            title: "No Speech Found",
            text: "No clear speech samples detected in this recording.",
            background: "#171717",
            color: "#ffffff"
          });
        }
      }
    } catch (err) {
      console.error("Failed to check LUFS:", err);
      Swal.fire({
        icon: "error",
        title: "LUFS Error",
        text: err.message || "Failed to calculate LUFS for this phrase.",
        background: "#171717",
        color: "#ffffff"
      });
    } finally {
      setLoadingLufs(prev => ({ ...prev, [phraseId]: false }));
    }
  };

  const handleSaveText = async (phraseId) => {
    const textVal = editTextValue[phraseId];
    if (!textVal || !textVal.trim()) {
      Swal.fire({ icon: "warning", title: "Empty Text", text: "Phrase script text cannot be empty.", background: "#171717", color: "#ffffff" });
      return;
    }

    setSavingText(prev => ({ ...prev, [phraseId]: true }));
    try {
      const res = await apiPatchJson(`/api/phrases/qa/text/${phraseId}`, { text: textVal.trim() });
      if (res && res.phrase) {
        setQueue(prev => prev.map(p => p._id === phraseId ? { ...p, text: res.phrase.text } : p));
        setEditingTextId(null);
        Swal.fire({
          icon: "success",
          title: "Script Updated",
          text: "Phrase script text updated successfully!",
          timer: 1500,
          showConfirmButton: false,
          background: "#171717",
          color: "#ffffff"
        });
      }
    } catch (err) {
      console.error("Failed to update phrase text:", err);
      Swal.fire({
        icon: "error",
        title: "Update Failed",
        text: err.message || "Failed to update phrase script.",
        background: "#171717",
        color: "#ffffff"
      });
    } finally {
      setSavingText(prev => ({ ...prev, [phraseId]: false }));
    }
  };

  useEffect(() => {
    fetchQueue(activeTab);
  }, [activeTab]);

  async function fetchQueue(tabStatus = activeTab) {
    try {
      setLoading(true);
      const data = await apiGet(`/api/phrases/qa/queue?status=${tabStatus}`);
      const phrases = data.phrases || [];
      setQueue(phrases);
      
      // Auto-reset filters if selected options are no longer in the queue
      if (filterProject !== 'All') {
        const activeProjects = new Set(phrases.map(q => normalizeProjectName(q.projectName || q.companyId)).filter(Boolean));
        if (!activeProjects.has(normalizeProjectName(filterProject))) {
          setFilterProject('All');
          setFilterLanguage('All');
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleReview = async (phraseId, action) => {
    setProcessing(phraseId);
    try {
      await apiPostJson(`/api/phrases/qa/review/${phraseId}`, { action, comment: comments[phraseId] || '' });
      setComments(prev => { const next = { ...prev }; delete next[phraseId]; return next; });

      if (activeTab === 'recorded' && !isAdmin) {
        // Dynamic replenishment: Backend locks 1 new phrase to maintain a constant queue of 5
        try {
          const data = await apiGet(`/api/phrases/qa/queue?status=recorded`);
          setQueue(data.phrases || []);
        } catch (rErr) {
          console.error("Failed to replenish QA queue:", rErr);
          setQueue(prev => prev.filter(q => q._id !== phraseId));
        }
      } else {
        setQueue(prev => prev.filter(q => q._id !== phraseId));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to submit review');
    } finally {
      setProcessing(null);
    }
  };

  const handleReviewEditedPhrase = async (phraseId, action) => {
    setProcessing(phraseId);
    try {
      await apiPostJson(`/api/phrases/admin/review-edit/${phraseId}`, {
        action,
        adminText: adminEdits[phraseId] !== undefined ? adminEdits[phraseId] : undefined,
        adminNote: adminNotes[phraseId] || ''
      });
      Swal.fire({
        icon: "success",
        title: action === "approved" ? "Edit Approved" : "Phrase Reverted & Rejected",
        text: action === "approved"
          ? "Edited phrase text verified and approved!"
          : "Phrase text reverted and marked as rejected. QA has been flagged if conflict exists.",
        timer: 1500,
        showConfirmButton: false,
        background: "#171717",
        color: "#ffffff"
      });
      fetchQueue("edited");
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "Action Failed",
        text: err.message || "Failed to submit review",
        background: "#171717",
        color: "#ffffff"
      });
    } finally {
      setProcessing(null);
    }
  };

  const handleApproveAllEditedPhrases = async () => {
    const displayedPhrases = queue.filter(q => {
      const matchProject = matchesProject(q, filterProject);
      const matchLanguage = filterLanguage === 'All' || (q.language && q.language.toLowerCase() === filterLanguage.toLowerCase());
      return matchProject && matchLanguage;
    });

    const count = displayedPhrases.length;
    if (count === 0) {
      Swal.fire({
        icon: "info",
        title: "No Pending Edits",
        text: "There are no pending edited phrases matching your filter criteria.",
        background: "#171717",
        color: "#ffffff"
      });
      return;
    }

    const filterInfo = [];
    if (filterProject !== 'All') filterInfo.push(`Project: <b>${filterProject}</b>`);
    if (filterLanguage !== 'All') filterInfo.push(`Language: <b>${filterLanguage}</b>`);
    const filterText = filterInfo.length > 0 ? `<p class="text-xs text-amber-400 mt-1">Filters active: ${filterInfo.join(' | ')}</p>` : '';

    const result = await Swal.fire({
      title: 'Approve All Pending Edits?',
      html: `
        <div class="text-left text-sm space-y-2">
          <p>Are you sure you want to approve all <b>${count}</b> pending edited phrases waiting for admin review?</p>
          ${filterText}
          <p class="text-xs text-neutral-400">All updated script texts will be marked as approved and cleared from the queue.</p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Approve All Above',
      confirmButtonColor: '#10b981',
      cancelButtonText: 'Cancel',
      cancelButtonColor: '#4b5563',
      background: '#171717',
      color: '#ffffff'
    });

    if (!result.isConfirmed) return;

    setProcessing('all');
    try {
      const res = await apiPostJson('/api/phrases/admin/review-edit-all', {
        filterProject,
        filterLanguage
      });

      Swal.fire({
        icon: "success",
        title: "All Edits Approved!",
        text: res.message || `Successfully approved ${res.count} pending edited phrases.`,
        timer: 2000,
        showConfirmButton: false,
        background: "#171717",
        color: "#ffffff"
      });
      fetchQueue("edited");
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "Action Failed",
        text: err.message || "Failed to approve all edited phrases",
        background: "#171717",
        color: "#ffffff"
      });
    } finally {
      setProcessing(null);
    }
  };

  const handleDeletePhrase = async (phrase) => {
    const result = await Swal.fire({
      title: 'Delete Phrase Options',
      html: `
        <div class="text-left text-sm space-y-3">
          <p class="font-medium text-neutral-300">Select how you would like to delete this phrase recording:</p>
          <div class="p-3 bg-red-950/50 border border-red-800/80 rounded-lg">
            <strong class="text-red-400 block mb-1">🗑️ Delete Whole</strong>
            <span class="text-xs text-neutral-300">Permanently removes the phrase from workloads. It will NOT go back to phrase workloads for anyone else to record.</span>
          </div>
          <div class="p-3 bg-amber-950/50 border border-amber-800/80 rounded-lg">
            <strong class="text-amber-400 block mb-1">🎙️ Delete Recording</strong>
            <span class="text-xs text-neutral-300">Deletes the recorded audio and speaker metadata, resetting status to pending so it GOES BACK to phrase workloads for re-recording.</span>
          </div>
        </div>
      `,
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: 'Delete Whole',
      confirmButtonColor: '#dc2626',
      denyButtonText: 'Delete Recording',
      denyButtonColor: '#d97706',
      cancelButtonText: 'Cancel',
      cancelButtonColor: '#4b5563',
      customClass: {
        popup: 'dark:bg-neutral-800 dark:text-white',
      }
    });

    if (result.isConfirmed) {
      // Delete Whole
      try {
        setProcessing(phrase._id);
        await apiPostJson(`/api/phrases/admin/delete/${phrase._id}`, { mode: 'delete-whole' });
        setQueue(queue.filter(q => q._id !== phrase._id));
        Swal.fire({ icon: 'success', title: 'Deleted Permanently', text: 'Phrase removed from workloads entirely.', timer: 2000, showConfirmButton: false });
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Deletion Failed', text: err.message });
      } finally {
        setProcessing(null);
      }
    } else if (result.isDenied) {
      // Delete Recording
      try {
        setProcessing(phrase._id);
        await apiPostJson(`/api/phrases/admin/delete/${phrase._id}`, { mode: 'delete-recording' });
        setQueue(queue.filter(q => q._id !== phrase._id));
        Swal.fire({ icon: 'success', title: 'Recording Deleted', text: 'Phrase returned to workloads for re-recording.', timer: 2000, showConfirmButton: false });
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Deletion Failed', text: err.message });
      } finally {
        setProcessing(null);
      }
    }
  };

  const toggleQc = async (phraseId) => {
    setExpandedQc(prev => {
      const next = { ...prev, [phraseId]: !prev[phraseId] };
      if (next[phraseId] && !qcData[phraseId]) {
        const item = queue.find(q => q._id === phraseId);
        if (item && item.qcResult) {
          setQcData(p => ({ ...p, [phraseId]: item.qcResult }));
        } else {
          runQC(phraseId);
        }
      }
      return next;
    });
  };

  const runQC = async (phraseId, force = false) => {
    setLoadingQc(prev => ({ ...prev, [phraseId]: true }));
    setErrorQc(prev => ({ ...prev, [phraseId]: null }));
    try {
      const url = `/api/phrases/qa/analyze/${phraseId}${force ? '?force=true' : ''}`;
      const res = await apiPostJson(url, {});
      setQcData(prev => ({ ...prev, [phraseId]: res }));
    } catch (err) {
      console.error(err);
      setErrorQc(prev => ({ ...prev, [phraseId]: err.message || 'Analysis failed' }));
    } finally {
      setLoadingQc(prev => ({ ...prev, [phraseId]: false }));
    }
  };

  const availableProjects = React.useMemo(() => {
    const set = new Set();
    for (const q of queue) {
      const p = normalizeProjectName(q.projectName || q.companyId);
      if (p) set.add(p);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [queue]);

  const availableLanguages = React.useMemo(() => {
    let phrasesToScan = queue;
    if (filterProject !== 'All') {
      phrasesToScan = queue.filter(q => matchesProject(q, filterProject));
    }
    return [...new Set(phrasesToScan.map(q => q.language).filter(Boolean))].sort();
  }, [queue, filterProject]);

  const availableSpeakers = React.useMemo(() => {
    let phrasesToScan = queue;
    if (filterProject !== 'All') {
      phrasesToScan = phrasesToScan.filter(q => matchesProject(q, filterProject));
    }
    if (filterLanguage !== 'All') {
      phrasesToScan = phrasesToScan.filter(q => q.language && q.language.toLowerCase() === filterLanguage.toLowerCase());
    }
    const counts = {};
    for (const p of phrasesToScan) {
      const spk = getSpeakerId(p) || 'Unassigned';
      counts[spk] = (counts[spk] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [queue, filterProject, filterLanguage]);

  // Dynamic Metadata Filter Options (Modeled directly after Phrase Downloads)
  const metadataFilterOptions = React.useMemo(() => {
    if (!isAdmin) return [];

    let phrasesToScan = queue;
    if (filterProject !== 'All') {
      phrasesToScan = phrasesToScan.filter(q => matchesProject(q, filterProject));
    }
    if (filterLanguage !== 'All') {
      phrasesToScan = phrasesToScan.filter(q => q.language && q.language.toLowerCase() === filterLanguage.toLowerCase());
    }

    const dateLabel = filterDateFormat === 'YYYY-MM-DD' ? 'Recording Date (YYYY-MM-DD)' : 'Recording Date (DD-MM-YYYY)';

    const keysMap = {
      recording_date: { label: dateLabel, values: new Map() },
      speaker_id: { label: 'Speaker ID', values: new Map() },
      first_name: { label: 'First Name', values: new Map() },
      last_name: { label: 'Last Name', values: new Map() },
      language: { label: 'Language', values: new Map() },
      gender: { label: 'Gender', values: new Map() },
      emotion: { label: 'Emotion', values: new Map() },
      style: { label: 'Style', values: new Map() },
      intent: { label: 'Intent', values: new Map() },
      pitch: { label: 'Pitch', values: new Map() },
      speed: { label: 'Speed', values: new Map() },
      volume: { label: 'Volume', values: new Map() },
      script_type: { label: 'Script Type', values: new Map() },
      wasAudioTrimmed: { label: 'Audio Trim Status', values: new Map() },
    };

    const addVal = (k, v) => {
      if (v === undefined || v === null || String(v).trim() === '') return;
      const strVal = String(v).trim();
      if (!keysMap[k]) {
        const formattedLabel = k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ');
        keysMap[k] = { label: formattedLabel, values: new Map() };
      }
      keysMap[k].values.set(strVal, (keysMap[k].values.get(strVal) || 0) + 1);
    };

    for (const p of phrasesToScan) {
      const contributor = p.contributorId || {};
      const spkId = contributor.speaker_id || p.speaker_id || p.assigned_speaker_id || '';
      const fName = contributor.firstname ? String(contributor.firstname).trim() : (contributor.username || '');
      const lName = contributor.lastname ? String(contributor.lastname).trim() : '';
      const lang = String(p.language || '').trim();
      const gdr = contributor.gender ? String(contributor.gender).trim().toLowerCase() : (p.gender ? String(p.gender).trim().toLowerCase() : '');

      const dateVal = p.recordedAt || p.createdAt;
      if (dateVal) {
        const d = new Date(dateVal);
        if (!isNaN(d.getTime())) {
          // Format with UTC date (matching Phrase Downloads server evaluation)
          const uDay = String(d.getUTCDate()).padStart(2, '0');
          const uMonth = String(d.getUTCMonth() + 1).padStart(2, '0');
          const uYear = d.getUTCFullYear();
          const utcFormatted = filterDateFormat === 'YYYY-MM-DD' ? `${uYear}-${uMonth}-${uDay}` : `${uDay}-${uMonth}-${uYear}`;
          addVal('recording_date', utcFormatted);
        }
      }

      if (fName) addVal('first_name', fName);
      if (lName) addVal('last_name', lName);
      if (spkId) addVal('speaker_id', spkId);
      if (lang) addVal('language', lang);
      if (gdr) addVal('gender', gdr);
      if (p.script_type) addVal('script_type', p.script_type);
      if (p.emotion) addVal('emotion', p.emotion);
      if (p.style) addVal('style', p.style);
      if (p.intent) addVal('intent', p.intent);
      if (p.pitch) addVal('pitch', p.pitch);
      if (p.speed) addVal('speed', p.speed);
      if (p.volume) addVal('volume', p.volume);
      if (p.wasAudioTrimmed !== undefined) addVal('wasAudioTrimmed', p.wasAudioTrimmed ? 'Trimmed' : 'Original');

      if (p.tags && typeof p.tags === 'object') {
        for (const [tk, tv] of Object.entries(p.tags)) {
          if (tv !== undefined && tv !== null && typeof tv !== 'object') {
            addVal(tk, String(tv));
          }
        }
      }
    }

    const result = [];
    for (const [k, meta] of Object.entries(keysMap)) {
      if (meta.values.size > 0) {
        const valuesArr = Array.from(meta.values.entries())
          .map(([val, cnt]) => ({ value: val, count: cnt }))
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
        result.push({
          key: k,
          label: meta.label,
          values: valuesArr
        });
      }
    }
    return result;
  }, [queue, filterProject, filterLanguage, filterDateFormat, isAdmin]);

  const availableDates = React.useMemo(() => {
    const found = metadataFilterOptions.find(opt => opt.key === 'recording_date');
    return found ? found.values : [];
  }, [metadataFilterOptions]);

  const availableMetaValues = React.useMemo(() => {
    if (!filterMetaKey || filterMetaKey === 'All') return [];
    const found = metadataFilterOptions.find(opt => opt.key === filterMetaKey);
    return found ? found.values : [];
  }, [metadataFilterOptions, filterMetaKey]);

  const handleDateChange = (newDate) => {
    setFilterDate(newDate);
    setFilterMetaKey('recording_date');
    setFilterMetaValue(newDate);
    setSelectedPhrases(new Set());
    setCurrentPage(1);
  };

  const handleMetaKeyChange = (newKey) => {
    setFilterMetaKey(newKey);
    const opt = metadataFilterOptions.find(o => o.key === newKey);
    if (newKey === 'recording_date') {
      const val = opt && opt.values && opt.values.length > 0 ? opt.values[0].value : 'All';
      setFilterMetaValue(val);
      setFilterDate(val);
    } else {
      setFilterMetaValue('All');
    }
    setSelectedPhrases(new Set());
    setCurrentPage(1);
  };

  const handleMetaValueChange = (newVal) => {
    setFilterMetaValue(newVal);
    if (filterMetaKey === 'recording_date') {
      setFilterDate(newVal);
    }
    setSelectedPhrases(new Set());
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setFilterProject('All');
    setFilterLanguage('All');
    setFilterSpeaker('All');
    setFilterDate('All');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterMetaKey('All');
    setFilterMetaValue('All');
    setFilterSearch('');
    setFilterDuration('All');
    setFilterLufs('All');
    setFilterTrimmed('All');
    setSelectedPhrases(new Set());
    setCurrentPage(1);
  };

  const activeFiltersCount = React.useMemo(() => {
    if (!isAdmin) return 0;
    let cnt = 0;
    if (filterProject !== 'All') cnt++;
    if (filterLanguage !== 'All') cnt++;
    if (filterSpeaker !== 'All') cnt++;
    if (filterDate !== 'All' || (filterMetaKey === 'recording_date' && filterMetaValue !== 'All')) cnt++;
    if (filterDateFrom || filterDateTo) cnt++;
    if (filterMetaKey !== 'All' && filterMetaKey !== 'recording_date' && filterMetaValue !== 'All') cnt++;
    if (filterSearch.trim()) cnt++;
    if (filterDuration !== 'All') cnt++;
    if (filterLufs !== 'All') cnt++;
    if (filterTrimmed !== 'All') cnt++;
    return cnt;
  }, [
    isAdmin, filterProject, filterLanguage, filterSpeaker,
    filterDate, filterDateFrom, filterDateTo, filterMetaKey,
    filterMetaValue, filterSearch, filterDuration, filterLufs, filterTrimmed
  ]);

  const activeFiltersList = React.useMemo(() => {
    if (!isAdmin) return [];
    const list = [];
    if (filterProject !== 'All') {
      list.push({ id: 'project', label: `Project: ${filterProject}`, remove: () => setFilterProject('All') });
    }
    if (filterLanguage !== 'All') {
      list.push({ id: 'language', label: `Lang: ${filterLanguage}`, remove: () => setFilterLanguage('All') });
    }
    if (filterSpeaker !== 'All') {
      list.push({ id: 'speaker', label: `Speaker: ${filterSpeaker}`, remove: () => setFilterSpeaker('All') });
    }
    const effectiveDate = (filterMetaKey === 'recording_date' && filterMetaValue !== 'All') ? filterMetaValue : (filterDate !== 'All' ? filterDate : null);
    if (effectiveDate) {
      list.push({ id: 'date', label: `Date: ${effectiveDate}`, remove: () => { setFilterDate('All'); setFilterMetaValue('All'); } });
    }
    if (filterDateFrom || filterDateTo) {
      list.push({
        id: 'dateRange',
        label: `Range: ${filterDateFrom || 'Start'} → ${filterDateTo || 'End'}`,
        remove: () => { setFilterDateFrom(''); setFilterDateTo(''); }
      });
    }
    if (filterMetaKey !== 'All' && filterMetaKey !== 'recording_date' && filterMetaValue !== 'All') {
      const opt = metadataFilterOptions.find(o => o.key === filterMetaKey);
      const keyLabel = opt ? opt.label : filterMetaKey;
      list.push({
        id: 'meta',
        label: `${keyLabel}: ${filterMetaValue}`,
        remove: () => { setFilterMetaKey('All'); setFilterMetaValue('All'); }
      });
    }
    if (filterSearch.trim()) {
      list.push({ id: 'search', label: `Search: "${filterSearch.trim()}"`, remove: () => setFilterSearch('') });
    }
    if (filterDuration !== 'All') {
      const durLabel = filterDuration === '<3' ? '< 3s' : filterDuration === '3-5' ? '3-5s' : filterDuration === '5-10' ? '5-10s' : '> 10s';
      list.push({ id: 'duration', label: `Duration: ${durLabel}`, remove: () => setFilterDuration('All') });
    }
    if (filterLufs !== 'All') {
      const lufsLabel = filterLufs === 'target' ? 'Target LUFS' : filterLufs === 'loud' ? 'Too Loud' : filterLufs === 'quiet' ? 'Too Quiet' : 'Untested';
      list.push({ id: 'lufs', label: `LUFS: ${lufsLabel}`, remove: () => setFilterLufs('All') });
    }
    if (filterTrimmed !== 'All') {
      list.push({ id: 'trimmed', label: `Audio: ${filterTrimmed === 'trimmed' ? 'Trimmed Only' : 'Original Only'}`, remove: () => setFilterTrimmed('All') });
    }
    return list;
  }, [
    isAdmin, filterProject, filterLanguage, filterSpeaker,
    filterDate, filterDateFrom, filterDateTo, filterMetaKey,
    filterMetaValue, filterSearch, filterDuration, filterLufs, filterTrimmed, metadataFilterOptions
  ]);

  const displayedPhrases = React.useMemo(() => {
    return queue.filter(q => {
      // 1. Project
      if (!matchesProject(q, filterProject)) return false;

      // 2. Language
      const matchLanguage = filterLanguage === 'All' || (q.language && q.language.toLowerCase() === filterLanguage.toLowerCase());
      if (!matchLanguage) return false;

      // If not admin, standard filters only
      if (!isAdmin) return true;

      // 3. Speaker ID
      const spk = getSpeakerId(q) || 'Unassigned';
      const matchSpeaker = filterSpeaker === 'All' || spk === filterSpeaker;
      if (!matchSpeaker) return false;

      // 4. Date Filter (Exact Phrase Downloads Parity: Matches UTC and Local, DD-MM-YYYY and YYYY-MM-DD)
      const activeDateFilter = (filterMetaKey === 'recording_date' && filterMetaValue && filterMetaValue !== 'All')
        ? filterMetaValue
        : (filterDate && filterDate !== 'All' ? filterDate : null);

      if (activeDateFilter) {
        const pDate = q.recordedAt || q.createdAt;
        if (!pDate) return false;
        const d = new Date(pDate);
        if (isNaN(d.getTime())) return false;

        const uDay = String(d.getUTCDate()).padStart(2, '0');
        const uMonth = String(d.getUTCMonth() + 1).padStart(2, '0');
        const uYear = d.getUTCFullYear();
        const uDdmmyyyy = `${uDay}-${uMonth}-${uYear}`.toLowerCase();
        const uYyyymmdd = `${uYear}-${uMonth}-${uDay}`.toLowerCase();

        const lDay = String(d.getDate()).padStart(2, '0');
        const lMonth = String(d.getMonth() + 1).padStart(2, '0');
        const lYear = d.getFullYear();
        const lDdmmyyyy = `${lDay}-${lMonth}-${lYear}`.toLowerCase();
        const lYyyymmdd = `${lYear}-${lMonth}-${lDay}`.toLowerCase();

        const target = String(activeDateFilter).trim().toLowerCase();
        if (uDdmmyyyy !== target && uYyyymmdd !== target && lDdmmyyyy !== target && lYyyymmdd !== target) {
          return false;
        }
      }

      // 5. Date Range (From / To)
      if (filterDateFrom || filterDateTo) {
        const pDate = q.recordedAt || q.createdAt;
        if (!pDate) return false;
        const pDateTime = new Date(pDate).getTime();
        if (filterDateFrom) {
          const fromTime = new Date(filterDateFrom).setHours(0, 0, 0, 0);
          if (pDateTime < fromTime) return false;
        }
        if (filterDateTo) {
          const toTime = new Date(filterDateTo).setHours(23, 59, 59, 999);
          if (pDateTime > toTime) return false;
        }
      }

      // 6. Dynamic Metadata Key & Value Filter (Exact Phrase Downloads Parity)
      if (filterMetaKey && filterMetaKey !== 'All' && filterMetaKey !== 'recording_date' && filterMetaValue && filterMetaValue !== 'All') {
        const contributor = q.contributorId || {};
        const cleanTargetVal = String(filterMetaValue).trim().toLowerCase();

        if (filterMetaKey === 'first_name') {
          const fName = contributor.firstname ? String(contributor.firstname).trim() : (contributor.username || '');
          if (fName.toLowerCase() !== cleanTargetVal) return false;
        } else if (filterMetaKey === 'last_name') {
          const lName = contributor.lastname ? String(contributor.lastname).trim() : '';
          if (lName.toLowerCase() !== cleanTargetVal) return false;
        } else if (filterMetaKey === 'speaker_id') {
          const spkVal = contributor.speaker_id || q.speaker_id || q.assigned_speaker_id || '';
          if (spkVal.toLowerCase() !== cleanTargetVal) return false;
        } else if (filterMetaKey === 'language') {
          if (String(q.language || '').trim().toLowerCase() !== cleanTargetVal) return false;
        } else if (filterMetaKey === 'gender') {
          const gdr = contributor.gender || q.gender || '';
          if (String(gdr).trim().toLowerCase() !== cleanTargetVal) return false;
        } else if (filterMetaKey === 'wasAudioTrimmed') {
          const trm = q.wasAudioTrimmed ? 'trimmed' : 'original';
          if (trm !== cleanTargetVal) return false;
        } else if (q.tags && q.tags[filterMetaKey] !== undefined) {
          if (String(q.tags[filterMetaKey]).trim().toLowerCase() !== cleanTargetVal) return false;
        } else if (q[filterMetaKey] !== undefined && q[filterMetaKey] !== null) {
          if (String(q[filterMetaKey]).trim().toLowerCase() !== cleanTargetVal) return false;
        } else {
          return false;
        }
      }

      // 7. Text Search
      if (filterSearch && filterSearch.trim()) {
        const query = filterSearch.trim().toLowerCase();
        const text = (q.text || '').toLowerCase();
        const pId = (q.phraseId || '').toLowerCase();
        const spkStr = (spk || '').toLowerCase();
        const username = (q.contributorId?.username || '').toLowerCase();
        const fname = (q.contributorId?.firstname || '').toLowerCase();
        const lname = (q.contributorId?.lastname || '').toLowerCase();
        const matches = text.includes(query) || pId.includes(query) || spkStr.includes(query) || username.includes(query) || fname.includes(query) || lname.includes(query);
        if (!matches) return false;
      }

      // 8. Audio Duration
      if (filterDuration !== 'All') {
        const dur = Number(q.duration || 0);
        if (filterDuration === '<3' && dur >= 3) return false;
        if (filterDuration === '3-5' && (dur < 3 || dur > 5)) return false;
        if (filterDuration === '5-10' && (dur < 5 || dur > 10)) return false;
        if (filterDuration === '>10' && dur <= 10) return false;
      }

      // 9. LUFS Category
      if (filterLufs !== 'All') {
        const lufsVal = qcData[q._id]?.freq?.lufs !== undefined ? qcData[q._id]?.freq?.lufs : q.lufs;
        if (filterLufs === 'untested' && (lufsVal !== undefined && lufsVal !== null)) return false;
        if (filterLufs !== 'untested' && (lufsVal === undefined || lufsVal === null)) return false;
        if (filterLufs === 'target' && (lufsVal < -24.0 || lufsVal > -18.0)) return false;
        if (filterLufs === 'loud' && lufsVal <= -18.0) return false;
        if (filterLufs === 'quiet' && lufsVal >= -24.0) return false;
      }

      // 10. Audio Trimmed Status
      if (filterTrimmed !== 'All') {
        const isTrimmed = Boolean(q.wasAudioTrimmed);
        if (filterTrimmed === 'trimmed' && !isTrimmed) return false;
        if (filterTrimmed === 'untrimmed' && isTrimmed) return false;
      }

      return true;
    });
  }, [
    queue, filterProject, filterLanguage, filterSpeaker, isAdmin,
    filterDate, filterDateFormat, filterDateFrom, filterDateTo,
    filterMetaKey, filterMetaValue, filterSearch, filterDuration, filterLufs, filterTrimmed, qcData
  ]);

  const paginatedPhrases = React.useMemo(() => {
    if (pageSize <= 0) return displayedPhrases;
    const start = (currentPage - 1) * pageSize;
    return displayedPhrases.slice(start, start + pageSize);
  }, [displayedPhrases, currentPage, pageSize]);

  const totalPages = pageSize <= 0 ? 1 : Math.ceil(displayedPhrases.length / pageSize) || 1;

  const selectAllDisplayed = () => {
    const allIds = displayedPhrases.map(p => p._id);
    const isAllSelected = allIds.length > 0 && allIds.every(id => selectedPhrases.has(id));
    if (isAllSelected) {
      setSelectedPhrases(new Set());
    } else {
      setSelectedPhrases(new Set(allIds));
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex transition-colors duration-300">
      <AdminNav />
      <main className="flex-1 md:ml-64 p-8 max-w-5xl mx-auto text-neutral-900 dark:text-neutral-50">
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div>
            <h1 className="text-3xl font-bold mb-1">QA Queue: Phrases</h1>
            <p className="text-neutral-500 dark:text-neutral-400">Review contributor recordings and pass or reject them.</p>
          </div>

          {/* Top Status Tabs */}
          <div className="flex items-center gap-2 bg-neutral-200 dark:bg-neutral-800 p-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 w-max">
            <button
              onClick={() => { setActiveTab('recorded'); setSelectedPhrases(new Set()); }}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'recorded'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" /> Pending Review
            </button>
            <button
              onClick={() => { setActiveTab('approved'); setSelectedPhrases(new Set()); }}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
                activeTab === 'approved'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Approved Phrases
            </button>
            {isAdmin && (
              <button
                onClick={() => { setActiveTab('all'); setSelectedPhrases(new Set()); }}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
                  activeTab === 'all'
                    ? 'bg-primary-600 text-white shadow-md'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> All Statuses
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => { setActiveTab('edited'); setSelectedPhrases(new Set()); }}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
                  activeTab === 'edited'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                ✏️ Edited Phrases
              </button>
            )}
          </div>
        </motion.div>

        {loading ? (
          <div className="flex justify-center p-12">
            <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {queue.length > 0 && (
              <div className="space-y-4 mb-6">
                {/* Top Filter Controls Bar */}
                <div className="flex flex-wrap items-center gap-3 justify-start">
                  {/* Project Dropdown */}
                  <select 
                    className="input w-full md:w-56 text-sm"
                    value={filterProject}
                    onChange={(e) => {
                      setFilterProject(e.target.value);
                      setFilterLanguage('All');
                      setFilterSpeaker('All');
                      setSelectedPhrases(new Set());
                    }}
                  >
                    <option value="All">All Projects</option>
                    {availableProjects.map(project => (
                      <option key={project} value={project}>{project}</option>
                    ))}
                  </select>

                  {/* Languages Dropdown */}
                  <select 
                    className="input w-full md:w-48 capitalize text-sm"
                    value={filterLanguage}
                    onChange={(e) => {
                      setFilterLanguage(e.target.value);
                      setFilterSpeaker('All');
                      setSelectedPhrases(new Set());
                    }}
                  >
                    <option value="All">{!isAdmin ? "All Approved Languages" : "All Languages"}</option>
                    {availableLanguages.map(lang => (
                      <option key={lang} value={lang} className="capitalize">
                        {lang.charAt(0).toUpperCase() + lang.slice(1)}
                      </option>
                    ))}
                  </select>

                  {/* Speaker Dropdown (Admins Only) */}
                  {isAdmin && (
                    <select 
                      className="input w-full md:w-52 font-mono text-sm border-amber-500/40"
                      value={filterSpeaker}
                      onChange={(e) => {
                        setFilterSpeaker(e.target.value);
                        setSelectedPhrases(new Set());
                      }}
                    >
                      <option value="All">All Speakers ({availableSpeakers.length})</option>
                      {availableSpeakers.map(spk => (
                        <option key={spk.id} value={spk.id}>
                          {spk.id} ({spk.count} phrases)
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Quick Date Selector with Parity to Phrase Downloads (Admins Only) */}
                  {isAdmin && availableDates.length > 0 && (
                    <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 shadow-sm">
                      <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <select
                        className="bg-transparent text-xs font-mono text-white focus:outline-none cursor-pointer"
                        value={filterMetaKey === 'recording_date' && filterMetaValue !== 'All' ? filterMetaValue : filterDate}
                        onChange={(e) => handleDateChange(e.target.value)}
                        title="Filter queue by recording date"
                      >
                        <option value="All" className="bg-neutral-900 text-white">All Dates ({availableDates.length})</option>
                        {availableDates.map(d => (
                          <option key={d.value} value={d.value} className="bg-neutral-900 text-white">
                            {d.value} ({d.count} {d.count === 1 ? 'phrase' : 'phrases'})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Text Search (Admins Only) */}
                  {isAdmin && (
                    <div className="relative flex-1 min-w-[200px] max-w-md">
                      <Search className="w-4 h-4 absolute left-3 top-3 text-neutral-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search script, ID, speaker..."
                        value={filterSearch}
                        onChange={(e) => setFilterSearch(e.target.value)}
                        className="input pl-9 pr-8 w-full text-xs bg-neutral-900 border-neutral-700 text-white placeholder-neutral-500 rounded-lg focus:border-amber-500"
                      />
                      {filterSearch && (
                        <button
                          type="button"
                          onClick={() => setFilterSearch('')}
                          className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-white"
                          title="Clear search"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Admin Advanced Filters Button Toggle */}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setShowAdvancedFilters(prev => !prev)}
                      className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 border shadow-sm ${
                        showAdvancedFilters || activeFiltersCount > 0
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-amber-500/10'
                          : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-750 hover:text-white'
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>Filters</span>
                      {activeFiltersCount > 0 && (
                        <span className="w-4 h-4 rounded-full bg-amber-500 text-black font-black text-[10px] flex items-center justify-center">
                          {activeFiltersCount}
                        </span>
                      )}
                      {showAdvancedFilters ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
                    </button>
                  )}

                  {/* Live Match Counter for Admins */}
                  {isAdmin && (
                    <div className="hidden lg:flex items-center text-xs font-mono font-bold px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300">
                      <span>Showing <strong className="text-amber-400">{displayedPhrases.length}</strong> / {queue.length}</span>
                    </div>
                  )}

                  {/* Edited Tab Batch Approve */}
                  {activeTab === 'edited' && isAdmin && (
                    <button
                      type="button"
                      onClick={handleApproveAllEditedPhrases}
                      disabled={processing === 'all'}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-all shadow-sm flex items-center gap-1.5 ml-auto"
                    >
                      <Check className="w-4 h-4" /> Approve All Above
                    </button>
                  )}
                </div>

                {/* Expandable Advanced Filter Drawer (Admin Only, Modeled after Phrase Downloads) */}
                {isAdmin && showAdvancedFilters && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-neutral-900/95 border border-neutral-700/80 rounded-2xl p-5 shadow-2xl relative overflow-hidden backdrop-blur-md space-y-4"
                  >
                    {/* Ambient Glow */}
                    <div className="absolute -top-20 -right-20 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />

                    <div className="flex items-center justify-between border-b border-neutral-800 pb-3 relative z-10">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                          <Filter className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white flex items-center gap-2">
                            Advanced Phrase Filters
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700 font-mono">
                              Phrase Downloads Parity
                            </span>
                          </h4>
                          <p className="text-[11px] text-neutral-400">Filter recorded queue by date, format order, dynamic metadata keys, and audio parameters.</p>
                        </div>
                      </div>

                      {activeFiltersCount > 0 && (
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          className="text-xs text-rose-400 hover:text-rose-300 font-semibold transition-colors flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" /> Reset All Filters
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
                      {/* Column 1: Date & Recording Format (Direct Phrase Downloads Parity) */}
                      <div className="bg-neutral-850/80 border border-neutral-800 rounded-xl p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-amber-400" />
                            <span>1. Recording Date</span>
                          </label>
                          {/* Date Format Toggle (DD-MM-YYYY vs YYYY-MM-DD) */}
                          <div className="flex items-center gap-1 bg-neutral-900 p-0.5 rounded-md border border-neutral-800">
                            <button
                              type="button"
                              onClick={() => setFilterDateFormat("DD-MM-YYYY")}
                              className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded transition-all ${
                                filterDateFormat === "DD-MM-YYYY"
                                  ? "bg-amber-500 text-black font-bold"
                                  : "text-neutral-400 hover:text-white"
                              }`}
                            >
                              DD-MM-YYYY
                            </button>
                            <button
                              type="button"
                              onClick={() => setFilterDateFormat("YYYY-MM-DD")}
                              className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded transition-all ${
                                filterDateFormat === "YYYY-MM-DD"
                                  ? "bg-amber-500 text-black font-bold"
                                  : "text-neutral-400 hover:text-white"
                              }`}
                            >
                              YYYY-MM-DD
                            </button>
                          </div>
                        </div>

                        {/* Available Recording Date Dropdown */}
                        <div>
                          <label className="block text-[11px] text-neutral-400 mb-1">Pick Recorded Date ({availableDates.length} available)</label>
                          <select
                            value={filterMetaKey === 'recording_date' && filterMetaValue !== 'All' ? filterMetaValue : filterDate}
                            onChange={(e) => handleDateChange(e.target.value)}
                            className="input w-full text-xs font-mono bg-neutral-900 border-neutral-700 text-white rounded-lg p-2"
                          >
                            <option value="All">All Dates</option>
                            {availableDates.map(d => (
                              <option key={d.value} value={d.value}>
                                {d.value} ({d.count} {d.count === 1 ? 'phrase' : 'phrases'})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Custom Date Range Picker */}
                        <div className="pt-1 border-t border-neutral-800/80">
                          <label className="block text-[11px] text-neutral-400 mb-1.5">Or Custom Range (From / To)</label>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <input
                                type="date"
                                value={filterDateFrom}
                                onChange={(e) => setFilterDateFrom(e.target.value)}
                                className="w-full text-[11px] font-mono bg-neutral-900 border border-neutral-700 text-white rounded p-1.5 focus:border-amber-500"
                                title="From Date"
                              />
                            </div>
                            <div>
                              <input
                                type="date"
                                value={filterDateTo}
                                onChange={(e) => setFilterDateTo(e.target.value)}
                                className="w-full text-[11px] font-mono bg-neutral-900 border border-neutral-700 text-white rounded p-1.5 focus:border-amber-500"
                                title="To Date"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Column 2: Dynamic Metadata Field & Value (Exact Phrase Downloads Parity) */}
                      <div className="bg-neutral-850/80 border border-neutral-800 rounded-xl p-3.5 space-y-3">
                        <label className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-cyan-400" />
                          <span>2. Metadata Field & Value</span>
                        </label>

                        <div>
                          <label className="block text-[11px] text-neutral-400 mb-1">Step 1: Select Metadata Key</label>
                          <select
                            value={filterMetaKey}
                            onChange={(e) => handleMetaKeyChange(e.target.value)}
                            className="input w-full text-xs font-mono bg-neutral-900 border-neutral-700 text-white rounded-lg p-2"
                          >
                            <option value="All">All Metadata Keys ({metadataFilterOptions.length} available)</option>
                            {metadataFilterOptions.map(opt => (
                              <option key={opt.key} value={opt.key}>
                                {opt.label} ({opt.values?.length || 0} unique {opt.values?.length === 1 ? 'val' : 'vals'})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] text-neutral-400 mb-1">Step 2: Select Available Value</label>
                          <select
                            value={filterMetaValue}
                            onChange={(e) => handleMetaValueChange(e.target.value)}
                            disabled={filterMetaKey === 'All'}
                            className="input w-full text-xs font-mono bg-neutral-900 border-neutral-700 text-white rounded-lg p-2 disabled:opacity-40"
                          >
                            <option value="All">All Values</option>
                            {availableMetaValues.map(v => (
                              <option key={v.value} value={v.value}>
                                {v.value} ({v.count} {v.count === 1 ? 'phrase' : 'phrases'})
                              </option>
                            ))}
                          </select>
                        </div>

                        {filterMetaKey !== 'All' && (
                          <div className="flex items-center justify-between text-[11px] pt-1 text-neutral-400">
                            <span>Key chosen: <strong className="text-cyan-400">{filterMetaKey}</strong></span>
                            {filterMetaValue !== 'All' && (
                              <button
                                type="button"
                                onClick={() => { setFilterMetaKey('All'); setFilterMetaValue('All'); }}
                                className="text-rose-400 hover:text-white"
                              >
                                Clear Key
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Column 3: Audio & Quality Criteria */}
                      <div className="bg-neutral-850/80 border border-neutral-800 rounded-xl p-3.5 space-y-3">
                        <label className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                          <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>3. Audio & Quality Criteria</span>
                        </label>

                        <div>
                          <label className="block text-[11px] text-neutral-400 mb-1">Duration Range</label>
                          <select
                            value={filterDuration}
                            onChange={(e) => setFilterDuration(e.target.value)}
                            className="input w-full text-xs font-mono bg-neutral-900 border-neutral-700 text-white rounded-lg p-2"
                          >
                            <option value="All">All Durations</option>
                            <option value="<3">&lt; 3 Seconds</option>
                            <option value="3-5">3 - 5 Seconds</option>
                            <option value="5-10">5 - 10 Seconds</option>
                            <option value=">10">&gt; 10 Seconds</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] text-neutral-400 mb-1">BS.1770-4 LUFS Classification</label>
                          <select
                            value={filterLufs}
                            onChange={(e) => setFilterLufs(e.target.value)}
                            className="input w-full text-xs font-mono bg-neutral-900 border-neutral-700 text-white rounded-lg p-2"
                          >
                            <option value="All">All LUFS Ratings</option>
                            <option value="target">Target (-24.0 to -18.0 LUFS)</option>
                            <option value="loud">Too Loud (&gt; -18.0 LUFS)</option>
                            <option value="quiet">Too Quiet (&lt; -24.0 LUFS)</option>
                            <option value="untested">Untested / No Speech</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] text-neutral-400 mb-1">Audio Trim Status</label>
                          <select
                            value={filterTrimmed}
                            onChange={(e) => setFilterTrimmed(e.target.value)}
                            className="input w-full text-xs font-mono bg-neutral-900 border-neutral-700 text-white rounded-lg p-2"
                          >
                            <option value="All">All Recordings</option>
                            <option value="trimmed">Trimmed Recordings Only</option>
                            <option value="untrimmed">Original Recordings Only</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Active Filter Chips Pill Row */}
                {isAdmin && activeFiltersList.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 p-2.5 bg-neutral-900/60 border border-neutral-800 rounded-xl">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mr-1 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-400" /> Active:
                    </span>
                    {activeFiltersList.map(item => (
                      <span
                        key={item.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 transition-all hover:border-amber-500/60"
                      >
                        <span>{item.label}</span>
                        <button
                          type="button"
                          onClick={item.remove}
                          className="hover:text-white hover:bg-amber-500/30 rounded-full p-0.5 transition-colors"
                          title={`Remove ${item.label}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}

                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="ml-auto text-xs text-neutral-400 hover:text-rose-400 font-semibold underline transition-colors cursor-pointer"
                    >
                      Clear All Filters
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Bulk Action Toolbar for Admins */}
            {isAdmin && activeTab === 'recorded' && displayedPhrases.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-neutral-900 border border-neutral-700/80 rounded-xl shadow-md">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-neutral-300 select-none">
                    <input
                      type="checkbox"
                      checked={displayedPhrases.length > 0 && displayedPhrases.every(p => selectedPhrases.has(p._id))}
                      onChange={selectAllDisplayed}
                      className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-amber-500 focus:ring-amber-500 cursor-pointer"
                    />
                    <span>Select All Matching Filtered Phrases ({displayedPhrases.length})</span>
                  </label>
                  {selectedPhrases.size > 0 && (
                    <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded text-xs font-mono font-bold border border-amber-500/30">
                      {selectedPhrases.size} selected
                    </span>
                  )}
                </div>

                {selectedPhrases.size > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleBulkReview('approve')}
                      disabled={processing === 'bulk'}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve Selected ({selectedPhrases.size})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkReview('reject')}
                      disabled={processing === 'bulk'}
                      className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <X className="w-3.5 h-3.5" /> Reject Selected ({selectedPhrases.size})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPhrases(new Set())}
                      className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-xs rounded-lg transition-all"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            )}

            <AnimatePresence>
              {paginatedPhrases.map((p) => (
                <motion.div 
                  key={p._id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95, height: 0 }}
                  className={`card border-l-4 ${activeTab === 'approved' ? 'border-l-emerald-500' : 'border-l-warning-500'} ${selectedPhrases.has(p._id) ? 'ring-2 ring-amber-500/60 bg-amber-500/5' : ''}`}
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row gap-6">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-3 mb-2">
                          {isAdmin && activeTab === 'recorded' && (
                            <input
                              type="checkbox"
                              checked={selectedPhrases.has(p._id)}
                              onChange={() => toggleSelectPhrase(p._id)}
                              className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-amber-500 focus:ring-amber-500 cursor-pointer flex-shrink-0"
                            />
                          )}
                          {p.status === 'approved' ? (
                            <span className="badge bg-emerald-600 text-white font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Approved
                            </span>
                          ) : (
                            <span className="badge badge-warning">Pending Review</span>
                          )}
                          {p.isTestPhrase && (
                            <span className="badge bg-error-500 text-white font-bold animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                              TEST PHRASE
                            </span>
                          )}
                          <span className="text-xs font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
                            🎤 {getSpeakerId(p) || "Unassigned"}
                          </span>
                          {(p.lufs !== undefined && p.lufs !== null) || (qcData[p._id]?.freq?.lufs !== undefined && qcData[p._id]?.freq?.lufs !== null) ? (
                            (() => {
                              const lufsVal = qcData[p._id]?.freq?.lufs !== undefined ? qcData[p._id]?.freq?.lufs : p.lufs;
                              if (lufsVal === null) return (
                                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-neutral-800 text-neutral-300 border border-neutral-700">
                                  ⚠️ No Speech
                                </span>
                              );
                              const isTarget = lufsVal >= -24.0 && lufsVal <= -18.0;
                              const isLoud = lufsVal > -18.0;
                              return (
                                <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold border shadow-sm ${
                                  isTarget
                                    ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40"
                                    : isLoud
                                    ? "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40"
                                    : "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40"
                                }`}>
                                  📊 {lufsVal} LUFS ({isTarget ? "✓ Perfect" : isLoud ? "⚠️ Too Loud" : "⚠️ Too Quiet"})
                                </span>
                              );
                            })()
                          ) : null}
                          <span className="text-sm font-mono opacity-60">ID: {p.phraseId}</span>
                          <span className="text-sm font-semibold capitalize bg-neutral-100 dark:bg-neutral-700 px-2 rounded">{p.language}</span>
                        </div>
                        
                        {activeTab === 'edited' ? (
                          <div className="mb-4 space-y-2 bg-neutral-900/80 p-3.5 rounded-lg border border-indigo-500/40 text-sm">
                            <div className="flex items-center justify-between text-xs font-bold text-neutral-400 border-b border-neutral-800 pb-2">
                              <span>✏️ EDITED PHRASE SCRIPT</span>
                              {p.editedBy && (
                                <span className="text-neutral-400 font-normal">
                                  Edited by: <strong className="text-indigo-400">{p.editedBy.firstname || p.editedBy.username || "QA"}</strong> ({p.editedBy.email})
                                </span>
                              )}
                            </div>

                            <div className="space-y-1.5 pt-1">
                              <div>
                                <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">Original Script:</span>
                                <p className="text-neutral-400 line-through italic text-base bg-neutral-950/60 p-2.5 rounded border border-neutral-800">
                                  "{p.originalText || p.text}"
                                </p>
                              </div>
                              <div className="relative group">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">Updated Script:</span>
                                  {isAdmin && editingTextId !== p._id && (
                                    <button
                                      onClick={() => {
                                        setEditingTextId(p._id);
                                        setEditTextValue(prev => ({ ...prev, [p._id]: adminEdits[p._id] !== undefined ? adminEdits[p._id] : p.text }));
                                      }}
                                      className="px-2 py-0.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 rounded text-[11px] font-bold transition-all flex items-center gap-1"
                                      title="Edit updated script text further"
                                    >
                                      ✏️ Edit Script
                                    </button>
                                  )}
                                </div>
                                {editingTextId === p._id ? (
                                  <div className="space-y-2 bg-neutral-950 p-2.5 rounded border border-indigo-500/50">
                                    <textarea
                                      rows={2}
                                      value={editTextValue[p._id] !== undefined ? editTextValue[p._id] : p.text}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setEditTextValue(prev => ({ ...prev, [p._id]: val }));
                                        setAdminEdits(prev => ({ ...prev, [p._id]: val }));
                                      }}
                                      className="w-full input text-base font-medium resize-none bg-neutral-900 text-white border-neutral-700 focus:border-indigo-400"
                                      placeholder="Modify updated phrase text..."
                                    />
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => {
                                          const val = editTextValue[p._id];
                                          if (val && val.trim()) {
                                            setAdminEdits(prev => ({ ...prev, [p._id]: val.trim() }));
                                            setQueue(prev => prev.map(q => q._id === p._id ? { ...q, text: val.trim() } : q));
                                          }
                                          setEditingTextId(null);
                                        }}
                                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition-colors"
                                      >
                                        ✓ Save Admin Script
                                      </button>
                                      <button
                                        onClick={() => setEditingTextId(null)}
                                        className="px-3 py-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 rounded text-xs font-semibold transition-colors"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-white font-semibold text-lg bg-emerald-950/30 p-2.5 rounded border border-emerald-800/60">
                                    "{adminEdits[p._id] !== undefined ? adminEdits[p._id] : p.text}"
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : editingTextId === p._id ? (
                          <div className="mb-4 space-y-2.5 bg-neutral-800 p-3.5 rounded-lg border border-amber-500/50">
                            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400">Edit Phrase Script Text</label>
                            <textarea
                              rows={3}
                              value={editTextValue[p._id] !== undefined ? editTextValue[p._id] : p.text}
                              onChange={(e) => setEditTextValue(prev => ({ ...prev, [p._id]: e.target.value }))}
                              className="w-full input text-base font-medium resize-none bg-neutral-900 text-white border-neutral-700 focus:border-amber-400"
                              placeholder="Edit phrase text..."
                            />
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleSaveText(p._id)}
                                disabled={savingText[p._id]}
                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors disabled:opacity-50"
                              >
                                {savingText[p._id] ? "Saving..." : "✓ Save Script"}
                              </button>
                              <button
                                onClick={() => setEditingTextId(null)}
                                className="px-3.5 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 rounded-lg text-xs font-semibold transition-colors"
                              >
                                ✕ Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative group mb-4">
                            <h3 className="text-xl font-medium leading-relaxed bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-lg border border-neutral-100 dark:border-neutral-700 pr-28">
                              "{p.text}"
                            </h3>
                            {(p.allowPhraseTextEdit || isAdmin) && (
                              <button
                                onClick={() => {
                                  setEditingTextId(p._id);
                                  setEditTextValue(prev => ({ ...prev, [p._id]: p.text }));
                                }}
                                className="absolute right-3 top-3 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
                                title="Edit phrase text to remove skipped words or event tags"
                              >
                                ✏️ Edit Text
                              </button>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4 opacity-80">
                          {p.emotion && <div><span className="font-semibold block text-xs uppercase tracking-wider opacity-70">Emotion</span> {p.emotion}</div>}
                          {p.style && <div><span className="font-semibold block text-xs uppercase tracking-wider opacity-70">Style</span> {p.style}</div>}
                          {p.speed && <div><span className="font-semibold block text-xs uppercase tracking-wider opacity-70">Speed</span> {p.speed}</div>}
                          {p.intent && <div><span className="font-semibold block text-xs uppercase tracking-wider opacity-70">Intent</span> {p.intent}</div>}
                          {p.pitch && <div><span className="font-semibold block text-xs uppercase tracking-wider opacity-70">Pitch</span> {p.pitch}</div>}
                          {p.volume && <div><span className="font-semibold block text-xs uppercase tracking-wider opacity-70">Volume</span> {p.volume}</div>}
                          {p.instructions && <div className="col-span-2 md:col-span-4 mt-2"><span className="font-semibold block text-xs uppercase tracking-wider opacity-70">Instructions</span> {p.instructions}</div>}
                        </div>

                        <p className="text-sm border-t border-neutral-200 dark:border-neutral-700 pt-3 mt-3">
                          {isAdmin && (
                            <>
                              <span className="opacity-70">Contributor: </span>
                              <span className="font-semibold">{p.contributorId?.username || p.contributorId?.firstname || 'Unknown'}</span>
                              {p.contributorId?.speaker_id && (
                                <>
                                  <span className="mx-2 opacity-30">|</span>
                                  <span className="opacity-70">Speaker ID: </span>
                                  <span className="font-mono text-xs font-semibold bg-neutral-200 dark:bg-neutral-800 px-1.5 py-0.5 rounded">{p.contributorId.speaker_id}</span>
                                </>
                              )}
                              {(p.projectName || p.companyId) && <span className="mx-2 opacity-30">|</span>}
                            </>
                          )}
                          {(p.projectName || p.companyId) && (
                            <>
                              <span className="opacity-70">Project: </span>
                              <span className="font-semibold">{p.projectName || p.companyId}</span>
                            </>
                          )}
                        </p>
                      </div>

                      <div className="md:w-80 flex flex-col justify-between bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
                        <div className="mb-4">
                          <h4 className="font-medium mb-3 flex justify-between items-center text-sm">
                            Playback Audio
                            <span className="opacity-50 font-mono text-xs">NO DOWNLOADING</span>
                          </h4>
                          <SecureAudioPlayer 
                            url={`/api/phrases/${p._id}/audio`} 
                            requireFullListen={activeTab === 'recorded' && !isAdmin}
                            onFirstListenComplete={() => {
                              setListenedOnce(prev => ({ ...prev, [p._id]: true }));
                            }}
                          />
                        </div>

                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => handleCheckLufs(p._id)}
                            disabled={loadingLufs[p._id]}
                            className="w-full py-2 px-3 bg-amber-600/90 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
                            title="Calculate exact ITU-R BS.1770-4 gated speech-only LUFS"
                          >
                            {loadingLufs[p._id] ? (
                              <>
                                <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                Calculating LUFS...
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-4 h-4" /> Check LUFS Score
                              </>
                            )}
                          </button>

                          {p.audioFile && (
                            <button
                              type="button"
                              onClick={() => openTrimModal(p)}
                              className="w-full py-2 px-3 bg-purple-600/90 hover:bg-purple-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
                              title="Trim long non-speech start and end silences"
                            >
                              ✂️ Trim Start/End Audio
                            </button>
                          )}

                          {p.audioFile && (
                            <button
                              type="button"
                              onClick={() => toggleSpectrogram(p._id)}
                              className={`w-full py-2.5 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 shadow-md ${
                                showSpectrogram[p._id]
                                  ? "bg-violet-700 text-white ring-2 ring-violet-400"
                                  : "bg-gradient-to-r from-violet-700 to-indigo-700 hover:from-violet-600 hover:to-indigo-600 text-white"
                              }`}
                              title="Toggle 0–24kHz Mel Spectrogram analysis with Audacity settings"
                            >
                              <span>📊</span>
                              <span>{showSpectrogram[p._id] ? "Hide Spectrogram" : "Mel Spectrogram (0–24k)"}</span>
                            </button>
                          )}

                          {p.wasAudioTrimmed && p.originalAudioFile && (
                            <div className="p-3 bg-neutral-900/90 rounded-xl border border-purple-500/40 space-y-2 text-left my-2">
                              <div className="flex items-center justify-between text-xs font-bold text-purple-400">
                                <span>✂️ Audio Trim Comparison</span>
                                <button
                                  type="button"
                                  onClick={() => handleRevertTrim(p._id)}
                                  className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded text-[11px] font-bold transition-all flex items-center gap-1 shadow-sm"
                                  title="Undo trim and restore original untrimmed audio"
                                >
                                  ↺ Revert to Original
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-[11px]">
                                <div className="bg-neutral-950 p-2 rounded border border-neutral-800">
                                  <span className="block text-neutral-400 font-bold mb-1">🔊 Untrimmed Original</span>
                                  <span className="font-mono text-emerald-400 font-bold">{p.originalDuration ? `${p.originalDuration}s` : '—'}</span>
                                  {p.originalLufs !== null && <span className="block font-mono text-neutral-400 text-[10px]">{p.originalLufs} LUFS</span>}
                                </div>
                                <div className="bg-neutral-950 p-2 rounded border border-purple-800/60">
                                  <span className="block text-purple-400 font-bold mb-1">✂️ Trimmed Speech</span>
                                  <span className="font-mono text-purple-300 font-bold">{p.duration}s</span>
                                  {p.lufs !== null && <span className="block font-mono text-purple-400 text-[10px]">{p.lufs} LUFS</span>}
                                </div>
                              </div>
                            </div>
                          )}

                          {isAdmin && p.audioFile && (
                            <button
                              type="button"
                              onClick={() => window.open(`${import.meta.env.VITE_BACKEND_URL || "http://localhost:3001"}/api/phrases/admin/download-zip/${p._id}`, '_blank')}
                              className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
                              title="Download ZIP bundle containing audio.wav, speaker_metadata.json, and utterance.json"
                            >
                              <Download className="w-4 h-4" /> Download Phrase ZIP
                            </button>
                          )}

                          {activeTab === 'recorded' && (
                            <div>
                              {!isAdmin && !listenedOnce[p._id] && (
                                <div className="mb-2 text-xs font-semibold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-lg text-center flex items-center justify-center gap-1.5">
                                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                  Listen to audio completely once to enable review
                                </div>
                              )}
                              <input 
                                type="text" 
                                placeholder="Add QA comment (optional)"
                                className="input text-sm mb-2"
                                value={comments[p._id] || ''}
                                onChange={(e) => setComments(prev => ({ ...prev, [p._id]: e.target.value }))}
                                disabled={processing === p._id || (!isAdmin && !listenedOnce[p._id])}
                              />
                              <div className="flex gap-2 mb-2">
                                <button 
                                  className="flex-1 btn btn-success flex items-center justify-center gap-2 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                                  onClick={() => handleReview(p._id, 'approve')}
                                  disabled={processing === p._id || (!isAdmin && !listenedOnce[p._id])}
                                  title={!isAdmin && !listenedOnce[p._id] ? "Listen to full audio once to approve" : ""}
                                >
                                  <Check className="w-4 h-4" /> Approve
                                </button>
                                <button 
                                  className="flex-1 btn btn-error flex items-center justify-center gap-2 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                                  onClick={() => handleReview(p._id, 'reject')}
                                  disabled={processing === p._id || (!isAdmin && !listenedOnce[p._id])}
                                  title={!isAdmin && !listenedOnce[p._id] ? "Listen to full audio once to reject" : ""}
                                >
                                  <X className="w-4 h-4" /> Reject
                                </button>
                              </div>
                            </div>
                          )}

                          {activeTab === 'edited' && isAdmin && (
                            <div className="space-y-3 pt-3 border-t border-neutral-700 bg-neutral-900/60 p-3 rounded-xl border border-indigo-500/30">
                              <div className="text-xs font-bold text-amber-400 uppercase tracking-wider text-center flex items-center justify-center gap-1">
                                🛡️ Admin Verification & Audit
                              </div>

                              {/* Admin Feedback Note for QA */}
                              <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
                                  Feedback Note for QA (Shown in QA Flags if conflict)
                                </label>
                                <textarea
                                  rows={2}
                                  placeholder="Explain why edit was rejected or modified (e.g. Skipped event tag <gasps> should remain)..."
                                  className="w-full input text-xs resize-none bg-neutral-950 text-white border-neutral-700 focus:border-indigo-400"
                                  value={adminNotes[p._id] || ''}
                                  onChange={(e) => setAdminNotes(prev => ({ ...prev, [p._id]: e.target.value }))}
                                />
                              </div>

                              {/* Verification Action Buttons */}
                              <div className="flex gap-2 pt-1">
                                <button 
                                  className="flex-1 py-2 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1 shadow-sm"
                                  onClick={() => handleReviewEditedPhrase(p._id, 'approved')}
                                  disabled={processing === p._id}
                                >
                                  <Check className="w-3.5 h-3.5" /> Approve Phrase
                                </button>
                                <button 
                                  className="flex-1 py-2 px-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1 shadow-sm"
                                  onClick={() => handleReviewEditedPhrase(p._id, 'rejected')}
                                  disabled={processing === p._id}
                                >
                                  <X className="w-3.5 h-3.5" /> Reject Phrase
                                </button>
                              </div>
                            </div>
                          )}

                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleDeletePhrase(p)}
                              disabled={processing === p._id}
                              className="w-full py-2 px-3 bg-red-600/90 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
                              title="Delete phrase options"
                            >
                              <Trash2 className="w-4 h-4" /> Delete Phrase
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Mel Spectrogram Panel */}
                    {showSpectrogram[p._id] && (
                      <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4 mb-4">
                        <SpectrogramViewer
                          audioUrl={`${import.meta.env.VITE_BACKEND_URL || "http://localhost:3001"}/api/phrases/${p._id}/audio`}
                          title={`Phrase ${p.phraseId || p._id} — Mel Spectrogram`}
                          maxFreq={24000}
                          gainDb={20}
                          rangeDb={120}
                          height={190}
                          phraseId={p._id}
                          initialAiAudit={p.spectrogramAiAudit}
                          allowReAudit={true}
                        />
                      </div>
                    )}

                    {/* QC Collapse drawer */}
                    <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4">
                      <button
                        onClick={() => toggleQc(p._id)}
                        className="w-full flex items-center justify-between text-sm font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
                      >
                        <span className="flex items-center gap-2">📊 {expandedQc[p._id] ? 'Close QC Analysis' : 'Open QC Analysis'}</span>
                        <span>{expandedQc[p._id] ? '▲' : '▼'}</span>
                      </button>

                      {expandedQc[p._id] && (
                        <div className="mt-4 bg-neutral-100/50 dark:bg-neutral-900/50 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs">
                          {loadingQc[p._id] ? (
                            <div className="flex flex-col items-center justify-center py-6 gap-2">
                              <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                              <span className="opacity-60 font-medium">Running frequency checks...</span>
                            </div>
                          ) : errorQc[p._id] ? (
                            <div className="text-error-500 font-semibold p-2 flex flex-col gap-2">
                              <span>⚠️ {errorQc[p._id]}</span>
                              <button 
                                onClick={() => runQC(p._id, true)}
                                className="px-3 py-1 bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-100 rounded font-semibold text-xxs w-max transition-colors"
                              >
                                Retry
                              </button>
                            </div>
                          ) : qcData[p._id] ? (
                            <div className="space-y-4">
                              <div className="flex justify-between items-center border-b border-neutral-200 dark:border-neutral-800 pb-2">
                                <span className="font-bold uppercase tracking-wider text-neutral-400">QC Analysis Metrics</span>
                                <button 
                                  onClick={() => runQC(p._id, true)}
                                  className="px-2 py-1 bg-neutral-700 hover:bg-neutral-600 text-warning-400 hover:text-warning-300 rounded font-semibold transition-colors"
                                >
                                  🔄 Re-run
                                </button>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                <div className="p-3 bg-white dark:bg-neutral-850 rounded-lg border border-neutral-200/50 dark:border-neutral-800/80">
                                  <span className="block text-neutral-400 font-bold uppercase tracking-wider mb-1">LUFS Loudness</span>
                                  <span className={`font-mono font-bold text-xs ${
                                    qcData[p._id].freq.lufs === null || qcData[p._id].freq.lufs === undefined
                                      ? "text-neutral-400"
                                      : qcData[p._id].freq.lufs >= -24.0 && qcData[p._id].freq.lufs <= -18.0
                                      ? "text-emerald-500"
                                      : qcData[p._id].freq.lufs > -18.0
                                      ? "text-rose-500"
                                      : "text-amber-500"
                                  }`}>
                                    {qcData[p._id].freq.lufs !== null && qcData[p._id].freq.lufs !== undefined
                                      ? `${qcData[p._id].freq.lufs} LUFS (${qcData[p._id].freq.lufs >= -24.0 && qcData[p._id].freq.lufs <= -18.0 ? '✓ Target' : qcData[p._id].freq.lufs > -18.0 ? '⚠️ Too Loud' : '⚠️ Too Quiet'})`
                                      : '⚠️ No Speech'}
                                  </span>
                                </div>
                                <div className="p-3 bg-white dark:bg-neutral-850 rounded-lg border border-neutral-200/50 dark:border-neutral-800/80">
                                  <span className="block text-neutral-400 font-bold uppercase tracking-wider mb-1">Bit Depth</span>
                                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">{qcData[p._id].freq.bit_depth || '—'}</span>
                                </div>
                                <div className="p-3 bg-white dark:bg-neutral-850 rounded-lg border border-neutral-200/50 dark:border-neutral-800/80">
                                  <span className="block text-neutral-400 font-bold uppercase tracking-wider mb-1">Noise Floor</span>
                                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">{qcData[p._id].freq.noise_floor ? `${qcData[p._id].freq.noise_floor} dBFS` : '—'}</span>
                                </div>
                                <div className="p-3 bg-white dark:bg-neutral-850 rounded-lg border border-neutral-200/50 dark:border-neutral-800/80">
                                  <span className="block text-neutral-400 font-bold uppercase tracking-wider mb-1">Crest Factor</span>
                                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">{qcData[p._id].freq.crest_factor ? `${qcData[p._id].freq.crest_factor} dB` : '—'}</span>
                                </div>
                                <div className="p-3 bg-white dark:bg-neutral-850 rounded-lg border border-neutral-200/50 dark:border-neutral-800/80">
                                  <span className="block text-neutral-400 font-bold uppercase tracking-wider mb-1">Processing Verdict</span>
                                  <span className="font-semibold text-neutral-900 dark:text-neutral-100">{qcData[p._id].freq.processing_verdict || 'Clean ✅'}</span>
                                </div>
                              </div>

                              <div className="pt-2">
                                <span className="block text-neutral-400 font-bold uppercase tracking-wider mb-2">Spectrogram Plot (20Hz - 20kHz)</span>
                                {qcData[p._id].freq.spectrogram_img ? (
                                  <div className="rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800">
                                    <img 
                                      src={`data:image/png;base64,${qcData[p._id].freq.spectrogram_img}`} 
                                      alt="Spectrogram Plot" 
                                      className="w-full object-contain cursor-zoom-in hover:brightness-110 transition-all"
                                      onClick={() => setLightboxSrc(qcData[p._id].freq.spectrogram_img)}
                                    />
                                  </div>
                                ) : (
                                  <div className="p-4 text-center text-neutral-400 bg-white dark:bg-neutral-850 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl">
                                    No spectrogram plot generated.
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Empty States: When whole queue is empty vs when active filters match nothing */}
            {queue.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                className="text-center py-20 opacity-50"
              >
                <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-xl">The queue is empty!</p>
                <p>No phrases currently in the {activeTab === 'approved' ? 'Approved Phrases' : activeTab === 'edited' ? 'Edited Phrases' : 'Pending Review'} view.</p>
              </motion.div>
            ) : displayedPhrases.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                className="card text-center py-16 px-4 border border-dashed border-neutral-700 bg-neutral-900/40 rounded-2xl my-6"
              >
                <div className="w-12 h-12 rounded-full bg-neutral-800 text-amber-400 mx-auto mb-3 flex items-center justify-center border border-neutral-700">
                  <Filter className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-neutral-200">No Matching Phrases Found</h3>
                <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
                  There are {queue.length} phrases loaded in this view, but none match your active filter settings.
                </p>
                {activeFiltersCount > 0 && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="mt-4 px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Clear All Filters
                  </button>
                )}
              </motion.div>
            ) : null}

            {/* Pagination Controls */}
            {displayedPhrases.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-neutral-900/80 border border-neutral-800 rounded-xl mt-6 text-xs text-neutral-400 shadow-sm">
                <div className="flex items-center gap-2">
                  <span>Rows per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-neutral-950 border border-neutral-800 text-white rounded px-2 py-1 focus:outline-none focus:border-amber-500"
                  >
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="0">All</option>
                  </select>
                  <span className="ml-2 font-mono">
                    Showing {pageSize <= 0 ? displayedPhrases.length : Math.min((currentPage - 1) * pageSize + 1, displayedPhrases.length)} - {pageSize <= 0 ? displayedPhrases.length : Math.min(currentPage * pageSize, displayedPhrases.length)} of {displayedPhrases.length} phrases
                  </span>
                </div>

                {pageSize > 0 && totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage <= 1}
                      className="p-1.5 rounded-lg bg-neutral-850 hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
                      title="Previous Page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-3 font-mono font-bold text-neutral-200">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage >= totalPages}
                      className="p-1.5 rounded-lg bg-neutral-850 hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
                      title="Next Page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {/* Spectrogram Lightbox Modal */}
        {lightboxSrc && (
          <div 
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/95 backdrop-blur-sm cursor-zoom-out animate-fade-in"
            onClick={() => setLightboxSrc(null)}
          >
            <div className="relative max-w-[95vw] max-h-[85vh] flex flex-col items-center">
              <img 
                src={`data:image/png;base64,${lightboxSrc}`} 
                alt="Spectrogram Zoomed" 
                className="max-w-full max-h-[80vh] object-contain rounded-lg border border-neutral-700 shadow-2xl"
              />
              <div className="mt-4 text-xs font-semibold text-neutral-400 bg-neutral-900/80 px-3 py-1.5 rounded-full border border-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                <span>📊 Zoomed Spectrogram Plot (Click anywhere to close)</span>
              </div>
            </div>
          </div>
        )}

        {/* Trim Audio Modal */}
        <AnimatePresence>
          {showTrimModal && trimmingPhrase && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative text-left text-white"
              >
                <div className="flex items-center justify-between border-b border-neutral-800 pb-4 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="bg-purple-500/10 text-purple-400 p-2.5 rounded-xl border border-purple-500/20 text-lg">
                      ✂️
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-white">Trim Phrase Silence</h3>
                      <p className="text-xs text-neutral-400 font-mono">ID: {trimmingPhrase.phraseId}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowTrimModal(false); setTrimmingPhrase(null); }}
                    className="p-2 text-neutral-400 hover:text-white rounded-lg transition-colors"
                  >
                    ✕
                  </button>
                </div>

                <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 mb-6">
                  <p className="text-sm font-medium text-neutral-300 italic mb-2">"{trimmingPhrase.text}"</p>
                  <div className="flex items-center justify-between text-xs text-neutral-400 font-mono">
                    <span>Original Duration: <b>{trimmingPhrase.duration ? `${trimmingPhrase.duration}s` : "Unknown"}</b></span>
                    <span>Trimmed Duration: <b className="text-emerald-400">{(Math.max(0, endTrimSec - startTrimSec)).toFixed(2)}s</b></span>
                  </div>
                </div>

                {/* Visual Audio Waveform Canvas with Draggable Handles */}
                <div className="mb-4">
                  <InteractiveWaveformTrimmer
                    audioUrl={trimAudioUrl}
                    duration={trimmingPhrase.duration || 5}
                    startTrimSec={startTrimSec}
                    endTrimSec={endTrimSec}
                    onTrimChange={(newStart, newEnd) => {
                      setStartTrimSec(newStart);
                      setEndTrimSec(newEnd);
                    }}
                  />
                </div>

                {/* Precise Numeric Time Inputs */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
                      Start Cut (Seconds):
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max={Math.max(0, endTrimSec - 0.1)}
                      value={startTrimSec}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setStartTrimSec(Math.max(0, Math.min(val, endTrimSec - 0.1)));
                      }}
                      className="w-full bg-neutral-950 border border-neutral-800 text-emerald-400 font-mono font-bold text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-rose-400 uppercase tracking-wider mb-1">
                      End Cut (Seconds):
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      min={startTrimSec + 0.1}
                      max={trimmingPhrase.duration || 100}
                      value={endTrimSec}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || (startTrimSec + 0.1);
                        setEndTrimSec(Math.min(trimmingPhrase.duration || 100, Math.max(val, startTrimSec + 0.1)));
                      }}
                      className="w-full bg-neutral-950 border border-neutral-800 text-rose-400 font-mono font-bold text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </div>

                {/* Save Action Buttons for QA vs Admin */}
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => { setShowTrimModal(false); setTrimmingPhrase(null); }}
                    className="py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-bold transition-colors"
                  >
                    Cancel
                  </button>

                  {!isAdmin ? (
                    <button
                      type="button"
                      onClick={() => handleSaveTrim()}
                      disabled={trimSaving}
                      className="flex-1 py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-md shadow-purple-600/20 active:scale-95"
                    >
                      {trimSaving ? "Trimming..." : "✂️ Save Trim & Move to Edited"}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSaveTrim('approved')}
                        disabled={trimSaving}
                        className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1 disabled:opacity-50 shadow-md shadow-emerald-600/20 active:scale-95"
                      >
                        <Check className="w-3.5 h-3.5" /> {trimSaving ? "Saving..." : "Trim & Approve"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveTrim('rejected')}
                        disabled={trimSaving}
                        className="flex-1 py-2.5 px-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1 disabled:opacity-50 shadow-md shadow-rose-600/20 active:scale-95"
                      >
                        <X className="w-3.5 h-3.5" /> {trimSaving ? "Saving..." : "Trim & Reject"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveTrim()}
                        disabled={trimSaving}
                        className="py-2.5 px-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1 disabled:opacity-50 shadow-md shadow-purple-600/20 active:scale-95"
                        title="Save trimmed audio while preserving current status"
                      >
                        {trimSaving ? "Saving..." : "Trim Only"}
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
