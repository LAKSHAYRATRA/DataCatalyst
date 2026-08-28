import React from 'react';
import { Radio, Users, Sparkles, Wifi, WifiOff, PhoneCall, Search } from 'lucide-react';

export default function IdleScreen({ connected, status, onConnect, onFindMatch, isFindingMatch }) {
    return (
        <div className="max-w-2xl mx-auto w-full py-6 md:py-12 animate-fade-in font-sans">
            <div className="relative overflow-hidden bg-neutral-900/90 border border-neutral-800 rounded-3xl p-8 md:p-12 shadow-2xl backdrop-blur-xl text-center space-y-8">
                {/* Background Ambient Glow */}
                <div className="absolute -top-16 -right-16 w-48 h-48 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-primary-500/15 rounded-full blur-3xl pointer-events-none" />

                {/* Main Icon Orb */}
                <div className="relative inline-flex items-center justify-center">
                    {isFindingMatch && (
                        <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" />
                    )}
                    <div className="w-24 h-24 md:w-28 md:h-28 rounded-3xl bg-gradient-to-br from-indigo-500 via-primary-600 to-indigo-700 text-white flex items-center justify-center shadow-xl shadow-indigo-500/25 relative z-10 border border-white/20">
                        {isFindingMatch ? (
                            <Search className="w-12 h-12 animate-pulse text-white" />
                        ) : (
                            <PhoneCall className="w-12 h-12 text-white" />
                        )}
                    </div>
                </div>

                {/* Titles */}
                <div className="space-y-2 relative z-10">
                    <h2 className="text-2xl md:text-4xl font-black tracking-tight text-white">
                        {isFindingMatch ? "Searching for Partner..." : "Ready to Connect"}
                    </h2>
                    <p className="text-sm md:text-base text-neutral-400 max-w-md mx-auto leading-relaxed">
                        {isFindingMatch 
                            ? "Matching you with another available contributor in the selected language queue." 
                            : "Join a natural 2-person live dialogue and record conversational speech."}
                    </p>
                </div>

                {/* Primary Action Button */}
                <div className="flex flex-col items-center space-y-5 relative z-10">
                    {!connected ? (
                        <button
                            onClick={onConnect}
                            className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2.5 cursor-pointer transform hover:scale-[1.02]"
                        >
                            <Wifi className="w-5 h-5" />
                            <span>Connect to Call Server</span>
                        </button>
                    ) : (
                        <button
                            onClick={onFindMatch}
                            disabled={isFindingMatch}
                            className={`w-full sm:w-auto px-10 py-4 rounded-2xl font-black text-sm shadow-xl transition-all flex items-center justify-center gap-3 cursor-pointer transform hover:scale-[1.02] ${
                                isFindingMatch
                                    ? 'bg-neutral-800 text-neutral-400 border border-neutral-700 cursor-wait'
                                    : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-emerald-900/30'
                            }`}
                        >
                            {isFindingMatch ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                    <span>Finding a Match in Queue...</span>
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-5 h-5 text-emerald-200" />
                                    <span>Find Live Match</span>
                                </>
                            )}
                        </button>
                    )}

                    {/* Server Connection Status Badge */}
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-neutral-950/80 border border-neutral-800 text-xs font-semibold text-neutral-300">
                        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                        <span>{connected ? 'Connected to Call Server' : 'Disconnected from Server'}</span>
                    </div>
                </div>

                {/* Status Indicator Pill if transitioning */}
                {status !== 'idle' && status !== 'connected' && (
                    <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 text-xs text-neutral-400 inline-block">
                        Status: <span className="font-bold text-indigo-400 capitalize">{status}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
