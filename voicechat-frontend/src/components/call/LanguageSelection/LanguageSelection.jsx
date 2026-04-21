import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../../../lib/api.js';

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
        if (isLimitReached) return;
        setSelected(lang.code);
        setTimeout(() => onLanguageSelect(lang.code), 300);
    };

    return (
        <div className="min-h-screen bg-gradient-subtle pt-16 md:pt-0 md:pl-64">
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12">
                {/* Header */}
                <div className="mb-8 animate-fade-in">
                    <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-2">Select Language</h1>
                    <p className="text-neutral-600">
                        You've made <span className="font-bold text-primary-600">{callCount}/{callLimit}</span> calls today
                    </p>
                    {isLimitReached && (
                        <div className="mt-3 bg-error-50 border border-error-200 text-error-700 px-4 py-2 rounded-lg inline-block text-sm">
                            Daily limit reached! Try again tomorrow.
                        </div>
                    )}
                </div>

                {loading ? (
                    <div className="text-center text-neutral-400 py-12">Loading your approved languages…</div>
                ) : (
                    <>
                        {/* Approved language cards */}
                        {approvedLangs.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 animate-slide-up">
                                {approvedLangs.map(lang => (
                                    <div
                                        key={lang.code}
                                        onClick={() => handleSelect(lang)}
                                        className={`card hover-lift cursor-pointer transition-all text-center ${isLimitReached ? 'opacity-50 cursor-not-allowed' : ''} ${selected === lang.code ? 'ring-4 ring-primary-500 scale-105' : ''}`}
                                    >
                                        <div className="py-10">
                                            <div className={`w-28 h-28 mx-auto mb-6 bg-gradient-to-br ${COLOR_MAP[lang.code] || 'from-primary-400 to-primary-600'} rounded-full flex items-center justify-center shadow-xl overflow-hidden border-4 border-white`}>
                                                {FLAG_MAP[lang.code]
                                                    ? <img src={FLAG_MAP[lang.code]} alt={lang.name} className="w-20 h-auto object-contain" />
                                                    : <span className="text-4xl text-white font-bold">{lang.name[0]}</span>}
                                            </div>
                                            <h2 className="text-3xl font-bold text-neutral-900 mb-2">{lang.name}</h2>
                                            <button
                                                disabled={isLimitReached}
                                                className={`btn-primary px-8 py-3 text-lg font-semibold mt-2 ${isLimitReached ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                                {isLimitReached ? 'Limit Reached' : 'Join a Call'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="card text-center py-12 animate-fade-in">
                                <p className="text-neutral-500 text-lg mb-2">You have no approved languages yet.</p>
                                <p className="text-neutral-400 text-sm">Apply for a language below to start calling.</p>
                            </div>
                        )}




                        {/* Apply button */}
                        <div className="mt-8 text-center animate-fade-in">
                            <button
                                onClick={() => navigate('/language-apply')}
                                className="btn btn-secondary px-6 py-3 font-semibold"
                            >
                                + Apply for New Language
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
