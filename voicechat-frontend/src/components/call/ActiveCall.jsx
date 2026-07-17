import React, { useState, useEffect, useRef } from 'react';

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
        if (!callEndTime) return;

        const updateTimer = () => {
            const now = Date.now();
            const remaining = Math.max(0, Math.ceil((callEndTime - now) / 1000));
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

    return (
        <div className="max-w-3xl mx-auto w-full px-4">
            <div className="animate-fade-in">
                {/* Call Timer (Now at the top) */}
                <div className="text-center mb-6 md:mb-8 pt-4">
                    <div className="text-3xl md:text-5xl font-bold text-primary-600 mb-2 font-mono tabular-nums">
                        {formatTime(timeRemaining)}
                    </div>
                    <p className="text-xs md:text-sm text-neutral-500 mb-4">Time Remaining</p>
                    <div className="inline-flex items-center space-x-2 px-3 md:px-4 py-1.5 md:py-2 bg-success-50 rounded-full">
                        <div className="w-2 h-2 bg-success-500 rounded-full animate-pulse"></div>
                        <span className="text-xs md:text-sm font-medium text-success-700">Call in Progress with Anonymous Partner</span>
                    </div>
                </div>

                {/* Topic Info (Now below timer) */}
                {(selectedTopic || selectedSubtopic) && (
                    <div className="mb-6 md:mb-8">
                        <div className="bg-neutral-50 rounded-xl p-4 md:p-6 border border-neutral-200 shadow-sm">
                            <h4 className="text-sm font-semibold text-neutral-700 mb-3 uppercase tracking-wider text-center">Conversation Topic</h4>
                            {selectedTopic && topics?.find(t => t._id === selectedTopic) && (
                                <p className="text-lg md:text-xl font-bold text-neutral-900 mb-2 text-center">
                                    {topics.find(t => t._id === selectedTopic)?.title}
                                </p>
                            )}
                            {selectedSubtopic && topics?.find(t => t._id === selectedTopic)?.subtopics?.find(s => s._id === selectedSubtopic) && (
                                <div className="text-center">
                                    <p className="text-base md:text-lg text-neutral-800 font-medium mb-3">
                                        {topics.find(t => t._id === selectedTopic)?.subtopics?.find(s => s._id === selectedSubtopic)?.title}
                                    </p>
                                    {topics.find(t => t._id === selectedTopic)?.subtopics?.find(s => s._id === selectedSubtopic)?.description && (
                                        <div className="mt-2 text-sm text-neutral-600 italic whitespace-pre-wrap text-left bg-white p-4 rounded-lg border border-neutral-100 shadow-sm">
                                            {topics.find(t => t._id === selectedTopic)?.subtopics?.find(s => s._id === selectedSubtopic)?.description}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Audio Element */}
                <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

                {/* Call Controls */}
                <div className="flex justify-center gap-3 md:gap-4 mb-4 md:mb-6">
                    {/* Mute Button */}
                    <button
                        onClick={toggleMute}
                        className={`btn ${isMuted ? 'btn-error' : 'btn-secondary'} w-full sm:w-auto`}
                    >
                        <svg className="w-5 h-5 mr-2 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {isMuted ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"></path>
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path>
                            )}
                        </svg>
                        {isMuted ? 'Unmute' : 'Mute'}
                    </button>

                    {/* End Call Button */}
                    <button onClick={onHangup} className="btn btn-error w-full sm:w-auto">
                        <svg className="w-5 h-5 mr-2 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"></path>
                        </svg>
                        End Call
                    </button>
                </div>

                {/* Call Info */}
                <div className="grid grid-cols-2 gap-3 md:gap-4 pt-4 md:pt-6 border-t border-neutral-200">
                    <div className="text-center">
                        <p className="text-xs text-neutral-500 mb-1">Call ID</p>
                        <p className="text-xs md:text-sm font-mono text-neutral-700 break-all">{callId?.slice(0, 8)}...</p>
                    </div>
                    <div className="text-center">
                        <p className="text-xs text-neutral-500 mb-1">Role</p>
                        <p className="text-xs md:text-sm font-semibold text-neutral-700 capitalize">{role || '-'}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
