import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building,
  UsersRound,
  TrendingUp,
  Award,
  Sparkles,
  Layers,
  Copy,
  Check,
  ShieldCheck,
  LogOut,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Plus,
  Edit2,
  Mic,
  User,
  UserPlus,
  Sliders,
  Settings,
  Mail,
  Lock,
  Phone,
  FileCheck,
  RefreshCw,
  ExternalLink,
  Clock,
  FileText,
  AlertTriangle
} from "lucide-react";
import { apiGet, apiPostJson, apiPutJson } from "../lib/api.js";
import Swal from "sweetalert2";

export default function VendorPortal() {
  const navigate = useNavigate();
  const [vendor, setVendor] = useState(null);
  const [stats, setStats] = useState({});
  const [projects, setProjects] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [rejections, setRejections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState("projects"); // 'projects' | 'community' | 'insights' | 'earnings'

  // Contributor / Voice Artist Account Creation State
  const [showAddArtistModal, setShowAddArtistModal] = useState(false);
  const [submittingArtist, setSubmittingArtist] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [copiedCreds, setCopiedCreds] = useState(false);
  const [artistForm, setArtistForm] = useState({
    firstname: "",
    lastname: "",
    email: "",
    password: "",
    artistHourlyPayrate: 18,
    perCallPayrate: 18,
    hourlyPhrasePayrate: 18
  });

  // Edit Payrate Modal State
  const [editingArtist, setEditingArtist] = useState(null);
  const [editPayrates, setEditPayrates] = useState({ artistHourlyPayrate: 18, perCallPayrate: 18, hourlyPhrasePayrate: 18 });
  const [savingPayrate, setSavingPayrate] = useState(false);

  // Settlement Payout Form State (for non-studio standard vendors)
  const [payoutForm, setPayoutForm] = useState({
    upiId: "",
    accountHolderName: "",
    bankAccountNumber: "",
    ifscCode: ""
  });
  const [savingPayout, setSavingPayout] = useState(false);

  useEffect(() => {
    fetchPortalData();
  }, []);

  async function fetchPortalData() {
    setLoading(true);
    try {
      const [meRes, projectsRes, communityRes, insightsRes] = await Promise.all([
        apiGet("/api/vendor/me"),
        apiGet("/api/vendor/projects"),
        apiGet("/api/vendor/community"),
        apiGet("/api/vendor/quality-insights")
      ]);

      setVendor(meRes.vendor || {});
      setStats(meRes.stats || {});
      setProjects(projectsRes.projects || []);
      setWorkers(communityRes.workers || []);
      setRejections(insightsRes.reasons || []);

      if (meRes.vendor?.payoutDetails) {
        setPayoutForm({
          upiId: meRes.vendor.payoutDetails.upiId || "",
          accountHolderName: meRes.vendor.payoutDetails.accountHolderName || "",
          bankAccountNumber: meRes.vendor.payoutDetails.bankAccountNumber || "",
          ifscCode: meRes.vendor.payoutDetails.ifscCode || ""
        });
      }
    } catch (err) {
      console.error("Vendor portal fetch error:", err);
      if (err.status === 401) {
        navigate("/vendor/login");
      }
    } finally {
      setLoading(false);
    }
  }

  const handleCopyLink = () => {
    if (!vendor?.vendorCode) return;
    const origin = window.location.origin;
    const url = `${origin}/signup?vendor=${vendor.vendorCode}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleLogout = () => {
    localStorage.removeItem("vc_vendor_token");
    localStorage.removeItem("vc_vendor_info");
    navigate("/vendor/login");
  };

  // Vendor creates new contributor / artist account with email and password
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!artistForm.email || !artistForm.password) {
      Swal.fire("Validation Error", "Email and password are required.", "warning");
      return;
    }
    if (artistForm.password.length < 6) {
      Swal.fire("Validation Error", "Password must be at least 6 characters long.", "warning");
      return;
    }

    setSubmittingArtist(true);
    try {
      const rateVal = isStudio ? (Number(artistForm.artistHourlyPayrate) || Number(artistForm.hourlyPhrasePayrate) || 18) : 0;
      const res = await apiPostJson("/api/vendor/users", {
        email: artistForm.email.trim(),
        password: artistForm.password.trim(),
        firstname: artistForm.firstname.trim(),
        lastname: artistForm.lastname.trim(),
        artistHourlyPayrate: rateVal,
        perCallPayrate: rateVal,
        hourlyPhrasePayrate: rateVal
      });

      setCreatedCredentials({
        email: res.credentials?.email || artistForm.email.trim(),
        password: res.credentials?.password || artistForm.password.trim(),
        loginUrl: `${window.location.origin}/login`,
        name: res.user?.name || artistForm.firstname || "Contributor",
        speaker_id: res.user?.speaker_id || ""
      });

      setArtistForm({
        firstname: "",
        lastname: "",
        email: "",
        password: "",
        perCallPayrate: 30,
        hourlyPhrasePayrate: 150
      });
      fetchPortalData();
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Account Creation Failed",
        text: err?.body?.error || err.message || "Failed to create user account",
        background: "#171717",
        color: "#fff"
      });
    } finally {
      setSubmittingArtist(false);
    }
  };

  const handleCreateArtist = handleCreateUser;

  // Studio updates an artist's payrate
  const handleUpdatePayrate = async (e) => {
    e.preventDefault();
    if (!editingArtist) return;
    setSavingPayrate(true);
    try {
      const rateVal = Number(editPayrates.artistHourlyPayrate !== undefined ? editPayrates.artistHourlyPayrate : editPayrates.hourlyPhrasePayrate) || 0;
      await apiPutJson(`/api/vendor/artists/${editingArtist._id}/payrate`, {
        artistHourlyPayrate: rateVal,
        perCallPayrate: rateVal,
        hourlyPhrasePayrate: rateVal
      });
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Artist payrates updated successfully!",
        timer: 3000,
        showConfirmButton: false,
        background: "#171717",
        color: "#fff"
      });
      setEditingArtist(null);
      fetchPortalData();
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to update payrates", "error");
    } finally {
      setSavingPayrate(false);
    }
  };

  // Standard Vendor saves settlement UPI & Account Holder Name
  const handleSavePayout = async (e) => {
    e.preventDefault();
    if (!payoutForm.upiId.trim() || !payoutForm.accountHolderName.trim()) {
      Swal.fire("Validation Error", "Vendor UPI ID and Account Holder Name are required.", "warning");
      return;
    }
    setSavingPayout(true);
    try {
      await apiPutJson("/api/vendor/payout-settings", payoutForm);
      setVendor((prev) => ({
        ...prev,
        payoutDetails: {
          ...prev?.payoutDetails,
          ...payoutForm
        }
      }));
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Settlement credentials updated successfully!",
        timer: 3000,
        showConfirmButton: false,
        background: "#171717",
        color: "#fff"
      });
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to update payout details", "error");
    } finally {
      setSavingPayout(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-400">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm">Loading Vendor Portal...</p>
        </div>
      </div>
    );
  }

  const isStudio = Boolean(vendor?.isStudio);
  const totalAudited = stats.totalAudited !== undefined ? stats.totalAudited : ((stats.totalApproved || 0) + (stats.totalRejected || 0));
  const hasAudits = totalAudited > 0;
  const approvalRate = hasAudits ? (stats.overallApprovalRate || 0) : 0;

  // QA Audit Quality Status
  let approvalBadgeColor = "bg-neutral-800 text-neutral-400 border-neutral-700";
  let approvalBadgeLabel = "No Submissions Audited";
  if (hasAudits) {
    if (approvalRate >= 95) {
      approvalBadgeColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
      approvalBadgeLabel = "Exceptional Quality";
    } else if (approvalRate >= 85) {
      approvalBadgeColor = "bg-cyan-500/10 text-cyan-400 border-cyan-500/30";
      approvalBadgeLabel = "Good Quality";
    } else if (approvalRate >= 75) {
      approvalBadgeColor = "bg-amber-500/10 text-amber-400 border-amber-500/30";
      approvalBadgeLabel = "Acceptable Quality";
    } else {
      approvalBadgeColor = "bg-rose-500/10 text-rose-400 border-rose-500/30";
      approvalBadgeLabel = "Review Required";
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="bg-neutral-900/80 border-b border-neutral-800 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border ${isStudio ? "bg-purple-600/20 border-purple-500/30 text-purple-400" : "bg-primary-600/20 border-primary-500/30 text-primary-400"}`}>
              <Building className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-base">{vendor?.name || "Vendor Partner"}</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-neutral-800 text-primary-400 border border-neutral-700">
                  {vendor?.vendorCode}
                </span>
                {isStudio ? (
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Studio Partner
                  </span>
                ) : (
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    Community Vendor
                  </span>
                )}
              </div>
              <span className="text-[11px] text-neutral-400">DataCatalyst Partner Operations Portal</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setCreatedCredentials(null);
                setShowAddArtistModal(true);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 ${
                isStudio
                  ? "bg-purple-600 hover:bg-purple-500 shadow-purple-600/20"
                  : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20"
              } text-white text-xs font-semibold rounded-xl shadow-lg transition-all`}
            >
              {isStudio ? <Mic className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
              <span>{isStudio ? "Onboard Voice Artist" : "Create Contributor Account"}</span>
            </button>

            <button
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded-xl transition-all"
              title="Copy your agency onboarding URL"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied Link</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Copy Contributor Invite Link</span>
                </>
              )}
            </button>

            <button
              onClick={handleLogout}
              className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Banner: Studio Mode vs Community Vendor Mode */}
        {isStudio ? (
          <div className="bg-gradient-to-r from-purple-950/40 via-neutral-900 to-indigo-950/40 border border-purple-500/30 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-500/20 text-purple-400 rounded-xl">
                <Mic className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  Studio Partner Mode Active
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Direct Payrate Control
                  </span>
                </div>
                <p className="text-xs text-neutral-300 mt-0.5">
                  As a Studio Partner, you decide the exact compensation rates (₹ per call / ₹ per hour) for your voice artists. Artists must still pass all standard intro voice auditions and agreement checks before recording.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowAddArtistModal(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-purple-600/20 shrink-0"
            >
              + Add Voice Artist
            </button>
          </div>
        ) : (
          <>
            {/* Direct Contributor Assurance for Standard Vendor */}
            <div className="bg-gradient-to-r from-emerald-950/40 via-neutral-900 to-primary-950/40 border border-emerald-500/30 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    Fair Pay & Direct Contributor Assurance
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-neutral-300 mt-0.5">
                    Every contributor in your community is paid 100% of standard project pay directly into their UPI account by DataCatalyst. Your vendor earnings are paid independently as an operations & quality incentive margin.
                  </p>
                </div>
              </div>
            </div>

            {/* Prompt Vendor to Enter UPI Details if missing */}
            {!vendor?.payoutDetails?.upiId && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      Payment Credentials Missing
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Action Required
                      </span>
                    </div>
                    <p className="text-xs text-neutral-300 mt-0.5">
                      Please enter your UPI ID and Official Account Holder Name in the Earnings & Payouts tab to receive your margin settlements directly from DataCatalyst.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab("earnings")}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs rounded-xl transition-all shadow-md shadow-amber-500/20 shrink-0"
                >
                  Setup UPI Now →
                </button>
              </div>
            )}
          </>
        )}

        {/* QA Approval & Direct Margin Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
          {/* Card 1: QA Approval Pass Rate & Performance */}
          <div className="lg:col-span-2 bg-neutral-900/80 border border-neutral-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Award className="w-5 h-5 text-amber-400" />
                  <span className="text-sm font-bold text-white uppercase tracking-wider">
                    {isStudio ? "Studio QA Pass Rate" : "Overall QA Approval Rate"}
                  </span>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${approvalBadgeColor}`}>
                  {approvalBadgeLabel}
                </span>
              </div>

              <div className="mt-4 flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4">
                <div className="text-5xl font-black text-white tracking-tight">
                  {hasAudits ? `${approvalRate}%` : "0%"}
                </div>
                <div className="text-xs text-neutral-400">
                  {hasAudits
                    ? `QA approval percentage across ${totalAudited} audited audio submission${totalAudited > 1 ? "s" : ""} from your ${isStudio ? "studio artists" : "workers"}.`
                    : `No audio submissions audited yet. Pass rate updates automatically as recordings are evaluated by QA.`}
                </div>
              </div>

              {/* Progress Bar & Breakdown */}
              <div className="mt-4">
                <div className="flex justify-between items-center text-xs text-neutral-400 mb-1.5 font-medium">
                  <span>Pass Percentage</span>
                  <span className="font-mono font-bold text-white">{hasAudits ? `${approvalRate}%` : "0%"}</span>
                </div>
                <div className="w-full bg-neutral-950 h-3 rounded-full overflow-hidden border border-neutral-800">
                  <div
                    className={`h-full ${hasAudits ? "bg-gradient-to-r from-primary-500 to-emerald-400" : "bg-neutral-800"} rounded-full transition-all duration-700`}
                    style={{ width: `${hasAudits ? Math.min(100, Math.max(0, approvalRate)) : 0}%` }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-neutral-800/60 text-center">
                  <div className="bg-neutral-950/50 p-2.5 rounded-xl border border-neutral-800/40">
                    <div className="text-[11px] text-neutral-400 font-medium">Audited Submissions</div>
                    <div className="text-base font-black text-white font-mono mt-0.5">{totalAudited}</div>
                  </div>
                  <div className="bg-neutral-950/50 p-2.5 rounded-xl border border-neutral-800/40">
                    <div className="text-[11px] text-neutral-400 font-medium">Approved Units</div>
                    <div className="text-base font-black text-emerald-400 font-mono mt-0.5">{stats.totalApproved || 0}</div>
                  </div>
                  <div className="bg-neutral-950/50 p-2.5 rounded-xl border border-neutral-800/40">
                    <div className="text-[11px] text-neutral-400 font-medium">Rejected Submissions</div>
                    <div className="text-base font-black text-rose-400 font-mono mt-0.5">{stats.totalRejected || 0}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 p-3 rounded-xl bg-neutral-950/70 border border-neutral-800 flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-primary-400 shrink-0" />
              <span className="text-xs text-neutral-300">
                {isStudio
                  ? "High pass rates ensure your studio audio is prioritized and approved rapidly by internal QA."
                  : "Direct margin applies to 100% of your approved units with zero quality multiplier deductions."}
              </span>
            </div>
          </div>

          {/* Card 2: Compensation / Margin Overview */}
          <div className="bg-gradient-to-br from-neutral-900 to-neutral-950 border border-neutral-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                  {isStudio ? "Studio Margin Accrued" : "Accrued Margin"}
                </span>
                {isStudio ? <DollarSign className="w-5 h-5 text-purple-400" /> : <DollarSign className="w-5 h-5 text-amber-400" />}
              </div>

              {isStudio ? (
                <div className="mt-3">
                  <div className="text-4xl font-black text-purple-400">
                    ${(stats.totalMarginEarned || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <p className="text-xs text-neutral-400 mt-1">
                    Accrued from project rate split ($Project Rate − $Artist Rate) across {stats.totalApprovedHours || 0} approved hrs.
                  </p>
                </div>
              ) : (
                <div className="mt-3">
                  <div className="text-4xl font-black text-amber-400">${(stats.totalMarginEarned || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <p className="text-xs text-neutral-400 mt-1">
                    Direct margin earned in USD across all approved hours delivered by your contributors.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-neutral-800/80 space-y-2.5 text-xs">
              <div className="flex justify-between text-neutral-400">
                <span>Delivered Valid Speech:</span>
                <span className="font-bold text-white font-mono">{stats.totalApprovedHours || 0} hrs</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Completed Audited Calls:</span>
                <span className="font-bold text-white font-mono">{stats.totalApprovedCalls || 0} calls</span>
              </div>
              {isStudio ? (
                <div className="flex justify-between text-neutral-400">
                  <span>Artist Direct Payouts:</span>
                  <span className="font-bold text-purple-300 font-mono">
                    ${(stats.totalArtistPayout || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              ) : (
                <div className="flex justify-between text-neutral-400">
                  <span>Margin Guarantee:</span>
                  <span className="font-bold text-emerald-400">100% Flat Rate (No Deductions)</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-neutral-800 pb-3 mb-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab("projects")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "projects"
                ? "bg-primary-600 text-white shadow-md shadow-primary-600/25"
                : "text-neutral-400 hover:text-white hover:bg-neutral-900"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Assigned Sub-Projects ({projects.length})
          </button>

          <button
            onClick={() => setActiveTab("community")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "community"
                ? "bg-primary-600 text-white shadow-md shadow-primary-600/25"
                : "text-neutral-400 hover:text-white hover:bg-neutral-900"
            }`}
          >
            <UsersRound className="w-3.5 h-3.5" />
            {isStudio ? `Studio Artists (${workers.length})` : `Community Workers (${workers.length})`}
          </button>

          <button
            onClick={() => setActiveTab("insights")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "insights"
                ? "bg-primary-600 text-white shadow-md shadow-primary-600/25"
                : "text-neutral-400 hover:text-white hover:bg-neutral-900"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Quality & Coaching Insights
          </button>

          <button
            onClick={() => setActiveTab("earnings")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "earnings"
                ? "bg-primary-600 text-white shadow-md shadow-primary-600/25"
                : "text-neutral-400 hover:text-white hover:bg-neutral-900"
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            Earnings & Payouts
            {!vendor?.payoutDetails?.upiId && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>
        </div>

        {/* TAB 1: ASSIGNED PROJECTS */}
        {activeTab === "projects" && (
          <div className="space-y-4">
            {projects.length === 0 ? (
              <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl py-16 text-center">
                <Layers className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
                <h3 className="text-base font-bold text-white">No Projects Assigned Yet</h3>
                <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
                  Your DataCatalyst operations manager has not allocated any projects to your account yet.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {projects.map((proj) => (
                  <div
                    key={proj.subprojectId}
                    className="bg-neutral-900/70 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-5 transition-all shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                          {proj.category.replace("_", " ").toUpperCase()}
                        </span>
                        <span className="text-xs font-bold text-emerald-400">{proj.approvalRate}% Approval</span>
                      </div>

                      <h4 className="text-base font-bold text-white">{proj.subprojectName}</h4>
                      {isStudio ? (
                        <p className="text-xs text-purple-300 mt-1 font-medium">
                          Project Rate: ${Number(proj.projectPayrate || 25).toFixed(2)}/hr (Split with Artists)
                        </p>
                      ) : (
                        <p className="text-xs text-neutral-400 mt-1">
                          Agreed Margin: ${proj.baseRate || 0} / approved hr
                        </p>
                      )}

                      {/* Assigned Languages Badges */}
                      {proj.assignedLanguages && proj.assignedLanguages.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-neutral-400 font-medium">Assigned Languages:</span>
                          {proj.assignedLanguages.map((lang) => (
                            <span
                              key={lang}
                              className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-mono"
                            >
                              {lang}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-5 pt-4 border-t border-neutral-800/80 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-neutral-500 block">Approved Volume:</span>
                        <span className="text-sm font-bold text-white">
                          {proj.approvedUnits} hrs
                        </span>
                      </div>

                      <div>
                        <span className="text-neutral-500 block">{isStudio ? "Studio Margin Earned:" : "Margin Earned:"}</span>
                        <span className={`text-sm font-bold ${isStudio ? "text-purple-300" : "text-amber-400"}`}>
                          ${(proj.accumulatedMargin || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: COMMUNITY ROSTER / STUDIO ARTISTS */}
        {activeTab === "community" && (
          <div className="bg-neutral-900/70 border border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-white">
                  {isStudio ? "Enrolled Studio Voice Artists" : "Enrolled Community Contributors"}
                </h4>
                <p className="text-xs text-neutral-400">
                  {isStudio
                    ? "Artists onboarded by your studio with customized compensation payrates."
                    : `Contributors registered using referral code: ${vendor?.vendorCode}`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setCreatedCredentials(null);
                    setShowAddArtistModal(true);
                  }}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 ${
                    isStudio ? "bg-purple-600 hover:bg-purple-500" : "bg-emerald-600 hover:bg-emerald-500"
                  } text-white text-xs font-bold rounded-xl shadow-md transition-all`}
                >
                  {isStudio ? <Mic className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                  <span>{isStudio ? "Onboard New Artist" : "+ Create Contributor Account"}</span>
                </button>
                <button
                  onClick={handleCopyLink}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded-xl flex items-center gap-1.5"
                >
                  <Copy className="w-3 h-3 text-neutral-400" />
                  <span>Referral Link</span>
                </button>
              </div>
            </div>

            {workers.length === 0 ? (
              <div className="py-16 text-center text-neutral-400 text-xs">
                {isStudio
                  ? "No artists added yet. Click 'Onboard New Artist' above to create voice artist accounts."
                  : "No contributors have registered under your agency yet."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-950/50 border-b border-neutral-800 text-neutral-400 uppercase font-semibold">
                    <tr>
                      <th className="py-3 px-4">Contributor / Artist</th>
                      <th className="py-3 px-4">Speaker ID</th>
                      <th className="py-3 px-4">Approval Status</th>
                      {isStudio && <th className="py-3 px-4">Studio Artist Payrate</th>}
                      <th className="py-3 px-4">Approval Rate</th>
                      <th className="py-3 px-4">Approved Tasks</th>
                      {isStudio ? <th className="py-3 px-4 text-right">Actions</th> : <th className="py-3 px-4">Direct Payout</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {workers.map((w) => {
                      // Contributor detailed status badge calculation
                      const isProfileComplete = Boolean(w.isProfileComplete);
                      const accountStatus = w.accountStatus || "pending_intro";
                      const ca = w.contributorAgreement || {};

                      let statusBadge = {
                        label: "Awaiting Profile",
                        style: "bg-amber-500/15 text-amber-300 border-amber-500/30",
                        icon: <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                      };

                      if (!isProfileComplete) {
                        statusBadge = {
                          label: "Awaiting Profile",
                          style: "bg-amber-500/15 text-amber-300 border-amber-500/30",
                          icon: <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                        };
                      } else if (accountStatus === "pending_intro") {
                        statusBadge = {
                          label: "Awaiting Intro",
                          style: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
                          icon: <Mic className="w-3 h-3 text-indigo-400 shrink-0" />
                        };
                      } else if (accountStatus === "rejected") {
                        statusBadge = {
                          label: "Intro Rejected",
                          style: "bg-rose-500/15 text-rose-300 border-rose-500/30",
                          icon: <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                        };
                      } else if (accountStatus === "pending_approval") {
                        statusBadge = {
                          label: "Intro Under Review",
                          style: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
                          icon: <Clock className="w-3 h-3 text-yellow-400 shrink-0" />
                        };
                      } else if (accountStatus === "approved") {
                        if (!ca.signed) {
                          statusBadge = {
                            label: "Awaiting Agreement Sign",
                            style: "bg-blue-500/15 text-blue-300 border-blue-500/30",
                            icon: <FileText className="w-3 h-3 text-blue-400 shrink-0" />
                          };
                        } else if (ca.adminReviewStatus === "pending") {
                          statusBadge = {
                            label: "Agreement Review",
                            style: "bg-purple-500/15 text-purple-300 border-purple-500/30",
                            icon: <FileText className="w-3 h-3 text-purple-400 shrink-0" />
                          };
                        } else if (ca.adminReviewStatus === "rejected") {
                          statusBadge = {
                            label: "Agreement Rejected",
                            style: "bg-rose-500/15 text-rose-300 border-rose-500/30",
                            icon: <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                          };
                        } else {
                          statusBadge = {
                            label: "Approved",
                            style: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
                            icon: <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                          };
                        }
                      }

                      return (
                        <tr key={w._id} className="hover:bg-neutral-800/30 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-white">{w.name}</span>
                              {(w.vendorCode || vendor?.vendorCode) && (
                                <span
                                  className="inline-flex items-center justify-center font-mono font-bold text-[10px] uppercase px-2 py-0.5 rounded-lg bg-neutral-900 border border-purple-500/50 text-purple-300 shadow-sm"
                                  title={`Vendor Code: ${w.vendorCode || vendor?.vendorCode}`}
                                >
                                  🏢 {w.vendorCode || vendor?.vendorCode}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-neutral-500">Joined {new Date(w.joinedAt).toLocaleDateString()}</div>
                          </td>
                          <td className="py-3 px-4 font-mono text-neutral-300">{w.speaker_id}</td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-1 items-start">
                              <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg border shadow-sm ${statusBadge.style}`}>
                                {statusBadge.icon}
                                <span>{statusBadge.label}</span>
                              </span>
                            </div>
                          </td>
                          {isStudio && (
                            <td className="py-3 px-4">
                              <div className="font-mono text-purple-300 font-bold text-sm">
                                ${(w.artistHourlyPayrate || w.hourlyPhrasePayrate || w.perCallPayrate || 0).toFixed(2)}
                                <span className="text-neutral-400 text-xs font-normal"> / approved hr</span>
                              </div>
                              <span className="text-[10px] text-purple-400/80 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                                Direct DC Payout
                              </span>
                            </td>
                          )}
                          <td className="py-3 px-4">
                            <span
                              className={`font-bold px-2 py-0.5 rounded ${
                                w.approvalRate >= 90
                                  ? "bg-emerald-500/15 text-emerald-400"
                                  : w.approvalRate >= 80
                                  ? "bg-amber-500/15 text-amber-400"
                                  : "bg-rose-500/15 text-rose-400"
                              }`}
                            >
                              {w.approvalRate}%
                            </span>
                          </td>
                          <td className="py-3 px-4 text-neutral-200 font-semibold">{w.approvedTasks} units</td>
                          {isStudio ? (
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => {
                                  const rate = w.artistHourlyPayrate || w.hourlyPhrasePayrate || w.perCallPayrate || 0;
                                  setEditingArtist(w);
                                  setEditPayrates({
                                    artistHourlyPayrate: rate,
                                    perCallPayrate: rate,
                                    hourlyPhrasePayrate: rate
                                  });
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-lg text-xs transition-colors"
                              >
                                <Edit2 className="w-3 h-3" />
                                Edit Payrate
                              </button>
                            </td>
                          ) : (
                            <td className="py-3 px-4">
                              {w.hasUpiConfigured ? (
                                <span className="text-emerald-400 font-medium flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5" /> Direct UPI
                                </span>
                              ) : (
                                <span className="text-neutral-500">Pending Setup</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: QUALITY & COACHING INSIGHTS */}
        {activeTab === "insights" && (
          <div className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div>
              <h4 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                Audio Quality Coaching Diagnostic
              </h4>
              <p className="text-xs text-neutral-400 mt-1">
                DataCatalyst QA audit reasons for audio rejections. Coach your {isStudio ? "studio artists" : "callers"} on these feedback points to maintain a pristine pass rate!
              </p>
            </div>

            {rejections.length === 0 ? (
              <div className="py-12 text-center text-neutral-400 text-xs">
                Zero audio rejections detected! Your recordings are high quality.
              </div>
            ) : (
              <div className="space-y-3">
                {rejections.map((r, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3.5 rounded-xl bg-neutral-950 border border-neutral-800">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center text-xs font-bold">
                        {idx + 1}
                      </span>
                      <span className="text-sm font-semibold text-neutral-200">{r.reason}</span>
                    </div>
                    <span className="text-xs font-mono text-neutral-400">{r.count} incidents</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: EARNINGS & PAYOUTS */}
        {activeTab === "earnings" && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5">
                <span className="text-xs text-neutral-400 font-semibold uppercase">
                  {isStudio ? "Studio Margin Accrued" : "Total Accrued Margin"}
                </span>
                <div className={`text-3xl font-black mt-2 ${isStudio ? "text-purple-400" : "text-amber-400"}`}>
                  ${(stats.totalMarginEarned || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  {isStudio ? "Earned from ($Project Rate − $Artist Rate) balance" : "Direct in USD from DataCatalyst (Zero deductions)"}
                </div>
              </div>
              <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5">
                <span className="text-xs text-neutral-400 font-semibold uppercase">
                  {isStudio ? "Artist Direct Payouts" : "Total Approved Units"}
                </span>
                <div className="text-3xl font-black text-emerald-400 mt-2">
                  {isStudio
                    ? `$${(stats.totalArtistPayout || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : (stats.totalApproved || 0)}
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  {isStudio ? "Paid directly to voice artists by DataCatalyst" : "100% Flat Margin Rate Applied"}
                </div>
              </div>
              <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5">
                <span className="text-xs text-neutral-400 font-semibold uppercase">Delivered Audio</span>
                <div className="text-3xl font-black text-white mt-2">{stats.totalApprovedHours || 0} hrs</div>
                <div className="text-xs text-neutral-500 mt-1">{stats.totalApprovedCalls || 0} completed calls</div>
              </div>
            </div>

            {/* Payout Credentials Form */}
            <div className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-6 shadow-sm max-w-2xl">
              <div className="flex items-center justify-between pb-4 border-b border-neutral-800 mb-6">
                <div>
                  <h4 className="text-base font-bold text-white flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-400" />
                    Direct Margin Settlement Credentials
                  </h4>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    DataCatalyst settles your agreed margins directly into this UPI ID / account without reductions.
                  </p>
                </div>
                {vendor?.payoutDetails?.upiId && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Configured
                  </span>
                )}
              </div>

              <form onSubmit={handleSavePayout} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Vendor UPI ID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. agency@okaxis or 9876543210@paytm"
                    value={payoutForm.upiId}
                    onChange={(e) => setPayoutForm({ ...payoutForm, upiId: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm font-mono text-neutral-200 focus:outline-none focus:border-primary-500"
                  />
                  <span className="text-[11px] text-neutral-500 mt-1 block">Primary channel for direct settlement</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Official Account Holder Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Name registered on bank account / PAN"
                    value={payoutForm.accountHolderName}
                    onChange={(e) => setPayoutForm({ ...payoutForm, accountHolderName: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-200 focus:outline-none focus:border-primary-500"
                  />
                </div>

                <div className="pt-2 border-t border-neutral-800/80">
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block mb-3">
                    Bank Account Backup (Optional)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">Bank Account Number</label>
                      <input
                        type="text"
                        placeholder="Optional backup account"
                        value={payoutForm.bankAccountNumber}
                        onChange={(e) => setPayoutForm({ ...payoutForm, bankAccountNumber: e.target.value })}
                        className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-200 focus:outline-none focus:border-primary-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">IFSC Code</label>
                      <input
                        type="text"
                        placeholder="HDFC0001234"
                        value={payoutForm.ifscCode}
                        onChange={(e) => setPayoutForm({ ...payoutForm, ifscCode: e.target.value.toUpperCase() })}
                        className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm uppercase text-neutral-200 focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-neutral-800 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingPayout}
                    className="px-5 py-2.5 bg-primary-600 hover:bg-primary-500 active:scale-95 text-white text-xs font-bold rounded-xl shadow-lg shadow-primary-600/25 transition-all disabled:opacity-50"
                  >
                    {savingPayout ? "Saving Details..." : "Save Settlement Credentials"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* ─── MODAL: CREATE CONTRIBUTOR / ONBOARD ARTIST ACCOUNT ──────────────── */}
      <AnimatePresence>
        {showAddArtistModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl p-6"
            >
              <div className="flex items-center justify-between pb-4 border-b border-neutral-800 mb-6">
                <div className="flex items-center gap-3">
                  <div className={`p-2 ${isStudio ? "bg-purple-600/20 text-purple-400" : "bg-emerald-600/20 text-emerald-400"} rounded-xl`}>
                    {isStudio ? <Mic className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {isStudio ? "Onboard Voice Artist" : "Create Contributor Account"}
                    </h3>
                    <p className="text-xs text-neutral-400">
                      {isStudio
                        ? `Create voice artist login under ${vendor?.name || "your studio"} with custom payrates`
                        : `Create contributor login under ${vendor?.name || "your agency"}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setCreatedCredentials(null);
                    setShowAddArtistModal(false);
                  }}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
                >
                  ✕
                </button>
              </div>

              {createdCredentials ? (
                /* ── SUCCESS VIEW: SHOW & COPY CREDENTIALS ── */
                <div className="space-y-5">
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto border border-emerald-500/30">
                      <CheckCircle2 className="w-7 h-7" />
                    </div>
                    <h3 className="text-lg font-bold text-white">Account Created Successfully!</h3>
                    <p className="text-xs text-neutral-400 max-w-md mx-auto">
                      Share these login credentials with the user. When they log in, they will directly enter their personal profile details (DOB, address, microphone details) before recording their intro sample.
                    </p>
                  </div>

                  {/* Credentials Box */}
                  <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 space-y-3 font-mono text-xs">
                    <div className="flex items-center justify-between pb-2.5 border-b border-neutral-800/80">
                      <span className="text-neutral-500 font-sans font-semibold">Login Portal URL</span>
                      <span className="text-emerald-400 font-medium select-all">{createdCredentials.loginUrl}</span>
                    </div>
                    <div className="flex items-center justify-between pb-2.5 border-b border-neutral-800/80">
                      <span className="text-neutral-500 font-sans font-semibold">Contributor / Speaker ID</span>
                      <span className="text-neutral-200 font-medium">{createdCredentials.name} ({createdCredentials.speaker_id})</span>
                    </div>
                    <div className="flex items-center justify-between pb-2.5 border-b border-neutral-800/80">
                      <span className="text-neutral-500 font-sans font-semibold">Email</span>
                      <span className="text-neutral-200 font-bold select-all">{createdCredentials.email}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 font-sans font-semibold">Password</span>
                      <span className="text-purple-400 font-bold select-all bg-purple-500/10 px-2.5 py-1 rounded-md border border-purple-500/20">
                        {createdCredentials.password}
                      </span>
                    </div>
                  </div>

                  {/* Copy Button */}
                  <button
                    type="button"
                    onClick={() => {
                      const textToCopy = `Voclara Contributor Login Details:\n--------------------------------------\nLogin Link: ${createdCredentials.loginUrl}\nEmail: ${createdCredentials.email}\nPassword: ${createdCredentials.password}\n\nPlease log in using these credentials to complete your profile and begin audio tasks!`;
                      navigator.clipboard.writeText(textToCopy);
                      setCopiedCreds(true);
                      setTimeout(() => setCopiedCreds(false), 2500);
                    }}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all"
                  >
                    {copiedCreds ? (
                      <>
                        <Check className="w-4 h-4 text-white" />
                        <span>Credentials Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy All Credentials for User</span>
                      </>
                    )}
                  </button>

                  <div className="flex justify-between items-center pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCreatedCredentials(null);
                        setArtistForm({
                          firstname: "",
                          lastname: "",
                          email: "",
                          password: "",
                          perCallPayrate: 30,
                          hourlyPhrasePayrate: 150
                        });
                      }}
                      className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-xl flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create Another Account</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreatedCredentials(null);
                        setShowAddArtistModal(false);
                      }}
                      className="px-5 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold rounded-xl"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                /* ── FORM VIEW: EMAIL & PASSWORD CREATION ── */
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1">
                        First Name <span className="text-neutral-500 text-[11px] font-normal">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Priya"
                        value={artistForm.firstname}
                        onChange={(e) => setArtistForm({ ...artistForm, firstname: e.target.value })}
                        className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-200 focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1">
                        Last Name <span className="text-neutral-500 text-[11px] font-normal">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Verma"
                        value={artistForm.lastname}
                        onChange={(e) => setArtistForm({ ...artistForm, lastname: e.target.value })}
                        className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-200 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Login Email <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
                      <input
                        type="email"
                        required
                        placeholder="contributor@example.com"
                        value={artistForm.email}
                        onChange={(e) => setArtistForm({ ...artistForm, email: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-200 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-neutral-300">
                        Login Password <span className="text-rose-400">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const randPass = `dc_${Math.floor(100000 + Math.random() * 900000)}`;
                          setArtistForm({ ...artistForm, password: randPass });
                        }}
                        className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 font-semibold"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Generate Random</span>
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        required
                        placeholder="Minimum 6 characters"
                        value={artistForm.password}
                        onChange={(e) => setArtistForm({ ...artistForm, password: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm font-mono text-neutral-200 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>

                  {/* Studio Decided Custom Payrate Box */}
                  {isStudio && (
                    <div className="p-4 bg-purple-950/30 border border-purple-500/30 rounded-2xl space-y-3">
                      <div className="flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-purple-400" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">
                          Studio Artist Hourly Payrate ($/hr)
                        </span>
                      </div>
                      <p className="text-xs text-neutral-300">
                        Set the hourly payrate in USD for this voice artist. DataCatalyst will pay the artist directly at this rate upon audio approval. The remaining balance of the Project Rate will be credited to the Studio as margin.
                      </p>

                      <div className="pt-1">
                        <label className="block text-xs text-neutral-300 mb-1 font-semibold">
                          Artist Hourly Payrate ($ USD / approved hr)
                        </label>
                        <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2">
                          <span className="text-purple-400 font-bold text-base">$</span>
                          <input
                            type="number"
                            step="0.25"
                            min="0"
                            placeholder="e.g. 18.00"
                            value={artistForm.artistHourlyPayrate !== undefined ? artistForm.artistHourlyPayrate : (artistForm.hourlyPhrasePayrate || artistForm.perCallPayrate || "")}
                            onChange={(e) => {
                              const val = e.target.value === "" ? "" : Number(e.target.value);
                              setArtistForm({
                                ...artistForm,
                                artistHourlyPayrate: val,
                                perCallPayrate: val,
                                hourlyPhrasePayrate: val
                              });
                            }}
                            className="w-full bg-transparent text-sm font-bold text-white focus:outline-none"
                          />
                          <span className="text-xs text-neutral-400 font-medium whitespace-nowrap">/ approved hr</span>
                        </div>
                      </div>

                      <div className="p-2.5 bg-purple-900/20 border border-purple-500/20 rounded-xl text-[11px] text-purple-300 space-y-1">
                        <div className="font-bold flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                          Studio Split Example:
                        </div>
                        <div>
                          If Project Rate = $25.00/hr and Artist Rate = $18.00/hr:
                        </div>
                        <div className="font-mono text-[10px] text-purple-200">
                          • Voice Artist receives: $18.00/hr directly from DataCatalyst<br/>
                          • Studio receives: $7.00/hr ($25 − $18) into studio payout account<br/>
                          • Total Paid across both = $25.00/hr (100% of project rate)
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Self-service profile completion notice */}
                  <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl flex items-start gap-2.5 text-xs text-neutral-400">
                    <FileCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-neutral-200">Self-Service Profile:</strong> You don't have to fill personal details. When the contributor logs in with these credentials, they will directly enter their Date of Birth, Regional Language, Address, and Microphone specifications before voice testing.
                    </span>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
                    <button
                      type="button"
                      onClick={() => setShowAddArtistModal(false)}
                      className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submittingArtist}
                      className={`px-5 py-2 ${
                        isStudio ? "bg-purple-600 hover:bg-purple-500 shadow-purple-600/25" : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/25"
                      } active:scale-95 text-white text-xs font-bold rounded-xl shadow-lg transition-all disabled:opacity-50`}
                    >
                      {submittingArtist ? "Creating Account..." : isStudio ? "Create Artist Account" : "Create Contributor Account"}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL: EDIT ARTIST PAYRATE ──────────────────────────────────────── */}
      <AnimatePresence>
        {editingArtist && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-md p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-4 border-b border-neutral-800 mb-5">
                <div>
                  <h3 className="text-base font-bold text-white">Edit Artist Payrate</h3>
                  <p className="text-xs text-neutral-400">{editingArtist.name} ({editingArtist.speaker_id})</p>
                </div>
                <button
                  onClick={() => setEditingArtist(null)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleUpdatePayrate} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Artist Hourly Payrate ($ USD / approved hr)
                  </label>
                  <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2">
                    <span className="text-purple-400 font-bold text-base">$</span>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={editPayrates.artistHourlyPayrate !== undefined ? editPayrates.artistHourlyPayrate : (editPayrates.hourlyPhrasePayrate || editPayrates.perCallPayrate || 0)}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        setEditPayrates({
                          artistHourlyPayrate: val,
                          perCallPayrate: val,
                          hourlyPhrasePayrate: val
                        });
                      }}
                      className="w-full bg-transparent text-sm font-bold text-white focus:outline-none"
                    />
                    <span className="text-xs text-neutral-400 font-medium whitespace-nowrap">/ approved hr</span>
                  </div>
                </div>

                <div className="p-3 bg-purple-950/30 border border-purple-500/20 rounded-xl text-xs text-purple-300">
                  <div className="font-bold mb-0.5">Project Rate Split Rule:</div>
                  DataCatalyst pays this artist this hourly rate directly. The studio receives the remaining balance ($Project Rate − $Artist Rate) upon client approval.
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setEditingArtist(null)}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingPayrate}
                    className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-600/25 disabled:opacity-50"
                  >
                    {savingPayrate ? "Saving..." : "Save Payrate"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
