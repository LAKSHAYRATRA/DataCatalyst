import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { 
  Building2, 
  Users, 
  DollarSign, 
  Copy, 
  Check, 
  ExternalLink, 
  X, 
  Search, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight,
  CreditCard,
  Layers,
  Sparkles,
  Trash2,
  Plus,
  ArrowDownCircle
} from "lucide-react";
import { apiGet, apiPostJson, apiDeleteJson } from "../lib/api.js";
import Swal from "sweetalert2";

function money(value) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

export default function AdminVendorPayoutsModal({ vendorId, isOpen, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [contributorSearch, setContributorSearch] = useState("");
  const [activeSection, setActiveSection] = useState("contributors"); // "contributors" | "projects" | "payouts"
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [copiedRefId, setCopiedRefId] = useState(null);

  // Record Payout Modal State
  const [showRecordPayoutModal, setShowRecordPayoutModal] = useState(false);
  const [submittingPayout, setSubmittingPayout] = useState(false);
  const [payoutForm, setPayoutForm] = useState({
    amountUsd: "",
    amountInr: "",
    paymentMethod: "upi",
    referenceId: "",
    note: "Margin Settlement",
    paidAt: new Date().toISOString().slice(0, 16)
  });

  useEffect(() => {
    if (!isOpen || !vendorId) return;

    let isMounted = true;
    setLoading(true);
    setError("");
    setData(null);

    apiGet(`/api/admin/vendors/${vendorId}/analytics`)
      .then((res) => {
        if (isMounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || "Failed to load vendor analytics");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, vendorId]);

  // Handle ESC key to close modal
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && isOpen && !showRecordPayoutModal) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, showRecordPayoutModal, onClose]);

  if (!isOpen) return null;

  const vendor = data?.vendor || {};
  const summary = data?.summary || {};
  const contributors = data?.contributors || [];
  const projects = data?.projects || [];
  const payoutHistory = summary?.payoutHistory || [];

  const copyText = (text, type = "upi") => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (type === "upi") {
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    } else {
      setCopiedAccount(true);
      setTimeout(() => setCopiedAccount(false), 2000);
    }
  };

  const copyRef = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedRefId(id);
    setTimeout(() => setCopiedRefId(null), 2000);
  };

  const handleOpenRecordPayout = () => {
    const pending = summary.remainingBalance !== undefined ? summary.remainingBalance : Math.max(0, (summary.totalEstimatedMargin || 0) - (summary.totalPaidOut || 0));
    setPayoutForm({
      amountUsd: pending > 0 ? pending.toFixed(2) : "",
      amountInr: pending > 0 ? Math.round(pending * 83).toString() : "",
      paymentMethod: vendor.payoutDetails?.bankAccountNumber ? "bank_transfer" : "upi",
      referenceId: "",
      note: "Margin Settlement",
      paidAt: new Date().toISOString().slice(0, 16)
    });
    setShowRecordPayoutModal(true);
  };

  const handleRecordPayoutSubmit = async (e) => {
    e.preventDefault();
    const val = Number(payoutForm.amountUsd);
    if (isNaN(val) || val <= 0) {
      Swal.fire({
        icon: "error",
        title: "Invalid Amount",
        text: "Please enter a valid positive payout amount in USD.",
        background: "#171717",
        color: "#fff"
      });
      return;
    }

    setSubmittingPayout(true);
    try {
      const res = await apiPostJson(`/api/admin/vendors/${vendorId}/payouts`, {
        amountUsd: val,
        amountInr: Number(payoutForm.amountInr) || 0,
        paymentMethod: payoutForm.paymentMethod,
        referenceId: payoutForm.referenceId,
        note: payoutForm.note,
        paidAt: payoutForm.paidAt ? new Date(payoutForm.paidAt) : new Date()
      });

      if (res?.ok) {
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "success",
          title: `Recorded $${val.toFixed(2)} payout transfer`,
          timer: 3000,
          showConfirmButton: false,
          background: "#171717",
          color: "#fff"
        });

        setData((prev) => {
          if (!prev) return prev;
          const updatedSummary = {
            ...prev.summary,
            totalPaidOut: res.totalPaidOut,
            remainingBalance: Math.max(0, Number(((prev.summary?.totalEstimatedMargin || 0) - res.totalPaidOut).toFixed(2))),
            payoutHistory: res.payoutHistory
          };
          return { ...prev, summary: updatedSummary };
        });

        setShowRecordPayoutModal(false);
      }
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Failed to Record Payout",
        text: err.message || "Failed to log vendor payout",
        background: "#171717",
        color: "#fff"
      });
    } finally {
      setSubmittingPayout(false);
    }
  };

  const handleDeletePayout = async (payoutId, amount) => {
    const confirm = await Swal.fire({
      title: "Reverse Payout Transfer?",
      text: `Are you sure you want to reverse/delete this payout of $${Number(amount).toFixed(2)}? The vendor's unsettled balance will increase accordingly.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#262626",
      confirmButtonText: "Yes, Reverse Payout",
      cancelButtonText: "Cancel",
      background: "#171717",
      color: "#fff"
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await apiDeleteJson(`/api/admin/vendors/${vendorId}/payouts/${payoutId}`);
      if (res?.ok) {
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "success",
          title: "Payout reversed successfully",
          timer: 2500,
          showConfirmButton: false,
          background: "#171717",
          color: "#fff"
        });

        setData((prev) => {
          if (!prev) return prev;
          const updatedSummary = {
            ...prev.summary,
            totalPaidOut: res.totalPaidOut,
            remainingBalance: Math.max(0, Number(((prev.summary?.totalEstimatedMargin || 0) - res.totalPaidOut).toFixed(2))),
            payoutHistory: res.payoutHistory
          };
          return { ...prev, summary: updatedSummary };
        });
      }
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Delete Failed",
        text: err.message || "Failed to reverse payout",
        background: "#171717",
        color: "#fff"
      });
    }
  };

  const filteredContributors = contributors.filter((c) => {
    if (!contributorSearch.trim()) return true;
    const q = contributorSearch.toLowerCase();
    return (
      (c.name || "").toLowerCase().includes(q) ||
      (c.username || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.speaker_id || "").toLowerCase().includes(q) ||
      (c.upiId || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-10 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto">
        
        {/* Top Ambient Glow */}
        <div className="absolute top-0 right-1/4 w-96 h-32 bg-primary-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 left-10 w-72 h-28 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="relative z-10 px-6 py-5 border-b border-neutral-800 bg-neutral-900/90 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500/20 to-primary-600/10 border border-primary-500/30 flex items-center justify-center text-primary-400 shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
                  {loading ? "Loading Vendor..." : (vendor.name || "Vendor Details")}
                </h2>
                {vendor.vendorCode && (
                  <span className="font-mono text-xs font-extrabold px-2.5 py-0.5 rounded-lg bg-neutral-800 text-primary-400 border border-neutral-700">
                    {vendor.vendorCode}
                  </span>
                )}
                {vendor.isStudio ? (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-purple-950/80 text-purple-300 border border-purple-800/60">
                    🎙️ Voice Studio
                  </span>
                ) : (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-950/80 text-blue-300 border border-blue-800/60">
                    🏢 Vendor Agency
                  </span>
                )}
                {vendor.status && (
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                    vendor.status === 'active' 
                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60' 
                      : 'bg-rose-950/60 text-rose-400 border border-rose-800/60'
                  }`}>
                    {vendor.status}
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400 mt-1 flex items-center gap-3 flex-wrap">
                <span>Contact: <strong className="text-neutral-200">{vendor.contactPerson || "N/A"}</strong></span>
                <span>•</span>
                <span>Email: <strong className="text-neutral-200">{vendor.email || "N/A"}</strong></span>
                {vendor.phone && (
                  <>
                    <span>•</span>
                    <span>Phone: <strong className="text-neutral-200">{vendor.phone}</strong></span>
                  </>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="relative z-10 flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 border-4 border-neutral-700 border-t-primary-500 rounded-full animate-spin" />
              <p className="text-sm font-semibold text-neutral-400">Loading vendor analytics & financial ledger...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-sm flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : (
            <>
              {/* Financial Highlight Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* 1. Vendor Total Accrued Earning */}
                <div className="relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-850 border border-neutral-800 shadow-lg">
                  <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-neutral-400">
                    <span>Total Accrued Margin</span>
                    <DollarSign className="w-4 h-4 text-primary-400" />
                  </div>
                  <div className="text-3xl font-black text-white mt-2 font-mono">
                    {money(summary.totalEstimatedMargin)}
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    {vendor.isStudio ? "Studio rate split volume margin cut" : "Agency fixed base margin from all projects"}
                  </p>
                </div>

                {/* 2. Total Paid to Vendor */}
                <div className="relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-emerald-950/40 via-neutral-900 to-neutral-900 border border-emerald-800/50 shadow-lg">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
                  <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-emerald-400">
                    <span>Total Paid Out</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Settled ✓
                    </span>
                  </div>
                  <div className="text-3xl font-black text-emerald-300 mt-2 font-mono">
                    {money(summary.totalPaidOut || 0)}
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    {payoutHistory.length} settlement transfer{payoutHistory.length === 1 ? "" : "s"} logged
                  </p>
                </div>

                {/* 3. Pending Settlement Balance */}
                <div className="relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-cyan-950/40 via-neutral-900 to-neutral-900 border border-cyan-800/50 shadow-lg">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-xl pointer-events-none" />
                  <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-cyan-400">
                    <span>Pending Settlement</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      Unsettled
                    </span>
                  </div>
                  <div className="text-3xl font-black text-cyan-300 mt-2 font-mono">
                    {money(summary.remainingBalance !== undefined ? summary.remainingBalance : Math.max(0, (summary.totalEstimatedMargin || 0) - (summary.totalPaidOut || 0)))}
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    Accrued margin awaiting disbursement
                  </p>
                </div>

                {/* 4. Contributors Combined Sole Cut */}
                <div className="relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-indigo-950/40 via-neutral-900 to-neutral-900 border border-indigo-800/50 shadow-lg">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl pointer-events-none" />
                  <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-indigo-400">
                    <span>Contributors Sole Cut</span>
                    <Users className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="text-3xl font-black text-indigo-300 mt-2 font-mono">
                    {money(summary.totalArtistPayout)}
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    Across {summary.totalApprovedHours || 0} hrs ({summary.totalWorkers || 0} artists)
                  </p>
                </div>

              </div>

              {/* Vendor Payout Details Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-neutral-950/80 border border-neutral-800 shadow-inner flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1">
                    Vendor Payout Settlement Details
                  </span>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {vendor.payoutDetails?.upiId ? (
                      <div className="flex items-center gap-2 bg-neutral-900 px-3 py-1.5 rounded-xl border border-neutral-700">
                        <span className="text-neutral-400">UPI:</span>
                        <span className="font-mono font-bold text-amber-400">{vendor.payoutDetails.upiId}</span>
                        <button
                          type="button"
                          onClick={() => copyText(vendor.payoutDetails.upiId, "upi")}
                          className="ml-1 p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors"
                          title="Copy UPI ID"
                        >
                          {copiedUpi ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    ) : (
                      <span className="text-neutral-500 italic">No UPI ID configured</span>
                    )}

                    {vendor.payoutDetails?.bankAccountNumber && (
                      <div className="flex items-center gap-2 bg-neutral-900 px-3 py-1.5 rounded-xl border border-neutral-700">
                        <span className="text-neutral-400">Bank A/C:</span>
                        <span className="font-mono font-bold text-white">•••• {vendor.payoutDetails.bankAccountNumber.slice(-4)}</span>
                        {vendor.payoutDetails.ifscCode && (
                          <span className="text-neutral-400 text-[10px] font-mono">({vendor.payoutDetails.ifscCode})</span>
                        )}
                        <button
                          type="button"
                          onClick={() => copyText(vendor.payoutDetails.bankAccountNumber, "account")}
                          className="ml-1 p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors"
                          title="Copy Account Number"
                        >
                          {copiedAccount ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}

                    {vendor.payoutDetails?.accountHolderName && (
                      <span className="text-neutral-400">
                        Holder: <strong className="text-neutral-200">{vendor.payoutDetails.accountHolderName}</strong>
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenRecordPayout}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Record Settlement Payment</span>
                  </button>
                  <Link
                    to={`/admin/vendors/${vendor._id}`}
                    className="px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-white transition-all flex items-center gap-1.5"
                  >
                    <span>Vendor Settings</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              {/* Sub-Navigation Tabs */}
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3 gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveSection("contributors")}
                    className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 ${
                      activeSection === "contributors"
                        ? "bg-primary-500 text-neutral-950 shadow-md font-black"
                        : "bg-neutral-800 text-neutral-400 hover:text-white"
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span>Contributor Accounts ({contributors.length})</span>
                  </button>
                  <button
                    onClick={() => setActiveSection("projects")}
                    className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 ${
                      activeSection === "projects"
                        ? "bg-primary-500 text-neutral-950 shadow-md font-black"
                        : "bg-neutral-800 text-neutral-400 hover:text-white"
                    }`}
                  >
                    <Layers className="w-4 h-4" />
                    <span>Project Breakdown ({projects.length})</span>
                  </button>
                  <button
                    onClick={() => setActiveSection("payouts")}
                    className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 ${
                      activeSection === "payouts"
                        ? "bg-primary-500 text-neutral-950 shadow-md font-black"
                        : "bg-neutral-800 text-neutral-400 hover:text-white"
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                    <span>Payout & Settlement History ({payoutHistory.length})</span>
                  </button>
                </div>

                {activeSection === "contributors" && (
                  <div className="relative min-w-[240px]">
                    <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search contributor name, speaker ID, email..."
                      value={contributorSearch}
                      onChange={(e) => setContributorSearch(e.target.value)}
                      className="w-full bg-neutral-950/80 border border-neutral-800 text-white placeholder-neutral-500 text-xs rounded-xl pl-8 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                )}

                {activeSection === "payouts" && (
                  <button
                    type="button"
                    onClick={handleOpenRecordPayout}
                    className="px-3.5 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-bold text-xs transition-all flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Log Payout</span>
                  </button>
                )}
              </div>

              {/* SECTION 1: ALL CONTRIBUTORS & SOLE CUTS */}
              {activeSection === "contributors" && (
                <div className="space-y-3">
                  <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400">
                    <span>
                      Showing <strong className="text-white">{filteredContributors.length}</strong> of <strong className="text-white">{contributors.length}</strong> linked contributor accounts
                    </span>
                    <span className="text-[11px] italic text-neutral-500">
                      Sole cut = Contributor's payout · Vendor cut = Agency margin
                    </span>
                  </div>

                  {filteredContributors.length === 0 ? (
                    <div className="py-12 text-center text-neutral-500 text-sm bg-neutral-950/40 rounded-2xl border border-neutral-800">
                      No contributor accounts match your search.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950/50 shadow-inner">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-neutral-900/90 text-neutral-400 uppercase font-extrabold tracking-wider text-[10px] border-b border-neutral-800">
                          <tr>
                            <th className="px-4 py-3.5">Contributor / Speaker</th>
                            <th className="px-4 py-3.5">Approved Workload</th>
                            <th className="px-4 py-3.5 text-right font-mono text-indigo-400">Contributor Cut</th>
                            <th className="px-4 py-3.5 text-right font-mono text-emerald-400">Vendor Cut</th>
                            <th className="px-4 py-3.5">Projects Contributed</th>
                            <th className="px-4 py-3.5 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-850">
                          {filteredContributors.map((c) => (
                            <tr key={c.userId} className="hover:bg-neutral-900/50 transition-colors group">
                              
                              {/* Contributor identity */}
                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center font-bold text-neutral-300 text-xs shrink-0">
                                    {(c.name || c.username || "U")[0].toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="font-bold text-white flex items-center gap-1.5">
                                      <span>{c.name || c.username}</span>
                                      {c.speaker_id && c.speaker_id !== "N/A" && (
                                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-primary-400 border border-neutral-700">
                                          {c.speaker_id}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-neutral-400 flex items-center gap-2 mt-0.5">
                                      <span>{c.email}</span>
                                      {c.mobileNumber && c.mobileNumber !== "N/A" && (
                                        <>
                                          <span>•</span>
                                          <span>{c.mobileNumber}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Approved workload */}
                              <td className="px-4 py-3.5">
                                <div className="font-mono font-bold text-white">
                                  {c.approvedHours || 0} hrs
                                </div>
                                <div className="text-[10px] text-neutral-400 mt-0.5">
                                  <span className="text-emerald-400 font-bold">{c.totalApprovedCount || 0} approved</span>
                                  {c.totalPendingCount > 0 && <span> · {c.totalPendingCount} pending</span>}
                                  {c.totalRejectedCount > 0 && <span> · {c.totalRejectedCount} rejected</span>}
                                </div>
                              </td>

                              {/* Contributor's sole cut */}
                              <td className="px-4 py-3.5 text-right font-mono font-black text-sm text-indigo-300">
                                {money(c.earnedPayout)}
                              </td>

                              {/* Vendor's margin from contributor */}
                              <td className="px-4 py-3.5 text-right font-mono font-bold text-sm text-emerald-400">
                                {money(c.earnedMargin)}
                              </td>

                              {/* Projects list */}
                              <td className="px-4 py-3.5">
                                {c.projects && c.projects.length > 0 ? (
                                  <div className="flex flex-wrap gap-1 max-w-xs">
                                    {c.projects.map((p, idx) => (
                                      <span
                                        key={idx}
                                        className="text-[10px] px-2 py-0.5 rounded bg-neutral-900 text-neutral-300 border border-neutral-800 truncate"
                                        title={`${p.projectName} (${p.language}) - ${p.approvedHours}h`}
                                      >
                                        {p.projectName}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-neutral-500 italic text-[11px]">No task activity yet</span>
                                )}
                              </td>

                              {/* Actions */}
                              <td className="px-4 py-3.5 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <Link
                                    to={`/admin/payouts/${c.userId}`}
                                    className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white font-bold text-[11px] transition-colors flex items-center gap-1"
                                    title="Open contributor's full payout history"
                                  >
                                    <span>Payout Sheet</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </Link>
                                </div>
                              </td>

                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 2: PROJECT & LANGUAGE BREAKDOWN */}
              {activeSection === "projects" && (
                <div className="space-y-4">
                  {projects.length === 0 ? (
                    <div className="py-12 text-center text-neutral-500 text-sm bg-neutral-950/40 rounded-2xl border border-neutral-800">
                      No active project assignments found for this vendor.
                    </div>
                  ) : (
                    projects.map((proj) => (
                      <div key={proj.subprojectId} className="p-5 rounded-2xl bg-neutral-950/60 border border-neutral-800 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800 pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-extrabold text-white text-sm tracking-tight">{proj.subprojectName}</h4>
                              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                                {proj.categoryLabel}
                              </span>
                            </div>
                            <p className="text-[11px] text-neutral-400 mt-0.5">
                              {proj.workersCount || 0} active workers · {proj.assignedLanguagesCount || 1} languages
                            </p>
                          </div>
                          <div className="flex items-center gap-4 text-xs font-mono">
                            <div>
                              <span className="text-neutral-500 block text-[10px] uppercase font-sans">Vendor Cut:</span>
                              <span className="font-bold text-emerald-400">{money(proj.totalMarginEarned)}</span>
                            </div>
                            <div>
                              <span className="text-neutral-500 block text-[10px] uppercase font-sans">Contributors Cut:</span>
                              <span className="font-bold text-indigo-400">{money(proj.totalPayoutEarned)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Languages under project */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {(proj.languages || []).map((lang) => (
                            <div key={lang.language} className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-1 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-white">{lang.languageLabel || lang.language}</span>
                                <span className="font-mono text-neutral-400 text-[11px]">${lang.projectRate || 25}/hr</span>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1">
                                <span>{lang.contributorsCount || 0} artists</span>
                                <span className="font-mono text-emerald-400 font-bold">{lang.totalApprovedCount || 0} approved</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* SECTION 3: PAYOUT & SETTLEMENT HISTORY */}
              {activeSection === "payouts" && (
                <div className="space-y-4">
                  <div className="bg-neutral-950/60 p-4 rounded-2xl border border-neutral-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Clock className="w-4 h-4 text-emerald-400" />
                        Vendor Settlement Transfer Ledger
                      </h4>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        Historical records of all margin settlements paid to {vendor.name || "this vendor"} with exact dates and UTR numbers.
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <div className="px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800">
                        <span className="text-neutral-400">Total Settled: </span>
                        <strong className="text-emerald-400 font-mono">{money(summary.totalPaidOut || 0)}</strong>
                      </div>
                      <div className="px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800">
                        <span className="text-neutral-400">Pending: </span>
                        <strong className="text-cyan-400 font-mono">
                          {money(summary.remainingBalance !== undefined ? summary.remainingBalance : Math.max(0, (summary.totalEstimatedMargin || 0) - (summary.totalPaidOut || 0)))}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {payoutHistory.length === 0 ? (
                    <div className="py-16 text-center text-neutral-500 text-xs bg-neutral-950/40 rounded-2xl border border-neutral-800 space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-neutral-800/50 border border-neutral-700/50 flex items-center justify-center mx-auto text-neutral-500">
                        <DollarSign className="w-6 h-6" />
                      </div>
                      <p className="font-semibold text-neutral-300 text-sm">No settlement payouts recorded yet</p>
                      <p className="text-neutral-500 max-w-sm mx-auto">
                        Record a settlement payout to reflect payments transferred to the vendor's bank or UPI account.
                      </p>
                      <button
                        type="button"
                        onClick={handleOpenRecordPayout}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all shadow-md inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Record First Settlement Payment</span>
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950/50 shadow-inner">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-neutral-900/90 text-neutral-400 uppercase font-extrabold tracking-wider text-[10px] border-b border-neutral-800">
                          <tr>
                            <th className="px-4 py-3.5">Payment Date & Time</th>
                            <th className="px-4 py-3.5">Amount Paid</th>
                            <th className="px-4 py-3.5">Payment Method</th>
                            <th className="px-4 py-3.5">Reference / UTR ID</th>
                            <th className="px-4 py-3.5">Note / Memo</th>
                            <th className="px-4 py-3.5 text-center">Status</th>
                            <th className="px-4 py-3.5 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-850">
                          {payoutHistory.map((p) => (
                            <tr key={p._id} className="hover:bg-neutral-900/50 transition-colors">
                              <td className="px-4 py-3.5">
                                <div className="font-bold text-white flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-neutral-400" />
                                  <span>
                                    {new Date(p.paidAt || p.createdAt).toLocaleDateString("en-US", {
                                      year: "numeric",
                                      month: "short",
                                      day: "numeric"
                                    })}
                                  </span>
                                </div>
                                <div className="text-[11px] text-neutral-500 mt-0.5">
                                  {new Date(p.paidAt || p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </td>

                              <td className="px-4 py-3.5">
                                <div className="font-mono font-black text-emerald-400 text-sm">
                                  ${(Number(p.amountUsd) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                {p.amountInr > 0 && (
                                  <div className="text-[11px] text-neutral-400 font-mono mt-0.5">
                                    ₹{Number(p.amountInr).toLocaleString("en-IN")}
                                  </div>
                                )}
                              </td>

                              <td className="px-4 py-3.5">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-neutral-800 text-neutral-200 border border-neutral-700">
                                  {p.paymentMethod === "upi" ? "⚡ UPI Transfer" : p.paymentMethod === "bank_transfer" ? "🏦 Bank IMPS/NEFT" : p.paymentMethod?.toUpperCase() || "Transfer"}
                                </span>
                              </td>

                              <td className="px-4 py-3.5">
                                {p.referenceId ? (
                                  <div className="flex items-center gap-1.5 font-mono text-neutral-300">
                                    <span className="bg-neutral-900 px-2 py-1 rounded border border-neutral-800 text-neutral-200 select-all text-[11px]">
                                      {p.referenceId}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => copyRef(p.referenceId, p._id)}
                                      className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors"
                                      title="Copy Reference ID"
                                    >
                                      {copiedRefId === p._id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-neutral-500 italic text-[11px]">No UTR</span>
                                )}
                              </td>

                              <td className="px-4 py-3.5 text-neutral-300 max-w-xs truncate text-[11px]">
                                {p.note || "Margin Settlement"}
                              </td>

                              <td className="px-4 py-3.5 text-center">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  <span>Paid Out</span>
                                </span>
                              </td>

                              <td className="px-4 py-3.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDeletePayout(p._id, p.amountUsd)}
                                  className="p-1.5 text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                                  title="Reverse / delete this recorded payout"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-neutral-800 bg-neutral-900/90 flex items-center justify-between gap-4">
          <div className="text-xs text-neutral-500">
            DataCatalyst Platform · Vendor & Studio Financial Settlements
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs transition-colors"
          >
            Close
          </button>
        </div>

      </div>

      {/* RECORD PAYOUT MODAL */}
      {showRecordPayoutModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-lg shadow-2xl p-6 relative overflow-hidden space-y-5">
            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
            
            <div className="relative z-10 flex items-center justify-between pb-4 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                  <ArrowDownCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Record Settlement Payout</h3>
                  <p className="text-xs text-neutral-400">
                    Log margin disbursement transferred to <strong className="text-neutral-200">{vendor.name}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRecordPayoutModal(false)}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordPayoutSubmit} className="relative z-10 space-y-4 text-xs">
              {/* Recipient Details Info */}
              <div className="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-1">
                <span className="text-[10px] font-bold uppercase text-neutral-500">Destination Account</span>
                <div className="flex items-center justify-between text-neutral-300 font-mono text-[11px]">
                  <span>{vendor.payoutDetails?.upiId ? `UPI: ${vendor.payoutDetails.upiId}` : (vendor.payoutDetails?.bankAccountNumber ? `Bank: •••• ${vendor.payoutDetails.bankAccountNumber.slice(-4)}` : "No credentials on file")}</span>
                  {vendor.payoutDetails?.accountHolderName && <span className="text-neutral-400 font-sans">{vendor.payoutDetails.accountHolderName}</span>}
                </div>
              </div>

              {/* Amount Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-300 mb-1">
                    Amount (USD $) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="e.g. 250.00"
                    value={payoutForm.amountUsd}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPayoutForm({
                        ...payoutForm,
                        amountUsd: val,
                        amountInr: val ? Math.round(Number(val) * 83).toString() : ""
                      });
                    }}
                    className="w-full px-3 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-white font-mono font-bold focus:outline-none focus:border-primary-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-neutral-300 mb-1">
                    Equivalent INR (₹)
                  </label>
                  <input
                    type="number"
                    step="1"
                    placeholder="e.g. 20750"
                    value={payoutForm.amountInr}
                    onChange={(e) => setPayoutForm({ ...payoutForm, amountInr: e.target.value })}
                    className="w-full px-3 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-200 font-mono focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              {/* Payment Method & Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-300 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={payoutForm.paymentMethod}
                    onChange={(e) => setPayoutForm({ ...payoutForm, paymentMethod: e.target.value })}
                    className="w-full px-3 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-200 focus:outline-none focus:border-primary-500"
                  >
                    <option value="upi">⚡ UPI Transfer</option>
                    <option value="bank_transfer">🏦 Bank IMPS / NEFT</option>
                    <option value="cash">💵 Cash / Retainer</option>
                    <option value="other">🌐 Direct Wire / Other</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-neutral-300 mb-1">
                    Payment Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={payoutForm.paidAt}
                    onChange={(e) => setPayoutForm({ ...payoutForm, paidAt: e.target.value })}
                    className="w-full px-3 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-200 focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              {/* Transaction UTR Reference */}
              <div>
                <label className="block font-semibold text-neutral-300 mb-1">
                  Bank Reference / UTR Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 424911293849 or UPI/4249..."
                  value={payoutForm.referenceId}
                  onChange={(e) => setPayoutForm({ ...payoutForm, referenceId: e.target.value })}
                  className="w-full px-3 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-200 font-mono focus:outline-none focus:border-primary-500"
                />
              </div>

              {/* Note / Memo */}
              <div>
                <label className="block font-semibold text-neutral-300 mb-1">
                  Memo / Note
                </label>
                <input
                  type="text"
                  placeholder="e.g. Weekly Margin Settlement"
                  value={payoutForm.note}
                  onChange={(e) => setPayoutForm({ ...payoutForm, note: e.target.value })}
                  className="w-full px-3 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-200 focus:outline-none focus:border-primary-500"
                />
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-neutral-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowRecordPayoutModal(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPayout}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{submittingPayout ? "Saving..." : "Save Settlement Payout"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
