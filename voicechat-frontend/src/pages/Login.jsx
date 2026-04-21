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
      await apiPostJson("/api/auth/login/initiate", { email, password });
      setPhase(2);
      startResendCooldown();
    } catch (e2) {
      const msg = e2.message;
      if (msg === "invalid_credentials") setError("Invalid email or password.");
      else if (msg === "otp_too_soon") {
        // Already has a valid OTP from recent attempt
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
      setUserInfo(res.user);
      if (res.user?.isAdmin) {
        navigate("/admin/dashboard");
      } else if (res.user?.isQA) {
        navigate("/admin/qa");
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

  const inputClass = "input w-full";

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">

        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-4">
            <img src="/logo.png" alt="Voclara Logo" className="w-20 h-20 object-contain shadow-sm" />
          </div>
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">Welcome Back</h1>
          <p className="text-neutral-600">Sign in to continue to Voclara</p>
        </div>

        <div className="card animate-slide-up">

          {/* ── PHASE 1: Email + Password ── */}
          {phase === 1 && (
            <form onSubmit={onInitiate} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-2">
                  Email Address
                </label>
                <input
                  id="email" type="email" className={inputClass}
                  placeholder="you@example.com" value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email" required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-neutral-700 mb-2">
                  Password
                </label>
                <input
                  id="password" type="password" className={inputClass}
                  placeholder="••••••••" value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password" required
                />
                <div className="flex justify-end mt-1">
                  <Link to="/forgot-password" size="sm" className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors">
                    Forgot Password?
                  </Link>
                </div>
              </div>

              {error && (
                <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-lg text-sm animate-scale-in">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="btn btn-primary w-full">
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Sending OTP...
                  </span>
                ) : (
                  "Continue →"
                )}
              </button>
            </form>
          )}

          {/* ── PHASE 2: OTP Verification ── */}
          {phase === 2 && (
            <form onSubmit={onVerifyOtp} className="space-y-5">
              <div className="text-center mb-2">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-primary-100 rounded-full mb-3">
                  <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-neutral-800">Check your email</h2>
                <p className="text-sm text-neutral-500 mt-1">
                  A 6-digit OTP was sent to<br />
                  <span className="font-semibold text-neutral-700">{email}</span>
                </p>
              </div>

              <div>
                <label htmlFor="otp" className="block text-sm font-medium text-neutral-700 mb-2">
                  Enter OTP
                </label>
                <input
                  id="otp" type="text"
                  className={`${inputClass} text-center text-2xl font-mono tracking-widest`}
                  placeholder="— — — — — —"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6} inputMode="numeric" autoComplete="one-time-code"
                  autoFocus
                />
              </div>

              <p className="text-xs text-neutral-500 text-center">OTP expires in 10 minutes</p>

              <div className="text-center">
                {resendCooldown > 0 ? (
                  <span className="text-sm text-neutral-400">Resend in {resendCooldown}s</span>
                ) : (
                  <button type="button" onClick={resendOtp} disabled={loading}
                    className="text-sm text-primary-600 hover:text-primary-700 font-semibold transition-colors">
                    Resend OTP
                  </button>
                )}
              </div>

              {error && (
                <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-lg text-sm animate-scale-in">
                  {error}
                </div>
              )}

              <div>
                <button type="submit" disabled={loading || otp.length !== 6} className="btn btn-primary w-full">
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Verifying...
                    </span>
                  ) : (
                    "Sign In →"
                  )}
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 text-center border-t border-neutral-100 pt-4">
            <p className="text-sm text-neutral-600">
              Don't have an account?{" "}
              <Link to="/signup" className="text-primary-600 hover:text-primary-700 font-semibold transition-colors">
                Sign up
              </Link>
            </p>
          </div>
        </div>


      </div>
    </div>
  );
}
