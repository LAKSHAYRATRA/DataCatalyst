import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../lib/api.js";
import { getUserInfo, setUserInfo, clearToken } from "../lib/auth.js";

const POLL_INTERVAL_MS = 30_000; // 30 seconds

export default function PendingApproval() {
    const navigate = useNavigate();
    const pollRef = useRef(null);
    const [status, setStatus] = useState(getUserInfo()?.accountStatus || "pending_approval");

    const handleLogout = async () => {
        clearInterval(pollRef.current);
        await clearToken();
        navigate("/login");
    };

    async function checkStatus() {
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
                navigate("/call");
            } else if (data.accountStatus === "rejected") {
                clearInterval(pollRef.current);
                navigate("/intro-recording");
            }
        } catch {
            // Silently ignore transient errors
        }
    }

    useEffect(() => {
        // Immediate check, then every 30 s
        checkStatus();
        pollRef.current = setInterval(checkStatus, POLL_INTERVAL_MS);
        return () => clearInterval(pollRef.current);
    }, []);

    return (
        <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
            <div className="w-full max-w-md animate-fade-in text-center">
                {/* Icon */}
                <div className="inline-flex items-center justify-center w-20 h-20 bg-warning-100 rounded-full mb-6">
                    <svg className="w-10 h-10 text-warning-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>

                <h1 className="text-2xl font-bold text-neutral-900 mb-2">Under Review</h1>
                <p className="text-neutral-600 mb-8">
                    Your voice introduction has been submitted and is being reviewed by our team.
                    You'll get access as soon as it's approved — usually within 24 hours.
                </p>

                {/* Animated dots */}
                <div className="flex justify-center gap-2 mb-8">
                    {[0, 1, 2].map((i) => (
                        <span
                            key={i}
                            className="w-3 h-3 rounded-full bg-primary-400 animate-bounce"
                            style={{ animationDelay: `${i * 0.2}s` }}
                        />
                    ))}
                </div>

                <div className="card text-left space-y-3">
                    <p className="text-sm font-semibold text-neutral-700">What happens next?</p>
                    <ol className="text-sm text-neutral-600 space-y-2 list-decimal list-inside">
                        <li>Our admin team listens to your voice intro</li>
                        <li>They verify your profile details</li>
                        <li>You'll get automatic access once approved</li>
                    </ol>
                    <p className="text-xs text-neutral-400 pt-2 border-t border-neutral-100">
                        This page checks for updates every 30 seconds automatically.
                    </p>
                </div>

                <button
                    onClick={checkStatus}
                    className="btn btn-outline mt-6 w-full"
                >
                    Check Status Now
                </button>

                <button
                    onClick={handleLogout}
                    className="btn btn-secondary mt-3 w-full border-error-200 text-error-600 hover:bg-error-50 hover:text-error-700"
                >
                    Logout
                </button>
            </div>
        </div>
    );
}
