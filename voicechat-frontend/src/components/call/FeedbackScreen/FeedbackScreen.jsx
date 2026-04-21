import React, { useMemo, useState } from "react";
import { apiPostJson } from "../../../lib/api.js";
import { clearLastCall, getLastCall } from "../../../lib/lastCall.js";

export default function FeedbackScreen({ onJoinAnotherQueue, onGoHome }) {
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
      setError("Missing call context. Could not identify the last call to submit feedback for.");
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
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="text-center mb-6 animate-fade-in">
        <h1 className="text-2xl font-bold text-neutral-900 mb-2">How was your call?</h1>
        <p className="text-sm text-neutral-600">Your feedback helps us improve</p>
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

        {!ok ? (
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

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full"
            >
              {loading ? "Submitting..." : "Submit Feedback"}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={onGoHome}
              className="px-4 py-2 mt-2 w-full text-sm font-medium text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
            >
              Skip Feedback
            </button>
          </form>
        ) : (
          <div className="text-center py-6 animate-scale-in">
            <div className="w-16 h-16 bg-success-100 text-success-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <h3 className="text-xl font-bold text-neutral-900 mb-2">Feedback Submitted Successfully!</h3>
            <p className="text-neutral-600 mb-8">Thank you for helping us make the community better.</p>
            
            <div className="space-y-3">
              <button
                onClick={onJoinAnotherQueue}
                className="btn btn-primary w-full py-3 text-lg"
              >
                Join Another Queue
              </button>
              <button
                onClick={onGoHome}
                className="px-4 py-2 mt-2 w-full text-sm font-medium text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
