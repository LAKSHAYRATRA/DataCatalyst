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

const STATUS_TABS = [
  { key: "pending", label: "Pending" },
  { key: "verified", label: "Verified" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

function statusBadge(status) {
  if (status === "verified") {
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-success-500/20 text-success-300">Verified</span>;
  }
  if (status === "rejected") {
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-error-500/20 text-error-300">Rejected</span>;
  }
  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-warning-500/20 text-warning-300">Pending</span>;
}

export default function AdminPanVerification() {
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [zoomUser, setZoomUser] = useState(null);

  async function load() {
    setError("");
    setLoading(true);
    try {
      const data = await apiGet(`/api/admin/kyc/pans?status=${tab}`);
      setRows(data.users || []);
    } catch (e) {
      setError(e?.body?.error || e.message || "Failed to load PAN submissions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [tab]);

  async function handleVerify(row) {
    const result = await Swal.fire({
      title: `Verify PAN for ${row.username}?`,
      html: `<div style="text-align:left;font-family:monospace;font-size:1.1rem;letter-spacing:0.1em;">${row.panNumber}</div>`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Verify",
      confirmButtonColor: "#059669",
      cancelButtonColor: "#475569",
      background: "#1f2937",
      color: "#fff",
    });
    if (!result.isConfirmed) return;
    setBusyId(row._id);
    try {
      await apiPostJson(`/api/admin/users/${row._id}/pan/verify`, {});
      Swal.fire({ icon: "success", title: "Verified", timer: 1200, showConfirmButton: false, background: "#1f2937", color: "#fff" });
      await load();
    } catch (e) {
      Swal.fire({ icon: "error", title: "Verify failed", text: e?.body?.error || e.message, background: "#1f2937", color: "#fff" });
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(row) {
    const result = await Swal.fire({
      title: `Reject PAN for ${row.username}?`,
      input: "textarea",
      inputLabel: "Reason (shown to the user)",
      inputPlaceholder: "e.g. Image is blurry — please re-upload a clearer photo",
      inputAttributes: { maxlength: 500 },
      inputValidator: (val) => {
        if (!val || !val.trim()) return "Reason is required";
        if (val.length > 500) return "Reason too long (max 500 chars)";
      },
      showCancelButton: true,
      confirmButtonText: "Reject",
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#475569",
      background: "#1f2937",
      color: "#fff",
    });
    if (!result.isConfirmed) return;
    setBusyId(row._id);
    try {
      await apiPostJson(`/api/admin/users/${row._id}/pan/reject`, { reason: result.value.trim() });
      Swal.fire({ icon: "success", title: "Rejected", timer: 1200, showConfirmButton: false, background: "#1f2937", color: "#fff" });
      await load();
    } catch (e) {
      Swal.fire({ icon: "error", title: "Reject failed", text: e?.body?.error || e.message, background: "#1f2937", color: "#fff" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 md:pl-64">
      <AdminNav />
      <div className="max-w-6xl mx-auto p-6 md:p-8 pt-20 md:pt-8">
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold">PAN Verification</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Review contributor PAN cards. Verified PANs unlock the Section 194O TDS threshold; rejected users are re-prompted to upload.
          </p>
        </div>

        <div className="flex gap-2 mb-6 border-b border-neutral-700">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 -mb-px text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-warning-500 text-warning-400"
                  : "border-transparent text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-error-500/40 bg-error-500/10 text-error-300 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-warning-200 border-t-warning-600 rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-700 bg-neutral-800/50 p-10 text-center text-neutral-500">
            No submissions for this filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {rows.map((row) => (
              <div key={row._id} className="rounded-xl border border-neutral-700 bg-neutral-800/60 p-4 flex flex-col md:flex-row gap-4">
                <button
                  onClick={() => setZoomUser(row)}
                  className="md:w-40 md:flex-shrink-0 rounded-lg overflow-hidden bg-neutral-900 border border-neutral-700 hover:border-warning-400 transition-colors"
                  title="Click to enlarge"
                >
                  <img
                    src={`${BACKEND_URL}/api/admin/users/${row._id}/pan-card`}
                    alt="PAN card"
                    crossOrigin="use-credentials"
                    className="w-full h-32 md:h-full object-cover"
                  />
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold truncate">
                      {(row.firstname || row.lastname) ? `${row.firstname || ""} ${row.lastname || ""}`.trim() : row.username}
                    </h3>
                    {statusBadge(row.verificationStatus)}
                  </div>
                  <p className="text-xs text-neutral-400 truncate">@{row.username} · {row.email}</p>

                  <div className="mt-3 space-y-1 text-sm">
                    <div>
                      <span className="text-neutral-500">PAN: </span>
                      <span className="font-mono tracking-widest text-neutral-100">{row.panNumber || "—"}</span>
                    </div>
                    <div className="text-xs text-neutral-500">Submitted {fmt(row.submittedAt)}</div>
                    {row.verificationStatus === "rejected" && row.rejectionReason && (
                      <div className="text-xs text-error-300 italic mt-1">Rejection reason: "{row.rejectionReason}"</div>
                    )}
                    {row.verificationStatus === "verified" && row.verifiedAt && (
                      <div className="text-xs text-success-400">Verified {fmt(row.verifiedAt)}</div>
                    )}
                  </div>

                  {row.verificationStatus !== "verified" && (
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => handleVerify(row)}
                        disabled={busyId === row._id}
                        className="flex-1 px-3 py-2 rounded-lg bg-success-600 hover:bg-success-700 text-white text-sm font-semibold disabled:opacity-50"
                      >
                        Verify
                      </button>
                      <button
                        onClick={() => handleReject(row)}
                        disabled={busyId === row._id}
                        className="flex-1 px-3 py-2 rounded-lg bg-error-600 hover:bg-error-700 text-white text-sm font-semibold disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                  {row.verificationStatus === "verified" && (
                    <div className="mt-4">
                      <button
                        onClick={() => handleReject(row)}
                        disabled={busyId === row._id}
                        className="px-3 py-2 rounded-lg border border-error-500/40 text-error-300 hover:bg-error-500/10 text-xs font-semibold disabled:opacity-50"
                      >
                        Revoke &amp; reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {zoomUser && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setZoomUser(null)}
        >
          <div className="max-w-4xl max-h-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={`${BACKEND_URL}/api/admin/users/${zoomUser._id}/pan-card`}
              alt="PAN card enlarged"
              crossOrigin="use-credentials"
              className="max-w-full max-h-[85vh] rounded-lg shadow-2xl"
            />
            <p className="text-center text-neutral-300 mt-3 font-mono tracking-widest">{zoomUser.panNumber}</p>
            <p className="text-center text-neutral-500 text-xs mt-1">Click anywhere to close</p>
          </div>
        </div>
      )}
    </div>
  );
}
