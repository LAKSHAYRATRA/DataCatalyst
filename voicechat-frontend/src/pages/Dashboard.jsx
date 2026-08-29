import React, { useEffect, useState } from "react";
import Nav from "../components/Nav.jsx";
import { apiGet } from "../lib/api.js";
import { getUserInfo } from "../lib/auth.js";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Phone, CheckCircle2, Clock, Activity, Mic2, AlertCircle, ChevronLeft, ChevronRight, MessageSquare, CreditCard, Sparkles, TrendingUp, Zap, Flame, ArrowRight, Layers, Radio } from "lucide-react";

export default function Dashboard() {
    const [sessions, setSessions] = useState([]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [recommendedProjects, setRecommendedProjects] = useState([]);
    const [myApps, setMyApps] = useState([]);
    const [recLoading, setRecLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [feedbackModal, setFeedbackModal] = useState(null);
    const [showPanReminder, setShowPanReminder] = useState(false);
    const [panRejected, setPanRejected] = useState(false);
    const [panRejectionReason, setPanRejectionReason] = useState(null);
    const [showUpiReminder, setShowUpiReminder] = useState(false);
    const [pendingScriptedReRecords, setPendingScriptedReRecords] = useState([]);
    const itemsPerPage = 8;

    const userInfo = getUserInfo();
    const awaitingReview = !userInfo?.isAdmin && userInfo?.contributorAgreement?.signed === true
        && userInfo?.contributorAgreement?.adminReviewStatus === "pending";

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
        (async () => {
            try {
                const kyc = await apiGet("/api/user/kyc/status");
                setShowPanReminder(!!kyc.needsPanReminder);
                setPanRejected(kyc.verificationStatus === "rejected");
                setPanRejectionReason(kyc.rejectionReason || null);
                setShowUpiReminder(!!kyc.needsUpiReminder);
            } catch {
                // silent — banner just stays hidden
            }
        })();
        (async () => {
            try {
                const reRes = await apiGet("/api/scripted-topics/my-rerecords").catch(() => ({ rerecords: [] }));
                setPendingScriptedReRecords(reRes?.rerecords || []);
            } catch {
                // silent
            }
        })();
        (async () => {
            try {
                const [recRes, appsRes] = await Promise.all([
                    apiGet("/api/projects/recommended").catch(() => ({ projects: [] })),
                    apiGet("/api/language-applications/my").catch(() => ({ applications: [] }))
                ]);
                setRecommendedProjects(recRes.projects || []);
                setMyApps(appsRes.applications || []);
            } catch {
                setRecommendedProjects([]);
                setMyApps([]);
            } finally {
                setRecLoading(false);
            }
        })();
    }, []);

    // Filter out projects that the contributor is already approved, pending, blacklisted, OR rejected from
    const isEligibleForRecommendation = (project) => {
        const projCode = String(project.code || project.companyId || "").trim().toLowerCase();
        const projId = String(project.id || "").trim().toLowerCase();
        const projTitle = String(project.projectName || project.title || "").trim().toLowerCase();

        if (project.type === "phrase") {
            const projectLanguages = Array.isArray(project.languages) && project.languages.length > 0
                ? project.languages.map(l => String(l).toLowerCase().trim())
                : [String(project.language || "").toLowerCase().trim()].filter(Boolean);

            const companyApps = (myApps || []).filter(a => {
                const appType = a.applicationType || "phrase";
                if (appType !== "phrase") return false;
                const appComp = String(a.companyId || "").trim().toLowerCase();
                const appProj = String(a.projectName || "").trim().toLowerCase();
                return appComp === projCode || appComp === projId || appProj === projTitle || appProj === projCode;
            });

            // If user has no applications for this company, it's eligible
            if (companyApps.length === 0) return true;

            // If user was rejected from ANY application in this company, do NOT recommend it
            const hasRejected = companyApps.some(a => a.status === "rejected");
            if (hasRejected) return false;

            // If project has specific languages, check if there are unapplied languages (not applied/pending/approved/blacklisted/rejected)
            if (projectLanguages.length > 0) {
                return projectLanguages.some(lang => {
                    const appForLang = companyApps.find(a => String(a.languageCode || a.language || "").toLowerCase().trim() === lang);
                    return !appForLang; // only eligible if completely unapplied
                });
            }

            // Fallback for single-language project: if any app exists (approved/pending/rejected/blacklisted), do NOT recommend
            return false;
        }

        if (project.type === "call" || project.type === "scripted_call") {
            const app = (myApps || []).find(a => {
                const appType = a.applicationType || (a.companyId ? "phrase" : "call");
                const appLang = String(a.languageCode || a.language || "").trim().toLowerCase();
                return appType === project.type && appLang === projCode;
            });
            // If user has applied for this call / scripted project (approved, pending, blacklisted, OR rejected), do NOT recommend
            if (app) return false;
            return true;
        }

        return true;
    };

    const unappliedBoostedProjects = recommendedProjects.filter(p => isEligibleForRecommendation(p));

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

                {pendingScriptedReRecords.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-8 rounded-3xl border-2 border-rose-500/60 bg-gradient-to-r from-rose-950/90 via-rose-900/40 to-amber-950/60 p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl shadow-rose-950/40 animate-pulse"
                    >
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center flex-shrink-0 mt-0.5 text-rose-400">
                                <AlertCircle className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-lg font-black text-rose-200">Action Required: Re-record Scripted Call Verses</h3>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-600 text-white">
                                        {pendingScriptedReRecords.length} Scenario{pendingScriptedReRecords.length > 1 ? "s" : ""} Flagged
                                    </span>
                                </div>
                                <p className="text-sm text-neutral-300 mt-1">
                                    {pendingScriptedReRecords[0].scenarioTitle} in {pendingScriptedReRecords[0].language} has flagged verse(s) requiring a quick re-take.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                            {pendingScriptedReRecords.map((rec) => (
                                <Link
                                    key={rec.submissionId}
                                    to={`/scripted-call?subtopicId=${rec.subtopicId}&language=${encodeURIComponent(rec.language || 'english')}`}
                                    className="inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-sm font-black shadow-lg shadow-rose-900/30 transition-all flex-shrink-0"
                                >
                                    Re-record {rec.scenarioTitle} Now →
                                </Link>
                            ))}
                        </div>
                    </motion.div>
                )}

                {panRejected && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-8 rounded-2xl border border-rose-500/40 bg-rose-500/10 dark:bg-rose-500/10 p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                        <div className="flex items-start gap-4">
                            <div className="w-11 h-11 rounded-full bg-rose-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <AlertCircle className="w-5 h-5 text-rose-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-rose-300">PAN Verification Rejected</h3>
                                <p className="text-sm text-neutral-300 mt-1">
                                    {panRejectionReason
                                        ? `Reason: ${panRejectionReason}. Please update and re-submit your PAN card.`
                                        : "Your PAN details could not be verified. Please review and re-submit."}
                                </p>
                            </div>
                        </div>
                        <Link
                            to="/profile"
                            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold shadow-lg shadow-rose-900/30 transition-all flex-shrink-0"
                        >
                            Re-submit PAN
                        </Link>
                    </motion.div>
                )}

                {showPanReminder && !panRejected && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-8 rounded-2xl border border-amber-500/40 bg-amber-500/10 dark:bg-amber-500/10 p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                        <div className="flex items-start gap-4">
                            <div className="w-11 h-11 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <AlertCircle className="w-5 h-5 text-amber-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-amber-300">Action Required: Complete PAN Verification</h3>
                                <p className="text-sm text-neutral-300 mt-1">
                                    Please upload your PAN card details to ensure timely monthly payouts.
                                </p>
                            </div>
                        </div>
                        <Link
                            to="/profile"
                            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold shadow-lg shadow-amber-900/30 transition-all flex-shrink-0"
                        >
                            Submit PAN Details
                        </Link>
                    </motion.div>
                )}

                {showUpiReminder && !showPanReminder && !panRejected && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-8 rounded-2xl border border-primary-500/40 bg-primary-500/10 dark:bg-primary-500/10 p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                        <div className="flex items-start gap-4">
                            <div className="w-11 h-11 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <CreditCard className="w-5 h-5 text-primary-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-primary-300">Add UPI ID for Faster Payouts</h3>
                                <p className="text-sm text-neutral-300 mt-1">
                                    You haven't added a UPI ID yet. Add one in your profile for seamless earnings transfer.
                                </p>
                            </div>
                        </div>
                        <Link
                            to="/profile"
                            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-bold shadow-lg shadow-primary-900/30 transition-all flex-shrink-0"
                        >
                            Add UPI ID
                        </Link>
                    </motion.div>
                )}

                {awaitingReview && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-8 rounded-2xl border border-warning-400/40 bg-warning-500/10 dark:bg-warning-500/10 p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-4"
                    >
                        <div className="w-11 h-11 rounded-full bg-warning-500/20 flex items-center justify-center flex-shrink-0">
                            <Clock className="w-5 h-5 text-warning-400" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-warning-300">Awaiting Contributor Agreement Approval</h3>
                            <p className="text-sm text-neutral-300 mt-1">
                                Your signed agreement is being reviewed by our admin team. Once approved, you'll be able to start contributing. This usually takes 24–48 hours.
                            </p>
                        </div>
                    </motion.div>
                )}

                {/* Recommended Projects Section (Shown only for unapplied, unapproved projects) */}
                {!recLoading && unappliedBoostedProjects.length > 0 && (
                    <motion.div 
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        className="mb-10"
                    >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center shadow-lg shadow-amber-500/20 text-white flex-shrink-0">
                                    <Sparkles className="w-4 h-4 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-lg md:text-xl font-extrabold text-neutral-900 dark:text-white">
                                        Recommended Projects
                                    </h2>
                                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                        High-earning voice tasks & dialogues open for you to apply right now.
                                    </p>
                                </div>
                            </div>

                            <Link 
                                to="/language-apply" 
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline self-start sm:self-auto"
                            >
                                <span>Browse All Applications</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {unappliedBoostedProjects.map((proj) => {
                                const isCall = proj.type === "call";
                                const isScripted = proj.type === "scripted_call";

                                return (
                                    <div 
                                        key={`${proj.type}-${proj.code}`}
                                        className={`relative overflow-hidden rounded-3xl p-5 md:p-6 transition-all duration-300 flex flex-col justify-between shadow-xl border bg-gradient-to-br from-neutral-900 via-neutral-900/90 to-amber-950/30 border-amber-500/40 hover:border-amber-400/80 shadow-amber-500/5`}
                                    >
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

                                        <div>
                                            {/* Card Header */}
                                            <div className="flex items-start justify-between gap-2 mb-3">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                                                        isCall 
                                                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' 
                                                            : isScripted 
                                                            ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                                                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                                    }`}>
                                                        {isCall && <Phone className="w-2.5 h-2.5" />}
                                                        {isScripted && <Radio className="w-2.5 h-2.5" />}
                                                        {!isCall && !isScripted && <Mic2 className="w-2.5 h-2.5" />}
                                                        <span>{proj.typeLabel}</span>
                                                    </span>

                                                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 border border-amber-500/50 shadow-sm animate-pulse">
                                                        <Sparkles className="w-2.5 h-2.5 text-amber-300" /> Priority
                                                    </span>
                                                </div>

                                                <div className="text-right flex-shrink-0">
                                                    <span className="text-xs font-black font-mono text-emerald-400 block">
                                                        ${proj.hourlyPayout || 0}
                                                        <span className="text-[10px] text-neutral-400 font-normal">/hr</span>
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Project Title */}
                                            <h3 className="font-extrabold text-neutral-900 dark:text-white text-base leading-snug mb-1">
                                                {proj.title}
                                            </h3>

                                            <div className="flex items-center gap-2 flex-wrap mb-4 text-xs">
                                                <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                                                    🌐 {proj.language}
                                                </span>
                                                {proj.roles && (
                                                    <span className="text-[10px] font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/40">
                                                        🎭 {proj.roles.join(" vs ")}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Action Button */}
                                        <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800/80">
                                            <Link
                                                to={proj.applyUrl}
                                                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-primary-900/20 transition-all"
                                            >
                                                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                                <span>Apply for Project</span>
                                                <ArrowRight className="w-3.5 h-3.5" />
                                            </Link>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}

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
                                                        onClick={() => setFeedbackModal({ note: session.reviewNote, status: session.callStatus, reviewedBy: session.reviewedBy })}
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
