import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPostJson } from "../lib/api.js";
import AdminNav from "../components/AdminNav.jsx";
import AudioVisualizer from "../components/AudioVisualizer.jsx";
import { fetchAndConvertToWav } from "../lib/audioToWav.js";
import { getUserInfo } from "../lib/auth.js";
import { createStoredZip } from "../lib/zipStore.js";
import Swal from "sweetalert2";


const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

// Helper for PATCH requests with credentials
async function apiPatchJson(path, data = {}) {
    const res = await fetch(`${BACKEND_URL}${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
    });

    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `HTTP ${res.status}`);
    }

    return res.json();
}

function mergeReviewFields(call, updatedCall) {
    if (!call || !updatedCall) return call;
    return {
        ...call,
        callStatus: updatedCall.callStatus,
        recordingAStatus: updatedCall.recordingAStatus,
        recordingAReviewNote: updatedCall.recordingAReviewNote,
        recordingADurationMinutes: updatedCall.recordingADurationMinutes,
        recordingAPayoutUsd: updatedCall.recordingAPayoutUsd,
        recordingBStatus: updatedCall.recordingBStatus,
        recordingBReviewNote: updatedCall.recordingBReviewNote,
        recordingBDurationMinutes: updatedCall.recordingBDurationMinutes,
        recordingBPayoutUsd: updatedCall.recordingBPayoutUsd,
        reviewedBy: updatedCall.reviewedBy,
        reviewedAt: updatedCall.reviewedAt,
        reviewNotes: updatedCall.reviewNotes,
    };
}

export default function AdminCalls() {
    const userInfo = getUserInfo();
    const navigate = useNavigate();
    const [calls, setCalls] = useState([]);
    const [statusFilter, setStatusFilter] = useState("");
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selectedCall, setSelectedCall] = useState(null);
    const [recordingNotes, setRecordingNotes] = useState({});
    const [downloadingUser, setDownloadingUser] = useState(null);
    const [downloadingCallId, setDownloadingCallId] = useState(null);
    const [downloadStep, setDownloadStep] = useState("");
    const [isBulkDownloading, setIsBulkDownloading] = useState(false);
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, label: "" });
    const [qcLoading, setQcLoading] = useState({});
    const [qcResults, setQcResults] = useState({});
    const [qcErrors, setQcErrors] = useState({});
    const [zoomedImage, setZoomedImage] = useState(null);
    const [audioUrls, setAudioUrls] = useState({});
    const [loadingAudio, setLoadingAudio] = useState({});
    const audioRefs = useRef({});

    useEffect(() => {
        loadCalls();
    }, [pagination.page, statusFilter]);

    async function loadCalls() {
        try {
            setLoading(true);
            const statusParam = statusFilter ? `&status=${statusFilter}` : "";
            const data = await apiGet(`/api/admin/calls?page=${pagination.page}&limit=${pagination.limit}${statusParam}`);
            setCalls(data.calls);
            setPagination(data.pagination);
        } catch (e) {
            setError(e.message);
            if (e.message.includes("Forbidden") || e.message.includes("Unauthorized")) {
                navigate("/login");
            }
        } finally {
            setLoading(false);
        }
    }

    async function downloadRecording(callId, userId, username, recordingFile) {
        if (downloadingUser === userId) return;
        setDownloadingUser(userId);
        try {
            const recordingUrl = `${BACKEND_URL}/api/admin/calls/${callId}/recording/${userId}`;
            const isWav = typeof recordingFile === "string" && recordingFile.toLowerCase().endsWith(".wav");

            let blob;
            let downloadName;

            if (isWav) {
                // Already WAV — fetch and download directly without conversion
                const res = await fetch(recordingUrl, { credentials: "include" });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                blob = await res.blob();
                downloadName = `recording_${username}_${callId}.wav`;
            } else {
                // WebM / OGG / other — decode with Web Audio API and convert to WAV
                blob = await fetchAndConvertToWav(recordingUrl);
                downloadName = `recording_${username}_${callId}.wav`;
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = downloadName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            alert("Failed to download: " + e.message);
        } finally {
            setDownloadingUser(null);
        }
    }

    function metadataForSpeaker(call, speakerLabel, user, duration) {
        const age = user?.dob ? new Date().getFullYear() - new Date(user.dob).getFullYear() : "";
        const speakerId = user?.speaker_id || "";
        const audioPath = speakerId ? `audio/${speakerId}-${call.callId}.wav` : "";
        const data = [
            ["speaker_id", speakerId],
            ["age", age],
            ["gender", user?.gender || ""],
            ["region", user?.address?.state || ""],
            ["accent", user?.locality || ""],
            ["dialect", user?.regionalLanguage || ""],
            ["topic_of_conversation", call.topicId?.title || ""],
            ["subtopic", call.subtopicId?.title || ""],
            ["description", call.subtopicId?.description || ""],
            ["duration_minutes", duration ?? ""],
            ["path", audioPath],
        ];
        return data.map(([key, value]) => `"${key}","${String(value ?? "").replace(/"/g, '""')}"`).join("\n");
    }

    function calcSpeakerDuration(call, isSpeakerA) {
        if (call.actualCallDuration && Number(call.actualCallDuration) > 0) {
            return (Number(call.actualCallDuration) / 60).toFixed(2);
        }
        const minVal = isSpeakerA ? call.recordingADurationMinutes : call.recordingBDurationMinutes;
        if (minVal && Number(minVal) > 0) return Number(minVal).toFixed(2);
        const start = isSpeakerA ? call.recordingAStartedAt : call.recordingBStartedAt;
        const startedAt = start || call.actualCallStartedAt || call.startedAt;
        if (startedAt && call.endedAt) {
            const diffMs = new Date(call.endedAt).getTime() - new Date(startedAt).getTime();
            if (Number.isFinite(diffMs) && diffMs > 0) {
                return (diffMs / 60000).toFixed(2);
            }
        }
        return "0.00";
    }

    async function fetchRecordingBlob(callId, userId, recordingFile) {
        const recordingUrl = `${BACKEND_URL}/api/admin/calls/${callId}/recording/${userId}`;
        const isWav = typeof recordingFile === "string" && recordingFile.toLowerCase().endsWith(".wav");
        if (isWav) {
            const res = await fetch(recordingUrl, { credentials: "include" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.blob();
        }
        return fetchAndConvertToWav(recordingUrl);
    }

    async function postDownloadLog(callId) {
        const res = await fetch(`${BACKEND_URL}/api/admin/calls/${callId}/download-log`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({ error: "Request failed" }));
            throw new Error(body.error || `HTTP ${res.status}`);
        }
        return res.json();
    }

    async function handleBulkDownload() {
        if (isBulkDownloading) return;
        const res = await apiGet("/api/admin/calls/exportable");
        const callsToDownload = res.calls || [];

        if (callsToDownload.length === 0) {
            Swal.fire({
                icon: 'info',
                title: 'No Calls',
                text: 'No new approved calls found to download.',
                confirmButtonColor: '#ea580c'
            });
            return;
        }

        const result = await Swal.fire({
            title: 'Download All?',
            text: `Do you really want to download ${callsToDownload.length} approved calls?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#ea580c',
            cancelButtonColor: '#404040',
            confirmButtonText: 'Yes, download all'
        });

        if (!result.isConfirmed) return;

        try {
            setIsBulkDownloading(true);
            setBulkProgress({ current: 0, total: callsToDownload.length, label: "Starting..." });

            const allFiles = [];
            const textEncoder = new TextEncoder();

            for (let i = 0; i < callsToDownload.length; i++) {
                const call = callsToDownload[i];
                setBulkProgress({ 
                    current: i + 1, 
                    total: callsToDownload.length, 
                    label: `Processing ${call.callId.slice(0, 8)}...` 
                });

                const speakers = [
                    {
                        folder: "speaker1",
                        user: call.userA,
                        file: call.recordingAFile,
                        status: call.recordingAStatus,
                        duration: calcSpeakerDuration(call, true),
                    },
                    {
                        folder: "speaker2",
                        user: call.userB,
                        file: call.recordingBFile,
                        status: call.recordingBStatus,
                        duration: calcSpeakerDuration(call, false),
                    },
                ].filter((s) => s.file && (s.user?._id || s.user) && s.status === "approved");

                for (const speaker of speakers) {
                    try {
                        const speakerFileBase = `${speaker.user.speaker_id}-${call.callId}`;
                        const blob = await fetchRecordingBlob(call.callId, speaker.user._id, speaker.file);
                        allFiles.push({
                            path: `${call.callId}/${speakerFileBase}.wav`,
                            data: new Uint8Array(await blob.arrayBuffer()),
                            modifiedAt: new Date(),
                        });
                        allFiles.push({
                            path: `${call.callId}/${speakerFileBase}_metadata.csv`,
                            data: textEncoder.encode(metadataForSpeaker(call, speaker.folder, speaker.user, speaker.duration)),
                            modifiedAt: new Date(),
                        });
                    } catch (err) {
                        console.error(`Failed to fetch speaker ${speaker.folder} for call ${call.callId}:`, err);
                    }
                }

                // Mark as downloaded on backend
                try {
                    await postDownloadLog(call.callId);
                } catch (err) {
                    console.error("Failed to post download log for", call.callId, err);
                }
            }

            setBulkProgress((prev) => ({ ...prev, label: "Creating master ZIP..." }));
            const zipBlob = await createStoredZip(allFiles);
            
            const url = window.URL.createObjectURL(zipBlob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `Calls_${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            Swal.fire({
                icon: 'success',
                title: 'Success',
                text: 'Bulk download complete!',
                confirmButtonColor: '#ea580c'
            });
            await loadCalls(); // Refresh the list to reflect download status
        } catch (e) {
            Swal.fire({
                icon: 'error',
                title: 'Download Failed',
                text: e.message,
                confirmButtonColor: '#ea580c'
            });
        } finally {
            setIsBulkDownloading(false);
            setBulkProgress({ current: 0, total: 0, label: "" });
        }
    }

    async function downloadCallBundle(call) {
        if (!call || downloadingCallId === call.callId) return;

        try {
            setDownloadingCallId(call.callId);
            setDownloadStep("Checking previous downloads...");
            const status = await apiGet(`/api/admin/calls/${call.callId}/download-status`);
            if (status.hasDownloaded) {
                const result = await Swal.fire({
                    title: 'Download Again?',
                    text: 'You have already downloaded this recording. Do you want to download again?',
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonColor: '#ea580c',
                    cancelButtonColor: '#404040',
                    confirmButtonText: 'Yes, download'
                });
                if (!result.isConfirmed) return;
            }

            const speakers = [
                {
                    folder: "speaker1",
                    user: call.userA,
                    file: call.recordingAFile,
                    reviewNote: call.recordingAReviewNote,
                    payout: Number(call.recordingAPayoutUsd || 0).toFixed(2),
                    duration: calcSpeakerDuration(call, true),
                },
                {
                    folder: "speaker2",
                    user: call.userB,
                    file: call.recordingBFile,
                    reviewNote: call.recordingBReviewNote,
                    payout: Number(call.recordingBPayoutUsd || 0).toFixed(2),
                    duration: calcSpeakerDuration(call, false),
                },
            ].filter((speaker) => speaker.file && (speaker.user?._id || speaker.user));

            if (!speakers.length) throw new Error("No recordings available");

            const files = [];
            const textEncoder = new TextEncoder();
            const rootFolder = `call_${call.callId}`;

            for (const speaker of speakers) {
                setDownloadStep(`Fetching ${speaker.user.username}'s recording...`);
                const speakerFileBase = `${speaker.user.speaker_id}-${call.callId}`;
                const blob = await fetchRecordingBlob(call.callId, speaker.user._id, speaker.file);
                files.push({
                    path: `${rootFolder}/${speakerFileBase}.wav`,
                    data: new Uint8Array(await blob.arrayBuffer()),
                    modifiedAt: new Date(),
                });
                files.push({
                    path: `${rootFolder}/${speakerFileBase}_metadata.csv`,
                    data: textEncoder.encode(metadataForSpeaker(call, speaker.folder, speaker.user, speaker.duration)),
                    modifiedAt: new Date(),
                });
            }

            setDownloadStep("Creating ZIP bundle...");
            const zipBlob = await createStoredZip(files);

            setDownloadStep("Saving ZIP file...");
            const url = window.URL.createObjectURL(zipBlob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `call_${call.callId}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            setDownloadStep("Saving download log...");
            await postDownloadLog(call.callId);
        } catch (e) {
            alert("Failed to download bundle: " + e.message);
        } finally {
            setDownloadingCallId(null);
            setDownloadStep("");
        }
    }

    function formatSeconds(seconds) {
        if (!seconds || seconds < 0) return "-";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}m ${secs}s`;
    }

    const formatDuration = (start, end) => {
        if (!end || !start) return "-";
        try {
            const diff = new Date(end) - new Date(start);
            if (isNaN(diff)) return "-";
            const minutes = Math.floor(diff / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);
            return `${minutes}m ${seconds}s`;
        } catch {
            return "-";
        }
    };

    async function approveCall(callId) {
        // Confirmation dialog
        const result = await Swal.fire({
            title: 'Approve Call?',
            text: 'Are you sure you want to approve this call?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#16a34a',
            cancelButtonColor: '#404040',
            confirmButtonText: 'Yes, approve'
        });

        if (!result.isConfirmed) return;

        try {
            const data = await apiPatchJson(`/api/admin/calls/${callId}/approve`);
            if (selectedCall?.callId === callId) setSelectedCall((prev) => mergeReviewFields(prev, data.call));
            await loadCalls();  // Refresh list
            Swal.fire({
                icon: 'success',
                title: 'Success',
                text: 'Call approved successfully.',
                timer: 1500,
                showConfirmButton: false
            });
        } catch (e) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: e.message,
                confirmButtonColor: '#ea580c'
            });
        }
    }

    async function handlePurgeRejected() {
        const result = await Swal.fire({
            title: 'Purge Rejected Recordings?',
            text: 'Are you sure you want to permanently delete S3 recording files for all calls where BOTH contributors are rejected? This action cannot be undone.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#404040',
            confirmButtonText: 'Yes, delete all'
        });

        if (!result.isConfirmed) return;

        try {
            setLoading(true);
            const data = await apiPostJson("/api/admin/calls/purge-rejected");
            await loadCalls();
            Swal.fire({
                icon: 'success',
                title: 'Purged',
                text: `${data.purgedCount} rejected call(s) successfully purged from S3.`,
                timer: 2000,
                showConfirmButton: false
            });
        } catch (e) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: e.message,
                confirmButtonColor: '#ea580c'
            });
        } finally {
            setLoading(false);
        }
    }

    async function rejectCall(callId) {
        const result = await Swal.fire({
            title: 'Reject Call?',
            text: 'Are you sure you want to reject this entire call?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#404040',
            confirmButtonText: 'Yes, reject'
        });

        if (!result.isConfirmed) return;

        const { value: noteA } = await Swal.fire({
            title: 'Rejection Note (User A)',
            input: 'text',
            inputPlaceholder: 'Enter note for user A...',
            showCancelButton: true,
            confirmButtonColor: '#ea580c',
            inputValidator: (value) => {
                if (!value || !value.trim()) return 'Note is required!';
            }
        });
        if (noteA === undefined) return;

        const { value: noteB } = await Swal.fire({
            title: 'Rejection Note (User B)',
            input: 'text',
            inputPlaceholder: 'Enter note for user B...',
            showCancelButton: true,
            confirmButtonColor: '#ea580c',
            inputValidator: (value) => {
                if (!value || !value.trim()) return 'Note is required!';
            }
        });
        if (noteB === undefined) return;

        try {
            const data = await apiPatchJson(`/api/admin/calls/${callId}/reject`, {
                recordingAReviewNote: noteA.trim(),
                recordingBReviewNote: noteB.trim(),
            });
            if (selectedCall?.callId === callId) setSelectedCall((prev) => mergeReviewFields(prev, data.call));
            await loadCalls();  // Refresh list
            Swal.fire({
                icon: 'success',
                title: 'Rejected',
                text: 'Call has been rejected with notes.',
                timer: 1500,
                showConfirmButton: false
            });
        } catch (e) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: e.message,
                confirmButtonColor: '#ea580c'
            });
        }
    }

    async function approveRecording(callId, userId, username) {
        try {
            const note = recordingNotes[userId] || "";
            const data = await apiPatchJson(`/api/admin/calls/${callId}/approve/${userId}`, { note: note.trim() });
            if (selectedCall?.callId === callId) setSelectedCall((prev) => mergeReviewFields(prev, data.call));
            await loadCalls();  // Refresh list
        } catch (e) {
            alert("Error: " + e.message);
        }
    }

    async function rejectRecording(callId, userId, username) {
        try {
            const note = recordingNotes[userId] || "";
            const data = await apiPatchJson(`/api/admin/calls/${callId}/reject/${userId}`, { note: note.trim() });
            if (selectedCall?.callId === callId) setSelectedCall((prev) => mergeReviewFields(prev, data.call));
            await loadCalls();  // Refresh list
        } catch (e) {
            alert("Error: " + e.message);
        }
    }

    async function runAudioQC(callId, userId) {
        setQcLoading(prev => ({ ...prev, [userId]: true }));
        setQcErrors(prev => ({ ...prev, [userId]: "" }));
        try {
            const data = await apiPostJson(`/api/admin/qa/calls/${callId}/analyze/${userId}`);
            setQcResults(prev => ({ ...prev, [userId]: data }));
            
            // Persist results into selectedCall state immediately so it's not overwritten
            const isUserA = selectedCall?.userA?._id === userId;
            const updateField = isUserA ? "recordingAQCResult" : "recordingBQCResult";
            setSelectedCall(prev => prev ? { ...prev, [updateField]: data } : null);

            // Reload calls list to sync main tables
            await loadCalls();
        } catch (err) {
            setQcErrors(prev => ({ ...prev, [userId]: err.message || err }));
        } finally {
            setQcLoading(prev => ({ ...prev, [userId]: false }));
        }
    }

    async function loadCallAudio(callId, userId) {
        const key = `${callId}_${userId}`;
        if (audioUrls[key]) return;
        setLoadingAudio(prev => ({ ...prev, [key]: true }));
        try {
            const url = `${BACKEND_URL}/api/admin/qa/calls/${callId}/recording/${userId}`;
            const wavBlob = await fetchAndConvertToWav(url);
            setAudioUrls((prev) => ({ ...prev, [key]: URL.createObjectURL(wavBlob) }));
        } catch (e) {
            Swal.fire({
                icon: 'error',
                title: 'Audio Load Failed',
                text: e.message,
                confirmButtonColor: '#ea580c'
            });
        } finally {
            setLoadingAudio(prev => ({ ...prev, [key]: false }));
        }
    }

    const activeListeners = useRef({});

    function playSpotcheck(callId, userId, timestampSec) {
        const key = `${callId}_${userId}`;
        
        const trigger = (audio) => {
            const start = Math.max(0, timestampSec - 3);
            const end = start + 8; // 8 seconds total (start-3 to start+5)

            // Remove existing listener if any
            if (activeListeners.current[key]) {
                audio.removeEventListener("timeupdate", activeListeners.current[key]);
            }

            audio.currentTime = start;
            audio.play().catch(e => console.error("Spotcheck playback failed:", e));

            const onTimeUpdate = () => {
                if (audio.currentTime >= end) {
                    audio.pause();
                    audio.removeEventListener("timeupdate", onTimeUpdate);
                    activeListeners.current[key] = null;
                }
            };

            audio.addEventListener("timeupdate", onTimeUpdate);
            activeListeners.current[key] = onTimeUpdate;
        };

        const audio = audioRefs.current[key];
        if (!audio) {
            loadCallAudio(callId, userId).then(() => {
                // Poll briefly until audio element is initialized with the ref
                let attempts = 0;
                const interval = setInterval(() => {
                    const loadedAudio = audioRefs.current[key];
                    if (loadedAudio || attempts > 20) {
                        clearInterval(interval);
                        if (loadedAudio) trigger(loadedAudio);
                    }
                    attempts++;
                }, 100);
            });
            return;
        }
        trigger(audio);
    }

    function filterOverlappingEvents(events) {
        if (!events || events.length === 0) return [];
        const sorted = [...events].sort((a, b) => a.timestamp_sec - b.timestamp_sec);
        const filtered = [];
        for (const e of sorted) {
            let covered = false;
            const tSec = e.timestamp_sec;
            for (const kept of filtered) {
                const kSec = kept.timestamp_sec;
                const kStart = Math.max(0, kSec - 3);
                const kEnd = kStart + 8;
                if (tSec >= kStart && tSec <= kEnd) {
                    covered = true;
                    break;
                }
            }
            if (!covered) {
                filtered.push(e);
            }
        }
        return filtered;
    }

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleString();
    };

    const formatPayout = (amount, minutes) => {
        const payout = Number(amount) || 0;
        const mins = Number(minutes) || 0;
        if (payout <= 0 || mins <= 0) return "Payout pending";
        return `$${payout.toFixed(2)} for ${mins.toFixed(2)} mins`;
    };

    const getCallStatusBadge = (status) => {
        if (!status) {
            return <span className="px-2 py-1 text-xs font-medium rounded-full bg-neutral-700 text-neutral-300">--</span>;
        }

        const config = {
            pending: { bg: 'bg-yellow-900/50', text: 'text-yellow-300' },
            approved: { bg: 'bg-success-900/50', text: 'text-success-300' },
            rejected: { bg: 'bg-error-900/50', text: 'text-error-300' }
        };

        const { bg, text } = config[status] || config.pending;
        return <span className={`px-2 py-1 text-xs font-medium rounded-full ${bg} ${text}`}>{status}</span>;
    };

    const getRecordingStatusBadge = (status) => {
        // Support backward compatibility - if no individual status, show "N/A"
        if (!status) {
            return <span className="px-2 py-1 text-xs font-medium rounded-full bg-neutral-700 text-neutral-300">N/A</span>;
        }

        const config = {
            pending: { bg: 'bg-yellow-900/50', text: 'text-yellow-300', icon: '⏳' },
            approved: { bg: 'bg-success-900/50', text: 'text-success-300', icon: '✓' },
            rejected: { bg: 'bg-error-900/50', text: 'text-error-300', icon: '✗' }
        };

        const { bg, text, icon } = config[status] || config.pending;
        return <span className={`px-2 py-1 text-xs font-medium rounded-full ${bg} ${text}`}>{icon} {status}</span>;
    };

    return (
        <div className="min-h-screen bg-neutral-900 pt-16 md:pt-0 md:pl-64">
            <AdminNav />

            {/* Content */}
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Call Management</h1>
                        <p className="text-sm md:text-base text-neutral-400">View and manage all voice calls</p>
                    </div>
                    {userInfo?.isAdmin && (
                        <button
                            onClick={handleBulkDownload}
                            disabled={isBulkDownloading}
                            className="inline-flex items-center justify-center px-6 py-3 bg-warning-600 hover:bg-warning-700 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white rounded-xl font-bold shadow-lg shadow-warning-900/20 transition-all transform active:scale-95"
                        >
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            {isBulkDownloading ? "Processing..." : "Download All (New Approved)"}
                        </button>
                    )}
                </div>

                {/* Bulk Download Progress Overlay */}
                {isBulkDownloading && (
                    <div className="fixed top-6 right-6 z-[9999] w-72 bg-neutral-800 border border-warning-600/50 rounded-2xl p-4 shadow-2xl shadow-black/50 animate-in fade-in slide-in-from-top-4 duration-300">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-warning-400 font-bold text-sm uppercase tracking-wider">Bulk Downloading</span>
                            <span className="text-white font-mono text-xs bg-neutral-700 px-2 py-1 rounded-lg">
                                {bulkProgress.current} / {bulkProgress.total}
                            </span>
                        </div>
                        <div className="w-full h-2 bg-neutral-700 rounded-full overflow-hidden mb-3">
                            <div 
                                className="h-full bg-gradient-to-r from-warning-600 to-warning-400 transition-all duration-300"
                                style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                            />
                        </div>
                        <div className="text-xs text-neutral-400 truncate italic">
                            {bulkProgress.label}
                        </div>
                    </div>
                )}

                {error && (
                    <div className="bg-error-900/50 border border-error-700 text-error-300 px-4 py-3 rounded-lg mb-6">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="w-12 h-12 border-4 border-warning-200 border-t-warning-600 rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <>
                        {/* Status Tabs */}
                        <div className="flex gap-2 mb-4 border-b border-neutral-700 pb-4">
                            {[
                                { label: "Pending", value: "pending" },
                                { label: "Approved", value: "approved" },
                                { label: "Rejected", value: "rejected" },
                                { label: "Call Logs", value: "logs" },
                                { label: "All Calls", value: "" }
                            ].map((tab) => (
                                <button
                                    key={tab.label}
                                    onClick={() => {
                                        setStatusFilter(tab.value);
                                        setPagination(prev => ({ ...prev, page: 1 }));
                                    }}
                                    className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                                        statusFilter === tab.value
                                            ? "bg-warning-600 text-white shadow-lg shadow-warning-900/20"
                                            : "bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-700"
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {statusFilter === "rejected" && (
                            <div className="flex justify-end mb-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                <button
                                    onClick={handlePurgeRejected}
                                    className="inline-flex items-center px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-red-950/20 transition-all transform active:scale-95 border border-red-500/30"
                                >
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Delete All Rejected Calls
                                </button>
                            </div>
                        )}

                        {/* Calls Table */}
                        <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-neutral-700">
                                        <tr>
                                            {statusFilter === "logs" ? (
                                                <>
                                                    <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Call ID</th>
                                                    <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Participants</th>
                                                    <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Speaker IDs</th>
                                                    <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Topic</th>
                                                    <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Reviewed By (QA)</th>
                                                    <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Verdict</th>
                                                    <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Date</th>
                                                    <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Actions</th>
                                                </>
                                            ) : (
                                                <>
                                                    <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Call ID</th>
                                                    <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Users</th>
                                                    <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Topic</th>
                                                    <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Language</th>
                                                    <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Started</th>
                                                    <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Duration</th>
                                                    <th className="hidden sm:table-cell px-3 md:px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">End Reason</th>
                                                    <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Call Status</th>
                                                    <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Actions</th>
                                                </>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-700">
                                        {calls.map((call) => (
                                            <tr key={call.callId} className="hover:bg-neutral-700/50 transition-colors">
                                                {statusFilter === "logs" ? (
                                                    <>
                                                        {/* Call ID */}
                                                        <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                                                            <div className="text-xs md:text-sm font-mono text-neutral-300" title={call.callId}>
                                                                {call.callId.slice(0, 8)}...
                                                            </div>
                                                        </td>
                                                        {/* Participants */}
                                                        <td className="px-3 md:px-6 py-4">
                                                             <div className="text-xs md:text-sm text-white font-medium">
                                                                 A: {call.userA?.username || "Unknown"}
                                                             </div>
                                                             <div className="text-xs md:text-sm text-white font-medium">
                                                                 B: {call.userB?.username || "Unknown"}
                                                             </div>
                                                        </td>
                                                        {/* Speaker IDs */}
                                                        <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                                                             <div className="text-xs font-mono text-neutral-400">
                                                                 A: {call.userA?.speaker_id || "—"}
                                                             </div>
                                                             <div className="text-xs font-mono text-neutral-400">
                                                                 B: {call.userB?.speaker_id || "—"}
                                                             </div>
                                                        </td>
                                                        {/* Topic */}
                                                        <td className="hidden md:table-cell px-6 py-4">
                                                             {call.subtopicId ? (
                                                                 <div className="text-xs md:text-sm font-medium text-white max-w-[180px] truncate" title={call.subtopicId.title}>
                                                                     {call.subtopicId.title}
                                                                 </div>
                                                             ) : (
                                                                 <span className="text-xs text-neutral-500 italic">-</span>
                                                             )}
                                                        </td>
                                                        {/* Reviewed By (QA) */}
                                                        <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                                                             {call.reviewedBy ? (
                                                                 <div>
                                                                     <div className="text-xs md:text-sm text-white font-semibold">
                                                                         {call.reviewedBy.username || `${call.reviewedBy.firstname || ""} ${call.reviewedBy.lastname || ""}`.trim()}
                                                                     </div>
                                                                     <div className="text-[10px] text-neutral-400">
                                                                         {call.reviewedBy.email}
                                                                     </div>
                                                                 </div>
                                                             ) : (
                                                                 <span className="text-xs text-neutral-500 italic">System / Auto</span>
                                                             )}
                                                        </td>
                                                        {/* Verdict */}
                                                        <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                                                             {getCallStatusBadge(call.callStatus)}
                                                        </td>
                                                        {/* Date */}
                                                        <td className="hidden lg:table-cell px-6 py-4 whitespace-nowrap">
                                                             <div className="text-xs text-neutral-300">
                                                                 {call.reviewedAt ? formatDate(call.reviewedAt) : formatDate(call.startedAt)}
                                                             </div>
                                                        </td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                                                            <div className="text-xs md:text-sm font-mono text-neutral-300">{call.callId.slice(0, 8)}...</div>
                                                        </td>
                                                        <td className="px-3 md:px-6 py-4">
                                                            <div className="text-xs md:text-sm text-white">
                                                                {call.userA?.username || "Unknown"}
                                                            </div>
                                                            <div className="text-xs text-neutral-400">
                                                                {call.userB?.username || "Unknown"}
                                                            </div>
                                                        </td>
                                                        <td className="hidden md:table-cell px-6 py-4">
                                                            {call.subtopicId ? (
                                                                <div>
                                                                    <div className="text-sm font-medium text-white leading-tight">
                                                                        {call.subtopicId.title}
                                                                    </div>
                                                                    {call.subtopicId.description && (
                                                                        <div 
                                                                            className="text-xs text-neutral-400 mt-0.5 max-w-[200px] truncate"
                                                                            title={call.subtopicId.description}
                                                                        >
                                                                            {call.subtopicId.description}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <span className="text-sm text-neutral-500 italic">-</span>
                                                            )}
                                                        </td>
                                                        <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap">
                                                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-indigo-900/50 text-indigo-300 capitalize">
                                                                {call.language || '—'}
                                                            </span>
                                                        </td>
                                                        <td className="hidden lg:table-cell px-6 py-4 whitespace-nowrap">
                                                            <div className="text-sm text-neutral-300">{formatDate(call.startedAt)}</div>
                                                        </td>
                                                        <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                                                            <div className="text-xs md:text-sm text-neutral-300">{formatDuration(call.recordingAStartedAt || call.recordingBStartedAt || call.actualCallStartedAt || call.startedAt, call.endedAt)}</div>
                                                        </td>
                                                        <td className="hidden sm:table-cell px-3 md:px-6 py-4 whitespace-nowrap">
                                                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${call.endReason === 'completed' ? 'bg-success-900/50 text-success-300' :
                                                                call.endReason === 'timeout' ? 'bg-warning-900/50 text-warning-300' :
                                                                    'bg-neutral-700 text-neutral-300'
                                                                }`}>
                                                                {call.endReason || 'Unknown'}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                                                            <div className="space-y-1">
                                                                {/* User A Status */}
                                                                <div className="flex items-center gap-2 text-xs">
                                                                    <span className="text-neutral-300 min-w-[80px] truncate">
                                                                        {call.userA?.username || "User A"}
                                                                    </span>
                                                                    <span className={`text-lg ${call.recordingAStatus === 'approved' ? 'text-success-400' :
                                                                        call.recordingAStatus === 'rejected' ? 'text-error-400' : 'text-warning-400'
                                                                        }`}>
                                                                        {call.recordingAStatus === 'approved' ? '✓' :
                                                                            call.recordingAStatus === 'rejected' ? '✗' : '⏳'}
                                                                    </span>
                                                                </div>
                                                                {/* User B Status */}
                                                                <div className="flex items-center gap-2 text-xs">
                                                                    <span className="text-neutral-300 min-w-[80px] truncate">
                                                                        {call.userB?.username || "User B"}
                                                                    </span>
                                                                    <span className={`text-lg ${call.recordingBStatus === 'approved' ? 'text-success-400' :
                                                                        call.recordingBStatus === 'rejected' ? 'text-error-400' : 'text-warning-400'
                                                                        }`}>
                                                                        {call.recordingBStatus === 'approved' ? '✓' :
                                                                            call.recordingBStatus === 'rejected' ? '✗' : '⏳'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </>
                                                )}
                                                {/* Actions */}
                                                <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs">
                                                    <div className="flex flex-col sm:flex-row gap-1">
                                                        <button
                                                            onClick={() => {
                                                                setSelectedCall(call);
                                                                setRecordingNotes({
                                                                    [call.userA?._id]: call.recordingAReviewNote || "",
                                                                    [call.userB?._id]: call.recordingBReviewNote || ""
                                                                });
                                                                // Preload computed QC analytics from CallSession document
                                                                setQcResults({
                                                                    [call.userA?._id]: call.recordingAQCResult || null,
                                                                    [call.userB?._id]: call.recordingBQCResult || null
                                                                });
                                                            }}
                                                            className="text-warning-400 hover:text-warning-300"
                                                        >
                                                            View
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            <div className="bg-neutral-700 px-4 md:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                                <div className="text-xs md:text-sm text-neutral-300">
                                    Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} calls
                                </div>
                                <div className="flex space-x-2">
                                    <button
                                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                                        disabled={pagination.page === 1}
                                        className="px-3 py-1 bg-neutral-600 text-neutral-300 rounded hover:bg-neutral-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs md:text-sm"
                                    >
                                        Previous
                                    </button>
                                    <span className="px-3 py-1 text-neutral-300 text-xs md:text-sm">
                                        Page {pagination.page} of {pagination.pages}
                                    </span>
                                    <button
                                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                                        disabled={pagination.page >= pagination.pages}
                                        className="px-3 py-1 bg-neutral-600 text-neutral-300 rounded hover:bg-neutral-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs md:text-sm"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Call Details Modal */}
            {selectedCall && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={() => setSelectedCall(null)}>
                    <div className="bg-neutral-800 border border-neutral-700 rounded-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto p-4 md:p-6 animate-scale-in" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4 md:mb-6">
                            <h2 className="text-xl md:text-2xl font-bold text-white">Call Details</h2>
                            <button onClick={() => setSelectedCall(null)} className="text-neutral-400 hover:text-white">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <div className="text-sm text-neutral-400 mb-1">Call ID</div>
                                    <div className="text-white font-mono text-xs md:text-sm break-all">{selectedCall.callId}</div>
                                </div>
                                <div>
                                    <div className="text-sm text-neutral-400 mb-1">Status</div>
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${selectedCall.endReason === 'completed' ? 'bg-success-900/50 text-success-300' :
                                        'bg-neutral-700 text-neutral-300'
                                        }`}>
                                        {selectedCall.endReason || 'Unknown'}
                                    </span>
                                </div>
                            </div>

                            <div>
                                <div className="text-sm text-neutral-400 mb-2">Participants</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-neutral-700 p-3 rounded-lg">
                                        <div className="text-white font-semibold text-sm md:text-base">{selectedCall.userA?.username}</div>
                                        <div className="text-xs text-neutral-400 break-all">{selectedCall.userA?.email}</div>
                                        {selectedCall.questionerUserId?.toString() === selectedCall.userA?._id?.toString() && (
                                            <div className="text-xs text-warning-400 mt-1">Questioner</div>
                                        )}
                                        {selectedCall.answererUserId?.toString() === selectedCall.userA?._id?.toString() && (
                                            <div className="text-xs text-success-400 mt-1">Answerer</div>
                                        )}
                                    </div>
                                    <div className="bg-neutral-700 p-3 rounded-lg">
                                        <div className="text-white font-semibold text-sm md:text-base">{selectedCall.userB?.username}</div>
                                        <div className="text-xs text-neutral-400 break-all">{selectedCall.userB?.email}</div>
                                        {selectedCall.questionerUserId?.toString() === selectedCall.userB?._id?.toString() && (
                                            <div className="text-xs text-warning-400 mt-1">Questioner</div>
                                        )}
                                        {selectedCall.answererUserId?.toString() === selectedCall.userB?._id?.toString() && (
                                            <div className="text-xs text-success-400 mt-1">Answerer</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {selectedCall.subtopicId && (
                                <div>
                                    <div className="text-sm text-neutral-400 mb-1">Topic</div>
                                    <div className="text-white text-sm md:text-base">{selectedCall.subtopicId.title}</div>
                                    {selectedCall.subtopicId.description && (
                                        <div className="text-xs text-neutral-500 mt-1">{selectedCall.subtopicId.description}</div>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <div className="text-sm text-neutral-400 mb-1">Started</div>
                                    <div className="text-white text-xs md:text-sm">{formatDate(selectedCall.startedAt)}</div>
                                </div>
                                <div>
                                    <div className="text-sm text-neutral-400 mb-1">Ended</div>
                                    <div className="text-white text-xs md:text-sm">{selectedCall.endedAt ? formatDate(selectedCall.endedAt) : '-'}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <div className="text-sm text-neutral-400 mb-1">Negotiation Duration</div>
                                    <div className="text-white">{formatSeconds(selectedCall.negotiationDuration)}</div>
                                </div>
                                <div>
                                    <div className="text-sm text-neutral-400 mb-1">Call Duration</div>
                                    <div className="text-white">{formatDuration(selectedCall.recordingAStartedAt || selectedCall.recordingBStartedAt || selectedCall.actualCallStartedAt || selectedCall.startedAt, selectedCall.endedAt)}</div>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-neutral-700">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <div className="text-sm text-neutral-400">Recordings</div>
                                    {(userInfo?.isAdmin && (selectedCall.recordingAFile || selectedCall.recordingBFile)) && (
                                        <button
                                            onClick={() => downloadCallBundle(selectedCall)}
                                            disabled={downloadingCallId === selectedCall.callId}
                                            className="inline-flex items-center justify-center px-4 py-2 bg-warning-600 hover:bg-warning-700 disabled:bg-neutral-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all"
                                        >
                                            {downloadingCallId === selectedCall.callId ? downloadStep || "Processing..." : "Download ZIP"}
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* User A Recording */}
                                    {selectedCall.recordingAFile && (
                                        <div className="bg-neutral-700 p-4 rounded-lg flex flex-col justify-between">
                                            <div>
                                                <div className="text-white font-semibold mb-2">{selectedCall.userA.username}</div>
                                                <div className="mb-3">
                                                    <div className="text-xs text-neutral-400 mb-1">Status</div>
                                                    {getRecordingStatusBadge(selectedCall.recordingAStatus)}
                                                </div>
                                                <div className="mb-3 text-xs text-neutral-400">
                                                    {formatPayout(selectedCall.recordingAPayoutUsd, selectedCall.recordingADurationMinutes)}
                                                </div>
                                                {selectedCall.recordingAReviewNote && (
                                                    <div className="mb-3 rounded-lg border border-neutral-600 bg-neutral-800/60 px-3 py-2 text-xs text-neutral-300">
                                                        {selectedCall.recordingAReviewNote}
                                                    </div>
                                                )}
                                                
                                                {/* Audio Visualizer & Player */}
                                                <div className="mb-3">
                                                    <label className="block text-[10px] text-neutral-400 mb-1 uppercase font-bold">Listen Recording</label>
                                                    {audioUrls[`${selectedCall.callId}_${selectedCall.userA._id}`] ? (
                                                        <div className="space-y-2">
                                                            <AudioVisualizer 
                                                                url={audioUrls[`${selectedCall.callId}_${selectedCall.userA._id}`]}
                                                                audioRef={{ current: audioRefs.current[`${selectedCall.callId}_${selectedCall.userA._id}`] }} 
                                                            />
                                                            <audio 
                                                                ref={(el) => (audioRefs.current[`${selectedCall.callId}_${selectedCall.userA._id}`] = el)}
                                                                controls 
                                                                src={audioUrls[`${selectedCall.callId}_${selectedCall.userA._id}`]} 
                                                                className="w-full h-9 rounded" 
                                                                controlsList="nodownload noplaybackrate" 
                                                                onContextMenu={(e) => e.preventDefault()}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <button 
                                                            onClick={() => loadCallAudio(selectedCall.callId, selectedCall.userA._id)} 
                                                            disabled={loadingAudio[`${selectedCall.callId}_${selectedCall.userA._id}`]} 
                                                            className="w-full py-2 bg-neutral-800 hover:bg-neutral-600 border border-neutral-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
                                                        >
                                                            {loadingAudio[`${selectedCall.callId}_${selectedCall.userA._id}`] ? "Loading WAV..." : "▶ Load Audio Waveform"}
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Audio QC Analyzer Card */}
                                                <div className="mb-4 pt-3 border-t border-neutral-600">
                                                    <button
                                                        onClick={() => runAudioQC(selectedCall.callId, selectedCall.userA._id)}
                                                        disabled={qcLoading[selectedCall.userA._id]}
                                                        className="w-full inline-flex items-center justify-center px-4 py-2 bg-neutral-800 hover:bg-neutral-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold border border-neutral-600 transition-colors"
                                                    >
                                                        {qcLoading[selectedCall.userA._id] ? (
                                                            <span className="flex items-center gap-1.5">
                                                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                                Running QC Analysis...
                                                            </span>
                                                        ) : (qcResults[selectedCall.userA._id] ? "🔄 Re-run QC Analyzer" : "📊 Run Audio QC Analyzer")}
                                                    </button>
                                                    
                                                    {qcErrors[selectedCall.userA._id] && (
                                                        <div className="mt-2 text-xs text-error-400 font-medium">
                                                            ⚠️ {qcErrors[selectedCall.userA._id]}
                                                        </div>
                                                    )}

                                                    {qcResults[selectedCall.userA._id] && (
                                                        <div className="mt-3 space-y-3 bg-neutral-900/40 p-3 rounded-lg border border-neutral-700/50">
                                                            <div className="flex justify-between text-xs">
                                                                <span className="text-neutral-400">YAMNet Noise:</span>
                                                                <span className={`font-bold ${qcResults[selectedCall.userA._id].yamnet.suspicion_rating === 10 ? 'text-error-400' : qcResults[selectedCall.userA._id].yamnet.suspicion_rating === 5 ? 'text-warning-400' : 'text-success-400'}`}>
                                                                    {qcResults[selectedCall.userA._id].yamnet.rating_label}
                                                                </span>
                                                            </div>
                                                                                               {qcResults[selectedCall.userA._id].yamnet.events && qcResults[selectedCall.userA._id].yamnet.events.length > 0 ? (
                                                                <div className="space-y-1.5">
                                                                    <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Spotcheck Noise Events (Click to play 8s)</div>
                                                                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                                                                        {filterOverlappingEvents(qcResults[selectedCall.userA._id].yamnet.events).map((e, idx) => (
                                                                            <button
                                                                                key={idx}
                                                                                onClick={() => playSpotcheck(selectedCall.callId, selectedCall.userA._id, e.timestamp_sec)}
                                                                                className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border transition-all ${
                                                                                    e.severity === 'heavy' 
                                                                                        ? 'bg-error-950/40 text-error-300 border-error-800 hover:bg-error-900/60' 
                                                                                        : 'bg-warning-950/40 text-warning-300 border-warning-800 hover:bg-warning-900/60'
                                                                                }`}
                                                                            >
                                                                                <span>🔊</span>
                                                                                <span className="font-mono font-bold">[{e.timestamp}]</span>
                                                                                <span>{e.class}</span>
                                                                                <span className="opacity-60">({Number(e.score).toFixed(2)})</span>
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                qcResults[selectedCall.userA._id].yamnet.top_noise_events !== "None" && (
                                                                    <div className="text-[10px] text-error-300/80 bg-error-950/20 px-2 py-1 rounded border border-error-900/30">
                                                                        Events: {qcResults[selectedCall.userA._id].yamnet.top_noise_events}
                                                                    </div>
                                                                )
                                                            )}                                 
                                                            <div className="grid grid-cols-2 gap-2 text-[10px] text-neutral-300">
                                                                <div>Bit Verdict: <span className="font-bold">{qcResults[selectedCall.userA._id].freq.bit_verdict}</span></div>
                                                                <div>Noise Floor: <span className="font-bold">{qcResults[selectedCall.userA._id].freq.noise_floor_db} dBFS</span></div>
                                                                <div>Crest Factor: <span className="font-bold">{qcResults[selectedCall.userA._id].freq.crest_factor} dB</span></div>
                                                                <div>Processing: <span className="font-bold">{qcResults[selectedCall.userA._id].freq.processing_verdict}</span></div>
                                                            </div>
                                                            {(qcResults[selectedCall.userA._id].spectrogram || qcResults[selectedCall.userA._id].spectrogramS3Key) && (
                                                                <div className="mt-2 bg-black/40 rounded p-1 border border-neutral-800">
                                                                    <div className="text-[9px] text-neutral-500 mb-1 font-bold tracking-wider uppercase text-center">Nyquist Spectrogram (Click to zoom)</div>
                                                                    <img 
                                                                        src={qcResults[selectedCall.userA._id].spectrogram 
                                                                             ? `data:image/png;base64,${qcResults[selectedCall.userA._id].spectrogram}`
                                                                             : `${BACKEND_URL}/api/admin/qa/calls/${selectedCall.callId}/spectrogram/${selectedCall.userA._id}`
                                                                         }
                                                                        alt="Spectrogram"
                                                                        crossOrigin="use-credentials"
                                                                        className="w-full rounded border border-neutral-900 cursor-zoom-in hover:opacity-80 transition-opacity"
                                                                        onClick={() => {
                                                                            const src = qcResults[selectedCall.userA._id].spectrogram 
                                                                                ? `data:image/png;base64,${qcResults[selectedCall.userA._id].spectrogram}`
                                                                                : `${BACKEND_URL}/api/admin/qa/calls/${selectedCall.callId}/spectrogram/${selectedCall.userA._id}`;
                                                                            setZoomedImage({ src, title: `${selectedCall.userA.username}'s Spectrogram` });
                                                                        }}
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="mb-3">
                                                    <label className="block text-[10px] text-neutral-500 mb-1 uppercase font-bold">Review Note</label>
                                                    <textarea
                                                        rows={2}
                                                        value={recordingNotes[selectedCall.userA._id] || ""}
                                                        onChange={(e) => setRecordingNotes(prev => ({ ...prev, [selectedCall.userA._id]: e.target.value }))}
                                                        placeholder="Enter review notes..."
                                                        className="w-full bg-neutral-800 border border-neutral-600 text-white text-xs rounded-lg px-2 py-1.5 resize-none focus:border-warning-500 outline-none"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex gap-2 mt-4">
                                                <button
                                                    onClick={() => approveRecording(selectedCall.callId, selectedCall.userA._id, selectedCall.userA.username)}
                                                    className="flex-1 px-3 py-2 bg-success-600 hover:bg-success-700 text-white rounded-lg text-xs font-medium transition-all"
                                                >
                                                    ✓ Approve
                                                </button>
                                                <button
                                                    onClick={() => rejectRecording(selectedCall.callId, selectedCall.userA._id, selectedCall.userA.username)}
                                                    className="flex-1 px-3 py-2 bg-error-600 hover:bg-error-700 text-white rounded-lg text-xs font-medium transition-all"
                                                >
                                                    ✗ Reject
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {/* User B Recording */}
                                    {selectedCall.recordingBFile && (
                                        <div className="bg-neutral-700 p-4 rounded-lg flex flex-col justify-between">
                                            <div>
                                                <div className="text-white font-semibold mb-2">{selectedCall.userB.username}</div>
                                                <div className="mb-3">
                                                    <div className="text-xs text-neutral-400 mb-1">Status</div>
                                                    {getRecordingStatusBadge(selectedCall.recordingBStatus)}
                                                </div>
                                                <div className="mb-3 text-xs text-neutral-400">
                                                    {formatPayout(selectedCall.recordingBPayoutUsd, selectedCall.recordingBDurationMinutes)}
                                                </div>
                                                {selectedCall.recordingBReviewNote && (
                                                    <div className="mb-3 rounded-lg border border-neutral-600 bg-neutral-800/60 px-3 py-2 text-xs text-neutral-300">
                                                        {selectedCall.recordingBReviewNote}
                                                    </div>
                                                )}
                                                
                                                {/* Audio Visualizer & Player */}
                                                <div className="mb-3">
                                                    <label className="block text-[10px] text-neutral-400 mb-1 uppercase font-bold">Listen Recording</label>
                                                    {audioUrls[`${selectedCall.callId}_${selectedCall.userB._id}`] ? (
                                                        <div className="space-y-2">
                                                            <AudioVisualizer 
                                                                url={audioUrls[`${selectedCall.callId}_${selectedCall.userB._id}`]}
                                                                audioRef={{ current: audioRefs.current[`${selectedCall.callId}_${selectedCall.userB._id}`] }} 
                                                            />
                                                            <audio 
                                                                ref={(el) => (audioRefs.current[`${selectedCall.callId}_${selectedCall.userB._id}`] = el)}
                                                                controls 
                                                                src={audioUrls[`${selectedCall.callId}_${selectedCall.userB._id}`]} 
                                                                className="w-full h-9 rounded" 
                                                                controlsList="nodownload noplaybackrate" 
                                                                onContextMenu={(e) => e.preventDefault()}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <button 
                                                            onClick={() => loadCallAudio(selectedCall.callId, selectedCall.userB._id)} 
                                                            disabled={loadingAudio[`${selectedCall.callId}_${selectedCall.userB._id}`]} 
                                                            className="w-full py-2 bg-neutral-800 hover:bg-neutral-600 border border-neutral-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
                                                        >
                                                            {loadingAudio[`${selectedCall.callId}_${selectedCall.userB._id}`] ? "Loading WAV..." : "▶ Load Audio Waveform"}
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Audio QC Analyzer Card */}
                                                <div className="mb-4 pt-3 border-t border-neutral-600">
                                                    <button
                                                        onClick={() => runAudioQC(selectedCall.callId, selectedCall.userB._id)}
                                                        disabled={qcLoading[selectedCall.userB._id]}
                                                        className="w-full inline-flex items-center justify-center px-4 py-2 bg-neutral-800 hover:bg-neutral-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold border border-neutral-600 transition-colors"
                                                    >
                                                        {qcLoading[selectedCall.userB._id] ? (
                                                            <span className="flex items-center gap-1.5">
                                                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                                Running QC Analysis...
                                                            </span>
                                                        ) : (qcResults[selectedCall.userB._id] ? "🔄 Re-run QC Analyzer" : "📊 Run Audio QC Analyzer")}
                                                    </button>
                                                    
                                                    {qcErrors[selectedCall.userB._id] && (
                                                        <div className="mt-2 text-xs text-error-400 font-medium">
                                                            ⚠️ {qcErrors[selectedCall.userB._id]}
                                                        </div>
                                                    )}

                                                    {qcResults[selectedCall.userB._id] && (
                                                        <div className="mt-3 space-y-3 bg-neutral-900/40 p-3 rounded-lg border border-neutral-700/50">
                                                            <div className="flex justify-between text-xs">
                                                                <span className="text-neutral-400">YAMNet Noise:</span>
                                                                <span className={`font-bold ${qcResults[selectedCall.userB._id].yamnet.suspicion_rating === 10 ? 'text-error-400' : qcResults[selectedCall.userB._id].yamnet.suspicion_rating === 5 ? 'text-warning-400' : 'text-success-400'}`}>
                                                                    {qcResults[selectedCall.userB._id].yamnet.rating_label}
                                                                </span>
                                                            </div>
                                                            {qcResults[selectedCall.userB._id].yamnet.events && qcResults[selectedCall.userB._id].yamnet.events.length > 0 ? (
                                                                <div className="space-y-1.5">
                                                                    <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Spotcheck Noise Events (Click to play 8s)</div>
                                                                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                                                                        {filterOverlappingEvents(qcResults[selectedCall.userB._id].yamnet.events).map((e, idx) => (
                                                                            <button
                                                                                key={idx}
                                                                                onClick={() => playSpotcheck(selectedCall.callId, selectedCall.userB._id, e.timestamp_sec)}
                                                                                className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border transition-all ${
                                                                                    e.severity === 'heavy' 
                                                                                        ? 'bg-error-950/40 text-error-300 border-error-800 hover:bg-error-900/60' 
                                                                                        : 'bg-warning-950/40 text-warning-300 border-warning-800 hover:bg-warning-900/60'
                                                                                }`}
                                                                            >
                                                                                <span>🔊</span>
                                                                                <span className="font-mono font-bold">[{e.timestamp}]</span>
                                                                                <span>{e.class}</span>
                                                                                <span className="opacity-60">({Number(e.score).toFixed(2)})</span>
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                qcResults[selectedCall.userB._id].yamnet.top_noise_events !== "None" && (
                                                                    <div className="text-[10px] text-error-300/80 bg-error-950/20 px-2 py-1 rounded border border-error-900/30">
                                                                        Events: {qcResults[selectedCall.userB._id].yamnet.top_noise_events}
                                                                    </div>
                                                                )
                                                            )}
                                                            <div className="grid grid-cols-2 gap-2 text-[10px] text-neutral-300">
                                                                <div>Bit Verdict: <span className="font-bold">{qcResults[selectedCall.userB._id].freq.bit_verdict}</span></div>
                                                                <div>Noise Floor: <span className="font-bold">{qcResults[selectedCall.userB._id].freq.noise_floor_db} dBFS</span></div>
                                                                <div>Crest Factor: <span className="font-bold">{qcResults[selectedCall.userB._id].freq.crest_factor} dB</span></div>
                                                                <div>Processing: <span className="font-bold">{qcResults[selectedCall.userB._id].freq.processing_verdict}</span></div>
                                                            </div>
                                                            {(qcResults[selectedCall.userB._id].spectrogram || qcResults[selectedCall.userB._id].spectrogramS3Key) && (
                                                                <div className="mt-2 bg-black/40 rounded p-1 border border-neutral-800">
                                                                    <div className="text-[9px] text-neutral-500 mb-1 font-bold tracking-wider uppercase text-center">Nyquist Spectrogram (Click to zoom)</div>
                                                                    <img 
                                                                        src={qcResults[selectedCall.userB._id].spectrogram 
                                                                             ? `data:image/png;base64,${qcResults[selectedCall.userB._id].spectrogram}`
                                                                             : `${BACKEND_URL}/api/admin/qa/calls/${selectedCall.callId}/spectrogram/${selectedCall.userB._id}`
                                                                         }
                                                                        alt="Spectrogram"
                                                                        crossOrigin="use-credentials"
                                                                        className="w-full rounded border border-neutral-900 cursor-zoom-in hover:opacity-80 transition-opacity"
                                                                        onClick={() => {
                                                                            const src = qcResults[selectedCall.userB._id].spectrogram 
                                                                                ? `data:image/png;base64,${qcResults[selectedCall.userB._id].spectrogram}`
                                                                                : `${BACKEND_URL}/api/admin/qa/calls/${selectedCall.callId}/spectrogram/${selectedCall.userB._id}`;
                                                                            setZoomedImage({ src, title: `${selectedCall.userB.username}'s Spectrogram` });
                                                                        }}
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="mb-3">
                                                    <label className="block text-[10px] text-neutral-500 mb-1 uppercase font-bold">Review Note</label>
                                                    <textarea
                                                        rows={2}
                                                        value={recordingNotes[selectedCall.userB._id] || ""}
                                                        onChange={(e) => setRecordingNotes(prev => ({ ...prev, [selectedCall.userB._id]: e.target.value }))}
                                                        placeholder="Enter review notes..."
                                                        className="w-full bg-neutral-800 border border-neutral-600 text-white text-xs rounded-lg px-2 py-1.5 resize-none focus:border-warning-500 outline-none"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex gap-2 mt-4">
                                                <button
                                                    onClick={() => approveRecording(selectedCall.callId, selectedCall.userB._id, selectedCall.userB.username)}
                                                    className="flex-1 px-3 py-2 bg-success-600 hover:bg-success-700 text-white rounded-lg text-xs font-medium transition-all"
                                                >
                                                    ✓ Approve
                                                </button>
                                                <button
                                                    onClick={() => rejectRecording(selectedCall.callId, selectedCall.userB._id, selectedCall.userB.username)}
                                                    className="flex-1 px-3 py-2 bg-error-600 hover:bg-error-700 text-white rounded-lg text-xs font-medium transition-all"
                                                >
                                                    ✗ Reject
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {!selectedCall.recordingAFile && !selectedCall.recordingBFile && (
                                    <div className="text-neutral-500 text-sm">No recordings available</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Spectrogram Zoom Modal (Lightbox) */}
            {zoomedImage && (
                <div 
                    className="fixed inset-0 bg-black/95 flex flex-col items-center justify-center p-4 z-[100] animate-fade-in cursor-zoom-out"
                    onClick={() => setZoomedImage(null)}
                >
                    <div className="absolute top-4 right-4 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                        <span className="text-white text-xs font-semibold tracking-wide bg-neutral-800/90 px-3 py-1.5 rounded-full border border-neutral-700/50">
                            {zoomedImage.title}
                        </span>
                        <button 
                            onClick={() => setZoomedImage(null)} 
                            className="bg-neutral-800 hover:bg-neutral-750 text-white rounded-full p-2 border border-neutral-700 transition-colors"
                        >
                            <svg className="w-6.5 h-6.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                    <div className="max-w-[95vw] max-h-[85vh] relative" onClick={(e) => e.stopPropagation()}>
                        <img 
                            src={zoomedImage.src} 
                            alt="Zoomed Spectrogram"
                            crossOrigin="use-credentials"
                            className="max-w-full max-h-[85vh] object-contain rounded-lg border border-neutral-800 shadow-2xl animate-scale-in"
                        />
                    </div>
                    <div className="mt-4 text-xs text-neutral-400 font-medium">
                        Click anywhere outside the spectrogram or 'X' to close zoom view
                    </div>
                </div>
            )}
        </div>
    );
}
