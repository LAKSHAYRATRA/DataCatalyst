import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { 
    Radio, 
    CheckCircle2, 
    XCircle, 
    Clock, 
    Volume2, 
    FileText, 
    Sparkles, 
    RefreshCw, 
    ChevronRight, 
    AlertCircle, 
    Play, 
    Pause, 
    Download,
    Eye,
    ShieldAlert,
    RotateCcw,
    Check,
    X,
    Users,
    Activity,
    BarChart2,
    ZoomIn,
    Scissors
} from "lucide-react";
import AdminNav from "../components/AdminNav.jsx";
import { getUserInfo } from "../lib/auth.js";
import { fetchDirectAudioBlob } from "../lib/audioToWav.js";
import AudioVisualizer from "../components/AudioVisualizer.jsx";
import InteractiveWaveformTrimmer from "../components/InteractiveWaveformTrimmer.jsx";
import Swal from "sweetalert2";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

async function apiFetch(path, opts = {}) {
    const res = await fetch(`${BACKEND_URL}${path}`, { credentials: "include", ...opts });
    const json = await res.json().catch(() => ({ error: "Request failed" }));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
}

async function apiPatch(path, data = {}) {
    return apiFetch(path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
}

async function apiPostJson(path, data = {}) {
    return apiFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
}

function StatusBadge({ status }) {
    const s = (status || "pending").toLowerCase();
    if (s === "approved") {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-700/60 shadow-sm">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Approved</span>
            </span>
        );
    }
    if (s === "rejected") {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-950/70 text-rose-300 border border-rose-700/60 shadow-sm">
                <XCircle className="w-3.5 h-3.5 text-rose-400" />
                <span>Rejected</span>
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-950/70 text-amber-300 border border-amber-700/60 shadow-sm">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Pending</span>
        </span>
    );
}

export default function AdminScriptedCallsReview() {
    const navigate = useNavigate();
    const userInfo = getUserInfo();
    const isQaOnly = Boolean(userInfo?.isQA && !userInfo?.isAdmin);
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState("pending");
    const [languageFilter, setLanguageFilter] = useState("");
    const [error, setError] = useState("");

    const [calls, setCalls] = useState([]);
    const [selectedCallIds, setSelectedCallIds] = useState([]);
    const [loadingCalls, setLoadingCalls] = useState(true);
    const [callPages, setCallPages] = useState(1);
    const [callTotal, setCallTotal] = useState(0);
    const [reviewing, setReviewing] = useState(null);
    const [recordingNotes, setRecordingNotes] = useState({});
    const [rejectionReasons, setRejectionReasons] = useState({});
    const [actionLoading, setActionLoading] = useState(null);
    const [audioUrls, setAudioUrls] = useState({});
    const [loadingAudio, setLoadingAudio] = useState(null);
    const [qcLoading, setQcLoading] = useState({});
    const [qcResults, setQcResults] = useState({});
    const [qcErrors, setQcErrors] = useState({});
    const [zoomedImage, setZoomedImage] = useState(null);
    const [lockTimerSeconds, setLockTimerSeconds] = useState(900);
    const [lockExpired, setLockExpired] = useState(false);
    const [allLanguages, setAllLanguages] = useState([]);
    const [dialogueData, setDialogueData] = useState(null);
    const [dialogueLoading, setDialogueLoading] = useState(false);
    const [playingVerseIndex, setPlayingVerseIndex] = useState(null);
    const [verseAudioBlobs, setVerseAudioBlobs] = useState({});
    const [loadingVerseAudio, setLoadingVerseAudio] = useState(null);
    const verseAudioRef = useRef(null);

    // Audio Trimming States for Scripted Turns
    const [showTrimModal, setShowTrimModal] = useState(false);
    const [trimmingTurn, setTrimmingTurn] = useState(null);
    const [startTrimSec, setStartTrimSec] = useState(0);
    const [endTrimSec, setEndTrimSec] = useState(0);
    const [trimSaving, setTrimSaving] = useState(false);
    const [trimAudioUrl, setTrimAudioUrl] = useState(null);
    const trimAudioRef = useRef(null);

    const audioRefs = useRef({});

    const rawQaList = (userInfo?.qaLanguageCodes && userInfo.qaLanguageCodes.length > 0)
        ? userInfo.qaLanguageCodes
        : (userInfo?.qaLanguageCode ? [userInfo.qaLanguageCode] : []);

    const availableLanguagesList = isQaOnly
        ? rawQaList
        : (allLanguages.length > 0 ? allLanguages : (rawQaList.length > 0 ? rawQaList : ["english", "hindi", "marathi", "bengali", "tamil", "telugu", "gujarati", "kannada", "malayalam", "punjabi"]));

    useEffect(() => {
        async function fetchLanguages() {
            try {
                const data = await apiFetch("/api/admin/qa/languages");
                if (data?.languages && Array.isArray(data.languages)) {
                    setAllLanguages(data.languages.map(l => String(l.code || l.name || l).toLowerCase()));
                }
            } catch {}
        }
        fetchLanguages();
    }, []);

    useEffect(() => {
        loadCalls();
    }, [page, statusFilter, languageFilter]);

    useEffect(() => {
        let interval = null;
        if (reviewing && lockTimerSeconds > 0 && !lockExpired) {
            interval = setInterval(() => {
                setLockTimerSeconds(prev => {
                    if (prev <= 1) {
                        setLockExpired(true);
                        clearInterval(interval);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [reviewing, lockTimerSeconds, lockExpired]);

    async function loadCalls() {
        setLoadingCalls(true);
        setError("");
        try {
            const qs = `?page=${page}&limit=20&mode=scripted${statusFilter ? `&status=${statusFilter}` : ""}${languageFilter ? `&language=${encodeURIComponent(languageFilter)}` : ""}`;
            const data = await apiFetch(`/api/admin/qa/calls${qs}`);
            setCalls(data.calls || []);
            setCallPages(data.pages || 1);
            setCallTotal(data.total || 0);
        } catch (e) {
            setError(e.message);
            if (e.message.includes("Unauthorized") || e.message.includes("Forbidden")) navigate("/login");
        } finally {
            setLoadingCalls(false);
        }
    }

    function toggleSelectCall(callId) {
        setSelectedCallIds(prev => 
            prev.includes(callId) ? prev.filter(id => id !== callId) : [...prev, callId]
        );
    }

    function toggleSelectAll() {
        const pageCallIds = calls.map(c => c.callId);
        const allSelected = pageCallIds.length > 0 && pageCallIds.every(id => selectedCallIds.includes(id));
        if (allSelected) {
            setSelectedCallIds(prev => prev.filter(id => !pageCallIds.includes(id)));
        } else {
            setSelectedCallIds(prev => Array.from(new Set([...prev, ...pageCallIds])));
        }
    }

    async function handleDownloadSelected() {
        if (selectedCallIds.length === 0) return;

        Swal.fire({
            title: "Packaging Scripted Calls...",
            html: `Generating combined ZIP with audio, transcripts, and speaker metadata for <b>${selectedCallIds.length}</b> call(s)...`,
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        try {
            const res = await fetch(`${BACKEND_URL}/api/admin/qa/scripted/download-batch`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ callIds: selectedCallIds })
            });

            if (!res.ok) {
                let errMsg = "Failed to download scripted calls ZIP.";
                try {
                    const json = await res.json();
                    errMsg = json.error || errMsg;
                } catch {}
                throw new Error(errMsg);
            }

            const disposition = res.headers.get("content-disposition") || "";
            let filename = `scripted_calls_export_${Date.now()}.zip`;
            const match = disposition.match(/filename="?([^"]+)"?/);
            if (match && match[1]) {
                filename = match[1];
            }

            const blob = await res.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(downloadUrl);
            document.body.removeChild(a);

            Swal.fire({
                icon: "success",
                title: "Download Complete",
                text: `Successfully downloaded ${selectedCallIds.length} scripted call(s) with audio, transcripts, and speaker metadata.`,
                timer: 2000,
                showConfirmButton: false
            });
        } catch (e) {
            Swal.fire("Download Failed", e.message, "error");
        }
    }

    async function openCallReview(call) {
        try {
            await apiPostJson(`/api/admin/qa/calls/${call.callId}/lock`);
            setReviewing(call);
            setDialogueData(null);
            setPlayingVerseIndex(null);
            setLockTimerSeconds(15 * 60);
            setLockExpired(false);

            const userAId = String(call.userA?._id || call.userA || "userA");
            const userBId = String(call.userB?._id || call.userB || "userB");

            setRejectionReasons({
                [userAId]: call.recordingARejectionReason ? call.recordingARejectionReason.split(", ").map(s => s.trim()) : (call.recordingANoisy ? ["Noisy"] : []),
                [userBId]: call.recordingBRejectionReason ? call.recordingBRejectionReason.split(", ").map(s => s.trim()) : (call.recordingBNoisy ? ["Noisy"] : [])
            });
            setRecordingNotes({
                [userAId]: call.recordingAReviewNote || "",
                [userBId]: call.recordingBReviewNote || ""
            });
            setQcResults({
                [userAId]: call.recordingAQCResult || null,
                [userBId]: call.recordingBQCResult || null
            });

            setDialogueLoading(true);
            try {
                const dData = await apiFetch(`/api/scripted-topics/call-dialogue/${call.callId}`);
                setDialogueData(dData);
            } catch (dErr) {
                console.error("Failed to load dialogue turns:", dErr);
            } finally {
                setDialogueLoading(false);
            }
        } catch (err) {
            await loadCalls();
            Swal.fire({
                icon: 'warning',
                title: 'Scripted Call Locked',
                text: err.message || 'This scripted call is currently locked for review by another QA reviewer.',
                confirmButtonColor: '#6366f1'
            });
        }
    }

    async function closeCallReview() {
        if (verseAudioRef.current) {
            verseAudioRef.current.pause();
        }
        if (reviewing?.callId) {
            try {
                await apiPostJson(`/api/admin/qa/calls/${reviewing.callId}/unlock`);
            } catch {}
        }
        setReviewing(null);
        setDialogueData(null);
        setPlayingVerseIndex(null);
        setLockExpired(false);
    }

    async function playVerseAudio(turnKey, audioUrl) {
        if (!audioUrl) {
            Swal.fire("Audio Missing", "No recording found for this verse.", "info");
            return;
        }

        try {
            let blobUrl = verseAudioBlobs[turnKey];
            if (!blobUrl) {
                setLoadingVerseAudio(turnKey);
                const fullUrl = audioUrl.startsWith("http") ? audioUrl : `${BACKEND_URL}${audioUrl}`;
                const audioBlob = await fetchDirectAudioBlob(fullUrl);
                blobUrl = URL.createObjectURL(audioBlob);
                setVerseAudioBlobs(prev => ({ ...prev, [turnKey]: blobUrl }));
            }
        } catch (err) {
            console.error("Verse audio load failed:", err);
            Swal.fire("Playback Failed", err.message || "Failed to load verse audio chunk", "error");
        } finally {
            setLoadingVerseAudio(null);
        }
    }

    function handleApproveVerse(submissionId, turnIndex) {
        if (!submissionId) {
            Swal.fire("Error", "Submission ID missing for this verse", "error");
            return;
        }
        if (dialogueData?.turns) {
            const updatedTurns = dialogueData.turns.map(t => {
                if (String(t.submissionId) === String(submissionId) && Number(t.turnIndex) === Number(turnIndex)) {
                    return { ...t, status: "approved", rejectionReason: null, reviewNote: null };
                }
                return t;
            });
            setDialogueData(prev => ({ ...prev, turns: updatedTurns }));
        }
    }

    async function handleRejectVerse(submissionId, turnIndex, speakerLabel) {
        if (!submissionId) {
            Swal.fire("Error", "Submission ID missing for this verse", "error");
            return;
        }

        const { value: formValues } = await Swal.fire({
            title: `Reject Verse (${speakerLabel})`,
            html: `
                <div class="space-y-3 text-left">
                    <p class="text-xs text-neutral-400">Select reason for re-recording:</p>
                    <select id="swal-reject-reason" class="w-full p-2.5 bg-neutral-900 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500">
                        <option value="Mispronunciation / Script Deviation">Mispronunciation / Script Deviation</option>
                        <option value="Background Noise / Distortion">Background Noise / Distortion</option>
                        <option value="Low Volume / Unclear Speech">Low Volume / Unclear Speech</option>
                        <option value="Unnatural Pace / Hesitation">Unnatural Pace / Hesitation</option>
                        <option value="Cut Off / Incomplete Verse">Cut Off / Incomplete Verse</option>
                        <option value="Custom">Custom</option>
                    </select>
                    <div id="swal-custom-container" style="display: none;" class="space-y-1.5 pt-1">
                        <label class="text-[11px] font-bold text-neutral-400 block">Enter Detailed Custom Reason / Note:</label>
                        <textarea id="swal-custom-note" rows="3" placeholder="Enter detailed note for contributor (e.g., Please pronounce 'technology' clearly without background noise)..." class="w-full p-2.5 bg-neutral-900 border border-amber-500/80 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none"></textarea>
                    </div>
                </div>
            `,
            didOpen: () => {
                const select = document.getElementById("swal-reject-reason");
                const customDiv = document.getElementById("swal-custom-container");
                select.addEventListener("change", (e) => {
                    if (e.target.value === "Custom") {
                        customDiv.style.display = "block";
                        document.getElementById("swal-custom-note")?.focus();
                    } else {
                        customDiv.style.display = "none";
                    }
                });
            },
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: "Set Re-record Flag",
            confirmButtonColor: "#ef4444",
            cancelButtonColor: "#525252",
            preConfirm: () => {
                const selectReason = document.getElementById("swal-reject-reason").value;
                if (selectReason === "Custom") {
                    const customNote = document.getElementById("swal-custom-note")?.value?.trim();
                    if (!customNote) {
                        Swal.showValidationMessage("Please enter your detailed custom rejection note!");
                        return false;
                    }
                    return { reason: "Custom", note: customNote };
                } else {
                    return { reason: selectReason, note: selectReason };
                }
            }
        });

        if (!formValues) return;

        if (dialogueData?.turns) {
            const updatedTurns = dialogueData.turns.map(t => {
                if (String(t.submissionId) === String(submissionId) && Number(t.turnIndex) === Number(turnIndex)) {
                    return {
                        ...t,
                        status: "rejected",
                        rejectionReason: formValues.reason,
                        reviewNote: formValues.note.trim()
                    };
                }
                return t;
            });
            setDialogueData(prev => ({ ...prev, turns: updatedTurns }));
        }
    }

    function handleApproveAllVerses() {
        if (!dialogueData?.turns) return;
        const updatedTurns = dialogueData.turns.map(t => ({
            ...t,
            status: "approved",
            rejectionReason: null,
            reviewNote: null
        }));
        setDialogueData(prev => ({ ...prev, turns: updatedTurns }));
    }

    const openTrimModal = (turn) => {
        setTrimmingTurn(turn);
        const fullDur = Number(turn.durationSec) || 5;
        setStartTrimSec(0);
        setEndTrimSec(fullDur);
        const baseAudioUrl = turn.audioUrl.startsWith("http") ? turn.audioUrl : `${BACKEND_URL}${turn.audioUrl}`;
        setTrimAudioUrl(`${baseAudioUrl}?t=${Date.now()}`);
        setShowTrimModal(true);
    };

    const handlePreviewTrim = () => {
        if (!trimAudioRef.current) return;
        const audio = trimAudioRef.current;
        audio.currentTime = startTrimSec;
        audio.play().catch(() => {});

        const checkStop = () => {
            if (audio.currentTime >= endTrimSec) {
                audio.pause();
                audio.removeEventListener("timeupdate", checkStop);
            }
        };
        audio.addEventListener("timeupdate", checkStop);
    };

    const handleSaveTrim = async () => {
        if (!trimmingTurn) return;
        if (endTrimSec <= startTrimSec) {
            Swal.fire({
                icon: "warning",
                title: "Invalid Trim Range",
                text: "End time must be greater than start time.",
                background: "#171717",
                color: "#ffffff"
            });
            return;
        }

        setTrimSaving(true);
        try {
            const res = await apiPostJson(`/api/admin/qa/scripted/submission/${trimmingTurn.submissionId}/turn/${trimmingTurn.turnIndex}/trim`, {
                startTrimSec: Number(startTrimSec),
                endTrimSec: Number(endTrimSec)
            });

            if (res && res.success) {
                const turnKey = `${trimmingTurn.speakerRole}_${trimmingTurn.turnIndex}`;
                // Clear cached blob so player refetches the new trimmed audio
                setVerseAudioBlobs(prev => {
                    const copy = { ...prev };
                    delete copy[turnKey];
                    return copy;
                });

                if (dialogueData?.turns) {
                    const updatedTurns = dialogueData.turns.map(t => {
                        if (String(t.submissionId) === String(trimmingTurn.submissionId) && Number(t.turnIndex) === Number(trimmingTurn.turnIndex)) {
                            return {
                                ...t,
                                durationSec: res.duration,
                                wasAudioTrimmed: true
                            };
                        }
                        return t;
                    });
                    setDialogueData(prev => ({ ...prev, turns: updatedTurns }));
                }

                setShowTrimModal(false);
                setTrimmingTurn(null);

                Swal.fire({
                    icon: "success",
                    title: "Audio Trimmed!",
                    text: `Turn audio trimmed to ${res.duration}s!`,
                    timer: 2000,
                    showConfirmButton: false,
                    background: "#171717",
                    color: "#ffffff"
                });
            }
        } catch (err) {
            console.error("Failed to trim turn audio:", err);
            Swal.fire({
                icon: "error",
                title: "Trim Failed",
                text: err.message || "Failed to trim turn audio.",
                background: "#171717",
                color: "#ffffff"
            });
        } finally {
            setTrimSaving(false);
        }
    };

    const handleRevertTrim = async (turn) => {
        const confirm = await Swal.fire({
            title: "Revert Audio Trim?",
            text: `Restore Turn ${turn.turnIndex + 1} to its original un-trimmed audio?`,
            icon: "question",
            showCancelButton: true,
            confirmButtonText: "Yes, Revert",
            confirmButtonColor: "#6366f1",
            cancelButtonColor: "#525252",
            background: "#171717",
            color: "#ffffff"
        });
        if (!confirm.isConfirmed) return;

        try {
            const res = await apiPostJson(`/api/admin/qa/scripted/submission/${turn.submissionId}/turn/${turn.turnIndex}/revert-trim`);
            if (res && res.success) {
                const turnKey = `${turn.speakerRole}_${turn.turnIndex}`;
                setVerseAudioBlobs(prev => {
                    const copy = { ...prev };
                    delete copy[turnKey];
                    return copy;
                });

                if (dialogueData?.turns) {
                    const updatedTurns = dialogueData.turns.map(t => {
                        if (String(t.submissionId) === String(turn.submissionId) && Number(t.turnIndex) === Number(turn.turnIndex)) {
                            return {
                                ...t,
                                durationSec: res.duration,
                                wasAudioTrimmed: false
                            };
                        }
                        return t;
                    });
                    setDialogueData(prev => ({ ...prev, turns: updatedTurns }));
                }

                Swal.fire({
                    icon: "success",
                    title: "Audio Restored!",
                    text: `Restored to ${res.duration}s.`,
                    timer: 2000,
                    showConfirmButton: false,
                    background: "#171717",
                    color: "#ffffff"
                });
            }
        } catch (err) {
            Swal.fire({
                icon: "error",
                title: "Revert Failed",
                text: err.message || "Failed to revert turn audio.",
                background: "#171717",
                color: "#ffffff"
            });
        }
    };

    async function handleSubmitFinalReview() {
        if (!reviewing || !dialogueData?.turns || dialogueData.turns.length === 0) return;

        const turns = dialogueData.turns;
        const pendingTurns = turns.filter(t => t.status !== "approved" && t.status !== "rejected");

        if (pendingTurns.length > 0) {
            const result = await Swal.fire({
                icon: "warning",
                title: "Unreviewed Verses Remaining",
                text: `There are ${pendingTurns.length} unreviewed verse(s). Would you like to approve all remaining verses and submit?`,
                showCancelButton: true,
                confirmButtonText: "Approve Remaining & Submit",
                confirmButtonColor: "#10b981",
                cancelButtonText: "Continue Reviewing",
                cancelButtonColor: "#525252"
            });

            if (!result.isConfirmed) return;

            // Mark remaining as approved
            turns.forEach(t => {
                if (t.status !== "approved" && t.status !== "rejected") {
                    t.status = "approved";
                    t.rejectionReason = null;
                    t.reviewNote = null;
                }
            });
        }

        const rejectedCount = turns.filter(t => t.status === "rejected").length;
        const approvedCount = turns.filter(t => t.status === "approved").length;

        const decisions = turns.map(t => ({
            submissionId: t.submissionId,
            turnIndex: t.turnIndex,
            status: t.status,
            rejectionReason: t.rejectionReason,
            reviewNote: t.reviewNote
        }));

        setActionLoading("submitting_review");
        try {
            const res = await apiPostJson(`/api/admin/qa/scripted/call/${reviewing.callId}/submit-review`, {
                decisions
            });

            await Swal.fire({
                icon: "success",
                title: res.allApproved ? "Scripted Call Approved!" : "QA Review Submitted",
                text: res.allApproved 
                    ? `All ${approvedCount} verses approved. Call status marked as Approved.`
                    : `Submitted successfully! ${rejectedCount} verse(s) flagged for contributor re-recording. Call remains in pending until completed.`,
                confirmButtonColor: "#6366f1"
            });

            await closeCallReview();
            await loadCalls();
        } catch (err) {
            console.error("Submit review failed:", err);
            Swal.fire("Submission Failed", err.message || "Failed to submit scripted review.", "error");
        } finally {
            setActionLoading(null);
        }
    }

    async function handleApproveSubmission(submissionId, speakerName) {
        if (!submissionId) return;
        const confirm = await Swal.fire({
            title: `Approve All Verses for ${speakerName}?`,
            text: "This will mark all verses recorded by this speaker as approved.",
            icon: "question",
            showCancelButton: true,
            confirmButtonText: "Yes, Approve All",
            confirmButtonColor: "#10b981"
        });
        if (!confirm.isConfirmed) return;

        setActionLoading(`sub_${submissionId}`);
        try {
            await apiPostJson(`/api/admin/qa/scripted/submission/${submissionId}/approve-all`);
            if (dialogueData?.turns) {
                const updatedTurns = dialogueData.turns.map(t => {
                    if (String(t.submissionId) === String(submissionId)) {
                        return { ...t, status: "approved", rejectionReason: null };
                    }
                    return t;
                });
                setDialogueData(prev => ({ ...prev, turns: updatedTurns }));
            }
            Swal.fire("Approved", `All verses for ${speakerName} have been approved.`, "success");
            await loadCalls();
        } catch (err) {
            Swal.fire("Action Failed", err.message || "Failed to approve verses", "error");
        } finally {
            setActionLoading(null);
        }
    }

    async function handleApproveEntireCall(callId) {
        const confirm = await Swal.fire({
            title: "Approve Entire Scripted Dialogue?",
            text: "This will approve all verses for both Speaker 1 and Speaker 2, completing the QA audit for this scripted call.",
            icon: "success",
            showCancelButton: true,
            confirmButtonText: "Yes, Approve Entire Dialogue",
            confirmButtonColor: "#10b981"
        });
        if (!confirm.isConfirmed) return;

        setActionLoading("call_all");
        try {
            await apiPostJson(`/api/admin/qa/scripted/call/${callId}/approve-all`);
            if (dialogueData?.turns) {
                const updatedTurns = dialogueData.turns.map(t => ({
                    ...t,
                    status: "approved",
                    rejectionReason: null
                }));
                setDialogueData(prev => ({ ...prev, turns: updatedTurns }));
            }
            setReviewing(prev => ({
                ...prev,
                callStatus: "approved",
                recordingAStatus: "approved",
                recordingBStatus: "approved"
            }));
            Swal.fire("Success", "Entire scripted dialogue approved!", "success");
            await loadCalls();
        } catch (err) {
            Swal.fire("Action Failed", err.message || "Failed to approve dialogue", "error");
        } finally {
            setActionLoading(null);
        }
    }

    async function playAudio(callId, targetSpeaker) {
        const key = `${callId}_${targetSpeaker}`;
        if (audioUrls[key]) {
            const el = audioRefs.current[key];
            if (el) {
                if (el.paused) el.play().catch(() => {});
                else el.pause();
            }
            return;
        }

        setLoadingAudio(key);
        try {
            const url = `${BACKEND_URL}/api/admin/qa/calls/${callId}/recording/${targetSpeaker}`;
            const audioBlob = await fetchDirectAudioBlob(url);
            const blobUrl = URL.createObjectURL(audioBlob);
            setAudioUrls(prev => ({ ...prev, [key]: blobUrl }));
            setTimeout(() => {
                const el = audioRefs.current[key];
                if (el) el.play().catch(() => {});
            }, 100);
        } catch (err) {
            Swal.fire('Playback Error', err.message || 'Failed to load audio', 'error');
        } finally {
            setLoadingAudio(null);
        }
    }

    const toggleReason = (userId, reason) => {
        setRejectionReasons(prev => {
            const userReasons = prev[userId] || [];
            const exists = userReasons.includes(reason);
            const updated = exists ? userReasons.filter(r => r !== reason) : [...userReasons, reason];
            return { ...prev, [userId]: updated };
        });
    };

    const getSelectedReasons = (userId) => {
        return rejectionReasons[userId] || [];
    };

    async function runAudioQC(callId, userId) {
        setQcLoading(prev => ({ ...prev, [userId]: true }));
        setQcErrors(prev => ({ ...prev, [userId]: null }));
        try {
            const res = await apiFetch(`/api/admin/qa/calls/${callId}/analyze/${userId}`, { method: "POST" });
            if (res.qc) {
                setQcResults(prev => ({ ...prev, [userId]: res.qc }));
            }
        } catch (err) {
            setQcErrors(prev => ({ ...prev, [userId]: err.message || 'QC analysis failed' }));
        } finally {
            setQcLoading(prev => ({ ...prev, [userId]: false }));
        }
    }

    async function actOnRecording(callId, userId, action) {
        if (lockExpired) {
            Swal.fire({
                icon: 'error',
                title: '15-Min Lock Expired',
                text: 'Your 15-minute review window for this call has expired. Please close and re-open the call from the queue to lock it again.',
                confirmButtonColor: '#6366f1'
            });
            return;
        }

        const selectedReasons = getSelectedReasons(userId);
        if (action === 'reject' && selectedReasons.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Rejection Reason Required',
                text: 'Please select at least one rejection reason (e.g. Off-Topic, Noisy, or Script Deviation) before rejecting.',
                confirmButtonColor: '#6366f1'
            });
            return;
        }

        const result = await Swal.fire({
            title: action === 'approve' ? 'Approve Speaker Recording?' : 'Reject Speaker Recording?',
            text: `Are you sure you want to ${action} this speaker's recording?`,
            icon: action === 'approve' ? 'question' : 'warning',
            showCancelButton: true,
            confirmButtonColor: action === 'approve' ? '#10b981' : '#ef4444',
            cancelButtonColor: '#404040',
            confirmButtonText: action === 'approve' ? 'Yes, approve' : 'Yes, reject'
        });

        if (!result.isConfirmed) return;

        setActionLoading(`${action}_${userId}`);
        const note = recordingNotes[userId] || "";
        const isNoisy = selectedReasons.includes("Noisy");

        try {
            const data = await apiPatch(`/api/admin/qa/calls/${callId}/${action}/${userId}`, {
                note: note.trim(),
                isNoisy,
                rejectionReason: action === 'reject' ? selectedReasons.join(", ") : null
            });

            if (data.call) {
                setReviewing(prev => ({ ...prev, ...data.call }));
            }
            await loadCalls();

            Swal.fire({
                icon: 'success',
                title: `Recording ${action === 'approve' ? 'Approved' : 'Rejected'}`,
                timer: 1200,
                showConfirmButton: false
            });
        } catch (err) {
            Swal.fire('Action Failed', err.message, 'error');
        } finally {
            setActionLoading(null);
        }
    }

    return (
        <div className="min-h-screen bg-neutral-900 text-white flex">
            <AdminNav />
            <div className="flex-1 md:ml-64 p-6 min-w-0">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-neutral-800">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <div className="p-2 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-md shadow-primary-500/20">
                                <Radio className="w-5 h-5" />
                            </div>
                            <h1 className="text-2xl font-bold">Scripted Calls Review</h1>
                            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary-900/60 text-primary-300 border border-primary-700/50">
                                QA & Audio Audit
                            </span>
                        </div>
                        <p className="text-sm text-neutral-400">
                            Audit dual-speaker scripted conversations with per-speaker approval controls and full stereo monitoring.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={loadCalls}
                            disabled={loadingCalls}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-semibold transition-all disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${loadingCalls ? 'animate-spin' : ''}`} />
                            <span>Refresh</span>
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="mt-6 flex flex-wrap items-center gap-3">
                    <div className="flex bg-neutral-800/80 p-1 rounded-xl border border-neutral-700/60">
                        {["pending", "approved", "rejected", ""].map((st) => (
                            <button
                                key={st}
                                onClick={() => { setStatusFilter(st); setPage(1); }}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${statusFilter === st ? "bg-primary-600 text-white shadow-sm" : "text-neutral-400 hover:text-white"}`}
                            >
                                {st || "All Calls"}
                            </button>
                        ))}
                    </div>

                    {availableLanguagesList.length > 0 && (
                        <select
                            value={languageFilter}
                            onChange={(e) => { setLanguageFilter(e.target.value); setPage(1); }}
                            className="bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-primary-500 capitalize"
                        >
                            <option value="">All Languages</option>
                            {availableLanguagesList.map(lang => (
                                <option key={lang} value={lang} className="capitalize">{lang}</option>
                            ))}
                        </select>
                    )}
                </div>

                {error && (
                    <div className="mt-4 p-4 rounded-xl bg-rose-900/30 border border-rose-700/50 text-rose-300 text-sm flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Batch Selection Action Bar */}
                {selectedCallIds.length > 0 && (
                    <div className="mt-4 p-3.5 bg-indigo-950/80 border border-indigo-700/60 rounded-xl flex flex-wrap items-center justify-between gap-3 animate-fade-in shadow-lg">
                        <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                            <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                            <span>{selectedCallIds.length} scripted call{selectedCallIds.length > 1 ? "s" : ""} selected</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleDownloadSelected}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                            >
                                <Download className="w-4 h-4" />
                                <span>Download Selected ZIP ({selectedCallIds.length})</span>
                            </button>
                            <button
                                onClick={() => setSelectedCallIds([])}
                                className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                            >
                                Clear Selection
                            </button>
                        </div>
                    </div>
                )}

                {/* Call Table */}
                <div className="mt-6 bg-neutral-800/60 border border-neutral-700/60 rounded-2xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-neutral-800/90 text-neutral-400 uppercase font-semibold border-b border-neutral-700/80">
                                <tr>
                                    <th className="py-3.5 px-4 w-10">
                                        <input
                                            type="checkbox"
                                            checked={calls.length > 0 && calls.every(c => selectedCallIds.includes(c.callId))}
                                            onChange={toggleSelectAll}
                                            className="w-4 h-4 rounded bg-neutral-900 border-neutral-700 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                            title="Select / Deselect all on this page"
                                        />
                                    </th>
                                    <th className="py-3.5 px-4">Call ID & Scenario</th>
                                    <th className="py-3.5 px-4">Speaker A (Host)</th>
                                    <th className="py-3.5 px-4">Speaker B (Guest)</th>
                                    <th className="py-3.5 px-4">Language</th>
                                    <th className="py-3.5 px-4">Duration</th>
                                    <th className="py-3.5 px-4">Status</th>
                                    <th className="py-3.5 px-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-750">
                                {loadingCalls ? (
                                    <tr>
                                        <td colSpan="8" className="py-12 text-center text-neutral-400">
                                            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                                            <span>Loading scripted calls...</span>
                                        </td>
                                    </tr>
                                ) : calls.length === 0 ? (
                                    <tr>
                                        <td colSpan="8" className="py-12 text-center text-neutral-400">
                                            <Radio className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
                                            <span>No scripted calls found in this category.</span>
                                        </td>
                                    </tr>
                                ) : (
                                    calls.map((call) => (
                                        <tr 
                                            key={call.callId} 
                                            className={`hover:bg-neutral-750/40 transition-colors ${selectedCallIds.includes(call.callId) ? "bg-primary-950/20" : ""}`}
                                        >
                                            <td className="py-4 px-4 w-10">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedCallIds.includes(call.callId)}
                                                    onChange={() => toggleSelectCall(call.callId)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-4 h-4 rounded bg-neutral-900 border-neutral-700 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                                />
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="font-mono text-[11px] text-primary-400 font-semibold mb-0.5">
                                                    {call.callId}
                                                </div>
                                                <div className="text-white font-medium text-xs">
                                                    {call.subtopicId?.title || "Scripted Scenario"}
                                                </div>
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="text-white font-semibold mb-1">
                                                    {call.userA?.firstname || "Speaker A"} {call.userA?.lastname || ""}
                                                </div>
                                                <StatusBadge status={call.recordingAStatus} />
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="text-white font-semibold mb-1">
                                                    {call.userB?.firstname || "Speaker B"} {call.userB?.lastname || ""}
                                                </div>
                                                <StatusBadge status={call.recordingBStatus} />
                                            </td>
                                            <td className="py-4 px-4">
                                                <span className="capitalize font-bold text-neutral-300">
                                                    {call.language || "English"}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4 font-mono text-neutral-300">
                                                {call.actualCallDuration ? `${call.actualCallDuration}s` : `${call.recordingADurationMinutes || 0} min`}
                                            </td>
                                            <td className="py-4 px-4">
                                                <StatusBadge status={call.callStatus} />
                                            </td>
                                            <td className="py-4 px-4 text-right">
                                                <button
                                                    onClick={() => openCallReview(call)}
                                                    className="px-3.5 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 font-bold text-xs text-white shadow-md transition-all flex items-center gap-1 ml-auto"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                    <span>Review</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {callPages > 1 && (
                        <div className="p-4 border-t border-neutral-750 flex items-center justify-between text-xs text-neutral-400">
                            <span>Total {callTotal} scripted calls</span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40"
                                >
                                    Prev
                                </button>
                                <span>Page {page} of {callPages}</span>
                                <button
                                    onClick={() => setPage(p => Math.min(callPages, p + 1))}
                                    disabled={page === callPages}
                                    className="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Review Modal */}
                {reviewing && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={closeCallReview}>
                        <div className="bg-neutral-850 border border-neutral-700/80 rounded-2xl w-full max-w-5xl my-8 overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                            {/* Modal Header */}
                            <div className="p-5 border-b border-neutral-750 flex items-center justify-between bg-neutral-800/80">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-lg font-bold text-white">
                                            {reviewing.subtopicId?.title || "Scripted Conversation Audit"}
                                        </h2>
                                        <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-neutral-700 text-neutral-300">
                                            {reviewing.callId}
                                        </span>
                                    </div>
                                    <p className="text-xs text-neutral-400 mt-1">
                                        Language: <span className="text-primary-400 font-bold capitalize">{reviewing.language || "English"}</span> • 
                                        Lock Timer: <span className="text-amber-400 font-mono font-bold">{Math.floor(lockTimerSeconds / 60)}:{(lockTimerSeconds % 60).toString().padStart(2, '0')}</span>
                                    </p>
                                </div>
                                <button
                                    onClick={closeCallReview}
                                    className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div className="p-6 overflow-y-auto space-y-6">
                                {/* Top Control Bar & Full Stereo Audio */}
                                <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 via-neutral-800 to-indigo-950/40 border border-neutral-700/80 space-y-4">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <Sparkles className="w-4 h-4 text-emerald-400" />
                                            <div>
                                                <span className="text-xs font-bold text-white uppercase tracking-wider block">
                                                    Full Stitched Conversation (Dual-Channel Stereo)
                                                </span>
                                                <span className="text-[11px] text-neutral-400">
                                                    Left Channel: Speaker 1 (Host) • Right Channel: Speaker 2 (Guest)
                                                </span>
                                            </div>
                                        </div>

                                        {/* Global Bulk Actions */}
                                        <div className="flex items-center flex-wrap gap-2">
                                            {dialogueData?.s1Submission?._id && (
                                                <button
                                                    onClick={() => handleApproveSubmission(dialogueData.s1Submission._id, "Speaker 1")}
                                                    disabled={actionLoading === `sub_${dialogueData.s1Submission._id}`}
                                                    className="px-3 py-1.5 rounded-lg bg-primary-700/80 hover:bg-primary-600 border border-primary-500/50 text-white font-semibold text-xs transition-all disabled:opacity-50 flex items-center gap-1.5"
                                                >
                                                    <Check className="w-3.5 h-3.5" />
                                                    <span>Approve All S1 Verses</span>
                                                </button>
                                            )}
                                            {dialogueData?.s2Submission?._id && (
                                                <button
                                                    onClick={() => handleApproveSubmission(dialogueData.s2Submission._id, "Speaker 2")}
                                                    disabled={actionLoading === `sub_${dialogueData.s2Submission._id}`}
                                                    className="px-3 py-1.5 rounded-lg bg-indigo-700/80 hover:bg-indigo-600 border border-indigo-500/50 text-white font-semibold text-xs transition-all disabled:opacity-50 flex items-center gap-1.5"
                                                >
                                                    <Check className="w-3.5 h-3.5" />
                                                    <span>Approve All S2 Verses</span>
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleApproveEntireCall(reviewing.callId)}
                                                disabled={actionLoading === "call_all"}
                                                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-bold text-xs text-white shadow-md transition-all disabled:opacity-50 flex items-center gap-1.5"
                                            >
                                                <Check className="w-4 h-4" />
                                                <span>Approve Entire Dialogue</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Stereo Player */}
                                    <div className="flex items-center gap-2 pt-1">
                                        <button
                                            onClick={() => playAudio(reviewing.callId, "stereo")}
                                            disabled={loadingAudio === `${reviewing.callId}_stereo`}
                                            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-neutral-750 hover:bg-neutral-700 font-semibold text-xs text-neutral-200 border border-neutral-600 transition-all disabled:opacity-50"
                                        >
                                            {loadingAudio === `${reviewing.callId}_stereo` ? (
                                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <>
                                                    <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
                                                    <span>Play Full Merged Conversation</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    {audioUrls[`${reviewing.callId}_stereo`] && (
                                        <audio
                                            ref={el => audioRefs.current[`${reviewing.callId}_stereo`] = el}
                                            src={audioUrls[`${reviewing.callId}_stereo`]}
                                            controls
                                            className="w-full h-8 mt-1"
                                        />
                                    )}
                                </div>

                                {/* Phrase-by-Phrase / Verse-by-Verse Review Stream */}
                                <div className="space-y-4">
                                    {(() => {
                                        const turns = dialogueData?.turns || [];
                                        const approvedCount = turns.filter(t => t.status === "approved").length;
                                        const rejectedCount = turns.filter(t => t.status === "rejected").length;
                                        const pendingCount = turns.filter(t => t.status !== "approved" && t.status !== "rejected").length;

                                        return (
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-750">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <Radio className="w-4 h-4 text-primary-400" />
                                                        <h3 className="text-sm font-bold text-white">
                                                            Phrase-by-Phrase Script Audit
                                                        </h3>
                                                    </div>
                                                    <p className="text-xs text-neutral-400 mt-0.5">
                                                        Review dialogue chunk by chunk in sequence. Once all verses are decided, submit the final review below.
                                                    </p>
                                                </div>

                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <div className="flex items-center gap-1.5 text-xs font-bold">
                                                        <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/50">
                                                            {approvedCount} Approved
                                                        </span>
                                                        {rejectedCount > 0 && (
                                                            <span className="px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-700/50">
                                                                {rejectedCount} Re-record
                                                            </span>
                                                        )}
                                                        {pendingCount > 0 && (
                                                            <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-700/50">
                                                                {pendingCount} Pending
                                                            </span>
                                                        )}
                                                    </div>

                                                    {turns.length > 0 && (
                                                        <button
                                                            onClick={handleApproveAllVerses}
                                                            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-all cursor-pointer shadow-sm"
                                                        >
                                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                                            <span>Approve All Verses</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {dialogueLoading ? (
                                        <div className="py-12 flex flex-col items-center justify-center gap-2 text-neutral-400">
                                            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                                            <span className="text-xs">Loading dialogue turns & individual verse audio...</span>
                                        </div>
                                    ) : !dialogueData?.turns || dialogueData.turns.length === 0 ? (
                                        <div className="py-8 text-center text-xs text-neutral-400 bg-neutral-800/40 rounded-xl border border-neutral-800">
                                            No dialogue verses found for this scripted conversation.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {dialogueData.turns.map((turn, idx) => {
                                                const isS1 = turn.speakerRole === "speaker1";
                                                const turnKey = `${turn.speakerRole}_${turn.turnIndex}`;
                                                const isPlaying = playingVerseIndex === turnKey;
                                                const isLoading = loadingVerseAudio === turnKey;
                                                const submissionId = turn.submissionId;

                                                return (
                                                    <div
                                                        key={idx}
                                                        className={`p-4 rounded-xl border transition-all ${
                                                            turn.status === "approved"
                                                                ? "bg-emerald-950/20 border-emerald-800/40"
                                                                : turn.status === "rejected"
                                                                ? "bg-rose-950/25 border-rose-800/50"
                                                                : "bg-neutral-800/80 border-neutral-700/80"
                                                        }`}
                                                    >
                                                        {/* Verse Header */}
                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-neutral-700/40">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-neutral-900 text-neutral-300 border border-neutral-700">
                                                                    Turn {idx + 1}
                                                                </span>
                                                                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                                                                    isS1 
                                                                        ? "bg-primary-900/60 text-primary-300 border border-primary-700/50" 
                                                                        : "bg-indigo-900/60 text-indigo-300 border border-indigo-700/50"
                                                                }`}>
                                                                    {turn.speakerLabel}
                                                                </span>
                                                                <span className="text-xs font-semibold text-neutral-300">
                                                                    {turn.speakerUser?.name || "Contributor"}
                                                                </span>
                                                                {turn.speakerUser?.speaker_id && (
                                                                    <span className="text-[10px] font-mono text-neutral-400">
                                                                        ({turn.speakerUser.speaker_id})
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Status Badge */}
                                                            <div>
                                                                {turn.status === "approved" ? (
                                                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-600/50">
                                                                        <Check className="w-3 h-3" />
                                                                        <span>Marked Approved</span>
                                                                    </span>
                                                                ) : turn.status === "rejected" ? (
                                                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-900/60 text-rose-300 border border-rose-600/50">
                                                                        <X className="w-3 h-3" />
                                                                        <span>Marked Re-record</span>
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-900/60 text-amber-300 border border-amber-600/50">
                                                                        <Clock className="w-3 h-3" />
                                                                        <span>Unreviewed</span>
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Verse Content & Player */}
                                                        <div className="py-3 space-y-2.5">
                                                            {/* Script Text */}
                                                            <div className="text-sm font-medium text-white leading-relaxed bg-neutral-900/60 p-3 rounded-lg border border-neutral-750">
                                                                "{turn.text}"
                                                            </div>

                                                            {/* Reviewer Note / Rejection Reason if flagged */}
                                                            {turn.status === "rejected" && (
                                                                <div className="p-2.5 rounded-lg bg-rose-900/30 border border-rose-700/50 text-xs space-y-1">
                                                                    <div className="font-bold text-rose-300 flex items-center gap-1">
                                                                        <span>⚠️ Rejection Reason:</span>
                                                                        <span className="text-rose-200 font-normal">{turn.rejectionReason || "Needs re-recording"}</span>
                                                                    </div>
                                                                    {turn.reviewNote && (
                                                                        <div className="text-neutral-300 text-[11px]">
                                                                            <span className="font-semibold text-rose-400">Reviewer Note: </span>
                                                                            "{turn.reviewNote}"
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* Audio Controls & Actions */}
                                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-neutral-700/40">
                                                                {/* Audio Player with Native Browser Forward/Backward Controls */}
                                                                <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-3">
                                                                    {verseAudioBlobs[turnKey] ? (
                                                                        <div className="flex items-center gap-2 w-full max-w-md">
                                                                            <audio
                                                                                src={verseAudioBlobs[turnKey]}
                                                                                controls
                                                                                autoPlay
                                                                                className="w-full h-8 rounded-lg bg-neutral-900 border border-neutral-700"
                                                                            />
                                                                        </div>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => playVerseAudio(turnKey, turn.audioUrl)}
                                                                            disabled={isLoading}
                                                                            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-bold text-xs shadow-md transition-all cursor-pointer ${
                                                                                isS1
                                                                                    ? "bg-primary-600 hover:bg-primary-500 text-white"
                                                                                    : "bg-indigo-600 hover:bg-indigo-500 text-white"
                                                                            }`}
                                                                        >
                                                                            {isLoading ? (
                                                                                <>
                                                                                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                                                    <span>Loading Player...</span>
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <Play className="w-3.5 h-3.5 fill-white" />
                                                                                    <span>Play Chunk ({turn.durationSec ? `${turn.durationSec.toFixed(1)}s` : 'Audio'})</span>
                                                                                </>
                                                                            )}
                                                                        </button>
                                                                    )}

                                                                </div>

                                                                {/* Granular Approve & Reject Buttons */}
                                                                <div className="flex items-center gap-2 shrink-0">
                                                                    <button
                                                                        onClick={() => handleApproveVerse(submissionId, turn.turnIndex)}
                                                                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold text-xs shadow transition-all cursor-pointer ${
                                                                            turn.status === "approved"
                                                                                ? "bg-emerald-600 text-white ring-2 ring-emerald-400"
                                                                                : "bg-neutral-700 hover:bg-emerald-600 text-neutral-200 hover:text-white"
                                                                        }`}
                                                                    >
                                                                        <Check className="w-3.5 h-3.5" />
                                                                        <span>Approve</span>
                                                                    </button>

                                                                    <button
                                                                        onClick={() => handleRejectVerse(submissionId, turn.turnIndex, turn.speakerLabel)}
                                                                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold text-xs shadow transition-all cursor-pointer ${
                                                                            turn.status === "rejected"
                                                                                ? "bg-rose-600 text-white ring-2 ring-rose-400"
                                                                                : "bg-neutral-700 hover:bg-rose-600 text-neutral-200 hover:text-white"
                                                                        }`}
                                                                    >
                                                                        <X className="w-3.5 h-3.5" />
                                                                        <span>Reject / Re-record</span>
                                                                    </button>

                                                                    <button
                                                                        onClick={() => openTrimModal(turn)}
                                                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold text-xs bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/40 shadow transition-all cursor-pointer hover:text-white"
                                                                        title="Trim Silence / Audio for this Turn"
                                                                    >
                                                                        <Scissors className="w-3.5 h-3.5" />
                                                                        <span>Trim</span>
                                                                    </button>

                                                                    {turn.wasAudioTrimmed && (
                                                                        <button
                                                                            onClick={() => handleRevertTrim(turn)}
                                                                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-600 shadow transition-all cursor-pointer"
                                                                            title="Revert to Original Untrimmed Audio"
                                                                        >
                                                                            <RotateCcw className="w-3.5 h-3.5" />
                                                                            <span>Revert</span>
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Modal Footer with Review Summary & Submit Button */}
                            {(() => {
                                const turns = dialogueData?.turns || [];
                                const approvedCount = turns.filter(t => t.status === "approved").length;
                                const rejectedCount = turns.filter(t => t.status === "rejected").length;
                                const pendingCount = turns.filter(t => t.status !== "approved" && t.status !== "rejected").length;
                                const isSubmitting = actionLoading === "submitting_review";

                                return (
                                    <div className="p-4 border-t border-neutral-750 bg-neutral-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky bottom-0 z-10">
                                        <div className="flex items-center gap-2 text-xs">
                                            {pendingCount > 0 ? (
                                                <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                                                    <Clock className="w-4 h-4" />
                                                    <span>{pendingCount} of {turns.length} verses unreviewed</span>
                                                </div>
                                            ) : rejectedCount > 0 ? (
                                                <div className="flex items-center gap-1.5 text-rose-400 font-bold">
                                                    <AlertCircle className="w-4 h-4" />
                                                    <span>{rejectedCount} re-record request(s), {approvedCount} approved</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                                                    <CheckCircle2 className="w-4 h-4" />
                                                    <span>All {turns.length} verses marked approved</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-3 justify-end">
                                            <button
                                                onClick={closeCallReview}
                                                disabled={isSubmitting}
                                                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-neutral-300 transition-colors cursor-pointer"
                                            >
                                                Cancel
                                            </button>

                                            <button
                                                onClick={handleSubmitFinalReview}
                                                disabled={isSubmitting || turns.length === 0}
                                                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all cursor-pointer ${
                                                    rejectedCount > 0
                                                        ? "bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white"
                                                        : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30"
                                                }`}
                                            >
                                                {isSubmitting ? (
                                                    <>
                                                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                        <span>Submitting Decisions...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <CheckCircle2 className="w-4 h-4" />
                                                        <span>
                                                            {rejectedCount > 0
                                                                ? `Submit Decision (${rejectedCount} Re-records)`
                                                                : `Submit & Approve Call (${approvedCount}/${turns.length})`}
                                                        </span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {/* Trim Audio Modal for Scripted Speaker Turns */}
                {showTrimModal && trimmingTurn && (
                    <div 
                        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                        onClick={() => { setShowTrimModal(false); setTrimmingTurn(null); }}
                    >
                        <div 
                            className="bg-neutral-900 border border-neutral-700/80 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative text-left text-white animate-in fade-in zoom-in-95 duration-150"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between border-b border-neutral-800 pb-4 mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="bg-purple-500/10 text-purple-400 p-2.5 rounded-xl border border-purple-500/20 text-lg">
                                        ✂️
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg text-white">Trim Speaker Turn Silence</h3>
                                        <p className="text-xs text-neutral-400 font-mono">Turn {trimmingTurn.turnIndex + 1} • {trimmingTurn.speakerLabel}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => { setShowTrimModal(false); setTrimmingTurn(null); }}
                                    className="p-2 text-neutral-400 hover:text-white rounded-lg transition-colors"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 mb-6">
                                <p className="text-sm font-medium text-neutral-300 italic mb-2">"{trimmingTurn.text}"</p>
                                <div className="flex items-center justify-between text-xs text-neutral-400 font-mono">
                                    <span>Original Duration: <b>{trimmingTurn.durationSec ? `${Number(trimmingTurn.durationSec).toFixed(2)}s` : "Unknown"}</b></span>
                                    <span>Trimmed Duration: <b className="text-emerald-400">{(Math.max(0, endTrimSec - startTrimSec)).toFixed(2)}s</b></span>
                                </div>
                            </div>

                            {/* Visual Audio Waveform Canvas with Draggable Handles */}
                            <div className="mb-4">
                                <InteractiveWaveformTrimmer
                                    audioUrl={trimAudioUrl}
                                    duration={Number(trimmingTurn.durationSec) || 5}
                                    startTrimSec={startTrimSec}
                                    endTrimSec={endTrimSec}
                                    onTrimChange={(newStart, newEnd) => {
                                        setStartTrimSec(newStart);
                                        setEndTrimSec(newEnd);
                                    }}
                                />
                            </div>

                            {/* Hidden audio element for preview */}
                            {trimAudioUrl && (
                                <audio ref={trimAudioRef} src={trimAudioUrl} className="hidden" preload="metadata" />
                            )}

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
                                        max={Number(trimmingTurn.durationSec) || 100}
                                        value={endTrimSec}
                                        onChange={(e) => {
                                            const val = parseFloat(e.target.value) || (startTrimSec + 0.1);
                                            setEndTrimSec(Math.min(Number(trimmingTurn.durationSec) || 100, Math.max(val, startTrimSec + 0.1)));
                                        }}
                                        className="w-full bg-neutral-950 border border-neutral-800 text-rose-400 font-mono font-bold text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-rose-500"
                                    />
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => { setShowTrimModal(false); setTrimmingTurn(null); }}
                                    className="py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-bold transition-colors"
                                >
                                    Cancel
                                </button>

                                <button
                                    type="button"
                                    onClick={handlePreviewTrim}
                                    className="py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                                >
                                    <Play className="w-3.5 h-3.5 fill-amber-400" />
                                    <span>Preview Range</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={handleSaveTrim}
                                    disabled={trimSaving}
                                    className="flex-1 py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-md shadow-purple-600/20 active:scale-95 cursor-pointer"
                                >
                                    {trimSaving ? "Trimming..." : "✂️ Save Trim"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
