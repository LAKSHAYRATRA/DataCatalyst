import React from 'react';
import { HelpCircle, MessageSquare, Play, X, Check, Loader2 } from 'lucide-react';

export default function RoleSelector({
    myRole,
    peerRole,
    onSelectRole,
    onStartCall,
    onEndConversation
}) {
    return (
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 md:p-8 shadow-xl backdrop-blur-xl animate-scale-in text-white space-y-6">
            <div>
                <h3 className="text-base md:text-lg font-black text-white flex items-center gap-3">
                    <span className="w-7 h-7 rounded-xl bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 flex items-center justify-center text-xs font-black">
                        2
                    </span>
                    <span>Assign Speaking Roles</span>
                </h3>
                <p className="text-neutral-400 text-xs mt-1">
                    Select who will lead the questions and who will provide the answers.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Questioner Button */}
                <button
                    onClick={() => onSelectRole("questioner")}
                    disabled={myRole !== null || peerRole === "questioner"}
                    className={`p-6 rounded-2xl border-2 transition-all relative overflow-hidden flex flex-col justify-between text-left cursor-pointer group ${
                        myRole === "questioner"
                            ? "border-indigo-500 bg-indigo-950/50 ring-2 ring-indigo-500/40 shadow-xl shadow-indigo-950/50"
                            : peerRole === "questioner"
                                ? "border-neutral-800 bg-neutral-950 opacity-40 cursor-not-allowed"
                                : "border-neutral-800 bg-neutral-950 hover:border-indigo-500/70 hover:shadow-lg"
                    }`}
                >
                    <div>
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center mb-3">
                            <HelpCircle className="w-5 h-5" />
                        </div>
                        <div className="text-lg font-black text-white mb-1">Questioner</div>
                        <div className="text-xs text-neutral-400">You will ask conversational questions</div>
                    </div>

                    {peerRole === "questioner" && (
                        <div className="absolute top-3 right-3 text-[10px] bg-rose-950 text-rose-300 border border-rose-800/60 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                            Taken
                        </div>
                    )}
                    {myRole === "questioner" && (
                        <div className="absolute top-3 right-3 text-[10px] bg-indigo-600 text-white px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-sm">
                            Your Role
                        </div>
                    )}
                </button>

                {/* Answerer Button */}
                <button
                    onClick={() => onSelectRole("answerer")}
                    disabled={myRole !== null || peerRole === "answerer"}
                    className={`p-6 rounded-2xl border-2 transition-all relative overflow-hidden flex flex-col justify-between text-left cursor-pointer group ${
                        myRole === "answerer"
                            ? "border-emerald-500 bg-emerald-950/50 ring-2 ring-emerald-500/40 shadow-xl shadow-emerald-950/50"
                            : peerRole === "answerer"
                                ? "border-neutral-800 bg-neutral-950 opacity-40 cursor-not-allowed"
                                : "border-neutral-800 bg-neutral-950 hover:border-emerald-500/70 hover:shadow-lg"
                    }`}
                >
                    <div>
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center justify-center mb-3">
                            <MessageSquare className="w-5 h-5" />
                        </div>
                        <div className="text-lg font-black text-white mb-1">Answerer</div>
                        <div className="text-xs text-neutral-400">You will respond and explain</div>
                    </div>

                    {peerRole === "answerer" && (
                        <div className="absolute top-3 right-3 text-[10px] bg-rose-950 text-rose-300 border border-rose-800/60 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                            Taken
                        </div>
                    )}
                    {myRole === "answerer" && (
                        <div className="absolute top-3 right-3 text-[10px] bg-emerald-600 text-white px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-sm">
                            Your Role
                        </div>
                    )}
                </button>
            </div>

            {/* Status Footer */}
            <div className="bg-neutral-950 border border-neutral-800 p-5 rounded-2xl text-center shadow-inner space-y-3">
                {!myRole && !peerRole && (
                    <div className="text-neutral-400 text-xs font-semibold">Waiting for role selections...</div>
                )}
                {myRole && !peerRole && (
                    <div className="text-amber-300 text-xs font-semibold animate-pulse flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Waiting for partner to select their speaking role...</span>
                    </div>
                )}
                {!myRole && peerRole && (
                    <div className="text-indigo-300 text-xs font-semibold animate-pulse">
                        Partner selected <span className="font-bold text-white capitalize">{peerRole}</span>. Please click the other role to confirm!
                    </div>
                )}
                {myRole && peerRole && (
                    <div className="flex flex-col items-center space-y-3">
                        <div className="text-emerald-400 text-xs font-extrabold flex items-center gap-1.5 uppercase tracking-wider">
                            <Check className="w-4 h-4" />
                            <span>Roles Confirmed! Ready to begin conversation</span>
                        </div>
                        <button
                            onClick={onStartCall}
                            className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white font-black text-sm shadow-xl shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 cursor-pointer transform hover:scale-[1.02]"
                        >
                            <Play className="w-4 h-4 fill-current" />
                            <span>Start 20-Min Call</span>
                        </button>
                    </div>
                )}
            </div>

            {/* End Conversation Button */}
            <div className="flex justify-center">
                <button
                    onClick={onEndConversation}
                    className="px-5 py-2 rounded-2xl border border-rose-900/40 bg-rose-950/20 text-rose-400 hover:bg-rose-900/40 hover:text-white transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel / End Conversation</span>
                </button>
            </div>
        </div>
    );
}
