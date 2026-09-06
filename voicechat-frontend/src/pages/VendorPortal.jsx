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
  Wallet,
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
  AlertTriangle,
  LayoutDashboard,
  Menu,
  X,
  ChevronRight,
  BarChart2,
  BarChart3,
  Globe,
  Search,
  Users
} from "lucide-react";
import { apiGet, apiPostJson, apiPutJson, BASE_URL } from "../lib/api.js";
import Swal from "sweetalert2";
import PartnerAgreementGate from "../components/PartnerAgreementGate.jsx";

function formatSecs(secs) {
  if (!secs || secs <= 0) return "0m 0s";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export default function VendorPortal() {
  const navigate = useNavigate();
  const [vendor, setVendor] = useState(null);
  const [stats, setStats] = useState({});
  const [projects, setProjects] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [rejections, setRejections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedRefId, setCopiedRefId] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard"); // 'dashboard' | 'projects' | 'artists' | 'insights' | 'earnings'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [downloadingAgreement, setDownloadingAgreement] = useState(false);

  // Contributor / Voice Artist Account Creation State
  const [showAddArtistModal, setShowAddArtistModal] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [studioAllocatedProjects, setStudioAllocatedProjects] = useState([]);
  const [loadingAllocatedProjects, setLoadingAllocatedProjects] = useState(false);
  const [selectedProjectKeys, setSelectedProjectKeys] = useState(new Set());
  const [newArtistPayrates, setNewArtistPayrates] = useState([]);
  const [submittingArtist, setSubmittingArtist] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [copiedCreds, setCopiedCreds] = useState(false);
  const [artistForm, setArtistForm] = useState({
    firstname: "",
    lastname: "",
    email: "",
    password: ""
  });

  // Edit Payrate Modal State
  const [editingArtist, setEditingArtist] = useState(null);
  const [artistProjectPayrates, setArtistProjectPayrates] = useState([]);
  const [loadingArtistPayrates, setLoadingArtistPayrates] = useState(false);
  const [savingPayrate, setSavingPayrate] = useState(false);

  // Contributor Analytics Modal State
  const [selectedAnalyticsArtist, setSelectedAnalyticsArtist] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsCategoryFilter, setAnalyticsCategoryFilter] = useState("all");

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

  const handleCopyReference = (refId, id) => {
    if (!refId) return;
    navigator.clipboard.writeText(refId);
    setCopiedRefId(id);
    setTimeout(() => setCopiedRefId(null), 2000);
  };

  const handleLogout = () => {
    localStorage.removeItem("vc_vendor_token");
    localStorage.removeItem("vc_vendor_info");
    navigate("/vendor/login");
  };

  // Open Add Contributor Modal and load Studio allocated projects if studio
  const handleOpenAddArtist = async () => {
    setCreateStep(1);
    setCreatedCredentials(null);
    setArtistForm({
      firstname: "",
      lastname: "",
      email: "",
      password: ""
    });
    setShowAddArtistModal(true);

    if (isStudio) {
      setLoadingAllocatedProjects(true);
      try {
        const res = await apiGet("/api/vendor/allocated-projects");
        if (res?.ok && Array.isArray(res.allocatedProjects)) {
          setStudioAllocatedProjects(res.allocatedProjects);
          // By default, select all allocated projects & languages
          const allKeys = new Set(res.allocatedProjects.map((p) => `${p.category}_${p.subprojectId}_${p.language}`));
          setSelectedProjectKeys(allKeys);
          // Pre-populate rates
          const initialRates = res.allocatedProjects.map((p) => {
            const defaultArtist = Math.min(18, p.projectRate);
            return {
              category: p.category,
              subprojectId: p.subprojectId,
              subprojectName: p.subprojectName,
              language: p.language,
              projectRate: p.projectRate,
              artistRate: defaultArtist,
              studioRate: Math.max(0, Number((p.projectRate - defaultArtist).toFixed(2)))
            };
          });
          setNewArtistPayrates(initialRates);
        } else {
          setStudioAllocatedProjects([]);
          setSelectedProjectKeys(new Set());
          setNewArtistPayrates([]);
        }
      } catch (err) {
        console.error("Failed to load studio allocated projects:", err);
      } finally {
        setLoadingAllocatedProjects(false);
      }
    }
  };

  // Toggle selection of a project-language in Step 2
  const toggleProjectSelection = (key) => {
    setSelectedProjectKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Select all or deselect all in Step 2
  const handleSelectAllProjects = (selectAll) => {
    if (selectAll) {
      const allKeys = new Set(studioAllocatedProjects.map((p) => `${p.category}_${p.subprojectId}_${p.language}`));
      setSelectedProjectKeys(allKeys);
    } else {
      setSelectedProjectKeys(new Set());
    }
  };

  // Proceed from Step 2 (Project Selection) to Step 3 (Payrates)
  const handleProceedToPayrates = () => {
    if (selectedProjectKeys.size === 0) {
      Swal.fire("Selection Required", "Please select at least one project and language to assign to this contributor.", "warning");
      return;
    }

    const selectedItems = studioAllocatedProjects.filter((p) =>
      selectedProjectKeys.has(`${p.category}_${p.subprojectId}_${p.language}`)
    );

    // Keep existing typed rate if already in state, else default to 18
    const updatedRates = selectedItems.map((item) => {
      const existing = newArtistPayrates.find(
        (r) => r.category === item.category && String(r.subprojectId) === String(item.subprojectId) && r.language === item.language
      );
      const artistRate = existing ? existing.artistRate : Math.min(18, item.projectRate);
      return {
        category: item.category,
        subprojectId: item.subprojectId,
        subprojectName: item.subprojectName,
        language: item.language,
        projectRate: item.projectRate,
        artistRate,
        studioRate: Math.max(0, Number((item.projectRate - artistRate).toFixed(2)))
      };
    });

    setNewArtistPayrates(updatedRates);
    setCreateStep(3);
  };

  // Edit payrate in Step 3
  const handleNewArtistRateChange = (index, val) => {
    setNewArtistPayrates((prev) => {
      const copy = [...prev];
      const parsed = parseFloat(val);
      copy[index].artistRate = isNaN(parsed) ? 0 : parsed;
      copy[index].studioRate = Math.max(0, Number((copy[index].projectRate - (isNaN(parsed) ? 0 : parsed)).toFixed(2)));
      return copy;
    });
  };

  // Open Contributor Analytics Modal
  const handleOpenAnalyticsModal = async (artist) => {
    setSelectedAnalyticsArtist(artist);
    setAnalyticsData(null);
    setLoadingAnalytics(true);
    setAnalyticsCategoryFilter("all");
    try {
      const res = await apiGet(`/api/vendor/artists/${artist._id}/analytics`);
      setAnalyticsData(res);
    } catch (err) {
      console.error("Failed to load contributor analytics:", err);
      Swal.fire("Error", err.message || "Failed to load contributor analytics.", "error");
    } finally {
      setLoadingAnalytics(false);
    }
  };

  // Vendor creates new contributor / artist account with email and password
  const handleCreateUser = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!artistForm.email || !artistForm.password) {
      Swal.fire("Validation Error", "Email and password are required.", "warning");
      return;
    }
    if (artistForm.password.length < 6) {
      Swal.fire("Validation Error", "Password must be at least 6 characters long.", "warning");
      return;
    }

    if (isStudio) {
      if (newArtistPayrates.length === 0) {
        Swal.fire("Projects Required", "Please assign at least one project and language to this voice artist.", "warning");
        return;
      }
      for (const item of newArtistPayrates) {
        if (item.artistRate > item.projectRate) {
          Swal.fire(
            "Payrate Exceeds Project Rate",
            `Contributor payrate ($${item.artistRate}/hr) cannot exceed project rate ($${item.projectRate}/hr) for "${item.subprojectName}" (${String(item.language).toUpperCase()}).`,
            "warning"
          );
          return;
        }
        if (item.artistRate < 0) {
          Swal.fire("Invalid Payrate", `Contributor payrate cannot be negative for "${item.subprojectName}".`, "warning");
          return;
        }
      }
    }

    setSubmittingArtist(true);
    try {
      const payload = {
        email: artistForm.email.trim(),
        password: artistForm.password.trim(),
        firstname: artistForm.firstname.trim(),
        lastname: artistForm.lastname.trim(),
        projectPayrates: isStudio ? newArtistPayrates : []
      };

      const res = await apiPostJson("/api/vendor/users", payload);

      setCreatedCredentials({
        email: res.credentials?.email || artistForm.email.trim(),
        password: res.credentials?.password || artistForm.password.trim(),
        loginUrl: `${window.location.origin}/login`,
        name: res.user?.name || artistForm.firstname || "Contributor",
        speaker_id: res.user?.speaker_id || "",
        assignedCount: isStudio ? newArtistPayrates.length : null
      });

      setArtistForm({
        firstname: "",
        lastname: "",
        email: "",
        password: ""
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

  // Open Studio Artist Payrates Configuration Modal
  const handleOpenPayrateModal = async (artist) => {
    setEditingArtist(artist);
    setLoadingArtistPayrates(true);
    try {
      const res = await apiGet(`/api/vendor/artists/${artist._id}/payrates`);
      if (res?.ok && Array.isArray(res.payrates)) {
        setArtistProjectPayrates(res.payrates);
      } else {
        setArtistProjectPayrates([]);
      }
    } catch (err) {
      console.error("Failed to load artist project payrates:", err);
      Swal.fire("Error", err.message || "Failed to load project payrates", "error");
      setArtistProjectPayrates([]);
    } finally {
      setLoadingArtistPayrates(false);
    }
  };

  // Change individual project-language payrate in state
  const handleRateChange = (index, val) => {
    setArtistProjectPayrates((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      const num = Number(val);
      item.artistRate = isNaN(num) ? 0 : num;
      item.studioRate = Math.max(0, Number((item.projectRate - item.artistRate).toFixed(2)));
      updated[index] = item;
      return updated;
    });
  };

  // Studio updates project-wise artist payrates
  const handleUpdatePayratesSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!editingArtist) return;

    for (const item of artistProjectPayrates) {
      if (item.artistRate > item.projectRate) {
        Swal.fire(
          "Payrate Exceeds Project Rate",
          `Contributor payrate ($${item.artistRate}/hr) cannot exceed project rate ($${item.projectRate}/hr) for "${item.subprojectName}" (${String(item.language).toUpperCase()}).`,
          "warning"
        );
        return;
      }
      if (item.artistRate < 0) {
        Swal.fire(
          "Invalid Payrate",
          `Contributor payrate cannot be negative for "${item.subprojectName}".`,
          "warning"
        );
        return;
      }
    }

    setSavingPayrate(true);
    try {
      await apiPutJson(`/api/vendor/artists/${editingArtist._id}/payrates`, {
        items: artistProjectPayrates
      });
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Project payrates updated successfully!",
        timer: 3000,
        showConfirmButton: false,
        background: "#171717",
        color: "#fff"
      });
      setEditingArtist(null);
      fetchPortalData();
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to update project payrates", "error");
    } finally {
      setSavingPayrate(false);
    }
  };

  const handleUpdatePayrate = handleUpdatePayratesSubmit;

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

  // If Master Agreement has not been signed, present Partner Onboarding & Signing Gate
  if (vendor && !vendor.agreementSigned) {
    return (
      <PartnerAgreementGate
        vendor={vendor}
        onSigned={(updatedVendor) => {
          setVendor((prev) => ({
            ...prev,
            ...updatedVendor,
            agreementSigned: true
          }));
          fetchPortalData();
        }}
        onLogout={handleLogout}
      />
    );
  }

  const handleDownloadAgreement = async () => {
    if (downloadingAgreement) return;
    setDownloadingAgreement(true);

    try {
      const token = localStorage.getItem("vc_vendor_token") || localStorage.getItem("vc_token");
      const url = `${BASE_URL}/api/vendor/agreement-pdf${token ? `?token=${encodeURIComponent(token)}` : ""}`;

      const res = await fetch(url, {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include"
      });

      if (!res.ok) {
        let errMessage = "Could not download agreement PDF";
        try {
          const errData = await res.json();
          errMessage = errData.error || errMessage;
        } catch (_) {}
        throw new Error(errMessage);
      }

      const blob = await res.blob();
      const pdfBlob = new Blob([blob], { type: "application/pdf" });
      const blobUrl = window.URL.createObjectURL(pdfBlob);
      const fileName = `${vendor?.vendorCode || "Partner"}_${vendor?.isStudio ? "Studio" : "Vendor"}_Master_Agreement.pdf`;

      // Try opening in new tab
      const newTab = window.open(blobUrl, "_blank");
      if (!newTab || newTab.closed || typeof newTab.closed === "undefined") {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }

      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 60000);
    } catch (err) {
      console.error("Failed to download agreement:", err);
      Swal.fire({
        icon: "error",
        title: "Agreement PDF",
        text: err.message || "Failed to load agreement PDF.",
        background: "#171717",
        color: "#fff",
        confirmButtonColor: vendor?.isStudio ? "#9333ea" : "#059669"
      });
    } finally {
      setDownloadingAgreement(false);
    }
  };


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

  const navItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard
    },
    {
      id: "projects",
      label: `Assigned Sub-Projects (${projects.length})`,
      icon: Layers
    },
    {
      id: "artists",
      label: `Studio Artists (${workers.length})`,
      icon: isStudio ? Mic : UsersRound
    },
    {
      id: "insights",
      label: "Quality & Coaching Insights",
      icon: Sparkles
    },
    {
      id: "earnings",
      label: "Earnings & Payouts",
      icon: Wallet,
      hasAlert: !vendor?.payoutDetails?.upiId
    }
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex font-sans">
      {/* ─── LEFT SIDEBAR (DESKTOP) ────────────────────────── */}
      <aside className="hidden md:flex md:w-64 flex-col fixed inset-y-0 left-0 z-30 bg-neutral-900/95 border-r border-neutral-800 backdrop-blur-xl">
        {/* Sidebar Brand / Vendor Header */}
        <div className="p-5 border-b border-neutral-800/80 flex items-center gap-3">
          <div className="p-2 rounded-2xl border border-neutral-800/90 bg-neutral-950/80 shrink-0 flex items-center justify-center shadow-sm">
            <img src="/logo.png" alt="Voclara Logo" className="w-7 h-7 object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-white text-sm truncate" title={vendor?.name}>
              {vendor?.name || "Vendor Partner"}
            </h2>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-neutral-800 text-primary-400 border border-neutral-700">
                {vendor?.vendorCode || "---"}
              </span>
              <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${
                isStudio
                  ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                  : "bg-blue-500/20 text-blue-300 border-blue-500/30"
              }`}>
                {isStudio ? "Studio" : "Community"}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Items (Exact 5 options requested) */}
        <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id || (item.id === "artists" && activeTab === "community");
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all group ${
                  isActive
                    ? "bg-gradient-to-r from-primary-600/20 via-primary-600/10 to-transparent text-white border border-primary-500/30 shadow-md shadow-primary-950/40"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-3 truncate">
                  <Icon className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? "text-primary-400" : "text-neutral-500 group-hover:text-neutral-300"
                  }`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.hasAlert && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0 ml-1.5" title="Action required" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-neutral-800/80 space-y-2 bg-neutral-900/60">
          {vendor?.agreementSigned && (
            <button
              onClick={handleDownloadAgreement}
              disabled={downloadingAgreement}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-neutral-950/70 hover:bg-neutral-800 disabled:opacity-60 text-neutral-300 hover:text-white border border-neutral-800 hover:border-neutral-700 text-xs font-semibold transition-all"
              title="Download Executed Master Agreement PDF"
            >
              <div className="flex items-center gap-2 truncate">
                {downloadingAgreement ? (
                  <RefreshCw className="w-3.5 h-3.5 text-primary-400 animate-spin shrink-0" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                )}
                <span className="truncate">{downloadingAgreement ? "Opening PDF..." : "Agreement PDF"}</span>
              </div>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            </button>
          )}

          <button
            onClick={handleOpenAddArtist}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-all ${
              isStudio
                ? "bg-purple-600 hover:bg-purple-500 shadow-purple-600/20"
                : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20"
            }`}
          >
            {isStudio ? <Mic className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
            <span>{isStudio ? "+ Onboard Artist" : "+ Create Contributor"}</span>
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors text-xs font-semibold"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ─── MOBILE DRAWER OVERLAY ──────────────────────────── */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm md:hidden"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-neutral-900 border-r border-neutral-800 shadow-2xl md:hidden"
            >
              {/* Header with Close */}
              <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 rounded-xl border border-neutral-800/90 bg-neutral-950/80 shrink-0 flex items-center justify-center shadow-sm">
                    <img src="/logo.png" alt="Voclara Logo" className="w-6 h-6 object-contain" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-bold text-white text-sm truncate">{vendor?.name || "Vendor Partner"}</h2>
                    <span className="text-[10px] font-mono text-primary-400">{vendor?.vendorCode}</span>
                  </div>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mobile Navigation List */}
              <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id || (item.id === "artists" && activeTab === "community");
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-semibold transition-all ${
                        isActive
                          ? "bg-gradient-to-r from-primary-600/25 to-primary-600/5 text-white border border-primary-500/40 font-bold"
                          : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-4 h-4 ${isActive ? "text-primary-400" : "text-neutral-500"}`} />
                        <span>{item.label}</span>
                      </div>
                      {item.hasAlert && (
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                      )}
                    </button>
                  );
                })}
              </nav>

              {/* Mobile Footer */}
              <div className="p-3 border-t border-neutral-800 space-y-2 bg-neutral-900/80">
                {vendor?.agreementSigned && (
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleDownloadAgreement();
                    }}
                    disabled={downloadingAgreement}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-neutral-950/70 hover:bg-neutral-800 disabled:opacity-60 text-neutral-300 hover:text-white border border-neutral-800 hover:border-neutral-700 text-xs font-semibold transition-all"
                    title="Download Executed Master Agreement PDF"
                  >
                    <div className="flex items-center gap-2 truncate">
                      {downloadingAgreement ? (
                        <RefreshCw className="w-3.5 h-3.5 text-primary-400 animate-spin shrink-0" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                      )}
                      <span className="truncate">{downloadingAgreement ? "Opening PDF..." : "Agreement PDF"}</span>
                    </div>
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  </button>
                )}

                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleOpenAddArtist();
                  }}
                  className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-white shadow-md ${
                    isStudio ? "bg-purple-600 hover:bg-purple-500" : "bg-emerald-600 hover:bg-emerald-500"
                  }`}
                >
                  {isStudio ? <Mic className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                  <span>{isStudio ? "+ Onboard Voice Artist" : "+ Create Contributor"}</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 text-xs font-semibold"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ─── MAIN CONTENT WRAPPER ──────────────────────────── */}
      <div className="flex-1 md:ml-64 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="bg-neutral-900/80 border-b border-neutral-800 sticky top-0 z-20 backdrop-blur-md px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-xl bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700"
              title="Open Navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-white truncate">
                {activeTab === "dashboard" && "Dashboard"}
                {activeTab === "projects" && `Assigned Sub-Projects (${projects.length})`}
                {(activeTab === "artists" || activeTab === "community") && `Studio Artists (${workers.length})`}
                {activeTab === "insights" && "Quality & Coaching Insights"}
                {activeTab === "earnings" && "Earnings & Payouts"}
              </h1>
              <p className="text-[11px] text-neutral-400 truncate hidden sm:block">
                DataCatalyst Operations Portal • {vendor?.name || "Vendor Partner"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {vendor?.agreementSigned && (
              <button
                onClick={handleDownloadAgreement}
                disabled={downloadingAgreement}
                className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-60 text-neutral-200 text-xs font-semibold rounded-xl border border-neutral-700 transition-all shadow-sm"
                title="Download Executed Master Agreement PDF"
              >
                {downloadingAgreement ? (
                  <RefreshCw className="w-3.5 h-3.5 text-primary-400 animate-spin" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-primary-400" />
                )}
                <span>{downloadingAgreement ? "Opening PDF..." : "Agreement PDF"}</span>
              </button>
            )}

            <button
              onClick={handleOpenAddArtist}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 ${
                isStudio
                  ? "bg-purple-600 hover:bg-purple-500 shadow-purple-600/20"
                  : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20"
              } text-white text-xs font-semibold rounded-xl shadow-lg transition-all`}
            >
              {isStudio ? <Mic className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isStudio ? "Onboard Voice Artist" : "Create Contributor"}</span>
              <span className="sm:hidden">{isStudio ? "+ Artist" : "+ User"}</span>
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 w-full max-w-[1720px] mx-auto space-y-6">
          {/* TAB 1: DASHBOARD */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              {/* Banner: Studio Mode vs Fair Pay Mode */}
              {isStudio ? (
                <div className="relative overflow-hidden rounded-3xl border border-purple-500/30 bg-gradient-to-br from-neutral-900 via-purple-950/20 to-neutral-900 p-5 shadow-xl">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
                  <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="p-2.5 bg-neutral-950/80 rounded-2xl border border-purple-500/40 shrink-0 flex items-center justify-center shadow-md">
                        <img src="/logo.png" alt="Voclara Logo" className="w-7 h-7 object-contain" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white flex items-center gap-2">
                          Studio Partner Mode Active
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            Direct Payrate Control
                          </span>
                        </div>
                        <p className="text-xs text-neutral-300 mt-0.5 max-w-3xl">
                          As a Studio Partner, you decide the exact compensation rates for your voice artists. Artists must still pass all standard intro voice auditions and agreement checks before recording.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleOpenAddArtist}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-purple-600/20 shrink-0"
                    >
                      + Add Voice Artist
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Direct Contributor Assurance for Standard Vendor */}
                  <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-neutral-900 via-emerald-950/20 to-neutral-900 p-5 shadow-xl">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="relative z-10 flex items-center gap-3.5">
                      <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30 shrink-0">
                        <ShieldCheck className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white flex items-center gap-2">
                          Fair Pay & Direct Contributor Assurance
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Active
                          </span>
                        </div>
                        <p className="text-xs text-neutral-300 mt-0.5 max-w-3xl">
                          Every contributor in your community is paid 100% of standard project pay directly into their UPI account by DataCatalyst. Your vendor earnings are paid independently as an operations & quality incentive margin.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Prompt Vendor to Enter UPI Details if missing */}
                  {!vendor?.payoutDetails?.upiId && (
                    <div className="relative overflow-hidden rounded-3xl border border-neutral-700/80 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 p-5 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5">
                        <div className="p-2.5 bg-neutral-800 text-amber-400 rounded-2xl border border-neutral-700 shrink-0">
                          <AlertCircle className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white flex items-center gap-2">
                            Payment Credentials Missing
                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
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
                        className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white font-bold text-xs rounded-xl transition-all shadow-md shrink-0"
                      >
                        Setup UPI Now →
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* QA Approval & Direct Margin Metrics */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Card 1: QA Approval Pass Rate & Performance */}
                <div className="lg:col-span-2 relative overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 p-6 shadow-xl flex flex-col justify-between">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/5 rounded-full blur-3xl pointer-events-none" />
                  <div className="relative z-10">
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

                  <div className="relative z-10 mt-5 p-3 rounded-xl bg-neutral-950/70 border border-neutral-800 flex items-center gap-2.5">
                    <Sparkles className="w-4 h-4 text-primary-400 shrink-0" />
                    <span className="text-xs text-neutral-300">
                      {isStudio
                        ? "High pass rates ensure your studio audio is prioritized and approved rapidly by internal QA."
                        : "Direct margin applies to 100% of your approved units with zero quality multiplier deductions."}
                    </span>
                  </div>
                </div>

                {/* Card 2: Compensation / Margin Overview */}
                <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 p-6 shadow-xl flex flex-col justify-between">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
                  <div className="relative z-10">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                        {isStudio ? "Studio Margin Accrued" : "Accrued Margin"}
                      </span>
                      {isStudio ? <Wallet className="w-5 h-5 text-purple-400" /> : <Wallet className="w-5 h-5 text-emerald-400" />}
                    </div>

                    {isStudio ? (
                      <div className="mt-3">
                        <div className="text-4xl font-black text-purple-400">
                          {(stats.totalMarginEarned || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}$
                        </div>
                        <p className="text-xs text-neutral-400 mt-1">
                          Accrued from project rate split (Project Rate − Artist Rate) across {stats.totalApprovedHours || 0} approved hrs.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-3">
                        <div className="text-4xl font-black text-emerald-400">
                          {(stats.totalMarginEarned || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}$
                        </div>
                        <p className="text-xs text-neutral-400 mt-1">
                          Direct margin earned across all approved hours delivered by your contributors.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="relative z-10 mt-6 pt-4 border-t border-neutral-800/80 space-y-2.5 text-xs">
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
                          {(stats.totalArtistPayout || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}$
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
            </div>
          )}

          {/* TAB 2: ASSIGNED PROJECTS */}
          {activeTab === "projects" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-primary-400" />
                    Assigned Sub-Projects ({projects.length})
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Projects allocated to your partner account with configured project rates and language quotas.
                  </p>
                </div>
              </div>

              {projects.length === 0 ? (
                <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 py-16 text-center shadow-xl">
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
                      onClick={() => navigate(`/vendor/projects/${proj.subprojectId}/squad-summary?category=${proj.category}`)}
                      className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 hover:border-purple-500/50 hover:shadow-2xl hover:scale-[1.01] p-6 transition-all shadow-xl flex flex-col justify-between cursor-pointer group"
                      title="Click to view Squad Analytics & Contributor Breakdown"
                    >
                      <div className="absolute top-0 right-0 w-48 h-48 bg-primary-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-purple-500/10 transition-colors" />
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                            {proj.category.replace("_", " ").toUpperCase()}
                          </span>
                          <span className="text-xs font-bold text-emerald-400">{proj.approvalRate}% Approval</span>
                        </div>

                        <h4 className="text-base font-bold text-white group-hover:text-purple-300 transition-colors">{proj.subprojectName}</h4>
                        {isStudio ? (
                          <p className="text-xs text-purple-300 mt-1 font-medium">
                            Project Rate: {Number(proj.projectPayrate || 25).toFixed(2)}/hr (Split with Artists)
                          </p>
                        ) : (
                          <p className="text-xs text-neutral-400 mt-1">
                            Agreed Margin: {proj.baseRate || 0} / approved hr
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

                      <div className="relative z-10 mt-5 pt-4 border-t border-neutral-800/80 grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-neutral-500 block">Approved Volume:</span>
                          <span className="text-sm font-bold text-white font-mono">
                            {proj.approvedUnits} hrs
                          </span>
                        </div>

                        <div>
                          <span className="text-neutral-500 block">{isStudio ? "Studio Margin Earned:" : "Margin Earned:"}</span>
                          <span className={`text-sm font-bold font-mono ${isStudio ? "text-purple-300" : "text-emerald-400"}`}>
                            {(proj.accumulatedMargin || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>

                      {/* Clickable Squad Analytics Footer Callout */}
                      <div className="relative z-10 mt-4 pt-3 border-t border-neutral-800/60 flex items-center justify-between text-xs text-purple-400 group-hover:text-purple-300 font-semibold transition-colors">
                        <span className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          <span>View Squad Output & Contributor Breakdown</span>
                        </span>
                        <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: COMMUNITY ROSTER / STUDIO ARTISTS */}
          {(activeTab === "artists" || activeTab === "community") && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    {isStudio ? <Mic className="w-5 h-5 text-purple-400" /> : <UsersRound className="w-5 h-5 text-primary-400" />}
                    Studio Artists ({workers.length})
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {isStudio
                      ? "Voice artists onboarded by your studio with customized compensation payrates."
                      : `Contributors registered under your agency code: ${vendor?.vendorCode || "---"}`}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleOpenAddArtist}
                    className={`flex items-center gap-1.5 px-3.5 py-2 ${
                      isStudio ? "bg-purple-600 hover:bg-purple-500" : "bg-emerald-600 hover:bg-emerald-500"
                    } text-white text-xs font-bold rounded-xl shadow-md transition-all`}
                  >
                    {isStudio ? <Mic className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                    <span>{isStudio ? "+ Onboard New Artist" : "+ Create Contributor"}</span>
                  </button>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 shadow-xl">
                <div className="absolute top-0 right-0 w-72 h-72 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
                {workers.length === 0 ? (
                  <div className="py-16 text-center text-neutral-400 text-xs">
                    {isStudio
                      ? "No artists added yet. Click '+ Onboard New Artist' above to create voice artist accounts."
                      : "No contributors have registered under your agency yet."}
                  </div>
                ) : (
                  <div className="overflow-x-auto relative z-10">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-neutral-950/60 border-b border-neutral-800 text-neutral-400 uppercase font-semibold">
                        <tr>
                          <th className="py-3.5 px-4">Contributor / Artist</th>
                          <th className="py-3.5 px-4">Speaker ID</th>
                          <th className="py-3.5 px-4">Approval Status</th>
                          <th className="py-3.5 px-4">Approval Rate</th>
                          <th className="py-3.5 px-4">Approved Tasks</th>
                          {isStudio ? <th className="py-3.5 px-4 text-right">Actions</th> : <th className="py-3.5 px-4">Direct Payout</th>}
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
                              <td className="py-3.5 px-4">
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
                              <td className="py-3.5 px-4 font-mono text-neutral-300">{w.speaker_id}</td>
                              <td className="py-3.5 px-4">
                                <div className="flex flex-col gap-1 items-start">
                                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg border shadow-sm ${statusBadge.style}`}>
                                    {statusBadge.icon}
                                    <span>{statusBadge.label}</span>
                                  </span>
                                </div>
                              </td>
                              <td className="py-3.5 px-4">
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
                              <td className="py-3.5 px-4 text-neutral-200 font-semibold">{w.approvedTasks} units</td>
                              {isStudio ? (
                                <td className="py-3.5 px-4 text-right">
                                  <div className="inline-flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => handleOpenAnalyticsModal(w)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-950/60 hover:bg-purple-900/60 text-purple-300 hover:text-white border border-purple-800/60 rounded-lg text-xs font-semibold transition-colors shadow-sm"
                                      title="View Contributor Project Analytics"
                                    >
                                      <BarChart2 className="w-3 h-3 text-purple-400" />
                                      Analytics
                                    </button>
                                    <button
                                      onClick={() => handleOpenPayrateModal(w)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-lg text-xs font-semibold transition-colors"
                                      title="Edit Payrates"
                                    >
                                      <Edit2 className="w-3 h-3 text-neutral-400" />
                                      Edit
                                    </button>
                                  </div>
                                </td>
                              ) : (
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center justify-between gap-2">
                                    {w.hasUpiConfigured ? (
                                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                                        <Check className="w-3.5 h-3.5" /> Direct UPI
                                      </span>
                                    ) : (
                                      <span className="text-neutral-500">Pending Setup</span>
                                    )}
                                    <button
                                      onClick={() => handleOpenAnalyticsModal(w)}
                                      className="inline-flex items-center gap-1 px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-lg text-xs font-semibold transition-colors"
                                      title="View Contributor Analytics"
                                    >
                                      <BarChart2 className="w-3 h-3 text-primary-400" />
                                      Analytics
                                    </button>
                                  </div>
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
            </div>
          )}

          {/* TAB 4: QUALITY & COACHING INSIGHTS */}
          {activeTab === "insights" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  Quality & Coaching Insights
                </h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  DataCatalyst QA audit reasons for audio rejections. Coach your {isStudio ? "studio artists" : "callers"} on these feedback points to maintain a pristine pass rate!
                </p>
              </div>

              <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 p-6 shadow-xl space-y-6">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/5 rounded-full blur-3xl pointer-events-none" />
                <div className="relative z-10">
                  <h4 className="text-base font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                    Audio Quality Coaching Diagnostic
                  </h4>
                  <p className="text-xs text-neutral-400 mt-1">
                    Systematic rejection feedback aggregated from live quality audit reviews.
                  </p>
                </div>

                {rejections.length === 0 ? (
                  <div className="py-12 text-center text-neutral-400 text-xs relative z-10">
                    Zero audio rejections detected! Your recordings are high quality.
                  </div>
                ) : (
                  <div className="space-y-3 relative z-10">
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
            </div>
          )}

          {/* TAB 5: EARNINGS & PAYOUTS */}
          {activeTab === "earnings" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-emerald-400" />
                  Earnings & Payouts
                </h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Review accrued margins, artist payouts, and update direct settlement credentials.
                </p>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Total Accrued Margin */}
                <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 p-6 shadow-xl">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/5 rounded-full blur-2xl pointer-events-none" />
                  <span className="text-xs text-neutral-400 font-semibold uppercase">
                    {isStudio ? "Studio Margin Accrued" : "Total Accrued Margin"}
                  </span>
                  <div className={`text-3xl font-black mt-2 font-mono ${isStudio ? "text-purple-400" : "text-emerald-400"}`}>
                    {(stats.totalMarginEarned || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}$
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    {isStudio
                      ? `Accrued from project rate split (Project Rate − Artist Rate) across ${stats.totalApprovedHours || 0} approved hrs.`
                      : "Direct margin earned across all approved hours delivered by your contributors."}
                  </div>
                </div>

                {/* 2. Total Paid to Vendor */}
                <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 p-6 shadow-xl">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-emerald-400 font-semibold uppercase">
                      Total Paid Out
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Settled ✓
                    </span>
                  </div>
                  <div className="text-3xl font-black text-emerald-400 mt-2 font-mono">
                    {(stats.totalPaidOut || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}$
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    Transferred to your bank / UPI by DataCatalyst
                  </div>
                </div>

                {/* 3. Pending Settlement Balance */}
                <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 p-6 shadow-xl">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-400 font-semibold uppercase">
                      Pending Settlement
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      Current
                    </span>
                  </div>
                  <div className="text-3xl font-black text-cyan-300 mt-2 font-mono">
                    {(stats.remainingBalance !== undefined ? stats.remainingBalance : Math.max(0, (stats.totalMarginEarned || 0) - (stats.totalPaidOut || 0))).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}$
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    Accrued margin awaiting upcoming disbursement
                  </div>
                </div>

                {/* 4. Delivered Audio / Artist Payouts */}
                <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 p-6 shadow-xl">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />
                  <span className="text-xs text-neutral-400 font-semibold uppercase">
                    {isStudio ? "Artist Direct Payouts" : "Delivered Audio"}
                  </span>
                  <div className="text-3xl font-black text-white mt-2 font-mono">
                    {isStudio
                      ? `${(stats.totalArtistPayout || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}$`
                      : `${stats.totalApprovedHours || 0} hrs`}
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    {isStudio
                      ? "Disbursed directly to your voice artists"
                      : `${stats.totalApprovedCalls || 0} completed calls`}
                  </div>
                </div>
              </div>

              {/* Payout & Settlement History Table */}
              <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 shadow-xl">
                <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
                <div className="p-6 border-b border-neutral-800/80 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Clock className="w-5 h-5 text-emerald-400" />
                      Payout & Settlement Transfer History
                    </h3>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Chronological ledger of all margin payouts disbursed by DataCatalyst with exact dates, amounts, and bank transaction UTRs.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-300">
                      Total Disbursed: <strong className="text-emerald-400 font-mono">{(stats.totalPaidOut || 0).toFixed(2)}$</strong>
                    </span>
                  </div>
                </div>

                {(!stats.payoutHistory || stats.payoutHistory.length === 0) ? (
                  <div className="py-16 text-center text-neutral-400 text-xs px-4">
                    <div className="w-12 h-12 rounded-2xl bg-neutral-800/50 border border-neutral-700/50 flex items-center justify-center mx-auto mb-3 text-neutral-500">
                      <Wallet className="w-6 h-6" />
                    </div>
                    <p className="font-semibold text-neutral-300 text-sm">No settlement payouts recorded yet</p>
                    <p className="text-neutral-500 mt-1 max-w-md mx-auto">
                      When DataCatalyst settles your accrued margin balance, the payment date, transaction reference/UTR ID, and disbursed amount will be tracked here.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto relative z-10">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-neutral-950/60 border-b border-neutral-800 text-neutral-400 uppercase font-semibold">
                        <tr>
                          <th className="py-3.5 px-5">Payment Date & Time</th>
                          <th className="py-3.5 px-5">Amount Paid</th>
                          <th className="py-3.5 px-5">Channel / Method</th>
                          <th className="py-3.5 px-5">Transaction / UTR ID</th>
                          <th className="py-3.5 px-5">Memo / Note</th>
                          <th className="py-3.5 px-5 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-800/60">
                        {stats.payoutHistory.map((p) => (
                          <tr key={p._id} className="hover:bg-neutral-800/30 transition-colors">
                            <td className="py-4 px-5">
                              <div className="font-bold text-white flex items-center gap-2">
                                <Clock className="w-3.5 h-3.5 text-neutral-400" />
                                {new Date(p.paidAt || p.createdAt).toLocaleDateString("en-US", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric"
                                })}
                              </div>
                              <div className="text-[11px] text-neutral-500 mt-0.5">
                                {new Date(p.paidAt || p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </td>
                            <td className="py-4 px-5">
                              <div className="font-mono font-black text-emerald-400 text-sm">
                                {(Number(p.amountUsd) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}$
                              </div>
                              {p.amountInr > 0 && (
                                <div className="text-[11px] text-neutral-400 font-mono mt-0.5">
                                  {Number(p.amountInr).toLocaleString("en-IN")}
                                </div>
                              )}
                            </td>
                            <td className="py-4 px-5">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-neutral-800 text-neutral-200 border border-neutral-700">
                                {p.paymentMethod === "upi" ? "⚡ UPI Transfer" : p.paymentMethod === "bank_transfer" ? "🏦 Bank IMPS/NEFT" : p.paymentMethod?.toUpperCase() || "Direct Transfer"}
                              </span>
                            </td>
                            <td className="py-4 px-5">
                              {p.referenceId ? (
                                <div className="flex items-center gap-1.5 font-mono text-neutral-300">
                                  <span className="bg-neutral-950 px-2 py-1 rounded border border-neutral-800 text-neutral-200 select-all">
                                    {p.referenceId}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyReference(p.referenceId, p._id)}
                                    className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors"
                                    title="Copy Reference ID"
                                  >
                                    {copiedRefId === p._id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              ) : (
                                <span className="text-neutral-500 italic">Direct Settle</span>
                              )}
                            </td>
                            <td className="py-4 px-5 text-neutral-300 max-w-xs truncate">
                              {p.note || "Margin Settlement"}
                            </td>
                            <td className="py-4 px-5 text-right">
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Paid Out</span>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Payout Credentials Form */}
              <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 p-6 shadow-xl max-w-2xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
                <div className="relative z-10 flex items-center justify-between pb-4 border-b border-neutral-800 mb-6">
                  <div>
                    <h4 className="text-base font-bold text-white flex items-center gap-2">
                      <Wallet className="w-5 h-5 text-emerald-400" />
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

                <form onSubmit={handleSavePayout} className="relative z-10 space-y-4">
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
      </div>

      {/* ─── MODAL: CREATE CONTRIBUTOR / ONBOARD ARTIST ACCOUNT ──────────────── */}
      <AnimatePresence>
        {showAddArtistModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-2xl max-h-[90vh] my-8 shadow-2xl p-6 flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-4 border-b border-neutral-800 mb-4 shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 ${isStudio ? "bg-purple-600/20 text-purple-400" : "bg-emerald-600/20 text-emerald-400"} rounded-xl`}>
                    {isStudio ? <Mic className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {isStudio ? "Onboard Voice Artist" : "Create Contributor Account"}
                    </h3>
                    <p className="text-xs text-neutral-400">
                      {isStudio
                        ? `Assign allocated projects and custom payrates under ${vendor?.name || "your studio"}`
                        : `Create contributor login under ${vendor?.name || "your agency"}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setCreatedCredentials(null);
                    setShowAddArtistModal(false);
                    setCreateStep(1);
                  }}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
                >
                  ✕
                </button>
              </div>

              {createdCredentials ? (
                /* ── SUCCESS VIEW: SHOW & COPY CREDENTIALS ── */
                <div className="space-y-5 flex-1 overflow-y-auto py-2">
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto border border-emerald-500/30">
                      <CheckCircle2 className="w-7 h-7" />
                    </div>
                    <h3 className="text-lg font-bold text-white">Account Created Successfully!</h3>
                    <p className="text-xs text-neutral-400 max-w-md mx-auto">
                      Share these login credentials with the user. When they log in, they will complete their self-service profile and voice sample before beginning recordings.
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
                    {isStudio && createdCredentials.assignedCount !== null && (
                      <div className="flex items-center justify-between pb-2.5 border-b border-neutral-800/80">
                        <span className="text-neutral-500 font-sans font-semibold">Assigned Projects</span>
                        <span className="text-purple-300 font-sans font-bold bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                          {createdCredentials.assignedCount} {createdCredentials.assignedCount === 1 ? "Project Allocated" : "Projects Allocated"}
                        </span>
                      </div>
                    )}
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
                      const textToCopy = `DataCatalyst Contributor Login Details:\n--------------------------------------\nLogin Link: ${createdCredentials.loginUrl}\nEmail: ${createdCredentials.email}\nPassword: ${createdCredentials.password}\nSpeaker ID: ${createdCredentials.speaker_id}\n\nPlease log in using these credentials to complete your profile and begin audio tasks!`;
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
                        <span>Copy All Credentials for Contributor</span>
                      </>
                    )}
                  </button>

                  <div className="flex justify-between items-center pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCreatedCredentials(null);
                        setCreateStep(1);
                        setArtistForm({
                          firstname: "",
                          lastname: "",
                          email: "",
                          password: ""
                        });
                      }}
                      className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Onboard Another</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreatedCredentials(null);
                        setShowAddArtistModal(false);
                        setCreateStep(1);
                      }}
                      className="px-5 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold rounded-xl transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : isStudio ? (
                /* ── STUDIO MULTI-STEP CREATION FLOW ── */
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Step Indicator Header */}
                  <div className="grid grid-cols-3 gap-2 pb-4 border-b border-neutral-800/80 mb-4 shrink-0">
                    <div className={`flex items-center gap-2 p-2 rounded-xl text-xs font-semibold ${
                      createStep === 1 ? "bg-purple-600/20 text-purple-300 border border-purple-500/30" : "text-neutral-500"
                    }`}>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                        createStep === 1 ? "bg-purple-600 text-white" : createStep > 1 ? "bg-emerald-500 text-white" : "bg-neutral-800 text-neutral-400"
                      }`}>
                        {createStep > 1 ? "✓" : "1"}
                      </span>
                      <span className="truncate">1. Account</span>
                    </div>

                    <div className={`flex items-center gap-2 p-2 rounded-xl text-xs font-semibold ${
                      createStep === 2 ? "bg-purple-600/20 text-purple-300 border border-purple-500/30" : "text-neutral-500"
                    }`}>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                        createStep === 2 ? "bg-purple-600 text-white" : createStep > 2 ? "bg-emerald-500 text-white" : "bg-neutral-800 text-neutral-400"
                      }`}>
                        {createStep > 2 ? "✓" : "2"}
                      </span>
                      <span className="truncate">2. Assign Projects</span>
                    </div>

                    <div className={`flex items-center gap-2 p-2 rounded-xl text-xs font-semibold ${
                      createStep === 3 ? "bg-purple-600/20 text-purple-300 border border-purple-500/30" : "text-neutral-500"
                    }`}>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                        createStep === 3 ? "bg-purple-600 text-white" : "bg-neutral-800 text-neutral-400"
                      }`}>
                        3
                      </span>
                      <span className="truncate">3. Set Payrates</span>
                    </div>
                  </div>

                  {/* ── STEP 1: Account Details ── */}
                  {createStep === 1 && (
                    <div className="space-y-4 flex-1 overflow-y-auto pr-1">
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
                            placeholder="artist@example.com"
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

                      <div className="p-3.5 bg-neutral-950/80 border border-neutral-800 rounded-2xl flex items-start gap-2.5 text-xs text-neutral-400">
                        <FileCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>
                          <strong className="text-neutral-200">Next Step:</strong> In the next step, you will select which allocated projects to assign to this contributor, and customize their hourly payrates.
                        </span>
                      </div>

                      <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800 mt-auto">
                        <button
                          type="button"
                          onClick={() => setShowAddArtistModal(false)}
                          className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-xl transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!artistForm.email.trim() || !artistForm.password.trim()) {
                              Swal.fire("Validation Error", "Please provide both login email and password.", "warning");
                              return;
                            }
                            if (artistForm.password.trim().length < 6) {
                              Swal.fire("Validation Error", "Password must be at least 6 characters long.", "warning");
                              return;
                            }
                            setCreateStep(2);
                          }}
                          className="px-5 py-2 bg-purple-600 hover:bg-purple-500 active:scale-95 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-600/25 transition-all"
                        >
                          Next: Assign Projects & Languages →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── STEP 2: Project & Language Selection ── */}
                  {createStep === 2 && (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      <div className="flex items-center justify-between mb-3 shrink-0">
                        <div>
                          <h4 className="text-sm font-bold text-white">Select Allocated Projects & Languages</h4>
                          <p className="text-xs text-neutral-400">
                            Choose which projects and languages this contributor is permitted to work on.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSelectAllProjects(true)}
                            className="px-2.5 py-1 text-[11px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg font-medium transition-colors"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectAllProjects(false)}
                            className="px-2.5 py-1 text-[11px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg font-medium transition-colors"
                          >
                            Clear All
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 my-2">
                        {loadingAllocatedProjects ? (
                          <div className="flex flex-col items-center justify-center py-12 text-center text-neutral-400">
                            <RefreshCw className="w-6 h-6 animate-spin text-purple-400 mb-2" />
                            <p className="text-xs font-medium">Loading studio's allocated projects...</p>
                          </div>
                        ) : studioAllocatedProjects.length === 0 ? (
                          <div className="p-8 text-center bg-neutral-950/60 border border-neutral-800 rounded-2xl">
                            <p className="text-sm font-semibold text-neutral-300 mb-1">No Allocated Projects</p>
                            <p className="text-xs text-neutral-500 max-w-md mx-auto">
                              No active projects are allocated to your studio yet. Please contact DataCatalyst Operations.
                            </p>
                          </div>
                        ) : (
                          studioAllocatedProjects.map((proj) => {
                            const key = `${proj.category}_${proj.subprojectId}_${proj.language}`;
                            const isChecked = selectedProjectKeys.has(key);
                            return (
                              <div
                                key={key}
                                onClick={() => toggleProjectSelection(key)}
                                className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                                  isChecked
                                    ? "bg-purple-950/20 border-purple-500/40 shadow-sm"
                                    : "bg-neutral-950/70 border-neutral-800 hover:border-neutral-700 opacity-75 hover:opacity-100"
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleProjectSelection(key)}
                                    className="w-4 h-4 text-purple-600 bg-neutral-900 border-neutral-700 rounded focus:ring-purple-500 cursor-pointer"
                                  />
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                                        proj.category === "call"
                                          ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                                          : proj.category === "scripted_call"
                                          ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
                                          : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                      }`}>
                                        {proj.category === "call" ? "Calls" : proj.category === "scripted_call" ? "Scripted" : "Phrases"}
                                      </span>
                                      <span className="text-sm font-bold text-white">{proj.subprojectName}</span>
                                    </div>
                                    <span className="text-xs text-neutral-400 mt-0.5 block">
                                      Allocated Language: <strong className="text-neutral-200 uppercase">{proj.language}</strong>
                                    </span>
                                  </div>
                                </div>

                                <div className="text-right shrink-0">
                                  <span className="text-xs text-neutral-400 font-medium block">Project Base Rate</span>
                                  <span className="text-xs font-bold text-emerald-400">{proj.projectRate}/hr</span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-neutral-800 mt-2 shrink-0">
                        <span className="text-xs font-semibold text-neutral-400">
                          {selectedProjectKeys.size} of {studioAllocatedProjects.length} selected
                        </span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setCreateStep(1)}
                            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-xl transition-colors"
                          >
                            ← Back
                          </button>
                          <button
                            type="button"
                            disabled={selectedProjectKeys.size === 0}
                            onClick={handleProceedToPayrates}
                            className="px-5 py-2 bg-purple-600 hover:bg-purple-500 active:scale-95 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-600/25 transition-all disabled:opacity-50"
                          >
                            Next: Configure Payrates ({selectedProjectKeys.size}) →
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── STEP 3: Configure Payrates for Selected Projects ── */}
                  {createStep === 3 && (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {/* Rules Banner */}
                      <div className="p-3 my-2 bg-purple-950/30 border border-purple-500/30 rounded-2xl text-xs text-purple-200 shrink-0 space-y-1">
                        <div className="font-bold flex items-center gap-1.5 text-purple-300">
                          <span>ℹ️</span> Payrate Split Formula
                        </div>
                        <p className="text-[11.5px] text-purple-200/90">
                          Contributor Payrate cannot exceed Project Base Rate. Studio Payrate is auto-calculated: <code className="bg-purple-900/50 px-1 py-0.5 rounded font-mono text-purple-300">Project Rate − Contributor Rate</code>.
                        </p>
                      </div>

                      <div className="flex-1 overflow-y-auto pr-1 space-y-3 my-2">
                        {newArtistPayrates.map((item, idx) => {
                          const isOverMax = Number(item.artistRate) > Number(item.projectRate);
                          return (
                            <div
                              key={`${item.category}_${item.subprojectId}_${item.language}`}
                              className={`p-3.5 rounded-2xl border transition-all ${
                                isOverMax
                                  ? "bg-rose-950/20 border-rose-500/40"
                                  : "bg-neutral-950/80 border-neutral-800"
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                                    item.category === "call"
                                      ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                                      : item.category === "scripted_call"
                                      ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
                                      : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                  }`}>
                                    {item.category === "call" ? "Calls" : item.category === "scripted_call" ? "Scripted" : "Phrases"}
                                  </span>
                                  <h4 className="text-sm font-bold text-white">{item.subprojectName}</h4>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-neutral-800 text-neutral-200 border border-neutral-700 uppercase">
                                    Lang: {item.language}
                                  </span>
                                  <span className="text-xs text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                                    Base: <strong className="text-neutral-200">{item.projectRate}/hr</strong>
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-800/80">
                                {/* Contributor Payrate Input */}
                                <div>
                                  <label className="block text-[11px] font-semibold text-neutral-400 mb-1">
                                    Contributor Payrate (Max: {item.projectRate}/hr)
                                  </label>
                                  <div className={`flex items-center gap-2 bg-neutral-900 border rounded-xl px-3 py-1.5 ${
                                    isOverMax ? "border-rose-500 bg-rose-950/30" : "border-neutral-700 focus-within:border-purple-500"
                                  }`}>
                                    <input
                                      type="number"
                                      step="0.5"
                                      min="0"
                                      max={item.projectRate}
                                      value={item.artistRate !== undefined ? item.artistRate : 0}
                                      onChange={(e) => handleNewArtistRateChange(idx, e.target.value)}
                                      className="w-full bg-transparent text-sm font-bold text-white focus:outline-none"
                                    />
                                    <span className="text-xs text-neutral-500 whitespace-nowrap">/ hr</span>
                                  </div>
                                  {isOverMax && (
                                    <p className="text-[11px] text-rose-400 mt-1 font-medium">
                                      ⚠️ Cannot exceed project rate of {item.projectRate}/hr
                                    </p>
                                  )}
                                </div>

                                {/* Calculated Studio Margin */}
                                <div>
                                  <label className="block text-[11px] font-semibold text-neutral-400 mb-1">
                                    Studio Payrate (Margin)
                                  </label>
                                  <div className="flex items-center justify-between bg-neutral-900/90 border border-emerald-500/25 rounded-xl px-3 py-1.5 text-sm font-bold">
                                    <span className="text-emerald-400 font-mono">
                                      +{item.studioRate !== undefined ? Number(item.studioRate).toFixed(2) : "0.00"} / hr
                                    </span>
                                    <span className="text-[10px] text-neutral-500 font-mono">
                                      ({item.projectRate} − {item.artistRate || 0})
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-emerald-400/80 mt-1">
                                    Studio margin per approved audio hr
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-neutral-800 mt-2 shrink-0">
                        <div className="text-xs text-neutral-400">
                          {newArtistPayrates.length} {newArtistPayrates.length === 1 ? "project" : "projects"} assigned
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setCreateStep(2)}
                            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-xl transition-colors"
                          >
                            ← Back
                          </button>
                          <button
                            type="button"
                            disabled={submittingArtist || newArtistPayrates.some(p => Number(p.artistRate) > Number(p.projectRate))}
                            onClick={handleCreateUser}
                            className="px-5 py-2 bg-purple-600 hover:bg-purple-500 active:scale-95 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-600/25 transition-all disabled:opacity-50"
                          >
                            {submittingArtist ? "Creating Account..." : "Create Voice Artist Account"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* ── STANDARD NON-STUDIO VENDOR FORM ── */
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
                        className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-200 focus:outline-none focus:border-emerald-500"
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
                        className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-200 focus:outline-none focus:border-emerald-500"
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
                        className="w-full pl-9 pr-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-200 focus:outline-none focus:border-emerald-500"
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
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
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
                        className="w-full pl-9 pr-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm font-mono text-neutral-200 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

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
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/25 active:scale-95 text-white text-xs font-bold rounded-xl shadow-lg transition-all disabled:opacity-50"
                    >
                      {submittingArtist ? "Creating Account..." : "Create Contributor Account"}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL: PROJECT-WISE ARTIST PAYRATES ─────────────────────────────── */}
      <AnimatePresence>
        {editingArtist && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-2xl p-6 shadow-2xl my-8 max-h-[90vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-neutral-800 shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">Project-Wise Payrate Configuration</h3>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {editingArtist.speaker_id || "Voice Artist"}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {editingArtist.name || editingArtist.username} ({editingArtist.email})
                  </p>
                </div>
                <button
                  onClick={() => setEditingArtist(null)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Allocation Rule Alert */}
              <div className="p-3.5 my-4 bg-purple-950/30 border border-purple-500/30 rounded-2xl text-xs text-purple-200 shrink-0 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-purple-300">
                  <span>ℹ️</span> Allocation & Payrate Rules
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11.5px] text-purple-200/90 pl-1">
                  <li>You can only decide payrates for projects and languages allocated to your studio.</li>
                  <li><strong>Contributor Payrate</strong> cannot exceed the platform <strong>Project Base Rate</strong>.</li>
                  <li><strong>Studio Payrate</strong> is auto-calculated as: <code className="bg-purple-900/50 px-1 py-0.5 rounded font-mono text-purple-300">Project Rate − Contributor Rate</code>.</li>
                  <li>DataCatalyst pays this artist directly; your studio receives the margin difference.</li>
                </ul>
              </div>

              {/* Content Body */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-3">
                {loadingArtistPayrates ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-neutral-400">
                    <RefreshCw className="w-6 h-6 animate-spin text-purple-400 mb-2" />
                    <p className="text-xs font-medium">Loading allocated projects & payrates...</p>
                  </div>
                ) : artistProjectPayrates.length === 0 ? (
                  <div className="p-8 text-center bg-neutral-950/60 border border-neutral-800 rounded-2xl">
                    <p className="text-sm font-semibold text-neutral-300 mb-1">No Allocated Projects Found</p>
                    <p className="text-xs text-neutral-500 max-w-md mx-auto">
                      Your studio does not currently have any active allocated projects or languages. Please contact DataCatalyst Operations to assign project quotas and target languages.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {artistProjectPayrates.map((item, idx) => {
                      const isOverMax = Number(item.artistRate) > Number(item.projectRate);
                      return (
                        <div
                          key={`${item.category}_${item.subprojectId}_${item.language}`}
                          className={`p-4 rounded-2xl border transition-all ${
                            isOverMax
                              ? "bg-rose-950/20 border-rose-500/40"
                              : "bg-neutral-950/80 border-neutral-800 hover:border-neutral-700"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                                  item.category === "call"
                                    ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                                    : item.category === "scripted_call"
                                    ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
                                    : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                }`}
                              >
                                {item.category === "call" ? "Calls" : item.category === "scripted_call" ? "Scripted" : "Phrases"}
                              </span>
                              <h4 className="text-sm font-bold text-white">{item.subprojectName}</h4>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-neutral-800 text-neutral-200 border border-neutral-700 uppercase">
                                Lang: {item.language}
                              </span>
                              <span className="text-xs text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                                Base: <strong className="text-neutral-200">{item.projectRate}/hr</strong>
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-800/80">
                            {/* Contributor Payrate Input */}
                            <div>
                              <label className="block text-[11px] font-semibold text-neutral-400 mb-1">
                                Contributor Payrate (Max: {item.projectRate}/hr)
                              </label>
                              <div className={`flex items-center gap-2 bg-neutral-900 border rounded-xl px-3 py-2 ${
                                isOverMax ? "border-rose-500 bg-rose-950/30" : "border-neutral-700 focus-within:border-purple-500"
                              }`}>
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  max={item.projectRate}
                                  value={item.artistRate !== undefined ? item.artistRate : 0}
                                  onChange={(e) => handleRateChange(idx, e.target.value)}
                                  className="w-full bg-transparent text-sm font-bold text-white focus:outline-none"
                                />
                                <span className="text-xs text-neutral-500 whitespace-nowrap">/ hr</span>
                              </div>
                              {isOverMax && (
                                <p className="text-[11px] text-rose-400 mt-1 font-medium">
                                  ⚠️ Cannot exceed project rate of {item.projectRate}/hr
                                </p>
                              )}
                            </div>

                            {/* Calculated Studio Margin */}
                            <div>
                              <label className="block text-[11px] font-semibold text-neutral-400 mb-1">
                                Studio Payrate (Margin = Base − Contributor)
                              </label>
                              <div className="flex items-center justify-between bg-neutral-900/90 border border-emerald-500/25 rounded-xl px-3 py-2 text-sm font-bold">
                                <span className="text-emerald-400 font-mono">
                                  +{item.studioRate !== undefined ? Number(item.studioRate).toFixed(2) : "0.00"} / hr
                                </span>
                                <span className="text-[10px] text-neutral-500 font-mono">
                                  ({item.projectRate} − {item.artistRate || 0})
                                </span>
                              </div>
                              <p className="text-[10px] text-emerald-400/80 mt-1">
                                Studio margin earned per approved audio hour
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-neutral-800 mt-4 shrink-0">
                <div className="text-[11px] text-neutral-500">
                  {artistProjectPayrates.length} allocated {artistProjectPayrates.length === 1 ? "project" : "projects"}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingArtist(null)}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleUpdatePayratesSubmit}
                    disabled={savingPayrate || loadingArtistPayrates || artistProjectPayrates.some(p => Number(p.artistRate) > Number(p.projectRate))}
                    className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-600/25 disabled:opacity-50 transition-colors"
                  >
                    {savingPayrate ? "Saving Changes..." : "Save Project Payrates"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL: CONTRIBUTOR PROJECT-WISE ANALYTICS ─────────────────────────── */}
      <AnimatePresence>
        {selectedAnalyticsArtist && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-4xl p-5 sm:p-7 shadow-2xl my-6 max-h-[92vh] flex flex-col relative overflow-hidden"
            >
              {/* Ambient Glow */}
              <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

              {/* Header */}
              <div className="flex items-start justify-between pb-4 border-b border-neutral-800 shrink-0 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                    <Mic className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-bold text-white">
                        {selectedAnalyticsArtist.name || selectedAnalyticsArtist.username}
                      </h3>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-neutral-950 text-purple-300 border border-purple-500/40">
                        {selectedAnalyticsArtist.speaker_id || "Speaker N/A"}
                      </span>
                      {selectedAnalyticsArtist.accountStatus && (
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                          selectedAnalyticsArtist.accountStatus === "approved"
                            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                            : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                        }`}>
                          {selectedAnalyticsArtist.accountStatus}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {selectedAnalyticsArtist.email} • Contributor Performance & Project Analytics
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedAnalyticsArtist(null)}
                  className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition-colors"
                  title="Close Modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto py-4 space-y-6 relative z-10 pr-1">
                {loadingAnalytics ? (
                  <div className="py-20 text-center space-y-3">
                    <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-xs text-neutral-400">Aggregating contributor tasks & project analytics...</p>
                  </div>
                ) : !analyticsData ? (
                  <div className="py-16 text-center text-neutral-500 text-xs">
                    No analytics data available for this contributor.
                  </div>
                ) : (
                  <>
                    {/* 1. Overall Summary Metric Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                      {/* Done / Submitted */}
                      <div className="p-4 rounded-2xl bg-neutral-950/80 border border-neutral-800/80 shadow-sm relative overflow-hidden">
                        <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                          Total Done
                        </div>
                        <div className="text-2xl font-black text-white font-mono mt-1">
                          {analyticsData.summary?.totalDone || 0}
                          <span className="text-xs font-normal text-neutral-400 ml-1">units</span>
                        </div>
                        <div className="text-[11px] text-neutral-500 mt-1">
                          Total audio tasks recorded
                        </div>
                      </div>

                      {/* Approved */}
                      <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 shadow-sm relative overflow-hidden">
                        <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                          QA Approved
                        </div>
                        <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
                          {analyticsData.summary?.totalApproved || 0}
                          <span className="text-xs font-normal text-emerald-300 ml-1">
                            ({analyticsData.summary?.totalApprovedHours || 0} hrs)
                          </span>
                        </div>
                        <div className="text-[11px] text-emerald-500/80 mt-1">
                          Passed acoustic & QA audits
                        </div>
                      </div>

                      {/* Pending Review */}
                      <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30 shadow-sm relative overflow-hidden">
                        <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                          Pending Review
                        </div>
                        <div className="text-2xl font-black text-amber-400 font-mono mt-1">
                          {analyticsData.summary?.totalPending || 0}
                          <span className="text-xs font-normal text-amber-300 ml-1">units</span>
                        </div>
                        <div className="text-[11px] text-amber-500/80 mt-1">
                          Awaiting internal QA audit
                        </div>
                      </div>

                      {/* Rejected */}
                      <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/30 shadow-sm relative overflow-hidden">
                        <div className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">
                          Rejected Submissions
                        </div>
                        <div className="text-2xl font-black text-rose-400 font-mono mt-1">
                          {analyticsData.summary?.totalRejected || 0}
                          <span className="text-xs font-normal text-rose-300 ml-1">units</span>
                        </div>
                        <div className="text-[11px] text-rose-400/80 mt-1">
                          Did not meet audio guidelines
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar & Quality Pass Rate */}
                    <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800">
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="text-neutral-400 font-semibold">QA Approval Pass Rate</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white text-sm">
                            {analyticsData.summary?.overallApprovalRate || 0}%
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            (analyticsData.summary?.overallApprovalRate || 0) >= 90
                              ? "bg-emerald-500/15 text-emerald-400"
                              : (analyticsData.summary?.overallApprovalRate || 0) >= 80
                              ? "bg-amber-500/15 text-amber-400"
                              : "bg-rose-500/15 text-rose-400"
                          }`}>
                            {(analyticsData.summary?.overallApprovalRate || 0) >= 90 ? "Excellent" : (analyticsData.summary?.overallApprovalRate || 0) >= 80 ? "Acceptable" : "Needs Coaching"}
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-neutral-900 h-2.5 rounded-full overflow-hidden border border-neutral-800">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-emerald-400 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(0, analyticsData.summary?.overallApprovalRate || 0))}%` }}
                        />
                      </div>
                    </div>

                    {/* 2. Project-Wise Breakdown */}
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-bold text-white flex items-center gap-2">
                            <Layers className="w-4 h-4 text-purple-400" />
                            Project-Wise Performance
                          </h4>
                          <p className="text-[11px] text-neutral-400">
                            Recorded volume, approval status, and compensation per project
                          </p>
                        </div>

                        {/* Category filter pills */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
                          {["all", "phrase", "call", "scripted_call"].map((cat) => (
                            <button
                              key={cat}
                              onClick={() => setAnalyticsCategoryFilter(cat)}
                              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                                analyticsCategoryFilter === cat
                                  ? "bg-purple-600 text-white shadow-sm"
                                  : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
                              }`}
                            >
                              {cat === "all" ? "All" : cat === "phrase" ? "Phrases" : cat === "call" ? "Calls" : "Scripted"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Project Breakdown Table */}
                      <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950/60">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-neutral-950 border-b border-neutral-800 text-neutral-400 uppercase font-semibold">
                            <tr>
                              <th className="py-3 px-4">Project / Sub-Project</th>
                              <th className="py-3 px-3">Language</th>
                              <th className="py-3 px-3 text-center">Done</th>
                              <th className="py-3 px-3 text-center">Approved</th>
                              <th className="py-3 px-3 text-center">Pending</th>
                              <th className="py-3 px-3 text-center">Rejected</th>
                              <th className="py-3 px-3 text-center">Pass Rate</th>
                              {isStudio && <th className="py-3 px-4 text-right">Artist Rate</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-800/60">
                            {analyticsData.projectBreakdown
                              ?.filter((p) => analyticsCategoryFilter === "all" || p.category === analyticsCategoryFilter)
                              .map((p, idx) => {
                                return (
                                  <tr key={`${p.category}_${p.subprojectId}_${p.language}_${idx}`} className="hover:bg-neutral-850/50 transition-colors">
                                    <td className="py-3 px-4">
                                      <div className="flex items-center gap-2">
                                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                                          p.category === "call"
                                            ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                            : p.category === "scripted_call"
                                            ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                        }`}>
                                          {p.category === "call" ? "Call" : p.category === "scripted_call" ? "Scripted" : "Phrase"}
                                        </span>
                                        <span className="font-semibold text-white">{p.subprojectName}</span>
                                      </div>
                                    </td>
                                    <td className="py-3 px-3 font-mono uppercase text-neutral-300 font-semibold">
                                      {p.language}
                                    </td>
                                    <td className="py-3 px-3 text-center font-mono font-bold text-white">
                                      {p.totalSubmitted}
                                    </td>
                                    <td className="py-3 px-3 text-center">
                                      <span className="font-mono font-bold text-emerald-400">
                                        {p.approved}
                                      </span>
                                      {p.approvedHours > 0 && (
                                        <span className="text-[10px] text-neutral-400 block font-mono">
                                          {p.approvedHours}h
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-3 px-3 text-center font-mono font-bold text-amber-400">
                                      {p.pending}
                                    </td>
                                    <td className="py-3 px-3 text-center font-mono font-bold text-rose-400">
                                      {p.rejected}
                                    </td>
                                    <td className="py-3 px-3 text-center">
                                      <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                                        p.approvalRate >= 90
                                          ? "bg-emerald-500/15 text-emerald-400"
                                          : p.approvalRate >= 80
                                          ? "bg-amber-500/15 text-amber-400"
                                          : p.totalSubmitted > 0
                                          ? "bg-rose-500/15 text-rose-400"
                                          : "text-neutral-500"
                                      }`}>
                                        {p.totalSubmitted > 0 ? `${p.approvalRate}%` : "—"}
                                      </span>
                                    </td>
                                    {isStudio && (
                                      <td className="py-3 px-4 text-right font-mono">
                                        <span className="text-purple-300 font-bold">{p.artistRate}/hr</span>
                                        {p.estimatedEarnings > 0 && (
                                          <span className="text-[10px] text-neutral-400 block">
                                            ≈ {p.estimatedEarnings}
                                          </span>
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* 3. Recent Rejections & Coaching Feedback */}
                    {Array.isArray(analyticsData.recentRejections) && analyticsData.recentRejections.length > 0 && (
                      <div className="p-4 rounded-2xl bg-rose-950/15 border border-rose-500/20 space-y-2.5">
                        <h4 className="text-xs font-bold text-rose-300 flex items-center gap-1.5 uppercase tracking-wider">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                          Recent QA Rejection & Coaching Notes ({analyticsData.recentRejections.length})
                        </h4>
                        <div className="space-y-2">
                          {analyticsData.recentRejections.map((r, rIdx) => (
                            <div key={rIdx} className="p-2.5 rounded-xl bg-neutral-950/80 border border-neutral-800 text-xs">
                              <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1">
                                <span className="font-mono text-neutral-300">{r.taskId}</span>
                                <span>{new Date(r.rejectedAt).toLocaleDateString()}</span>
                              </div>
                              <p className="text-rose-300 font-medium">⚠️ {r.comment}</p>
                              {r.text && r.text !== "—" && (
                                <p className="text-neutral-400 text-[11px] italic mt-1 line-clamp-1">"{r.text}"</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-neutral-800 flex items-center justify-between shrink-0 relative z-10">
                <button
                  type="button"
                  onClick={() => handleOpenAnalyticsModal(selectedAnalyticsArtist)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-xl transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAnalyticsArtist(null)}
                  className="px-5 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
