import React from 'react';

export default function RoleSelector({
    myRole,
    peerRole,
    onSelectRole,
    onStartCall,
    onEndConversation
}) {
    return (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 md:p-6 animate-scale-in">
            <h3 className="text-base md:text-lg font-bold text-neutral-900 mb-3 md:mb-4 flex items-center">
                <span className="w-7 h-7 md:w-8 md:h-8 bg-neutral-900 text-white rounded-full flex items-center justify-center mr-2 md:mr-3 text-xs md:text-sm">2</span>
                Assign Roles
            </h3>
            <p className="text-neutral-600 text-xs md:text-sm mb-4 md:mb-6">
                Decide who will ask questions and who will answer.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <button
                    onClick={() => onSelectRole("questioner")}
                    disabled={myRole !== null || peerRole === "questioner"}
                    className={`p-6 rounded-xl border-2 transition-all relative overflow-hidden group ${myRole === "questioner"
                        ? "border-warning-500 bg-warning-50 ring-2 ring-warning-200"
                        : peerRole === "questioner"
                            ? "border-neutral-200 bg-neutral-100 opacity-50 cursor-not-allowed"
                            : "border-neutral-200 hover:border-warning-400 hover:shadow-md"
                        }`}
                >
                    <div className="text-4xl mb-3">❓</div>
                    <div className="text-xl font-bold text-neutral-900 mb-1">Questioner</div>
                    <div className="text-sm text-neutral-500">You will ask the questions</div>
                    {peerRole === "questioner" && (
                        <div className="absolute top-2 right-2 text-xs bg-error-100 text-error-700 px-2 py-1 rounded-full font-bold">
                            Taken
                        </div>
                    )}
                    {myRole === "questioner" && (
                        <div className="absolute top-2 right-2 text-xs bg-warning-100 text-warning-700 px-2 py-1 rounded-full font-bold">
                            Your Role
                        </div>
                    )}
                </button>

                <button
                    onClick={() => onSelectRole("answerer")}
                    disabled={myRole !== null || peerRole === "answerer"}
                    className={`p-6 rounded-xl border-2 transition-all relative overflow-hidden group ${myRole === "answerer"
                        ? "border-success-500 bg-success-50 ring-2 ring-success-200"
                        : peerRole === "answerer"
                            ? "border-neutral-200 bg-neutral-100 opacity-50 cursor-not-allowed"
                            : "border-neutral-200 hover:border-success-400 hover:shadow-md"
                        }`}
                >
                    <div className="text-4xl mb-3">💬</div>
                    <div className="text-xl font-bold text-neutral-900 mb-1">Answerer</div>
                    <div className="text-sm text-neutral-500">You will answer questions</div>
                    {peerRole === "answerer" && (
                        <div className="absolute top-2 right-2 text-xs bg-error-100 text-error-700 px-2 py-1 rounded-full font-bold">
                            Taken
                        </div>
                    )}
                    {myRole === "answerer" && (
                        <div className="absolute top-2 right-2 text-xs bg-success-100 text-success-700 px-2 py-1 rounded-full font-bold">
                            Your Role
                        </div>
                    )}
                </button>
            </div>

            {/* Status Footer */}
            <div className="bg-neutral-900 text-white p-4 rounded-lg text-center shadow-inner">
                {!myRole && !peerRole && (
                    <div className="text-neutral-400">Waiting for role selections...</div>
                )}
                {myRole && !peerRole && (
                    <div className="text-warning-300 font-medium animate-pulse flex items-center justify-center">
                        <svg className="w-5 h-5 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Waiting for peer to select role...
                    </div>
                )}
                {!myRole && peerRole && (
                    <div className="text-warning-300 font-medium animate-pulse">
                        Peer selected <span className="underline decoration-warning-500 underline-offset-4">{peerRole}</span>. Please select your role!
                    </div>
                )}
                {myRole && peerRole && (
                    <div className="flex flex-col items-center space-y-3">
                        <div className="text-success-300 font-medium flex items-center">
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                            </svg>
                            Roles Confirmed! Ready to start the call.
                        </div>
                        <button
                            onClick={onStartCall}
                            className="btn btn-success px-8 py-3 text-lg font-bold shadow-lg hover:shadow-xl transition-all"
                        >
                            <svg className="w-6 h-6 mr-2 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            Start Call
                        </button>
                    </div>
                )}
            </div>

            {/* End Conversation Button */}
            <div className="mt-6 flex justify-center">
                <button
                    onClick={onEndConversation}
                    className="px-6 py-2 rounded-full border border-neutral-200 text-neutral-500 hover:border-error-200 hover:text-error-500 hover:bg-error-50 transition-all flex items-center text-sm font-semibold"
                >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                    End Conversation
                </button>
            </div>
        </div>
    );
}
