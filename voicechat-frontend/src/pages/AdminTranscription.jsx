import React, { useEffect, useState, useRef } from "react";
import AdminNav from "../components/AdminNav.jsx";
import { getUserInfo } from "../lib/auth.js";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

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

export default function AdminTranscription() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Detailed Verification Modal State
  const [selectedCall, setSelectedCall] = useState(null);
  const [transcriptionData, setTranscriptionData] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState(null);
  const [activeSegmentFilter, setActiveSegmentFilter] = useState("pending_review");
  const [savingSegmentId, setSavingSegmentId] = useState(null);
  const [toastMessage, setToastMessage] = useState("");

  // Audio Playback for verification
  const [playingAudioKey, setPlayingAudioKey] = useState(null);
  const audioRef = useRef(null);
  const audioEndTimeoutRef = useRef(null);
  const segmentRefs = useRef({});

  const userInfo = getUserInfo();

  const loadTranscriptionCalls = async (pageNum = 1) => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/admin/qa/transcription-calls?page=${pageNum}&limit=20&status=${statusFilter}`;
      if (searchQuery.trim()) {
        url += `&search=${encodeURIComponent(searchQuery.trim())}`;
      }
      const data = await apiFetch(url);
      setCalls(data.calls || []);
      setPage(data.page || 1);
      setPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message || "Failed to load transcription calls");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTranscriptionCalls(1);
  }, [statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadTranscriptionCalls(1);
  };

  const handleOpenVerifyModal = async (call) => {
    const cId = call?.callId || call?.call_id || call?._id;
    if (!cId) return;
    setSelectedCall({ ...call, callId: cId });
    setTranscriptionData(null);
    setDetailsError(null);
    setLoadingDetails(true);
    setActiveSegmentFilter("all");
    stopAudio();

    try {
      const data = await apiFetch(`/api/admin/qa/calls/${encodeURIComponent(cId)}/transcription`);
      setTranscriptionData(data);
      setActiveSegmentFilter("all");
    } catch (err) {
      setDetailsError(err.message || "Failed to load transcription segments");
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCloseVerifyModal = (e) => {
    if (e && e.target !== e.currentTarget && e.currentTarget.id === "modal-backdrop") return;
    stopAudio();
    setSelectedCall(null);
    setTranscriptionData(null);
  };

  const stopAudio = () => {
    if (audioEndTimeoutRef.current) {
      clearTimeout(audioEndTimeoutRef.current);
      audioEndTimeoutRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setPlayingAudioKey(null);
  };

  const playSegmentOrWordAudio = (speaker, startSec, endSec, key) => {
    if (!selectedCall) return;
    stopAudio();

    const cId = selectedCall.callId || selectedCall.call_id;
    const audioUrl = speaker === "speaker2" || speaker === "userB"
      ? (transcriptionData?.audio2Url || `${BACKEND_URL}/api/admin/qa/calls/${encodeURIComponent(cId)}/recording/speaker2`)
      : (transcriptionData?.audio1Url || `${BACKEND_URL}/api/admin/qa/calls/${encodeURIComponent(cId)}/recording/speaker1`);

    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(audioUrl);
      } else {
        audioRef.current.src = audioUrl;
      }

      const start = Math.max(0, Number(startSec) || 0);
      const end = Math.max(start + 0.1, Number(endSec) || (start + 1.0));
      const durationMs = (end - start) * 1000;

      audioRef.current.currentTime = start;
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          setPlayingAudioKey(key);
          audioEndTimeoutRef.current = setTimeout(() => {
            stopAudio();
          }, durationMs);
        }).catch(e => {
          console.warn("Audio playback not allowed or aborted:", e);
          setPlayingAudioKey(null);
        });
      }
    } catch (e) {
      console.warn("Audio error:", e);
      setPlayingAudioKey(null);
    }
  };

  const handleToggleSegmentTranscribed = async (segment) => {
    if (!selectedCall) return;
    setSavingSegmentId(segment.segment_id);
    try {
      const nextVal = !segment.IsTranscribed;
      const res = await apiFetch(`/api/admin/qa/calls/${encodeURIComponent(selectedCall.callId)}/transcription/segments/${encodeURIComponent(segment.segment_id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          tier1_text_verified: nextVal, 
          tier2_timestamps_verified: nextVal,
          IsTranscribed: nextVal 
        })
      });

      setTranscriptionData(prev => ({
        ...prev,
        transcribed_count: res.transcribed_count ?? prev.transcribed_count,
        segments: prev.segments.map(s => s.segment_id === segment.segment_id ? res.segment : s)
      }));
      showToast(`Segment #${segment.segment_id}: ${nextVal ? 'Transcribed' : 'Marked Pending'}`);
    } catch (err) {
      alert(`Error updating segment: ${err.message}`);
    } finally {
      setSavingSegmentId(null);
    }
  };

  const handleApproveSegmentQA = async (segment, currentIdx) => {
    if (!selectedCall) return;
    setSavingSegmentId(segment.segment_id);
    try {
      const nextVal = !segment.QAVerified;
      const res = await apiFetch(`/api/admin/qa/calls/${encodeURIComponent(selectedCall.callId)}/transcription/segments/${encodeURIComponent(segment.segment_id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ QAVerified: nextVal })
      });

      const updatedSegments = (transcriptionData?.segments || []).map(s =>
        s.segment_id === segment.segment_id ? res.segment : s
      );

      const newQaCount = updatedSegments.filter(s => s.QAVerified).length;
      const totalCount = updatedSegments.length;

      setTranscriptionData(prev => ({
        ...prev,
        qa_verified_count: newQaCount,
        segments: updatedSegments
      }));

      if (nextVal) {
        showToast(`✓ Segment #${currentIdx + 1} QA Approved (${newQaCount}/${totalCount})`);
        
        // Auto-scroll to next unreviewed segment if available
        const nextUnreviewed = updatedSegments.find((s, idx) => idx > currentIdx && !s.QAVerified);
        if (nextUnreviewed && segmentRefs.current[nextUnreviewed.segment_id]) {
          segmentRefs.current[nextUnreviewed.segment_id].scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } else {
        showToast(`Unapproved Segment #${currentIdx + 1}`);
      }
    } catch (err) {
      alert(`Error updating QA: ${err.message}`);
    } finally {
      setSavingSegmentId(null);
    }
  };

  const [resettingQa, setResettingQa] = useState(false);

  const handleResetCallQA = async () => {
    if (!selectedCall) return;
    if (!window.confirm(`Are you sure you want to UNREVIEW and reset all segments for call ${selectedCall.callId}?`)) return;

    setResettingQa(true);
    try {
      await apiFetch(`/api/admin/qa/calls/${encodeURIComponent(selectedCall.callId)}/transcription/reset-qa`, {
        method: "POST"
      });

      showToast(`✓ All segments for ${selectedCall.callId} reset to Unreviewed.`);
      const updated = await apiFetch(`/api/admin/qa/calls/${encodeURIComponent(selectedCall.callId)}/transcription`);
      setTranscriptionData(updated);
      setActiveSegmentFilter("pending_review");
      loadTranscriptionCalls(page);
    } catch (err) {
      alert(`Error resetting call: ${err.message}`);
    } finally {
      setResettingQa(false);
    }
  };

  const handleJumpToNextUnreviewed = () => {
    const list = transcriptionData?.segments || [];
    const firstUnreviewed = list.find(s => !s.QAVerified);
    if (firstUnreviewed && segmentRefs.current && segmentRefs.current[firstUnreviewed.segment_id]) {
      segmentRefs.current[firstUnreviewed.segment_id].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3000);
  };

  const totalSegmentsCount = transcriptionData?.segments?.length || 0;
  const qaApprovedCount = (transcriptionData?.segments || []).filter(s => s.QAVerified).length;
  const isCallFullyQAApproved = totalSegmentsCount > 0 && qaApprovedCount >= totalSegmentsCount;
  const qaProgressPct = totalSegmentsCount > 0 ? Math.round((qaApprovedCount / totalSegmentsCount) * 100) : 0;

  const filteredSegments = (transcriptionData?.segments || []).filter(s => {
    if (activeSegmentFilter === "pending_transcription") return !s.IsTranscribed;
    if (activeSegmentFilter === "pending_review") return !s.QAVerified;
    if (activeSegmentFilter === "qa_verified") return s.QAVerified;
    return true;
  });

  return (
    <div className="min-h-screen bg-neutral-900 pt-16 md:pt-0 md:pl-64 text-neutral-100">
      <AdminNav />

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <span>🎙️</span>
              <span>Transcription Management</span>
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              Review dialogue transcriptions segment by segment, inspect word timestamps, and approve all segments for QA.
            </p>
          </div>
          <button
            onClick={() => loadTranscriptionCalls(page)}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-all"
          >
            <span>🔄</span>
            <span>Refresh Queue</span>
          </button>
        </div>

        {/* 5 Tab Navigation & Search Bar */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {[
              { id: "all", label: "All Calls" },
              { id: "pending_transcription", label: "⏳ Pending Transcription" },
              { id: "pending_review", label: "🧐 Pending Review" },
              { id: "fully_transcribed", label: "✓ Fully Transcribed" },
              { id: "qa_reviewed", label: "🌟 QA Reviewed" },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => { setStatusFilter(tab.id); setPage(1); }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  statusFilter === tab.id
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

        {/* Error Alert */}
        {error && (
          <div className="bg-red-900/40 border border-red-500/50 text-red-200 p-4 rounded-xl text-xs flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button onClick={() => loadTranscriptionCalls(page)} className="underline hover:text-white">Retry</button>
          </div>
        )}

        {/* Calls Table (Calls Only) */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-750 border-b border-neutral-700 text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                  <th className="p-3.5">Call ID</th>
                  <th className="p-3.5">Speakers</th>
                  <th className="p-3.5">Language / Topic</th>
                  <th className="p-3.5 text-center">Total Segments</th>
                  <th className="p-3.5">QA Review Progress</th>
                  <th className="p-3.5">QA Status</th>
                  <th className="p-3.5 text-right sticky right-0 bg-neutral-750 z-10">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-700/60 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-neutral-400">
                      <div className="w-6 h-6 border-2 border-warning-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                      Loading transcription calls...
                    </td>
                  </tr>
                ) : calls.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-neutral-400">
                      No calls found in this category.
                    </td>
                  </tr>
                ) : (
                  calls.map((call, cIdx) => {
                    const cId = String(call?.callId || call?.call_id || `call_${cIdx}`);
                    const totalSegs = Number(call?.total_segments) || 1;
                    const qaCount = Number(call?.qa_verified_count) || 0;
                    const qaPct = Math.min(100, Math.round((qaCount / totalSegs) * 100));

                    return (
                      <tr key={cId} className="hover:bg-neutral-700/30 transition-colors group">
                        <td className="p-3.5 font-mono text-neutral-300 font-semibold">
                          <span title={cId}>
                            {cId.length > 12 ? `${cId.slice(0, 10)}...` : cId}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <div className="text-white font-medium">A: {call?.userA?.username || "Speaker A"}</div>
                          <div className="text-neutral-400">B: {call?.userB?.username || "Speaker B"}</div>
                        </td>
                        <td className="p-3.5">
                          <div className="font-medium text-white">{call?.topicId?.title || (typeof call?.topicId === 'string' ? call.topicId : "Discussion")}</div>
                          <div className="text-[10px] text-neutral-400 uppercase tracking-wide">{call?.language || "Hindi"}</div>
                        </td>
                        <td className="p-3.5 text-center font-bold text-white">
                          <span className="px-2.5 py-0.5 rounded bg-neutral-900 border border-neutral-700 font-mono">
                            {call?.total_segments || 0}
                          </span>
                        </td>
                        <td className="p-3.5 min-w-[170px]">
                          <div className="flex items-center justify-between text-[11px] text-neutral-300 mb-1">
                            <span>{qaCount} / {call?.total_segments || 0} QA approved</span>
                            <span className={`font-bold ${qaPct === 100 ? "text-emerald-400" : "text-amber-400"}`}>{qaPct}%</span>
                          </div>
                          <div className="w-full bg-neutral-700 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full transition-all duration-300 ${
                                qaPct === 100 ? "bg-emerald-500" : "bg-amber-500"
                              }`}
                              style={{ width: `${qaPct}%` }}
                            />
                          </div>
                        </td>
                        <td className="p-3.5">
                          {call?.isQAComplete ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700/50">
                              🌟 QA Reviewed
                            </span>
                          ) : call?.isFullyTranscribed ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-700/50">
                              Pending QA Review ({qaCount}/{call?.total_segments || 0})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-700/50">
                              In Progress ({qaCount}/{call?.total_segments || 0})
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right sticky right-0 bg-neutral-800 group-hover:bg-neutral-750 transition-colors z-10">
                          <button
                            onClick={() => handleOpenVerifyModal(call)}
                            className="px-3.5 py-1.5 bg-warning-500 hover:bg-warning-400 text-neutral-950 font-bold rounded-lg text-xs transition-all shadow-sm flex items-center gap-1.5 ml-auto"
                          >
                            <span>🔍</span>
                            <span>Segments</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="bg-neutral-750 px-4 py-3 border-t border-neutral-700 flex items-center justify-between">
              <span className="text-xs text-neutral-400">
                Showing page {page} of {pages} ({total} calls)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-white rounded text-xs transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(pages, p + 1))}
                  disabled={page >= pages}
                  className="px-3 py-1 bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-white rounded text-xs transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Segment-by-Segment Review Inspector Modal */}
      {selectedCall && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onClick={handleCloseVerifyModal}>
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-6xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            
            {/* Modal Top Bar */}
            <div className="p-5 bg-neutral-800 border-b border-neutral-700 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                    <span>🎙️</span>
                    <span>Segment-by-Segment Transcription Review</span>
                  </h2>
                  <span className="px-2.5 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-700/50 text-xs font-mono font-bold">
                    {selectedCall.callId}
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Topic: <strong className="text-white">{selectedCall.topicId?.title || "General"}</strong> • Language: <strong className="text-white uppercase">{selectedCall.language || "Hindi"}</strong> • Speakers: <strong className="text-white">{selectedCall.userA?.username || "Speaker A"} & {selectedCall.userB?.username || "Speaker B"}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetCallQA}
                  disabled={resettingQa}
                  className="px-3 py-1.5 bg-neutral-750 hover:bg-rose-950 border border-neutral-600 hover:border-rose-600 text-neutral-300 hover:text-rose-300 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                  title="Unreview and reset all segments in this call to pending QA"
                >
                  <span>🔄</span>
                  <span>{resettingQa ? "Resetting..." : "Unreview All Segments"}</span>
                </button>

                <button
                  onClick={handleCloseVerifyModal}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {loadingDetails ? (
                <div className="py-16 text-center text-neutral-400">
                  <div className="w-8 h-8 border-2 border-warning-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  Loading segments and word timestamps...
                </div>
              ) : detailsError ? (
                <div className="p-4 bg-red-950/40 border border-red-800 text-red-300 rounded-xl text-xs">
                  ⚠️ {detailsError}
                </div>
              ) : !transcriptionData ? null : (
                <>
                  {/* QA Review Progress Tracker Banner */}
                  <div className="bg-neutral-800 border border-neutral-700 p-4 rounded-xl space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="text-xs uppercase font-bold text-neutral-400">
                          QA Approval Progress
                        </div>
                        <div className="text-xl font-black text-white mt-0.5 flex items-center gap-2">
                          <span className={isCallFullyQAApproved ? "text-emerald-400" : "text-warning-400"}>
                            {qaApprovedCount} / {totalSegmentsCount} Segments Approved
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-neutral-900 text-neutral-300 border border-neutral-700 font-mono">
                            {qaProgressPct}%
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isCallFullyQAApproved && (
                          <button
                            onClick={handleJumpToNextUnreviewed}
                            className="px-3.5 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                          >
                            <span>⚡ Jump to Next Unapproved</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-neutral-900 rounded-full h-2.5 overflow-hidden border border-neutral-700">
                      <div
                        className={`h-2.5 rounded-full transition-all duration-500 ${
                          isCallFullyQAApproved
                            ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                            : "bg-gradient-to-r from-warning-500 to-amber-400"
                        }`}
                        style={{ width: `${qaProgressPct}%` }}
                      />
                    </div>

                    {isCallFullyQAApproved ? (
                      <div className="p-3 bg-emerald-950/60 border border-emerald-500/50 rounded-lg text-xs text-emerald-300 font-semibold flex items-center gap-2">
                        <span>🎉</span>
                        <span>All {totalSegmentsCount} segments in this call have been individually reviewed & QA approved!</span>
                      </div>
                    ) : (
                      <div className="text-xs text-neutral-400">
                        Please review each segment below and click <strong className="text-emerald-400">Approve Segment</strong>. All {totalSegmentsCount} segments must be approved before this call moves to <strong className="text-white">QA Reviewed</strong>.
                      </div>
                    )}
                  </div>

                  {/* Filter Subtabs for Segments */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                      {[
                        { id: "all", label: `All Segments (${totalSegmentsCount})` },
                        { id: "pending_review", label: `⏳ Pending Review (${totalSegmentsCount - qaApprovedCount})` },
                        { id: "qa_verified", label: `🌟 QA Approved (${qaApprovedCount})` },
                      ].map(f => (
                        <button
                          key={f.id}
                          onClick={() => setActiveSegmentFilter(f.id)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                            activeSegmentFilter === f.id
                              ? "bg-warning-500 text-neutral-950 font-bold"
                              : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Segments & Word-Level Timestamps List */}
                  <div className="space-y-4">
                    {filteredSegments.length === 0 ? (
                      <div className="p-8 text-center text-neutral-400 bg-neutral-800/40 rounded-xl border border-neutral-700/50">
                        No segments match this filter.
                      </div>
                    ) : (
                      filteredSegments.map((seg, idx) => {
                        const isPlayingSegment = playingAudioKey === `seg_${seg?.segment_id}`;
                        const isSpeakerB = seg?.speaker === "speaker2" || seg?.speaker === "userB";
                        const speakerName = isSpeakerB ? (selectedCall?.userB?.username || "Speaker B") : (selectedCall?.userA?.username || "Speaker A");
                        const speakerLabel = isSpeakerB ? `Speaker B (${speakerName})` : `Speaker A (${speakerName})`;
                        const startS = Number(seg?.start_sec) || 0;
                        const endS = Number(seg?.end_sec) || 0;
                        const durS = Math.max(0, endS - startS).toFixed(2);

                        return (
                          <div
                            key={seg?.segment_id || idx}
                            ref={el => { if (seg?.segment_id) segmentRefs.current[seg.segment_id] = el; }}
                            className={`bg-neutral-800 border rounded-xl p-4 shadow-sm transition-all space-y-3 ${
                              seg?.QAVerified
                                ? "border-emerald-700/60 bg-emerald-950/10"
                                : "border-neutral-700 hover:border-neutral-500"
                            }`}
                          >
                            {/* Segment Top Meta Header */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-neutral-700/50">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-neutral-300 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-700">
                                  #{idx + 1} {seg?.segment_id}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                  isSpeakerB ? "bg-indigo-950 text-indigo-300 border border-indigo-700/50" : "bg-teal-950 text-teal-300 border border-teal-700/50"
                                }`}>
                                  {speakerLabel}
                                </span>
                                <span className="text-xs font-mono text-neutral-400">
                                  ⏱️ {formatSecToMinSec(startS)} ➔ {formatSecToMinSec(endS)} ({durS}s)
                                </span>
                              </div>

                              {/* Play Segment Audio Button */}
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => playSegmentOrWordAudio(seg.speaker, seg.start_sec, seg.end_sec, `seg_${seg.segment_id}`)}
                                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                    isPlayingSegment
                                      ? "bg-red-500 text-white animate-pulse"
                                      : "bg-neutral-700 hover:bg-neutral-600 text-white"
                                  }`}
                                >
                                  <span>{isPlayingSegment ? "⏹ Stop" : "▶ Play Segment"}</span>
                                </button>
                              </div>
                            </div>

                            {/* Segment Text Transcript */}
                            <div className="bg-neutral-900/70 p-3 rounded-lg border border-neutral-700/60">
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                                  <span>📝</span>
                                  <span>Segment Text Transcript</span>
                                </div>
                                <button
                                  onClick={() => handleToggleSegmentTranscribed(seg)}
                                  disabled={savingSegmentId === seg.segment_id}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                                    seg.IsTranscribed
                                      ? "bg-emerald-900/70 text-emerald-200 border border-emerald-500/50"
                                      : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
                                  }`}
                                >
                                  {seg.IsTranscribed ? "✓ Transcribed" : "⏳ Mark Transcribed"}
                                </button>
                              </div>
                              <p className="text-sm font-medium text-white leading-relaxed">
                                {seg.segment_text || <span className="text-neutral-500 italic">No text transcript submitted yet for this segment.</span>}
                              </p>
                            </div>

                            {/* Word-Level Timestamps */}
                            <div className="bg-neutral-900/70 p-3 rounded-lg border border-neutral-700/60">
                              <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                                <span>⏱️</span>
                                <span>Word-Level Timestamps ({seg.words?.length || 0} words)</span>
                              </div>

                              {(!seg.words || seg.words.length === 0) ? (
                                <div className="text-xs text-neutral-500 italic">
                                  No word-level timestamps generated yet for this segment.
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {seg.words.map((w, wIdx) => {
                                    const wordKey = `word_${seg.segment_id}_${wIdx}`;
                                    const isPlayingWord = playingAudioKey === wordKey;

                                    return (
                                      <button
                                        key={wIdx}
                                        onClick={() => playSegmentOrWordAudio(seg.speaker, w.start, w.end, wordKey)}
                                        title={`Click to listen: [${w.start}s - ${w.end}s]`}
                                        className={`group relative px-2.5 py-1.5 rounded-lg text-left transition-all border ${
                                          isPlayingWord
                                            ? "bg-amber-500 text-neutral-950 border-amber-300 font-bold scale-105 shadow-md"
                                            : "bg-neutral-800 hover:bg-neutral-700/80 border-neutral-700 text-neutral-200 hover:border-neutral-500"
                                        }`}
                                      >
                                        <div className="text-xs font-semibold leading-tight">{w.word || w.text || ""}</div>
                                        <div className="text-[9px] font-mono opacity-70 group-hover:opacity-100 flex items-center gap-1 mt-0.5">
                                          <span>{Number(w.start || 0).toFixed(2)}s</span>
                                          <span>-</span>
                                          <span>{Number(w.end || 0).toFixed(2)}s</span>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Segment Individual QA Approval Action */}
                            <div className="flex items-center justify-between pt-1 border-t border-neutral-750">
                              <span className="text-xs text-neutral-400">
                                {seg.QAVerified ? (
                                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                    <span>✓</span> Verified by QA
                                  </span>
                                ) : (
                                  <span className="text-amber-400 font-semibold flex items-center gap-1">
                                    <span>⏳</span> Awaiting QA Verification
                                  </span>
                                )}
                              </span>

                              <button
                                onClick={() => handleApproveSegmentQA(seg, idx)}
                                disabled={savingSegmentId === seg.segment_id}
                                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow flex items-center gap-1.5 ${
                                  seg.QAVerified
                                    ? "bg-emerald-700 hover:bg-emerald-800 text-white border border-emerald-500"
                                    : "bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse hover:animate-none"
                                }`}
                              >
                                <span>{seg.QAVerified ? "🌟 QA Approved (Click to Undo)" : "✓ Approve Segment"}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Modal Bottom Action Footer */}
            <div className="p-4 bg-neutral-800 border-t border-neutral-700 flex items-center justify-between">
              <span className="text-xs text-neutral-400">
                {toastMessage && <span className="text-emerald-400 font-bold animate-fade-in">{toastMessage}</span>}
              </span>
              <button
                onClick={handleCloseVerifyModal}
                className="px-5 py-2 bg-neutral-700 hover:bg-neutral-600 text-white text-xs font-bold rounded-lg transition-colors"
              >
                Done & Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
