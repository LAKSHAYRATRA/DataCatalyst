import React from 'react';
import TopicSelector from './TopicSelector';
import RoleSelector from './RoleSelector';
import CountdownOverlay from '../CountdownOverlay';

export default function NegotiationPhase({
    negotiationTimer,
    peerUsername,
    topics,
    activeClaim,
    selectedTopic,
    selectedSubtopic,
    topicConfirmed,
    myRole,
    peerRole,
    showCountdown,
    countdownValue,
    remoteAudioRef,
    onClaimTopic,
    onConfirmTopic,
    onSelectRole,
    onStartCall,
    onEndConversation,
    showInstructionModal,
    currentInstructions,
    onCloseInstructionModal,
}) {
    return (
        <div className="max-w-3xl mx-auto w-full px-4">
            {/* Countdown Overlay */}
            <CountdownOverlay countdownValue={countdownValue} show={showCountdown} />

            {/* Instruction Modal */}
            {showInstructionModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-fade-in" onClick={onCloseInstructionModal}>
                    <div className="bg-white border border-neutral-200 rounded-3xl max-w-2xl w-full p-6 md:p-10 shadow-2xl animate-scale-in relative overflow-hidden" onClick={e => e.stopPropagation()}>
                        {/* Close button */}
                        <button
                            onClick={onCloseInstructionModal}
                            className="absolute top-5 right-5 p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-full transition-all z-10"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        {/* Decorative background element */}
                        <div className="absolute -top-12 -right-12 w-24 h-24 bg-primary-100 rounded-full blur-3xl opacity-50"></div>
                        <div className="absolute -bottom-12 -left-12 w-24 h-24 bg-amber-100 rounded-full blur-3xl opacity-50"></div>

                        <div className="relative">
                            <div className="flex items-center gap-3 mb-8">
                                <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-neutral-900 leading-tight">Conversation Instructions</h3>
                                    <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mt-0.5">Please read carefully</p>
                                </div>
                            </div>

                            <div className="bg-neutral-50 rounded-2xl p-6 md:p-8 border border-neutral-100 max-h-[60vh] overflow-y-auto custom-scrollbar shadow-inner">
                                <div className="text-neutral-700 text-base md:text-lg leading-relaxed whitespace-pre-wrap font-medium">
                                    {currentInstructions ? currentInstructions : "Please discuss and decide the flow of conversation. Be polite and professional."}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="animate-fade-in mb-4">
                {/* Timer Header */}
                <div className="text-center mb-4 md:mb-6">
                    <div className="text-3xl md:text-4xl font-black text-warning-500 mb-1 font-mono tracking-wider">
                        {Math.floor(negotiationTimer / 60)}:{(negotiationTimer % 60).toString().padStart(2, "0")}
                    </div>
                    <h2 className="text-base md:text-lg font-bold text-neutral-800">Negotiation Phase</h2>
                    <p className="text-xs md:text-sm text-neutral-500 px-4">Select a topic and assign roles before the call starts</p>
                </div>

                {/* Peer Info */}
                <div className="flex items-center justify-center space-x-3 mb-4 md:mb-5 bg-neutral-50 p-3 rounded-xl border border-neutral-100">
                    <div className="w-9 h-9 md:w-10 md:h-10 bg-gradient-primary rounded-full flex items-center justify-center text-white font-bold text-base md:text-lg shadow-md">
                        {peerUsername?.charAt(0)?.toUpperCase() || "P"}
                    </div>
                    <div>
                        <div className="text-xs text-neutral-500">Connected with</div>
                        <div className="text-sm md:text-base font-bold text-neutral-900">{peerUsername || "Peer"}</div>
                    </div>
                </div>

                {/* Step 1: Topic Selection */}
                <TopicSelector
                    topics={topics}
                    activeClaim={activeClaim}
                    selectedTopic={selectedTopic}
                    selectedSubtopic={selectedSubtopic}
                    topicConfirmed={topicConfirmed}
                    peerUsername={peerUsername}
                    onClaim={onClaimTopic}
                    onConfirm={onConfirmTopic}
                />

                {/* Step 2: Role Selection */}
                {topicConfirmed && (
                    <RoleSelector
                        myRole={myRole}
                        peerRole={peerRole}
                        onSelectRole={onSelectRole}
                        onStartCall={onStartCall}
                        onEndConversation={onEndConversation}
                    />
                )}
            </div>

            {/* Audio element needs to be present during negotiation for communication */}
            <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
        </div>
    );
}
