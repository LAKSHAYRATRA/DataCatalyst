import React from 'react';

export default function IdleScreen({ connected, status, onConnect, onFindMatch, isFindingMatch }) {
    return (
        <div className="max-w-3xl mx-auto w-full">
            <div className="text-center py-8 md:py-16 animate-fade-in">
                <div className="w-24 h-24 md:w-32 md:h-32 bg-gradient-primary rounded-full mx-auto mb-6 md:mb-8 flex items-center justify-center shadow-2xl">
                    <svg className="w-12 h-12 md:w-16 md:h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                    </svg>
                </div>
                <h2 className="text-2xl md:text-4xl font-bold text-neutral-900 mb-4 md:mb-6 px-4">Ready to Connect</h2>
                <p className="text-base md:text-lg text-neutral-600 mb-8 md:mb-10 px-4">Start a voice call with a random person</p>

                <div className="flex flex-col items-center space-y-4 px-4">
                    {!connected ? (
                        <button onClick={onConnect} className="btn btn-primary w-full sm:w-auto">
                            <svg className="w-5 h-5 mr-2 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                            </svg>
                            Connect to Server
                        </button>
                    ) : (
                        <button
                            onClick={onFindMatch}
                            disabled={isFindingMatch}
                            className={`btn btn-success w-full sm:w-auto ${isFindingMatch ? 'opacity-80 cursor-wait' : ''}`}
                        >
                            {isFindingMatch ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2 inline-block"></div>
                                    Finding a match...
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5 mr-2 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                    </svg>
                                    Find Random Match
                                </>
                            )}
                        </button>
                    )}

                    <div className="flex items-center space-x-2">
                        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-success-500' : 'bg-error-500'}`}></div>
                        <span className="text-sm text-neutral-600">
                            {connected ? 'Connected to server' : 'Disconnected'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Status Info */}
            {status !== 'idle' && status !== 'connected' && (
                <div className="mt-4 card-hover text-center animate-slide-up mx-4">
                    <p className="text-sm text-neutral-600">Status: <span className="font-semibold text-primary-600">{status}</span></p>
                </div>
            )}
        </div>
    );
}
