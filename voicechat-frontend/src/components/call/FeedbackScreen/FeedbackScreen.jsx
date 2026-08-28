import React, { useMemo, useState } from "react";
import { apiPostJson } from "../../../lib/api.js";
import { clearLastCall, getLastCall } from "../../../lib/lastCall.js";
import { Star, CheckCircle2, MessageSquare, ArrowRight, Home, Sparkles } from "lucide-react";

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
      <div className="space-y-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400">{label}</label>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => onChange(star)}
              className="p-1 focus:outline-none transition-transform hover:scale-125 cursor-pointer text-amber-400"
            >
              <Star
                className={`w-7 h-7 md:w-8 md:h-8 transition-colors ${
                  star <= value ? 'fill-amber-400 text-amber-400' : 'text-neutral-700 fill-transparent'
                }`}
              />
            </button>
          ))}
          <span className="ml-2 text-xs font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-800/40">
            {value}/5
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8 animate-fade-in font-sans text-white">
      <div className="text-center mb-6 space-y-2">
        <div className="inline-flex p-3 rounded-2xl bg-gradient-to-br from-indigo-500 to-primary-600 text-white shadow-xl shadow-indigo-500/25 mb-1">
          <MessageSquare className="w-7 h-7" />
        </div>
        <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">How was your call?</h1>
        <p className="text-xs md:text-sm text-neutral-400">Your feedback helps improve our quality and matching algorithms</p>
      </div>

      <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-xl space-y-6">
        {last?.callId && (
          <div className="bg-neutral-950 rounded-2xl p-4 border border-neutral-800 flex items-center justify-between text-xs">
            <span className="text-neutral-400">Call Reference:</span>
            <span className="font-mono text-indigo-400 font-bold">{last.callId.slice(0, 12)}...</span>
          </div>
        )}

        {!ok ? (
          <form onSubmit={submit} className="space-y-6">
            <StarRating
              value={ratingOverall}
              onChange={setRatingOverall}
              label="Overall Conversation Experience"
            />

            <StarRating
              value={audioQuality}
              onChange={setAudioQuality}
              label="Audio & Connection Quality"
            />

            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400">
                Would you speak with this partner again?
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setWouldTalkAgain(true)}
                  className={`py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    wouldTalkAgain
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40 border border-emerald-500'
                      : 'bg-neutral-950 text-neutral-400 border border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  Yes, Great Partner
                </button>
                <button
                  type="button"
                  onClick={() => setWouldTalkAgain(false)}
                  className={`py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    !wouldTalkAgain
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-950/40 border border-rose-500'
                      : 'bg-neutral-950 text-neutral-400 border border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  No, Prefer Other
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400">
                Additional Comments (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full bg-neutral-950 border border-neutral-800 focus:border-indigo-500 rounded-2xl p-4 text-white text-xs resize-none outline-none transition-colors"
                placeholder="Share any thoughts about your partner or conversational topics..."
              />
            </div>

            {error && (
              <div className="bg-rose-950/60 border border-rose-800/60 text-rose-300 px-4 py-3 rounded-xl text-xs">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-2xl transition-all shadow-lg shadow-indigo-600/25 cursor-pointer"
            >
              {loading ? "Submitting..." : "Submit Feedback"}
            </button>
          </form>
        ) : (
          <div className="text-center py-6 space-y-6 animate-scale-in">
            <div className="w-16 h-16 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-black text-white">Feedback Submitted Successfully!</h3>
              <p className="text-xs text-neutral-400">Thank you for contributing to data quality.</p>
            </div>
            
            <div className="space-y-3 pt-2">
              <button
                onClick={onJoinAnotherQueue}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-2xl transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Join Another Call Queue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={onGoHome}
                className="w-full py-3 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white font-bold text-xs rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Home className="w-4 h-4" />
                <span>Return to Dashboard</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
