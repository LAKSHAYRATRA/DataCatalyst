import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import SignatureCanvas from "react-signature-canvas";
import { apiPostJson } from "../lib/api.js";
import { getUserInfo, setUserInfo } from "../lib/auth.js";

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
  const userInfo = getUserInfo();
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

  useEffect(() => {
    let cancelled = false;
    async function loadDoc() {
      setLoadError("");
      setLoadingDoc(true);
      try {
        const res = await fetchWithRetry(AGREEMENT_URL, { credentials: "same-origin" });
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
  }, []);

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
    return {
      name: `${userInfo.firstname || ""} ${userInfo.lastname || ""}`.trim() || "—",
      username: userInfo.username || "—",
      email: userInfo.email || "—",
      dob: userInfo.dob ? String(userInfo.dob).slice(0, 10) : "—",
      address: [addr.street, addr.city, addr.state, addr.pincode].filter(Boolean).join(", ") || "—",
      speakerId: userInfo.speaker_id || "assigned at signing",
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

  if (!userInfo) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
        <div className="card max-w-md">
          <p className="text-neutral-700 dark:text-neutral-200">Please log in to sign the Contributor Agreement.</p>
        </div>
      </div>
    );
  }

  if (userInfo.accountStatus !== "approved") {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
        <div className="card max-w-md text-center">
          <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">Not yet available</h2>
          <p className="text-neutral-600 dark:text-neutral-300 mt-2">
            The Contributor Agreement is presented after your intro recording has been approved by our team.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Contributor Agreement</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Please read carefully, tick each confirmation, draw your signature, and click Sign Agreement.
          </p>
        </div>

        {userInfo.contributorAgreement?.adminReviewStatus === "rejected" && userInfo.contributorAgreement?.adminReviewReason && (
          <div className="card border-error-300 dark:border-error-700 bg-error-50 dark:bg-error-900/20">
            <h3 className="font-semibold text-error-800 dark:text-error-300 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Your previous submission was not approved
            </h3>
            <p className="text-error-700 dark:text-error-300 mt-2 text-sm">
              <strong>Reviewer's reason:</strong> {userInfo.contributorAgreement.adminReviewReason}
            </p>
            <p className="text-error-600 dark:text-error-400 mt-2 text-xs">
              Please read the agreement again, tick all confirmations, and re-sign below.
            </p>
          </div>
        )}

        {loadingDoc && (
          <div className="card">
            <p className="text-neutral-600 dark:text-neutral-300">Loading agreement…</p>
          </div>
        )}

        {loadError && (
          <div className="card border-error-300 dark:border-error-700">
            <p className="text-error-700 dark:text-error-300 font-medium">{loadError}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 btn btn-primary"
            >
              Retry
            </button>
          </div>
        )}

        {!loadingDoc && !loadError && (
          <>
            <div className="card max-h-[60vh] overflow-y-auto prose prose-sm dark:prose-invert max-w-none prose-headings:font-bold prose-headings:text-neutral-900 dark:prose-headings:text-neutral-100 prose-p:text-neutral-800 dark:prose-p:text-neutral-200 prose-li:text-neutral-800 dark:prose-li:text-neutral-200 prose-strong:text-neutral-900 dark:prose-strong:text-neutral-100">
              <ReactMarkdown>{markdown}</ReactMarkdown>
            </div>

            <div className="card">
              <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-50 mb-3">Your details (auto-filled at signing)</h2>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-6 text-sm">
                <div><dt className="text-neutral-500 dark:text-neutral-400">Full name</dt><dd className="text-neutral-900 dark:text-neutral-100 font-medium">{substitutedPreview.name}</dd></div>
                <div><dt className="text-neutral-500 dark:text-neutral-400">Username</dt><dd className="text-neutral-900 dark:text-neutral-100 font-medium">{substitutedPreview.username}</dd></div>
                <div><dt className="text-neutral-500 dark:text-neutral-400">Email</dt><dd className="text-neutral-900 dark:text-neutral-100 font-medium">{substitutedPreview.email}</dd></div>
                <div><dt className="text-neutral-500 dark:text-neutral-400">Date of birth</dt><dd className="text-neutral-900 dark:text-neutral-100 font-medium">{substitutedPreview.dob}</dd></div>
                <div className="md:col-span-2"><dt className="text-neutral-500 dark:text-neutral-400">Address</dt><dd className="text-neutral-900 dark:text-neutral-100 font-medium">{substitutedPreview.address}</dd></div>
                <div><dt className="text-neutral-500 dark:text-neutral-400">Speaker code</dt><dd className="text-neutral-900 dark:text-neutral-100 font-medium">{substitutedPreview.speakerId}</dd></div>
              </dl>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-3">Date, IP, and version are recorded automatically when you sign.</p>
            </div>

            <div className="card">
              <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-50 mb-3">Confirmations</h2>
              <div className="space-y-2.5">
                {CHECKBOX_ITEMS.map(it => (
                  <label key={it.key} className="flex items-start gap-2.5 text-sm text-neutral-800 dark:text-neutral-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checkboxes[it.key]}
                      onChange={e => setCheckboxes(c => ({ ...c, [it.key]: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 dark:border-neutral-600 text-primary-600 focus:ring-primary-500"
                    />
                    <span>{it.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="card">
              <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-50 mb-3">Draw your signature</h2>
              <div className="border-2 border-dashed border-neutral-300 dark:border-neutral-600 rounded-lg bg-white overflow-hidden touch-none">
                <SignatureCanvas
                  ref={sigRef}
                  penColor="#111827"
                  onEnd={handleSigEnd}
                  canvasProps={{
                    width: 720,
                    height: 180,
                    className: "w-full h-40 md:h-48",
                    style: { display: "block", touchAction: "none" }
                  }}
                />
              </div>
              <div className="flex items-center justify-between mt-3">
                <button
                  type="button"
                  onClick={handleClearSignature}
                  className="text-sm text-neutral-600 dark:text-neutral-300 underline hover:text-neutral-800 dark:hover:text-neutral-100"
                >
                  Clear signature
                </button>
                <span className={`text-xs ${sigEmpty ? "text-neutral-400" : "text-success-600 dark:text-success-400"}`}>
                  {sigEmpty ? "Not signed yet" : "Signature captured"}
                </span>
              </div>
            </div>

            {submitError && (
              <div className="card border-error-300 dark:border-error-700 bg-error-50 dark:bg-error-900/20">
                <p className="text-error-700 dark:text-error-300 text-sm">{submitError}</p>
                {retryable && (
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="mt-3 btn btn-primary text-sm"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            {submitSuccess && (
              <div className="card border-success-300 dark:border-success-700 bg-success-50 dark:bg-success-900/20">
                <p className="text-success-700 dark:text-success-300 font-medium">
                  ✓ Agreement signed. It will now be reviewed by our team before you can contribute. Redirecting to your dashboard…
                </p>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting || submitSuccess || !allChecked || sigEmpty}
              className="btn btn-primary w-full inline-flex items-center justify-center gap-2 py-3 text-base disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Signing…" : submitSuccess ? "Signed ✓" : "Sign Agreement"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
