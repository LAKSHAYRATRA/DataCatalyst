import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPostJson } from "../lib/api.js";

export default function AdminLogin() {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function onSubmit(e) {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const res = await apiPostJson("/api/auth/login", { email, password });

            // Check if user is admin
            if (!res.user?.isAdmin) {
                setError("Access Denied: Admin privileges required");
                setLoading(false);
                return;
            }

            // Store user info (token is in HTTP-only cookie)
            localStorage.setItem("vc_user_info", JSON.stringify(res.user));

            // Redirect to admin dashboard
            navigate("/admin/dashboard");
        } catch (e2) {
            setError(e2.message || "Invalid credentials");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md animate-fade-in">
                {/* Admin Badge */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-warning-500 to-warning-600 rounded-2xl mb-4 shadow-2xl">
                        <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">Admin Panel</h1>
                    <p className="text-neutral-400">Sign in to access admin features</p>
                </div>

                {/* Login Card */}
                <div className="bg-neutral-800 rounded-2xl shadow-2xl border border-neutral-700 p-8 animate-slide-up">
                    <form onSubmit={onSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-neutral-300 mb-2">
                                Email Address
                            </label>
                            <input
                                id="email"
                                type="email"
                                className="w-full px-4 py-3 rounded-lg border border-neutral-600 bg-neutral-700 text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-warning-500 focus:border-transparent transition-all"
                                placeholder="admin@voclara.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                                required
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-neutral-300 mb-2">
                                Password
                            </label>
                            <input
                                id="password"
                                type="password"
                                className="w-full px-4 py-3 rounded-lg border border-neutral-600 bg-neutral-700 text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-warning-500 focus:border-transparent transition-all"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                                required
                            />
                        </div>

                        {error && (
                            <div className="bg-error-900/50 border border-error-700 text-error-300 px-4 py-3 rounded-lg text-sm animate-scale-in">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full px-6 py-3 bg-gradient-to-r from-warning-500 to-warning-600 text-white font-semibold rounded-lg shadow-lg hover:shadow-warning-500/50 transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center">
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Signing in...
                                </span>
                            ) : (
                                "Sign In as Admin"
                            )}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <a href="/login" className="text-sm text-neutral-400 hover:text-warning-500 transition-colors">
                            ← Back to User Login
                        </a>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-8 text-center text-sm text-neutral-500">
                    <p>Admin Access Only • Unauthorized access is prohibited</p>
                </div>
            </div>
        </div>
    );
}
