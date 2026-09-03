import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { 
    Radio, 
    ArrowLeft, 
    Layers, 
    FolderKanban, 
    ArrowRight, 
    RefreshCw, 
    Plus, 
    Globe, 
    CheckCircle2, 
    Clock, 
    DollarSign, 
    Sliders, 
    AlertCircle, 
    Search,
    Edit2,
    Users
} from "lucide-react";
import AdminNav from "../components/AdminNav.jsx";
import Swal from "sweetalert2";

const BASE = import.meta.env.VITE_BACKEND_URL || (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1" ? "https://api.voclara.com" : "http://localhost:3001");

async function apiFetch(path, opts = {}) {
    const res = await fetch(`${BASE}${path}`, { credentials: "include", ...opts });
    const json = await res.json().catch(() => ({ error: "Request failed" }));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
}

const get = (p) => apiFetch(p, { method: "GET" });
const postJson = (p, body) => apiFetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const patch = (p, body = {}) => apiFetch(p, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function toSlug(name) {
    return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function AdminScriptedTopicsSubprojects() {
    const { langCode } = useParams();
    const [subprojects, setSubprojects] = useState([]);
    const [currentBaseLanguage, setCurrentBaseLanguage] = useState(capitalize(langCode || ""));
    const [allTopics, setAllTopics] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [showOnlyActive, setShowOnlyActive] = useState(false);

    useEffect(() => {
        loadData();
    }, [langCode]);

    async function loadData() {
        setLoading(true);
        setError("");
        try {
            const [langData, topicData] = await Promise.all([
                get("/api/admin/scripted-languages"),
                get("/api/admin/scripted-topics")
            ]);

            const list = langData.languages || [];
            const topics = topicData.topics || [];
            setAllTopics(topics);

            const cleanCode = (langCode || "").toLowerCase().trim();
            const matched = list.filter((l) => {
                const bLang = (l.language || "").toLowerCase().trim();
                const lCode = (l.code || "").toLowerCase().trim();
                const lName = (l.name || "").toLowerCase().trim();
                return (
                    bLang === cleanCode ||
                    lCode === cleanCode ||
                    lCode.endsWith(`-${cleanCode}`) ||
                    lName === cleanCode ||
                    lName.includes(`(${cleanCode})`)
                );
            });

            const baseObj = list.find(l => (l.language && l.language.toLowerCase() === cleanCode) || l.code.toLowerCase() === cleanCode);
            const baseName = baseObj?.language || (baseObj && !baseObj.projectName ? baseObj.name : capitalize(langCode || ""));
            setCurrentBaseLanguage(baseName);

            // Compute topic counts for each subproject
            const subprojectsWithCounts = matched.map(sub => {
                const subCode = sub.code.toLowerCase();
                const matchedTopics = topics.filter(t => (t.languages || []).some(l => l.toLowerCase() === subCode));
                const totalSubtopics = matchedTopics.reduce((acc, t) => acc + (t.subtopics?.length || 0), 0);
                return {
                    ...sub,
                    topicCount: matchedTopics.length,
                    subtopicCount: totalSubtopics
                };
            });

            setSubprojects(subprojectsWithCounts);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    const filteredSubprojects = subprojects.filter(sub => {
        const matchesSearch = (sub.name || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
                              (sub.projectName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                              (sub.companyName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                              (sub.code || "").toLowerCase().includes(searchQuery.toLowerCase());
        const matchesActive = !showOnlyActive || sub.enabled;
        return matchesSearch && matchesActive;
    });

    return (
        <div className="min-h-screen bg-neutral-900 text-white flex">
            <AdminNav />
            <div className="flex-1 md:ml-64 p-6 min-w-0">
                {/* Breadcrumbs & Header */}
                <div className="flex flex-col gap-3 pb-6 border-b border-neutral-800">
                    <div className="flex items-center gap-2 text-xs font-semibold text-neutral-400">
                        <Link to="/admin/scripted-topics" className="hover:text-indigo-400 flex items-center gap-1">
                            <Radio className="w-3.5 h-3.5" />
                            <span>Scripted Call Topics</span>
                        </Link>
                        <span>/</span>
                        <span className="text-white flex items-center gap-1">
                            <Globe className="w-3.5 h-3.5 text-indigo-400" />
                            <span>{currentBaseLanguage}</span>
                        </span>
                        <span>/</span>
                        <span className="text-indigo-400">Subprojects</span>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <Link to="/admin/scripted-topics" className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors">
                                    <ArrowLeft className="w-4 h-4" />
                                </Link>
                                <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                                    <span>{currentBaseLanguage} Scripted Subprojects</span>
                                </h1>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                                    Tier 2: Select Subproject
                                </span>
                            </div>
                            <p className="text-sm text-neutral-400 mt-1">
                                Choose a scripted subproject to view and manage dialogue scripts, topics, and frequency targets.
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={loadData}
                                disabled={loading}
                                className="flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-xl text-xs font-semibold text-neutral-300 hover:text-white transition-all cursor-pointer"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-400" : ""}`} />
                                <span>Refresh</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Search & Active Filters */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-6 mb-6">
                    <div className="relative flex-1 max-w-md">
                        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={`Search ${currentBaseLanguage} scripted subprojects...`}
                            className="w-full pl-9 pr-4 py-2 bg-neutral-800/80 border border-neutral-700/80 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowOnlyActive(prev => !prev)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                                showOnlyActive 
                                    ? "bg-indigo-900/40 border-indigo-600 text-indigo-300" 
                                    : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white"
                            }`}
                        >
                            {showOnlyActive ? "Showing Active Only" : "Show All"}
                        </button>
                    </div>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="p-4 mb-6 rounded-xl bg-rose-900/20 border border-rose-700/40 text-rose-300 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Subprojects Grid */}
                {loading ? (
                    <div className="py-24 flex flex-col items-center justify-center gap-3 text-neutral-400">
                        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs">Loading scripted subprojects...</span>
                    </div>
                ) : filteredSubprojects.length === 0 ? (
                    <div className="py-16 text-center text-neutral-400 bg-neutral-800/30 rounded-2xl border border-neutral-800 p-8">
                        <FolderKanban className="w-10 h-10 mx-auto text-neutral-600 mb-2" />
                        <p className="text-sm font-semibold text-neutral-300">No Scripted Subprojects Found for {currentBaseLanguage}</p>
                        <p className="text-xs text-neutral-500 mt-1">Configure scripted subprojects under Scripted Language Management in the sidebar.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredSubprojects.map(sub => (
                            <Link
                                key={sub._id}
                                to={`/admin/scripted-topics/${encodeURIComponent(langCode)}/subprojects/${encodeURIComponent(sub.code)}/topics`}
                                className="group p-5 rounded-2xl bg-neutral-800/70 hover:bg-neutral-800 border border-neutral-700/70 hover:border-indigo-500/60 transition-all duration-200 shadow-md flex flex-col justify-between"
                            >
                                <div>
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-9 h-9 rounded-xl bg-indigo-900/40 border border-indigo-700/50 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
                                                <FolderKanban className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-base text-white group-hover:text-indigo-300 transition-colors">
                                                    {sub.projectName || sub.name || "Default Scripted Project"}
                                                </h3>
                                                <span className="text-[11px] font-mono text-neutral-400">
                                                    code: {sub.code}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                            {sub.companyName && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/60 text-amber-300 border border-amber-700/50 flex items-center gap-1 shadow-sm" title="Internal Client Reference">
                                                    🏢 {sub.companyName}
                                                </span>
                                            )}
                                            {sub.enabled ? (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-700/50 flex items-center gap-1">
                                                    <CheckCircle2 className="w-2.5 h-2.5" />
                                                    <span>Active</span>
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-900 text-neutral-400 border border-neutral-700">
                                                    Inactive
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Roles badge */}
                                    <div className="flex items-center gap-2 my-2 text-[11px] text-neutral-300 bg-neutral-900/40 p-2 rounded-lg border border-neutral-750">
                                        <Users className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                        <span className="truncate">Roles: <strong className="text-white">{sub.role1 || "Speaker 1"}</strong> & <strong className="text-white">{sub.role2 || "Speaker 2"}</strong></span>
                                    </div>

                                    {/* Stats grid */}
                                    <div className="grid grid-cols-2 gap-2 my-3 pt-2.5 border-t border-neutral-700/40 text-xs">
                                        <div className="p-2 rounded-lg bg-neutral-900/60 border border-neutral-750">
                                            <div className="text-[10px] font-semibold text-neutral-400 flex items-center gap-1">
                                                <Layers className="w-3 h-3 text-amber-400" />
                                                <span>Topics</span>
                                            </div>
                                            <div className="text-sm font-bold text-white mt-0.5">
                                                {sub.topicCount || 0} Topics
                                            </div>
                                        </div>

                                        <div className="p-2 rounded-lg bg-neutral-900/60 border border-neutral-750">
                                            <div className="text-[10px] font-semibold text-neutral-400 flex items-center gap-1">
                                                <DollarSign className="w-3 h-3 text-emerald-400" />
                                                <span>Payout</span>
                                            </div>
                                            <div className="text-sm font-bold text-white mt-0.5">
                                                ${sub.hourlyPayout || 0}/hr
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-2 flex items-center justify-between text-xs font-bold text-indigo-400 group-hover:text-indigo-300">
                                    <span>Manage Scripted Topics & Dialogue →</span>
                                    <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
