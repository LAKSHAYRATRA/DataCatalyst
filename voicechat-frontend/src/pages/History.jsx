import React, { useEffect, useState } from "react";
import Nav from "../components/Nav.jsx";
import { apiDownloadRecording, apiGet } from "../lib/api.js";

export default function History() {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiGet("/api/history");
        setSessions(res.sessions || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const formatDuration = (start, end) => {
    if (!end) return "-";
    const diff = new Date(end) - new Date(start);
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today, " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return "Yesterday, " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString() + ", " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-gradient-subtle pt-16 md:pt-0 md:pl-64">
      <Nav />
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-12">
        <div className="text-center mb-6 md:mb-8 animate-fade-in">
          <div className="w-14 h-14 md:w-16 md:h-16 bg-gradient-primary rounded-full mx-auto mb-3 md:mb-4 flex items-center justify-center shadow-lg">
            <svg className="w-7 h-7 md:w-8 md:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-2 px-4">Call History</h1>
          <p className="text-sm md:text-base text-neutral-600 px-4">View your past conversations and recordings</p>
        </div>

        {error && (
          <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-lg mb-6 animate-scale-in">
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              {error}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="card text-center py-12 md:py-16 animate-fade-in">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-neutral-100 rounded-full mx-auto mb-3 md:mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 md:w-10 md:h-10 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
              </svg>
            </div>
            <h3 className="text-lg md:text-xl font-semibold text-neutral-700 mb-2 px-4">No calls yet</h3>
            <p className="text-sm md:text-base text-neutral-500 mb-4 md:mb-6 px-4">Start your first voice call to see it here!</p>
            <a href="/call" className="btn btn-primary inline-flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
              </svg>
              Start a Call
            </a>
          </div>
        ) : (
          <div className="space-y-4 animate-slide-up">
            {sessions.map((s) => (
              <div
                key={s.callId}
                className="card-hover"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-start justify-between mb-4 gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-primary rounded-full flex items-center justify-center text-white font-semibold text-sm md:text-base">
                      {s.peer?.username?.[0]?.toUpperCase() || "?"}
                    </div>
                    <div>
                      <div className="font-semibold text-sm md:text-base text-neutral-900">
                        {s.peer?.username || "Unknown User"}
                      </div>
                      <div className="text-xs md:text-sm text-neutral-500">
                        {formatDate(s.startedAt)}
                      </div>
                    </div>
                  </div>
                  <div className="text-left sm:text-right flex-shrink-0">
                    <div className="text-xs md:text-sm font-medium text-neutral-700">
                      {formatDuration(s.startedAt, s.endedAt)}
                    </div>
                    <div className={`text-xs px-2 py-1 rounded-full inline-block mt-1 ${s.endReason === 'completed' ? 'bg-success-100 text-success-700' :
                      s.endReason === 'timeout' ? 'bg-warning-50 text-warning-600' :
                        'bg-neutral-100 text-neutral-600'
                      }`}>
                      {s.endReason || 'Unknown'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 text-sm">
                  <div className="bg-neutral-50 p-3 rounded-lg">
                    <div className="text-xs text-neutral-500 mb-1">Call ID</div>
                    <div className="font-mono text-neutral-700 truncate">{s.callId.slice(0, 16)}...</div>
                  </div>
                  <div className="bg-neutral-50 p-3 rounded-lg">
                    <div className="text-xs text-neutral-500 mb-1">Started</div>
                    <div className="text-neutral-700">{new Date(s.startedAt).toLocaleTimeString()}</div>
                  </div>
                  <div className="bg-neutral-50 p-3 rounded-lg">
                    <div className="text-xs text-neutral-500 mb-1">Ended</div>
                    <div className="text-neutral-700">
                      {s.endedAt ? new Date(s.endedAt).toLocaleTimeString() : "-"}
                    </div>
                  </div>
                </div>


              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
