import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminNav from "../components/AdminNav.jsx";
import { apiGet, apiPostJson } from "../lib/api.js";
import Swal from "sweetalert2";

function money(value) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

export default function AdminPayouts() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function load(searchVal = search) {
    try {
      setLoading(true);
      const data = await apiGet(`/api/admin/payouts/users?search=${encodeURIComponent(searchVal)}`);
      setUsers(data.users || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    load(search);
  };

  async function handlePayNow(entry) {
    const upiId = entry.user.upiId || "Not Provided";
    const result = await Swal.fire({
      title: "Confirm Payout",
      html: `
        <div style="text-align: left; background: #111827; padding: 16px; border-radius: 12px; margin-top: 12px; border: 1px solid #374151;">
          <div style="margin-bottom: 12px;">
            <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Contributor</div>
            <div style="color: #ffffff; font-weight: 600; font-size: 15px; margin-top: 2px;">${entry.user.firstname || entry.user.username} ${entry.user.lastname || ''}</div>
            <div style="color: #6b7280; font-size: 12px;">${entry.user.email}</div>
          </div>

          <div style="margin-bottom: 12px;">
            <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">UPI ID for Payment</div>
            <div style="display: flex; align-items: center; justify-content: space-between; background: #1f2937; padding: 8px 12px; border-radius: 8px; border: 1px solid #4b5563; margin-top: 4px;">
              <span style="font-family: monospace; color: #f59e0b; font-weight: 700; font-size: 14px;">${upiId}</span>
              ${entry.user.upiId ? `<button type="button" onclick="navigator.clipboard.writeText('${entry.user.upiId}'); this.innerText='Copied!';" style="background: #374151; color: #e5e7eb; border: none; padding: 4px 8px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: 600;">Copy UPI</button>` : ''}
            </div>
          </div>

          <div>
            <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Remaining Balance</div>
            <div style="color: #10b981; font-weight: 700; font-size: 22px; margin-top: 2px;">${money(entry.totalRemainingPayoutUsd)}</div>
          </div>
        </div>
        <p style="margin-top: 14px; font-size: 13px; color: #d1d5db;">Are you sure you want to mark this payout as paid?</p>
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
        await apiPostJson(`/api/admin/payouts/users/${entry.user.id}/payments`, {
          amountUsd: entry.totalRemainingPayoutUsd,
          note: "Direct payout from list"
        });
        Swal.fire({ title: "Paid!", text: "The payout has been successfully recorded.", icon: "success", background: "#1f2937", color: "#fff" });
        load();
      } catch (e) {
        Swal.fire({ title: "Error", text: e.message, icon: "error", background: "#1f2937", color: "#fff" });
      }
    }
  }

  async function handlePayAll() {
    const totalRemaining = users.reduce((sum, u) => sum + u.totalRemainingPayoutUsd, 0);
    if (totalRemaining <= 0) return Swal.fire({ title: "No Payments", text: "There are no remaining balances to clear.", icon: "info", background: "#1f2937", color: "#fff" });

    const result = await Swal.fire({
      title: "Clear All Payments?",
      text: `This will clear total remaining balances of ${money(totalRemaining)} for all users. Are you sure?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d97706",
      cancelButtonColor: "#475569",
      confirmButtonText: "Yes, clear all",
      background: "#1f2937",
      color: "#fff"
    });

    if (result.isConfirmed) {
      try {
        await apiPostJson("/api/admin/payouts/users/clear-all");
        Swal.fire({ title: "Cleared!", text: "All pending payments have been cleared.", icon: "success", background: "#1f2937", color: "#fff" });
        load();
      } catch (e) {
        Swal.fire({ title: "Error", text: e.message, icon: "error", background: "#1f2937", color: "#fff" });
      }
    }
  }

  async function handleSendUpiEmail(entry) {
    try {
      await apiPostJson(`/api/admin/payouts/users/${entry.user.id}/send-upi-request-email`);
      Swal.fire({
        title: "Email Sent!",
        text: `UPI ID request email successfully sent to ${entry.user.email}.`,
        icon: "success",
        background: "#1f2937",
        color: "#fff"
      });
    } catch (e) {
      Swal.fire({ title: "Error", text: e.message, icon: "error", background: "#1f2937", color: "#fff" });
    }
  }

  async function handleSendBulkUpiEmails() {
    const eligibleCount = users.filter(u => (!u.user.upiId || !u.user.upiId.trim()) && u.totalRemainingPayoutUsd > 0.5).length;
    if (eligibleCount === 0) {
      return Swal.fire({
        title: "No Eligible Users",
        text: "There are no users with missing UPI IDs and remaining balance > $0.50.",
        icon: "info",
        background: "#1f2937",
        color: "#fff"
      });
    }

    const result = await Swal.fire({
      title: "Send Bulk UPI Emails?",
      text: `Send UPI request emails to ${eligibleCount} contributor(s) missing UPI IDs with balance > $0.50?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#6366f1",
      cancelButtonColor: "#475569",
      confirmButtonText: "Yes, Send All",
      background: "#1f2937",
      color: "#fff"
    });

    if (result.isConfirmed) {
      try {
        const res = await apiPostJson("/api/admin/payouts/send-bulk-upi-requests");
        Swal.fire({ title: "Sent!", text: res.message, icon: "success", background: "#1f2937", color: "#fff" });
      } catch (e) {
        Swal.fire({ title: "Error", text: e.message, icon: "error", background: "#1f2937", color: "#fff" });
      }
    }
  }

  return (
    <div className="min-h-screen bg-neutral-900 pt-16 md:pt-0 md:pl-64">
      <AdminNav />
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Payouts</h1>
            <p className="text-neutral-400 text-sm md:text-base">Track approved earnings, paid amounts, and remaining balances.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleSendBulkUpiEmails}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-indigo-500/20 active:scale-95 whitespace-nowrap text-sm"
            >
              Mail Missing UPIs (&gt; $0.5)
            </button>
            <button
              onClick={handlePayAll}
              className="px-4 py-2 bg-warning-600 hover:bg-warning-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-warning-500/20 active:scale-95 whitespace-nowrap text-sm"
            >
              Pay All Remaining
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-12 h-12 border-4 border-warning-200 border-t-warning-500 rounded-full animate-spin" /></div>
        ) : error ? (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg">{error}</div>
        ) : (
          <div className="space-y-4 animate-fade-in">
            <div className="flex justify-end">
              <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search name, email, username…"
                  className="w-64 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-warning-500"
                />
                <button type="submit" className="px-4 py-2 rounded-xl bg-warning-600 hover:bg-warning-700 text-sm font-semibold text-white transition-all shadow-md active:scale-95">Search</button>
              </form>
            </div>
            <div className="bg-neutral-800 border border-neutral-700 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-700">
                    <tr>
                      {["Name", "Email", "Calls (Appr/Tot)", "Phrases (Appr/Tot)", "Earned", "Remaining", "Action"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-neutral-300 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-700">
                    {users.map((entry) => (
                      <tr key={entry.user.id} className="hover:bg-neutral-700/40 transition-colors">
                        <td className="px-4 py-3 text-white font-medium whitespace-nowrap">{`${entry.user.firstname || ""} ${entry.user.lastname || ""}`.trim() || entry.user.username}</td>
                        <td className="px-4 py-3 text-neutral-300">{entry.user.email}</td>
                        <td className="px-4 py-3 text-neutral-300">
                          <span className="text-green-300 font-medium">{entry.totalApprovedCalls}</span> / {entry.totalCallsMade}
                        </td>
                        <td className="px-4 py-3 text-neutral-300">
                          <span className="text-green-300 font-medium">{entry.totalApprovedPhrases}</span> / {entry.totalPhrasesRecorded}
                        </td>
                        <td className="px-4 py-3 text-neutral-100 font-semibold">{money(entry.totalMoneyMadeUsd)}</td>
                        <td className="px-4 py-3 text-warning-300 font-semibold">{money(entry.totalRemainingPayoutUsd)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Link to={`/admin/payouts/${entry.user.id}`} className="inline-flex px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white text-xs font-semibold whitespace-nowrap transition-colors">
                              View
                            </Link>
                            {(!entry.user.upiId || !entry.user.upiId.trim()) && entry.totalRemainingPayoutUsd > 0.5 && (
                              <button
                                onClick={() => handleSendUpiEmail(entry)}
                                className="inline-flex px-3 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-600 text-white text-xs font-semibold whitespace-nowrap transition-colors shadow-sm"
                              >
                                Mail for UPI ID
                              </button>
                            )}
                            {entry.totalRemainingPayoutUsd > 0 && (
                              <button
                                onClick={() => handlePayNow(entry)}
                                className="inline-flex px-3 py-1.5 rounded-lg bg-warning-600 hover:bg-warning-700 text-white text-xs font-semibold whitespace-nowrap transition-colors"
                              >
                                Pay Now
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!users.length && <div className="text-center py-16 text-neutral-500">No payout data found.</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
