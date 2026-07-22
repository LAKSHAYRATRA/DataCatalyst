import React, { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Call from "./pages/Call.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AdminCalls from "./pages/AdminCalls.jsx";
import AdminTopics from "./pages/AdminTopics.jsx";
import AdminUsers from "./pages/AdminUsers.jsx";
import AdminQA from "./pages/AdminQA.jsx";
import AdminPayouts from "./pages/AdminPayouts.jsx";
import AdminAgreements from "./pages/AdminAgreements.jsx";
import AdminPayoutUser from "./pages/AdminPayoutUser.jsx";
import IntroRecording from "./pages/IntroRecording.jsx";
import PendingApproval from "./pages/PendingApproval.jsx";
import ContributorAgreement from "./pages/ContributorAgreement.jsx";
import LanguageApply from "./pages/LanguageApply.jsx";
import AdminLanguages from "./pages/AdminLanguages.jsx";
import AdminLanguageApps from "./pages/AdminLanguageApps.jsx";
import AdminCallApps from "./pages/AdminCallApps.jsx";
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
import { getUserInfo, setUserInfo, clearToken } from "./lib/auth.js";
import { apiGet } from "./lib/api.js";
import { SystemCheckProvider } from "./context/SystemCheckContext.jsx";
import Earnings from "./pages/Earnings.jsx";
import Community from "./pages/Community.jsx";
import About from "./pages/About.jsx";
import Terms from "./pages/Terms.jsx";
import Privacy from "./pages/Privacy.jsx";
import RainbowCursor from "./components/RainbowCursor.jsx";

function needsAgreementSigning(userInfo) {
  if (!userInfo) return false;
  if (userInfo.accountStatus !== "approved") return false;
  const ca = userInfo.contributorAgreement || {};
  // Not signed yet, OR admin rejected -> user must (re-)sign
  return !ca.signed || ca.adminReviewStatus === "rejected";
}

function awaitingAgreementReview(userInfo) {
  if (!userInfo) return false;
  if (userInfo.accountStatus !== "approved") return false;
  const ca = userInfo.contributorAgreement || {};
  return ca.signed === true && ca.adminReviewStatus === "pending";
}

// Redirect logged-in users away from /login and /signup
function RedirectIfAuthenticated({ children }) {
  const userInfo = getUserInfo();
  if (!userInfo) return children;
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

// Guard platform pages — must be logged-in AND approved (account + agreement), NOT QA-only/admin-only
function RequireAuth({ children }) {
  const userInfo = getUserInfo();
  if (!userInfo) return <Navigate to="/login" replace />;
  // QA-only and admin users don't belong on user-facing pages
  if (userInfo.isQA && !userInfo.isAdmin) return <Navigate to="/admin/qa" replace />;
  if (userInfo.isAdmin) return <Navigate to="/admin/dashboard" replace />;
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
  if (userInfo.isQA && !userInfo.isAdmin) return <Navigate to="/admin/qa" replace />;
  if (userInfo.isAdmin) return <Navigate to="/admin/dashboard" replace />;
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

export default function App() {
  const [loading, setLoading] = useState(true);
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    async function checkAuth() {
      try {
        const data = await apiGet("/api/auth/me");
        setUserInfo(data.user);
      } catch (e) {
        if (e.message.includes("401") || e.message.includes("Unauthorized") || e.message.includes("session_expired")) {
          clearToken();
        }
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-warning-200 border-t-warning-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <SystemCheckProvider>
      <RainbowCursor />
      <Routes>
        <Route path="/login" element={<RedirectIfAuthenticated><Login /></RedirectIfAuthenticated>} />
        <Route path="/signup" element={<RedirectIfAuthenticated><Signup /></RedirectIfAuthenticated>} />

        {/* Approval flow */}
        <Route path="/intro-recording" element={<RequireIntroAccess><IntroRecording /></RequireIntroAccess>} />
        <Route path="/pending-approval" element={<RequirePendingAccess><PendingApproval /></RequirePendingAccess>} />
        <Route path="/contributor-agreement" element={<RequireAgreementAccess><ContributorAgreement /></RequireAgreementAccess>} />

        {/* Protected platform routes */}
        <Route path="/call" element={<RequireAuth><Call /></RequireAuth>} />
        <Route path="/dashboard" element={<RequireDashboardAccess><Dashboard /></RequireDashboardAccess>} />
        <Route path="/payouts" element={<RequireAuth><UserPayouts /></RequireAuth>} />
        <Route path="/kyc/pan" element={<RequireAuth><KycPan /></RequireAuth>} />

        {/* Admin Routes */}
        <Route path="/admin/dashboard" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
        <Route path="/admin/calls" element={<RequireAdmin><AdminCalls /></RequireAdmin>} />
        <Route path="/admin/topics" element={<RequireAdmin><AdminTopics /></RequireAdmin>} />
        <Route path="/admin/users" element={<RequireAdmin><AdminUsers /></RequireAdmin>} />
        <Route path="/admin/payouts" element={<RequireAdmin><AdminPayouts /></RequireAdmin>} />
        <Route path="/admin/payouts/:userId" element={<RequireAdmin><AdminPayoutUser /></RequireAdmin>} />
        <Route path="/admin/agreements" element={<RequireAdmin><AdminAgreements /></RequireAdmin>} />
        <Route path="/admin/pan-verification" element={<RequireAdmin><AdminPanVerification /></RequireAdmin>} />
        <Route path="/admin/qa" element={<RequireAdminOrQA><AdminQA /></RequireAdminOrQA>} />
        <Route path="/admin/languages" element={<RequireAdmin><AdminLanguages /></RequireAdmin>} />
        <Route path="/admin/language-apps" element={<RequireAdminOrQA><AdminLanguageApps /></RequireAdminOrQA>} />
        <Route path="/admin/call-apps" element={<RequireAdminOrQA><AdminCallApps /></RequireAdminOrQA>} />
        <Route path="/admin/phrases" element={<RequireAdmin><AdminPhrases /></RequireAdmin>} />
        <Route path="/admin/projects" element={<RequireAdmin><AdminProjects /></RequireAdmin>} />
        <Route path="/admin/companies" element={<RequireAdmin><AdminCompanies /></RequireAdmin>} />
        <Route path="/admin/qaphrase" element={<RequireAdminOrQA><QaPhrases /></RequireAdminOrQA>} />
        <Route path="/admin/media" element={<RequireAdmin><AdminMedia /></RequireAdmin>} />
        <Route path="/language-apply" element={<RequireAuth><LanguageApply /></RequireAuth>} />
        <Route path="/phrases" element={<RequireAuth><PhraseRecording /></RequireAuth>} />

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
