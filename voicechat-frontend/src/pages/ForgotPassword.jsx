import React, { useState } from "react";
import { Link } from "react-router-dom";
import { apiPostJson } from "../lib/api.js";
import Swal from "sweetalert2";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiPostJson("/api/auth/forgot-password", { email });
      setSubmitted(true);
      Swal.fire({
        icon: 'success',
        title: 'Check your email',
        text: 'If an account exists for that email, we have sent password reset instructions.',
        confirmButtonColor: '#6366f1'
      });
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'Failed to send reset link. Please try again.',
        confirmButtonColor: '#6366f1'
      });
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
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">Forgot Password</h1>
          <p className="text-neutral-600">Enter your email to reset your password</p>
        </div>

        <div className="card animate-slide-up">
          {!submitted ? (
            <form onSubmit={onSubmit} className="space-y-6">
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

              <button type="submit" disabled={loading} className="btn btn-primary w-full py-3">
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Sending link...
                  </span>
                ) : (
                  "Send Reset Link"
                )}
              </button>
            </form>
          ) : (
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-neutral-900 mb-2">Check your inbox</h2>
              <p className="text-neutral-600 mb-8">
                We've sent a password reset link to <br/>
                <span className="font-semibold text-neutral-800">{email}</span>
              </p>
              <button onClick={() => setSubmitted(false)} className="text-primary-600 hover:text-primary-700 font-semibold transition-colors">
                Try a different email
              </button>
            </div>
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
