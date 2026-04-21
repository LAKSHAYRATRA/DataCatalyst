import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "../components/Nav.jsx";
import { apiPostJson } from "../lib/api.js";
import { clearLastCall, getLastCall } from "../lib/lastCall.js";

export default function Feedback() {
  const navigate = useNavigate();

  const last = useMemo(() => getLastCall(), []);
  const [ratingOverall, setRatingOverall] = useState(5);
  const [audioQuality, setAudioQuality] = useState(5);
  const [wouldTalkAgain, setWouldTalkAgain] = useState(true);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setOk(false);
    setLoading(true);

    if (!last?.callId || !last?.peerUserId) {
      setError("missing_call_context");
      setLoading(false);
      return;
    }

    try {
      await apiPostJson("/api/feedback", {
        callId: last.callId,
        toUserId: last.peerUserId,
        ratingOverall: Number(ratingOverall),
        audioQuality: Number(audioQuality),
        wouldTalkAgain: Boolean(wouldTalkAgain),
        notes,
      });
      setOk(true);
      clearLastCall();
      setTimeout(() => navigate("/history"), 1500);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setLoading(false);
    }
  }

  const StarRating = ({ value, onChange, label }) => {
    return (
      <div>
        <label className="block text-xs md:text-sm font-medium text-neutral-700 mb-2 md:mb-3">{label}</label>
        <div className="flex items-center space-x-1 md:space-x-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => onChange(star)}
              className="focus:outline-none transition-transform hover:scale-110 touch-manipulation"
            >
              <svg
                className={`w-8 h-8 md:w-10 md:h-10 ${star <= value ? 'text-warning-500' : 'text-neutral-300'
                  }`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </button>
          ))}
          <span className="ml-1 md:ml-2 text-xs md:text-sm font-semibold text-neutral-600">{value}/5</span>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-subtle pt-16 md:pt-0 md:pl-64">
      <Nav />
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-12">
        <div className="text-center mb-6 md:mb-8 animate-fade-in">
          <div className="w-14 h-14 md:w-16 md:h-16 bg-gradient-primary rounded-full mx-auto mb-3 md:mb-4 flex items-center justify-center shadow-lg">
            <svg className="w-7 h-7 md:w-8 md:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path>
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-2 px-4">How was your call?</h1>
          <p className="text-sm md:text-base text-neutral-600 px-4">Your feedback helps us improve</p>
        </div>

        <div className="card animate-slide-up">
          {last?.callId && (
            <div className="bg-neutral-50 rounded-lg p-4 mb-6 border border-neutral-200">
              <div className="text-xs text-neutral-500 mb-1">Call Details</div>
              <div className="text-sm text-neutral-700">
                <span className="font-mono">{last.callId.slice(0, 12)}...</span>
                {last.peerUsername && (
                  <span className="ml-2">• {last.peerUsername}</span>
                )}
              </div>
            </div>
          )}

          <form onSubmit={submit} className="space-y-6">
            <StarRating
              value={ratingOverall}
              onChange={setRatingOverall}
              label="Overall Experience"
            />

            <StarRating
              value={audioQuality}
              onChange={setAudioQuality}
              label="Audio Quality"
            />

            <div>
              <label className="block text-xs md:text-sm font-medium text-neutral-700 mb-2">
                Would you talk to this person again?
              </label>
              <div className="flex flex-col sm:flex-row gap-2 md:gap-3">
                <button
                  type="button"
                  onClick={() => setWouldTalkAgain(true)}
                  className={`flex-1 py-2.5 md:py-3 rounded-lg text-sm md:text-base font-semibold transition-all ${wouldTalkAgain
                    ? 'bg-success-600 text-white shadow-sm'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                >
                  <svg className="w-4 h-4 md:w-5 md:h-5 inline-block mr-1 md:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"></path>
                  </svg>
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setWouldTalkAgain(false)}
                  className={`flex-1 py-2.5 md:py-3 rounded-lg text-sm md:text-base font-semibold transition-all ${!wouldTalkAgain
                    ? 'bg-error-600 text-white shadow-sm'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                >
                  <svg className="w-5 h-5 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5"></path>
                  </svg>
                  No
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs md:text-sm font-medium text-neutral-700 mb-2">
                Additional Comments (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="input resize-none"
                placeholder="Share your thoughts about the conversation..."
              />
            </div>

            {error && (
              <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-lg text-sm animate-scale-in">
                {error}
              </div>
            )}

            {ok && (
              <div className="bg-success-50 border border-success-200 text-success-700 px-4 py-3 rounded-lg text-sm animate-scale-in flex items-center justify-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
                Thank you! Redirecting to history...
              </div>
            )}

            <button
              type="submit"
              disabled={loading || ok}
              className="btn btn-primary w-full"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Submitting...
                </span>
              ) : (
                "Submit Feedback"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
