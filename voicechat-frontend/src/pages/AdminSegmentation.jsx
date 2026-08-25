import React, { useEffect, useState, useRef } from "react";
import AdminNav from "../components/AdminNav.jsx";
import { getUserInfo } from "../lib/auth.js";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
const LABELS_PLATFORM_URL = "http://localhost:5174";

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${BACKEND_URL}${path}`, { credentials: "include", ...opts });
  const json = await res.json().catch(() => ({ error: "Request failed" }));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

function formatSecToMinSec(sec) {
  if (sec === undefined || sec === null || isNaN(sec)) return "00:00.000";
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(3);
  return `${String(m).padStart(2, "0")}:${s.padStart(6, "0")}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
  } catch (e) {
    return dateStr;
  }
}

export default function AdminSegmentation() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeTab, setActiveTab] = useState("pending");
  const [searchQuery, setSearchQuery] = useState("");

  // Review Modal State
  const [selectedCall, setSelectedCall] = useState(null);
  const [transcriptionCallData, setTranscriptionCallData] = useState(null);
  const [reviewSegments, setReviewSegments] = useState([]);
  const [initialSegments, setInitialSegments] = useState([]);
  const [loadingSegments, setLoadingSegments] = useState(false);
  const [segmentError, setSegmentError] = useState(null);
  const [qaNotes, setQaNotes] = useState("");
  const [submittingQa, setSubmittingQa] = useState(false);
  const [successToast, setSuccessToast] = useState("");

  // Segment Audio Preview Player State
  const [playingSegmentId, setPlayingSegmentId] = useState(null);
  const audioPreviewRef = useRef(null);
  const audioEndTimeoutRef = useRef(null);

  const userInfo = getUserInfo();

  const loadSegmentationCalls = async (pageNum = 1) => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/admin/qa/segmentation-calls?page=${pageNum}&limit=20&tab=${activeTab}`;
      if (searchQuery.trim()) {
        url += `&search=${encodeURIComponent(searchQuery.trim())}`;
      }
      const data = await apiFetch(url);
      setCalls(data.calls || []);
      setPage(data.page || 1);
      setPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message || "Failed to load segmentation calls");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSegmentationCalls(1);
  }, [activeTab]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadSegmentationCalls(1);
  };

  const openInSegmentationCanvas = (call) => {
    const canvasUrl = `${LABELS_PLATFORM_URL}/?call_id=${encodeURIComponent(call.callId)}&audio1=${encodeURIComponent(call.recordingAFile || "")}&audio2=${encodeURIComponent(call.recordingBFile || "")}&is_qa=true`;
    window.open(canvasUrl, "_blank");
  };

  // Calculate changes between initial user submission and current segments
  const calculateChanges = (origSegs, curSegs) => {
    if (!origSegs || origSegs.length === 0) return 0;
    if (!curSegs || curSegs.length === 0) return origSegs.length;

    let changes = 0;
    const matchedCurrent = new Set();

    for (const orig of origSegs) {
      const origStart = orig.start_sec !== undefined ? Number(orig.start_sec) : (orig.start_ms ? orig.start_ms / 1000 : (Number(orig.start) || 0));
      const origEnd = orig.end_sec !== undefined ? Number(orig.end_sec) : (orig.end_ms ? orig.end_ms / 1000 : (Number(orig.end) || 0));
      const origSpk = String(orig.speaker || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      const matchIdx = curSegs.findIndex((c, idx) => {
        if (matchedCurrent.has(idx)) return false;
        if (c.segment_id && orig.segment_id && c.segment_id === orig.segment_id) return true;
        const cStart = c.start_sec !== undefined ? Number(c.start_sec) : (c.start_ms ? c.start_ms / 1000 : (Number(c.start) || 0));
        const cEnd = c.end_sec !== undefined ? Number(c.end_sec) : (c.end_ms ? c.end_ms / 1000 : (Number(c.end) || 0));
        return Math.abs(cStart - origStart) <= 1.0 && Math.abs(cEnd - origEnd) <= 1.0;
      });

      if (matchIdx === -1) {
        changes++; // Segment deleted
      } else {
        matchedCurrent.add(matchIdx);
        const curr = curSegs[matchIdx];
        const cStart = curr.start_sec !== undefined ? Number(curr.start_sec) : (curr.start_ms ? curr.start_ms / 1000 : (Number(curr.start) || 0));
        const cEnd = curr.end_sec !== undefined ? Number(curr.end_sec) : (curr.end_ms ? curr.end_ms / 1000 : (Number(curr.end) || 0));
        const currSpk = String(curr.speaker || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        const startDiff = Math.abs(cStart - origStart);
        const endDiff = Math.abs(cEnd - origEnd);
        const spkDiff = origSpk !== currSpk && (origSpk && currSpk);

        if (startDiff > 0.15 || endDiff > 0.15 || spkDiff) {
          changes++; // Timing or speaker modified
        }
      }
    }

    const addedCount = curSegs.length - matchedCurrent.size;
    if (addedCount > 0) {
      changes += addedCount; // New segments added
    }

    return changes;
  };

  const handleOpenReview = async (call) => {
    setSelectedCall(call);
    setReviewSegments([]);
    setInitialSegments([]);
    setTranscriptionCallData(null);
    setSegmentError(null);
    setLoadingSegments(true);
    setQaNotes(call.segmentation_qa_notes || "");
    stopAudioPreview();

    try {
      const data = await apiFetch(`/api/admin/qa/calls/${encodeURIComponent(call.callId)}/segments`);
      const currentSegs = data.segments || [];
      const tCall = data.transcriptionCall || {};
      const origSegs = tCall.initial_submitted_segments && tCall.initial_submitted_segments.length > 0
        ? tCall.initial_submitted_segments
        : currentSegs;

      setReviewSegments(currentSegs);
      setInitialSegments(origSegs);
      setTranscriptionCallData(tCall);
    } catch (err) {
      setSegmentError(err.message || "Failed to load segment timestamps for this call");
    } finally {
      setLoadingSegments(false);
    }
  };

  const handleCloseReview = () => {
    stopAudioPreview();
    setSelectedCall(null);
    setReviewSegments([]);
    setInitialSegments([]);
    setTranscriptionCallData(null);
  };

  const stopAudioPreview = () => {
    if (audioEndTimeoutRef.current) {
      clearTimeout(audioEndTimeoutRef.current);
      audioEndTimeoutRef.current = null;
    }
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      audioPreviewRef.current.currentTime = 0;
    }
    setPlayingSegmentId(null);
  };

  const handlePlaySegment = (seg, call) => {
    if (playingSegmentId === seg.segment_id) {
      stopAudioPreview();
      return;
    }

    stopAudioPreview();

    const speakerKey = seg.speaker === "speaker2" ? "speaker2" : "speaker1";
    const audioUrl = `${BACKEND_URL}/api/admin/qa/calls/${encodeURIComponent(call.callId)}/recording/${speakerKey}`;

    const audio = new Audio(audioUrl);
    audioPreviewRef.current = audio;

    const start = Math.max(0, Number(seg.start_sec) || 0);
    const end = Math.max(start + 0.1, Number(seg.end_sec) || (start + 1.0));
    const durationMs = (end - start) * 1000;

    audio.currentTime = start;
    audio.play().then(() => {
      setPlayingSegmentId(seg.segment_id);
      audioEndTimeoutRef.current = setTimeout(() => {
        stopAudioPreview();
      }, durationMs);
    }).catch(e => {
      console.error("Audio playback error:", e);
      setPlayingSegmentId(null);
    });
  };

  const currentChangesCount = calculateChanges(initialSegments, reviewSegments);
  const currentPenalty = Math.min(100, currentChangesCount * 10);
  const currentPayout = Math.max(0, 100 - currentPenalty);

  const handleQaDecision = async (status) => {
    if (!selectedCall) return;
    setSubmittingQa(true);
    try {
      const isApprove = status === "approved";
      const payload = {
        status,
        notes: qaNotes,
        changes_count: currentChangesCount,
      };

      const res = await apiFetch(`/api/admin/qa/calls/${encodeURIComponent(selectedCall.callId)}/segmentation-qa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (isApprove) {
        setSuccessToast(`✓ Segmentation Approved with ${res.qa_payout_percentage ?? currentPayout}% Pay! Moved to Transcription Queue.`);
      } else {
        setSuccessToast(`✓ Segmentation for ${selectedCall.callId} marked as REJECTED.`);
      }
      setTimeout(() => setSuccessToast(""), 4000);

      loadSegmentationCalls(page);
      handleCloseReview();
    } catch (err) {
      alert(`QA Decision failed: ${err.message}`);
    } finally {
      setSubmittingQa(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 pt-16 md:pt-0 md:pl-64 text-neutral-100">
      <AdminNav />

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12 space-y-6">

          {/* Toast Alert */}
          {successToast && (
            <div className="fixed top-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-emerald-400 animate-bounce">
              <span>{successToast}</span>
            </div>
          )}

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-neutral-800 p-6 rounded-2xl border border-neutral-700 shadow-xl">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <span>✂️</span> Segmentation Pipeline & QA Review
              </h1>
              <p className="text-sm text-neutral-400 mt-1">
                Review submitted multi-track segment timestamps, listen to preview audio clips, and QA-verify datasets for transcription.
              </p>
            </div>
            <button
              onClick={() => loadSegmentationCalls(page)}
              className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 self-start md:self-auto"
            >
              🔄 Refresh Queue
            </button>
          </div>

          {/* Tab Navigation & Search Bar */}
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {[
                { id: "pending", label: "⏳ Pending QA" },
                { id: "approved", label: "✓ Approved" },
                { id: "rejected", label: "✗ Rejected" },
                { id: "logs", label: "📋 Segmentation Logs" },
                { id: "all", label: "🌐 All Segmentation" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setPage(1);
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === tab.id
                      ? "bg-warning-500 text-neutral-950 shadow-md"
                      : "bg-neutral-700/60 text-neutral-300 hover:bg-neutral-700 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-72">
              <input
                type="text"
                placeholder="Search Call ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-warning-500"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Search
              </button>
            </form>
          </div>

          {/* Error alert */}
          {error && (
            <div className="bg-red-900/40 border border-red-500/50 text-red-200 p-4 rounded-xl text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* Table Container */}
          <div className="bg-neutral-800 rounded-2xl border border-neutral-700 shadow-xl overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-neutral-400 flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-warning-400 border-t-transparent rounded-full animate-spin"></div>
                <p>Loading Segmentation Calls...</p>
              </div>
            ) : calls.length === 0 ? (
              <div className="p-12 text-center text-neutral-400">
                <p className="text-lg font-semibold text-neutral-300">No calls found in {activeTab} tab</p>
                <p className="text-sm mt-1">Select a different tab or check the All Segmentation tab.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-neutral-900/60 border-b border-neutral-700 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                      <th className="py-4 px-6">Call ID</th>
                      {activeTab === "logs" ? (
                        <>
                          <th className="py-4 px-6">Segmented By</th>
                          <th className="py-4 px-6">QA Reviewed By</th>
                          <th className="py-4 px-6">Verdict</th>
                          <th className="py-4 px-6">Changes / Pay</th>
                          <th className="py-4 px-6">Review Date</th>
                        </>
                      ) : (
                        <>
                          <th className="py-4 px-6">Language / Topic</th>
                          <th className="py-4 px-6">Speaker 1 & 2</th>
                          <th className="py-4 px-6">Segmentation Timestamps</th>
                          <th className="py-4 px-6">QA Status</th>
                        </>
                      )}
                      <th className="py-4 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-700/60 text-sm">
                    {calls.map((call) => (
                      <tr key={call.callId} className="hover:bg-neutral-700/30 transition-colors">
                        <td className="py-4 px-6 font-mono text-xs font-bold text-warning-400">
                          {call.callId}
                        </td>

                        {activeTab === "logs" ? (
                          <>
                            <td className="py-4 px-6">
                              <div className="text-white font-medium">
                                {call.segmented_by?.username || (call.userA?.username ? `${call.userA.username} (Contributor)` : "System / User")}
                              </div>
                              <div className="text-xs text-neutral-400">{call.segmented_by?.email || ""}</div>
                            </td>
                            <td className="py-4 px-6">
                              {call.segmentation_qa_by ? (
                                <div>
                                  <div className="text-white font-medium">{call.segmentation_qa_by.username || `${call.segmentation_qa_by.firstname || ''} ${call.segmentation_qa_by.lastname || ''}`}</div>
                                  <div className="text-xs text-neutral-400">{call.segmentation_qa_by.email || ""}</div>
                                </div>
                              ) : (
                                <span className="text-xs text-neutral-500 italic">Unassigned</span>
                              )}
                            </td>
                            <td className="py-4 px-6">
                              {call.segmentation_qa ? (
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/50">
                                  ✓ Approved
                                </span>
                              ) : call.segmentation_rejected ? (
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-950 text-rose-300 border border-rose-700/50">
                                  ✗ Rejected
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-950 text-amber-300 border border-amber-700/50">
                                  ⏳ Pending
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-6">
                              <div className="text-xs text-neutral-300">
                                Changes: <strong className="text-white">{call.qa_changes_count || 0}</strong>
                              </div>
                              <div className="text-xs text-emerald-400 font-semibold">
                                Payout: {call.qa_payout_percentage !== undefined ? call.qa_payout_percentage : 100}%
                              </div>
                            </td>
                            <td className="py-4 px-6 text-xs text-neutral-300 whitespace-nowrap">
                              {formatDate(call.segmentation_qa_at || call.updatedAt)}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-4 px-6">
                              <div className="font-semibold text-white capitalize">{call.language || "N/A"}</div>
                              <div className="text-xs text-neutral-400 truncate max-w-[180px]">
                                {call.topicId?.title || "Default Topic"}
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <div className="text-xs text-neutral-300">
                                👤 <span className="font-semibold text-cyan-400">{call.userA?.username || "Speaker 1"}</span>
                              </div>
                              <div className="text-xs text-neutral-300 mt-1">
                                🎧 <span className="font-semibold text-purple-400">{call.userB?.username || "Speaker 2"}</span>
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              {call.Segmentation_Done ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-emerald-900/40 text-emerald-300 border border-emerald-500/30">
                                  ✓ Saved ({call.total_segments || 0} segs)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-amber-900/40 text-amber-300 border border-amber-500/30">
                                  ⏳ Pending Submission
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-6">
                              {call.segmentation_qa ? (
                                <div className="flex flex-col gap-1">
                                  <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-400/50 shadow-sm w-fit">
                                    ✓ QA Approved ({call.qa_payout_percentage !== undefined ? call.qa_payout_percentage : 100}% Pay)
                                  </span>
                                  <span className="text-[10px] text-cyan-400 font-semibold flex items-center gap-1">
                                    🚀 Queued for Transcription
                                  </span>
                                </div>
                              ) : call.segmentation_rejected ? (
                                <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-full bg-rose-950 text-rose-300 border border-rose-700/50">
                                  ✗ Rejected
                                </span>
                              ) : call.Segmentation_Done ? (
                                <div className="flex flex-col gap-1">
                                  <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-full bg-amber-900/50 text-amber-300 border border-amber-500/40 w-fit">
                                    🧐 Pending QA Review
                                  </span>
                                  <span className="text-[10px] text-neutral-400">
                                    10% cut per QA change
                                  </span>
                                </div>
                              ) : (
                                <span className="px-3 py-1 text-xs font-medium rounded-full bg-neutral-700 text-neutral-400 border border-neutral-600">
                                  Unsegmented
                                </span>
                              )}
                            </td>
                          </>
                        )}

                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {call.Segmentation_Done && (
                              <button
                                onClick={() => handleOpenReview(call)}
                                className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
                              >
                                <span>🔍</span> Review Timestamps
                              </button>
                            )}
                            <button
                              onClick={() => openInSegmentationCanvas(call)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md flex items-center gap-1.5 ${
                                call.Segmentation_Done
                                  ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                                  : "bg-primary-600 hover:bg-primary-500 text-white"
                              }`}
                              title={call.Segmentation_Done ? "Open in Canvas" : "Start Segmentation in Canvas"}
                            >
                              <span>↗</span> Canvas
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination footer */}
            {pages > 1 && (
              <div className="p-4 bg-neutral-900/40 border-t border-neutral-700 flex items-center justify-between text-xs text-neutral-400">
                <span>Page {page} of {pages} ({total} calls)</span>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => loadSegmentationCalls(page - 1)}
                    className="px-3 py-1 bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-white rounded-lg"
                  >
                    Previous
                  </button>
                  <button
                    disabled={page >= pages}
                    onClick={() => loadSegmentationCalls(page + 1)}
                    className="px-3 py-1 bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-white rounded-lg"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Review Modal */}
        {selectedCall && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={handleCloseReview}>
          <div className="bg-neutral-850 border border-neutral-700 rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className="p-5 bg-neutral-800 border-b border-neutral-700 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                    <span>🔍</span> Segmentation Review & QC
                  </h2>
                  <span className="px-2.5 py-0.5 rounded bg-warning-500/20 text-warning-300 font-mono text-xs font-bold border border-warning-500/30">
                    {selectedCall.callId}
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Topic: <strong className="text-white">{selectedCall.topicId?.title || "General"}</strong> • Language: <strong className="text-white capitalize">{selectedCall.language || "Hindi"}</strong>
                </p>
              </div>
              <button
                onClick={handleCloseReview}
                className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {loadingSegments ? (
                <div className="py-16 text-center text-neutral-400">
                  <div className="w-8 h-8 border-2 border-warning-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  Loading segments...
                </div>
              ) : segmentError ? (
                <div className="p-4 bg-red-950/40 border border-red-800 text-red-300 rounded-xl text-xs">
                  ⚠️ {segmentError}
                </div>
              ) : (
                <>
                  {/* Changes Summary Banner */}
                  <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <span className="text-[10px] text-neutral-400 uppercase font-bold">Total Segments</span>
                      <div className="text-xl font-bold text-white mt-0.5">{reviewSegments.length}</div>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-400 uppercase font-bold">QA Changes Detected</span>
                      <div className={`text-xl font-bold mt-0.5 ${currentChangesCount > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                        {currentChangesCount} changes
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-400 uppercase font-bold">Penalty</span>
                      <div className="text-xl font-bold text-rose-400 mt-0.5">{currentPenalty}% cut</div>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-400 uppercase font-bold">Final Contributor Payout</span>
                      <div className="text-xl font-bold text-emerald-400 mt-0.5">{currentPayout}%</div>
                    </div>
                  </div>

                  {/* Segments List */}
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {reviewSegments.map((seg, idx) => {
                      const isPlaying = playingSegmentId === seg.segment_id;
                      const isSpk2 = seg.speaker === "speaker2";
                      return (
                        <div
                          key={seg.segment_id || idx}
                          className="bg-neutral-800/80 border border-neutral-700/80 rounded-xl p-3 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono text-neutral-400 font-bold bg-neutral-900 px-2 py-0.5 rounded">
                              #{idx + 1}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              isSpk2 ? "bg-purple-950 text-purple-300 border border-purple-700/50" : "bg-cyan-950 text-cyan-300 border border-cyan-700/50"
                            }`}>
                              {isSpk2 ? "Speaker 2" : "Speaker 1"}
                            </span>
                            <span className="font-mono text-neutral-300">
                              ⏱️ {formatSecToMinSec(seg.start_sec)} ➔ {formatSecToMinSec(seg.end_sec)} ({((seg.end_sec || 0) - (seg.start_sec || 0)).toFixed(2)}s)
                            </span>
                          </div>

                          <button
                            onClick={() => handlePlaySegment(seg, selectedCall)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                              isPlaying ? "bg-red-500 text-white animate-pulse" : "bg-neutral-700 hover:bg-neutral-600 text-white"
                            }`}
                          >
                            {isPlaying ? "⏹ Stop" : "▶ Play"}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* QA Notes & Review Actions */}
                  <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 space-y-3">
                    <label className="block text-xs font-bold text-neutral-300 uppercase">QA Notes / Feedback for Segmenter</label>
                    <textarea
                      value={qaNotes}
                      onChange={(e) => setQaNotes(e.target.value)}
                      placeholder="Optional notes regarding segment boundaries, overlap corrections, etc."
                      className="w-full bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs p-3 rounded-lg focus:outline-none focus:border-warning-500 min-h-[70px]"
                    />
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        onClick={() => handleQaDecision("rejected")}
                        disabled={submittingQa}
                        className="px-4 py-2 bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all"
                      >
                        ✗ Reject Segmentation
                      </button>
                      <button
                        onClick={() => handleQaDecision("approved")}
                        disabled={submittingQa}
                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all shadow-md"
                      >
                        ✓ Approve Segmentation ({currentPayout}% Pay)
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
