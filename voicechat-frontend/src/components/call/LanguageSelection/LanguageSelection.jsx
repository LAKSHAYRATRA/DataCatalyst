import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../../../lib/api.js';
import { PhoneCall, Radio, ChevronRight, AlertCircle, Globe, Languages, Sparkles } from 'lucide-react';

export default function LanguageSelection({ onLanguageSelect, callCount, callLimit }) {
    const navigate = useNavigate();
    const [selected, setSelected] = useState(null);
    const [languages, setLanguages] = useState([]);
    const [myApps, setMyApps] = useState([]);
    const [loading, setLoading] = useState(true);
    const isLimitReached = callCount >= callLimit;

    useEffect(() => {
        async function load() {
            try {
                const [langsRes, appsRes] = await Promise.all([
                    apiGet('/api/languages'),
                    apiGet('/api/language-applications/my'),
                ]);
                setLanguages(langsRes.languages || []);
                setMyApps(appsRes.applications || []);
            } catch (e) {
                console.error('Failed to load languages', e);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    function getStatus(code) {
        return myApps.find(a => a.languageCode === code && (a.applicationType === 'call' || !a.applicationType))?.status || null;
    }

    const approvedLangs = languages.filter(l => getStatus(l.code) === 'approved');

    const handleSelect = (lang) => {
        const isLangLimitReached = lang.maxHoursPerContributor !== undefined && lang.maxHoursPerContributor !== -1 && (lang.userDurationSeconds || 0) >= lang.maxHoursPerContributor * 3600;
        if (isLimitReached || isLangLimitReached) return;
        setSelected(lang.code);
        setTimeout(() => onLanguageSelect(lang.code), 300);
    };

    return (
        <div className="min-h-screen bg-neutral-950 text-white pt-16 md:pt-0 md:pl-64 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200 transition-colors duration-300">
            <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-8">
                <div className="max-w-4xl mx-auto py-8 md:py-16 space-y-8 animate-fade-in">
                    {/* Language Box Header */}
                    <div className="text-center space-y-3">
                        <div className="inline-flex p-3 rounded-2xl bg-gradient-to-br from-indigo-500 to-primary-600 text-white shadow-xl shadow-indigo-500/25 mb-1">
                            <Languages className="w-8 h-8" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
                            Select Call Language
                        </h1>
                        <p className="text-sm text-neutral-400 max-w-lg mx-auto leading-relaxed">
                            Choose an approved language project below to connect with a contributor for a live 2-person voice call.
                        </p>
                        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-neutral-900/90 border border-neutral-800 text-xs font-semibold text-neutral-300 shadow-inner">
                            <span className="text-neutral-400">Daily Calls:</span>
                            <span className={`font-bold ${isLimitReached ? 'text-rose-400' : 'text-indigo-400'}`}>
                                {callCount}/{callLimit}
                            </span>
                            {isLimitReached && (
                                <span className="text-[10px] uppercase font-bold text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded-full border border-rose-800/40">
                                    Limit Reached
                                </span>
                            )}
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
                            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
                            <p className="text-sm font-bold">Loading Approved Languages...</p>
                        </div>
                    ) : approvedLangs.length === 0 ? (
                        <div className="text-center py-16 border border-dashed border-neutral-800 rounded-3xl bg-neutral-900/40 p-8 space-y-4 max-w-xl mx-auto shadow-2xl">
                            <div className="w-16 h-16 bg-neutral-800/80 rounded-2xl flex items-center justify-center mx-auto text-indigo-400 border border-neutral-700">
                                <PhoneCall className="w-8 h-8" />
                            </div>
                            <h3 className="text-lg font-bold text-neutral-200">No Approved Call Languages</h3>
                            <p className="text-xs text-neutral-400 max-w-sm mx-auto leading-relaxed">
                                You have not been approved for any live call languages yet. Submit a voice sample under Project Apply in the sidebar to get started.
                            </p>
                            <button 
                                onClick={() => navigate('/language-apply?type=call')}
                                className="px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/25 transition-all inline-flex items-center gap-2 cursor-pointer"
                            >
                                <span>Apply for Languages</span>
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                            {approvedLangs.map((lang) => {
                                const isLangLimitReached = lang.maxHoursPerContributor !== undefined && lang.maxHoursPerContributor !== -1 && (lang.userDurationSeconds || 0) >= lang.maxHoursPerContributor * 3600;
                                const isBlocked = isLimitReached || isLangLimitReached;

                                return (
                                    <div
                                        key={lang._id || lang.code}
                                        className={`group relative bg-neutral-900/90 border border-neutral-800 hover:border-indigo-500/80 rounded-3xl p-6 shadow-xl hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-300 flex flex-col justify-between overflow-hidden ${
                                            isBlocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                                        } ${selected === lang.code ? 'ring-4 ring-indigo-500 scale-[1.02]' : ''}`}
                                        onClick={() => !isBlocked && handleSelect(lang)}
                                    >
                                        {/* Glow Accent */}
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all pointer-events-none" />

                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div className="p-2.5 rounded-2xl bg-indigo-950/60 border border-indigo-800/40 text-indigo-400">
                                                    <Radio className="w-5 h-5" />
                                                </div>
                                                <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full ${
                                                    isBlocked 
                                                        ? 'bg-neutral-800 text-neutral-400 border border-neutral-700' 
                                                        : 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                                                }`}>
                                                    {isLangLimitReached ? 'Hourly Limit' : isLimitReached ? 'Daily Limit' : 'Active'}
                                                </span>
                                            </div>

                                            <div>
                                                <h3 className="text-xl font-black text-white group-hover:text-indigo-300 transition-colors capitalize">
                                                    {lang.name}
                                                </h3>
                                                {lang.hourlyPayout !== undefined && (
                                                    <p className="text-sm font-extrabold text-emerald-400 mt-1">
                                                        ${Number(lang.hourlyPayout || 0).toFixed(2)}/hr
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Action Button */}
                                        <button
                                            disabled={isBlocked}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleSelect(lang);
                                            }}
                                            className={`w-full py-3 rounded-2xl font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2 mt-6 ${
                                                isBlocked
                                                    ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700'
                                                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/25 cursor-pointer'
                                            }`}
                                        >
                                            <span>{isLangLimitReached ? 'Language Limit Reached' : isLimitReached ? 'Daily Limit Reached' : 'Open / Join Call'}</span>
                                            {!isBlocked && <ChevronRight className="w-4 h-4" />}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
