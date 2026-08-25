import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clearToken, getUserInfo } from '../lib/auth.js';
import { RotateCw } from 'lucide-react';

function RefreshButton({ className = "" }) {
  const [isSpinning, setIsSpinning] = useState(false);
  const isElectronApp = typeof window !== 'undefined' && Boolean(window.voclaraRecorder?.isNative || navigator.userAgent.includes("Electron"));

  if (!isElectronApp) return null;

  const handleRefresh = () => {
    setIsSpinning(true);
    setTimeout(() => {
      window.location.reload();
    }, 150);
  };

  return (
    <button
      onClick={handleRefresh}
      title="Refresh App (Ctrl+R)"
      aria-label="Refresh App"
      className={`p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-700 transition-all duration-200 group ${className}`}
    >
      <RotateCw className={`w-4 h-4 transition-transform duration-500 ${isSpinning ? 'animate-spin text-primary-400' : 'group-hover:rotate-180'}`} />
    </button>
  );
}

function CursorToggle() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem("rainbowCursorEnabled") === "true");

  useEffect(() => {
    const handleToggle = () => setEnabled(localStorage.getItem("rainbowCursorEnabled") === "true");
    window.addEventListener("cursorToggle", handleToggle);
    return () => window.removeEventListener("cursorToggle", handleToggle);
  }, []);

  return (
    <div className="flex items-center justify-between px-3 py-2 mt-3 bg-neutral-900/50 border border-neutral-700 rounded-xl">
      <span className="text-xs font-bold text-neutral-400">Rainbow Cursor</span>
      <button 
        onClick={() => {
          const next = !enabled;
          localStorage.setItem("rainbowCursorEnabled", next ? "true" : "false");
          window.dispatchEvent(new Event("cursorToggle"));
        }}
        className={`w-10 h-5 rounded-full relative transition-colors ${enabled ? 'bg-warning-500' : 'bg-neutral-600'}`}
      >
        <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${enabled ? 'translate-x-5' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

export default function AdminNav() {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const userInfo = getUserInfo();
    const isAdmin = userInfo?.isAdmin || false;
    const isQA = userInfo?.isQA || false;
    const displayName = `${userInfo?.firstname || ''} ${userInfo?.lastname || ''}`.trim() || userInfo?.username || 'Account';
    const qaLanguage = userInfo?.qaLanguageCode || userInfo?.qaLanguageCodes?.[0] || null;

    const isActive = (path) => location.pathname === path;

    const [openMenus, setOpenMenus] = useState({
        calls: false,
        transcription: false,
        users: false,
        phrases: false
    });

    useEffect(() => {
        const path = location.pathname;
        setOpenMenus({
            calls: ['/admin/calls', '/admin/topics', '/admin/qa', '/admin/qa-payments', '/admin/languages', '/admin/call-apps'].includes(path),
            transcription: ['/admin/segmentation', '/admin/transcription'].includes(path),
            users: ['/admin/users', '/admin/payouts', '/admin/finances', '/admin/pan-verification', '/admin/agreements'].some(p => path.startsWith(p)),
            phrases: ['/admin/qaphrase', '/admin/phrases', '/admin/language-apps', '/admin/projects', '/admin/companies', '/admin/phrases/downloads'].includes(path)
        });
    }, [location.pathname]);

    const toggleMenu = (menu) => {
        setOpenMenus(prev => ({
            ...prev,
            [menu]: !prev[menu]
        }));
    };

    const logout = () => {
        clearToken();
        navigate('/login');
        setIsMobileMenuOpen(false);
    };

    return (
        <>
            {/* Mobile Header */}
            <div className="md:hidden fixed top-0 left-0 right-0 bg-neutral-800 border-b border-neutral-700 shadow-lg z-50">
                <div className="flex items-center justify-between px-4 h-16">
                    <div className="flex items-center space-x-1">
                        <img src="/logo.png" alt="Voclara Logo" className="w-11 h-11 object-contain" />
                        <span className="text-lg font-bold text-white">Voclara Admin</span>
                        <RefreshButton className="ml-1" />
                    </div>

                    <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="p-2 rounded-lg text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors"
                        aria-label="Toggle menu"
                    >
                        {isMobileMenuOpen ? (
                            /* Close icon */
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        ) : (
                            /* Menu icon */
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
                            </svg>
                        )}
                    </button>
                </div>
            </div>

            {/* Overlay (mobile only) */}
            {isMobileMenuOpen && (
                <div
                    className="md:hidden fixed inset-0 bg-black/50 z-40"
                    onClick={() => setIsMobileMenuOpen(false)}
                ></div>
            )}

            {/* Sidebar */}
            <aside
                className={`
          fixed top-0 left-0 h-full w-64 bg-neutral-800 border-r border-neutral-700 shadow-xl z-50
          transform transition-transform duration-300 ease-in-out
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
        `}
            >
                <div className="flex flex-col h-full">
                    {/* Logo Section */}
                    <div className="flex items-center justify-between px-6 h-16 border-b border-neutral-700">
                        <div className="flex items-center space-x-1">
                            <img src="/logo.png" alt="Voclara Logo" className="w-12 h-12 object-contain" />
                            <span className="text-lg font-bold text-white">Voclara Admin</span>
                        </div>
                        <RefreshButton />
                    </div>

                    {/* Navigation Links */}
                    <nav className="flex-1 overflow-y-auto py-6 px-3">
                        <div className="space-y-2">
                            {/* Dashboard */}
                            {isAdmin && (
                                <Link to="/admin/dashboard" onClick={() => setIsMobileMenuOpen(false)}
                                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${isActive('/admin/dashboard') ? 'bg-neutral-700 text-warning-400 shadow-sm' : 'text-neutral-300 hover:bg-neutral-700/50 hover:text-white'}`}>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                                    <span>Dashboard</span>
                                </Link>
                            )}

                            {/* Calls Menu */}
                            {(isAdmin || isQA) && (
                                <div className="space-y-1">
                                    <button 
                                        onClick={() => toggleMenu('calls')}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold text-neutral-300 hover:bg-neutral-700/50 hover:text-white transition-all focus:outline-none"
                                    >
                                        <div className="flex items-center space-x-3">
                                            <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                            <span>Calls</span>
                                        </div>
                                        <svg className={`w-4 h-4 transform transition-transform duration-200 ${openMenus.calls ? 'rotate-180 text-warning-400' : 'text-neutral-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path>
                                        </svg>
                                    </button>
                                    {openMenus.calls && (
                                        <div className="mt-1 ml-4 pl-3 border-l border-neutral-700 space-y-1">
                                            {isAdmin && (
                                                <Link to="/admin/calls" onClick={() => setIsMobileMenuOpen(false)}
                                                    className={`flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all ${isActive('/admin/calls') ? 'bg-neutral-700 text-warning-400' : 'text-neutral-400 hover:text-white'}`}>
                                                    <span>Calls Completed</span>
                                                </Link>
                                            )}
                                            {isAdmin && (
                                                <Link to="/admin/topics" onClick={() => setIsMobileMenuOpen(false)}
                                                    className={`flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all ${isActive('/admin/topics') ? 'bg-neutral-700 text-warning-400' : 'text-neutral-400 hover:text-white'}`}>
                                                    <span>Topic</span>
                                                </Link>
                                            )}
                                            <Link to="/admin/qa" onClick={() => setIsMobileMenuOpen(false)}
                                                className={`flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all ${isActive('/admin/qa') ? 'bg-neutral-700 text-warning-400' : 'text-neutral-400 hover:text-white'}`}>
                                                <span>Call QA Review</span>
                                            </Link>
                                            {isAdmin && (
                                                <Link to="/admin/languages" onClick={() => setIsMobileMenuOpen(false)}
                                                    className={`flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all ${isActive('/admin/languages') ? 'bg-neutral-700 text-warning-400' : 'text-neutral-400 hover:text-white'}`}>
                                                    <span>Call Languages</span>
                                                </Link>
                                            )}
                                            {isAdmin && (
                                                <Link to="/admin/call-apps" onClick={() => setIsMobileMenuOpen(false)}
                                                    className={`flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all ${isActive('/admin/call-apps') ? 'bg-neutral-700 text-warning-400' : 'text-neutral-400 hover:text-white'}`}>
                                                    <span>Call Apps</span>
                                                </Link>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Transcription Main Heading Menu (For Admin & QA) */}
                            {(isAdmin || isQA) && (
                                <div className="space-y-1">
                                    <button 
                                        onClick={() => toggleMenu('transcription')}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold text-neutral-300 hover:bg-neutral-700/50 hover:text-white transition-all focus:outline-none"
                                    >
                                        <div className="flex items-center space-x-3">
                                            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                                            </svg>
                                            <span>Transcription</span>
                                        </div>
                                        <svg className={`w-4 h-4 transform transition-transform duration-200 ${openMenus.transcription ? 'rotate-180 text-warning-400' : 'text-neutral-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path>
                                        </svg>
                                    </button>
                                    {openMenus.transcription && (
                                        <div className="mt-1 ml-4 pl-3 border-l border-neutral-700 space-y-1">
                                            <Link to="/admin/segmentation" onClick={() => setIsMobileMenuOpen(false)}
                                                className={`flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all ${isActive('/admin/segmentation') ? 'bg-neutral-700 text-warning-400' : 'text-neutral-400 hover:text-white'}`}>
                                                <span>Segmentation</span>
                                            </Link>
                                            <Link to="/admin/transcription" onClick={() => setIsMobileMenuOpen(false)}
                                                className={`flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all ${isActive('/admin/transcription') ? 'bg-neutral-700 text-warning-400' : 'text-neutral-400 hover:text-white'}`}>
                                                <span>Transcription</span>
                                            </Link>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* User Management Menu */}
                            {isAdmin && (
                                <div className="space-y-1">
                                    <button 
                                        onClick={() => toggleMenu('users')}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold text-neutral-300 hover:bg-neutral-700/50 hover:text-white transition-all focus:outline-none"
                                    >
                                        <div className="flex items-center space-x-3">
                                            <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                            <span>User Management</span>
                                        </div>
                                        <svg className={`w-4 h-4 transform transition-transform duration-200 ${openMenus.users ? 'rotate-180 text-warning-400' : 'text-neutral-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path>
                                        </svg>
                                    </button>
                                    {openMenus.users && (
                                        <div className="mt-1 ml-4 pl-3 border-l border-neutral-700 space-y-1 animate-fade-in">
                                            <Link to="/admin/users" onClick={() => setIsMobileMenuOpen(false)}
                                                className={`flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all ${isActive('/admin/users') ? 'bg-neutral-700 text-warning-400' : 'text-neutral-400 hover:text-white'}`}>
                                                <span>Users</span>
                                            </Link>
                                            <Link to="/admin/payouts" onClick={() => setIsMobileMenuOpen(false)}
                                                className={`flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all ${isActive('/admin/payouts') && !location.pathname.startsWith('/admin/payouts/finances') ? 'bg-neutral-700 text-warning-400' : 'text-neutral-400 hover:text-white'}`}>
                                                <span>Payouts</span>
                                            </Link>
                                            <Link to="/admin/finances" onClick={() => setIsMobileMenuOpen(false)}
                                                className={`flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all ${isActive('/admin/finances') ? 'bg-neutral-700 text-warning-400' : 'text-neutral-400 hover:text-white'}`}>
                                                <span>Finances</span>
                                            </Link>
                                            <Link to="/admin/pan-verification" onClick={() => setIsMobileMenuOpen(false)}
                                                className={`flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all ${isActive('/admin/pan-verification') ? 'bg-neutral-700 text-warning-400' : 'text-neutral-400 hover:text-white'}`}>
                                                <span>PAN Verification</span>
                                            </Link>
                                            <Link to="/admin/agreements" onClick={() => setIsMobileMenuOpen(false)}
                                                className={`flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all ${isActive('/admin/agreements') ? 'bg-neutral-700 text-warning-400' : 'text-neutral-400 hover:text-white'}`}>
                                                <span>Agreements</span>
                                            </Link>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Phrases Menu */}
                            {(isAdmin || isQA) && (
                                <div className="space-y-1">
                                    <button 
                                        onClick={() => toggleMenu('phrases')}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold text-neutral-300 hover:bg-neutral-700/50 hover:text-white transition-all focus:outline-none"
                                    >
                                        <div className="flex items-center space-x-3">
                                            <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                            <span>Phrases</span>
                                        </div>
                                        <svg className={`w-4 h-4 transform transition-transform duration-200 ${openMenus.phrases ? 'rotate-180 text-warning-400' : 'text-neutral-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path>
                                        </svg>
                                    </button>
                                    {openMenus.phrases && (
                                        <div className="mt-1 ml-4 pl-3 border-l border-neutral-700 space-y-1 animate-fade-in">
                                            <Link to="/admin/qaphrase" onClick={() => setIsMobileMenuOpen(false)}
                                                className={`flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all ${isActive('/admin/qaphrase') ? 'bg-neutral-700 text-warning-400' : 'text-neutral-400 hover:text-white'}`}>
                                                <span>Phrases Review</span>
                                            </Link>
                                            {isAdmin && (
                                                <Link to="/admin/phrases" onClick={() => setIsMobileMenuOpen(false)}
                                                    className={`flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all ${isActive('/admin/phrases') ? 'bg-neutral-700 text-warning-400' : 'text-neutral-400 hover:text-white'}`}>
                                                    <span>Phrase Workloads</span>
                                                </Link>
                                            )}
                                            {isAdmin && (
                                                <Link to="/admin/language-apps" onClick={() => setIsMobileMenuOpen(false)}
                                                    className={`flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all ${isActive('/admin/language-apps') ? 'bg-neutral-700 text-warning-400' : 'text-neutral-400 hover:text-white'}`}>
                                                    <span>Phrase Apps</span>
                                                </Link>
                                            )}

                                            {isAdmin && (
                                                <Link to="/admin/companies" onClick={() => setIsMobileMenuOpen(false)}
                                                    className={`flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all ${isActive('/admin/companies') ? 'bg-neutral-700 text-warning-400' : 'text-neutral-400 hover:text-white'}`}>
                                                    <span>Company Phrase Configs</span>
                                                </Link>
                                            )}
                                            {isAdmin && (
                                                <Link to="/admin/phrases/downloads" onClick={() => setIsMobileMenuOpen(false)}
                                                    className={`flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all ${isActive('/admin/phrases/downloads') ? 'bg-neutral-700 text-warning-400' : 'text-neutral-400 hover:text-white'}`}>
                                                    <span>Phrase Downloads</span>
                                                </Link>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Standalone QA Payments Tab (For QA accounts only) */}
                            {(isQA && !isAdmin) && (
                                <Link to="/admin/qa-payments" onClick={() => setIsMobileMenuOpen(false)}
                                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${isActive('/admin/qa-payments') ? 'bg-neutral-700 text-warning-400 shadow-sm' : 'text-neutral-300 hover:bg-neutral-700/50 hover:text-white'}`}>
                                    <svg className="w-5 h-5 text-warning-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>QA Payments</span>
                                </Link>
                            )}

                            {/* QA Flags / Audit Notes Tab (For QA accounts only) */}
                            {(isQA && !isAdmin) && (
                                <Link to="/admin/qa-flags" onClick={() => setIsMobileMenuOpen(false)}
                                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${isActive('/admin/qa-flags') ? 'bg-neutral-700 text-warning-400 shadow-sm' : 'text-neutral-300 hover:bg-neutral-700/50 hover:text-white'}`}>
                                    <svg className="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                                    </svg>
                                    <span>Flags</span>
                                </Link>
                            )}

                            {/* Ambiguity & Audit Sampling Tab (Admin only) */}
                            {isAdmin && (
                                <Link to="/admin/ambiguity" onClick={() => setIsMobileMenuOpen(false)}
                                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${isActive('/admin/ambiguity') ? 'bg-neutral-700 text-warning-400 shadow-sm' : 'text-neutral-300 hover:bg-neutral-700/50 hover:text-white'}`}>
                                    <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>Ambiguity & Audits</span>
                                </Link>
                            )}

                            {/* QA Payrate Display Box */}
                            {isQA && (
                                <div className="mt-3 p-3 bg-neutral-900/60 border border-neutral-700/70 rounded-xl space-y-2">
                                    <div className="flex items-center gap-2 text-xs font-medium text-neutral-300">
                                        <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                        </svg>
                                        <span>Per Call Payrate: <strong className="text-emerald-400 font-mono font-bold">{userInfo?.perCallPayrate !== undefined ? userInfo.perCallPayrate : 0} $</strong></span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs font-medium text-neutral-300">
                                        <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                                        </svg>
                                        <span>Hourly Phrase Payrate: <strong className="text-emerald-400 font-mono font-bold">{userInfo?.hourlyPhrasePayrate !== undefined ? userInfo.hourlyPhrasePayrate : 0} $</strong></span>
                                    </div>
                                </div>
                            )}

                            {/* Standalone S3 Media Library Link */}
                            {isAdmin && (
                                <Link to="/admin/media" onClick={() => setIsMobileMenuOpen(false)}
                                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${isActive('/admin/media') ? 'bg-neutral-700 text-warning-400 shadow-sm' : 'text-neutral-300 hover:bg-neutral-700/50 hover:text-white'}`}>
                                    <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
                                    <span>S3 Media Library</span>
                                </Link>
                            )}
                        </div>
                    </nav>

                    {/* Account Footer */}
                    <div className="p-4 border-t border-neutral-700 space-y-4">
                        <div className="rounded-xl border border-neutral-700 bg-neutral-900/50 p-3">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-full bg-warning-500/20 text-warning-300 flex items-center justify-center text-sm font-bold">
                                    {(userInfo?.firstname?.[0] || userInfo?.email?.[0] || "A").toUpperCase()}
                                    {(userInfo?.lastname?.[0] || "").toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold text-white truncate">{displayName}</div>
                                    <div className="text-xs text-neutral-400 truncate" title={userInfo?.email || ""}>{userInfo?.email || "-"}</div>
                                </div>
                            </div>
                            {isQA && qaLanguage && (
                                <div className="mt-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs">
                                    <span className="text-cyan-200">Language:</span>{" "}
                                    <span className="font-semibold text-cyan-50 capitalize">{qaLanguage}</span>
                                </div>
                            )}
                            <CursorToggle />
                        </div>
                        <button
                            onClick={logout}
                            className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-neutral-700 text-neutral-300 hover:bg-neutral-600 hover:text-white rounded-lg text-sm font-medium transition-all"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                            </svg>
                            <span>Logout</span>
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
}
