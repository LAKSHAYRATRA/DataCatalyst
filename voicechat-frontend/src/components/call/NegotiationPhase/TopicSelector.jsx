import React, { useState } from 'react';

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
    // Local browse state — each user browses independently
    const [browsedTopicId, setBrowsedTopicId] = useState(
        topics?.[0]?._id || ""
    );

    // ── Confirmed banner ──────────────────────────────────────────────────────
    if (topicConfirmed) {
        const topic = topics.find((t) => t._id === selectedTopic);
        const subtopic = topic?.subtopics?.find((s) => s._id === selectedSubtopic);
        return (
            <div className="bg-success-50 border border-success-200 rounded-xl p-4 md:p-6 mb-4 md:mb-6 flex items-center justify-between">
                <div className="flex-1 min-w-0 mr-3">
                    <div className="text-xs md:text-sm text-success-700 font-semibold mb-1">Topic Selected</div>
                    <div className="text-sm md:text-lg font-bold text-success-900 break-words">
                        {topic?.title} — {subtopic?.title}
                    </div>
                </div>
                <div className="w-8 h-8 md:w-10 md:h-10 bg-success-100 rounded-full flex items-center justify-center text-success-600 flex-shrink-0">
                    <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                </div>
            </div>
        );
    }

    const browsedTopic = topics.find((t) => t._id === browsedTopicId);
    const subtopics = browsedTopic?.subtopics || [];

    // Find the full topic/subtopic labels for the active claim
    const claimTopic = activeClaim
        ? topics.find((t) => t._id === activeClaim.topicId)
        : null;
    const claimSubtopic = claimTopic?.subtopics?.find(
        (s) => s._id === activeClaim?.subtopicId
    );
    const claimerLabel = activeClaim?.mine ? "You" : (peerUsername || "Peer");

    return (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 shadow-sm animate-slide-up space-y-4">
            <h3 className="text-base md:text-lg font-bold text-neutral-900 flex items-center">
                <span className="w-7 h-7 md:w-8 md:h-8 bg-neutral-900 text-white rounded-full flex items-center justify-center mr-2 md:mr-3 text-xs md:text-sm">
                    1
                </span>
                Select Conversation Topic
            </h3>

            {/* ── Status banner: active claim ─────────────────────────────── */}
            {activeClaim ? (
                <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${activeClaim.mine
                    ? "bg-primary-50 border-primary-200 text-primary-800"
                    : "bg-amber-50 border-amber-200 text-amber-800"
                    }`}>
                    <span className="text-lg">{activeClaim.mine ? "✋" : "👤"}</span>
                    <div className="flex-1 min-w-0">
                        <span className="font-semibold text-sm">{claimerLabel} claimed: </span>
                        <span className="text-sm">{claimTopic?.title} › {claimSubtopic?.title}</span>
                    </div>
                </div>
            ) : (
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-500 text-sm">
                    <span className="text-lg">💬</span>
                    <span>No topic claimed yet — browse and claim one below</span>
                </div>
            )}

            {/* ── Topic dropdown ──────────────────────────────────────────── */}
            <div className="space-y-1">
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                    Browse Topic
                </label>
                <div className="relative">
                    <select
                        value={browsedTopicId}
                        onChange={(e) => setBrowsedTopicId(e.target.value)}
                        className="input w-full pr-10 appearance-none cursor-pointer text-sm font-medium"
                    >
                        {topics.map((t) => (
                            <option key={t._id} value={t._id}>{t.title}</option>
                        ))}
                    </select>
                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                        <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* ── Subtopics grid ──────────────────────────────────────────── */}
            {subtopics.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {subtopics.map((sub) => {
                        const isClaimed =
                            activeClaim?.topicId === browsedTopicId &&
                            activeClaim?.subtopicId === sub._id;
                        const claimedByMe = isClaimed && activeClaim.mine;
                        const claimedByPeer = isClaimed && !activeClaim.mine;

                        return (
                            <div
                                key={sub._id}
                                className={`relative rounded-xl border p-4 flex flex-col gap-2 transition-all ${claimedByMe
                                    ? "border-primary-400 bg-primary-50 shadow-md ring-2 ring-primary-300"
                                    : claimedByPeer
                                        ? "border-amber-400 bg-amber-50 shadow-md ring-2 ring-amber-300"
                                        : "border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm"
                                    }`}
                            >
                                {/* Claim badge */}
                                {isClaimed && (
                                    <div className={`absolute top-2 right-2 text-xs font-bold px-2 py-0.5 rounded-full ${claimedByMe
                                        ? "bg-primary-500 text-white"
                                        : "bg-amber-500 text-white"
                                        }`}>
                                        {claimedByMe ? "✓ You claimed" : `${peerUsername || "Peer"} claimed`}
                                    </div>
                                )}

                                <div className="font-semibold text-sm text-neutral-900 pr-20">{sub.title}</div>
                                {sub.description && (
                                    <p className="text-xs text-neutral-500 leading-relaxed line-clamp-2">
                                        {sub.description}
                                    </p>
                                )}

                                <button
                                    onClick={() => onClaim(browsedTopicId, sub._id)}
                                    className={`mt-auto text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${claimedByMe
                                        ? "bg-primary-100 text-primary-700 hover:bg-primary-200"
                                        : "bg-neutral-900 text-white hover:bg-neutral-700"
                                        }`}
                                >
                                    {claimedByMe ? "↺ Re-claim" : "Claim"}
                                </button>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p className="text-sm text-neutral-400 text-center py-4">No subtopics for this topic.</p>
            )}

            {/* ── Proceed button ──────────────────────────────────────────── */}
            <button
                onClick={onConfirm}
                disabled={!activeClaim}
                className="w-full px-4 py-3 bg-neutral-900 hover:bg-neutral-700 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
                {activeClaim
                    ? `Proceed with "${claimSubtopic?.title || "selected topic"}"`
                    : "Claim a subtopic to proceed"}
            </button>
        </div>
    );
}
