import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../lib/api.js";
import { getUserInfo, setUserInfo, clearToken } from "../lib/auth.js";
import { Clock, CheckCircle2, ShieldCheck, RefreshCw, LogOut } from "lucide-react";

const POLL_INTERVAL_MS = 30_000; // 30 seconds

export default function PendingApproval() {
    const navigate = useNavigate();
    const pollRef = useRef(null);
    const [status, setStatus] = useState(getUserInfo()?.accountStatus || "pending_approval");
    const [checking, setChecking] = useState(false);
    const userInfo = getUserInfo();

    const handleLogout = async () => {
        clearInterval(pollRef.current);
        await clearToken();
        navigate("/login", { replace: true });
    };

    async function checkStatus() {
        setChecking(true);
        try {
            const data = await apiGet("/api/user/status");
            setStatus(data.accountStatus);

            // Update local user info
            const current = getUserInfo();
            if (current) {
                setUserInfo({
                    ...current,
                    accountStatus: data.accountStatus,
                    rejectionReason: data.rejectionReason || null,
                });
            }

            if (data.accountStatus === "approved") {
                clearInterval(pollRef.current);
                navigate("/call", { replace: true });
            } else if (data.accountStatus === "rejected") {
                clearInterval(pollRef.current);
                navigate("/intro-recording", { replace: true });
            }
        } catch {
            // Silently ignore transient errors
        } finally {
            setChecking(false);
        }
    }

    useEffect(() => {
        checkStatus();
        pollRef.current = setInterval(checkStatus, POLL_INTERVAL_MS);
        return () => clearInterval(pollRef.current);
    }, []);

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-primary-500 selection:text-white relative overflow-hidden">
            {/* Background Ambient Glows */}
            <div className="absolute top-0 right-1/4 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-1/4 -left-32 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

            {/* Top Navigation Bar */}
            <header className="bg-neutral-900/80 border-b border-neutral-800 sticky top-0 z-30 backdrop-blur-md">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center p-1 shadow-md shadow-black/40">
                            <img src="/logo.png" alt="Voclara Logo" className="w-7 h-7 object-contain" />
                        </div>
                        <div>
                            <span className="font-extrabold text-white text-base tracking-tight">Voclara</span>
                            <span className="text-[11px] text-neutral-400 block -mt-0.5">Verification Pending</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {userInfo?.email && (
                            <span className="text-xs text-neutral-400 hidden sm:inline font-mono">{userInfo.email}</span>
                        )}
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold transition-colors"
                        >
                            <LogOut className="w-3.5 h-3.5" />
                            Sign Out
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Container */}
            <main className="flex-1 max-w-lg mx-auto px-4 py-8 w-full relative z-10 flex flex-col justify-center">
                <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl animate-slide-up text-center space-y-6">

                    {/* Agency partner badge if contributor belongs to a vendor */}
                    {userInfo?.vendorCode && (
                        <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl flex items-center justify-between text-xs text-purple-200">
                            <span className="font-medium">
                                Agency Partner: <strong className="font-mono font-bold text-purple-300">{userInfo.vendorCode}</strong>
                            </span>
                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-500/30">
                                Direct Contributor
                            </span>
                        </div>
                    )}

                    {/* Glowing Clock Icon */}
                    <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10">
                        <Clock className="w-8 h-8 text-amber-400" />
                    </div>

                    <div className="space-y-2">
                        <h1 className="text-2xl font-bold text-white tracking-tight">Under Verification</h1>
                        <p className="text-neutral-400 text-xs sm:text-sm leading-relaxed max-w-sm mx-auto">
                            Your voice sample and profile details have been submitted. Our verification team reviews submissions within 24 hours.
                        </p>
                    </div>

                    {/* Status Pill */}
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-300 text-xs font-medium">
                        <span className="w-2 h-2 rounded-full bg-primary-400 animate-ping" />
                        <span>Awaiting Admin Review</span>
                    </div>

                    {/* Steps Card */}
                    <div className="text-left rounded-2xl bg-neutral-950/80 border border-neutral-800/80 p-5 space-y-3">
                        <p className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-primary-400" />
                            What happens next?
                        </p>
                        <ol className="text-xs text-neutral-400 space-y-2.5 list-decimal list-inside leading-relaxed">
                            <li>Our team listens to your voice sample for audio clarity and microphone suitability.</li>
                            <li>Your regional language and profile details are verified.</li>
                            <li>Access to recording assignments is granted immediately upon approval.</li>
                        </ol>
                        <p className="text-[11px] text-neutral-500 pt-2 border-t border-neutral-800/80">
                            This page automatically re-checks status every 30 seconds.
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="space-y-3 pt-2">
                        <button
                            onClick={checkStatus}
                            disabled={checking}
                            className="w-full py-3 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
                        >
                            <RefreshCw className={`w-4 h-4 ${checking ? "animate-spin text-primary-400" : ""}`} />
                            {checking ? "Checking Status…" : "Check Status Now"}
                        </button>
                    </div>
                </div>

                <div className="mt-6 text-center text-xs text-neutral-500">
                    Need help? Contact support or your partner agency coordinator.
                </div>
            </main>
        </div>
    );
}
