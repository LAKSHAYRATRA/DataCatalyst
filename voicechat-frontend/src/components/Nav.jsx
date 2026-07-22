import React, { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { clearToken, getUserInfo } from "../lib/auth.js";
import { motion } from "framer-motion";
import { LayoutDashboard, PhoneCall, Wallet, LogOut, Menu, X, Mic2, FolderGit2 } from "lucide-react";

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
        <div className="p-5 md:py-6 md:px-5 border-b border-neutral-100 dark:border-neutral-800">
          <Link to="/" className="flex items-center space-x-2.5 group">
            <motion.div 
              whileHover={!disabled ? { scale: 1.05, rotate: -5 } : {}}
              className="bg-primary-50 dark:bg-primary-900/30 p-1.5 rounded-lg"
            >
              <BrandLogo className="h-8 w-10 shrink-0 drop-shadow-md" />
            </motion.div>
            <span className="text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
              Voclara
            </span>
          </Link>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 px-4 py-4 md:py-5 space-y-1.5 overflow-y-auto custom-scrollbar">
          <div className="text-xs font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mb-3 px-4">Menu</div>

          <Link
            to="/dashboard"
            onClick={handleLinkClick}
            className={`flex items-center space-x-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 group ${isActive("/dashboard")
              ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-inner"
              : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-neutral-200"
              } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
          >
            <LayoutDashboard className={`w-4 h-4 ${isActive("/dashboard") ? "text-primary-600 dark:text-primary-400" : "group-hover:text-primary-500 transition-colors"}`} />
            <span>Dashboard</span>
          </Link>

          <Link
            to="/language-apply"
            onClick={handleLinkClick}
            className={`flex items-center space-x-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 group ${isActive("/language-apply")
              ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-inner"
              : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-neutral-200"
              } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
          >
            <FolderGit2 className={`w-4 h-4 ${isActive("/language-apply") ? "text-primary-600 dark:text-primary-400" : "group-hover:text-primary-500 transition-colors"}`} />
            <span>Project Apply</span>
          </Link>

          <Link
            to="/call"
            onClick={handleLinkClick}
            className={`flex items-center space-x-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 group ${isActive("/call")
              ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-inner"
              : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-neutral-200"
              } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
          >
            <PhoneCall className={`w-4 h-4 ${isActive("/call") ? "text-primary-600 dark:text-primary-400" : "group-hover:text-primary-500 transition-colors"}`} />
            <span>Active Call</span>
            {disabled && <span className="ml-auto text-[10px] bg-error-100 dark:bg-error-900/50 text-error-600 dark:text-error-400 px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">In Call</span>}
          </Link>

          {/* Premium High-Priority Link for Phrase Studio */}
          <Link
            to="/phrases"
            onClick={handleLinkClick}
            className={`relative overflow-hidden flex items-center space-x-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 group ${isActive("/phrases")
              ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-lg shadow-primary-500/30"
              : "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/40 border border-primary-100 dark:border-primary-800/50"
              } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
          >
            <motion.div 
              animate={isActive("/phrases") ? {} : { rotate: [0, 5, -5, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            >
              <Mic2 className={`w-4 h-4 ${isActive("/phrases") ? "text-white" : "text-primary-600 dark:text-primary-400"}`} />
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

          <div className="my-3.5">
             <div className="h-px bg-neutral-100 dark:bg-neutral-800 w-full" />
          </div>

          <Link
            to="/payouts"
            onClick={handleLinkClick}
            className={`flex items-center space-x-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 group ${isActive("/payouts")
              ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-inner"
              : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-neutral-200"
              } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
          >
            <Wallet className={`w-4 h-4 ${isActive("/payouts") ? "text-success-600 dark:text-success-400" : "group-hover:text-success-500 transition-colors"}`} />
            <span>Earnings</span>
          </Link>

          <div className="pt-2 px-1">
            <a
              href="https://discord.gg/TVuj7Brytq"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2.5 bg-[#5865F2] hover:bg-[#4752C4] text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-md shadow-indigo-500/10 hover:shadow-indigo-500/20 transition-all cursor-pointer"
            >
              <svg className="w-4 h-4 fill-current text-white shrink-0" viewBox="0 0 127.14 116.29" xmlns="http://www.w3.org/2000/svg">
                <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,52.8,6.83,77.19,77.19,0,0,0,49.5,0,105.15,105.15,0,0,0,19.06,8.07C-1.87,39.38-7.51,69.91,5.2,100a105.77,105.77,0,0,0,32,16.29,78.69,78.69,0,0,0,6.72-11A67.36,67.36,0,0,1,33.12,99.8c.84-.62,1.65-1.28,2.44-2a68.64,68.64,0,0,0,82.72,0c.79.67,1.6,1.33,2.44,2a67.36,67.36,0,0,1-10.84,5.49,78.69,78.69,0,0,0,6.72,11,105.77,105.77,0,0,0,32-16.29C135.82,69.91,129.74,39.38,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.87,46,53.87,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.11,46,96.11,53,91,65.69,84.69,65.69Z" />
              </svg>
              <span>Join our Discord</span>
            </a>
          </div>
        </div>

        {/* User Info & Logout */}
        <div className="p-4 md:p-5 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 backdrop-blur-md">
          <div className="mb-3">
            <div className="text-xs font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mb-2 px-2">Account</div>
            {userInfo && (
              <div className="flex items-center space-x-3 px-3 py-2 rounded-xl bg-white dark:bg-neutral-800 shadow-sm border border-neutral-100 dark:border-neutral-700 mb-3 transition-colors">
                <div className="w-8 h-8 bg-gradient-primary rounded-full flex items-center justify-center text-white text-xs font-bold shadow-inner shrink-0">
                  {userInfo.firstname?.[0]}{userInfo.lastname?.[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                    {userInfo.firstname} {userInfo.lastname}
                  </div>
                  <div className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium truncate mt-0.5" title={userInfo.email}>
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
            className={`w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl border-2 text-sm font-bold transition-all duration-300 group ${disabled
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
