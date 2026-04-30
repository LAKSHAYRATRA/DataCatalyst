import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clearToken, getUserInfo } from '../lib/auth.js';

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
                    <div className="flex items-center space-x-1 px-6 h-16 border-b border-neutral-700">
                        <img src="/logo.png" alt="Voclara Logo" className="w-12 h-12 object-contain" />
                        <span className="text-lg font-bold text-white">Voclara Admin</span>
                    </div>

                    {/* Navigation Links */}
                    <nav className="flex-1 overflow-y-auto py-6 px-3">
                        <div className="space-y-1">
                            {/* Admin-only links */}
                            {isAdmin && (<>
                                <Link to="/admin/dashboard" onClick={() => setIsMobileMenuOpen(false)}
                                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${isActive('/admin/dashboard') ? 'bg-neutral-700 text-warning-400 shadow-sm' : 'text-neutral-300 hover:bg-neutral-700/50 hover:text-white'}`}>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                                    <span>Dashboard</span>
                                </Link>
                                <Link to="/admin/calls" onClick={() => setIsMobileMenuOpen(false)}
                                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${isActive('/admin/calls') ? 'bg-neutral-700 text-warning-400 shadow-sm' : 'text-neutral-300 hover:bg-neutral-700/50 hover:text-white'}`}>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                    <span>Calls</span>
                                </Link>
                                <Link to="/admin/topics" onClick={() => setIsMobileMenuOpen(false)}
                                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${isActive('/admin/topics') ? 'bg-neutral-700 text-warning-400 shadow-sm' : 'text-neutral-300 hover:bg-neutral-700/50 hover:text-white'}`}>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                                    <span>Topics</span>
                                </Link>
                                <Link to="/admin/users" onClick={() => setIsMobileMenuOpen(false)}
                                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${isActive('/admin/users') ? 'bg-neutral-700 text-warning-400 shadow-sm' : 'text-neutral-300 hover:bg-neutral-700/50 hover:text-white'}`}>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                    <span>Users</span>
                                </Link>
                                <Link to="/admin/payouts" onClick={() => setIsMobileMenuOpen(false)}
                                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${isActive('/admin/payouts') || location.pathname.startsWith('/admin/payouts/') ? 'bg-neutral-700 text-warning-400 shadow-sm' : 'text-neutral-300 hover:bg-neutral-700/50 hover:text-white'}`}>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-3.314 0-6 1.343-6 3s2.686 3 6 3 6 1.343 6 3-2.686 3-6 3m0-12c3.314 0 6 1.343 6 3m-6-3V5m0 3v12m0 0v-3m0 3c-3.314 0-6-1.343-6-3" /></svg>
                                    <span>Payouts</span>
                                </Link>
                                <Link to="/admin/phrases" onClick={() => setIsMobileMenuOpen(false)}
                                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${isActive('/admin/phrases') ? 'bg-neutral-700 text-warning-400 shadow-sm' : 'text-neutral-300 hover:bg-neutral-700/50 hover:text-white'}`}>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                    <span>Phrase Workloads</span>
                                </Link>
                                <Link to="/admin/media" onClick={() => setIsMobileMenuOpen(false)}
                                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${isActive('/admin/media') ? 'bg-neutral-700 text-warning-400 shadow-sm' : 'text-neutral-300 hover:bg-neutral-700/50 hover:text-white'}`}>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
                                    <span>S3 Media Library</span>
                                </Link>
                                <Link to="/admin/projects" onClick={() => setIsMobileMenuOpen(false)}
                                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${isActive('/admin/projects') ? 'bg-neutral-700 text-warning-400 shadow-sm' : 'text-neutral-300 hover:bg-neutral-700/50 hover:text-white'}`}>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                                    <span>Project Payrates</span>
                                </Link>
                                {/* Divider before Q/A */}
                                <div className="h-px bg-neutral-700 my-2" />
                            </>)}

                            {/* Q/A Review — visible to both admin and QA users */}
                            {(isAdmin || isQA) && (<>
                                <Link to="/admin/qa" onClick={() => setIsMobileMenuOpen(false)}
                                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${isActive('/admin/qa') ? 'bg-neutral-700 text-warning-400 shadow-sm' : 'text-neutral-300 hover:bg-neutral-700/50 hover:text-white'}`}>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <span>Q/A Review (Calls)</span>
                                </Link>
                                <Link to="/admin/qaphrase" onClick={() => setIsMobileMenuOpen(false)}
                                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${isActive('/admin/qaphrase') ? 'bg-neutral-700 text-warning-400 shadow-sm' : 'text-neutral-300 hover:bg-neutral-700/50 hover:text-white'}`}>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <span>Q/A Review (Phrases)</span>
                                </Link>
                            </>)}

                            {/* Language links */}
                            {(isAdmin || isQA) && (<>
                                <div className="h-px bg-neutral-700 my-2" />
                                {isAdmin && (
                                    <Link to="/admin/languages" onClick={() => setIsMobileMenuOpen(false)}
                                        className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${isActive('/admin/languages') ? 'bg-neutral-700 text-warning-400 shadow-sm' : 'text-neutral-300 hover:bg-neutral-700/50 hover:text-white'}`}>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" /></svg>
                                        <span>Languages</span>
                                    </Link>
                                )}
                                <Link to="/admin/language-apps" onClick={() => setIsMobileMenuOpen(false)}
                                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${isActive('/admin/language-apps') ? 'bg-neutral-700 text-warning-400 shadow-sm' : 'text-neutral-300 hover:bg-neutral-700/50 hover:text-white'}`}>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    <span>Language Apps</span>
                                </Link>
                            </>)}
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
