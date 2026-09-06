import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import SignatureCanvas from "react-signature-canvas";
import { apiGet, apiPostJson } from "../lib/api.js";
import { getUserInfo, setUserInfo, clearToken } from "../lib/auth.js";
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  PenTool,
  RotateCcw,
  Send,
  Loader2,
  LogOut,
  Clock,
  User,
  Check,
  FileCheck
} from "lucide-react";

const AGREEMENT_URL = "/Legal/Voclara-Contributor-Agreement.md";
const DRAFT_KEY = "vc_ca_draft_v1";

const CHECKBOX_ITEMS = [
  { key: "age", label: "I am at least 18 years of age." },
  { key: "authority", label: "I have the legal right to assign all Content I submit." },
  { key: "aiUse", label: "I understand Content will be used for commercial AI development, licensing, and sale, and I consent to such use." },
  { key: "exclusivity", label: "I understand the exclusivity obligation and will not submit my Content elsewhere." },
  { key: "participantsConsent", label: "I have obtained informed consent from all participants featured in any recordings I submit." },
  { key: "paymentTerms", label: "I have read and agree to the payment, TDS/PAN, and approval terms in Section V." },
  { key: "biometricConsent", label: "I consent to my voice data being processed as biometric/sensitive personal data and to its use in AI training as described in Section II(B)." },
];

const emptyCheckboxes = () =>
  CHECKBOX_ITEMS.reduce((acc, it) => ({ ...acc, [it.key]: false }), {});

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveDraft(checkboxes) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ checkboxes, savedAt: Date.now() }));
  } catch {
    /* localStorage full or disabled — ignore */
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch { /* ignore */ }
}

async function fetchWithRetry(url, options = {}, attempts = 3, baseDelayMs = 500) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`http_${res.status}`);
      return res;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

export default function ContributorAgreement() {
  const navigate = useNavigate();
  const [userInfo, setUserInfoState] = useState(getUserInfo());
  const sigRef = useRef(null);

  const [markdown, setMarkdown] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [checkboxes, setCheckboxes] = useState(() => {
    const draft = loadDraft();
    return draft?.checkboxes || emptyCheckboxes();
  });
  const [sigEmpty, setSigEmpty] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [retryable, setRetryable] = useState(false);

  // Sync fresh profile data from /api/auth/me to guarantee address, dob, and speaker_id are loaded
  useEffect(() => {
    async function syncProfile() {
      try {
        const res = await apiGet("/api/auth/me");
        if (res?.user) {
          setUserInfoState(res.user);
          setUserInfo(res.user);
        }
      } catch (err) {
        // Fall back to local user
      }
    }
    syncProfile();
  }, []);

  const assignedDoc = userInfo?.contributorAgreement?.assignedAgreementDoc;

  const handleLogout = async () => {
    await clearToken();
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    async function loadDoc() {
      setLoadError("");
      setLoadingDoc(true);
      try {
        const targetUrl = assignedDoc === "datacatalyst-voice-dataset-consent-agreement"
          ? "/Legal/DataCatalyst-Voice-Dataset-Consent-Agreement.md"
          : AGREEMENT_URL;
        const res = await fetchWithRetry(targetUrl, { credentials: "same-origin" });
        const text = await res.text();
        if (!cancelled) setMarkdown(text);
      } catch (err) {
        if (!cancelled) setLoadError("Could not load the agreement text. Check your connection and try again.");
      } finally {
        if (!cancelled) setLoadingDoc(false);
      }
    }
    loadDoc();
    return () => { cancelled = true; };
  }, [assignedDoc]);

  useEffect(() => {
    saveDraft(checkboxes);
  }, [checkboxes]);

  const allChecked = useMemo(
    () => CHECKBOX_ITEMS.every(it => checkboxes[it.key] === true),
    [checkboxes]
  );

  const substitutedPreview = useMemo(() => {
    if (!userInfo) return null;
    const addr = userInfo.address || {};
    const street = addr.street || "";
    const city = addr.city || "";
    const state = addr.state || "";
    const pincode = addr.pincode ? `PIN: ${addr.pincode}` : "";
    const formattedAddress = [street, city, state, pincode].filter(Boolean).join(", ");

    return {
      name: `${userInfo.firstname || ""} ${userInfo.lastname || ""}`.trim() || userInfo.username || "—",
      username: userInfo.username || "—",
      email: userInfo.email || "—",
      dob: userInfo.dob ? new Date(userInfo.dob).toISOString().split("T")[0] : "—",
      address: formattedAddress || "—",
      speakerId: userInfo.speaker_id || "Assigned at signing",
    };
  }, [userInfo]);

  function handleClearSignature() {
    if (sigRef.current) {
      sigRef.current.clear();
      setSigEmpty(true);
    }
  }

  function handleSigEnd() {
    setSigEmpty(sigRef.current ? sigRef.current.isEmpty() : true);
  }

  async function handleSubmit() {
    if (submitting || submitSuccess) return;
    setSubmitError("");
    setRetryable(false);

    if (!allChecked) {
      setSubmitError("Please tick every confirmation box before signing.");
      return;
    }
    if (!sigRef.current || sigRef.current.isEmpty()) {
      setSubmitError("Please draw your signature in the box.");
      return;
    }

    let signatureDataUrl;
    try {
      signatureDataUrl = sigRef.current.toDataURL("image/png");
    } catch (err) {
      setSubmitError("Could not read your signature. Please clear and draw again.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiPostJson("/api/user/contributor-agreement/sign", {
        checkboxes,
        signatureDataUrl,
      });
      if (res && res.ok) {
        clearDraft();
        setSubmitSuccess(true);
        const current = getUserInfo();
        if (current) {
          setUserInfo({
            ...current,
            contributorAgreement: {
              signed: true,
              signedAt: res.signedAt,
              agreementVersion: res.agreementVersion,
              adminReviewStatus: "pending",
              adminReviewReason: null,
            },
          });
        }
        setTimeout(() => navigate("/dashboard"), 1500);
      } else {
        setSubmitError("Unexpected response from server. Please try again.");
        setRetryable(true);
      }
    } catch (err) {
      const msg = err?.body?.error || err?.message || "";
      if (msg === "not_approved") {
        setSubmitError("Your account is not yet approved. Only approved contributors can sign the agreement.");
      } else if (msg === "checkbox_missing") {
        setSubmitError("One or more confirmations were not received. Please re-check every box and try again.");
        setRetryable(true);
      } else if (msg === "invalid_signature_format" || msg === "invalid_signature_base64" || msg === "signature_size_out_of_range") {
        setSubmitError("There was a problem with the signature image. Please clear and draw again.");
        setRetryable(true);
      } else if (msg === "pdf_generation_failed") {
        setSubmitError("The server could not build your signed PDF. This is temporary — please try again in a minute.");
        setRetryable(true);
      } else if (msg === "storage_unavailable") {
        setSubmitError("The server storage is temporarily unavailable. Your data has NOT been saved. Please try again in a minute.");
        setRetryable(true);
      } else if (msg === "db_update_failed") {
        setSubmitError("The agreement was uploaded but we could not record it in the database. Please contact support with this timestamp: " + new Date().toISOString());
      } else if (err?.status === 401) {
        setSubmitError("Your session has expired. Please log in again.");
      } else {
        setSubmitError("Signing failed. Please check your connection and try again.");
        setRetryable(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // If not logged in
  if (!userInfo) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-neutral-800 flex items-center justify-center mx-auto">
            <User className="w-6 h-6 text-neutral-400" />
          </div>
          <h2 className="text-xl font-bold text-white">Authentication Required</h2>
          <p className="text-neutral-400 text-sm">Please log in to review and sign the Contributor Agreement.</p>
          <button
            onClick={() => navigate("/login")}
            className="w-full py-3 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-primary-500/25"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // If account is not approved yet
  if (userInfo.accountStatus !== "approved") {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 -left-32 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center space-y-4 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10">
            <Clock className="w-7 h-7 text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Agreement Not Yet Available</h2>
          <p className="text-neutral-400 text-sm leading-relaxed">
            The Contributor Agreement will be made available as soon as your voice introduction and profile are approved by our verification team.
          </p>
          <div className="pt-2 space-y-2">
            <button
              onClick={() => navigate("/pending-approval")}
              className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold rounded-xl text-sm transition-all border border-neutral-700"
            >
              Check Verification Status
            </button>
            <button
              onClick={handleLogout}
              className="w-full py-2.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-primary-500 selection:text-white relative overflow-hidden">
      {/* Background Ambient Glows */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -left-32 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Navigation Bar */}
      <header className="bg-neutral-900/80 border-b border-neutral-800 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center p-1 shadow-md shadow-black/40">
              <img src="/logo.png" alt="Voclara Logo" className="w-7 h-7 object-contain" />
            </div>
            <div>
              <span className="font-extrabold text-white text-base tracking-tight">Voclara</span>
              <span className="text-[11px] text-neutral-400 block -mt-0.5">Contributor Agreement</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {userInfo?.email && (
              <span className="text-xs text-neutral-400 hidden sm:inline font-mono">{userInfo.email}</span>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-8 w-full relative z-10 space-y-6">
        {/* Page Header */}
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-300 text-xs font-medium mb-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            Legal Execution & Assignment
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Voice Contributor Agreement</h1>
          <p className="text-neutral-400 text-xs sm:text-sm">
            Please read the agreement carefully, tick each statutory confirmation, draw your signature, and submit.
          </p>
        </div>

        {/* Agency Partner Badge */}
        {userInfo?.vendorCode && (
          <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl flex items-center justify-between text-xs text-purple-200">
            <span className="font-medium">
              Agency Partner: <strong className="font-mono font-bold text-purple-300">{userInfo.vendorCode}</strong>
            </span>
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-500/30">
              Direct Contributor
            </span>
          </div>
        )}

        {/* Previous Submission Rejection Alert */}
        {userInfo.contributorAgreement?.adminReviewStatus === "rejected" && userInfo.contributorAgreement?.adminReviewReason && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs animate-scale-in">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="font-semibold text-rose-200 text-sm">Previous Submission Not Approved</h3>
              <p className="font-mono text-[11px] bg-rose-950/50 p-2 rounded-lg border border-rose-500/20 text-rose-200">
                Reviewer's reason: {userInfo.contributorAgreement.adminReviewReason}
              </p>
              <p className="text-rose-300/80">Please review the agreement again, confirm all checkboxes, and re-sign below.</p>
            </div>
          </div>
        )}

        {/* Document Loading State */}
        {loadingDoc && (
          <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-12 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-primary-400 animate-spin mx-auto" />
            <p className="text-neutral-400 text-sm">Retrieving agreement document…</p>
          </div>
        )}

        {/* Document Loading Error */}
        {loadError && (
          <div className="bg-neutral-900/90 border border-rose-500/30 rounded-3xl p-8 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
            <p className="text-rose-300 text-sm font-medium">{loadError}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-semibold transition-colors"
            >
              Retry Loading
            </button>
          </div>
        )}

        {/* Agreement Text & Signing Form */}
        {!loadingDoc && !loadError && (
          <div className="space-y-6">
            {/* Agreement Reader Card */}
            <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-primary-400" />
                  <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">Document Text</span>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                  Version 2.1
                </span>
              </div>

              <div className="max-h-[50vh] overflow-y-auto p-5 rounded-2xl bg-neutral-950/80 border border-neutral-800/80 text-neutral-300 prose prose-invert prose-sm max-w-none text-xs leading-relaxed">
                <ReactMarkdown>{markdown}</ReactMarkdown>
              </div>
            </div>

            {/* Auto-filled Contributor Details */}
            <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-neutral-800">
                <User className="w-4 h-4 text-primary-400" />
                Your Contributor Details (Auto-Filled into Document)
              </h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-neutral-950/60 rounded-xl border border-neutral-800/80">
                  <dt className="text-neutral-500 uppercase tracking-wider text-[10px] font-semibold">Full Legal Name</dt>
                  <dd className="text-white font-medium text-sm mt-0.5">{substitutedPreview.name}</dd>
                </div>
                <div className="p-3 bg-neutral-950/60 rounded-xl border border-neutral-800/80">
                  <dt className="text-neutral-500 uppercase tracking-wider text-[10px] font-semibold">Username / Handle</dt>
                  <dd className="text-white font-medium text-sm mt-0.5">{substitutedPreview.username}</dd>
                </div>
                <div className="p-3 bg-neutral-950/60 rounded-xl border border-neutral-800/80">
                  <dt className="text-neutral-500 uppercase tracking-wider text-[10px] font-semibold">Email Address</dt>
                  <dd className="text-white font-medium text-sm mt-0.5 font-mono">{substitutedPreview.email}</dd>
                </div>
                <div className="p-3 bg-neutral-950/60 rounded-xl border border-neutral-800/80">
                  <dt className="text-neutral-500 uppercase tracking-wider text-[10px] font-semibold">Date of Birth</dt>
                  <dd className="text-white font-medium text-sm mt-0.5">{substitutedPreview.dob}</dd>
                </div>
                <div className="p-3 bg-neutral-950/60 rounded-xl border border-neutral-800/80 sm:col-span-2">
                  <dt className="text-neutral-500 uppercase tracking-wider text-[10px] font-semibold">Residential Address</dt>
                  <dd className="text-white font-medium text-sm mt-0.5">{substitutedPreview.address}</dd>
                </div>
                <div className="p-3 bg-neutral-950/60 rounded-xl border border-neutral-800/80">
                  <dt className="text-neutral-500 uppercase tracking-wider text-[10px] font-semibold">Speaker Identifier</dt>
                  <dd className="text-primary-400 font-mono font-bold text-sm mt-0.5">{substitutedPreview.speakerId}</dd>
                </div>
              </dl>
              <p className="text-[11px] text-neutral-500">
                Signing timestamp, IP address, and cryptographic document hash are generated automatically upon execution.
              </p>
            </div>

            {/* Confirmations Checkboxes */}
            <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-neutral-800">
                <CheckCircle2 className="w-4 h-4 text-primary-400" />
                Mandatory Declarations & Confirmations
              </h2>
              <div className="space-y-3">
                {CHECKBOX_ITEMS.map(it => (
                  <label key={it.key} className="flex items-start gap-3 p-3 bg-neutral-950/60 rounded-xl border border-neutral-800/80 hover:border-neutral-700 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={checkboxes[it.key]}
                      onChange={e => setCheckboxes(c => ({ ...c, [it.key]: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded bg-neutral-900 border-neutral-700 text-primary-600 focus:ring-primary-500/40 focus:ring-offset-neutral-900 cursor-pointer"
                    />
                    <span className="text-xs sm:text-sm text-neutral-300 leading-relaxed select-none">{it.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Signature Pad */}
            <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <PenTool className="w-4 h-4 text-primary-400" />
                  Draw Your Signature
                </h2>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg border ${
                  sigEmpty
                    ? "bg-neutral-800 text-neutral-400 border-neutral-700"
                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                }`}>
                  {sigEmpty ? "Awaiting Signature" : "Signature Captured ✓"}
                </span>
              </div>

              <div className="border-2 border-dashed border-neutral-700 hover:border-primary-500/50 rounded-2xl bg-white overflow-hidden touch-none shadow-inner p-1 transition-colors">
                <SignatureCanvas
                  ref={sigRef}
                  penColor="#0f172a"
                  onEnd={handleSigEnd}
                  canvasProps={{
                    width: 720,
                    height: 180,
                    className: "w-full h-40 md:h-48 cursor-crosshair",
                    style: { display: "block", touchAction: "none" }
                  }}
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleClearSignature}
                  className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white underline transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Clear & Re-draw
                </button>
                <span className="text-[11px] text-neutral-500">
                  Use your finger or mouse cursor to sign within the box.
                </span>
              </div>
            </div>

            {/* Error Message */}
            {submitError && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs font-medium animate-scale-in">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <div className="space-y-2">
                  <p>{submitError}</p>
                  {retryable && (
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition-colors"
                    >
                      Retry Submission
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Success Message */}
            {submitSuccess && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3 text-emerald-300 text-xs font-medium animate-scale-in">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                <span>Agreement signed successfully. Redirecting to your dashboard…</span>
              </div>
            )}

            {/* Submit Action Button */}
            <button
              onClick={handleSubmit}
              disabled={submitting || submitSuccess || !allChecked || sigEmpty}
              className="w-full py-4 px-6 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white font-semibold rounded-xl text-base shadow-lg shadow-primary-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processing & Generating Signed PDF…</span>
                </>
              ) : submitSuccess ? (
                <>
                  <Check className="w-5 h-5" />
                  <span>Agreement Signed ✓</span>
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  <span>Sign & Execute Agreement</span>
                </>
              )}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
