import React from 'react';

export default function CountdownOverlay({ countdownValue, show }) {
    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-neutral-900/95 flex items-center justify-center z-50 animate-fade-in px-4">
            <div className="text-center">
                <div className="text-7xl md:text-9xl font-black text-warning-500 mb-4 md:mb-6 animate-scale-in">
                    {countdownValue}
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Get Ready!</h2>
                <p className="text-base md:text-lg text-neutral-300">
                    Call starting in {countdownValue} second{countdownValue !== 1 ? 's' : ''}...
                </p>
            </div>
        </div>
    );
}
