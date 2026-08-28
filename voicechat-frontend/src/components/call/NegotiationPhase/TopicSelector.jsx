import React, { useState } from 'react';
import { ChevronRight, CheckCircle2, Hand, MessageSquare, Layers, Sparkles } from 'lucide-react';

export default function TopicSelector({
    topics,
    activeClaim,       // { topicId, subtopicId, mine } | null
    selectedTopic,     // set after topicConfirmed (for confirmed banner)
    selectedSubtopic,  // set after topicConfirmed (for confirmed banner)
    topicConfirmed,
    peerUsername,
    onClaim,           // (topicId, subtopicId) => void
    onConfirm,         // () => void — either user presses Proceed
}) {
    const [browsedTopicId, setBrowsedTopicId] = useState(
        topics?.[0]?._id || ""
    );

    // ── Confirmed banner ──────────────────────────────────────────────────────
    if (topicConfirmed) {
        const topic = topics.find((t) => t._id === selectedTopic);
        const subtopic = topic?.subtopics?.find((s) => s._id === selectedSubtopic);
        return (
            <div className="bg-emerald-950/60 border border-emerald-800/60 rounded-3xl p-6 shadow-xl backdrop-blur-xl flex items-center justify-between animate-scale-in">
                <div className="flex-1 min-w-0 mr-3">
                    <div className="text-xs text-emerald-400 font-extrabold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Topic Selected & Confirmed</span>
                    </div>
                    <div className="text-base md:text-lg font-black text-white break-words">
                        {topic?.title} — <span className="text-emerald-300">{subtopic?.title}</span>
                    </div>
                </div>
                <div className="w-10 h-10 bg-emerald-900/60 border border-emerald-700/50 rounded-2xl flex items-center justify-center text-emerald-300 flex-shrink-0 shadow-inner">
                    <CheckCircle2 className="w-6 h-6" />
                </div>
            </div>
        );
    }

    const browsedTopic = topics.find((t) => t._id === browsedTopicId);
    const subtopics = browsedTopic?.subtopics || [];

    const claimTopic = activeClaim
        ? topics.find((t) => t._id === activeClaim.topicId)
        : null;
    const claimSubtopic = claimTopic?.subtopics?.find(
        (s) => s._id === activeClaim?.subtopicId
    );
    const claimerLabel = activeClaim?.mine ? "You" : (peerUsername || "Partner");

    return (
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 shadow-xl backdrop-blur-xl animate-slide-up space-y-5">
            <div className="flex items-center justify-between">
                <h3 className="text-base md:text-lg font-black text-white flex items-center gap-3">
                    <span className="w-7 h-7 rounded-xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 flex items-center justify-center text-xs font-black">
                        1
                    </span>
                    <span>Select Conversation Scenario</span>
                </h3>
            </div>

            {/* ── Status banner: active claim ─────────────────────────────── */}
            {activeClaim ? (
                <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-inner ${
                    activeClaim.mine
                        ? "bg-indigo-950/60 border-indigo-800/60 text-indigo-200"
                        : "bg-amber-950/60 border-amber-800/60 text-amber-200"
                }`}>
                    <span className="text-lg">{activeClaim.mine ? "✋" : "👤"}</span>
                    <div className="flex-1 min-w-0">
                        <span className="font-bold text-xs uppercase tracking-wider block text-neutral-400">
                            {claimerLabel} claimed:
                        </span>
                        <span className="text-sm font-semibold text-white">
                            {claimTopic?.title} › {claimSubtopic?.title}
                        </span>
                    </div>
                </div>
            ) : (
                <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-neutral-800 bg-neutral-950 text-neutral-400 text-xs">
                    <MessageSquare className="w-4 h-4 text-neutral-500" />
                    <span>No topic scenario claimed yet — choose a topic and claim a scenario below.</span>
                </div>
            )}

            {/* ── Topic dropdown ──────────────────────────────────────────── */}
            <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                    Browse Category Topic
                </label>
                <div className="relative">
                    <select
                        value={browsedTopicId}
                        onChange={(e) => setBrowsedTopicId(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-800 focus:border-indigo-500 rounded-2xl px-4 py-3 text-white text-sm font-semibold appearance-none cursor-pointer outline-none transition-colors"
                    >
                        {topics.map((t) => (
                            <option key={t._id} value={t._id} className="bg-neutral-900 text-white">
                                {t.title}
                            </option>
                        ))}
                    </select>
                    <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500">
                        <ChevronRight className="w-4 h-4 rotate-90" />
                    </div>
                </div>
            </div>

            {/* ── Subtopics grid ──────────────────────────────────────────── */}
            {subtopics.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {subtopics.map((sub) => {
                        const isClaimed =
                            activeClaim?.topicId === browsedTopicId &&
                            activeClaim?.subtopicId === sub._id;
                        const claimedByMe = isClaimed && activeClaim.mine;
                        const claimedByPeer = isClaimed && !activeClaim.mine;

                        return (
                            <div
                                key={sub._id}
                                className={`relative rounded-2xl border p-4 flex flex-col justify-between gap-3 transition-all ${
                                    claimedByMe
                                        ? "border-indigo-500 bg-indigo-950/40 shadow-lg shadow-indigo-950/40 ring-1 ring-indigo-500/50"
                                        : claimedByPeer
                                            ? "border-amber-500 bg-amber-950/40 shadow-lg shadow-amber-950/40 ring-1 ring-amber-500/50"
                                            : "border-neutral-800 bg-neutral-950 hover:border-neutral-700"
                                }`}
                            >
                                {/* Claim badge */}
                                {isClaimed && (
                                    <div className={`self-start text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                                        claimedByMe
                                            ? "bg-indigo-600 text-white shadow-sm"
                                            : "bg-amber-600 text-white shadow-sm"
                                    }`}>
                                        {claimedByMe ? "✓ You claimed" : "Partner claimed"}
                                    </div>
                                )}

                                <div>
                                    <div className="font-bold text-sm text-white">{sub.title}</div>
                                    {sub.description && (
                                        <p className="text-xs text-neutral-400 mt-1 leading-relaxed line-clamp-2">
                                            {sub.description}
                                        </p>
                                    )}
                                </div>

                                <button
                                    onClick={() => onClaim(browsedTopicId, sub._id)}
                                    className={`w-full py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                        claimedByMe
                                            ? "bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/30"
                                            : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700 hover:text-white"
                                    }`}
                                >
                                    <span>{claimedByMe ? "✓ Claimed" : "Claim This Scenario"}</span>
                                </button>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p className="text-xs text-neutral-500 text-center py-4">No scenarios available under this topic.</p>
            )}

            {/* ── Proceed button ──────────────────────────────────────────── */}
            <button
                onClick={onConfirm}
                disabled={!activeClaim}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-white text-xs font-bold rounded-2xl transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 cursor-pointer"
            >
                <span>
                    {activeClaim
                        ? `Proceed with "${claimSubtopic?.title || "selected scenario"}"`
                        : "Claim a scenario above to proceed"}
                </span>
                <ChevronRight className="w-4 h-4" />
            </button>
        </div>
    );
}
