import React, { useEffect, useState } from "react";
import AdminNav from "../components/AdminNav.jsx";
import { apiGet, apiPostJson } from "../lib/api.js";
import Swal from "sweetalert2";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

function fmt(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

const TABS = [
  { key: "pending", label: "Pending Review" },
  { key: "approved", label: "Approved" },
];

export default function AdminAgreements() {
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState("");

  async function load(searchVal = search) {
    setError("");
    setLoading(true);
    try {
      const q = searchVal.trim() ? `?search=${encodeURIComponent(searchVal)}` : "";
      if (tab === "pending") {
        const data = await apiGet(`/api/admin/contributor-agreements/pending${q}`);
        setRows(data.agreements || []);
      } else {
        const data = await apiGet(`/api/admin/contributor-agreements/approved-users${q}`);
        setRows(data.users || []);
      }
    } catch (e) {
      setError(e?.body?.error || e.message || "Failed to load agreements");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(search); }, [tab]);

  function viewPdf(userId) {
    window.open(`${BACKEND_URL}/api/admin/contributor-agreements/${userId}/download`, "_blank", "noopener");
  }

  async function handleApprove(row) {
    const result = await Swal.fire({
      title: `Approve ${row.firstname || row.username}?`,
      text: "This user will immediately gain access to contribution features.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Approve",
      confirmButtonColor: "#059669",
      cancelButtonColor: "#475569",
      background: "#1f2937",
      color: "#fff",
    });
    if (!result.isConfirmed) return;
    setBusyId(row.userId);
    try {
      await apiPostJson(`/api/admin/contributor-agreements/${row.userId}/approve`, {});
      setRows(rs => rs.filter(r => r.userId !== row.userId));
      Swal.fire({ icon: "success", title: "Approved", timer: 1500, showConfirmButton: false, background: "#1f2937", color: "#fff" });
    } catch (e) {
      Swal.fire({ icon: "error", title: "Approve failed", text: e?.body?.error || e.message, background: "#1f2937", color: "#fff" });
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(row) {
    const { value: reason } = await Swal.fire({
      title: `Reject ${row.firstname || row.username}?`,
      text: "The user will be emailed the reason below and asked to re-sign the agreement.",
      input: "textarea",
      inputPlaceholder: "Reason (visible to the user)",
      inputValidator: v => (!v || !v.trim()) && "Reason is required",
      showCancelButton: true,
      confirmButtonText: "Reject & Email",
      confirmButtonColor: "#d97706",
      cancelButtonColor: "#475569",
      background: "#1f2937",
      color: "#fff",
    });
    if (!reason) return;
    setBusyId(row.userId);
    try {
      await apiPostJson(`/api/admin/contributor-agreements/${row.userId}/reject`, { reason: reason.trim() });
      setRows(rs => rs.filter(r => r.userId !== row.userId));
      Swal.fire({ icon: "success", title: "Rejected & user notified", timer: 1800, showConfirmButton: false, background: "#1f2937", color: "#fff" });
    } catch (e) {
      Swal.fire({ icon: "error", title: "Reject failed", text: e?.body?.error || e.message, background: "#1f2937", color: "#fff" });
    } finally {
      setBusyId(null);
    }
  }

  async function handleBlacklist(row) {
    const first = await Swal.fire({
      title: `Blacklist ${row.firstname || row.username}?`,
      html: `<div style="text-align:left"><p>This will <strong style="color:#f87171">permanently delete</strong> the account and all associated files (intro recording, agreement PDF, language application recordings).</p><p style="margin-top:8px">This cannot be undone.</p></div>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Continue",
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#475569",
      background: "#1f2937",
      color: "#fff",
    });
    if (!first.isConfirmed) return;
    const { value: reason } = await Swal.fire({
      title: "Blacklist reason",
      text: "For audit trail (logged, not shown to user).",
      input: "textarea",
      inputPlaceholder: "e.g. inappropriate name, suspected fraud",
      inputValidator: v => (!v || !v.trim()) && "Reason is required",
      showCancelButton: true,
      confirmButtonText: "Blacklist & Delete",
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#475569",
      background: "#1f2937",
      color: "#fff",
    });
    if (!reason) return;
    setBusyId(row.userId);
    try {
      const r = await apiPostJson(`/api/admin/contributor-agreements/${row.userId}/blacklist`, { reason: reason.trim() });
      setRows(rs => rs.filter(x => x.userId !== row.userId));
      Swal.fire({ icon: "success", title: "Account deleted", text: `${r?.purgedFiles ?? 0} S3 file(s) purged.`, background: "#1f2937", color: "#fff" });
    } catch (e) {
      Swal.fire({ icon: "error", title: "Blacklist failed", text: e?.body?.error || e.message, background: "#1f2937", color: "#fff" });
    } finally {
      setBusyId(null);
    }
  }

  function sendDifferentAgreement(row) {
    window.open("/Legal/DataCatalyst-Voice-Dataset-Consent-Agreement.pdf", "_blank");
    Swal.fire({
      icon: "info",
      title: "Send different agreement",
      text: `Opening DataCatalyst Voice Dataset Consent Agreement (No-Cloning PDF) for ${row.firstname || row.email || 'this user'}.`,
      background: "#1f2937",
      color: "#fff",
      confirmButtonColor: "#0284c7"
    });
  }

  const filtered = rows.filter(r => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (r.firstname || "").toLowerCase().includes(q) ||
      (r.lastname || "").toLowerCase().includes(q) ||
      (r.email || "").toLowerCase().includes(q) ||
      (r.username || "").toLowerCase().includes(q) ||
      (r.vendorCode || r.vendorId?.vendorCode || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <AdminNav />
      <main className="md:ml-64 pt-20 md:pt-6 px-4 md:px-8 pb-16">
        <div className="w-full max-w-[1720px] mx-auto space-y-6">
          <div className="flex flex-wrap items-end gap-4 justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Contributor Agreements</h1>
              <p className="text-sm text-neutral-400 mt-1">
                {tab === "pending"
                  ? "Users who have signed the agreement and are waiting for admin review before gaining contribution access."
                  : "Users whose signed agreements have already been approved. Download the PDF for records."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name, email, username…"
                className="w-64 px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500 text-white"
              />
              <button onClick={load} className="px-4 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-sm hover:bg-neutral-700 text-neutral-200 transition-colors">
                Refresh
              </button>
            </div>
          </div>

          <div className="flex gap-2 border-b border-neutral-800">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 -mb-px text-sm font-medium border-b-2 transition-colors ${
                  tab === t.key
                    ? "border-primary-500 text-primary-400 font-bold"
                    : "border-transparent text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading && <div className="text-neutral-400 text-sm">Loading…</div>}
          {error && (
            <div className="bg-error-900/30 border border-error-700 text-error-200 rounded-2xl p-4 text-sm">
              {error}
              <button onClick={load} className="ml-3 underline">Retry</button>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 shadow-xl p-8 text-center">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10">
                <p className="text-neutral-300 font-medium">
                  {tab === "pending" ? "No agreements pending review." : "No approved agreements yet."}
                </p>
                <p className="text-neutral-500 text-sm mt-1">
                  {tab === "pending"
                    ? "Signed agreements will appear here for admin review before contributors are activated."
                    : "Once you approve pending agreements, they'll show up here for download."}
                </p>
              </div>
            </div>
          )}

          {!loading && filtered.length > 0 && tab === "pending" && (
            <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 shadow-xl">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="overflow-x-auto relative z-10">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-900/80 border-b border-neutral-800">
                    <tr className="text-left text-neutral-400">
                      <th className="px-4 py-3.5 font-semibold">Name</th>
                      <th className="px-4 py-3.5 font-semibold">Username</th>
                      <th className="px-4 py-3.5 font-semibold">Email</th>
                      <th className="px-4 py-3.5 font-semibold">Signed</th>
                      <th className="px-4 py-3.5 font-semibold">Version</th>
                      <th className="px-4 py-3.5 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/80">
                    {filtered.map(row => (
                      <tr key={row.userId} className="hover:bg-neutral-800/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-neutral-100">{`${row.firstname || ""} ${row.lastname || ""}`.trim() || "—"}</span>
                            {(row.vendorCode || row.vendorId?.vendorCode) && (
                              <span
                                className="inline-flex items-center justify-center font-mono font-bold text-[10px] uppercase px-2 py-0.5 rounded-lg bg-neutral-900 border border-purple-500/50 text-purple-300 shadow-sm"
                                title={`Vendor Code: ${row.vendorCode || row.vendorId?.vendorCode}`}
                              >
                                🏢 {row.vendorCode || row.vendorId?.vendorCode}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-neutral-300">{row.username || "—"}</td>
                        <td className="px-4 py-3 text-neutral-300">{row.email || "—"}</td>
                        <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">{fmt(row.signedAt)}</td>
                        <td className="px-4 py-3 text-neutral-400">{row.agreementVersion || "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              onClick={() => viewPdf(row.userId)}
                              disabled={!row.hasPdf}
                              className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs disabled:opacity-50 border border-neutral-750 transition-colors"
                            >
                              View PDF
                            </button>
                            <button
                              onClick={() => handleApprove(row)}
                              disabled={busyId === row.userId}
                              className="px-3 py-1.5 rounded-xl bg-success-600 hover:bg-success-500 text-white text-xs disabled:opacity-50 font-medium transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => sendDifferentAgreement(row)}
                              className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs disabled:opacity-50 border border-sky-500/30 font-medium transition-colors"
                              title="Send DataCatalyst Voice Dataset Consent Agreement (No-Cloning PDF)"
                            >
                              Send different agreement
                            </button>
                            <button
                              onClick={() => handleReject(row)}
                              disabled={busyId === row.userId}
                              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs disabled:opacity-50 font-medium transition-colors"
                            >
                              Reject
                            </button>
                            <button
                              onClick={() => handleBlacklist(row)}
                              disabled={busyId === row.userId}
                              className="px-3 py-1.5 rounded-xl bg-error-600 hover:bg-error-500 text-white text-xs disabled:opacity-50 font-medium transition-colors"
                            >
                              Blacklist
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && filtered.length > 0 && tab === "approved" && (
            <div className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/95 to-neutral-850 shadow-xl">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="overflow-x-auto relative z-10">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-900/80 border-b border-neutral-800">
                    <tr className="text-left text-neutral-400">
                      <th className="px-4 py-3.5 font-semibold">Name</th>
                      <th className="px-4 py-3.5 font-semibold">Username</th>
                      <th className="px-4 py-3.5 font-semibold">Email</th>
                      <th className="px-4 py-3.5 font-semibold">Signed</th>
                      <th className="px-4 py-3.5 font-semibold">Approved</th>
                      <th className="px-4 py-3.5 font-semibold">Version</th>
                      <th className="px-4 py-3.5 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/80">
                    {filtered.map(row => (
                      <tr key={row.userId} className="hover:bg-neutral-800/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-neutral-100">{`${row.firstname || ""} ${row.lastname || ""}`.trim() || "—"}</span>
                            {(row.vendorCode || row.vendorId?.vendorCode) && (
                              <span
                                className="inline-flex items-center justify-center font-mono font-bold text-[10px] uppercase px-2 py-0.5 rounded-lg bg-neutral-900 border border-purple-500/50 text-purple-300 shadow-sm"
                                title={`Vendor Code: ${row.vendorCode || row.vendorId?.vendorCode}`}
                              >
                                🏢 {row.vendorCode || row.vendorId?.vendorCode}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-neutral-300">{row.username || "—"}</td>
                        <td className="px-4 py-3 text-neutral-300">{row.email || "—"}</td>
                        <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">{fmt(row.signedAt)}</td>
                        <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">{fmt(row.approvedAt)}</td>
                        <td className="px-4 py-3 text-neutral-400">{row.agreementVersion || "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            <button
                              onClick={() => viewPdf(row.userId)}
                              disabled={!row.hasPdf}
                              className="px-3.5 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              Download PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
