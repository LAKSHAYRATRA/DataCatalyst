import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiGet } from "../lib/api.js";
import AdminNav from "../components/AdminNav.jsx";
import { getUserInfo } from "../lib/auth.js";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

export default function AdminDashboard() {
    const userInfo = getUserInfo();
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [downloadingMetadata, setDownloadingMetadata] = useState(false);

    useEffect(() => {
        loadStats();
    }, []);

    async function loadStats() {
        try {
            const data = await apiGet("/api/admin/stats");
            setStats(data);
        } catch (e) {
            setError(e.message);
            if (e.message.includes("Forbidden") || e.message.includes("Unauthorized")) {
                navigate("/login");
            }
        } finally {
            setLoading(false);
        }
    }

    async function downloadMetadata() {
        try {
            setDownloadingMetadata(true);
            const res = await fetch(`${BACKEND_URL}/api/admin/metadata/export`, {
                method: "GET",
                credentials: "include",
            });
            if (!res.ok) throw new Error(`http_${res.status}`);

            const blob = await res.blob();
            const disposition = res.headers.get("content-disposition") || "";
            const match = disposition.match(/filename="?([^"]+)"?/i);
            const fileName = match?.[1] || `voclara-metadata-${new Date().toISOString().slice(0, 10)}.json`;

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            setError(e.message || "Failed to download metadata");
        } finally {
            setDownloadingMetadata(false);
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-warning-200 border-t-warning-600 rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-neutral-900 pt-16 md:pt-0 md:pl-64">
            <AdminNav />

            {/* Dashboard Content */}
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12">
                <div className="mb-6 md:mb-8 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Dashboard</h1>
                        <p className="text-sm md:text-base text-neutral-400">Overview of your Voclara platform</p>
                    </div>
                    {userInfo?.isAdmin && (
                        <button
                            onClick={downloadMetadata}
                            disabled={downloadingMetadata}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-warning-600 hover:bg-warning-700 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m5 4H4" />
                            </svg>
                            {downloadingMetadata ? "Downloading..." : "Download Metadata"}
                        </button>
                    )}
                </div>

                {error && (
                    <div className="bg-error-900/50 border border-error-700 text-error-300 px-4 py-3 rounded-lg mb-6 text-sm md:text-base">
                        {error}
                    </div>
                )}

                {stats && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
                        {/* Total Calls */}
                        <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 md:p-6 hover:border-warning-500/50 transition-all">
                            <div className="flex items-center justify-between mb-3 md:mb-4">
                                <div className="w-10 h-10 md:w-12 md:h-12 bg-primary-900/50 rounded-lg flex items-center justify-center">
                                    <svg className="w-5 h-5 md:w-6 md:h-6 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
                                    </svg>
                                </div>
                            </div>
                            <div className="text-2xl md:text-3xl font-bold text-white mb-1">{stats.totalCalls}</div>
                            <div className="text-xs md:text-sm text-neutral-400">Total Calls</div>
                        </div>

                        {/* Completed Calls */}
                        <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 md:p-6 hover:border-warning-500/50 transition-all">
                            <div className="flex items-center justify-between mb-3 md:mb-4">
                                <div className="w-10 h-10 md:w-12 md:h-12 bg-success-900/50 rounded-lg flex items-center justify-center">
                                    <svg className="w-5 h-5 md:w-6 md:h-6 text-success-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                </div>
                            </div>
                            <div className="text-2xl md:text-3xl font-bold text-white mb-1">{stats.completedCalls}</div>
                            <div className="text-xs md:text-sm text-neutral-400">Completed Calls</div>
                        </div>

                        {/* Total Users */}
                        <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 md:p-6 hover:border-warning-500/50 transition-all">
                            <div className="flex items-center justify-between mb-3 md:mb-4">
                                <div className="w-10 h-10 md:w-12 md:h-12 bg-warning-900/50 rounded-lg flex items-center justify-center">
                                    <svg className="w-5 h-5 md:w-6 md:h-6 text-warning-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path>
                                    </svg>
                                </div>
                            </div>
                            <div className="text-2xl md:text-3xl font-bold text-white mb-1">{stats.totalUsers}</div>
                            <div className="text-xs md:text-sm text-neutral-400">Total Users</div>
                        </div>

                        {/* Avg Duration */}
                        <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 md:p-6 hover:border-warning-500/50 transition-all">
                            <div className="flex items-center justify-between mb-3 md:mb-4">
                                <div className="w-10 h-10 md:w-12 md:h-12 bg-neutral-700 rounded-lg flex items-center justify-center">
                                    <svg className="w-5 h-5 md:w-6 md:h-6 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                </div>
                            </div>
                            <div className="text-2xl md:text-3xl font-bold text-white mb-1">{Math.floor(stats.avgCallDuration / 60)}m</div>
                            <div className="text-xs md:text-sm text-neutral-400">Avg Call Duration</div>
                        </div>
                    </div>
                )}

                {/* Quick Actions */}
                <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-4 md:p-6">
                    <h2 className="text-lg md:text-xl font-bold text-white mb-4">Quick Actions</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                        <Link to="/admin/calls" className="flex items-center space-x-3 p-3 md:p-4 bg-neutral-700 hover:bg-neutral-600 rounded-lg transition-all group">
                            <svg className="w-5 h-5 md:w-6 md:h-6 text-neutral-400 group-hover:text-warning-400 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                            </svg>
                            <div>
                                <div className="font-semibold text-white text-sm md:text-base">View All Calls</div>
                                <div className="text-xs md:text-sm text-neutral-400">Manage call recordings</div>
                            </div>
                        </Link>

                        <Link to="/admin/topics" className="flex items-center space-x-3 p-3 md:p-4 bg-neutral-700 hover:bg-neutral-600 rounded-lg transition-all group">
                            <svg className="w-5 h-5 md:w-6 md:h-6 text-neutral-400 group-hover:text-warning-400 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
                            </svg>
                            <div>
                                <div className="font-semibold text-white text-sm md:text-base">Manage Topics</div>
                                <div className="text-xs md:text-sm text-neutral-400">Add or edit topics</div>
                            </div>
                        </Link>

                        <div className="flex items-center space-x-3 p-3 md:p-4 bg-neutral-700 rounded-lg opacity-50 cursor-not-allowed">
                            <svg className="w-5 h-5 md:w-6 md:h-6 text-neutral-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                            </svg>
                            <div>
                                <div className="font-semibold text-neutral-500 text-sm md:text-base">Analytics</div>
                                <div className="text-xs md:text-sm text-neutral-500">Coming soon</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
