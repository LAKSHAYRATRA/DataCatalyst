import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiPostJson } from "../lib/api.js";
import Swal from "sweetalert2";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1 = Enter Email, 2 = Verify OTP, 3 = New Password

  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  function startResendCooldown() {
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  // Step 1: Request Password Reset OTP
  async function onSendOtp(e) {
    if (e) e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiPostJson("/api/auth/forgot-password", { email });
      setStep(2);
      startResendCooldown();
    } catch (err) {
      if (err.message === "otp_too_soon") {
        setStep(2);
        startResendCooldown();
      } else {
        setError(err.message || "Failed to send OTP. Please check your email.");
      }
    } finally {
      setLoading(false);
    }
  }

  // Step 2: Verify OTP Code
  async function onVerifyOtp(e) {
    e.preventDefault();
    setError("");

    if (!otpCode.trim() || otpCode.length !== 6) {
      setError("Please enter the 6-digit OTP sent to your email.");
      return;
    }

    setLoading(true);
    try {
      await apiPostJson("/api/auth/verify-otp", {
        email,
        code: otpCode,
        type: "reset",
      });
      // OTP verified successfully -> move to Step 3 (Set New Password)
      setStep(3);
    } catch (err) {
      const msg = err.message;
      if (msg === "otp_invalid" || msg === "otp_not_found") {
        setError("OTP is incorrect. Please check and try again.");
      } else if (msg === "otp_expired") {
        setError("OTP has expired. Please request a new OTP code.");
      } else {
        setError(msg || "OTP verification failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  // Step 3: Save New Password
  async function onResetPassword(e) {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please check and try again.");
      return;
    }

    setLoading(true);
    try {
      await apiPostJson("/api/auth/reset-password", {
        email,
        otpCode,
        password: newPassword,
      });

      await Swal.fire({
        icon: "success",
        title: "Password Updated!",
        text: "Your password has been reset successfully. Please sign in with your new password.",
        confirmButtonColor: "#6366f1",
      });

      navigate("/login");
    } catch (err) {
      const msg = err.message;
      if (msg === "otp_invalid_or_expired") {
        setError("OTP session expired. Please restart the password reset process.");
      } else {
        setError(msg || "Failed to update password. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "input w-full";

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-4">
            <img src="/logo.png" alt="Voclara Logo" className="w-20 h-20 object-contain shadow-sm" />
          </div>
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">Reset Password</h1>
          <p className="text-neutral-600">
            {step === 1
              ? "Enter your email to receive a password reset OTP"
              : step === 2
              ? `Enter the 6-digit OTP sent to ${email}`
              : "Choose a new password for your account"}
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center space-x-2 mb-6">
          <div className={`w-3 h-3 rounded-full ${step >= 1 ? "bg-primary-600" : "bg-neutral-300"}`} />
          <div className={`w-8 h-1 rounded ${step >= 2 ? "bg-primary-600" : "bg-neutral-300"}`} />
          <div className={`w-3 h-3 rounded-full ${step >= 2 ? "bg-primary-600" : "bg-neutral-300"}`} />
          <div className={`w-8 h-1 rounded ${step >= 3 ? "bg-primary-600" : "bg-neutral-300"}`} />
          <div className={`w-3 h-3 rounded-full ${step >= 3 ? "bg-primary-600" : "bg-neutral-300"}`} />
        </div>

        <div className="card animate-slide-up">
          {error && (
            <div className="mb-4 bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-lg text-sm animate-scale-in">
              {error}
            </div>
          )}

          {/* STEP 1: Enter Email */}
          {step === 1 && (
            <form onSubmit={onSendOtp} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-2">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  className={inputClass}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <button type="submit" disabled={loading} className="btn btn-primary w-full py-3">
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Sending OTP...
                  </span>
                ) : (
                  "Send Reset OTP →"
                )}
              </button>
            </form>
          )}

          {/* STEP 2: Verify OTP */}
          {step === 2 && (
            <form onSubmit={onVerifyOtp} className="space-y-5">
              <div>
                <label htmlFor="otp" className="block text-sm font-medium text-neutral-700 mb-2">
                  6-Digit OTP Code
                </label>
                <input
                  id="otp"
                  type="text"
                  className={`${inputClass} text-center text-2xl font-mono tracking-widest`}
                  placeholder="— — — — — —"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
                <span className="text-base leading-none">⚠️</span>
                <span>If you don't find the OTP in your inbox, make sure to check the <strong>SPAM</strong> folder of your mail.</span>
              </div>

              {/* Resend OTP */}
              <div className="text-center pt-1">
                {resendCooldown > 0 ? (
                  <span className="text-xs text-neutral-400">Resend OTP in {resendCooldown}s</span>
                ) : (
                  <button
                    type="button"
                    onClick={onSendOtp}
                    disabled={loading}
                    className="text-xs text-primary-600 hover:text-primary-700 font-semibold transition-colors"
                  >
                    Resend OTP Email
                  </button>
                )}
              </div>

              <button type="submit" disabled={loading || otpCode.length !== 6} className="btn btn-primary w-full py-3">
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Verifying OTP...
                  </span>
                ) : (
                  "Verify OTP →"
                )}
              </button>

              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full text-center text-xs text-neutral-500 hover:text-neutral-700 font-medium transition-colors"
              >
                ← Change Email Address
              </button>
            </form>
          )}

          {/* STEP 3: Enter New Password & Confirm Password */}
          {step === 3 && (
            <form onSubmit={onResetPassword} className="space-y-5">
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-neutral-700 mb-2">
                  New Password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  className={inputClass}
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-neutral-700 mb-2">
                  Confirm New Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  className={inputClass}
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>

              <button type="submit" disabled={loading} className="btn btn-primary w-full py-3">
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving New Password...
                  </span>
                ) : (
                  "Save Password & Sign In"
                )}
              </button>
            </form>
          )}

          <div className="mt-8 text-center border-t border-neutral-100 pt-6">
            <Link to="/login" className="text-sm font-medium text-neutral-500 hover:text-neutral-700 flex items-center justify-center gap-2 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
