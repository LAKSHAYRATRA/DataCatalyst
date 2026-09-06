import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiPostJson } from "../lib/api.js";
import { setUserInfo } from "../lib/auth.js";

export default function Login() {
  const navigate = useNavigate();

  const [phase, setPhase] = useState(1); // 1 = credentials, 2 = OTP

  // Phase 1
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Phase 2
  const [otp, setOtp] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // ─── Phase 1: validate credentials + send OTP ───────────────────────────
  async function onInitiate(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiPostJson("/api/auth/login/initiate", { email, password });
      if (res.directLogin || res.token) {
        if (res.token) localStorage.setItem("vc_token", res.token);
        setUserInfo(res.user);
        if (res.user?.isAdmin) {
          navigate("/admin/dashboard");
        } else if (res.user?.isQA) {
          navigate("/admin/qa");
        } else if (res.user?.isProfileComplete === false) {
          navigate("/complete-profile");
        } else {
          const s = res.user?.accountStatus;
          if (s === "pending_intro" || s === "rejected") navigate("/intro-recording");
          else if (s === "pending_approval") navigate("/pending-approval");
          else navigate("/call");
        }
        return;
      }

      setPhase(2);
      startResendCooldown();
    } catch (e2) {
      const msg = e2.message;
      if (msg === "invalid_credentials") setError("Invalid email or password.");
      else if (msg === "otp_too_soon") {
        setPhase(2);
        startResendCooldown();
      } else {
        setError(msg || "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  // ─── Resend OTP ──────────────────────────────────────────────────────────
  async function resendOtp() {
    setError("");
    setLoading(true);
    try {
      await apiPostJson("/api/auth/login/initiate", { email, password });
      startResendCooldown();
    } catch (e) {
      if (e.message === "otp_too_soon") {
        startResendCooldown();
      } else {
        setError("Failed to resend OTP. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  function startResendCooldown() {
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) { clearInterval(interval); return 0; }
        return c - 1;
      });
    }, 1000);
  }

  // ─── Phase 2: verify OTP and complete login ──────────────────────────────
  async function onVerifyOtp(e) {
    e.preventDefault();
    if (otp.length !== 6) {
      setError("Please enter the 6-digit OTP.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await apiPostJson("/api/auth/login", { email, password, otpCode: otp });
      if (res.token) localStorage.setItem("vc_token", res.token);
      setUserInfo(res.user);
      if (res.user?.isAdmin) {
        navigate("/admin/dashboard");
      } else if (res.user?.isQA) {
        navigate("/admin/qa");
      } else if (res.user?.isProfileComplete === false) {
        navigate("/complete-profile");
      } else {
        const s = res.user?.accountStatus;
        if (s === "pending_intro" || s === "rejected") navigate("/intro-recording");
        else if (s === "pending_approval") navigate("/pending-approval");
        else navigate("/call");
      }
    } catch (e2) {
      const msg = e2.message;
      if (msg === "otp_invalid_or_expired") setError("OTP is incorrect or has expired. Request a new one.");
      else if (msg === "invalid_credentials") setError("Invalid credentials. Try logging in again.");
      else setError(msg || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const darkInputClass = "w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition-all";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4 relative overflow-hidden selection:bg-primary-500 selection:text-white">
      {/* Background Ambient Glows */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md animate-fade-in relative z-10">

        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-4 p-2 rounded-2xl bg-neutral-900 border border-neutral-800 shadow-xl shadow-black/40">
            <img src="/logo.png" alt="Voclara Logo" className="w-16 h-16 object-contain" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Welcome Back</h1>
          <p className="text-neutral-400 text-sm">Sign in to your Voclara contributor account</p>
        </div>

        {/* Login Card */}
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl animate-slide-up">

          {/* ── PHASE 1: Email + Password ── */}
          {phase === 1 && (
            <form onSubmit={onInitiate} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  className={darkInputClass}
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  className={darkInputClass}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <div className="flex justify-end mt-2">
                  <Link to="/forgot-password" className="text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors">
                    Forgot Password?
                  </Link>
                </div>
              </div>

              {error && (
                <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 px-4 py-3 rounded-xl text-xs font-medium animate-scale-in">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 active:scale-[0.99] text-white font-bold text-sm rounded-xl shadow-lg shadow-primary-600/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Signing In...
                  </span>
                ) : (
                  "Sign In →"
                )}
              </button>
            </form>
          )}

          {/* ── PHASE 2: OTP Verification ── */}
          {phase === 2 && (
            <form onSubmit={onVerifyOtp} className="space-y-5">
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-primary-500/10 border border-primary-500/30 rounded-2xl mb-3 text-primary-400">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-white">Check Your Email</h2>
                <p className="text-xs text-neutral-400 mt-1">
                  A 6-digit OTP was sent to<br />
                  <span className="font-mono font-semibold text-primary-300">{email}</span>
                </p>
              </div>

              <div>
                <label htmlFor="otp" className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2 text-center">
                  Enter 6-Digit OTP
                </label>
                <input
                  id="otp"
                  type="text"
                  className={`${darkInputClass} text-center text-2xl font-mono tracking-widest`}
                  placeholder="— — — — — —"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                />
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 flex items-start gap-2">
                <span className="text-base leading-none">⚠️</span>
                <span>If you don't find the OTP in your inbox, make sure to check your <strong>SPAM</strong> folder.</span>
              </div>

              <p className="text-xs text-neutral-500 text-center">OTP expires in 10 minutes</p>

              <div className="text-center">
                {resendCooldown > 0 ? (
                  <span className="text-xs text-neutral-500">Resend code in {resendCooldown}s</span>
                ) : (
                  <button
                    type="button"
                    onClick={resendOtp}
                    disabled={loading}
                    className="text-xs text-primary-400 hover:text-primary-300 font-semibold transition-colors"
                  >
                    Resend OTP
                  </button>
                )}
              </div>

              {error && (
                <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 px-4 py-3 rounded-xl text-xs font-medium animate-scale-in">
                  {error}
                </div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="w-full py-3.5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-primary-600/25 transition-all disabled:opacity-50"
                >
                  {loading ? "Verifying..." : "Verify & Sign In →"}
                </button>
              </div>
            </form>
          )}

          {/* Bottom Navigation Links */}
          <div className="mt-6 text-center border-t border-neutral-800/80 pt-5 space-y-2">
            <p className="text-xs text-neutral-400">
              Don't have an account?{" "}
              <Link to="/signup" className="text-primary-400 hover:text-primary-300 font-semibold transition-colors">
                Sign up
              </Link>
            </p>
            <p className="text-xs text-neutral-500">
              Are you an Agency or Studio partner?{" "}
              <Link to="/vendor/login" className="text-purple-400 hover:text-purple-300 font-bold transition-colors">
                Vendor Portal Login →
              </Link>
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
