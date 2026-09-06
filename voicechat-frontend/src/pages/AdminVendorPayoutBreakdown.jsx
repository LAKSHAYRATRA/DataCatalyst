import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import AdminNav from "../components/AdminNav.jsx";
import {
  ArrowLeft,
  Building2,
  Building,
  Users,
  DollarSign,
  Copy,
  Check,
  Search,
  ExternalLink,
  CreditCard,
  Clock,
  CheckCircle2,
  AlertCircle,
  Download,
  RefreshCw,
  Sparkles,
  Layers,
  Phone,
  Mail,
  ShieldCheck,
  UserCheck
} from "lucide-react";
import Swal from "sweetalert2";
import { apiGet } from "../lib/api.js";

function money(value) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

export default function AdminVendorPayoutBreakdown() {
  const { vendorId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState("all"); // "all" | "payable" | "has_upi" | "no_upi"
  const [copiedUpi, setCopiedUpi] = useState(null);
  const [copiedVendorUpi, setCopiedVendorUpi] = useState(false);
  const [copiedVendorAccount, setCopiedVendorAccount] = useState(false);
  const [copiedAllUpis, setCopiedAllUpis] = useState(false);

  useEffect(() => {
    fetchVendorAnalytics();
  }, [vendorId]);

  async function fetchVendorAnalytics() {
    setLoading(true);
    setError("");
    try {
      const res = await apiGet(`/api/admin/vendors/${vendorId}/analytics`);
      setData(res);
    } catch (err) {
      console.error("Failed to fetch vendor analytics:", err);
      setError(err.message || "Failed to load vendor payout breakdown.");
    } finally {
      setLoading(false);
    }
  }

  const copyToClipboard = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedUpi(id);
    setTimeout(() => setCopiedUpi(null), 2000);
  };

  const copyVendorField = (text, type = "upi") => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (type === "upi") {
      setCopiedVendorUpi(true);
      setTimeout(() => setCopiedVendorUpi(false), 2000);
    } else {
      setCopiedVendorAccount(true);
      setTimeout(() => setCopiedVendorAccount(false), 2000);
    }
  };

  const vendor = data?.vendor || {};
  const summary = data?.summary || {};
  const contributors = data?.contributors || [];
  const projects = data?.projects || [];

  const vendorPayableAmount = Number(
    summary.totalEstimatedMargin !== undefined
      ? summary.totalEstimatedMargin
      : summary.totalMarginEarned !== undefined
      ? summary.totalMarginEarned
      : 0
  );

  const totalArtistPayout = Number(summary.totalArtistPayout || 0);
  const totalApprovedHours = Number(summary.totalApprovedHours || 0);
  const totalWorkers = Number(summary.totalWorkers || contributors.length || 0);

  // Contributors filtering
  const filteredContributors = contributors.filter((c) => {
    // Search matching
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = (c.name || "").toLowerCase().includes(q);
      const matchUsername = (c.username || "").toLowerCase().includes(q);
      const matchEmail = (c.email || "").toLowerCase().includes(q);
      const matchSpeaker = (c.speaker_id || "").toLowerCase().includes(q);
      const matchUpi = (c.upiId || "").toLowerCase().includes(q);
      if (!matchName && !matchUsername && !matchEmail && !matchSpeaker && !matchUpi) {
        return false;
      }
    }

    // Tab filter
    if (filterTab === "payable") {
      return (c.earnedPayout || 0) > 0;
    }
    if (filterTab === "has_upi") {
      return Boolean(c.upiId);
    }
    if (filterTab === "no_upi") {
      return !c.upiId;
    }

    return true;
  });

  const handleCopyAllUpis = () => {
    const validUpis = filteredContributors
      .map((c) => c.upiId)
      .filter(Boolean);

    if (validUpis.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "No UPI IDs Found",
        text: "None of the contributors in the current view have configured a UPI ID.",
        background: "#171717",
        color: "#fff"
      });
      return;
    }

    navigator.clipboard.writeText(validUpis.join("\n"));
    setCopiedAllUpis(true);
    setTimeout(() => setCopiedAllUpis(false), 2500);

    Swal.fire({
      icon: "success",
      title: "UPI IDs Copied",
      text: `Successfully copied ${validUpis.length} UPI IDs to clipboard!`,
      background: "#171717",
      color: "#fff",
      timer: 2000,
      showConfirmButton: false
    });
  };

  const handleExportCsv = () => {
    if (!contributors.length) return;

    const headers = [
      "Artist Name",
      "Username",
      "Email",
      "Mobile",
      "Speaker ID",
      "Approved Hours",
      "Approved Calls",
      "Approved Phrases",
      "Payable Payment (USD)",
      "UPI ID",
      "Account Status"
    ];

    const rows = contributors.map((c) => [
      `"${(c.name || "").replace(/"/g, '""')}"`,
      `"${(c.username || "").replace(/"/g, '""')}"`,
      `"${(c.email || "").replace(/"/g, '""')}"`,
      `"${(c.mobileNumber || "").replace(/"/g, '""')}"`,
      `"${(c.speaker_id || "").replace(/"/g, '""')}"`,
      (c.approvedHours || 0).toFixed(2),
      c.totalApprovedCount || 0,
      c.totalApprovedPhrases || 0,
      (c.earnedPayout || 0).toFixed(2),
      `"${(c.upiId || "").replace(/"/g, '""')}"`,
      `"${c.accountStatus || "active"}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${(vendor.name || "vendor").replace(/\s+/g, "_")}_contributors_payout_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white pt-20 md:pt-8 md:pl-72 pb-16">
      <AdminNav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Navigation Breadcrumb & Back Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Link
              to="/admin/finances?tab=vendors"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700 transition-all text-xs font-bold shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Finances</span>
            </Link>

            <span className="text-neutral-600 hidden sm:inline">/</span>

            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-warning-400" />
              <span className="text-xs text-neutral-400 font-semibold">Vendor Partner Payout Breakdown</span>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={fetchVendorAnalytics}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white transition-all text-xs font-bold disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={handleExportCsv}
              disabled={loading || !contributors.length}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all text-xs font-extrabold shadow-md shadow-emerald-950/40 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading && !data && (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="w-12 h-12 border-4 border-warning-500/20 border-t-warning-500 rounded-full animate-spin mb-4" />
            <p className="text-neutral-400 text-sm font-medium animate-pulse">Calculating vendor payout & contributor accounts...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-rose-950/30 border border-rose-800/80 rounded-3xl p-6 text-rose-300 flex items-start gap-4 mb-8">
            <AlertCircle className="w-6 h-6 shrink-0 text-rose-400 mt-0.5" />
            <div>
              <h4 className="font-bold text-base text-rose-200">Failed to Load Vendor Breakdown</h4>
              <p className="text-sm mt-1">{error}</p>
              <button
                onClick={fetchVendorAnalytics}
                className="mt-3 px-4 py-1.5 rounded-xl bg-rose-800/60 hover:bg-rose-700/60 text-white text-xs font-bold transition-all"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {data && (
          <div className="space-y-8 animate-fade-in">
            {/* Vendor Header Card */}
            <div className="relative overflow-hidden rounded-3xl p-6 md:p-8 border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 shadow-2xl">
              <div className="absolute top-0 right-0 w-80 h-80 bg-warning-500/5 rounded-full blur-3xl pointer-events-none" />

              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl flex-shrink-0 shadow-lg ${
                    vendor.isStudio 
                      ? "bg-purple-950/80 border border-purple-800/60 text-purple-300 shadow-purple-950/50" 
                      : "bg-blue-950/80 border border-blue-800/60 text-blue-300 shadow-blue-950/50"
                  }`}>
                    {vendor.isStudio ? "ST" : "VN"}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                      <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                        {vendor.name}
                      </h1>
                      <span className="font-mono text-xs font-extrabold px-2.5 py-1 rounded-xl bg-neutral-800 border border-neutral-700 text-warning-400">
                        {vendor.vendorCode}
                      </span>
                      {vendor.isStudio ? (
                        <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-purple-950/80 text-purple-300 border border-purple-800/60">
                          Voice Studio Partner
                        </span>
                      ) : (
                        <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-blue-950/80 text-blue-300 border border-blue-800/60">
                          Vendor Agency
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs text-neutral-400 font-medium">
                      {vendor.contactPerson && (
                        <span>Contact: <strong className="text-neutral-200">{vendor.contactPerson}</strong></span>
                      )}
                      {vendor.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5 text-neutral-500" />
                          <strong className="text-neutral-200">{vendor.email}</strong>
                        </span>
                      )}
                      {vendor.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-neutral-500" />
                          <strong className="text-neutral-200">{vendor.phone}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Link
                    to={`/admin/vendors/${vendor._id}/analytics`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold border border-neutral-700 transition-all shadow-sm"
                  >
                    <span>Performance Analytics</span>
                    <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
                  </Link>
                </div>
              </div>
            </div>

            {/* ABOVE SECTION: VENDOR TOTAL PAYABLE AMOUNT & BANK/UPI HIGHLIGHT */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Card 1: Vendor Total Payable Hero Box */}
              <div className="lg:col-span-2 relative overflow-hidden rounded-3xl p-7 md:p-8 border border-emerald-500/40 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-emerald-950/30 shadow-2xl group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-500/15 transition-all" />

                <div className="relative z-10 flex flex-col justify-between h-full">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-400 bg-emerald-950/80 px-3 py-1 rounded-full border border-emerald-800/60">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        Vendor Agency Payable Amount
                      </span>

                      <span className="text-xs font-semibold text-neutral-400">
                        Company Financial Liability
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 mb-4">
                      <span className="text-4xl md:text-6xl font-black text-white tracking-tight font-mono drop-shadow-sm">
                        {money(vendorPayableAmount)}
                      </span>
                      <span className="text-sm font-semibold text-neutral-400">
                        Total Agency Margin Owed
                      </span>
                    </div>

                    <p className="text-xs md:text-sm text-neutral-300 max-w-xl leading-relaxed">
                      This is the net commission and production margin owed directly to <strong className="text-white">{vendor.name}</strong> for managing, recruiting, and producing approved contributor recordings.
                    </p>
                  </div>

                  {/* Vendor Payment Details Box */}
                  <div className="mt-6 pt-5 border-t border-neutral-800/80 bg-neutral-950/60 rounded-2xl p-4 md:p-5 border border-neutral-800">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">
                          Vendor Agency UPI Payment ID
                        </span>
                        {vendor.payoutDetails?.upiId ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-base font-black text-warning-400 tracking-wide">
                              {vendor.payoutDetails.upiId}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyVendorField(vendor.payoutDetails.upiId, "upi")}
                              className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
                              title="Copy Vendor UPI"
                            >
                              {copiedVendorUpi ? (
                                <Check className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <Copy className="w-4 h-4 text-neutral-400" />
                              )}
                            </button>
                            {copiedVendorUpi && (
                              <span className="text-xs font-bold text-emerald-400 animate-fade-in">
                                Copied!
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5" /> No UPI ID provided by vendor
                          </span>
                        )}
                      </div>

                      {/* Bank Details Snippet if available */}
                      {vendor.payoutDetails?.accountNumber && (
                        <div className="text-left sm:text-right border-t sm:border-t-0 border-neutral-800/80 pt-3 sm:pt-0">
                          <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">
                            Bank Account Details
                          </span>
                          <div className="flex items-center sm:justify-end gap-2 text-xs font-mono text-neutral-200">
                            <span>A/C: ••••{vendor.payoutDetails.accountNumber.slice(-4)}</span>
                            <span>• IFSC: {vendor.payoutDetails.ifscCode || "N/A"}</span>
                            <button
                              type="button"
                              onClick={() => copyVendorField(vendor.payoutDetails.accountNumber, "bank")}
                              className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white"
                              title="Copy Full Account Number"
                            >
                              {copiedVendorAccount ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Financial Liability & Summary Stack */}
              <div className="space-y-4 flex flex-col justify-between">
                {/* Contributors Sole Cut */}
                <div className="relative overflow-hidden rounded-3xl p-6 border border-indigo-500/40 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-indigo-950/30 shadow-xl group flex-1">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-indigo-500/15 transition-all" />
                  <div className="relative z-10">
                    <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest block mb-1.5">
                      Contributors Total Cut
                    </span>
                    <div className="text-3xl font-black text-indigo-300 font-mono">
                      {money(totalArtistPayout)}
                    </div>
                    <p className="text-xs text-neutral-400 mt-2">
                      Combined sum owed to all {totalWorkers} contributors under this vendor
                    </p>
                  </div>
                </div>

                {/* Approved Workload & Artists Count */}
                <div className="grid grid-cols-2 gap-4 flex-1">
                  <div className="relative overflow-hidden rounded-3xl p-5 border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 shadow-xl">
                    <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">
                      Approved Hours
                    </span>
                    <div className="text-2xl font-black text-white font-mono">
                      {totalApprovedHours.toFixed(1)} <span className="text-xs text-neutral-400 font-normal">hrs</span>
                    </div>
                    <span className="text-[11px] text-emerald-400 font-semibold mt-1 block">
                      {summary.totalApproved || 0} tasks verified
                    </span>
                  </div>

                  <div className="relative overflow-hidden rounded-3xl p-5 border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 shadow-xl">
                    <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">
                      Total Artists
                    </span>
                    <div className="text-2xl font-black text-white font-mono">
                      {totalWorkers}
                    </div>
                    <span className="text-[11px] text-neutral-400 font-semibold mt-1 block">
                      {contributors.filter(c => Boolean(c.upiId)).length} UPI configured
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* MAIN SECTION: HIS CONTRIBUTORS LIST-WISE PAYMENT ALONG WITH THEIR UPI IDS */}
            <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 shadow-2xl">
              <div className="absolute top-0 right-0 w-96 h-96 bg-primary-500/5 rounded-full blur-3xl pointer-events-none" />

              {/* Table Header & Controls */}
              <div className="p-6 md:p-8 border-b border-neutral-800 bg-neutral-900/60 relative z-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-xl md:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
                      <Users className="w-6 h-6 text-warning-400" />
                      <span>Contributors List-Wise Payment & UPI Records</span>
                    </h2>
                    <p className="text-xs md:text-sm text-neutral-400 mt-1">
                      Individual workload earnings, payout cut, and verified UPI IDs for artists registered under {vendor.name}.
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 self-start md:self-auto">
                    <button
                      type="button"
                      onClick={handleCopyAllUpis}
                      disabled={!filteredContributors.length}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-warning-400 hover:text-warning-300 border border-neutral-700 font-bold text-xs transition-all shadow-sm disabled:opacity-50"
                    >
                      {copiedAllUpis ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedAllUpis ? "Copied All UPIs!" : "Copy Filtered UPIs"}</span>
                    </button>
                  </div>
                </div>

                {/* Filter Tabs & Search Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                  {/* Status Tabs */}
                  <div className="inline-flex flex-wrap p-1 rounded-2xl bg-neutral-950 border border-neutral-800 gap-1">
                    <button
                      onClick={() => setFilterTab("all")}
                      className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${
                        filterTab === "all"
                          ? "bg-warning-500 text-neutral-950 shadow-md font-black"
                          : "text-neutral-400 hover:text-white hover:bg-neutral-850"
                      }`}
                    >
                      All ({contributors.length})
                    </button>
                    <button
                      onClick={() => setFilterTab("payable")}
                      className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${
                        filterTab === "payable"
                          ? "bg-emerald-600 text-white shadow-md font-black"
                          : "text-neutral-400 hover:text-white hover:bg-neutral-850"
                      }`}
                    >
                      With Earnings ({contributors.filter(c => (c.earnedPayout || 0) > 0).length})
                    </button>
                    <button
                      onClick={() => setFilterTab("has_upi")}
                      className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${
                        filterTab === "has_upi"
                          ? "bg-blue-600 text-white shadow-md font-black"
                          : "text-neutral-400 hover:text-white hover:bg-neutral-850"
                      }`}
                    >
                      UPI Added ({contributors.filter(c => Boolean(c.upiId)).length})
                    </button>
                    <button
                      onClick={() => setFilterTab("no_upi")}
                      className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${
                        filterTab === "no_upi"
                          ? "bg-rose-600 text-white shadow-md font-black"
                          : "text-neutral-400 hover:text-white hover:bg-neutral-850"
                      }`}
                    >
                      Missing UPI ({contributors.filter(c => !c.upiId).length})
                    </button>
                  </div>

                  {/* Search Input */}
                  <div className="relative min-w-[280px]">
                    <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search contributor name, UPI, email, speaker ID..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-750 text-white placeholder-neutral-500 text-xs rounded-2xl pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-warning-500 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Contributors Table */}
              <div className="overflow-x-auto relative z-10">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-900/80 uppercase text-[11px] tracking-wider text-neutral-400 border-b border-neutral-800">
                    <tr>
                      <th className="px-6 py-4 font-bold">Contributor / Artist</th>
                      <th className="px-6 py-4 font-bold">Speaker ID</th>
                      <th className="px-6 py-4 font-bold text-center">Approved Workload</th>
                      <th className="px-6 py-4 font-bold text-right text-emerald-400">Contributor Cut Owed</th>
                      <th className="px-6 py-4 font-bold text-left text-warning-400">Contributor UPI ID</th>
                      <th className="px-6 py-4 font-bold text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/70">
                    {filteredContributors.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="text-center py-20">
                          <Users className="w-12 h-12 text-neutral-600 mx-auto mb-3 opacity-40" />
                          <h4 className="text-base font-bold text-white mb-1">No Contributors Match Filter</h4>
                          <p className="text-xs text-neutral-400">
                            Try adjusting your search keywords or switching filter tabs.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredContributors.map((c) => {
                        const hasEarnings = (c.earnedPayout || 0) > 0;
                        const isCopied = copiedUpi === c.userId;

                        return (
                          <tr
                            key={c.userId}
                            className="hover:bg-neutral-800/40 transition-colors group"
                          >
                            {/* 1. Artist Details */}
                            <td className="px-6 py-4.5 whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-200 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                                  {(c.name || c.username || "U").slice(0, 2)}
                                </div>
                                <div>
                                  <div className="font-bold text-white text-sm group-hover:text-warning-400 transition-colors">
                                    {c.name || c.username}
                                  </div>
                                  <div className="text-[11px] text-neutral-400 flex items-center gap-2 mt-0.5">
                                    <span>@{c.username}</span>
                                    {c.email && (
                                      <>
                                        <span>•</span>
                                        <span className="truncate max-w-[160px]" title={c.email}>{c.email}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* 2. Speaker ID */}
                            <td className="px-6 py-4.5 whitespace-nowrap">
                              {c.speaker_id && c.speaker_id !== "N/A" ? (
                                <span className="font-mono text-xs font-extrabold px-2.5 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-primary-400">
                                  {c.speaker_id}
                                </span>
                              ) : (
                                <span className="text-neutral-500 italic text-[11px]">-</span>
                              )}
                            </td>

                            {/* 3. Approved Workload */}
                            <td className="px-6 py-4.5 text-center whitespace-nowrap">
                              <div className="font-mono font-bold text-white text-sm">
                                {(c.approvedHours || 0).toFixed(2)} hrs
                              </div>
                              <div className="text-[10px] text-neutral-400 font-semibold mt-0.5">
                                {c.totalApprovedCount || 0} approved tasks
                              </div>
                            </td>

                            {/* 4. Contributor Cut Owed */}
                            <td className="px-6 py-4.5 text-right whitespace-nowrap">
                              <div className={`font-mono font-black text-base ${hasEarnings ? "text-emerald-400" : "text-neutral-400"}`}>
                                {money(c.earnedPayout)}
                              </div>
                              <div className="text-[10px] text-neutral-400 font-medium mt-0.5">
                                Sole Contributor Cut
                              </div>
                            </td>

                            {/* 5. Contributor UPI ID */}
                            <td className="px-6 py-4.5 whitespace-nowrap">
                              {c.upiId ? (
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-950 border border-neutral-750 font-mono text-xs text-amber-300 shadow-inner group/upi">
                                  <span className="font-bold">{c.upiId}</span>
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(c.upiId, c.userId)}
                                    className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors"
                                    title="Copy UPI ID"
                                  >
                                    {isCopied ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5 text-neutral-400 group-hover/upi:text-amber-300" />
                                    )}
                                  </button>
                                  {isCopied && (
                                    <span className="text-[10px] text-emerald-400 font-bold ml-0.5">
                                      Copied!
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/40 border border-rose-800/40 text-rose-300 text-[11px] font-bold">
                                  <AlertCircle className="w-3 h-3 text-rose-400" />
                                  <span>No UPI Added</span>
                                </span>
                              )}
                            </td>

                            {/* 6. Actions */}
                            <td className="px-6 py-4.5 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-2">
                                <Link
                                  to={`/admin/payouts/${c.userId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white font-bold text-xs border border-neutral-700 transition-all"
                                  title="View complete user payout statement"
                                >
                                  <span>Payout History</span>
                                  <ExternalLink className="w-3 h-3 text-neutral-400" />
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Table Footer Count Summary */}
              <div className="p-5 border-t border-neutral-800 bg-neutral-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-neutral-400">
                <div>
                  Showing <strong className="text-white">{filteredContributors.length}</strong> of <strong className="text-white">{contributors.length}</strong> registered contributors
                </div>
                <div className="flex items-center gap-4">
                  <span>With UPI: <strong className="text-emerald-400">{contributors.filter(c => Boolean(c.upiId)).length}</strong></span>
                  <span>Missing UPI: <strong className="text-rose-400">{contributors.filter(c => !c.upiId).length}</strong></span>
                </div>
              </div>
            </div>

            {/* Optional Project-wise Workload Distribution Breakdown */}
            {projects.length > 0 && (
              <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 p-6 md:p-8 shadow-xl">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-400" />
                  <span>Projects Workload Distribution for {vendor.name}</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {projects.map((p) => {
                    const pHours = (p.languages || []).reduce((acc, l) => acc + (l.approvedHours || 0), 0);
                    const pWorkers = (p.languages || []).reduce((acc, l) => acc + (l.contributorsList?.length || 0), 0);

                    return (
                      <div
                        key={p.subprojectId}
                        className="bg-neutral-950/80 border border-neutral-800 p-5 rounded-2xl flex flex-col justify-between hover:border-neutral-700 transition-all"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">
                              {p.categoryLabel || p.category || "Project"}
                            </span>
                            <span className="text-xs font-mono font-bold text-emerald-400">
                              {pHours.toFixed(1)} hrs
                            </span>
                          </div>

                          <h4 className="font-bold text-white text-sm mb-1">{p.subprojectName}</h4>
                          <p className="text-xs text-neutral-400">
                            {p.languages?.length || 0} active language{(p.languages?.length || 0) === 1 ? "" : "s"} • {pWorkers} artists
                          </p>
                        </div>

                        <div className="mt-4 pt-3 border-t border-neutral-850 flex items-center justify-between text-xs">
                          <span className="text-neutral-500">Margin rate:</span>
                          <span className="font-mono font-bold text-white">${p.marginRate || 0}/hr</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
