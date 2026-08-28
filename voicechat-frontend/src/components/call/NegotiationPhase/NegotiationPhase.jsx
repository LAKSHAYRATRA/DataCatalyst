import React from 'react';
import TopicSelector from './TopicSelector';
import RoleSelector from './RoleSelector';
import CountdownOverlay from '../CountdownOverlay';
import { Clock, Users, BookOpen, AlertCircle, X } from 'lucide-react';

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
        <div className="max-w-3xl mx-auto w-full px-2 sm:px-4 py-4 animate-fade-in font-sans">
            {/* Countdown Overlay */}
            <CountdownOverlay countdownValue={countdownValue} show={showCountdown} />

            {/* Instruction Modal */}
            {showInstructionModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-fade-in" onClick={onCloseInstructionModal}>
                    <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-2xl w-full p-6 md:p-10 shadow-2xl animate-scale-in relative overflow-hidden" onClick={e => e.stopPropagation()}>
                        {/* Close button */}
                        <button
                            onClick={onCloseInstructionModal}
                            className="absolute top-5 right-5 p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-full transition-all z-10 cursor-pointer"
                        >
                            <X className="w-6 h-6" />
                        </button>

                        <div className="relative space-y-6">
                            <div className="flex items-center gap-3.5">
                                <div className="w-12 h-12 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded-2xl flex items-center justify-center flex-shrink-0">
                                    <BookOpen className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-white leading-tight">Conversation Scenario Instructions</h3>
                                    <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mt-0.5">Please read carefully</p>
                                </div>
                            </div>

                            <div className="bg-neutral-950 rounded-2xl p-6 md:p-8 border border-neutral-800 max-h-[60vh] overflow-y-auto custom-scrollbar shadow-inner">
                                <div className="text-neutral-300 text-sm md:text-base leading-relaxed whitespace-pre-wrap font-medium">
                                    {currentInstructions ? currentInstructions : "Please discuss and decide the flow of conversation. Be natural, polite, and professional."}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-6">
                {/* Timer Header & Partner Bar */}
                <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 shadow-xl backdrop-blur-xl text-center space-y-4 relative overflow-hidden">
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
                    
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold">
                        <Clock className="w-4 h-4" />
                        <span className="font-mono text-base font-black">
                            {Math.floor(negotiationTimer / 60)}:{(negotiationTimer % 60).toString().padStart(2, "0")}
                        </span>
                        <span>Remaining</span>
                    </div>

                    <div>
                        <h2 className="text-2xl font-black text-white tracking-tight">Negotiation Phase</h2>
                        <p className="text-xs text-neutral-400 mt-1 max-w-md mx-auto">
                            Claim a conversation topic with your partner and confirm your speaking roles before the call starts.
                        </p>
                    </div>

                    {/* Partner Pill */}
                    <div className="inline-flex items-center gap-3 px-4 py-2 rounded-2xl bg-neutral-950 border border-neutral-800 shadow-inner">
                        <div className="w-7 h-7 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 font-black text-xs">
                            <Users className="w-4 h-4" />
                        </div>
                        <span className="text-xs text-neutral-400 font-medium">Connected with:</span>
                        <span className="text-xs font-bold text-white">{peerUsername || "Partner"}</span>
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
