import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import AdminNav from "../components/AdminNav.jsx";
import { 
  DollarSign, 
  Wallet, 
  Users, 
  Building2, 
  Copy, 
  Check, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink,
  CreditCard,
  X,
  Loader2,
  Clock,
  CheckCircle2,
  ShieldCheck
} from "lucide-react";
import { apiGet, apiPostJson } from "../lib/api.js";
import Swal from "sweetalert2";

function money(value) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

export default function AdminFinances() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [qaData, setQaData] = useState(null);
  
  const [activeTab, setActiveTab] = useState("projects"); // "projects" | "contributors" | "qa"
  const [search, setSearch] = useState("");
  const [expandedProjects, setExpandedProjects] = useState({});
  const [selectedUserModal, setSelectedUserModal] = useState(null);
  const [copiedUpi, setCopiedUpi] = useState(false);

  useEffect(() => {
    fetchFinances();
  }, []);

  async function fetchFinances() {
    setLoading(true);
    setError("");
    try {
      const [res, qaRes] = await Promise.all([
        apiGet("/api/admin/payouts/finances"),
        apiGet("/api/admin/qa/payments-stats").catch(() => null)
      ]);
      setData(res);
      setQaData(qaRes);
    } catch (err) {
      console.error("Failed to load finances", err);
      setError(err.message || "Failed to load financial overview");
    } finally {
      setLoading(false);
    }
  }

  const toggleProjectExpand = (projId) => {
    setExpandedProjects(prev => ({
      ...prev,
      [projId]: !prev[projId]
    }));
  };

  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  const openUserModal = (userObj) => {
    setSelectedUserModal(userObj);
    setCopiedUpi(false);
  };

  const handleQaPayNow = async (item) => {
    const upiId = item.qaUser.upiId || "Not Provided";
    const remaining = item.totalRemainingUsd !== undefined ? item.totalRemainingUsd : item.totalEarningsUsd;
    const result = await Swal.fire({
      title: "Confirm QA Payout",
      html: `
        <div style="text-align: left; background: #111827; padding: 16px; border-radius: 12px; margin-top: 12px; border: 1px solid #374151;">
          <div style="margin-bottom: 12px;">
            <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">QA Reviewer</div>
            <div style="color: #ffffff; font-weight: 600; font-size: 15px; margin-top: 2px;">${item.qaUser.name}</div>
            <div style="color: #6b7280; font-size: 12px;">${item.qaUser.email}</div>
          </div>

          <div style="margin-bottom: 12px;">
            <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">UPI ID for Payment</div>
            <div style="display: flex; align-items: center; justify-content: space-between; background: #1f2937; padding: 8px 12px; border-radius: 8px; border: 1px solid #4b5563; margin-top: 4px;">
              <span style="font-family: monospace; color: #f59e0b; font-weight: 700; font-size: 14px;">${upiId}</span>
              ${item.qaUser.upiId ? `<button type="button" onclick="navigator.clipboard.writeText('${item.qaUser.upiId}'); this.innerText='Copied!';" style="background: #374151; color: #e5e7eb; border: none; padding: 4px 8px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: 600;">Copy UPI</button>` : ''}
            </div>
          </div>

          <div>
            <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Remaining Owed Balance</div>
            <div style="color: #10b981; font-weight: 700; font-size: 22px; margin-top: 2px;">${money(remaining)}</div>
          </div>
        </div>
        <p style="margin-top: 14px; font-size: 13px; color: #d1d5db;">Are you sure you want to mark this QA payout as paid?</p>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#10b981",
      cancelButtonColor: "#475569",
      confirmButtonText: "Yes, Pay Now",
      cancelButtonText: "Cancel",
      background: "#1f2937",
      color: "#fff"
    });

    if (result.isConfirmed) {
      try {
        await apiPostJson(`/api/admin/payouts/users/${item.qaUser._id}/payments`, {
          amountUsd: remaining,
          note: "QA Payout from Finances tab"
        });
        Swal.fire({ title: "Paid!", text: "The QA payout has been recorded successfully.", icon: "success", background: "#1f2937", color: "#fff" });
        fetchFinances();
      } catch (e) {
        Swal.fire({ title: "Error", text: e.message, icon: "error", background: "#1f2937", color: "#fff" });
      }
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 transition-colors duration-300">
      <AdminNav />
      <main className="flex-1 md:ml-64 p-4 md:p-8 max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
              <Wallet className="w-8 h-8 text-warning-500" />
              Financial Overview & Pending Payouts
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              Project-wise payment pending overview, contributor liabilities, and stored UPI ID inspection.
            </p>
          </div>
          <button
            onClick={fetchFinances}
            disabled={loading}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-medium rounded-xl text-xs flex items-center gap-2 border border-neutral-700 transition-all self-start md:self-auto"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin text-warning-400" /> : <Clock className="w-4 h-4 text-warning-400" />}
            Refresh Data
          </button>
        </div>

        {loading ? (
          <div className="bg-neutral-800 border border-neutral-700 rounded-2xl text-center py-20 shadow-xl">
            <Loader2 className="w-8 h-8 animate-spin text-warning-500 mx-auto mb-3" />
            <p className="text-neutral-400">Loading financial records...</p>
          </div>
        ) : error ? (
          <div className="bg-red-900/40 border border-red-700 text-red-200 p-6 rounded-2xl shadow-xl">
            <h3 className="font-bold text-lg mb-1">Error Loading Finances</h3>
            <p className="text-sm">{error}</p>
          </div>
        ) : (
          <div className="space-y-8 animate-fade-in">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-neutral-800/90 border border-warning-500/40 p-5 rounded-2xl shadow-lg relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-warning-400">Total Pending Payouts</span>
                  <div className="w-9 h-9 rounded-xl bg-warning-500/10 text-warning-400 flex items-center justify-center">
                    <Wallet className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-extrabold text-warning-300 mt-2">
                  {money(data?.overall?.totalPendingPayoutUsd)}
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Owed across {data?.overall?.pendingContributorsCount || 0} contributors
                </p>
              </div>

              <div className="bg-neutral-800/90 border border-emerald-500/40 p-5 rounded-2xl shadow-lg relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Total Earned Generated</span>
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <DollarSign className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-extrabold text-emerald-300 mt-2">
                  {money(data?.overall?.totalEarnedUsd)}
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Total approved workload value
                </p>
              </div>

              <div className="bg-neutral-800/90 border border-blue-500/40 p-5 rounded-2xl shadow-lg relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Total Paid Out</span>
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-extrabold text-blue-300 mt-2">
                  {money(data?.overall?.totalPaidOutUsd)}
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Cleared to contributors so far
                </p>
              </div>

              <div className="bg-neutral-800/90 border border-purple-500/40 p-5 rounded-2xl shadow-lg relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-400">Active Contributors</span>
                  <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                    <Users className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl font-extrabold text-purple-300 mt-2">
                  {data?.overall?.totalContributorsCount || 0}
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Contributors registered
                </p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center justify-between border-b border-neutral-700 pb-4 gap-4 flex-wrap">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab("projects")}
                  className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
                    activeTab === "projects"
                      ? "bg-warning-500 text-neutral-950 shadow-lg font-extrabold"
                      : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white"
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  Project-Wise Pending Payments ({data?.projects?.length || 0})
                </button>
                <button
                  onClick={() => setActiveTab("contributors")}
                  className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
                    activeTab === "contributors"
                      ? "bg-warning-500 text-neutral-950 shadow-lg font-extrabold"
                      : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white"
                  }`}
                >
                  <Users className="w-4 h-4" />
                  All Contributors ({data?.contributors?.length || 0})
                </button>
                <button
                  onClick={() => setActiveTab("qa")}
                  className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
                    activeTab === "qa"
                      ? "bg-warning-500 text-neutral-950 shadow-lg font-extrabold"
                      : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white"
                  }`}
                >
                  <ShieldCheck className="w-4 h-4 text-warning-400" />
                  QA ({qaData?.stats?.length || 0})
                </button>
              </div>

              {/* Search Box */}
              <div className="relative min-w-[260px] flex-1 sm:flex-initial">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search contributor name, email, UPI ID..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 text-xs rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-warning-500 w-full"
                />
              </div>
            </div>

            {/* TAB 1: PROJECT-WISE PENDING PAYMENTS */}
            {activeTab === "projects" && (
              <div className="space-y-4">
                {(() => {
                  const filteredProjects = (data?.projects || []).filter(p => {
                    if (!search.trim()) return true;
                    const q = search.toLowerCase();
                    if (p.displayName.toLowerCase().includes(q)) return true;
                    return p.contributors.some(c => 
                      c.name.toLowerCase().includes(q) || 
                      c.email.toLowerCase().includes(q) || 
                      (c.upiId || "").toLowerCase().includes(q)
                    );
                  });

                  if (filteredProjects.length === 0) {
                    return (
                      <div className="bg-neutral-800 border border-neutral-700 rounded-2xl text-center py-16">
                        <Building2 className="w-12 h-12 text-neutral-500 mx-auto mb-3" />
                        <h3 className="text-lg font-semibold text-white">No Projects Found</h3>
                        <p className="text-neutral-400 text-xs mt-1">No phrase projects or call sessions match your search.</p>
                      </div>
                    );
                  }

                  return filteredProjects.map((proj) => {
                    const isExpanded = !!expandedProjects[proj.id];
                    return (
                      <div 
                        key={proj.id} 
                        className="bg-neutral-800 border border-neutral-700 rounded-2xl overflow-hidden shadow-xl transition-all"
                      >
                        {/* Project Header Bar */}
                        <div 
                          onClick={() => toggleProjectExpand(proj.id)}
                          className="p-5 flex flex-wrap items-center justify-between gap-4 cursor-pointer hover:bg-neutral-750/80 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-[200px]">
                            <div className="w-11 h-11 rounded-xl bg-warning-500/10 text-warning-400 border border-warning-500/30 flex items-center justify-center font-bold text-sm">
                              {proj.type === "call" ? "CALL" : "PROJ"}
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                {proj.displayName}
                              </h3>
                              <div className="flex items-center gap-3 text-xs text-neutral-400 mt-0.5">
                                <span>Rate: <strong className="text-neutral-200">{proj.hourlyPayout > 0 ? `$${proj.hourlyPayout}/hr` : "Variable / Custom"}</strong></span>
                                <span>•</span>
                                <span>Approved Recordings: <strong className="text-emerald-400">{proj.approvedCount}</strong></span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block">Total Project Earnings</span>
                              <span className="text-xl font-bold text-emerald-400">{money(proj.totalEarnedUsd)}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[11px] uppercase tracking-wider text-warning-400 font-semibold block">Contributors Owed</span>
                              <span className="text-lg font-bold text-white">{proj.contributorsCount} users</span>
                            </div>

                            <button className="p-2 rounded-lg bg-neutral-700 text-neutral-300 hover:text-white transition-colors">
                              {isExpanded ? <ChevronUp className="w-5 h-5 text-warning-400" /> : <ChevronDown className="w-5 h-5" />}
                            </button>
                          </div>
                        </div>

                        {/* Expandable Contributors List */}
                        {isExpanded && (
                          <div className="border-t border-neutral-700 bg-neutral-850 p-5 space-y-4">
                            <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center justify-between">
                              <span>Contributors Breakdown for {proj.displayName} ({proj.contributors.length})</span>
                              <span className="text-neutral-500 font-normal">Click a user row to view stored UPI ID</span>
                            </h4>

                            <div className="border border-neutral-700/80 rounded-xl overflow-hidden bg-neutral-900/60">
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead className="bg-neutral-750 text-neutral-300 uppercase tracking-wider font-semibold">
                                    <tr>
                                      <th className="px-4 py-2.5 text-left">Contributor</th>
                                      <th className="px-4 py-2.5 text-left">Email / Speaker ID</th>
                                      <th className="px-4 py-2.5 text-left">Approved Count</th>
                                      <th className="px-4 py-2.5 text-left">Project Earnings</th>
                                      <th className="px-4 py-2.5 text-left">Total Remaining Balance</th>
                                      <th className="px-4 py-2.5 text-left">UPI ID</th>
                                      <th className="px-4 py-2.5 text-right">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-neutral-800">
                                    {proj.contributors.map((c) => (
                                      <tr 
                                        key={c.id}
                                        className="hover:bg-neutral-800/80 transition-colors cursor-pointer"
                                        onClick={() => openUserModal({
                                          id: c.id,
                                          firstname: c.name.split(" ")[0],
                                          lastname: c.name.split(" ").slice(1).join(" "),
                                          username: c.username,
                                          email: c.email,
                                          speaker_id: c.speaker_id,
                                          upiId: c.upiId,
                                          totalRemainingPayoutUsd: c.userTotalPendingUsd,
                                          totalMoneyMadeUsd: c.earnedUsd
                                        })}
                                      >
                                        <td className="px-4 py-3 font-semibold text-white">
                                          {c.name}
                                          <div className="text-[10px] text-neutral-400 font-normal">@{c.username}</div>
                                        </td>
                                        <td className="px-4 py-3 text-neutral-300">
                                          {c.email}
                                          {c.speaker_id && <div className="text-[10px] font-mono text-warning-400">{c.speaker_id}</div>}
                                        </td>
                                        <td className="px-4 py-3 text-neutral-300 font-medium">
                                          {c.approvedPhrases > 0 && <span className="text-emerald-400 font-semibold">{c.approvedPhrases} Phrases</span>}
                                          {c.approvedCalls > 0 && <span className="text-blue-400 font-semibold">{c.approvedCalls} Calls</span>}
                                        </td>
                                        <td className="px-4 py-3 text-emerald-400 font-bold">
                                          {money(c.earnedUsd)}
                                        </td>
                                        <td className="px-4 py-3 text-warning-300 font-extrabold">
                                          {money(c.userTotalPendingUsd)}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-neutral-200">
                                          {c.upiId ? (
                                            <span className="px-2 py-0.5 bg-neutral-700 text-warning-300 border border-neutral-600 rounded text-[11px] font-bold">
                                              {c.upiId}
                                            </span>
                                          ) : (
                                            <span className="text-neutral-500 italic">Not provided</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                          <button
                                            onClick={() => openUserModal({
                                              id: c.id,
                                              firstname: c.name.split(" ")[0],
                                              lastname: c.name.split(" ").slice(1).join(" "),
                                              username: c.username,
                                              email: c.email,
                                              speaker_id: c.speaker_id,
                                              upiId: c.upiId,
                                              totalRemainingPayoutUsd: c.userTotalPendingUsd,
                                              totalMoneyMadeUsd: c.earnedUsd
                                            })}
                                            className="px-2.5 py-1 bg-warning-600 hover:bg-warning-500 text-neutral-950 font-bold rounded-lg text-xs transition-colors"
                                          >
                                            View UPI
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {/* TAB 2: ALL CONTRIBUTORS PENDING PAYMENTS */}
            {activeTab === "contributors" && (
              <div className="bg-neutral-800 border border-neutral-700 rounded-2xl overflow-hidden shadow-xl">
                {(() => {
                  const filteredContribs = (data?.contributors || []).filter(c => {
                    if (!search.trim()) return true;
                    const q = search.toLowerCase();
                    const u = c.user;
                    return (
                      (u.firstname || "").toLowerCase().includes(q) ||
                      (u.lastname || "").toLowerCase().includes(q) ||
                      (u.username || "").toLowerCase().includes(q) ||
                      (u.email || "").toLowerCase().includes(q) ||
                      (u.speaker_id || "").toLowerCase().includes(q) ||
                      (u.upiId || "").toLowerCase().includes(q)
                    );
                  });

                  if (filteredContribs.length === 0) {
                    return (
                      <div className="text-center py-16 text-neutral-400">
                        <Users className="w-12 h-12 text-neutral-500 mx-auto mb-3" />
                        No contributor payment records match your search.
                      </div>
                    );
                  }

                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-neutral-700 text-neutral-200 uppercase tracking-wider font-semibold">
                          <tr>
                            <th className="px-4 py-3 text-left">Speaker ID</th>
                            <th className="px-4 py-3 text-left">Contributor</th>
                            <th className="px-4 py-3 text-left">Email</th>
                            <th className="px-4 py-3 text-left">Calls (Appr)</th>
                            <th className="px-4 py-3 text-left">Phrases (Appr)</th>
                            <th className="px-4 py-3 text-left">Total Earned</th>
                            <th className="px-4 py-3 text-left">Total Paid</th>
                            <th className="px-4 py-3 text-left">Pending Balance</th>
                            <th className="px-4 py-3 text-left">Stored UPI ID</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-700/80">
                          {filteredContribs.map((entry) => (
                            <tr 
                              key={entry.user.id} 
                              onClick={() => openUserModal(entry.user)}
                              className="hover:bg-neutral-750/70 transition-colors cursor-pointer"
                            >
                              <td className="px-4 py-3 font-mono text-warning-400 font-bold">
                                {entry.user.speaker_id || "-"}
                              </td>
                              <td className="px-4 py-3 font-medium text-white">
                                {`${entry.user.firstname || ""} ${entry.user.lastname || ""}`.trim() || entry.user.username}
                                <div className="text-[10px] text-neutral-400 font-normal">@{entry.user.username}</div>
                              </td>
                              <td className="px-4 py-3 text-neutral-300">{entry.user.email}</td>
                              <td className="px-4 py-3 text-neutral-300">
                                <span className="text-emerald-400 font-bold">{entry.totalApprovedCalls}</span> / {entry.totalCallsMade}
                              </td>
                              <td className="px-4 py-3 text-neutral-300">
                                <span className="text-emerald-400 font-bold">{entry.totalApprovedPhrases}</span> / {entry.totalPhrasesRecorded}
                              </td>
                              <td className="px-4 py-3 text-neutral-100 font-semibold">{money(entry.totalMoneyMadeUsd)}</td>
                              <td className="px-4 py-3 text-blue-300 font-semibold">{money(entry.totalPaidOutUsd)}</td>
                              <td className="px-4 py-3 font-extrabold text-warning-300 text-sm">
                                {money(entry.totalRemainingPayoutUsd)}
                              </td>
                              <td className="px-4 py-3 font-mono">
                                {entry.user.upiId ? (
                                  <span className="px-2.5 py-1 bg-neutral-700 text-warning-300 border border-neutral-600 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5">
                                    <CreditCard className="w-3 h-3 text-warning-400" />
                                    {entry.user.upiId}
                                  </span>
                                ) : (
                                  <span className="text-neutral-500 italic text-[11px]">Not provided</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => openUserModal(entry.user)}
                                    className="px-3 py-1.5 rounded-lg bg-warning-500 hover:bg-warning-400 text-neutral-950 font-bold text-xs transition-colors"
                                  >
                                    UPI Info
                                  </button>
                                  <Link
                                    to={`/admin/payouts/${entry.user.id}`}
                                    className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white font-semibold text-xs transition-colors inline-flex items-center gap-1"
                                  >
                                    Payout <ExternalLink className="w-3 h-3" />
                                  </Link>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* TAB 3: QA FINANCIAL OVERVIEW */}
            {activeTab === "qa" && (
              <div className="space-y-6">
                <div className="bg-neutral-800 border border-neutral-700 p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
                  <div>
                    <div className="text-xs uppercase font-bold text-warning-400 tracking-wider mb-1">Total QA Liabilities / Payouts Owed</div>
                    <div className="text-3xl font-black text-white">
                      {money(qaData?.totalCompanyQaExpenseUsd || 0)}
                    </div>
                  </div>
                  <div className="text-xs text-neutral-400">
                    Active QA Reviewers: <strong className="text-white text-sm">{qaData?.stats?.length || 0}</strong>
                  </div>
                </div>

                <div className="bg-neutral-800 border border-neutral-700 rounded-2xl overflow-hidden shadow-xl">
                  <div className="p-4 border-b border-neutral-700 font-bold text-sm text-neutral-200">
                    QA Reviewers Payrates & Workload Financials
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-neutral-750 text-neutral-300 uppercase tracking-wider font-semibold">
                        <tr>
                          <th className="px-4 py-3 text-left">QA Reviewer</th>
                          <th className="px-4 py-3 text-left">Per Call Rate</th>
                          <th className="px-4 py-3 text-left">Hourly Phrase Rate</th>
                          <th className="px-4 py-3 text-center">Calls Reviewed</th>
                          <th className="px-4 py-3 text-center">Phrases Reviewed (Duration)</th>
                          <th className="px-4 py-3 text-right">Call Payout</th>
                          <th className="px-4 py-3 text-right">Phrase Payout</th>
                          <th className="px-4 py-3 text-right font-bold text-warning-400">Total Owed</th>
                          <th className="px-4 py-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-700/60">
                        {(() => {
                          const filteredQa = (qaData?.stats || []).filter(item => {
                            if (!search.trim()) return true;
                            const q = search.toLowerCase();
                            return item.qaUser.name.toLowerCase().includes(q) || item.qaUser.email.toLowerCase().includes(q) || item.qaUser.username.toLowerCase().includes(q);
                          });

                          if (filteredQa.length === 0) {
                            return (
                              <tr>
                                <td colSpan="9" className="text-center py-12 text-neutral-500">No QA reviewers match your filter.</td>
                              </tr>
                            );
                          }

                          return filteredQa.map((item) => (
                            <tr key={item.qaUser._id} className="hover:bg-neutral-700/40 transition-colors">
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <div className="font-semibold text-white">{item.qaUser.name}</div>
                                <div className="text-xs text-neutral-400">{item.qaUser.email}</div>
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap font-mono text-neutral-200">
                                ${item.qaUser.qaPerCallPayrateUsd?.toFixed(2) || "0.00"}
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap font-mono text-neutral-200">
                                ${item.qaUser.qaHourlyPhrasePayrateUsd?.toFixed(2) || "0.00"}
                              </td>
                              <td className="px-4 py-3.5 text-center font-bold text-white">
                                {item.callsReviewed}
                              </td>
                              <td className="px-4 py-3.5 text-center">
                                <span className="font-bold text-white">{item.phrasesReviewed} phrases</span>
                                <span className="text-xs text-neutral-400 block">({item.totalPhraseSecs || 0}s / {item.phraseHours}h)</span>
                              </td>
                              <td className="px-4 py-3.5 text-right font-mono text-neutral-300">
                                ${item.callEarningsUsd?.toFixed(2) || "0.00"}
                              </td>
                              <td className="px-4 py-3.5 text-right font-mono text-neutral-300">
                                ${item.phraseEarningsUsd?.toFixed(2) || "0.00"}
                              </td>
                              <td className="px-4 py-3.5 text-right font-mono font-bold text-warning-400 text-sm">
                                ${item.totalEarningsUsd?.toFixed(2) || "0.00"}
                              </td>
                              <td className="px-4 py-3.5 text-center">
                                <button
                                  onClick={() => handleQaPayNow(item)}
                                  className="inline-flex px-3 py-1.5 rounded-lg bg-warning-600 hover:bg-warning-700 text-white text-xs font-semibold whitespace-nowrap transition-colors"
                                >
                                  Pay Now
                                </button>
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CLICKED USER UPI DETAILS MODAL */}
        {selectedUserModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-neutral-800 border border-neutral-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
              {/* Modal Header */}
              <div className="p-5 bg-neutral-750 border-b border-neutral-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-warning-500/20 text-warning-300 flex items-center justify-center font-bold text-sm border border-warning-500/30">
                    {(selectedUserModal.firstname?.[0] || selectedUserModal.username?.[0] || "U").toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {`${selectedUserModal.firstname || ""} ${selectedUserModal.lastname || ""}`.trim() || selectedUserModal.username}
                    </h3>
                    <p className="text-xs text-neutral-400">{selectedUserModal.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedUserModal(null)}
                  className="p-2 rounded-xl text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6">
                {/* UPI Highlight Box */}
                <div className="bg-neutral-900 border border-warning-500/40 p-5 rounded-2xl text-center space-y-2">
                  <span className="text-xs font-bold text-warning-400 uppercase tracking-wider flex items-center justify-center gap-1.5">
                    <CreditCard className="w-4 h-4" /> Stored UPI Payment ID
                  </span>
                  {selectedUserModal.upiId ? (
                    <div className="flex items-center justify-center gap-3 pt-1">
                      <span className="text-xl font-extrabold font-mono text-white tracking-wide bg-neutral-800 px-4 py-2 rounded-xl border border-neutral-700 select-all">
                        {selectedUserModal.upiId}
                      </span>
                      <button
                        onClick={() => copyToClipboard(selectedUserModal.upiId)}
                        className={`p-2.5 rounded-xl border transition-all ${
                          copiedUpi 
                            ? "bg-emerald-600 border-emerald-500 text-white" 
                            : "bg-warning-500 border-warning-400 text-neutral-950 font-bold hover:bg-warning-400"
                        }`}
                        title="Copy UPI ID"
                      >
                        {copiedUpi ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                      </button>
                    </div>
                  ) : (
                    <div className="py-2 text-neutral-400 text-sm italic">
                      No UPI ID has been stored by this contributor yet.
                    </div>
                  )}
                  {copiedUpi && (
                    <p className="text-xs text-emerald-400 font-semibold animate-fade-in">UPI ID copied to clipboard!</p>
                  )}
                </div>

                {/* Additional User Identifiers */}
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="bg-neutral-750 p-3.5 rounded-xl border border-neutral-700">
                    <span className="text-neutral-400 font-medium block">Speaker ID</span>
                    <span className="font-mono text-warning-400 font-bold text-sm">{selectedUserModal.speaker_id || "None"}</span>
                  </div>
                  <div className="bg-neutral-750 p-3.5 rounded-xl border border-neutral-700">
                    <span className="text-neutral-400 font-medium block">Username</span>
                    <span className="text-white font-semibold text-sm">@{selectedUserModal.username}</span>
                  </div>
                </div>

                {/* Direct Action Link */}
                <div className="pt-2 flex justify-end gap-3">
                  <button
                    onClick={() => setSelectedUserModal(null)}
                    className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 font-semibold rounded-xl text-xs transition-colors"
                  >
                    Close
                  </button>
                  <Link
                    to={`/admin/payouts/${selectedUserModal.id || selectedUserModal._id}`}
                    className="px-4 py-2 bg-warning-500 hover:bg-warning-400 text-neutral-950 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5"
                  >
                    View Full Payout Details <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
