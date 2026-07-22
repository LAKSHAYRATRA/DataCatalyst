import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../../../lib/api.js';
import { PhoneCall } from 'lucide-react';

const FLAG_MAP = {
    hindi: 'https://flagcdn.com/w160/in.png',
    english: 'https://flagcdn.com/w160/gb.png',
};
const COLOR_MAP = {
    hindi: 'from-orange-400 to-orange-600',
    english: 'from-blue-400 to-blue-600',
};

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
        return myApps.find(a => a.languageCode === code)?.status || null;
    }

    const approvedLangs = languages.filter(l => getStatus(l.code) === 'approved');
    const otherLangs = languages.filter(l => getStatus(l.code) !== 'approved');

    const handleSelect = (lang) => {
        const isLangLimitReached = lang.maxHoursPerContributor !== undefined && lang.maxHoursPerContributor !== -1 && (lang.userDurationSeconds || 0) >= lang.maxHoursPerContributor * 3600;
        if (isLimitReached || isLangLimitReached) return;
        setSelected(lang.code);
        setTimeout(() => onLanguageSelect(lang.code), 300);
    };

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 pt-16 md:pt-0 md:pl-64 transition-colors duration-300">
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12">
                {/* Header */}
                <div className="mb-8 animate-fade-in">
                    <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-white mb-2">Select Language</h1>
                    <p className="text-neutral-600 dark:text-neutral-400">
                        You've made <span className="font-bold text-primary-600 dark:text-primary-400">{callCount}/{callLimit}</span> calls today
                    </p>
                    {isLimitReached && (
                        <div className="mt-3 bg-error-50 dark:bg-error-950/20 border border-error-200 dark:border-error-800 text-error-700 dark:text-error-400 px-4 py-2 rounded-lg inline-block text-sm transition-colors duration-300">
                            Daily limit reached! Try again tomorrow.
                        </div>
                    )}
                </div>

                {loading ? (
                    <div className="text-center text-neutral-400 dark:text-neutral-500 py-12">Loading your approved languages…</div>
                ) : (
                    <>
                        {/* Approved language cards */}
                        {approvedLangs.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 animate-slide-up">
                                {approvedLangs.map(lang => {
                                    const isLangLimitReached = lang.maxHoursPerContributor !== undefined && lang.maxHoursPerContributor !== -1 && (lang.userDurationSeconds || 0) >= lang.maxHoursPerContributor * 3600;
                                    const isBlocked = isLimitReached || isLangLimitReached;
                                    return (
                                        <div
                                            key={lang.code}
                                            onClick={() => handleSelect(lang)}
                                            className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-900 via-primary-900 to-indigo-950 text-white shadow-xl shadow-primary-900/20 border border-primary-800/50 hover-lift cursor-pointer transition-all text-left ${isBlocked ? 'opacity-50 cursor-not-allowed' : ''} ${selected === lang.code ? 'ring-4 ring-primary-500 scale-102' : ''}`}
                                        >
                                            {/* Background Deco */}
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500 rounded-full blur-[60px] opacity-20 pointer-events-none transform translate-x-1/2 -translate-y-1/2"></div>
                                            
                                            <div className="py-6 px-8 relative z-10 flex flex-col items-center justify-center gap-4">
                                                <h2 className="text-2xl font-extrabold text-white tracking-tight text-center">{lang.name}</h2>
                                                <button
                                                    disabled={isBlocked}
                                                    className={`bg-white text-primary-900 font-extrabold text-base px-8 py-3 rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:shadow-[0_0_30px_rgba(255,255,255,0.35)] transition-all ${isBlocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                >
                                                    {isLangLimitReached ? 'Language Limit Reached' : isLimitReached ? 'Limit Reached' : 'Join a Call'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-primary-900 to-indigo-950 text-white shadow-2xl shadow-primary-900/20 border border-primary-800/50 p-8 md:p-12 max-w-xl mx-auto mt-6 text-center animate-fade-in flex flex-col items-center justify-center">
                                {/* Background Deco */}
                                <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500 rounded-full blur-[60px] opacity-20 pointer-events-none transform translate-x-1/2 -translate-y-1/2"></div>
                                
                                <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center mb-6 border-4 border-white/20 text-white shadow-inner">
                                    <PhoneCall className="w-10 h-10" />
                                </div>
                                <h2 className="text-2xl font-extrabold text-white mb-3">No Approved Call Languages</h2>
                                <p className="text-primary-100/80 max-w-sm leading-relaxed mb-8 text-center px-6">
                                    You have not applied to any call languages yet. Apply for a language under Project Apply in the sidebar to start joining calls.
                                </p>
                                <button 
                                    onClick={() => navigate('/language-apply?type=call')}
                                    className="bg-white text-primary-900 font-extrabold text-base px-8 py-3.5 rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.25)] hover:shadow-[0_0_35px_rgba(255,255,255,0.4)] transition-all"
                                >
                                    Project Apply
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
