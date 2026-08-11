import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../lib/api.js";
import { getUserInfo, setUserInfo, clearToken } from "../lib/auth.js";

const POLL_INTERVAL_MS = 5000; // Poll every 5 seconds to detect when admin enables account

export default function DisabledUser() {
    const navigate = useNavigate();
    const pollRef = useRef(null);
    const [user, setUser] = useState(getUserInfo());

    const handleLogout = async () => {
        if (pollRef.current) clearInterval(pollRef.current);
        await clearToken();
        navigate("/login");
    };

    async function checkStatus() {
        try {
            const data = await apiGet("/api/auth/me");
            if (data?.user) {
                setUserInfo(data.user);
                setUser(data.user);
                if (!data.user.isDisabled) {
                    if (pollRef.current) clearInterval(pollRef.current);
                    if (data.user.isAdmin) {
                        navigate("/admin/dashboard");
                    } else if (data.user.isQA) {
                        navigate("/admin/qa");
                    } else {
                        const s = data.user.accountStatus;
                        if (s === "pending_intro" || s === "rejected") navigate("/intro-recording");
                        else if (s === "pending_approval") navigate("/pending-approval");
                        else navigate("/call");
                    }
                }
            }
        } catch (e) {
            // Silently ignore transient network errors
        }
    }

    useEffect(() => {
        checkStatus();
        pollRef.current = setInterval(checkStatus, POLL_INTERVAL_MS);
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-br from-primary-950 via-primary-900 to-neutral-900 text-white flex flex-col items-center justify-center p-6 relative overflow-hidden select-none">
            {/* Background glowing ambient light */}
            <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary-600/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-primary-500/20 rounded-full blur-3xl pointer-events-none" />

            <div className="w-full max-w-lg bg-neutral-900/80 backdrop-blur-xl border border-primary-500/30 rounded-3xl p-8 md:p-10 shadow-2xl shadow-primary-950/50 text-center animate-fade-in relative z-10">
                {/* Brand Logo / Icon */}
                <div className="flex justify-center mb-6">
                    <div className="w-20 h-20 bg-primary-800/40 border border-primary-500/40 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-900/50">
                        <img src="/logo.png" alt="Voclara Logo" className="w-14 h-14 object-contain" />
                    </div>
                </div>

                {/* Main Heading */}
                <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mb-3">
                    No projects available as of now
                </h1>

                <p className="text-neutral-300 text-sm md:text-base leading-relaxed mb-8">
                    There are currently no active assignments or phrases available for your profile. Please check back later or contact your system administrator.
                </p>

                {/* Animated pulse indicator */}
                <div className="flex items-center justify-center gap-2 mb-8 bg-primary-950/60 border border-primary-800/50 rounded-full py-2.5 px-5 w-fit mx-auto">
                    <span className="w-2.5 h-2.5 rounded-full bg-primary-400 animate-ping" />
                    <span className="text-xs text-primary-200 font-medium">Checking for updates automatically...</span>
                </div>

                {/* Logout Action */}
                <button
                    onClick={handleLogout}
                    className="w-full py-3 px-6 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 hover:text-white font-semibold text-sm transition-all duration-200 shadow-md flex items-center justify-center gap-2"
                >
                    <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3m0 01-3 3H6a3 3m0 01-3-3V7a3 3m0 013-3h4a3 3m0 013 3v1" />
                    </svg>
                    Logout
                </button>
            </div>
        </div>
    );
}
