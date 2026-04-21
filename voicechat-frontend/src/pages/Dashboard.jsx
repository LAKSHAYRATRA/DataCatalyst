import React, { useEffect, useState } from "react";
import Nav from "../components/Nav.jsx";
import { apiGet } from "../lib/api.js";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Phone, CheckCircle2, Clock, Activity, Mic2, AlertCircle, ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";

export default function Dashboard() {
    const [sessions, setSessions] = useState([]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [feedbackModal, setFeedbackModal] = useState(null);
    const itemsPerPage = 8;

    useEffect(() => {
        (async () => {
            try {
                const res = await apiGet("/api/history");
                setSessions(res.sessions || []);
            } catch (e) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // Calculate stats
    const totalCalls = sessions.length;
    const completedCalls = sessions.filter(s => s.endedAt).length;
    const totalMinutes = sessions.reduce((acc, s) => {
        const recordingStart = s.recordingAStartedAt || s.recordingBStartedAt;
        const start = recordingStart || s.actualCallStartedAt || s.startedAt;
        if (s.endedAt && start) {
            const diff = new Date(s.endedAt) - new Date(start);
            return acc + Math.floor(diff / 60000);
        }
        return acc;
    }, 0);
    const avgDuration = completedCalls > 0 ? Math.round(totalMinutes / completedCalls) : 0;

    // Pagination
    const totalPages = Math.ceil(sessions.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentSessions = sessions.slice(startIndex, endIndex);

    const formatDuration = (start, end) => {
        if (!end || !start) return "-";
        try {
            const diff = new Date(end) - new Date(start);
            if (isNaN(diff)) return "-";
            const minutes = Math.floor(diff / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);
            return `${minutes}m ${seconds}s`;
        } catch {
            return "-";
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return "Invalid Date";
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return "Invalid Date";
            const now = new Date();
            const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
            if (diffDays === 0) return "Today, " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (diffDays === 1) return "Yesterday, " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return date.toLocaleDateString() + ", " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
            return "Invalid Date";
        }
    };

    const getStatusBadge = (status) => {
        if (!status) {
            return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">--</span>;
        }
        const statusConfig = {
            pending:  { bg: 'bg-warning-100 dark:bg-warning-900/30', text: 'text-warning-800 dark:text-warning-400', label: 'Pending'  },
            approved: { bg: 'bg-success-100 dark:bg-success-900/30',  text: 'text-success-800 dark:text-success-400',  label: 'Approved' },
            rejected: { bg: 'bg-error-100 dark:bg-error-900/30',    text: 'text-error-800 dark:text-error-400',    label: 'Rejected' },
        };
        const config = statusConfig[status] || statusConfig.pending;
        return (
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${config.bg} ${config.text} border border-current opacity-90`}>
                {config.label}
            </span>
        );
    };

    // Stagger container
    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 pt-16 md:pt-0 md:pl-72 transition-colors duration-300">
            <Nav />
            <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-12">

                {/* Header Sequence */}
                <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6"
                >
                    <div>
                        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-2">Welcome Back.</h1>
                        <p className="text-lg text-neutral-500 dark:text-neutral-400 font-medium tracking-wide">Here's your performance overview today.</p>
                    </div>
                </motion.div>

                {/* Phrase Studio Call to Action Widget */}
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                >
                    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-primary-900 to-indigo-950 text-white mb-10 shadow-2xl shadow-primary-900/20 border border-primary-800/50">
                        {/* Background Deco */}
                        <div className="absolute top-0 right-0 w-96 h-96 bg-primary-500 rounded-full blur-[120px] opacity-20 pointer-events-none transform translate-x-1/2 -translate-y-1/2"></div>
                        
                        <div className="relative z-10 p-8 md:p-10 flex flex-col md:flex-row items-center justify-between gap-8">
                            <div className="flex-1">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-bold tracking-widest uppercase mb-4 text-primary-200">
                                    <span className="w-2 h-2 rounded-full bg-success-400 animate-pulse"></span>
                                    New Audio Feature
                                </div>
                                <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">Phrase Recording Studio</h2>
                                <p className="text-primary-100/80 text-lg max-w-xl leading-relaxed mb-6">
                                    Don't want to engage in long conversations right now? Jump into the Phrase Studio to record quick, 5-second scripts to train AI instantly. High approval rate, fast payout!
                                </p>
                            </div>
                            
                            <motion.div 
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="w-full md:w-auto"
                            >
                                <Link 
                                    to="/phrases" 
                                    className="block text-center bg-white text-primary-900 font-bold text-lg px-8 py-4 rounded-2xl shadow-[0_0_40px_rgba(255,255,255,0.3)] hover:shadow-[0_0_60px_rgba(255,255,255,0.5)] transition-all flex items-center justify-center gap-3"
                                >
                                    <Mic2 className="w-6 h-6 text-primary-600" />
                                    Launch Studio
                                </Link>
                            </motion.div>
                        </div>
                    </div>
                </motion.div>

                {/* Stats Cards */}
                <motion.div 
                    variants={container}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10"
                >
                    <motion.div variants={item} whileHover={{ y: -5 }} className="bg-white dark:bg-neutral-900 rounded-3xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-sm transition-all duration-300">
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-primary-50 dark:bg-primary-900/30 rounded-2xl">
                                <Phone className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                            </div>
                        </div>
                        <p className="text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-1">Total Calls</p>
                        <p className="text-4xl font-black text-neutral-900 dark:text-white drop-shadow-sm">{totalCalls}</p>
                    </motion.div>

                    <motion.div variants={item} whileHover={{ y: -5 }} className="bg-white dark:bg-neutral-900 rounded-3xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-sm transition-all duration-300">
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-success-50 dark:bg-success-900/30 rounded-2xl">
                                <CheckCircle2 className="w-6 h-6 text-success-600 dark:text-success-400" />
                            </div>
                        </div>
                        <p className="text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-1">Completed</p>
                        <p className="text-4xl font-black text-neutral-900 dark:text-white drop-shadow-sm">{completedCalls}</p>
                    </motion.div>

                    <motion.div variants={item} whileHover={{ y: -5 }} className="bg-white dark:bg-neutral-900 rounded-3xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-sm transition-all duration-300">
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-warning-50 dark:bg-warning-900/30 rounded-2xl">
                                <Clock className="w-6 h-6 text-warning-600 dark:text-warning-400" />
                            </div>
                        </div>
                        <p className="text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-1">Total Mins</p>
                        <p className="text-4xl font-black text-neutral-900 dark:text-white drop-shadow-sm">{totalMinutes}</p>
                    </motion.div>

                    <motion.div variants={item} whileHover={{ y: -5 }} className="bg-white dark:bg-neutral-900 rounded-3xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-sm transition-all duration-300">
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl">
                                <Activity className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                            </div>
                        </div>
                        <p className="text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-1">Avg Duration</p>
                        <p className="text-4xl font-black text-neutral-900 dark:text-white drop-shadow-sm">{avgDuration}m</p>
                    </motion.div>
                </motion.div>

                {/* Call History Table */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-white dark:bg-neutral-900 rounded-[2rem] border border-neutral-200 dark:border-neutral-800 shadow-xl overflow-hidden"
                >
                    <div className="flex items-center justify-between p-8 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50">
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight mb-1">Call Logs</h2>
                            <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium">Tracking {sessions.length} recorded sessions</p>
                        </div>
                        <span className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-xl text-neutral-600 dark:text-neutral-300">
                            <Activity className="w-5 h-5" />
                        </span>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <div className="w-12 h-12 border-4 border-primary-200 dark:border-primary-900 border-t-primary-600 dark:border-t-primary-500 rounded-full animate-spin"></div>
                            <p className="mt-6 text-neutral-500 dark:text-neutral-400 font-medium animate-pulse">Syncing logs...</p>
                        </div>
                    ) : error ? (
                        <div className="m-8 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 text-error-700 dark:text-error-400 px-6 py-4 rounded-2xl flex items-center gap-3">
                            <AlertCircle className="w-6 h-6 shrink-0" />
                            <p className="font-semibold">{error}</p>
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                            <div className="w-20 h-20 bg-neutral-50 dark:bg-neutral-800 rounded-full border-2 border-dashed border-neutral-200 dark:border-neutral-700 flex items-center justify-center mb-6">
                                <Phone className="w-8 h-8 text-neutral-400 dark:text-neutral-500" />
                            </div>
                            <h3 className="text-xl font-bold mb-2">No Calls Encountered</h3>
                            <p className="text-neutral-500 dark:text-neutral-400 max-w-sm leading-relaxed">Your data log is currently empty. Start taking calls or recording phrases to populate this table.</p>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/80 uppercase text-xs tracking-widest text-neutral-400 dark:text-neutral-500">
                                            <th className="px-8 py-5 font-bold">Details</th>
                                            <th className="px-8 py-5 font-bold">Language</th>
                                            <th className="px-8 py-5 font-bold">Duration</th>
                                            <th className="px-8 py-5 font-bold">Status</th>
                                            <th className="px-8 py-5 font-bold text-center">Review</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                                        {currentSessions.map((session, idx) => (
                                            <tr key={idx} className="hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40 transition-colors">
                                                <td className="px-8 py-5">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-sm text-neutral-900 dark:text-neutral-100 mb-1">
                                                            {session.subtopic ? session.subtopic.title : "Unassigned Call"}
                                                        </span>
                                                        <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
                                                            {formatDate(session.startedAt)}
                                                        </span>
                                                    </div>
                                                </td>

                                                <td className="px-8 py-5">
                                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 uppercase tracking-widest">
                                                        {session.language || 'Unknown'}
                                                    </span>
                                                </td>

                                                <td className="px-8 py-5 text-sm font-mono font-bold text-neutral-700 dark:text-neutral-300">
                                                    {formatDuration(
                                                        session.recordingAStartedAt || session.recordingBStartedAt || session.actualCallStartedAt || session.startedAt,
                                                        session.endedAt
                                                    )}
                                                </td>

                                                <td className="px-8 py-5">
                                                    {getStatusBadge(session.callStatus)}
                                                </td>

                                                <td className="px-8 py-5 text-center">
                                                    <button
                                                        onClick={() => setFeedbackModal({ note: session.reviewNote, status: session.callStatus })}
                                                        title="View admin note"
                                                        className="inline-flex items-center justify-center p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-primary-50 dark:hover:bg-primary-900/40 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                                    >
                                                        <MessageSquare className="w-5 h-5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex flex-col sm:flex-row items-center justify-between p-6 bg-neutral-50 dark:bg-neutral-900/80 border-t border-neutral-100 dark:border-neutral-800 gap-4">
                                    <div className="text-sm font-bold text-neutral-500 tracking-wide uppercase">
                                        Showing {startIndex + 1}-{Math.min(endIndex, sessions.length)} of {sessions.length}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={currentPage === 1}
                                            className="p-2 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 transition-all text-neutral-600 dark:text-neutral-300"
                                        >
                                            <ChevronLeft className="w-5 h-5" />
                                        </button>
                                        
                                        <div className="flex gap-1">
                                            {[...Array(totalPages)].map((_, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => setCurrentPage(i + 1)}
                                                    className={`w-10 h-10 flex items-center justify-center text-sm font-bold rounded-xl transition-all ${currentPage === i + 1
                                                        ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 shadow-md transform scale-110'
                                                        : 'text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                                                        }`}
                                                >
                                                    {i + 1}
                                                </button>
                                            ))}
                                        </div>

                                        <button
                                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                            disabled={currentPage === totalPages}
                                            className="p-2 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 transition-all text-neutral-600 dark:text-neutral-300"
                                        >
                                            <ChevronRight className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </motion.div>
            </div>

            {/* Admin Review Note Modal */}
            {feedbackModal && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/60 backdrop-blur-sm px-4"
                    onClick={() => setFeedbackModal(null)}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-white dark:bg-neutral-900 rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden border border-neutral-200 dark:border-neutral-800"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className={`px-8 py-6 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 flex justify-between items-center`}>
                            <h3 className={`font-bold text-lg tracking-tight`}>
                                Feedback Note
                            </h3>
                            {getStatusBadge(feedbackModal.status)}
                        </div>

                        <div className="px-8 py-8">
                            {feedbackModal.note ? (
                                <p className="text-base text-neutral-700 dark:text-neutral-300 leading-relaxed font-medium">"{feedbackModal.note}"</p>
                            ) : (
                                <div className="text-center text-neutral-400">
                                    <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-50" />
                                    <p className="italic font-medium">No note was attached to this review.</p>
                                </div>
                            )}
                        </div>

                        <div className="px-8 pb-8 flex justify-end">
                            <button
                                onClick={() => setFeedbackModal(null)}
                                className="w-full py-4 text-sm font-bold bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-2xl hover:scale-105 active:scale-95 transition-transform shadow-lg"
                            >
                                Close Modal
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
