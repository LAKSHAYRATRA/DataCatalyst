import React, { useState } from 'react';
import { getUserInfo } from '../../../lib/auth';
import InternetTest from './InternetTest';
import MicrophoneTest from './MicrophoneTest';
import HearingTest from './HearingTest';

export default function SystemCheck({ onComplete, onSkip, noisy = false }) {
    const [currentStep, setCurrentStep] = useState('start');
    const userInfo = getUserInfo();
    const isAdmin = Boolean(userInfo?.isAdmin || userInfo?.role === 'admin');

    const startInternetCheck = () => {
        setCurrentStep('internet');
    };

    const handleInternetSuccess = () => {
        // Skip mic noise test for noisy-data languages
        setCurrentStep(noisy ? 'hearing' : 'mic');
    };

    const handleMicSuccess = () => {
        setCurrentStep('hearing');
    };

    const handleHearingSuccess = () => {
        onComplete();
    };

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 flex flex-col pt-16 md:pt-0 md:pl-64 transition-colors duration-300">
            <div className="max-w-5xl mx-auto px-4 py-4 md:py-8 flex-1 flex items-center justify-center w-full">
                {/* Start Screen */}
                {currentStep === 'start' && (
                    <div className="text-center py-8 md:py-16 animate-slide-up">
                        <div className="w-24 h-24 md:w-32 md:h-32 bg-gradient-primary rounded-full mx-auto mb-6 md:mb-8 flex items-center justify-center shadow-2xl">
                            <svg className="w-12 h-12 md:w-16 md:h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                        </div>
                        <h2 className="text-2xl md:text-4xl font-bold text-neutral-900 dark:text-white mb-4 md:mb-6 px-4">System Check Required</h2>
                        <p className="text-sm md:text-lg text-neutral-600 dark:text-neutral-400 mb-8 md:mb-10 max-w-xl mx-auto px-4">
                            We'll verify your internet connection, microphone, and speakers to ensure the best call quality.
                        </p>
                        <div className="flex flex-col items-center justify-center px-4 gap-4">
                            <button onClick={startInternetCheck} className="btn btn-primary w-full sm:w-auto">
                                Start System Check
                            </button>
                            {isAdmin && (
                                <button 
                                    onClick={onSkip} 
                                    className="px-4 py-2 text-xs font-semibold text-warning-500 hover:text-warning-400 bg-warning-500/10 hover:bg-warning-500/20 border border-warning-500/30 rounded-xl transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                                >
                                    <span>⚡</span>
                                    <span>Skip Test (Admin Only)</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Internet Test */}
                {currentStep === 'internet' && (
                    <div className="w-full flex flex-col items-center">
                        <InternetTest onSuccess={handleInternetSuccess} />
                        {isAdmin && (
                            <button 
                                onClick={onSkip} 
                                className="mt-6 px-4 py-2 text-xs font-semibold text-warning-500 hover:text-warning-400 bg-warning-500/10 hover:bg-warning-500/20 border border-warning-500/30 rounded-xl transition-all flex items-center gap-1.5"
                            >
                                <span>⚡</span>
                                <span>Skip Test (Admin Only)</span>
                            </button>
                        )}
                    </div>
                )}

                {/* Mic Test */}
                {currentStep === 'mic' && (
                    <div className="w-full flex flex-col items-center">
                        <MicrophoneTest onSuccess={handleMicSuccess} />
                        {isAdmin && (
                            <button 
                                onClick={onSkip} 
                                className="mt-6 px-4 py-2 text-xs font-semibold text-warning-500 hover:text-warning-400 bg-warning-500/10 hover:bg-warning-500/20 border border-warning-500/30 rounded-xl transition-all flex items-center gap-1.5"
                            >
                                <span>⚡</span>
                                <span>Skip Test (Admin Only)</span>
                            </button>
                        )}
                    </div>
                )}

                {/* Hearing Test */}
                {currentStep === 'hearing' && (
                    <div className="w-full flex flex-col items-center">
                        <HearingTest onSuccess={handleHearingSuccess} />
                        {isAdmin && (
                            <button 
                                onClick={onSkip} 
                                className="mt-6 px-4 py-2 text-xs font-semibold text-warning-500 hover:text-warning-400 bg-warning-500/10 hover:bg-warning-500/20 border border-warning-500/30 rounded-xl transition-all flex items-center gap-1.5"
                            >
                                <span>⚡</span>
                                <span>Skip Test (Admin Only)</span>
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
