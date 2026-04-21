import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Nav from '../components/Nav.jsx';
import { setSystemCheckPassed } from '../lib/auth.js';
import AudioVisualizer from '../components/AudioVisualizer';
import { getMediaStream } from '../utils/audioHelper';
import { analyzeNoiseYAMNet } from '../utils/yamnetAnalysis';
const PHRASE = "A purple pig and a green donkey flew a kite in the middle of the night";


// App States for Mic Flow
const MicState = {
    IDLE: 'idle',
    RECORDING: 'recording',
    PROCESSING: 'processing',
    RESULT: 'result',
};

const SystemCheck = () => {
    const navigate = useNavigate();

    // Steps: 'start', 'internet', 'mic', 'hearing'
    const [currentStep, setCurrentStep] = useState('start');

    // Internet Test State
    const [speed, setSpeed] = useState({ download: null, upload: null });
    const [internetStatus, setInternetStatus] = useState('idle'); // idle, checking, success, failed

    // Mic Test State
    const [micState, setMicState] = useState(MicState.IDLE);
    const [micPermission, setMicPermission] = useState('pending');
    const [micVolume, setMicVolume] = useState(0); // Kept for visualizer if needed, or replace with new component
    const [noiseResult, setNoiseResult] = useState(null);

    // Hearing Test State
    const [targetNumbers, setTargetNumbers] = useState('');
    const [userHearingInput, setUserHearingInput] = useState('');
    const [hearingStatus, setHearingStatus] = useState('idle'); // idle, playing, waiting, success, failed
    const [timeLeft, setTimeLeft] = useState(30);

    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const dataArrayRef = useRef(null);
    const streamRef = useRef(null);
    const utteranceRef = useRef(null);

    // Recording Refs
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    useEffect(() => {
        return () => {
            stopMic();
        };
    }, []);

    // --- STEP 1: INTERNET CHECK (CLOUDFLARE) ---
    const startInternetCheck = async () => {
        setCurrentStep('internet');
        setInternetStatus('checking');
        setSpeed({ download: '...', upload: '...' });

        try {
            // 1. DOWNLOAD TEST (5MB from Cloudflare)
            const downloadUrl = 'https://speed.cloudflare.com/__down?bytes=5000000';
            const startTimeDl = Date.now();
            const response = await fetch(downloadUrl);
            await response.blob();
            const endTimeDl = Date.now();

            const durationDl = (endTimeDl - startTimeDl) / 1000; // seconds
            const bitsLoaded = 5000000 * 8;
            const downloadSpeed = (bitsLoaded / durationDl / 1000000).toFixed(1); // Mbps

            setSpeed(prev => ({ ...prev, download: downloadSpeed }));

            // 2. UPLOAD TEST (Upload to Cloudflare)
            // Note: Cloudflare speed test upload usually works by POSTing to __up
            const uploadSize = 2 * 1024 * 1024; // 2MB
            const dummyData = new Uint8Array(uploadSize);
            const uploadBlob = new Blob([dummyData]);

            const startTimeUl = Date.now();
            await fetch('https://speed.cloudflare.com/__up', {
                method: 'POST',
                body: uploadBlob
            });
            const endTimeUl = Date.now();

            const durationUl = (endTimeUl - startTimeUl) / 1000;
            const bitsUploaded = uploadSize * 8;
            const uploadSpeed = (bitsUploaded / durationUl / 1000000).toFixed(1); // Mbps

            setSpeed({ download: downloadSpeed, upload: uploadSpeed });

            // VALIDATION (Requirement: > 10 Mbps Download)
            if (parseFloat(downloadSpeed) >= 10) {
                setInternetStatus('success');
                setTimeout(() => startMicSetup(), 2000);
            } else {
                setInternetStatus('failed'); // We can allow retry
            }

        } catch (error) {
            console.error("Speed Test Failed:", error);
            // Fallback to success or failed? Let's mark failed but maybe allow proceed if user insists (skip button)
            setInternetStatus('failed');
            setSpeed({ download: 'Error', upload: 'Error' });
        }
    };

    const skipTest = () => {
        setSystemCheckPassed(true);
        navigate('/call');
    };

    // --- STEP 2: MIC CHECK ---
    const startMicSetup = () => {
        setCurrentStep('mic');
        initMic();
    };

    const initMic = async () => {
        try {
            // Just check permission initially
            const stream = await getMediaStream();
            streamRef.current = stream;
            setMicPermission('granted');

            // Stop tracks immediately as we will request again for recording or keep it open?
            // Lingomaster requests stream on "startRecording". 
            // But here we might want to show volume while Idle? 
            // For now let's just ensure we have permission.
            stream.getTracks().forEach(track => track.stop());
        } catch (err) {
            console.error(err);
            setMicPermission('denied');
        }
    };

    const startRecording = async () => {
        try {
            const stream = await getMediaStream(); // Get fresh stream
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                // Combine chunks
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                stream.getTracks().forEach(track => track.stop()); // Stop mic
                processAudio(audioBlob);
            };

            mediaRecorder.start();
            setMicState(MicState.RECORDING);

        } catch (err) {
            console.error("Error accessing microphone:", err);
            alert("Please allow microphone access.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && micState === MicState.RECORDING) {
            mediaRecorderRef.current.stop();
            // State update to PROCESSING happens in onstop handler or here? 
            // Better to set processing here to show UI feedback immediately
            setMicState(MicState.PROCESSING);
        }
    };

    const processAudio = async (blob) => {
        try {
            const result = await analyzeNoiseYAMNet(blob);
            setNoiseResult(result);
            setMicState(MicState.RESULT);
        } catch (err) {
            console.error('Client-side noise analysis failed:', err);
            setMicState(MicState.IDLE);
            alert('Noise check failed. Please try again.');
        }
    };

    const resetMicTest = () => {
        setNoiseResult(null);
        setMicState(MicState.IDLE);
    };

    const continueToHearing = () => {
        startHearingTest();
    };


    const stopMic = () => {
        if (streamRef.current) {
            try {
                streamRef.current.getTracks().forEach(t => t.stop());
            } catch { }
        }
        if (audioContextRef.current) {
            try {
                audioContextRef.current.close();
            } catch { }
        }
    };

    // --- STEP 3: HEARING TEST ---
    const startHearingTest = () => {
        stopMic();
        setCurrentStep('hearing');
        setHearingStatus('idle');

        // Generate random numbers
        const p1 = Math.floor(100 + Math.random() * 900);
        const p2 = Math.floor(100 + Math.random() * 900);
        const code = `${p1} ${p2}`;
        setTargetNumbers(code);
    };

    const playNumbers = () => {
        setHearingStatus('playing');
        window.speechSynthesis.cancel();

        const parts = targetNumbers.split(' ');
        const part1 = parts[0].split('').join(' ');
        const part2 = parts[1].split('').join(' ');

        const speak = (text, callback) => {
            const u = new SpeechSynthesisUtterance(text);
            utteranceRef.current = u;
            u.rate = 0.6;
            u.pitch = 1;
            u.onend = callback || null;
            u.onerror = (e) => {
                console.error("Speech error", e);
                setHearingStatus('failed');
            };
            window.speechSynthesis.speak(u);
        };

        speak(part1, () => {
            setTimeout(() => {
                speak(part2, () => {
                    setHearingStatus('waiting');
                    setTimeLeft(30);
                });
            }, 2000);
        });
    };

    useEffect(() => {
        if (hearingStatus === 'waiting' && timeLeft > 0) {
            const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
            return () => clearInterval(timer);
        } else if (hearingStatus === 'waiting' && timeLeft === 0) {
            setHearingStatus('failed');
            alert("Time's up!");
        }
    }, [hearingStatus, timeLeft]);

    const submitHearingCheck = () => {
        if (userHearingInput.trim() === targetNumbers.replace(/\s/g, '') || userHearingInput.trim() === targetNumbers) {
            setHearingStatus('success');
            setSystemCheckPassed(true);
            setTimeout(() => {
                navigate('/call');
            }, 2000);
        } else {
            alert("Incorrect. Please listen and try again.");
            setUserHearingInput('');
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 relative overflow-hidden">
            {/* Background Blob */}
            <div className="absolute top-0 left-0 w-96 h-96 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>

            <Nav />
            <div className="container mx-auto px-4 py-12 relative z-10">
                <div className="max-w-3xl mx-auto bg-white/70 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 overflow-hidden transition-all duration-300">
                    <div className="p-8 md:p-12 text-center min-h-[500px] flex flex-col justify-center items-center">

                        {currentStep === 'start' && (
                            <div className="animate-fade-in space-y-8">
                                <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600">
                                    System Check
                                </h1>
                                <p className="text-xl text-gray-600 max-w-lg mx-auto">
                                    We'll verify your internet, microphone, and speakers.
                                </p>
                                <button
                                    onClick={startInternetCheck}
                                    className="px-8 py-4 text-lg font-bold text-white bg-gradient-to-r from-purple-600 to-pink-600 rounded-full shadow-lg hover:shadow-purple-500/40 transition-all hover:-translate-y-1"
                                >
                                    Start Test
                                </button>
                                <div className="mt-4">
                                    <button onClick={skipTest} className="text-sm text-gray-400 hover:underline">
                                        Skip (Testing Only)
                                    </button>
                                </div>
                            </div>
                        )}

                        {currentStep === 'internet' && (
                            <div className="animate-fade-in w-full max-w-md space-y-8">
                                <h2 className="text-3xl font-bold text-gray-800">Internet Speed Test</h2>
                                {internetStatus === 'checking' && (
                                    <div className="space-y-4">
                                        <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                                        <p className="text-lg font-medium">Checking connection...</p>
                                        <div className="grid grid-cols-2 gap-4 text-sm bg-white p-4 rounded-xl border">
                                            <div>Download: {speed.download || '...'} Mbps</div>
                                            <div>Upload: {speed.upload || '...'} Mbps</div>
                                        </div>
                                    </div>
                                )}
                                {internetStatus === 'success' && (
                                    <div className="space-y-6">
                                        <div className="text-green-600 font-bold text-xl flex items-center justify-center gap-2">
                                            <i className="fas fa-check-circle"></i> Connection Excellent
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 bg-green-50 rounded-xl">
                                                <div className="text-2xl font-bold text-green-700">{speed.download}</div>
                                                <div className="text-xs text-green-600 uppercase">Download</div>
                                            </div>
                                            <div className="p-4 bg-green-50 rounded-xl">
                                                <div className="text-2xl font-bold text-green-700">{speed.upload}</div>
                                                <div className="text-xs text-green-600 uppercase">Upload</div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {internetStatus === 'failed' && (
                                    <div className="space-y-6">
                                        <p className="text-red-500 font-bold">Connection too slow. Please try again.</p>
                                        <button onClick={startInternetCheck} className="px-6 py-2 bg-red-600 text-white rounded-lg">Retry</button>
                                    </div>
                                )}
                            </div>
                        )}

                        {currentStep === 'mic' && (
                            <div className="animate-fade-in w-full max-w-xl space-y-8">
                                <h2 className="text-3xl font-bold text-gray-800">Microphone Check</h2>

                                {micPermission === 'denied' ? (
                                    <div className="bg-red-50 p-6 rounded-xl text-red-700">
                                        Microphone access denied. Please enable it in browser settings.
                                    </div>
                                ) : (
                                    <div className="space-y-8">
                                        <div className="bg-slate-900 rounded-2xl p-8 shadow-xl border border-slate-700 relative overflow-hidden group">
                                            <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 to-pink-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                                            <p className="text-xs uppercase tracking-widest text-slate-400 mb-3 font-semibold relative z-10">Read this phrase aloud</p>
                                            <h3 className="text-2xl md:text-3xl font-serif italic text-white leading-relaxed tracking-wide relative z-10">
                                                "{PHRASE}"
                                            </h3>
                                            {micState === MicState.IDLE && (
                                                <p className="text-slate-400 text-sm mt-4 relative z-10">
                                                    Press <span className="text-purple-400 font-semibold">Start Recording</span>, speak the phrase, then stop.
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex flex-col items-center justify-center">
                                            {micState === MicState.IDLE && (
                                                <button
                                                    onClick={startRecording}
                                                    className="w-20 h-20 bg-purple-600 hover:bg-purple-700 rounded-full flex items-center justify-center shadow-lg hover:shadow-purple-500/50 transition-all hover:scale-105"
                                                >
                                                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                                                </button>
                                            )}

                                            {micState === MicState.RECORDING && (
                                                <div className="flex flex-col items-center gap-4">
                                                    <AudioVisualizer isRecording={true} />
                                                    <button
                                                        onClick={stopRecording}
                                                        className="w-20 h-20 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center shadow-lg hover:shadow-red-500/50 animate-pulse transition-all"
                                                    >
                                                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"></path></svg>
                                                    </button>
                                                    <p className="text-red-500 font-bold">Tap to Stop</p>
                                                </div>
                                            )}

                                            {micState === MicState.PROCESSING && (
                                                <div className="flex flex-col items-center gap-4">
                                                    <div className="w-16 h-16 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                                                    <p className="text-slate-500 font-medium">Checking background noise...</p>
                                                </div>
                                            )}

                                            {micState === MicState.RESULT && noiseResult && (
                                                <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4">
                                                    {noiseResult.hasNoise ? (
                                                        <div className="p-6 rounded-2xl bg-red-50 border border-red-200">
                                                            <div className="flex items-center gap-3 mb-4">
                                                                <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white">
                                                                    <i className="fas fa-times"></i>
                                                                </div>
                                                                <div>
                                                                    <h3 className="font-bold text-lg text-red-800">Background Noise Detected</h3>
                                                                    <p className="text-sm text-slate-500">{noiseResult.label || 'Your environment is too noisy.'}</p>
                                                                </div>
                                                            </div>
                                                            <div className="bg-red-100 rounded-lg p-3 text-sm text-red-800">
                                                                <p className="font-semibold mb-1">💡 What to try:</p>
                                                                <ul className="list-disc list-inside space-y-1 text-red-700">
                                                                    <li>Move to a quieter room</li>
                                                                    <li>Turn off fans, TVs, or music</li>
                                                                    <li>Close windows facing traffic</li>
                                                                </ul>
                                                            </div>
                                                            <button
                                                                onClick={resetMicTest}
                                                                className="w-full mt-4 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition-colors"
                                                            >
                                                                Try Again
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="p-6 rounded-2xl bg-green-50 border border-green-100">
                                                            <div className="flex items-center gap-3 mb-3">
                                                                <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white">
                                                                    <i className="fas fa-check"></i>
                                                                </div>
                                                                <div>
                                                                    <h3 className="font-bold text-lg text-green-800">
                                                                        {noiseResult.fallback ? 'Check Skipped' : 'Environment Sounds Clear!'}
                                                                    </h3>
                                                                    <p className="text-sm text-slate-500">
                                                                        {noiseResult.fallback ? 'YAMNet unavailable — you may proceed.' : 'No significant background noise detected.'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex gap-3 mt-4">
                                                                <button
                                                                    onClick={resetMicTest}
                                                                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                                                                >
                                                                    Try Again
                                                                </button>
                                                                <button
                                                                    onClick={continueToHearing}
                                                                    className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-lg hover:shadow-purple-500/30 transition-colors"
                                                                >
                                                                    Continue
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {currentStep === 'hearing' && (
                            <div className="animate-fade-in w-full max-w-md space-y-8">
                                <h2 className="text-3xl font-bold text-gray-800">Hearing Test</h2>
                                <p className="text-gray-600">Listen to the numbers and type them below.</p>

                                {hearingStatus === 'idle' && (
                                    <button
                                        onClick={playNumbers}
                                        className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white text-xl font-bold rounded-xl shadow-lg transition-all"
                                    >
                                        Play Numbers
                                    </button>
                                )}

                                {(hearingStatus === 'playing' || hearingStatus === 'waiting' || hearingStatus === 'failed') && (
                                    <div className="space-y-6">
                                        {hearingStatus === 'playing' && <div className="text-purple-600 animate-pulse">Speaking...</div>}

                                        {hearingStatus === 'waiting' && (
                                            <div className="space-y-4">
                                                <input
                                                    type="text"
                                                    placeholder="e.g. 555 666"
                                                    value={userHearingInput}
                                                    onChange={(e) => setUserHearingInput(e.target.value)}
                                                    className="w-full text-center text-3xl font-bold py-4 border-2 border-purple-200 rounded-xl focus:border-purple-600 outline-none"
                                                    autoFocus
                                                />
                                                <div className="flex justify-between items-center">
                                                    <span className={timeLeft < 10 ? 'text-red-500 font-bold' : 'text-gray-500'}>Time: {timeLeft}s</span>
                                                    <button onClick={submitHearingCheck} className="px-6 py-2 bg-purple-600 text-white rounded-lg">Submit</button>
                                                </div>
                                            </div>
                                        )}

                                        {hearingStatus === 'failed' && (
                                            <div className="bg-red-50 p-6 rounded-xl space-y-4">
                                                <p className="text-red-600 font-bold">Failed. Try again.</p>
                                                <button onClick={startHearingTest} className="w-full py-2 bg-red-600 text-white rounded-lg">Retry</button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {hearingStatus === 'success' && (
                                    <div className="space-y-4">
                                        <div className="text-4xl text-green-500">✓</div>
                                        <h2 className="text-3xl font-bold text-green-600">Passed!</h2>
                                        <p>Redirecting...</p>
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                </div>
            </div>

            <style>{`
                .animate-fade-in { animation: fadeIn 0.5s ease-out; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .animate-blob { animation: blob 10s infinite; }
                @keyframes blob {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.1); }
                    100% { transform: scale(1); }
                }
            `}</style>
        </div>
    );
};

export default SystemCheck;
