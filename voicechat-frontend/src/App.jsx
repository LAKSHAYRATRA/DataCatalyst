import React, { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Call from "./pages/Call.jsx";
import ScriptedCall from "./pages/ScriptedCall.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AdminCalls from "./pages/AdminCalls.jsx";
import AdminTopics from "./pages/AdminTopics.jsx";
import AdminTopicsLanguages from "./pages/AdminTopicsLanguages.jsx";
import AdminTopicsSubprojects from "./pages/AdminTopicsSubprojects.jsx";
import AdminUsers from "./pages/AdminUsers.jsx";
import AdminQA from "./pages/AdminQA.jsx";
import AdminSegmentation from "./pages/AdminSegmentation.jsx";
import AdminTranscription from "./pages/AdminTranscription.jsx";
import AdminPayouts from "./pages/AdminPayouts.jsx";
import AdminFinances from "./pages/AdminFinances.jsx";
import AdminAgreements from "./pages/AdminAgreements.jsx";
import AdminPayoutUser from "./pages/AdminPayoutUser.jsx";
import IntroRecording from "./pages/IntroRecording.jsx";
import PendingApproval from "./pages/PendingApproval.jsx";
import ContributorAgreement from "./pages/ContributorAgreement.jsx";
import LanguageApply from "./pages/LanguageApply.jsx";
import AdminLanguages from "./pages/AdminLanguages.jsx";
import AdminLanguageSubprojects from "./pages/AdminLanguageSubprojects.jsx";
import AdminLanguageApps from "./pages/AdminLanguageApps.jsx";
import AdminCallApps from "./pages/AdminCallApps.jsx";
import AdminScriptedCallsReview from "./pages/AdminScriptedCallsReview.jsx";
import AdminScriptedCallApps from "./pages/AdminScriptedCallApps.jsx";
import AdminScriptedLanguages from "./pages/AdminScriptedLanguages.jsx";
import AdminScriptedLanguageSubprojects from "./pages/AdminScriptedLanguageSubprojects.jsx";
import AdminScriptedTopics from "./pages/AdminScriptedTopics.jsx";
import AdminScriptedTopicsLanguages from "./pages/AdminScriptedTopicsLanguages.jsx";
import AdminScriptedTopicsSubprojects from "./pages/AdminScriptedTopicsSubprojects.jsx";
import AdminMergedCallStudio from "./pages/AdminMergedCallStudio.jsx";
import Landing from "./pages/Landing.jsx";
import Support from "./pages/Support.jsx";
import UserPayouts from "./pages/UserPayouts.jsx";
import KycPan from "./pages/KycPan.jsx";
import AdminPanVerification from "./pages/AdminPanVerification.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import AdminPhrases from "./pages/AdminPhrases.jsx";
import QaPhrases from "./pages/QaPhrases.jsx";
import PhraseRecording from "./pages/PhraseRecording.jsx";
import AdminMedia from "./pages/AdminMedia.jsx";
import AdminProjects from "./pages/AdminProjects.jsx";
import AdminCompanies from "./pages/AdminCompanies.jsx";
import AdminCompanyConfig from "./pages/AdminCompanyConfig.jsx";
import AdminCompanyUserCustomizations from "./pages/AdminCompanyUserCustomizations.jsx";
import AdminCompanyDownloadCustomizations from "./pages/AdminCompanyDownloadCustomizations.jsx";
import AdminCompanyPhraseWorkloads from "./pages/AdminCompanyPhraseWorkloads.jsx";
import AdminCompanyLanguagePhrases from "./pages/AdminCompanyLanguagePhrases.jsx";
import AdminCompanyContributorsSummary from "./pages/AdminCompanyContributorsSummary.jsx";
import AdminPhraseDownloads from "./pages/AdminPhraseDownloads.jsx";
import AdminQAPayments from "./pages/AdminQAPayments.jsx";
import AdminAmbiguity from "./pages/AdminAmbiguity.jsx";
import QaFlags from "./pages/QaFlags.jsx";
import { getUserInfo, setUserInfo, clearToken } from "./lib/auth.js";
import { apiGet, apiPatchJson } from "./lib/api.js";
import { SystemCheckProvider } from "./context/SystemCheckContext.jsx";
import Earnings from "./pages/Earnings.jsx";
import Community from "./pages/Community.jsx";
import About from "./pages/About.jsx";
import Terms from "./pages/Terms.jsx";
import Privacy from "./pages/Privacy.jsx";
import RainbowCursor from "./components/RainbowCursor.jsx";
import DisabledUser from "./pages/DisabledUser.jsx";

function isUserDisabled(userInfo) {
  if (!userInfo) return false;
  if (userInfo.isAdmin) return false;
  return !!userInfo.isDisabled;
}

function needsAgreementSigning(userInfo) {
  if (!userInfo) return false;
  // Strictly Admin: bypass agreement constraint completely
  if (userInfo.isAdmin === true) return false;

  if (userInfo.accountStatus !== "approved") return false;
  const ca = userInfo.contributorAgreement || {};
  // Not signed yet, OR admin rejected -> user must (re-)sign
  return !ca.signed || ca.adminReviewStatus === "rejected";
}

function awaitingAgreementReview(userInfo) {
  if (!userInfo) return false;
  // Strictly Admin: bypass agreement review constraint
  if (userInfo.isAdmin === true) return false;

  if (userInfo.accountStatus !== "approved") return false;
  const ca = userInfo.contributorAgreement || {};
  return ca.signed === true && ca.adminReviewStatus === "pending";
}

// Redirect logged-in users away from /login and /signup
function RedirectIfAuthenticated({ children }) {
  const userInfo = getUserInfo();
  if (!userInfo) return children;
  if (isUserDisabled(userInfo)) return <DisabledUser />;
  // QA users go straight to the QA review page
  if (userInfo.isQA && !userInfo.isAdmin) return <Navigate to="/admin/qa" replace />;
  if (userInfo.isAdmin) return <Navigate to="/admin/dashboard" replace />;
  const s = userInfo.accountStatus;
  if (s === "pending_intro" || s === "rejected") return <Navigate to="/intro-recording" replace />;
  if (s === "pending_approval") return <Navigate to="/pending-approval" replace />;
  if (needsAgreementSigning(userInfo)) return <Navigate to="/contributor-agreement" replace />;
  if (awaitingAgreementReview(userInfo)) return <Navigate to="/dashboard" replace />;
  return <Navigate to="/call" replace />;
}

// Guard platform pages — must be logged-in AND approved (account + agreement)
function RequireAuth({ children }) {
  const userInfo = getUserInfo();
  if (!userInfo) return <Navigate to="/login" replace />;
  if (isUserDisabled(userInfo)) return <DisabledUser />;
  if (userInfo.isQA && !userInfo.isAdmin) return <Navigate to="/admin/qa" replace />;
  if (userInfo.isAdmin) return children;

  const s = userInfo.accountStatus;
  if (s === "pending_intro" || s === "rejected") return <Navigate to="/intro-recording" replace />;
  if (s === "pending_approval") return <Navigate to="/pending-approval" replace />;
  if (needsAgreementSigning(userInfo)) return <Navigate to="/contributor-agreement" replace />;
  if (awaitingAgreementReview(userInfo)) return <Navigate to="/dashboard" replace />;
  return children;
}

// Guard Phrase Studio — ensures authentication & completed onboarding
function RequirePhraseAccess({ children }) {
  const userInfo = getUserInfo();
  if (!userInfo) return <Navigate to="/login" replace />;
  if (isUserDisabled(userInfo)) return <DisabledUser />;
  if (userInfo.isQA && !userInfo.isAdmin) return <Navigate to="/admin/qaphrase" replace />;
  if (userInfo.isAdmin) return children;

  const s = userInfo.accountStatus;
  if (s === "pending_intro" || s === "rejected") return <Navigate to="/intro-recording" replace />;
  if (s === "pending_approval") return <Navigate to="/pending-approval" replace />;
  if (needsAgreementSigning(userInfo)) return <Navigate to="/contributor-agreement" replace />;
  if (awaitingAgreementReview(userInfo)) return <Navigate to="/dashboard" replace />;

  return children;
}

// Guard for Dashboard — allows awaiting-review users too (Dashboard shows the banner)
function RequireDashboardAccess({ children }) {
  const userInfo = getUserInfo();
  if (!userInfo) return <Navigate to="/login" replace />;
  if (isUserDisabled(userInfo)) return <DisabledUser />;
  if (userInfo.isQA && !userInfo.isAdmin) return <Navigate to="/admin/qa" replace />;
  if (userInfo.isAdmin) return children;

  const s = userInfo.accountStatus;
  if (s === "pending_intro" || s === "rejected") return <Navigate to="/intro-recording" replace />;
  if (s === "pending_approval") return <Navigate to="/pending-approval" replace />;
  if (needsAgreementSigning(userInfo)) return <Navigate to="/contributor-agreement" replace />;
  // awaitingAgreementReview users are allowed — Dashboard renders the banner
  return children;
}

// Guard contributor-agreement — only if the user needs to (re-)sign
function RequireAgreementAccess({ children }) {
  const userInfo = getUserInfo();
  if (!userInfo) return <Navigate to="/login" replace />;
  if (isUserDisabled(userInfo)) return <DisabledUser />;
  if (userInfo.isQA && !userInfo.isAdmin) return <Navigate to="/admin/qa" replace />;
  if (userInfo.isAdmin) return <Navigate to="/admin/dashboard" replace />;
  const s = userInfo.accountStatus;
  if (s === "pending_intro" || s === "rejected") return <Navigate to="/intro-recording" replace />;
  if (s === "pending_approval") return <Navigate to="/pending-approval" replace />;
  if (awaitingAgreementReview(userInfo)) return <Navigate to="/dashboard" replace />;
  if (!needsAgreementSigning(userInfo)) return <Navigate to="/call" replace />;
  return children;
}

// Guard intro-recording — only for logged-in, non-approved users
function RequireIntroAccess({ children }) {
  const userInfo = getUserInfo();
  if (!userInfo) return <Navigate to="/login" replace />;
  if (isUserDisabled(userInfo)) return <DisabledUser />;
  if (userInfo.isQA && !userInfo.isAdmin) return <Navigate to="/admin/qa" replace />;
  if (userInfo.isAdmin) return <Navigate to="/admin/dashboard" replace />;
  if (userInfo.accountStatus === "approved") return <Navigate to="/call" replace />;
  if (userInfo.accountStatus === "pending_approval") return <Navigate to="/pending-approval" replace />;
  return children;
}

// Guard pending-approval page
function RequirePendingAccess({ children }) {
  const userInfo = getUserInfo();
  if (!userInfo) return <Navigate to="/login" replace />;
  if (isUserDisabled(userInfo)) return <DisabledUser />;
  if (userInfo.isQA && !userInfo.isAdmin) return <Navigate to="/admin/qa" replace />;
  if (userInfo.isAdmin) return <Navigate to="/admin/dashboard" replace />;
  if (userInfo.accountStatus === "approved") return <Navigate to="/call" replace />;
  if (userInfo.accountStatus === "pending_intro" || userInfo.accountStatus === "rejected")
    return <Navigate to="/intro-recording" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const userInfo = getUserInfo();
  if (!userInfo) return <Navigate to="/login" replace />;
  // QA-only users go to QA page, not admin dashboard
  if (userInfo.isQA && !userInfo.isAdmin) return <Navigate to="/admin/qa" replace />;
  if (!userInfo.isAdmin) return <Navigate to="/call" replace />;
  return children;
}

// Allows both admins and QA users
function RequireAdminOrQA({ children }) {
  const userInfo = getUserInfo();
  if (!userInfo) return <Navigate to="/login" replace />;
  if (!userInfo.isAdmin && !userInfo.isQA) return <Navigate to="/call" replace />;
  return children;
}

function ProfileCompletionOverlay({ userInfo, onComplete }) {
  const [accent, setAccent] = useState("");
  const [dialect, setDialect] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!accent.trim() || !dialect.trim()) {
      setError("Both Accent and Dialect are required.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await apiPatchJson("/api/user/profile-completion", {
        accent: accent.trim(),
        dialect: dialect.trim()
      });
      const updatedUser = {
        ...userInfo,
        accent: res.user.accent,
        dialect: res.user.dialect
      };
      setUserInfo(updatedUser);
      onComplete(updatedUser);
    } catch (err) {
      setError(err.message || "Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-neutral-900/90 backdrop-blur-md flex items-center justify-center p-4 z-[9999]">
      <div className="bg-white dark:bg-neutral-800 rounded-2xl p-8 max-w-md w-full shadow-2xl border border-neutral-200 dark:border-neutral-700 animate-slide-up relative">
        <button
          type="button"
          onClick={() => onComplete({ ...userInfo, accent: userInfo.accent || "Standard", dialect: userInfo.dialect || "Standard" })}
          className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 dark:hover:text-white p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
          title="Dismiss"
        >
          ✕
        </button>
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-xl mb-3 text-primary-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">Complete Your Profile</h2>
          <p className="text-sm text-neutral-500 mt-2">
            Please fill in your Accent and Dialect details before continuing to record.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">Accent</label>
            <input
              type="text"
              className="w-full px-4 py-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-transparent dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="e.g. Standard, Neutral, Haryanvi, Bihari"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">Dialect</label>
            <input
              type="text"
              className="w-full px-4 py-3 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-transparent dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="e.g. Standard Hindi, Awadhi, Bhojpuri"
              value={dialect}
              onChange={(e) => setDialect(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 text-error-700 dark:text-error-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full btn btn-primary flex items-center justify-center gap-2 py-3 mt-4"
          >
            {loading ? "Saving..." : "Save & Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

function RequireProfileFields({ children }) {
  const [user, setUser] = useState(getUserInfo());

  if (!user) return <Navigate to="/login" replace />;
  if (user.isQA || user.isAdmin) return children;

  return (
    <>
      {children}
      {(!user.accent || !user.dialect) && (
        <ProfileCompletionOverlay 
          userInfo={user} 
          onComplete={(updated) => setUser(updated)} 
        />
      )}
    </>
  );
}

function CompulsoryMobileModal({ userInfo, onComplete }) {
  const [mobileNumber, setMobileNumber] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanDigits = mobileNumber.replace(/[^0-9]/g, "");
    if (!cleanDigits || cleanDigits.length !== 10) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }
    if (!/^[6-9]\d{9}$/.test(cleanDigits)) {
      setError("Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const res = await apiPatchJson("/api/user/mobile-number", {
        mobileNumber: cleanDigits,
      });
      const updatedUser = {
        ...userInfo,
        mobileNumber: res.user?.mobileNumber || cleanDigits,
        phone: res.user?.phone || cleanDigits,
      };
      setUserInfo(updatedUser);
      onComplete(updatedUser);
    } catch (err) {
      setError(err.message || "Failed to save mobile number. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-neutral-950/95 backdrop-blur-xl flex items-center justify-center p-4 z-[999999] animate-fade-in select-none">
      <div className="bg-neutral-900 border border-neutral-700/80 rounded-3xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden animate-scale-up text-white">
        {/* Ambient Glows */}
        <div className="absolute -top-24 -right-24 w-52 h-52 bg-primary-600/25 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-52 h-52 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center relative z-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-tr from-primary-600 via-primary-500 to-amber-500 rounded-2xl mb-4 shadow-xl shadow-primary-950/60 text-white">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">Mobile Number Required</h2>
          <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
            To ensure account verification, live call notifications, and access to all platform features, please provide your active 10-digit mobile number.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 relative z-10">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-300 mb-2">
              Mobile Number <span className="text-error-400">*</span>
            </label>
            <div className="relative flex rounded-xl border border-neutral-700 focus-within:border-primary-500 bg-neutral-800/80 transition-all">
              <span className="inline-flex items-center gap-1.5 px-3.5 rounded-l-xl bg-neutral-800 border-r border-neutral-700 text-neutral-300 text-sm font-bold">
                <span>🇮🇳</span>
                <span className="text-xs text-neutral-400">+91</span>
              </span>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                autoFocus
                className="w-full px-4 py-3 bg-transparent text-white placeholder-neutral-500 text-base font-mono tracking-widest focus:outline-none"
                placeholder="9876543210"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
              />
            </div>
            <p className="text-[11px] text-neutral-500 mt-1.5 flex items-center gap-1">
              <svg className="w-3.5 h-3.5 text-primary-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Compulsory step to unlock platform access.</span>
            </p>
          </div>

          {error && (
            <div className="bg-error-900/30 border border-error-800 text-error-300 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
              <span className="text-base">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || mobileNumber.replace(/[^0-9]/g, "").length !== 10}
            className="w-full py-3.5 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm shadow-lg shadow-primary-900/30 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Save & Access Platform</span>
                <span className="text-base font-black">→</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(getUserInfo());
  const [loading, setLoading] = useState(true);
  const { pathname } = useLocation();

  const publicRoutes = [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/",
    "/about",
    "/terms",
    "/privacy",
    "/support",
    "/earnings",
    "/community"
  ];
  const isPublicRoute = publicRoutes.includes(pathname);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    async function checkAuth() {
      try {
        const data = await apiGet("/api/auth/me");
        setUserInfo(data.user);
        setCurrentUser(data.user);
      } catch (e) {
        await clearToken();
        setCurrentUser(null);
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, []);

  // Only block protected routes with a loading spinner; public pages render instantly
  if (loading && !isPublicRoute) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-neutral-700 border-t-warning-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  const needsMobileNumber = !!currentUser && !isPublicRoute && !currentUser.mobileNumber && !currentUser.phone;

  return (
    <SystemCheckProvider>
      <RainbowCursor />
      {needsMobileNumber && (
        <CompulsoryMobileModal
          userInfo={currentUser}
          onComplete={(updated) => {
            setCurrentUser(updated);
          }}
        />
      )}
      <Routes>
        <Route path="/login" element={<RedirectIfAuthenticated><Login /></RedirectIfAuthenticated>} />
        <Route path="/signup" element={<RedirectIfAuthenticated><Signup /></RedirectIfAuthenticated>} />

        {/* Approval flow */}
        <Route path="/intro-recording" element={<RequireIntroAccess><IntroRecording /></RequireIntroAccess>} />
        <Route path="/pending-approval" element={<RequirePendingAccess><PendingApproval /></RequirePendingAccess>} />
        <Route path="/contributor-agreement" element={<RequireAgreementAccess><ContributorAgreement /></RequireAgreementAccess>} />

        {/* Protected platform routes */}
        <Route path="/call" element={<RequireAuth><Call /></RequireAuth>} />
        <Route path="/scripted-call" element={<RequireAuth><ScriptedCall /></RequireAuth>} />
        <Route path="/dashboard" element={<RequireDashboardAccess><Dashboard /></RequireDashboardAccess>} />
        <Route path="/payouts" element={<RequireAuth><UserPayouts /></RequireAuth>} />
        <Route path="/kyc/pan" element={<RequireAuth><KycPan /></RequireAuth>} />

        {/* Admin Routes */}
        <Route path="/admin/dashboard" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
        <Route path="/admin/calls" element={<RequireAdmin><AdminCalls /></RequireAdmin>} />
        <Route path="/admin/calls/:callId/merged" element={<RequireAdminOrQA><AdminMergedCallStudio /></RequireAdminOrQA>} />
        {/* Call Topics 3-Tier Hierarchy */}
        <Route path="/admin/topics" element={<RequireAdmin><AdminTopicsLanguages /></RequireAdmin>} />
        <Route path="/admin/topics/:langCode/subprojects" element={<RequireAdmin><AdminTopicsSubprojects /></RequireAdmin>} />
        <Route path="/admin/topics/:langCode/subprojects/:subprojectCode/topics" element={<RequireAdmin><AdminTopics /></RequireAdmin>} />
        <Route path="/admin/topics/manage/:subprojectCode" element={<RequireAdmin><AdminTopics /></RequireAdmin>} />
        <Route path="/admin/topics/all" element={<RequireAdmin><AdminTopics /></RequireAdmin>} />

        <Route path="/admin/users" element={<RequireAdmin><AdminUsers /></RequireAdmin>} />
        <Route path="/admin/payouts" element={<RequireAdmin><AdminPayouts /></RequireAdmin>} />
        <Route path="/admin/payouts/:userId" element={<RequireAdmin><AdminPayoutUser /></RequireAdmin>} />
        <Route path="/admin/finances" element={<RequireAdmin><AdminFinances /></RequireAdmin>} />
        <Route path="/admin/agreements" element={<RequireAdmin><AdminAgreements /></RequireAdmin>} />
        <Route path="/admin/pan-verification" element={<RequireAdmin><AdminPanVerification /></RequireAdmin>} />
        <Route path="/admin/qa" element={<RequireAdminOrQA><AdminQA /></RequireAdminOrQA>} />
        <Route path="/admin/segmentation" element={<RequireAdminOrQA><AdminSegmentation /></RequireAdminOrQA>} />
        <Route path="/admin/transcription" element={<RequireAdminOrQA><AdminTranscription /></RequireAdminOrQA>} />
        <Route path="/admin/languages" element={<RequireAdmin><AdminLanguages /></RequireAdmin>} />
        <Route path="/admin/languages/:langCode/subprojects" element={<RequireAdmin><AdminLanguageSubprojects /></RequireAdmin>} />
        <Route path="/admin/language-apps" element={<RequireAdminOrQA><AdminLanguageApps /></RequireAdminOrQA>} />
        <Route path="/admin/call-apps" element={<RequireAdminOrQA><AdminCallApps /></RequireAdminOrQA>} />
        <Route path="/admin/scripted-calls-review" element={<RequireAdminOrQA><AdminScriptedCallsReview /></RequireAdminOrQA>} />
        <Route path="/admin/scripted-qa" element={<RequireAdminOrQA><AdminScriptedCallsReview /></RequireAdminOrQA>} />
        <Route path="/admin/scripted-call-apps" element={<RequireAdminOrQA><AdminScriptedCallApps /></RequireAdminOrQA>} />

        {/* Scripted Call Topics 3-Tier Hierarchy */}
        <Route path="/admin/scripted-topics" element={<RequireAdminOrQA><AdminScriptedTopicsLanguages /></RequireAdminOrQA>} />
        <Route path="/admin/scripted-topics/:langCode/subprojects" element={<RequireAdminOrQA><AdminScriptedTopicsSubprojects /></RequireAdminOrQA>} />
        <Route path="/admin/scripted-topics/:langCode/subprojects/:subprojectCode/topics" element={<RequireAdminOrQA><AdminScriptedTopics /></RequireAdminOrQA>} />
        <Route path="/admin/scripted-topics/manage/:subprojectCode" element={<RequireAdminOrQA><AdminScriptedTopics /></RequireAdminOrQA>} />
        <Route path="/admin/scripted-topics/all" element={<RequireAdminOrQA><AdminScriptedTopics /></RequireAdminOrQA>} />

        <Route path="/admin/scripted-languages" element={<RequireAdminOrQA><AdminScriptedLanguages /></RequireAdminOrQA>} />
        <Route path="/admin/scripted-languages/:langCode/subprojects" element={<RequireAdminOrQA><AdminScriptedLanguageSubprojects /></RequireAdminOrQA>} />
        <Route path="/admin/phrases" element={<RequireAdmin><AdminPhrases /></RequireAdmin>} />
        <Route path="/admin/phrases/downloads" element={<RequireAdmin><AdminPhraseDownloads /></RequireAdmin>} />
        <Route path="/admin/projects" element={<RequireAdmin><AdminProjects /></RequireAdmin>} />
        <Route path="/admin/companies" element={<RequireAdmin><AdminCompanies /></RequireAdmin>} />
        <Route path="/admin/companies/:id/config" element={<RequireAdmin><AdminCompanyConfig /></RequireAdmin>} />
        <Route path="/admin/companies/:id/user-customizations" element={<RequireAdmin><AdminCompanyUserCustomizations /></RequireAdmin>} />
        <Route path="/admin/companies/:id/download-customizations" element={<RequireAdmin><AdminCompanyDownloadCustomizations /></RequireAdmin>} />
        <Route path="/admin/companies/:id/phrase-workloads" element={<RequireAdmin><AdminCompanyPhraseWorkloads /></RequireAdmin>} />
        <Route path="/admin/companies/:id/phrase-workloads/:language" element={<RequireAdmin><AdminCompanyLanguagePhrases /></RequireAdmin>} />
        <Route path="/admin/companies/:id/contributors-summary" element={<RequireAdmin><AdminCompanyContributorsSummary /></RequireAdmin>} />
        <Route path="/admin/qaphrase" element={<RequireAdminOrQA><QaPhrases /></RequireAdminOrQA>} />
        <Route path="/admin/qa-payments" element={<RequireAdminOrQA><AdminQAPayments /></RequireAdminOrQA>} />
        <Route path="/admin/qa-flags" element={<RequireAdminOrQA><QaFlags /></RequireAdminOrQA>} />
        <Route path="/admin/ambiguity" element={<RequireAdmin><AdminAmbiguity /></RequireAdmin>} />
        <Route path="/admin/media" element={<RequireAdmin><AdminMedia /></RequireAdmin>} />
        <Route path="/language-apply" element={<RequireAuth><LanguageApply /></RequireAuth>} />
        <Route path="/phrases" element={<RequirePhraseAccess><PhraseRecording /></RequirePhraseAccess>} />

        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/login" element={<Navigate to="/login" replace />} />
        <Route path="/forgot-password" element={<RedirectIfAuthenticated><ForgotPassword /></RedirectIfAuthenticated>} />
        <Route path="/reset-password" element={<RedirectIfAuthenticated><ResetPassword /></RedirectIfAuthenticated>} />
        <Route path="/earnings" element={<Earnings />} />
        <Route path="/community" element={<Community />} />
        <Route path="/about" element={<About />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/" element={<Landing />} />
        <Route path="/support" element={<Support />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SystemCheckProvider>
  );
}
