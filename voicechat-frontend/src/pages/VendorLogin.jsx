import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Building, Lock, Mail, ArrowRight, ShieldCheck, AlertCircle } from "lucide-react";
import { apiPostJson } from "../lib/api.js";

export default function VendorLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await apiPostJson("/api/vendor/login", { email, password });
      if (res.token) {
        localStorage.setItem("vc_vendor_token", res.token);
        localStorage.setItem("vc_vendor_info", JSON.stringify(res.vendor));
      }
      navigate("/vendor/dashboard");
    } catch (err) {
      setError(err.message || "Invalid vendor credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex p-3 rounded-2xl bg-primary-600/20 border border-primary-500/30 text-primary-400 mb-4 shadow-lg shadow-primary-500/10">
          <Building className="w-8 h-8" />
        </div>
        <h2 className="text-3xl font-black tracking-tight text-white">Vendor & Agency Portal</h2>
        <p className="mt-2 text-sm text-neutral-400">
          DataCatalyst Community Operations & Quality Management
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-neutral-900 border border-neutral-800 py-8 px-6 sm:px-10 rounded-3xl shadow-2xl space-y-6"
        >
          {error && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Vendor Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="email"
                  required
                  placeholder="agency@partner.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-neutral-950 border border-neutral-800 focus:border-primary-500 rounded-xl text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Portal Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-neutral-950 border border-neutral-800 focus:border-primary-500 rounded-xl text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-primary-600 hover:bg-primary-500 active:scale-98 text-white text-sm font-bold rounded-xl shadow-lg shadow-primary-600/25 transition-all mt-6 disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Access Vendor Dashboard"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="pt-4 border-t border-neutral-800/80 text-center space-y-2">
            <div className="flex items-center justify-center gap-1.5 text-xs text-neutral-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Direct DataCatalyst Enterprise Partner Network</span>
            </div>
            <p className="text-xs text-neutral-500">
              Voice contributor?{" "}
              <Link to="/login" className="text-primary-400 hover:text-primary-300 font-semibold transition-colors">
                Contributor Login →
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
