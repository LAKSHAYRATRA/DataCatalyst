import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiPostJson } from "../lib/api.js";
import Swal from "sweetalert2";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (!token) {
      Swal.fire({ icon: 'error', title: 'Invalid Link', text: 'The reset link is missing its token.' });
      return;
    }
    if (password.length < 6) {
      Swal.fire({ icon: 'warning', title: 'Weak Password', text: 'Password must be at least 6 characters.' });
      return;
    }
    if (password !== confirmPassword) {
      Swal.fire({ icon: 'warning', title: 'Passwords mismatch', text: 'Passwords do not match.' });
      return;
    }

    setLoading(true);
    try {
      await apiPostJson("/api/auth/reset-password", { token, password });
      await Swal.fire({
        icon: 'success',
        title: 'Success!',
        text: 'Your password has been reset successfully. Please log in with your new password.',
        confirmButtonColor: '#6366f1'
      });
      navigate("/login");
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Reset Failed',
        text: err.message || 'The reset link may have expired or is invalid.',
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
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">Set New Password</h1>
          <p className="text-neutral-600">Choose a strong password for your account</p>
        </div>

        <div className="card animate-slide-up">
          {!token ? (
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-neutral-900 mb-2">Invalid or Missing Link</h2>
              <p className="text-neutral-600 mb-8">The link you followed is invalid or incomplete.</p>
              <Link to="/forgot-password" size="sm" className="btn btn-primary w-full">Request new link</Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-6">
              <div>
                <label htmlFor="p1" className="block text-sm font-medium text-neutral-700 mb-2">
                  New Password
                </label>
                <input
                  id="p1" type="password" className={inputClass}
                  placeholder="••••••••" value={password}
                  onChange={e => setPassword(e.target.value)}
                  required minLength={6}
                />
              </div>

              <div>
                <label htmlFor="p2" className="block text-sm font-medium text-neutral-700 mb-2">
                  Confirm New Password
                </label>
                <input
                  id="p2" type="password" className={inputClass}
                  placeholder="••••••••" value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required minLength={6}
                />
              </div>

              <button type="submit" disabled={loading} className="btn btn-primary w-full py-3">
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Updating password...
                  </span>
                ) : (
                  "Reset Password"
                )}
              </button>
            </form>
          )}

          <div className="mt-8 text-center border-t border-neutral-100 pt-6">
            <Link to="/login" className="text-sm font-medium text-neutral-500 hover:text-neutral-700 transition-colors">
              Return to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
