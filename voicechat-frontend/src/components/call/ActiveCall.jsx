import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, PhoneOff, Users, Clock, MessageSquare, Radio, Volume2 } from 'lucide-react';

export default function ActiveCall({
    peerUsername,
    callId,
    role,
    callEndTime,
    remoteAudioRef,
    remoteStream,
    onHangup,
    localStreamRef,
    topics,
    selectedTopic,
    selectedSubtopic
}) {
    const [isMuted, setIsMuted] = useState(false);
    const [isRemoteSpeaking, setIsRemoteSpeaking] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState(20 * 60);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const animationRef = useRef(null);

    // Timer Logic
    useEffect(() => {
        const targetEnd = (callEndTime && !isNaN(new Date(callEndTime).getTime()) && new Date(callEndTime).getTime() > Date.now())
            ? new Date(callEndTime).getTime()
            : Date.now() + 20 * 60 * 1000;

        const updateTimer = () => {
            const now = Date.now();
            const remaining = Math.max(0, Math.ceil((targetEnd - now) / 1000));
            setTimeRemaining(remaining);
        };

        // Update immediately
        updateTimer();

        // Then every second
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [callEndTime]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Toggle mute
    const toggleMute = () => {
        if (localStreamRef?.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
            }
        }
    };

    // Detect remote audio activity
    useEffect(() => {
        if (!remoteAudioRef?.current) return;

        const setupAudioAnalyzer = async () => {
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 256;

                const source = audioContext.createMediaStreamSource(
                    remoteAudioRef.current.srcObject
                );
                source.connect(analyser);

                audioContextRef.current = audioContext;
                analyserRef.current = analyser;

                const checkAudioLevel = () => {
                    const dataArray = new Uint8Array(analyser.frequencyBinCount);
                    analyser.getByteFrequencyData(dataArray);

                    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                    setIsRemoteSpeaking(average > 10); // Threshold for speaking detection

                    animationRef.current = requestAnimationFrame(checkAudioLevel);
                };

                checkAudioLevel();
            } catch (err) {
                console.error('Audio analyzer setup failed:', err);
            }
        };

        if (remoteAudioRef.current.srcObject) {
            setupAudioAnalyzer();
        }

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, [remoteAudioRef, remoteStream]);

    const activeTopicObj = topics?.find(t => t._id === selectedTopic);
    const activeSubtopicObj = activeTopicObj?.subtopics?.find(s => s._id === selectedSubtopic);

    return (
        <div className="max-w-3xl mx-auto w-full px-2 sm:px-4 py-4 animate-fade-in font-sans">
            <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 md:p-10 shadow-2xl backdrop-blur-xl text-center space-y-6 relative overflow-hidden text-white">
                {/* Ambient Glow */}
                <div className="absolute -top-16 -right-16 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

                {/* Status & Timer Header */}
                <div className="space-y-3 relative z-10">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-800/60 text-emerald-400 text-xs font-bold shadow-inner">
                        <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse" />
                        <span>Live 2-Person Call Recording</span>
                    </div>

                    <div className="text-4xl md:text-6xl font-black text-white font-mono tracking-tight">
                        {formatTime(timeRemaining)}
                    </div>
                    <p className="text-xs text-neutral-400 font-medium">Time Remaining in Call</p>
                </div>

                {/* Active Topic & Scenario Card */}
                {(activeTopicObj || activeSubtopicObj) && (
                    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-5 text-left shadow-inner relative z-10 space-y-2">
                        <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                            <MessageSquare className="w-4 h-4" />
                            <span>Conversation Scenario</span>
                        </div>
                        {activeTopicObj && (
                            <h4 className="text-base md:text-lg font-black text-white">
                                {activeTopicObj.title} {activeSubtopicObj && <span className="text-neutral-400 font-normal">› {activeSubtopicObj.title}</span>}
                            </h4>
                        )}
                        {activeSubtopicObj?.description && (
                            <p className="text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap pt-1 border-t border-neutral-800/60">
                                {activeSubtopicObj.description}
                            </p>
                        )}
                    </div>
                )}

                {/* Audio Element */}
                <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

                {/* Call Controls */}
                <div className="flex flex-wrap items-center justify-center gap-4 pt-2 relative z-10">
                    {/* Mute Button */}
                    <button
                        onClick={toggleMute}
                        className={`px-6 py-3.5 rounded-2xl font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                            isMuted 
                                ? 'bg-rose-900/60 hover:bg-rose-800/80 text-rose-200 border border-rose-700/60' 
                                : 'bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700'
                        }`}
                    >
                        {isMuted ? <MicOff className="w-4 h-4 text-rose-400" /> : <Mic className="w-4 h-4 text-emerald-400" />}
                        <span>{isMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
                    </button>

                    {/* End Call Button */}
                    <button
                        onClick={onHangup}
                        className="px-8 py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-900/40 transition-all flex items-center justify-center gap-2 cursor-pointer transform hover:scale-[1.02]"
                    >
                        <PhoneOff className="w-4 h-4" />
                        <span>Hang Up / End Call</span>
                    </button>
                </div>

                {/* Call Info Pills */}
                <div className="grid grid-cols-2 gap-3 pt-6 border-t border-neutral-800/80 relative z-10">
                    <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/60 text-center">
                        <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Call ID</div>
                        <div className="text-xs font-mono text-neutral-300 font-semibold truncate mt-0.5">{callId?.slice(0, 10)}...</div>
                    </div>
                    <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/60 text-center">
                        <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Your Speaking Role</div>
                        <div className="text-xs font-bold text-emerald-400 capitalize mt-0.5">{role || 'Contributor'}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
