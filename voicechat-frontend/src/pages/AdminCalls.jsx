import React, { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPostJson, apiDeleteJson } from "../lib/api.js";
import AdminNav from "../components/AdminNav.jsx";
import AudioVisualizer from "../components/AudioVisualizer.jsx";
import MergedCallStudio from "../components/MergedCallStudio.jsx";
import { fetchAndConvertToWav, fetchDirectAudioBlob } from "../lib/audioToWav.js";
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
    const isAdmin = Boolean(userInfo?.isAdmin || userInfo?.role === 'admin');
    const navigate = useNavigate();
    const [calls, setCalls] = useState([]);
    const [statusFilter, setStatusFilter] = useState("");
    const [rejectedSubTab, setRejectedSubTab] = useState("pending_rejected");
    const [pipelineSubTab, setPipelineSubTab] = useState("calls");
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selectedCall, setSelectedCall] = useState(null);
    const [mergedStudioCall, setMergedStudioCall] = useState(null);
    const [recordingNotes, setRecordingNotes] = useState({});
    const [rejectionReasons, setRejectionReasons] = useState({});
    const [selectedCalls, setSelectedCalls] = useState(new Set());
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

    const [selectedCallIds, setSelectedCallIds] = useState([]);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const [isTranscribingMonologue, setIsTranscribingMonologue] = useState({});
    const [isTranscribingCall, setIsTranscribingCall] = useState({});

    useEffect(() => {
        setSelectedCallIds([]);
        loadCalls();
    }, [pagination.page, statusFilter, rejectedSubTab, pipelineSubTab]);

    const displayCalls = useMemo(() => {
        const isMonologueView = (statusFilter === "rejected" && rejectedSubTab === "monologued") ||
                                (["pending_segmentation", "pending_transcription", "finished"].includes(statusFilter) && pipelineSubTab === "monologues");
        if (isMonologueView) {
            const monologueItems = [];
            calls.forEach(call => {
                const hasA = call.recordingAMonologueStatus === 'transcribed' || (call.isMonologued && call.monologueDetails?.speakerUsed === 'userA') || (call.isMonologued && call.monologueDetails?.userA?.status === 'transcribed');
                const hasB = call.recordingBMonologueStatus === 'transcribed' || (call.isMonologued && call.monologueDetails?.speakerUsed === 'userB') || (call.isMonologued && call.monologueDetails?.userB?.status === 'transcribed');
                
                if (hasA) {
                    monologueItems.push({
                        ...call,
                        monologueUniqueKey: `${call.callId}_userA`,
                        monologueSpeaker: 'userA',
                        monologueSpeakerLabel: 'Speaker A',
                        monologueUser: call.userA,
                        monologueAudioFile: call.recordingAFile,
                        monologueStatus: 'transcribed',
                        monologueDetailsItem: call.monologueDetails?.userA || call.monologueDetails
                    });
                }
                if (hasB) {
                    monologueItems.push({
                        ...call,
                        monologueUniqueKey: `${call.callId}_userB`,
                        monologueSpeaker: 'userB',
                        monologueSpeakerLabel: 'Speaker B',
                        monologueUser: call.userB,
                        monologueAudioFile: call.recordingBFile,
                        monologueStatus: 'transcribed',
                        monologueDetailsItem: call.monologueDetails?.userB || call.monologueDetails
                    });
                }
                if (!hasA && !hasB && call.isMonologued) {
                    monologueItems.push({
                        ...call,
                        monologueUniqueKey: `${call.callId}_monologue`,
                        monologueSpeaker: call.monologueDetails?.speakerUsed || 'userA',
                        monologueSpeakerLabel: call.monologueDetails?.speakerUsed === 'userB' ? 'Speaker B' : 'Speaker A',
                        monologueUser: call.monologueDetails?.speakerUsed === 'userB' ? call.userB : call.userA,
                        monologueAudioFile: call.monologueDetails?.speakerUsed === 'userB' ? call.recordingBFile : call.recordingAFile,
                        monologueStatus: 'transcribed',
                        monologueDetailsItem: call.monologueDetails
                    });
                }
            });
            return monologueItems;
        }
        return calls;
    }, [calls, statusFilter, rejectedSubTab, pipelineSubTab]);

    const isAllSelected = displayCalls.length > 0 && displayCalls.every(c => selectedCallIds.includes(c.monologueUniqueKey || c.callId));

    const toggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedCallIds([]);
        } else {
            setSelectedCallIds(displayCalls.map(c => c.monologueUniqueKey || c.callId));
        }
    };

    const toggleSelectCall = (callId) => {
        setSelectedCallIds(prev =>
            prev.includes(callId) ? prev.filter(id => id !== callId) : [...prev, callId]
        );
    };

    async function loadCalls() {
        try {
            setLoading(true);
            const statusParam = statusFilter ? `&status=${statusFilter}` : "";
            const subTabParam = (statusFilter === "rejected" && isAdmin && rejectedSubTab) ? `&rejectedSubTab=${rejectedSubTab}` : "";
            const pipelineSubTabParam = ["pending_segmentation", "pending_transcription", "finished"].includes(statusFilter) ? `&pipelineSubTab=${pipelineSubTab}` : "";
            const data = await apiGet(`/api/admin/calls?page=${pagination.page}&limit=${pagination.limit}${statusParam}${subTabParam}${pipelineSubTabParam}`);
            setCalls(data.calls || []);
            setPagination(data.pagination || { page: 1, limit: 20, total: 0, pages: 0 });
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

    function metadataForSpeaker(call, speakerLabel, user, duration, isNoisy) {
        const userObj = (typeof user === "object" && user !== null) ? user : {};
        const age = userObj.dob ? new Date().getFullYear() - new Date(userObj.dob).getFullYear() : "";
        const speakerId = userObj.speaker_id || userObj.username || (userObj._id ? String(userObj._id) : "");
        const audioPath = speakerId ? `audio/${speakerId}-${call.callId}.wav` : "";
        const data = [
            ["speaker_id", speakerId],
            ["age", age],
            ["gender", userObj.gender || ""],
            ["region", userObj.address?.state || ""],
            ["accent", userObj.locality || ""],
            ["dialect", userObj.regionalLanguage || ""],
            ["topic_of_conversation", call.topicId?.title || ""],
            ["subtopic", call.subtopicId?.title || ""],
            ["description", call.subtopicId?.description || ""],
            ["duration_minutes", duration ?? ""],
            ["is_noisy", isNoisy ? "true" : "false"],
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

    function getSpeakerList(call) {
        const getSpeakerInfo = (user, file, status, duration, isNoisy, folder, isSpeakerA) => {
            if (!file || !user) return null;
            const userId = (user._id || user.id || user).toString();
            const speakerId = user.speaker_id || user.username || userId || (isSpeakerA ? "speakerA" : "speakerB");
            return {
                folder,
                user,
                userId,
                speakerId,
                file,
                status,
                duration,
                isNoisy,
            };
        };

        return [
            getSpeakerInfo(call.userA, call.recordingAFile, call.recordingAStatus, calcSpeakerDuration(call, true), !!call.recordingANoisy, "speaker1", true),
            getSpeakerInfo(call.userB, call.recordingBFile, call.recordingBStatus, calcSpeakerDuration(call, false), !!call.recordingBNoisy, "speaker2", false),
        ].filter(Boolean);
    }

    function getCallCategoryFolder(call) {
        const isNoisy = Boolean(
            call.recordingANoisy ||
            call.recordingBNoisy ||
            call.recordingARejectionReason === "Noisy" ||
            call.recordingBRejectionReason === "Noisy"
        );
        return isNoisy ? "Noisy" : "Clean";
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

                const speakers = getSpeakerList(call);

                const categoryFolder = getCallCategoryFolder(call);
                for (const speaker of speakers) {
                    try {
                        const speakerFileBase = `${speaker.speakerId}-${call.callId}`;
                        const blob = await fetchRecordingBlob(call.callId, speaker.userId, speaker.file);
                        allFiles.push({
                            path: `${categoryFolder}/${call.callId}/${speakerFileBase}.wav`,
                            data: new Uint8Array(await blob.arrayBuffer()),
                            modifiedAt: new Date(),
                        });
                        allFiles.push({
                            path: `${categoryFolder}/${call.callId}/${speakerFileBase}_metadata.csv`,
                            data: textEncoder.encode(metadataForSpeaker(call, speaker.folder, speaker.user, speaker.duration, speaker.isNoisy)),
                            modifiedAt: new Date(),
                        });
                    } catch (err) {
                        console.error(`Failed to fetch speaker ${speaker.speakerId} for call ${call.callId}:`, err);
                    }
                }

                // Mark as downloaded on backend
                try {
                    await postDownloadLog(call.callId);
                } catch (err) {
                    console.error("Failed to post download log for", call.callId, err);
                }
            }

            if (allFiles.length === 0) {
                Swal.fire({
                    icon: 'warning',
                    title: 'No Audio Files',
                    text: 'No recording audio files were found or downloaded.',
                    confirmButtonColor: '#ea580c'
                });
                return;
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

    async function handleDownloadSelected() {
        if (isBulkDownloading || selectedCallIds.length === 0) return;
        const callsToDownload = calls.filter(c => selectedCallIds.includes(c.callId));
        if (callsToDownload.length === 0) return;

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

                const speakers = getSpeakerList(call);

                const categoryFolder = getCallCategoryFolder(call);
                for (const speaker of speakers) {
                    try {
                        const speakerFileBase = `${speaker.speakerId}-${call.callId}`;
                        const blob = await fetchRecordingBlob(call.callId, speaker.userId, speaker.file);
                        allFiles.push({
                            path: `${categoryFolder}/${call.callId}/${speakerFileBase}.wav`,
                            data: new Uint8Array(await blob.arrayBuffer()),
                            modifiedAt: new Date(),
                        });
                        allFiles.push({
                            path: `${categoryFolder}/${call.callId}/${speakerFileBase}_metadata.csv`,
                            data: textEncoder.encode(metadataForSpeaker(call, speaker.folder, speaker.user, speaker.duration, speaker.isNoisy)),
                            modifiedAt: new Date(),
                        });
                    } catch (err) {
                        console.error(`Failed to fetch speaker ${speaker.speakerId} for call ${call.callId}:`, err);
                    }
                }

                try {
                    await postDownloadLog(call.callId);
                } catch (err) {
                    console.error("Failed to post download log for", call.callId, err);
                }
            }

            if (allFiles.length === 0) {
                Swal.fire({
                    icon: 'warning',
                    title: 'No Audio Files',
                    text: 'No audio recording files were found for the selected calls.',
                    confirmButtonColor: '#ea580c'
                });
                return;
            }

            setBulkProgress((prev) => ({ ...prev, label: "Creating master ZIP..." }));
            const zipBlob = await createStoredZip(allFiles);

            const url = window.URL.createObjectURL(zipBlob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `Selected_Calls_${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            Swal.fire({
                icon: 'success',
                title: 'Success',
                text: 'Selected calls downloaded successfully!',
                confirmButtonColor: '#ea580c'
            });
            await loadCalls();
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

    async function handleDeleteSelected() {
        if (selectedCallIds.length === 0 || isBulkDeleting) return;

        const result = await Swal.fire({
            title: 'Delete Selected Calls?',
            text: `Are you sure you want to permanently delete ${selectedCallIds.length} call(s)? This will remove all audio files from S3/storage and permanently erase call records from the database. This action CANNOT be undone!`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#404040',
            confirmButtonText: 'Yes, delete permanently'
        });

        if (!result.isConfirmed) return;

        setIsBulkDeleting(true);
        try {
            const res = await apiPostJson("/api/admin/calls/bulk-delete", { callIds: selectedCallIds });

            Swal.fire({
                icon: 'success',
                title: 'Deleted Successfully',
                text: res.message || `${res.deletedCount || selectedCallIds.length} call(s) deleted.`,
                timer: 2000,
                showConfirmButton: false
            });
            setSelectedCallIds([]);
            await loadCalls();
        } catch (e) {
            Swal.fire({
                icon: 'error',
                title: 'Delete Failed',
                text: e.message,
                confirmButtonColor: '#ea580c'
            });
        } finally {
            setIsBulkDeleting(false);
        }
    }

    async function handleDeleteSingleCall(callId) {
        const result = await Swal.fire({
            title: 'Delete Call Record?',
            text: 'Are you sure you want to permanently delete this call record and its audio files from database and storage? This cannot be undone.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#404040',
            confirmButtonText: 'Yes, delete call'
        });

        if (!result.isConfirmed) return;

        try {
            try {
                await apiDeleteJson(`/api/admin/calls/${callId}`);
            } catch (err) {
                if (err.status === 404) {
                    await apiDeleteJson(`/api/admin/qa/calls/${callId}`);
                } else {
                    throw err;
                }
            }
            setSelectedCall(null);
            await loadCalls();
            Swal.fire({
                icon: 'success',
                title: 'Call Deleted',
                timer: 1500,
                showConfirmButton: false
            });
        } catch (e) {
            Swal.fire({
                icon: 'error',
                title: 'Delete Failed',
                text: e.message,
                confirmButtonColor: '#ea580c'
            });
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

            const speakers = getSpeakerList(call);

            if (!speakers.length) throw new Error("No recordings available");

            const files = [];
            const textEncoder = new TextEncoder();
            const rootFolder = `call_${call.callId}`;

            for (const speaker of speakers) {
                const displayName = speaker.user?.username || speaker.speakerId;
                setDownloadStep(`Fetching ${displayName}'s recording...`);
                const speakerFileBase = `${speaker.speakerId}-${call.callId}`;
                const blob = await fetchRecordingBlob(call.callId, speaker.userId, speaker.file);
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

            if (files.length === 0) {
                throw new Error("No audio files could be fetched for this call.");
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

    async function handleSendAsMonologue(callId, speaker, username) {
        const speakerLabel = speaker === "userA" ? "Speaker A" : "Speaker B";
        const result = await Swal.fire({
            title: 'Transcribe as Monologue?',
            html: `Send <strong>${username || speakerLabel}</strong>'s recording for individual monologue transcription?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#9333ea',
            cancelButtonColor: '#404040',
            confirmButtonText: 'Yes, Transcribe Monologue'
        });

        if (!result.isConfirmed) return;

        const key = `${callId}_${speaker}`;
        try {
            setIsTranscribingMonologue(prev => ({ ...prev, [key]: true }));
            const data = await apiPostJson(`/api/admin/calls/${callId}/transcribe-monologue`, { speaker });
            
            Swal.fire({
                icon: 'success',
                title: 'Sent for Transcription!',
                text: data.message || `Audio for ${username || speakerLabel} is now in the monologue transcription queue.`,
                timer: 2000,
                showConfirmButton: false
            });

            if (selectedCall?.callId === callId) {
                setSelectedCall(prev => ({
                    ...prev,
                    isMonologued: true,
                    recordingAMonologueStatus: speaker === 'userA' ? 'transcribed' : prev.recordingAMonologueStatus,
                    recordingBMonologueStatus: speaker === 'userB' ? 'transcribed' : prev.recordingBMonologueStatus,
                    monologueDetails: data.call?.monologueDetails || prev.monologueDetails
                }));
            }
            await loadCalls();
        } catch (err) {
            Swal.fire({
                icon: 'error',
                title: 'Action Failed',
                text: err.message || 'Could not send audio for monologue transcription.',
                confirmButtonColor: '#ea580c'
            });
        } finally {
            setIsTranscribingMonologue(prev => ({ ...prev, [key]: false }));
        }
    }

    async function handleRejectAsMonologue(callId, speaker, username) {
        const speakerLabel = speaker === "userA" ? "Speaker A" : "Speaker B";
        const result = await Swal.fire({
            title: 'Reject as Monologue?',
            text: `Dismiss ${username || speakerLabel}'s recording from monologue transcription?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#404040',
            confirmButtonText: 'Yes, Reject Monologue'
        });

        if (!result.isConfirmed) return;

        const key = `${callId}_${speaker}`;
        try {
            setIsTranscribingMonologue(prev => ({ ...prev, [key]: true }));
            const data = await apiPostJson(`/api/admin/calls/${callId}/reject-monologue`, { speaker });
            
            Swal.fire({
                icon: 'info',
                title: 'Monologue Dismissed',
                text: data.message || `Recording for ${username || speakerLabel} will not be monologued.`,
                timer: 2000,
                showConfirmButton: false
            });

            if (selectedCall?.callId === callId) {
                setSelectedCall(prev => ({
                    ...prev,
                    recordingAMonologueStatus: speaker === 'userA' ? 'rejected' : prev.recordingAMonologueStatus,
                    recordingBMonologueStatus: speaker === 'userB' ? 'rejected' : prev.recordingBMonologueStatus,
                    monologueDetails: data.call?.monologueDetails || prev.monologueDetails
                }));
            }
            await loadCalls();
        } catch (err) {
            Swal.fire({
                icon: 'error',
                title: 'Action Failed',
                text: err.message || 'Could not reject monologue recording.',
                confirmButtonColor: '#ea580c'
            });
        } finally {
            setIsTranscribingMonologue(prev => ({ ...prev, [key]: false }));
        }
    }

    async function handleSendAsCall(callId) {
        const result = await Swal.fire({
            title: 'Transcribe as Full Call Dialogue?',
            html: `Send the complete 2-person call recording for <strong>full call transcription</strong>?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#4f46e5',
            cancelButtonColor: '#404040',
            confirmButtonText: 'Yes, Transcribe as Call'
        });

        if (!result.isConfirmed) return;

        try {
            setIsTranscribingCall(prev => ({ ...prev, [callId]: true }));
            const data = await apiPostJson(`/api/admin/calls/${callId}/transcribe-call`, {});
            
            Swal.fire({
                icon: 'success',
                title: 'Sent for Full Call Transcription!',
                text: data.message || `Call is now in the transcription queue as a complete dialogue.`,
                timer: 2000,
                showConfirmButton: false
            });

            if (selectedCall?.callId === callId) {
                setSelectedCall(prev => ({
                    ...prev,
                    transcribedAsCall: true,
                    callTranscriptionStatus: 'transcribed',
                    isMonologued: false
                }));
            }
            await loadCalls();
        } catch (err) {
            Swal.fire({
                icon: 'error',
                title: 'Action Failed',
                text: err.message || 'Could not send audio for call transcription.',
                confirmButtonColor: '#ea580c'
            });
        } finally {
            setIsTranscribingCall(prev => ({ ...prev, [callId]: false }));
        }
    }

    async function handleCancelSendAsCall(callId) {
        const result = await Swal.fire({
            title: 'Remove from Transcription?',
            text: 'Remove this call from the call transcription queue?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#404040',
            confirmButtonText: 'Yes, Remove'
        });

        if (!result.isConfirmed) return;

        try {
            setIsTranscribingCall(prev => ({ ...prev, [callId]: true }));
            const data = await apiPostJson(`/api/admin/calls/${callId}/cancel-transcribe-call`, {});
            
            Swal.fire({
                icon: 'info',
                title: 'Removed from Transcription',
                text: data.message || `Call removed from transcription queue.`,
                timer: 2000,
                showConfirmButton: false
            });

            if (selectedCall?.callId === callId) {
                setSelectedCall(prev => ({
                    ...prev,
                    transcribedAsCall: false,
                    callTranscriptionStatus: null,
                    isApprovedForTranscription: false
                }));
            }
            await loadCalls();
        } catch (err) {
            Swal.fire({
                icon: 'error',
                title: 'Action Failed',
                text: err.message || 'Could not remove call from transcription.',
                confirmButtonColor: '#ea580c'
            });
        } finally {
            setIsTranscribingCall(prev => ({ ...prev, [callId]: false }));
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
        if (!rejectionReasons[userId]) {
            Swal.fire({
                icon: 'warning',
                title: 'Rejection Reason Required',
                text: 'Please select a rejection reason (Off-Topic Conversation or Noisy) before rejecting this recording.',
                confirmButtonColor: '#ea580c'
            });
            return;
        }

        try {
            const note = recordingNotes[userId] || "";
            const isNoisy = rejectionReasons[userId] === "Noisy" || (selectedCall?.userA?._id?.toString() === userId.toString()
                ? !!selectedCall?.recordingANoisy
                : !!selectedCall?.recordingBNoisy);

            const data = await apiPatchJson(`/api/admin/calls/${callId}/reject/${userId}`, {
                note: note.trim(),
                isNoisy,
                rejectionReason: rejectionReasons[userId]
            });
            if (selectedCall?.callId === callId) setSelectedCall((prev) => mergeReviewFields(prev, data.call));
            await loadCalls();  // Refresh list
        } catch (e) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: e.message,
                confirmButtonColor: '#ea580c'
            });
        }
    }

    async function toggleNoisy(callId, userId, isNoisy) {
        try {
            await apiPatchJson(`/api/admin/calls/${callId}/noisy/${userId}`, { isNoisy });
            // Refresh call state
            const data = await apiGet(`/api/admin/calls/${callId}`);
            setSelectedCall(data);
            await loadCalls();
        } catch (e) {
            Swal.fire({ icon: 'error', title: 'Error', text: e.message, confirmButtonColor: '#ea580c' });
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
            const audioBlob = await fetchDirectAudioBlob(url);
            setAudioUrls((prev) => ({ ...prev, [key]: URL.createObjectURL(audioBlob) }));
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
                        <div className="flex flex-wrap items-center gap-1.5 mb-4 border-b border-neutral-700 pb-3">
                            {[
                                { label: "Pending", value: "pending" },
                                { label: "Approved", value: "approved" },
                                { label: "Rejected", value: "rejected" },
                                { label: "Pending Segmentation", value: "pending_segmentation", badge: "✂️" },
                                { label: "Pending Transcription", value: "pending_transcription", badge: "📝" },
                                { label: "Finished", value: "finished", badge: "🎉" },
                                { label: "Call Logs", value: "logs" },
                                { label: "All Calls", value: "" }
                            ].map((tab) => (
                                <button
                                    key={tab.label}
                                    onClick={() => {
                                        setStatusFilter(tab.value);
                                        setPagination(prev => ({ ...prev, page: 1 }));
                                    }}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                                        statusFilter === tab.value
                                            ? "bg-warning-600 text-white shadow-md shadow-warning-900/20"
                                            : "bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-700"
                                    }`}
                                >
                                    {tab.badge && <span>{tab.badge}</span>}
                                    <span>{tab.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Pipeline Subtabs: Pending Segmentation, Pending Transcription, Finished */}
                        {["pending_segmentation", "pending_transcription", "finished"].includes(statusFilter) && (
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 p-3 bg-neutral-800/80 border border-neutral-700/80 rounded-xl animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider mr-1">
                                        {statusFilter === "pending_segmentation" ? "Segmentation Pipeline:" : statusFilter === "pending_transcription" ? "Transcription Pipeline:" : "Completed Pipeline:"}
                                    </span>
                                    <button
                                        onClick={() => {
                                            setPipelineSubTab("calls");
                                            setPagination(prev => ({ ...prev, page: 1 }));
                                        }}
                                        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                            pipelineSubTab === "calls"
                                                ? "bg-indigo-600 text-white shadow-md shadow-indigo-950/40"
                                                : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-700"
                                        }`}
                                    >
                                        <span>📞 Calls</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setPipelineSubTab("monologues");
                                            setPagination(prev => ({ ...prev, page: 1 }));
                                        }}
                                        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                            pipelineSubTab === "monologues"
                                                ? "bg-purple-600 text-white shadow-md shadow-purple-950/40"
                                                : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-700"
                                        }`}
                                    >
                                        <span>🎙️ Monologues</span>
                                    </button>
                                </div>
                                <div className="text-xs text-neutral-400 font-medium">
                                    {statusFilter === "pending_segmentation" && "Calls & monologues pending waveform segmentation or QA review"}
                                    {statusFilter === "pending_transcription" && "Segmentation QA approved • Pending transcription text or QA review"}
                                    {statusFilter === "finished" && "Completed end-to-end (Segmentation QA ✓ & Transcription QA ✓)"}
                                </div>
                            </div>
                        )}

                        {statusFilter === "rejected" && (
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 p-3 bg-neutral-800/80 border border-neutral-700/80 rounded-xl animate-in fade-in slide-in-from-top-2 duration-200">
                                {isAdmin ? (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider mr-1">
                                            Rejected View:
                                        </span>
                                        <button
                                            onClick={() => {
                                                setRejectedSubTab("pending_rejected");
                                                setPagination(prev => ({ ...prev, page: 1 }));
                                            }}
                                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                                                rejectedSubTab === "pending_rejected"
                                                    ? "bg-amber-600 text-white shadow-md shadow-amber-950/40"
                                                    : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-700"
                                            }`}
                                        >
                                            <span>⏳ Pending Rejected</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                setRejectedSubTab("monologued");
                                                setPagination(prev => ({ ...prev, page: 1 }));
                                            }}
                                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                                                rejectedSubTab === "monologued"
                                                    ? "bg-purple-600 text-white shadow-md shadow-purple-950/40"
                                                    : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-700"
                                            }`}
                                        >
                                            <span>🎙️ Monologued</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                setRejectedSubTab("");
                                                setPagination(prev => ({ ...prev, page: 1 }));
                                            }}
                                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                                                rejectedSubTab === ""
                                                    ? "bg-neutral-600 text-white shadow-md"
                                                    : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-700"
                                            }`}
                                        >
                                            <span>All Rejected</span>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-xs text-neutral-400 font-medium">
                                        Viewing Rejected Calls
                                    </div>
                                )}

                                <button
                                    onClick={handlePurgeRejected}
                                    className="inline-flex items-center px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-md shadow-red-950/20 transition-all transform active:scale-95 border border-red-500/30 ml-auto"
                                >
                                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Purge Rejected
                                </button>
                            </div>
                        )}

                        {/* Bulk Action Toolbar for Selected Calls */}
                        {selectedCallIds.length > 0 && (
                            <div className="bg-warning-950/60 border border-warning-700/60 rounded-xl p-4 mb-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-fade-in">
                                <div className="flex items-center gap-3">
                                    <span className="bg-warning-600 text-white font-bold text-xs px-2.5 py-1 rounded-full">
                                        {selectedCallIds.length} Selected
                                    </span>
                                    <span className="text-neutral-300 text-sm font-medium">
                                        Apply bulk action to selected call(s):
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 w-full sm:w-auto">
                                    <button
                                        onClick={handleDownloadSelected}
                                        disabled={isBulkDownloading || isBulkDeleting}
                                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-warning-600 hover:bg-warning-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-all"
                                    >
                                        {isBulkDownloading ? "Downloading..." : "⬇ Download Selected ZIP"}
                                    </button>
                                    <button
                                        onClick={handleDeleteSelected}
                                        disabled={isBulkDownloading || isBulkDeleting}
                                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-error-600 hover:bg-error-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-all"
                                    >
                                        {isBulkDeleting ? "Deleting..." : "🗑 Delete Selected (DB & S3)"}
                                    </button>
                                    <button
                                        onClick={() => setSelectedCallIds([])}
                                        className="px-3 py-2 text-neutral-400 hover:text-white text-xs"
                                    >
                                        Clear Selection
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Calls Table */}
                        <div className="bg-neutral-800 rounded-xl overflow-hidden shadow-xl border border-neutral-700">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-neutral-900 border-b border-neutral-700">
                                        <tr>
                                            <th className="w-8 px-2 py-2.5 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={isAllSelected}
                                                    onChange={toggleSelectAll}
                                                    className="w-3.5 h-3.5 rounded accent-warning-500 cursor-pointer"
                                                    title="Select All Calls on this page"
                                                />
                                            </th>
                                            {statusFilter === "logs" ? (
                                                <>
                                                    <th className="px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Call ID</th>
                                                    <th className="px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Participants</th>
                                                    <th className="px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Speaker IDs</th>
                                                    <th className="hidden md:table-cell px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Topic</th>
                                                    <th className="px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Reviewed By (QA)</th>
                                                    <th className="px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Verdict</th>
                                                    <th className="hidden lg:table-cell px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Date</th>
                                                    <th className="px-3 py-2.5 text-left text-xs font-bold text-warning-400 uppercase tracking-tight">Actions</th>
                                                </>
                                            ) : (statusFilter === "rejected" && rejectedSubTab === "monologued") || (["pending_segmentation", "pending_transcription", "finished"].includes(statusFilter) && pipelineSubTab === "monologues") ? (
                                                <>
                                                    <th className="px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Call ID</th>
                                                    <th className="px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Monologue Speaker</th>
                                                    <th className="px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Speaker ID</th>
                                                    <th className="hidden md:table-cell px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Topic</th>
                                                    <th className="hidden md:table-cell px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Language</th>
                                                    <th className="px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Duration</th>
                                                    <th className="px-2.5 py-2.5 text-left text-xs font-bold text-purple-400 uppercase tracking-tight">Pipeline Status</th>
                                                    <th className="px-3 py-2.5 text-left text-xs font-bold text-warning-400 uppercase tracking-tight">Actions</th>
                                                </>
                                            ) : ["pending_segmentation", "pending_transcription", "finished"].includes(statusFilter) && pipelineSubTab === "calls" ? (
                                                <>
                                                    <th className="px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Call ID</th>
                                                    <th className="px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Speakers</th>
                                                    <th className="hidden md:table-cell px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Topic</th>
                                                    <th className="hidden md:table-cell px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Language</th>
                                                    <th className="px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Duration</th>
                                                    <th className="px-2.5 py-2.5 text-left text-xs font-bold text-indigo-400 uppercase tracking-tight">Segmentation QA</th>
                                                    <th className="px-2.5 py-2.5 text-left text-xs font-bold text-blue-400 uppercase tracking-tight">Transcription QA</th>
                                                    <th className="px-3 py-2.5 text-left text-xs font-bold text-warning-400 uppercase tracking-tight">Actions</th>
                                                </>
                                            ) : statusFilter === "rejected" ? (
                                                <>
                                                    <th className="px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Call ID</th>
                                                    <th className="px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Speakers & Verdict</th>
                                                    <th className="hidden md:table-cell px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Topic</th>
                                                    <th className="hidden md:table-cell px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Language</th>
                                                    <th className="px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Duration</th>
                                                    {isAdmin ? (
                                                        <th className="px-2.5 py-2.5 text-left text-xs font-bold text-purple-400 uppercase tracking-tight">Monologue Status</th>
                                                    ) : (
                                                        <th className="px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Verdict</th>
                                                    )}
                                                    <th className="px-3 py-2.5 text-left text-xs font-bold text-warning-400 uppercase tracking-tight">Actions</th>
                                                </>
                                            ) : (
                                                <>
                                                    <th className="px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Call ID</th>
                                                    <th className="px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Users</th>
                                                    <th className="hidden md:table-cell px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Topic</th>
                                                    <th className="hidden md:table-cell px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Language</th>
                                                    <th className="hidden lg:table-cell px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Started</th>
                                                    <th className="px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Duration</th>
                                                    <th className="hidden sm:table-cell px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">End Reason</th>
                                                    <th className="px-2.5 py-2.5 text-left text-xs font-semibold text-neutral-300 uppercase tracking-tight">Call Status</th>
                                                    <th className="px-3 py-2.5 text-left text-xs font-bold text-warning-400 uppercase tracking-tight">Actions</th>
                                                </>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-700">
                                        {displayCalls.map((call) => {
                                            const rowKey = call.monologueUniqueKey || call.callId;
                                            return (
                                            <tr key={rowKey} className={`group hover:bg-neutral-700/50 transition-colors ${selectedCallIds.includes(rowKey) ? 'bg-warning-950/20' : ''}`}>
                                                <td className="w-8 px-2 py-2 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedCallIds.includes(rowKey)}
                                                        onChange={() => toggleSelectCall(rowKey)}
                                                        className="w-3.5 h-3.5 rounded accent-warning-500 cursor-pointer"
                                                    />
                                                </td>
                                                {statusFilter === "logs" ? (
                                                    <>
                                                        {/* Call ID */}
                                                        <td className="px-2.5 py-2 whitespace-nowrap">
                                                            <div className="text-xs font-mono text-neutral-300" title={call.callId}>
                                                                {call.callId.slice(0, 8)}...
                                                            </div>
                                                        </td>
                                                        {/* Participants */}
                                                        <td className="px-2.5 py-2">
                                                            <div className="text-xs text-white font-medium">
                                                                A: {call.userA?.username || "Unknown"}
                                                            </div>
                                                            <div className="text-xs text-white font-medium">
                                                                B: {call.userB?.username || "Unknown"}
                                                            </div>
                                                        </td>
                                                        {/* Speaker IDs */}
                                                        <td className="px-2.5 py-2 whitespace-nowrap">
                                                            <div className="text-xs font-mono text-neutral-400">
                                                                A: {call.userA?.speaker_id || "—"}
                                                            </div>
                                                            <div className="text-xs font-mono text-neutral-400">
                                                                B: {call.userB?.speaker_id || "—"}
                                                            </div>
                                                        </td>
                                                        {/* Topic */}
                                                        <td className="hidden md:table-cell px-2.5 py-2">
                                                            {call.subtopicId ? (
                                                                <div className="text-xs font-medium text-white max-w-[140px] truncate" title={call.subtopicId.title}>
                                                                    {call.subtopicId.title}
                                                                </div>
                                                            ) : (
                                                                <span className="text-xs text-neutral-500 italic">-</span>
                                                            )}
                                                        </td>
                                                        {/* Reviewed By (QA) */}
                                                        <td className="px-2.5 py-2 whitespace-nowrap">
                                                            {call.reviewedBy ? (
                                                                <div>
                                                                    <div className="text-xs text-white font-semibold">
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
                                                        <td className="px-2.5 py-2 whitespace-nowrap">
                                                            {getCallStatusBadge(call.callStatus)}
                                                        </td>
                                                        {/* Date */}
                                                        <td className="hidden lg:table-cell px-2.5 py-2 whitespace-nowrap">
                                                            <div className="text-xs text-neutral-300">
                                                                {call.reviewedAt ? formatDate(call.reviewedAt) : formatDate(call.startedAt)}
                                                            </div>
                                                        </td>
                                                    </>
                                                ) : (statusFilter === "rejected" && rejectedSubTab === "monologued") || (["pending_segmentation", "pending_transcription", "finished"].includes(statusFilter) && pipelineSubTab === "monologues") ? (
                                                    <>
                                                        <td className="px-2.5 py-2 whitespace-nowrap">
                                                            <div className="text-xs font-mono text-neutral-300">{call.callId.slice(0, 8)}...</div>
                                                            <div className="text-[10px] text-purple-400 font-mono font-semibold">[{call.monologueSpeakerLabel}]</div>
                                                        </td>
                                                        <td className="px-2.5 py-2">
                                                            <div className="text-xs text-white font-semibold flex items-center gap-1.5">
                                                                <span>🎙️</span>
                                                                <span>{call.monologueUser?.username || "Unknown"}</span>
                                                            </div>
                                                            <div className="text-[10px] text-neutral-400">
                                                                {call.monologueUser?.email || ""}
                                                            </div>
                                                        </td>
                                                        <td className="px-2.5 py-2 whitespace-nowrap">
                                                            <div className="text-xs font-mono text-neutral-300">{call.monologueUser?.speaker_id || "—"}</div>
                                                        </td>
                                                        <td className="hidden md:table-cell px-2.5 py-2">
                                                            <div className="text-xs font-medium text-white max-w-[150px] truncate" title={call.subtopicId?.title}>
                                                                {call.subtopicId?.title || "—"}
                                                            </div>
                                                        </td>
                                                        <td className="hidden md:table-cell px-2.5 py-2 whitespace-nowrap">
                                                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-900/50 text-indigo-300 capitalize">
                                                                {call.language || '—'}
                                                            </span>
                                                        </td>
                                                        <td className="px-2.5 py-2 whitespace-nowrap">
                                                            <div className="text-xs text-neutral-300">{formatDuration(call.recordingAStartedAt || call.startedAt, call.endedAt)}</div>
                                                        </td>
                                                        <td className="px-2.5 py-2 whitespace-nowrap">
                                                            {statusFilter === "pending_segmentation" ? (
                                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-950/70 text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-950/40">
                                                                    ✂️ Pending Cut / QA
                                                                </span>
                                                            ) : statusFilter === "pending_transcription" ? (
                                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-950/70 text-indigo-300 border border-indigo-500/40 shadow-sm shadow-indigo-950/40">
                                                                    📝 In Transcription
                                                                </span>
                                                            ) : statusFilter === "finished" ? (
                                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-950/70 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-950/40">
                                                                    🎉 Finished & QA Verified
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-purple-900/70 text-purple-200 border border-purple-500/50 shadow-sm shadow-purple-950/40">
                                                                    ✓ Monologued ({call.monologueSpeakerLabel})
                                                                </span>
                                                            )}
                                                        </td>
                                                    </>
                                                ) : ["pending_segmentation", "pending_transcription", "finished"].includes(statusFilter) && pipelineSubTab === "calls" ? (
                                                    <>
                                                        <td className="px-2.5 py-2 whitespace-nowrap">
                                                            <div className="text-xs font-mono text-neutral-300">{call.callId.slice(0, 8)}...</div>
                                                        </td>
                                                        <td className="px-2.5 py-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs text-white font-medium">{call.userA?.username || "Speaker A"}</span>
                                                                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${call.recordingAStatus === 'approved' ? 'bg-success-950/60 text-success-300' : 'bg-neutral-800 text-neutral-400'}`}>
                                                                    {call.recordingAStatus === 'approved' ? '✓ Spk A' : 'Spk A'}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-xs text-neutral-300 font-medium">{call.userB?.username || "Speaker B"}</span>
                                                                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${call.recordingBStatus === 'approved' ? 'bg-success-950/60 text-success-300' : 'bg-neutral-800 text-neutral-400'}`}>
                                                                    {call.recordingBStatus === 'approved' ? '✓ Spk B' : 'Spk B'}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="hidden md:table-cell px-2.5 py-2">
                                                            <div className="text-xs font-medium text-white max-w-[150px] truncate" title={call.subtopicId?.title}>
                                                                {call.subtopicId?.title || "—"}
                                                            </div>
                                                        </td>
                                                        <td className="hidden md:table-cell px-2.5 py-2 whitespace-nowrap">
                                                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-900/50 text-indigo-300 capitalize">
                                                                {call.language || '—'}
                                                            </span>
                                                        </td>
                                                        <td className="px-2.5 py-2 whitespace-nowrap">
                                                            <div className="text-xs text-neutral-300">{formatDuration(call.recordingAStartedAt || call.startedAt, call.endedAt)}</div>
                                                        </td>
                                                        {/* Segmentation QA column */}
                                                        <td className="px-2.5 py-2 whitespace-nowrap">
                                                            {call.segmentation_qa ? (
                                                                <span className="px-2 py-0.5 text-xs font-bold rounded-lg bg-emerald-950/70 text-emerald-300 border border-emerald-500/30">
                                                                    ✓ Seg QA Approved
                                                                </span>
                                                            ) : call.Segmentation_Done ? (
                                                                <span className="px-2 py-0.5 text-xs font-bold rounded-lg bg-amber-950/70 text-amber-300 border border-amber-500/30">
                                                                    ⏳ Seg QA Pending
                                                                </span>
                                                            ) : (
                                                                <span className="px-2 py-0.5 text-xs font-medium rounded-lg bg-neutral-800 text-neutral-400 border border-neutral-700">
                                                                    ✂️ Pending Cut
                                                                </span>
                                                            )}
                                                        </td>
                                                        {/* Transcription QA column */}
                                                        <td className="px-2.5 py-2 whitespace-nowrap">
                                                            {call.transcription_status === 'QA_APPROVED' ? (
                                                                <span className="px-2 py-0.5 text-xs font-bold rounded-lg bg-emerald-950/70 text-emerald-300 border border-emerald-500/30">
                                                                    ✓ QA Verified
                                                                </span>
                                                            ) : call.transcription_status === 'TRANSCRIPTION_COMPLETED' ? (
                                                                <span className="px-2 py-0.5 text-xs font-bold rounded-lg bg-indigo-950/70 text-indigo-300 border border-indigo-500/30">
                                                                    ⏳ Transcription QA
                                                                </span>
                                                            ) : call.total_segments > 0 ? (
                                                                <span className="px-2 py-0.5 text-xs font-bold rounded-lg bg-purple-950/70 text-purple-300 border border-purple-500/30">
                                                                    📝 In Progress ({call.qa_verified_segments_count || 0}/{call.total_segments})
                                                                </span>
                                                            ) : (
                                                                <span className="px-2 py-0.5 text-xs font-medium rounded-lg bg-neutral-800 text-neutral-400 border border-neutral-700">
                                                                    ⏳ Queued
                                                                </span>
                                                            )}
                                                        </td>
                                                    </>
                                                ) : statusFilter === "rejected" ? (
                                                    <>
                                                        <td className="px-2.5 py-2 whitespace-nowrap">
                                                            <div className="text-xs font-mono text-neutral-300">{call.callId.slice(0, 8)}...</div>
                                                        </td>
                                                        <td className="px-2.5 py-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs text-white font-medium">{call.userA?.username || "Unknown"}</span>
                                                                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${call.recordingAStatus === 'approved' ? 'bg-success-950/60 text-success-300' : 'bg-error-950/60 text-error-300'}`}>
                                                                    {call.recordingAStatus === 'approved' ? '✓ Approved' : '✗ Rejected'}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-xs text-neutral-300 font-medium">{call.userB?.username || "Unknown"}</span>
                                                                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${call.recordingBStatus === 'approved' ? 'bg-success-950/60 text-success-300' : 'bg-error-950/60 text-error-300'}`}>
                                                                    {call.recordingBStatus === 'approved' ? '✓ Approved' : '✗ Rejected'}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="hidden md:table-cell px-2.5 py-2">
                                                            <div className="text-xs font-medium text-white max-w-[150px] truncate" title={call.subtopicId?.title}>
                                                                {call.subtopicId?.title || "—"}
                                                            </div>
                                                        </td>
                                                        <td className="hidden md:table-cell px-2.5 py-2 whitespace-nowrap">
                                                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-900/50 text-indigo-300 capitalize">
                                                                {call.language || '—'}
                                                            </span>
                                                        </td>
                                                        <td className="px-2.5 py-2 whitespace-nowrap">
                                                            <div className="text-xs text-neutral-300">{formatDuration(call.recordingAStartedAt || call.startedAt, call.endedAt)}</div>
                                                        </td>
                                                        {isAdmin ? (
                                                            <td className="px-2.5 py-2 whitespace-nowrap">
                                                                {call.transcribedAsCall || call.callTranscriptionStatus === 'transcribed' ? (
                                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-900/70 text-indigo-200 border border-indigo-500/50 shadow-sm shadow-indigo-950/40">
                                                                        <span>📞 Transcribed Call</span>
                                                                    </span>
                                                                ) : call.isMonologued ? (
                                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg bg-purple-900/70 text-purple-200 border border-purple-500/50 shadow-sm shadow-purple-950/40">
                                                                        <span>🎙️ Monologued</span>
                                                                        <span className="text-[10px] text-purple-300 font-normal">
                                                                            ({call.monologueDetails?.speakerUsed === 'userA' ? (call.userA?.username || 'Spk A') : (call.userB?.username || 'Spk B')})
                                                                        </span>
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-950/40 text-amber-300 border border-amber-800/40">
                                                                        ⏳ Pending Action
                                                                    </span>
                                                                )}
                                                            </td>
                                                        ) : (
                                                            <td className="px-2.5 py-2 whitespace-nowrap">
                                                                <span className="px-2 py-0.5 text-xs font-bold rounded bg-error-950/60 text-error-300 border border-error-800/50">
                                                                    Rejected
                                                                </span>
                                                            </td>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        <td className="px-2.5 py-2 whitespace-nowrap">
                                                            <div className="text-xs font-mono text-neutral-300">{call.callId.slice(0, 8)}...</div>
                                                        </td>
                                                        <td className="px-2.5 py-2">
                                                            <div className="text-xs text-white font-medium">
                                                                {call.userA?.username || "Unknown"}
                                                            </div>
                                                            <div className="text-xs text-neutral-400">
                                                                {call.userB?.username || "Unknown"}
                                                            </div>
                                                        </td>
                                                        <td className="hidden md:table-cell px-2.5 py-2">
                                                            {call.subtopicId ? (
                                                                <div>
                                                                    <div className="text-xs font-medium text-white leading-tight max-w-[150px] truncate" title={call.subtopicId.title}>
                                                                        {call.subtopicId.title}
                                                                    </div>
                                                                    {call.subtopicId.description && (
                                                                        <div 
                                                                            className="text-[10px] text-neutral-400 mt-0.5 max-w-[150px] truncate"
                                                                            title={call.subtopicId.description}
                                                                        >
                                                                            {call.subtopicId.description}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <span className="text-xs text-neutral-500 italic">-</span>
                                                            )}
                                                        </td>
                                                        <td className="hidden md:table-cell px-2.5 py-2 whitespace-nowrap">
                                                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-900/50 text-indigo-300 capitalize">
                                                                {call.language || '—'}
                                                            </span>
                                                        </td>
                                                        <td className="hidden lg:table-cell px-2.5 py-2 whitespace-nowrap">
                                                            <div className="text-xs text-neutral-300">{formatDate(call.startedAt)}</div>
                                                        </td>
                                                        <td className="px-2.5 py-2 whitespace-nowrap">
                                                            <div className="text-xs text-neutral-300">{formatDuration(call.recordingAStartedAt || call.recordingBStartedAt || call.actualCallStartedAt || call.startedAt, call.endedAt)}</div>
                                                        </td>
                                                        <td className="hidden sm:table-cell px-2.5 py-2 whitespace-nowrap">
                                                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${call.endReason === 'completed' ? 'bg-success-900/50 text-success-300' :
                                                                call.endReason === 'timeout' ? 'bg-warning-900/50 text-warning-300' :
                                                                    'bg-neutral-700 text-neutral-300'
                                                                }`}>
                                                                {call.endReason || 'Unknown'}
                                                            </span>
                                                        </td>
                                                        <td className="px-2.5 py-2 whitespace-nowrap">
                                                            <div className="space-y-0.5">
                                                                {/* User A Status */}
                                                                <div className="flex items-center gap-1.5 text-xs">
                                                                    <span className="text-neutral-300 max-w-[70px] truncate">
                                                                        {call.userA?.username || "User A"}
                                                                    </span>
                                                                    <span className={`text-base leading-none ${call.recordingAStatus === 'approved' ? 'text-success-400' :
                                                                        call.recordingAStatus === 'rejected' ? 'text-error-400' : 'text-warning-400'
                                                                        }`}>
                                                                        {call.recordingAStatus === 'approved' ? '✓' :
                                                                            call.recordingAStatus === 'rejected' ? '✗' : '⏳'}
                                                                    </span>
                                                                </div>
                                                                {/* User B Status */}
                                                                <div className="flex items-center gap-1.5 text-xs">
                                                                    <span className="text-neutral-300 max-w-[70px] truncate">
                                                                        {call.userB?.username || "User B"}
                                                                    </span>
                                                                    <span className={`text-base leading-none ${call.recordingBStatus === 'approved' ? 'text-success-400' :
                                                                        call.recordingBStatus === 'rejected' ? 'text-error-400' : 'text-warning-400'
                                                                        }`}>
                                                                        {call.recordingBStatus === 'approved' ? '✓' :
                                                                            call.recordingBStatus === 'rejected' ? '✗' : '⏳'}
                                                                    </span>
                                                                </div>
                                                                {call.isMonologued && (
                                                                    <div className="mt-1">
                                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-purple-900/60 text-purple-300 border border-purple-500/30">
                                                                            🎙️ Monologued ({call.monologueDetails?.speakerUsed === 'userA' ? (call.userA?.username || 'Spk A') : (call.userB?.username || 'Spk B')})
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </>
                                                )}
                                                {/* Actions */}
                                                <td className="px-3 py-2 whitespace-nowrap text-xs">
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            onClick={() => {
                                                                setSelectedCall(call);
                                                                const uAId = call.userA?._id || call.userA || 'userA';
                                                                const uBId = call.userB?._id || call.userB || 'userB';
                                                                setRecordingNotes({
                                                                    [uAId]: call.recordingAReviewNote || "",
                                                                    [uBId]: call.recordingBReviewNote || ""
                                                                });
                                                                setQcResults({
                                                                    [uAId]: call.recordingAQCResult || null,
                                                                    [uBId]: call.recordingBQCResult || null
                                                                });
                                                            }}
                                                            className="px-3 py-1.5 bg-warning-600/90 hover:bg-warning-500 text-white font-semibold rounded-lg text-xs transition-colors shadow-sm cursor-pointer"
                                                        >
                                                            View
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
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

            {/* Call Details / Monologue Details Modal */}
            {selectedCall && (() => {
                const isIndividualMonologueModal = Boolean(selectedCall.monologueSpeaker && rejectedSubTab === "monologued");
                
                if (isIndividualMonologueModal) {
                    const monoUserId = selectedCall.monologueUser?._id || (typeof selectedCall.monologueUser === 'string' ? selectedCall.monologueUser : 'monoUser');
                    const monoUserName = selectedCall.monologueUser?.username || (typeof selectedCall.monologueUser === 'string' ? selectedCall.monologueUser : 'Speaker');
                    const monoUserEmail = selectedCall.monologueUser?.email || '';

                    return (
                        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={() => setSelectedCall(null)}>
                            <div className="bg-neutral-800 border border-neutral-700 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-4 md:p-6 animate-scale-in" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-between mb-4 md:mb-6">
                                    <div>
                                        <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
                                            <span>🎙️</span>
                                            <span>Monologue Details</span>
                                        </h2>
                                        <p className="text-xs text-neutral-400 mt-0.5">Individual audio extracted for single-speaker transcription</p>
                                    </div>
                                    <button onClick={() => setSelectedCall(null)} className="text-neutral-400 hover:text-white">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                        </svg>
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {/* Monologue Identification Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-neutral-900/60 p-3.5 rounded-lg border border-neutral-700/60">
                                            <div className="text-xs text-neutral-400 mb-1">Monologue ID</div>
                                            <div className="text-purple-300 font-mono text-sm font-bold break-all">
                                                {selectedCall.callId}_{selectedCall.monologueSpeaker}
                                            </div>
                                            <div className="text-[10px] text-neutral-500 font-mono mt-1">
                                                Parent Call: {selectedCall.callId}
                                            </div>
                                        </div>
                                        <div className="bg-neutral-900/60 p-3.5 rounded-lg border border-neutral-700/60 flex flex-col justify-center">
                                            <div className="text-xs text-neutral-400 mb-1.5">Transcription Pipeline</div>
                                            <div className="flex items-center gap-2">
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-purple-900/70 text-purple-200 border border-purple-500/50 shadow-sm">
                                                    <span>🎙️</span>
                                                    <span>In Monologue Queue</span>
                                                </span>
                                                <span className="text-xs text-success-400 font-semibold">✓ Ready</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Speaker & Topic Information */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-neutral-700 p-3.5 rounded-lg">
                                            <div className="text-xs text-neutral-400 mb-1 uppercase font-bold tracking-wider">Speaker Information</div>
                                            <div className="text-white font-semibold text-base flex items-center gap-2">
                                                <span>👤 {monoUserName}</span>
                                                <span className="text-xs px-2 py-0.5 rounded bg-purple-900/80 text-purple-200 border border-purple-600/40">
                                                    {selectedCall.monologueSpeakerLabel || (selectedCall.monologueSpeaker === 'userB' ? 'Speaker B' : 'Speaker A')}
                                                </span>
                                            </div>
                                            {monoUserEmail && <div className="text-xs text-neutral-300 mt-1 break-all">{monoUserEmail}</div>}
                                            <div className="text-xs text-neutral-400 mt-1 font-mono">
                                                Speaker ID: <span className="text-neutral-200">{selectedCall.monologueUser?.speaker_id || '—'}</span>
                                            </div>
                                        </div>

                                        <div className="bg-neutral-700 p-3.5 rounded-lg">
                                            <div className="text-xs text-neutral-400 mb-1 uppercase font-bold tracking-wider">Topic & Language</div>
                                            <div className="text-white text-sm font-semibold">{selectedCall.subtopicId?.title || 'General Discussion'}</div>
                                            {selectedCall.subtopicId?.description && (
                                                <div className="text-xs text-neutral-400 mt-1 line-clamp-2">{selectedCall.subtopicId.description}</div>
                                            )}
                                            <div className="flex items-center gap-2 mt-2">
                                                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-900/50 text-indigo-300 capitalize">
                                                    🌐 {selectedCall.language || 'Hindi'}
                                                </span>
                                                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-neutral-800 text-neutral-300">
                                                    ⏱️ {formatDuration(selectedCall.recordingAStartedAt || selectedCall.startedAt, selectedCall.endedAt)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Single Monologue Audio Player */}
                                    <div className="bg-neutral-700 p-4 rounded-lg">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="text-sm text-white font-semibold flex items-center gap-2">
                                                <span>🔊</span>
                                                <span>Monologue Audio Waveform</span>
                                            </div>
                                            {audioUrls[`${selectedCall.callId}_${monoUserId}`] && (
                                                <span className="text-[10px] text-success-400 font-bold bg-success-950/60 px-2 py-0.5 rounded border border-success-800/40">
                                                    WAV Ready
                                                </span>
                                            )}
                                        </div>

                                        {audioUrls[`${selectedCall.callId}_${monoUserId}`] ? (
                                            <div className="space-y-3">
                                                <AudioVisualizer 
                                                    url={audioUrls[`${selectedCall.callId}_${monoUserId}`]}
                                                    audioRef={{ current: audioRefs.current[`${selectedCall.callId}_${monoUserId}`] }} 
                                                />
                                                <audio 
                                                    ref={(el) => (audioRefs.current[`${selectedCall.callId}_${monoUserId}`] = el)}
                                                    controls 
                                                    src={audioUrls[`${selectedCall.callId}_${monoUserId}`]} 
                                                    className="w-full h-10 rounded" 
                                                    controlsList="nodownload noplaybackrate" 
                                                    onContextMenu={(e) => e.preventDefault()}
                                                />
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={() => loadCallAudio(selectedCall.callId, monoUserId)} 
                                                disabled={loadingAudio[`${selectedCall.callId}_${monoUserId}`]} 
                                                className="w-full py-3 bg-neutral-800 hover:bg-neutral-600 border border-neutral-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                                            >
                                                {loadingAudio[`${selectedCall.callId}_${monoUserId}`] ? (
                                                    <span className="flex items-center gap-2">
                                                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                        Loading WAV Audio...
                                                    </span>
                                                ) : "▶ Load Monologue Audio Waveform"}
                                            </button>
                                        )}

                                        {/* Single Monologue QC Analyzer Card */}
                                        <div className="mt-4 pt-3 border-t border-neutral-600">
                                            <button
                                                onClick={() => runAudioQC(selectedCall.callId, monoUserId)}
                                                disabled={qcLoading[monoUserId]}
                                                className="w-full inline-flex items-center justify-center px-4 py-2 bg-neutral-800 hover:bg-neutral-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold border border-neutral-600 transition-colors"
                                            >
                                                {qcLoading[monoUserId] ? (
                                                    <span className="flex items-center gap-1.5">
                                                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                        Running QC Analysis...
                                                    </span>
                                                ) : (qcResults[monoUserId] ? "🔄 Re-run QC Analyzer" : "📊 Run Audio QC Analyzer")}
                                            </button>
                                            
                                            {qcErrors[monoUserId] && (
                                                <div className="mt-2 text-xs text-error-400 font-medium">
                                                    ⚠️ {qcErrors[monoUserId]}
                                                </div>
                                            )}

                                            {qcResults[monoUserId] && (
                                                <div className="mt-3 space-y-3 bg-neutral-900/50 p-3.5 rounded-lg border border-neutral-700/50">
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-neutral-400">YAMNet Noise Verdict:</span>
                                                        <span className={`font-bold ${qcResults[monoUserId].yamnet.suspicion_rating === 10 ? 'text-error-400' : qcResults[monoUserId].yamnet.suspicion_rating === 5 ? 'text-warning-400' : 'text-success-400'}`}>
                                                            {qcResults[monoUserId].yamnet.rating_label}
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-neutral-300 bg-neutral-800/60 p-2 rounded border border-neutral-700">
                                                        <div>Bit Verdict: <span className="font-bold">{qcResults[monoUserId].freq.bit_verdict}</span></div>
                                                        <div>Noise Floor: <span className="font-bold">{qcResults[monoUserId].freq.noise_floor_db} dBFS</span></div>
                                                        <div>Crest Factor: <span className="font-bold">{qcResults[monoUserId].freq.crest_factor} dB</span></div>
                                                        <div>Processing: <span className="font-bold">{qcResults[monoUserId].freq.processing_verdict}</span></div>
                                                    </div>
                                                    {(qcResults[monoUserId].spectrogram || qcResults[monoUserId].spectrogramS3Key) && (
                                                        <div className="mt-2 bg-black/40 rounded p-1 border border-neutral-800">
                                                            <div className="text-[9px] text-neutral-500 mb-1 font-bold tracking-wider uppercase text-center">Nyquist Spectrogram (Click to zoom)</div>
                                                            <img 
                                                                src={qcResults[monoUserId].spectrogram 
                                                                     ? `data:image/png;base64,${qcResults[monoUserId].spectrogram}`
                                                                     : `${BACKEND_URL}/api/admin/qa/calls/${selectedCall.callId}/spectrogram/${monoUserId}`
                                                                 }
                                                                alt="Spectrogram"
                                                                crossOrigin="use-credentials"
                                                                className="w-full rounded border border-neutral-900 cursor-zoom-in hover:opacity-80 transition-opacity"
                                                                onClick={() => {
                                                                    const src = qcResults[monoUserId].spectrogram 
                                                                        ? `data:image/png;base64,${qcResults[monoUserId].spectrogram}`
                                                                        : `${BACKEND_URL}/api/admin/qa/calls/${selectedCall.callId}/spectrogram/${monoUserId}`;
                                                                    setZoomedImage({ src, title: `${monoUserName}'s Spectrogram` });
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Close Button */}
                                    <div className="pt-2 flex justify-end">
                                        <button
                                            onClick={() => setSelectedCall(null)}
                                            className="px-5 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg text-xs font-semibold transition-all"
                                        >
                                            Close
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                }

                const userAId = selectedCall.userA?._id || (typeof selectedCall.userA === 'string' ? selectedCall.userA : 'userA');
                const userBId = selectedCall.userB?._id || (typeof selectedCall.userB === 'string' ? selectedCall.userB : 'userB');
                const userAName = selectedCall.userA?.username || (typeof selectedCall.userA === 'string' ? selectedCall.userA : 'Speaker A');
                const userBName = selectedCall.userB?.username || (typeof selectedCall.userB === 'string' ? selectedCall.userB : 'Speaker B');
                const userAEmail = selectedCall.userA?.email || '';
                const userBEmail = selectedCall.userB?.email || '';

                return (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={() => setSelectedCall(null)}>
                    <div className="bg-neutral-800 border border-neutral-700 rounded-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto p-4 md:p-6 animate-scale-in" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4 md:mb-6">
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl md:text-2xl font-bold text-white">Call Details</h2>
                                <button
                                    onClick={() => setMergedStudioCall(selectedCall)}
                                    className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 via-indigo-600 to-primary-600 hover:from-emerald-500 hover:to-primary-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/20 flex items-center gap-1.5 transition-all transform hover:scale-[1.02]"
                                >
                                    <span>🎧</span>
                                    <span>See Merged Call</span>
                                </button>
                            </div>
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
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${selectedCall.endReason === 'completed' ? 'bg-success-900/50 text-success-300' :
                                            'bg-neutral-700 text-neutral-300'
                                            }`}>
                                            {selectedCall.endReason || 'Unknown'}
                                        </span>
                                        {selectedCall.isMonologued && (
                                            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-purple-900/70 text-purple-300 border border-purple-500/40">
                                                🎙️ Monologued ({selectedCall.monologueDetails?.speakerUsed === 'userA' ? userAName : userBName})
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div className="text-sm text-neutral-400 mb-2">Participants</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-neutral-700 p-3 rounded-lg">
                                        <div className="text-white font-semibold text-sm md:text-base">{userAName}</div>
                                        {userAEmail && <div className="text-xs text-neutral-400 break-all">{userAEmail}</div>}
                                        {selectedCall.questionerUserId?.toString() === userAId?.toString() && (
                                            <div className="text-xs text-warning-400 mt-1">Questioner</div>
                                        )}
                                        {selectedCall.answererUserId?.toString() === userAId?.toString() && (
                                            <div className="text-xs text-success-400 mt-1">Answerer</div>
                                        )}
                                    </div>
                                    <div className="bg-neutral-700 p-3 rounded-lg">
                                        <div className="text-white font-semibold text-sm md:text-base">{userBName}</div>
                                        {userBEmail && <div className="text-xs text-neutral-400 break-all">{userBEmail}</div>}
                                        {selectedCall.questionerUserId?.toString() === userBId?.toString() && (
                                            <div className="text-xs text-warning-400 mt-1">Questioner</div>
                                        )}
                                        {selectedCall.answererUserId?.toString() === userBId?.toString() && (
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
                                    <div className="text-white">{selectedCall.actualCallDuration ? formatSeconds(selectedCall.actualCallDuration) : formatDuration(selectedCall.actualCallStartedAt || selectedCall.startedAt, selectedCall.endedAt)}</div>
                                </div>
                            </div>

                            {/* Recording Audit & Chunk Verification Log */}
                            {selectedCall.recordingAuditLogs && selectedCall.recordingAuditLogs.length > 0 && (
                                <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-white">📊 Recording & Chunk Verification Log</span>
                                            <span className="px-2 py-0.5 text-[10px] font-mono bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                                                SACK Audited
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                Swal.fire({
                                                    title: 'Recording Audit Log',
                                                    html: `<pre class="text-left bg-neutral-900 text-neutral-200 text-xs p-3 rounded font-mono overflow-auto max-h-96">${JSON.stringify(selectedCall.recordingAuditLogs, null, 2)}</pre>`,
                                                    customClass: { popup: 'bg-neutral-800 text-white border border-neutral-700 max-w-2xl' },
                                                    confirmButtonColor: '#ea580c'
                                                });
                                            }}
                                            className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 text-xs rounded-lg transition-colors font-mono"
                                        >
                                            View Full JSON
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {selectedCall.recordingAuditLogs.map((log, lIdx) => {
                                            const isUserA = String(log.userId) === String(selectedCall.userA?._id || selectedCall.userA);
                                            const speakerLabel = isUserA ? (userAName || "Speaker 1") : (userBName || "Speaker 2");
                                            return (
                                                <div key={lIdx} className="bg-neutral-800/80 border border-neutral-700/60 rounded-lg p-3 text-xs space-y-1.5 font-mono">
                                                    <div className="flex items-center justify-between text-neutral-300 font-bold border-b border-neutral-700 pb-1">
                                                        <span>{speakerLabel}</span>
                                                        <span className="text-[11px] text-warning-400">{log.finalDurationSeconds ? `${Math.floor(log.finalDurationSeconds / 60)}m ${Math.round(log.finalDurationSeconds % 60)}s` : '-'}</span>
                                                    </div>
                                                    <div className="flex justify-between text-neutral-400">
                                                        <span>Realtime Chunks:</span>
                                                        <span className="text-white">{log.realtimeChunksReceived || 0}</span>
                                                    </div>
                                                    <div className="flex justify-between text-neutral-400">
                                                        <span>SACK Recovered:</span>
                                                        <span className={log.missingChunksPatchedViaSack > 0 ? "text-emerald-400 font-bold" : "text-neutral-300"}>
                                                            +{log.missingChunksPatchedViaSack || 0} chunks
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between text-neutral-400">
                                                        <span>Missing Ranges:</span>
                                                        <span className={log.missingRangesDetected?.length > 0 ? "text-amber-400" : "text-neutral-400"}>
                                                            {log.missingRangesDetected?.length > 0 
                                                                ? log.missingRangesDetected.map(r => `${r.start}-${r.end}`).join(", ")
                                                                : "None (100% OK)"}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between text-neutral-400">
                                                        <span>Silence Padded:</span>
                                                        <span className={log.silenceSecondsPadded > 0 ? "text-blue-400" : "text-neutral-400"}>
                                                            {log.silenceSecondsPadded > 0 ? `${log.silenceSecondsPadded}s (${(log.silenceBytesPadded / 1024).toFixed(0)} KB)` : "0s"}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="pt-4 border-t border-neutral-700">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <div className="text-sm text-neutral-400">Recordings</div>
                                    <div className="flex items-center gap-2">
                                        {(userInfo?.isAdmin && (selectedCall.recordingAFile || selectedCall.recordingBFile)) && (
                                            <button
                                                onClick={() => downloadCallBundle(selectedCall)}
                                                disabled={downloadingCallId === selectedCall.callId}
                                                className="inline-flex items-center justify-center px-3 py-1.5 bg-warning-600 hover:bg-warning-700 disabled:bg-neutral-600 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-all"
                                            >
                                                {downloadingCallId === selectedCall.callId ? downloadStep || "Processing..." : "Download ZIP"}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDeleteSingleCall(selectedCall.callId)}
                                            className="inline-flex items-center justify-center px-3 py-1.5 bg-error-600 hover:bg-error-700 text-white rounded-lg text-xs font-medium transition-all"
                                        >
                                            🗑 Delete Call
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* User A Recording */}
                                    {selectedCall.recordingAFile && (
                                        <div className="bg-neutral-700 p-4 rounded-lg flex flex-col justify-between">
                                            <div>
                                                <div className="text-white font-semibold mb-2">{userAName}</div>
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
                                                    {audioUrls[`${selectedCall.callId}_${userAId}`] ? (
                                                        <div className="space-y-2">
                                                            <AudioVisualizer 
                                                                url={audioUrls[`${selectedCall.callId}_${userAId}`]}
                                                                audioRef={{ current: audioRefs.current[`${selectedCall.callId}_${userAId}`] }} 
                                                            />
                                                            <audio 
                                                                ref={(el) => (audioRefs.current[`${selectedCall.callId}_${userAId}`] = el)}
                                                                controls 
                                                                src={audioUrls[`${selectedCall.callId}_${userAId}`]} 
                                                                className="w-full h-9 rounded" 
                                                                controlsList="nodownload noplaybackrate" 
                                                                onContextMenu={(e) => e.preventDefault()}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <button 
                                                            onClick={() => loadCallAudio(selectedCall.callId, userAId)} 
                                                            disabled={loadingAudio[`${selectedCall.callId}_${userAId}`]} 
                                                            className="w-full py-2 bg-neutral-800 hover:bg-neutral-600 border border-neutral-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
                                                        >
                                                            {loadingAudio[`${selectedCall.callId}_${userAId}`] ? "Loading WAV..." : "▶ Load Audio Waveform"}
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Audio QC Analyzer Card */}
                                                <div className="mb-4 pt-3 border-t border-neutral-600">
                                                    <button
                                                        onClick={() => runAudioQC(selectedCall.callId, userAId)}
                                                        disabled={qcLoading[userAId]}
                                                        className="w-full inline-flex items-center justify-center px-4 py-2 bg-neutral-800 hover:bg-neutral-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold border border-neutral-600 transition-colors"
                                                    >
                                                        {qcLoading[userAId] ? (
                                                            <span className="flex items-center gap-1.5">
                                                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                                Running QC Analysis...
                                                            </span>
                                                        ) : (qcResults[userAId] ? "🔄 Re-run QC Analyzer" : "📊 Run Audio QC Analyzer")}
                                                    </button>
                                                    
                                                    {qcErrors[userAId] && (
                                                        <div className="mt-2 text-xs text-error-400 font-medium">
                                                             ⚠️ {qcErrors[userAId]}
                                                        </div>
                                                    )}

                                                    {qcResults[userAId] && (
                                                        <div className="mt-3 space-y-3 bg-neutral-900/40 p-3 rounded-lg border border-neutral-700/50">
                                                            <div className="flex justify-between text-xs">
                                                                <span className="text-neutral-400">YAMNet Noise:</span>
                                                                <span className={`font-bold ${qcResults[userAId].yamnet.suspicion_rating === 10 ? 'text-error-400' : qcResults[userAId].yamnet.suspicion_rating === 5 ? 'text-warning-400' : 'text-success-400'}`}>
                                                                    {qcResults[userAId].yamnet.rating_label}
                                                                </span>
                                                            </div>
                                                            {qcResults[userAId].yamnet.events && qcResults[userAId].yamnet.events.length > 0 ? (
                                                                <div className="space-y-1.5">
                                                                    <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Spotcheck Noise Events (Click to play 8s)</div>
                                                                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                                                                        {filterOverlappingEvents(qcResults[userAId].yamnet.events).map((e, idx) => (
                                                                            <button
                                                                                key={idx}
                                                                                onClick={() => playSpotcheck(selectedCall.callId, userAId, e.timestamp_sec)}
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
                                                                qcResults[userAId].yamnet.top_noise_events !== "None" && (
                                                                    <div className="text-[10px] text-error-300/80 bg-error-950/20 px-2 py-1 rounded border border-error-900/30">
                                                                        Events: {qcResults[userAId].yamnet.top_noise_events}
                                                                    </div>
                                                                )
                                                            )}                                 
                                                            <div className="grid grid-cols-2 gap-2 text-[10px] text-neutral-300">
                                                                <div>Bit Verdict: <span className="font-bold">{qcResults[userAId].freq.bit_verdict}</span></div>
                                                                <div>Noise Floor: <span className="font-bold">{qcResults[userAId].freq.noise_floor_db} dBFS</span></div>
                                                                <div>Crest Factor: <span className="font-bold">{qcResults[userAId].freq.crest_factor} dB</span></div>
                                                                <div>Processing: <span className="font-bold">{qcResults[userAId].freq.processing_verdict}</span></div>
                                                            </div>
                                                            {(qcResults[userAId].spectrogram || qcResults[userAId].spectrogramS3Key) && (
                                                                <div className="mt-2 bg-black/40 rounded p-1 border border-neutral-800">
                                                                    <div className="text-[9px] text-neutral-500 mb-1 font-bold tracking-wider uppercase text-center">Nyquist Spectrogram (Click to zoom)</div>
                                                                    <img 
                                                                        src={qcResults[userAId].spectrogram 
                                                                             ? `data:image/png;base64,${qcResults[userAId].spectrogram}`
                                                                             : `${BACKEND_URL}/api/admin/qa/calls/${selectedCall.callId}/spectrogram/${userAId}`
                                                                         }
                                                                        alt="Spectrogram"
                                                                        crossOrigin="use-credentials"
                                                                        className="w-full rounded border border-neutral-900 cursor-zoom-in hover:opacity-80 transition-opacity"
                                                                        onClick={() => {
                                                                            const src = qcResults[userAId].spectrogram 
                                                                                ? `data:image/png;base64,${qcResults[userAId].spectrogram}`
                                                                                : `${BACKEND_URL}/api/admin/qa/calls/${selectedCall.callId}/spectrogram/${userAId}`;
                                                                            setZoomedImage({ src, title: `${userAName}'s Spectrogram` });
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
                                                        value={recordingNotes[userAId] || ""}
                                                        onChange={(e) => setRecordingNotes(prev => ({ ...prev, [userAId]: e.target.value }))}
                                                        placeholder="Enter review notes..."
                                                        className="w-full bg-neutral-800 border border-neutral-600 text-white text-xs rounded-lg px-2 py-1.5 resize-none focus:border-warning-500 outline-none"
                                                    />
                                                </div>
                                                {/* Rejection Reason Selector */}
                                                <div className="mb-3 bg-neutral-800/80 p-2.5 rounded-lg border border-neutral-600">
                                                    <div className="text-[10px] text-neutral-400 font-bold uppercase mb-1.5 flex items-center justify-between">
                                                        <span>Rejection Reason</span>
                                                        <span className="text-[9px] text-neutral-500 font-normal">(Required if rejecting)</span>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-3">
                                                        <label className="inline-flex items-center gap-1.5 text-xs text-neutral-200 cursor-pointer select-none">
                                                            <input
                                                                type="radio"
                                                                name={`rejectReason_${userAId}`}
                                                                value="Off-Topic Conversation"
                                                                checked={rejectionReasons[userAId] === "Off-Topic Conversation"}
                                                                onChange={(e) => {
                                                                    setRejectionReasons(prev => ({ ...prev, [userAId]: e.target.value }));
                                                                }}
                                                                className="w-4 h-4 accent-error-500 cursor-pointer"
                                                            />
                                                            <span>🗣️ Off-Topic Conversation</span>
                                                        </label>
                                                        <label className="inline-flex items-center gap-1.5 text-xs text-neutral-200 cursor-pointer select-none">
                                                            <input
                                                                type="radio"
                                                                name={`rejectReason_${userAId}`}
                                                                value="Noisy"
                                                                checked={rejectionReasons[userAId] === "Noisy"}
                                                                onChange={(e) => {
                                                                    setRejectionReasons(prev => ({ ...prev, [userAId]: e.target.value }));
                                                                }}
                                                                className="w-4 h-4 accent-error-500 cursor-pointer"
                                                            />
                                                            <span>🔊 Noisy</span>
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <div className="flex items-center gap-2 mt-4">
                                                    <button
                                                        onClick={() => approveRecording(selectedCall.callId, userAId, userAName)}
                                                        className="flex-1 px-3 py-2 bg-success-600 hover:bg-success-700 text-white rounded-lg text-xs font-medium transition-all"
                                                    >
                                                        ✓ Approve
                                                    </button>
                                                    <button
                                                        onClick={() => rejectRecording(selectedCall.callId, userAId, userAName)}
                                                        className="flex-1 px-3 py-2 bg-error-600 hover:bg-error-700 text-white rounded-lg text-xs font-medium transition-all"
                                                    >
                                                        ✗ Reject
                                                    </button>
                                                </div>
                                                {isAdmin && (
                                                    <div className="mt-3 pt-2.5 border-t border-neutral-600 space-y-1.5">
                                                        <div className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Monologue Action</div>
                                                        {selectedCall.recordingAMonologueStatus === 'transcribed' ? (
                                                            <div className="w-full py-1.5 px-3 bg-purple-950/60 border border-purple-600/50 rounded-lg text-center text-xs font-bold text-purple-300">
                                                                ✓ Transcribed as Monologue
                                                            </div>
                                                        ) : selectedCall.recordingAMonologueStatus === 'rejected' ? (
                                                            <div className="w-full py-1.5 px-3 bg-neutral-800 border border-neutral-600 rounded-lg text-center text-xs font-medium text-neutral-400">
                                                                ✗ Rejected as Monologue
                                                            </div>
                                                        ) : (
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <button
                                                                    onClick={() => handleSendAsMonologue(selectedCall.callId, 'userA', userAName)}
                                                                    disabled={isTranscribingMonologue[`${selectedCall.callId}_userA`]}
                                                                    className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow transition-all border border-purple-500/30 truncate"
                                                                >
                                                                    {isTranscribingMonologue[`${selectedCall.callId}_userA`] ? "Sending..." : "🎙️ Transcribe Monologue"}
                                                                </button>
                                                                <button
                                                                    onClick={() => handleRejectAsMonologue(selectedCall.callId, 'userA', userAName)}
                                                                    disabled={isTranscribingMonologue[`${selectedCall.callId}_userA`]}
                                                                    className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-600 border border-neutral-600 text-neutral-300 hover:text-white rounded-lg text-xs font-semibold transition-all truncate"
                                                                >
                                                                    ✗ Reject Monologue
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    {/* User B Recording */}
                                    {selectedCall.recordingBFile && (
                                        <div className="bg-neutral-700 p-4 rounded-lg flex flex-col justify-between">
                                            <div>
                                                <div className="text-white font-semibold mb-2">{userBName}</div>
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
                                                    {audioUrls[`${selectedCall.callId}_${userBId}`] ? (
                                                        <div className="space-y-2">
                                                            <AudioVisualizer 
                                                                url={audioUrls[`${selectedCall.callId}_${userBId}`]}
                                                                audioRef={{ current: audioRefs.current[`${selectedCall.callId}_${userBId}`] }} 
                                                            />
                                                            <audio 
                                                                ref={(el) => (audioRefs.current[`${selectedCall.callId}_${userBId}`] = el)}
                                                                controls 
                                                                src={audioUrls[`${selectedCall.callId}_${userBId}`]} 
                                                                className="w-full h-9 rounded" 
                                                                controlsList="nodownload noplaybackrate" 
                                                                onContextMenu={(e) => e.preventDefault()}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <button 
                                                            onClick={() => loadCallAudio(selectedCall.callId, userBId)} 
                                                            disabled={loadingAudio[`${selectedCall.callId}_${userBId}`]} 
                                                            className="w-full py-2 bg-neutral-800 hover:bg-neutral-600 border border-neutral-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
                                                        >
                                                            {loadingAudio[`${selectedCall.callId}_${userBId}`] ? "Loading WAV..." : "▶ Load Audio Waveform"}
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Audio QC Analyzer Card */}
                                                <div className="mb-4 pt-3 border-t border-neutral-600">
                                                    <button
                                                        onClick={() => runAudioQC(selectedCall.callId, userBId)}
                                                        disabled={qcLoading[userBId]}
                                                        className="w-full inline-flex items-center justify-center px-4 py-2 bg-neutral-800 hover:bg-neutral-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold border border-neutral-600 transition-colors"
                                                    >
                                                        {qcLoading[userBId] ? (
                                                            <span className="flex items-center gap-1.5">
                                                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                                Running QC Analysis...
                                                            </span>
                                                        ) : (qcResults[userBId] ? "🔄 Re-run QC Analyzer" : "📊 Run Audio QC Analyzer")}
                                                    </button>
                                                    
                                                    {qcErrors[userBId] && (
                                                        <div className="mt-2 text-xs text-error-400 font-medium">
                                                            ⚠️ {qcErrors[userBId]}
                                                        </div>
                                                    )}

                                                    {qcResults[userBId] && (
                                                        <div className="mt-3 space-y-3 bg-neutral-900/40 p-3 rounded-lg border border-neutral-700/50">
                                                            <div className="flex justify-between text-xs">
                                                                <span className="text-neutral-400">YAMNet Noise:</span>
                                                                <span className={`font-bold ${qcResults[userBId].yamnet.suspicion_rating === 10 ? 'text-error-400' : qcResults[userBId].yamnet.suspicion_rating === 5 ? 'text-warning-400' : 'text-success-400'}`}>
                                                                    {qcResults[userBId].yamnet.rating_label}
                                                                </span>
                                                            </div>
                                                            {qcResults[userBId].yamnet.events && qcResults[userBId].yamnet.events.length > 0 ? (
                                                                <div className="space-y-1.5">
                                                                    <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Spotcheck Noise Events (Click to play 8s)</div>
                                                                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                                                                        {filterOverlappingEvents(qcResults[userBId].yamnet.events).map((e, idx) => (
                                                                            <button
                                                                                key={idx}
                                                                                onClick={() => playSpotcheck(selectedCall.callId, userBId, e.timestamp_sec)}
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
                                                                qcResults[userBId].yamnet.top_noise_events !== "None" && (
                                                                    <div className="text-[10px] text-error-300/80 bg-error-950/20 px-2 py-1 rounded border border-error-900/30">
                                                                        Events: {qcResults[userBId].yamnet.top_noise_events}
                                                                    </div>
                                                                )
                                                            )}
                                                            <div className="grid grid-cols-2 gap-2 text-[10px] text-neutral-300">
                                                                <div>Bit Verdict: <span className="font-bold">{qcResults[userBId].freq.bit_verdict}</span></div>
                                                                <div>Noise Floor: <span className="font-bold">{qcResults[userBId].freq.noise_floor_db} dBFS</span></div>
                                                                <div>Crest Factor: <span className="font-bold">{qcResults[userBId].freq.crest_factor} dB</span></div>
                                                                <div>Processing: <span className="font-bold">{qcResults[userBId].freq.processing_verdict}</span></div>
                                                            </div>
                                                            {(qcResults[userBId].spectrogram || qcResults[userBId].spectrogramS3Key) && (
                                                                <div className="mt-2 bg-black/40 rounded p-1 border border-neutral-800">
                                                                    <div className="text-[9px] text-neutral-500 mb-1 font-bold tracking-wider uppercase text-center">Nyquist Spectrogram (Click to zoom)</div>
                                                                    <img 
                                                                        src={qcResults[userBId].spectrogram 
                                                                             ? `data:image/png;base64,${qcResults[userBId].spectrogram}`
                                                                             : `${BACKEND_URL}/api/admin/qa/calls/${selectedCall.callId}/spectrogram/${userBId}`
                                                                         }
                                                                        alt="Spectrogram"
                                                                        crossOrigin="use-credentials"
                                                                        className="w-full rounded border border-neutral-900 cursor-zoom-in hover:opacity-80 transition-opacity"
                                                                        onClick={() => {
                                                                            const src = qcResults[userBId].spectrogram 
                                                                                ? `data:image/png;base64,${qcResults[userBId].spectrogram}`
                                                                                : `${BACKEND_URL}/api/admin/qa/calls/${selectedCall.callId}/spectrogram/${userBId}`;
                                                                            setZoomedImage({ src, title: `${userBName}'s Spectrogram` });
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
                                                        value={recordingNotes[userBId] || ""}
                                                        onChange={(e) => setRecordingNotes(prev => ({ ...prev, [userBId]: e.target.value }))}
                                                        placeholder="Enter review notes..."
                                                        className="w-full bg-neutral-800 border border-neutral-600 text-white text-xs rounded-lg px-2 py-1.5 resize-none focus:border-warning-500 outline-none"
                                                    />
                                                </div>
                                                {/* Rejection Reason Selector */}
                                                <div className="mb-3 bg-neutral-800/80 p-2.5 rounded-lg border border-neutral-600">
                                                    <div className="text-[10px] text-neutral-400 font-bold uppercase mb-1.5 flex items-center justify-between">
                                                        <span>Rejection Reason</span>
                                                        <span className="text-[9px] text-neutral-500 font-normal">(Required if rejecting)</span>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-3">
                                                        <label className="inline-flex items-center gap-1.5 text-xs text-neutral-200 cursor-pointer select-none">
                                                            <input
                                                                type="radio"
                                                                name={`rejectReason_${userBId}`}
                                                                value="Off-Topic Conversation"
                                                                checked={rejectionReasons[userBId] === "Off-Topic Conversation"}
                                                                onChange={(e) => {
                                                                    setRejectionReasons(prev => ({ ...prev, [userBId]: e.target.value }));
                                                                }}
                                                                className="w-4 h-4 accent-error-500 cursor-pointer"
                                                            />
                                                            <span>🗣️ Off-Topic Conversation</span>
                                                        </label>
                                                        <label className="inline-flex items-center gap-1.5 text-xs text-neutral-200 cursor-pointer select-none">
                                                            <input
                                                                type="radio"
                                                                name={`rejectReason_${userBId}`}
                                                                value="Noisy"
                                                                checked={rejectionReasons[userBId] === "Noisy"}
                                                                onChange={(e) => {
                                                                    setRejectionReasons(prev => ({ ...prev, [userBId]: e.target.value }));
                                                                }}
                                                                className="w-4 h-4 accent-error-500 cursor-pointer"
                                                            />
                                                            <span>🔊 Noisy</span>
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 mt-4">
                                                <button
                                                    onClick={() => approveRecording(selectedCall.callId, userBId, userBName)}
                                                    className="flex-1 px-3 py-2 bg-success-600 hover:bg-success-700 text-white rounded-lg text-xs font-medium transition-all"
                                                >
                                                    ✓ Approve
                                                </button>
                                                <button
                                                    onClick={() => rejectRecording(selectedCall.callId, userBId, userBName)}
                                                    className="flex-1 px-3 py-2 bg-error-600 hover:bg-error-700 text-white rounded-lg text-xs font-medium transition-all"
                                                >
                                                    ✗ Reject
                                                </button>
                                            </div>
                                            {isAdmin && (
                                                <div className="mt-3 pt-2.5 border-t border-neutral-600 space-y-1.5">
                                                    <div className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Monologue Action</div>
                                                    {selectedCall.recordingBMonologueStatus === 'transcribed' ? (
                                                        <div className="w-full py-1.5 px-3 bg-purple-950/60 border border-purple-600/50 rounded-lg text-center text-xs font-bold text-purple-300">
                                                            ✓ Transcribed as Monologue
                                                        </div>
                                                    ) : selectedCall.recordingBMonologueStatus === 'rejected' ? (
                                                        <div className="w-full py-1.5 px-3 bg-neutral-800 border border-neutral-600 rounded-lg text-center text-xs font-medium text-neutral-400">
                                                            ✗ Rejected as Monologue
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <button
                                                                onClick={() => handleSendAsMonologue(selectedCall.callId, 'userB', userBName)}
                                                                disabled={isTranscribingMonologue[`${selectedCall.callId}_userB`]}
                                                                className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow transition-all border border-purple-500/30 truncate"
                                                            >
                                                                {isTranscribingMonologue[`${selectedCall.callId}_userB`] ? "Sending..." : "🎙️ Transcribe Monologue"}
                                                            </button>
                                                            <button
                                                                onClick={() => handleRejectAsMonologue(selectedCall.callId, 'userB', userBName)}
                                                                disabled={isTranscribingMonologue[`${selectedCall.callId}_userB`]}
                                                                className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-600 border border-neutral-600 text-neutral-300 hover:text-white rounded-lg text-xs font-semibold transition-all truncate"
                                                            >
                                                                ✗ Reject Monologue
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {!selectedCall.recordingAFile && !selectedCall.recordingBFile && (
                                    <div className="text-neutral-500 text-sm">No recordings available</div>
                                )}

                                {/* Combined Transcribe as Call Control Card (Admin Only) */}
                                {isAdmin && (
                                    <div className="mt-6 pt-5 border-t border-neutral-700">
                                        <div className="bg-gradient-to-r from-neutral-900 via-indigo-950/40 to-neutral-900 border border-indigo-500/40 rounded-2xl p-4 md:p-5 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                                            <div className="flex items-center gap-3.5">
                                                <div className="w-11 h-11 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center text-xl font-bold shrink-0 shadow-inner">
                                                    📞
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-white text-sm font-bold tracking-tight">
                                                            Transcribe as Full Call (2-Speaker Dialogue)
                                                        </span>
                                                        <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30 font-bold uppercase tracking-wider">
                                                            Admin Control
                                                        </span>
                                                    </div>
                                                    <p className="text-neutral-400 text-xs mt-0.5">
                                                        Queues complete dialogue for transcription studio without automatic QA push.
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0">
                                                {selectedCall.transcribedAsCall || selectedCall.callTranscriptionStatus === 'transcribed' ? (
                                                    <div className="flex items-center gap-2 w-full sm:w-auto">
                                                        <div className="px-4 py-2 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-center text-xs font-bold text-emerald-300 flex items-center gap-1.5 shadow-md">
                                                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                                            <span>✓ In Transcription</span>
                                                        </div>
                                                        <button
                                                            onClick={() => handleCancelSendAsCall(selectedCall.callId)}
                                                            disabled={isTranscribingCall[selectedCall.callId]}
                                                            className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700 text-xs font-bold rounded-xl transition-all"
                                                            title="Remove from transcription queue"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => handleSendAsCall(selectedCall.callId)}
                                                        disabled={isTranscribingCall[selectedCall.callId]}
                                                        className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-900/40 transition-all flex items-center justify-center gap-2 border border-indigo-400/40 active:scale-95 cursor-pointer"
                                                    >
                                                        {isTranscribingCall[selectedCall.callId] ? (
                                                            <>
                                                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                                <span>Queueing Call...</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span>📞</span>
                                                                <span>Transcribe as Call</span>
                                                            </>
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                );
            })()}
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

            {/* Merged Call Dual-Waveform Studio Modal */}
            {mergedStudioCall && (
                <div 
                    className="fixed inset-0 bg-black/85 backdrop-blur-md z-[100] flex items-center justify-center p-2 md:p-6 animate-fade-in"
                    onClick={() => setMergedStudioCall(null)}
                >
                    <div 
                        className="bg-neutral-900 border border-neutral-700/80 rounded-2xl w-full max-w-6xl h-[92vh] overflow-hidden shadow-2xl flex flex-col animate-scale-in"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <MergedCallStudio 
                            call={mergedStudioCall} 
                            onClose={() => setMergedStudioCall(null)} 
                            isModal={true} 
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
