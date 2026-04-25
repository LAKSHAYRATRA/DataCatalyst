import React, { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { clearToken, getUserInfo } from "../lib/auth.js";
import { motion } from "framer-motion";
import { LayoutDashboard, PhoneCall, Wallet, LogOut, Menu, X, Mic2 } from "lucide-react";

function BrandLogo({ className = "" }) {
  return (
    <img src="/logo.png" alt="Voclara Logo" className={`${className} object-contain`} />
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
    <div className="flex items-center justify-between px-3 py-2 mb-4 bg-neutral-100 dark:bg-neutral-800 rounded-xl">
      <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400">Rainbow Cursor</span>
      <button 
        onClick={() => {
          const next = !enabled;
          localStorage.setItem("rainbowCursorEnabled", next ? "true" : "false");
          window.dispatchEvent(new Event("cursorToggle"));
        }}
        className={`w-10 h-5 rounded-full relative transition-colors ${enabled ? 'bg-primary-500' : 'bg-neutral-300 dark:bg-neutral-600'}`}
      >
        <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${enabled ? 'translate-x-5' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

export default function Nav({ disabled = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [userInfo, setUserInfo] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const info = getUserInfo();
    setUserInfo(info);
  }, []);

  const isActive = (path) => location.pathname === path;

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLinkClick = (e) => {
    if (disabled) {
      e.preventDefault();
      alert("Please end the current call before navigating.");
    }
  };

  return (
    <>
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800 shadow-sm z-50 flex items-center justify-between px-4 transition-colors duration-300">
        <div className="flex items-center space-x-2">
          <BrandLogo className="h-8 w-10 shrink-0" />
          <span className="text-xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
            Voclara
          </span>
        </div>

        {/* Hamburger Button */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="md:hidden fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Desktop: always visible, Mobile: slide-in */}
      <nav className={`
        fixed left-0 h-screen w-72 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl border-r border-neutral-200 dark:border-neutral-800 shadow-2xl md:shadow-none z-50 flex flex-col transition-all duration-300 ease-spring
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
        top-0
      `}>
        {/* Logo & Brand */}
        <div className="p-8 border-b border-neutral-100 dark:border-neutral-800">
          <Link to="/" className="flex items-center space-x-3 group">
            <motion.div 
              whileHover={!disabled ? { scale: 1.05, rotate: -5 } : {}}
              className="bg-primary-50 dark:bg-primary-900/30 p-2 rounded-xl"
            >
              <BrandLogo className="h-10 w-12 shrink-0 drop-shadow-md" />
            </motion.div>
            <span className="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
              Voclara
            </span>
          </Link>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 px-4 py-8 space-y-2 overflow-y-auto custom-scrollbar">
          <div className="text-xs font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mb-6 px-4">Menu</div>

          <Link
            to="/dashboard"
            onClick={handleLinkClick}
            className={`flex items-center space-x-4 px-4 py-4 rounded-2xl text-sm font-bold transition-all duration-300 group ${isActive("/dashboard")
              ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-inner"
              : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-neutral-200"
              } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
          >
            <LayoutDashboard className={`w-5 h-5 ${isActive("/dashboard") ? "text-primary-600 dark:text-primary-400" : "group-hover:text-primary-500 transition-colors"}`} />
            <span>Dashboard</span>
          </Link>

          <Link
            to="/call"
            onClick={handleLinkClick}
            className={`flex items-center space-x-4 px-4 py-4 rounded-2xl text-sm font-bold transition-all duration-300 group ${isActive("/call")
              ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-inner"
              : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-neutral-200"
              } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
          >
            <PhoneCall className={`w-5 h-5 ${isActive("/call") ? "text-primary-600 dark:text-primary-400" : "group-hover:text-primary-500 transition-colors"}`} />
            <span>Active Call</span>
            {disabled && <span className="ml-auto text-[10px] bg-error-100 dark:bg-error-900/50 text-error-600 dark:text-error-400 px-2 py-1 rounded-full uppercase tracking-wider animate-pulse">In Call</span>}
          </Link>

          {/* Premium High-Priority Link for Phrase Studio */}
          <Link
            to="/phrases"
            onClick={handleLinkClick}
            className={`relative overflow-hidden flex items-center space-x-4 px-4 py-4 rounded-2xl text-sm font-bold transition-all duration-300 group ${isActive("/phrases")
              ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-lg shadow-primary-500/30"
              : "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/40 border border-primary-100 dark:border-primary-800/50"
              } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
          >
            <motion.div 
              animate={isActive("/phrases") ? {} : { rotate: [0, 5, -5, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            >
              <Mic2 className={`w-5 h-5 ${isActive("/phrases") ? "text-white" : "text-primary-600 dark:text-primary-400"}`} />
            </motion.div>
            <span className="flex-1">Phrase Studio</span>
            {!isActive("/phrases") && (
              <span className="absolute right-0 top-0 bottom-0 flex items-center pr-4">
                <span className="flex h-2 w-2 rounded-full bg-primary-500 blur-[2px] absolute"></span>
                <span className="flex h-2 w-2 rounded-full bg-primary-400"></span>
              </span>
            )}
            
            {/* Shimmer Effect */}
            {isActive("/phrases") && (
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-shimmer" />
            )}
          </Link>

          <div className="my-6 !mt-8">
             <div className="h-px bg-neutral-100 dark:bg-neutral-800 w-full" />
          </div>

          <Link
            to="/payouts"
            onClick={handleLinkClick}
            className={`flex items-center space-x-4 px-4 py-4 rounded-2xl text-sm font-bold transition-all duration-300 group ${isActive("/payouts")
              ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-inner"
              : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-neutral-200"
              } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
          >
            <Wallet className={`w-5 h-5 ${isActive("/payouts") ? "text-success-600 dark:text-success-400" : "group-hover:text-success-500 transition-colors"}`} />
            <span>Earnings</span>
          </Link>
        </div>

        {/* User Info & Logout */}
        <div className="p-6 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 backdrop-blur-md">
          <div className="mb-4">
            <div className="text-xs font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mb-3 px-2">Account</div>
            {userInfo && (
              <div className="flex items-center space-x-3 px-4 py-3 rounded-2xl bg-white dark:bg-neutral-800 shadow-sm border border-neutral-100 dark:border-neutral-700 mb-4 transition-colors">
                <div className="w-10 h-10 bg-gradient-primary rounded-full flex items-center justify-center text-white text-sm font-bold shadow-inner shrink-0">
                  {userInfo.firstname?.[0]}{userInfo.lastname?.[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-neutral-900 dark:text-white truncate">
                    {userInfo.firstname} {userInfo.lastname}
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 font-medium truncate mt-0.5" title={userInfo.email}>
                    {userInfo.email}
                  </div>
                </div>
              </div>
            )}
            <CursorToggle />
          </div>

          <button
            onClick={async () => {
              if (disabled) {
                alert("Please end the current call before signing out.");
                return;
              }
              await clearToken();
              navigate("/login");
            }}
            disabled={disabled}
            className={`w-full flex items-center justify-center space-x-2 px-4 py-3.5 rounded-xl border-2 text-sm font-bold transition-all duration-300 group ${disabled
              ? 'opacity-50 cursor-not-allowed bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-400'
              : 'bg-transparent border-error-100 dark:border-error-900/50 text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-900/20 hover:border-error-200 dark:hover:border-error-800'
              }`}
          >
            <LogOut className={`w-4 h-4 transition-transform ${!disabled && 'group-hover:-translate-x-1'}`} />
            <span>Sign Out</span>
          </button>
        </div>
      </nav>
    </>
  );
}
