import React, { useState } from 'react';
import InternetTest from './InternetTest';
import MicrophoneTest from './MicrophoneTest';
import HearingTest from './HearingTest';

export default function SystemCheck({ onComplete, onSkip }) {
    const [currentStep, setCurrentStep] = useState('start');

    const startInternetCheck = () => {
        setCurrentStep('internet');
    };

    const handleInternetSuccess = () => {
        setCurrentStep('mic');
    };

    const handleMicSuccess = () => {
        setCurrentStep('hearing');
    };

    const handleHearingSuccess = () => {
        onComplete();
    };

    return (
        <div className="min-h-screen bg-gradient-subtle flex flex-col pt-16 md:pt-0 md:pl-64">
            <div className="max-w-5xl mx-auto px-4 py-4 md:py-8 flex-1 flex items-center justify-center w-full">
                {/* Start Screen */}
                {currentStep === 'start' && (
                    <div className="text-center py-8 md:py-16 animate-slide-up">
                        <div className="w-24 h-24 md:w-32 md:h-32 bg-gradient-primary rounded-full mx-auto mb-6 md:mb-8 flex items-center justify-center shadow-2xl">
                            <svg className="w-12 h-12 md:w-16 md:h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                        </div>
                        <h2 className="text-2xl md:text-4xl font-bold text-neutral-900 mb-4 md:mb-6 px-4">System Check Required</h2>
                        <p className="text-sm md:text-lg text-neutral-600 mb-8 md:mb-10 max-w-xl mx-auto px-4">
                            We'll verify your internet connection, microphone, and speakers to ensure the best call quality.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center px-4">
                            <button onClick={startInternetCheck} className="btn btn-primary w-full sm:w-auto">
                                Start System Check
                            </button>
                            <button onClick={onSkip} className="btn btn-secondary text-sm w-full sm:w-auto">
                                Skip (Testing Only)
                            </button>
                        </div>
                    </div>
                )}

                {/* Internet Test */}
                {currentStep === 'internet' && (
                    <InternetTest onSuccess={handleInternetSuccess} />
                )}

                {/* Mic Test */}
                {currentStep === 'mic' && (
                    <MicrophoneTest onSuccess={handleMicSuccess} />
                )}

                {/* Hearing Test */}
                {currentStep === 'hearing' && (
                    <HearingTest onSuccess={handleHearingSuccess} />
                )}
            </div>
        </div>
    );
}
