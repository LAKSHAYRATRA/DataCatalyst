import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../lib/api.js";
import AdminNav from "../components/AdminNav.jsx";
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

    useEffect(() => {
        loadCalls();
    }, [pagination.page]);

    async function loadCalls() {
        try {
            setLoading(true);
            const data = await apiGet(`/api/admin/calls?page=${pagination.page}&limit=${pagination.limit}`);
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
                        duration: Number(call.recordingADurationMinutes || 0).toFixed(2),
                    },
                    {
                        folder: "speaker2",
                        user: call.userB,
                        file: call.recordingBFile,
                        status: call.recordingBStatus,
                        duration: Number(call.recordingBDurationMinutes || 0).toFixed(2),
                    },
                ].filter((s) => s.file && s.user?._id && s.status === "approved");

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
                    duration: Number(call.recordingADurationMinutes || 0).toFixed(2),
                },
                {
                    folder: "speaker2",
                    user: call.userB,
                    file: call.recordingBFile,
                    reviewNote: call.recordingBReviewNote,
                    payout: Number(call.recordingBPayoutUsd || 0).toFixed(2),
                    duration: Number(call.recordingBDurationMinutes || 0).toFixed(2),
                },
            ].filter((speaker) => speaker.file && speaker.user?._id);

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
                        {/* Calls Table */}
                        <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-neutral-700">
                                        <tr>
                                            <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Call ID</th>
                                            <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Users</th>
                                            <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Topic</th>
                                            <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Language</th>
                                            <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Started</th>
                                            <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Duration</th>
                                            <th className="hidden sm:table-cell px-3 md:px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">End Reason</th>
                                            <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Call Status</th>
                                            <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-700">
                                        {calls.map((call) => (
                                            <tr key={call.callId} className="hover:bg-neutral-700/50 transition-colors">
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
                                                <td className="px-3 md:px-6 py-4 whitespace-nowrap text-xs">
                                                    <div className="flex flex-col sm:flex-row gap-1">
                                                        <button
                                                            onClick={() => {
                                                                setSelectedCall(call);
                                                                setRecordingNotes({
                                                                    [call.userA?._id]: call.recordingAReviewNote || "",
                                                                    [call.userB?._id]: call.recordingBReviewNote || ""
                                                                });
                                                            }}
                                                            className="text-warning-400 hover:text-warning-300"
                                                        >
                                                            View
                                                        </button>
                                                        {/* Status change handled in View modal */}
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
                    <div className="bg-neutral-800 border border-neutral-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-4 md:p-6 animate-scale-in" onClick={(e) => e.stopPropagation()}>
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
                                        <div className="bg-neutral-700 p-4 rounded-lg">
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
                                            <div className="flex gap-2">
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
                                        <div className="bg-neutral-700 p-4 rounded-lg">
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
                                            <div className="flex gap-2">
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
        </div>
    );
}
