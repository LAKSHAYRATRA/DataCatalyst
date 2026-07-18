import React from 'react';

export default function TopicClaimedOverlay({
    topic,
    claimedByMe,
    peerUsername,
    instructions,
    onBack,
    onProceed,
}) {
    const claimer = claimedByMe ? "You" : "Anonymous User";
    const subtopics = topic?.subtopics || [];

    return (
        <div className="fixed inset-0 z-[200] bg-neutral-900 flex flex-col animate-fade-in">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-700 bg-neutral-800">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-neutral-300 hover:bg-neutral-700 transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                </button>

                <span className={`text-xs font-bold px-3 py-1 rounded-full ${claimedByMe
                    ? 'bg-primary-900/40 text-primary-300'
                    : 'bg-warning-900/40 text-warning-300'
                    }`}>
                    {claimer} claimed this topic
                </span>

                <button
                    onClick={onProceed}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-warning-600 text-white hover:bg-warning-700 transition-colors"
                >
                    Next
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-6 max-w-2xl mx-auto w-full">

                {/* Topic title */}
                <div className="mb-6">
                    <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-1">Selected Topic</p>
                    <h1 className="text-2xl md:text-3xl font-black text-white">{topic?.title}</h1>
                    {topic?.description && (
                        <p className="text-sm text-neutral-400 mt-1">{topic.description}</p>
                    )}
                </div>

                {/* Talking points */}
                {subtopics.length > 0 && (
                    <div className="mb-6">
                        <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-3">Talking Points</p>
                        <div className="bg-neutral-800 border border-neutral-700 rounded-xl px-5 py-4 space-y-3">
                            {subtopics.map((sub, i) => (
                                <div key={sub._id} className="flex items-start gap-3">
                                    <span className="text-sm font-black text-neutral-500 mt-0.5 w-5 flex-shrink-0">{i + 1}.</span>
                                    <div>
                                        <div className="text-sm font-bold text-white">{sub.title}</div>
                                        {sub.description && (
                                            <div className="text-xs text-neutral-400 mt-0.5 leading-relaxed">{sub.description}</div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Instructions */}
                {instructions && (
                    <div className="rounded-xl border border-warning-700 bg-warning-900/20 p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <svg className="w-4 h-4 text-warning-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-xs font-bold uppercase tracking-wide text-warning-400">Instructions</span>
                        </div>
                        <p className="text-sm text-warning-200 leading-relaxed whitespace-pre-wrap">{instructions}</p>
                    </div>
                )}
            </div>

            {/* Mobile footer */}
            <div className="flex gap-3 px-5 py-4 border-t border-neutral-700 bg-neutral-800 md:hidden">
                <button
                    onClick={onBack}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold border border-neutral-600 text-neutral-300 hover:bg-neutral-700 transition-colors"
                >
                    Back
                </button>
                <button
                    onClick={onProceed}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold bg-warning-600 text-white hover:bg-warning-700 transition-colors"
                >
                    Next
                </button>
            </div>
        </div>
    );
}
