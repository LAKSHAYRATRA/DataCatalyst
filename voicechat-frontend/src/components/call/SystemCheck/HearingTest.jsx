import React, { useState, useEffect, useRef } from 'react';

export default function HearingTest({ onSuccess }) {
    const [targetNumbers, setTargetNumbers] = useState('');
    const [userHearingInput, setUserHearingInput] = useState('');
    const [hearingStatus, setHearingStatus] = useState('idle');
    const [timeLeft, setTimeLeft] = useState(15);

    const utteranceRef = useRef(null);

    useEffect(() => {
        // Generate 2 double-digit numbers
        const p1 = Math.floor(10 + Math.random() * 90);
        const p2 = Math.floor(10 + Math.random() * 90);
        const code = `${p1} ${p2}`;
        setTargetNumbers(code);
    }, []);

    useEffect(() => {
        if (hearingStatus === 'waiting' && timeLeft > 0) {
            const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
            return () => clearInterval(timer);
        } else if (hearingStatus === 'waiting' && timeLeft === 0) {
            setHearingStatus('failed');
            alert("Time's up!");
        }
    }, [hearingStatus, timeLeft]);

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
                    setTimeLeft(15);
                });
            }, 1000);
        });
    };

    const submitHearingCheck = () => {
        if (userHearingInput.trim() === targetNumbers.replace(/\s/g, '') || userHearingInput.trim() === targetNumbers) {
            setHearingStatus('success');
            onSuccess();
        } else {
            setHearingStatus('incorrect');
            setUserHearingInput('');
        }
    };

    const retry = () => {
        setHearingStatus('idle');
        setUserHearingInput('');
        const p1 = Math.floor(10 + Math.random() * 90);
        const p2 = Math.floor(10 + Math.random() * 90);
        const code = `${p1} ${p2}`;
        setTargetNumbers(code);
    };

    return (
        <div className="py-12 animate-slide-up w-full">
            <div className="text-center mb-10">
                <h3 className="text-3xl font-bold text-neutral-900 mb-3">Hearing Test</h3>
                <p className="text-lg text-neutral-600">Listen carefully and type the numbers you hear</p>
            </div>

            {hearingStatus === 'idle' && (
                <div className="text-center">
                    <button onClick={playNumbers} className="btn btn-primary">
                        <svg className="w-5 h-5 mr-2 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path>
                        </svg>
                        Play Numbers
                    </button>
                </div>
            )}

            {hearingStatus === 'playing' && (
                <div className="text-center">
                    <div className="w-16 h-16 bg-primary-100 rounded-full mx-auto mb-4 flex items-center justify-center animate-pulse">
                        <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path>
                        </svg>
                    </div>
                    <p className="text-primary-600 font-semibold">Speaking...</p>
                </div>
            )}

            {hearingStatus === 'waiting' && (
                <div className="max-w-md mx-auto space-y-4">
                    <input
                        type="text"
                        placeholder="e.g. 555 666"
                        value={userHearingInput}
                        onChange={(e) => setUserHearingInput(e.target.value)}
                        className="input text-center text-2xl font-bold"
                        autoFocus
                    />
                    <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${timeLeft < 10 ? 'text-error-600' : 'text-neutral-600'}`}>
                            Time remaining: {timeLeft}s
                        </span>
                        <button onClick={submitHearingCheck} className="btn btn-primary">
                            Submit
                        </button>
                    </div>
                </div>
            )}

            {hearingStatus === 'failed' && (
                <div className="text-center">
                    <div className="w-16 h-16 bg-error-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                        <svg className="w-8 h-8 text-error-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </div>
                    <h4 className="text-xl font-semibold text-error-700 mb-4">Time's Up!</h4>
                    <button onClick={retry} className="btn btn-error">Try Again</button>
                </div>
            )}

            {hearingStatus === 'incorrect' && (
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 bg-error-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                        <svg className="w-8 h-8 text-error-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </div>
                    <h4 className="text-xl font-semibold text-error-700 mb-2">Incorrect!</h4>
                    <p className="text-neutral-600 mb-4">Please listen and try again</p>
                    <button onClick={retry} className="btn btn-primary">
                        <svg className="w-5 h-5 mr-2 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path>
                        </svg>
                        Play Numbers
                    </button>
                </div>
            )}

            {hearingStatus === 'success' && (
                <div className="text-center animate-scale-in">
                    <div className="w-16 h-16 bg-success-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                        <svg className="w-8 h-8 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </div>
                    <h4 className="text-2xl font-bold text-success-700 mb-2">All Tests Passed!</h4>
                    <p className="text-neutral-600">Loading call interface...</p>
                </div>
            )}
        </div>
    );
}
