import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { 
    Radio, 
    Search, 
    Layers, 
    FolderKanban, 
    ArrowRight, 
    RefreshCw, 
    Globe, 
    CheckCircle2, 
    AlertCircle 
} from "lucide-react";
import AdminNav from "../components/AdminNav.jsx";

const BASE = import.meta.env.VITE_BACKEND_URL || (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1" ? "https://api.voclara.com" : "http://localhost:3001");

async function apiFetch(path, opts = {}) {
    const res = await fetch(`${BASE}${path}`, { credentials: "include", ...opts });
    const json = await res.json().catch(() => ({ error: "Request failed" }));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
}

function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export default function AdminScriptedTopicsLanguages() {
    const [languages, setLanguages] = useState([]);
    const [allTopics, setAllTopics] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [showOnlyActive, setShowOnlyActive] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        setError("");
        try {
            const [langData, topicData] = await Promise.all([
                apiFetch("/api/admin/scripted-languages"),
                apiFetch("/api/admin/scripted-topics")
            ]);

            const rawLangs = langData.languages || [];
            const topics = topicData.topics || [];
            setAllTopics(topics);

            // Group all language entries into unique base languages
            const baseMap = new Map();

            rawLangs.forEach(item => {
                const baseName = (item.language || (item.projectName ? "" : item.name) || item.name || "Unknown").trim();
                const baseKey = baseName.toLowerCase();
                if (!baseMap.has(baseKey)) {
                    baseMap.set(baseKey, {
                        key: baseKey,
                        name: capitalize(baseName),
                        code: item.code.split("-")[item.code.split("-").length - 1] || item.code,
                        subprojects: [],
                        activeSubprojectsCount: 0,
                        totalTopicsCount: 0,
                        isEnabled: false
                    });
                }

                const group = baseMap.get(baseKey);
                group.subprojects.push(item);
                if (item.enabled) {
                    group.activeSubprojectsCount += 1;
                    group.isEnabled = true;
                }
            });

            // Calculate scripted topics count per base language
            baseMap.forEach(group => {
                const subCodes = group.subprojects.map(s => s.code.toLowerCase());
                const matchingTopics = topics.filter(t => {
                    const topicLangs = (t.languages || []).map(l => l.toLowerCase());
                    return topicLangs.some(tl => subCodes.includes(tl) || tl === group.key || tl === group.code.toLowerCase());
                });
                group.totalTopicsCount = matchingTopics.length;
            });

            setLanguages(Array.from(baseMap.values()));
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    const filteredLanguages = languages.filter(lang => {
        const matchesSearch = lang.name.toLowerCase().includes(searchQuery.toLowerCase()) || lang.code.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesActive = !showOnlyActive || lang.isEnabled;
        return matchesSearch && matchesActive;
    });

    return (
        <div className="min-h-screen bg-neutral-900 text-white flex">
            <AdminNav />
            <div className="flex-1 md:ml-64 p-6 min-w-0">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-neutral-800">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                                <Radio className="w-6 h-6 text-indigo-400" />
                                <span>Scripted Call Topics by Language</span>
                            </h1>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                                Tier 1: Select Language
                            </span>
                        </div>
                        <p className="text-sm text-neutral-400">
                            Select a language to view its scripted subprojects and manage dialogue scripts, topics, and frequency targets.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={loadData}
                            disabled={loading}
                            className="flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-xl text-xs font-semibold text-neutral-300 hover:text-white transition-all shadow-sm cursor-pointer"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-400" : ""}`} />
                            <span>Refresh</span>
                        </button>
                    </div>
                </div>

                {/* Search & Filters */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-6 mb-6">
                    <div className="relative flex-1 max-w-md">
                        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search scripted languages..."
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
                            {showOnlyActive ? "Showing Active Only" : "Show All Languages"}
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

                {/* Grid of Languages */}
                {loading ? (
                    <div className="py-24 flex flex-col items-center justify-center gap-3 text-neutral-400">
                        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs">Loading scripted languages and topic quotas...</span>
                    </div>
                ) : filteredLanguages.length === 0 ? (
                    <div className="py-16 text-center text-neutral-400 bg-neutral-800/30 rounded-2xl border border-neutral-800">
                        <Globe className="w-10 h-10 mx-auto text-neutral-600 mb-2" />
                        <p className="text-sm font-semibold text-neutral-300">No Scripted Languages Found</p>
                        <p className="text-xs text-neutral-500 mt-1">Add a new scripted language in Scripted Call Languages.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredLanguages.map(lang => (
                            <Link
                                key={lang.key}
                                to={`/admin/scripted-topics/${encodeURIComponent(lang.key)}/subprojects`}
                                className="group p-5 rounded-2xl bg-neutral-800/70 hover:bg-neutral-800 border border-neutral-700/70 hover:border-indigo-500/60 transition-all duration-200 shadow-md flex flex-col justify-between"
                            >
                                <div>
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-9 h-9 rounded-xl bg-indigo-900/40 border border-indigo-700/50 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
                                                <Globe className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-base text-white group-hover:text-indigo-300 transition-colors">
                                                    {lang.name}
                                                </h3>
                                                <span className="text-[11px] font-mono text-neutral-400">
                                                    code: {lang.code}
                                                </span>
                                            </div>
                                        </div>

                                        {lang.isEnabled ? (
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

                                    {/* Stats grid */}
                                    <div className="grid grid-cols-2 gap-2 my-4 pt-3 border-t border-neutral-700/40 text-xs">
                                        <div className="p-2 rounded-lg bg-neutral-900/60 border border-neutral-750">
                                            <div className="text-[10px] font-semibold text-neutral-400 flex items-center gap-1">
                                                <FolderKanban className="w-3 h-3 text-indigo-400" />
                                                <span>Subprojects</span>
                                            </div>
                                            <div className="text-base font-bold text-white mt-0.5">
                                                {lang.subprojects.length}
                                            </div>
                                        </div>

                                        <div className="p-2 rounded-lg bg-neutral-900/60 border border-neutral-750">
                                            <div className="text-[10px] font-semibold text-neutral-400 flex items-center gap-1">
                                                <Layers className="w-3 h-3 text-amber-400" />
                                                <span>Topics</span>
                                            </div>
                                            <div className="text-base font-bold text-white mt-0.5">
                                                {lang.totalTopicsCount}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-2 flex items-center justify-between text-xs font-bold text-indigo-400 group-hover:text-indigo-300">
                                    <span>View Subprojects ({lang.subprojects.length})</span>
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
