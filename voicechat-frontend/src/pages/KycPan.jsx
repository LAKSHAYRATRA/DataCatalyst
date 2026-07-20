import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "../components/Nav.jsx";
import { apiGet } from "../lib/api.js";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const MAX_RAW_BYTES = 5 * 1024 * 1024;
const COMPRESS_TARGET_BYTES = 300 * 1024;
const COMPRESS_MAX_DIM = 1600;

async function compressImage(file) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not read image"));
    el.src = URL.createObjectURL(file);
  });
  const scale = Math.min(1, COMPRESS_MAX_DIM / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(img.src);

  let quality = 0.85;
  let blob = null;
  for (let i = 0; i < 6; i++) {
    blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) throw new Error("Compression failed");
    if (blob.size <= COMPRESS_TARGET_BYTES) break;
    quality = Math.max(0.4, quality - 0.1);
  }
  return blob;
}

export default function KycPan() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [panNumber, setPanNumber] = useState("");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [compressedSize, setCompressedSize] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [rejectionReason, setRejectionReason] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = async () => {
    try {
      const res = await apiGet("/api/user/kyc/status");
      setAlreadySubmitted(!!res.panSubmitted);
      setVerificationStatus(res.verificationStatus || null);
      setRejectionReason(res.rejectionReason || null);
    } catch {
      // silent — form still usable
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const panValid = PAN_REGEX.test(panNumber);
  const canSubmit = panValid && !!file && !busy;

  async function onFilePicked(e) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setError("");
    if (picked.size > MAX_RAW_BYTES) {
      setError("Image is larger than 5 MB. Please pick a smaller photo.");
      return;
    }
    if (!/^image\/(jpe?g|png)$/.test(picked.type)) {
      setError("Only JPG or PNG images are supported.");
      return;
    }
    try {
      setBusy(true);
      const compressed = await compressImage(picked);
      setFile(compressed);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(compressed));
      setCompressedSize(compressed.size);
    } catch (err) {
      setError(err.message || "Could not process image.");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("panNumber", panNumber);
      formData.append("panCard", file, "pan.jpg");
      const res = await fetch(`${BACKEND_URL}/api/user/kyc/pan`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `http_${res.status}`);
      await loadStatus();
      setFile(null);
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
      setCompressedSize(null);
      setPanNumber("");
    } catch (err) {
      setError(err.message || "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 pt-16 md:pt-0 md:pl-72 transition-colors duration-300">
      <Nav />
      <div className="max-w-2xl mx-auto px-4 md:px-8 py-8 md:py-12">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-2">PAN Card Upload</h1>
        <p className="text-neutral-500 dark:text-neutral-400 mb-8">
          Adding your PAN keeps 4% more of every payout in your pocket by lifting the Section 194O TDS threshold.
        </p>

        {loading ? (
          <div className="card p-8 flex justify-center">
            <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : alreadySubmitted && verificationStatus !== "rejected" ? (
          <div className={`card p-6 border ${verificationStatus === "verified" ? "border-success-300 bg-success-50 dark:bg-success-900/20" : "border-warning-300 bg-warning-50 dark:bg-warning-900/20"}`}>
            <h2 className={`text-lg font-semibold ${verificationStatus === "verified" ? "text-success-800 dark:text-success-300" : "text-warning-800 dark:text-warning-300"}`}>
              {verificationStatus === "verified" ? "PAN verified" : "PAN awaiting verification"}
            </h2>
            <p className={`text-sm mt-1 ${verificationStatus === "verified" ? "text-success-700 dark:text-success-300" : "text-warning-700 dark:text-warning-300"}`}>
              {verificationStatus === "verified"
                ? "Your PAN has been verified. TDS will follow the Section 194O threshold: 0% until you cross Rs. 5,00,000 in a financial year, then 1% on the crossing payment and every payment after."
                : "Our team will review your submission within 24-48 hours. You'll be notified here if anything needs to be re-uploaded."}
            </p>
            <div className="flex gap-3 mt-4">
              <button onClick={() => navigate("/dashboard")} className="btn btn-primary">Back to Dashboard</button>
              <button onClick={() => { setAlreadySubmitted(false); setFile(null); setPreviewUrl(null); setPanNumber(""); }} className="btn btn-outline">Replace</button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="card p-6 space-y-6">
            {verificationStatus === "rejected" && (
              <div className="rounded-lg border border-error-300 bg-error-50 dark:bg-error-900/20 px-4 py-3">
                <p className="text-sm font-semibold text-error-800 dark:text-error-300">
                  Your previous PAN submission was rejected.
                </p>
                {rejectionReason && (
                  <p className="text-sm text-error-700 dark:text-error-300 mt-1 italic">"{rejectionReason}"</p>
                )}
                <p className="text-xs text-error-700 dark:text-error-300 mt-2">Please upload a clearer / correct PAN card below.</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold mb-1">PAN Number</label>
              <input
                type="text"
                value={panNumber}
                onChange={(e) => setPanNumber(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
                placeholder="ABCDE1234F"
                maxLength={10}
                className="input w-full font-mono tracking-widest uppercase"
                autoComplete="off"
                spellCheck={false}
              />
              <p className={`text-xs mt-1 ${panNumber && !panValid ? "text-error-600" : "text-neutral-500"}`}>
                {panNumber && !panValid ? "PAN must be 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)." : "Exactly as printed on your PAN card."}
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">PAN Card Photo</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                onChange={onFilePicked}
                className="block w-full text-sm text-neutral-600 dark:text-neutral-300
                  file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0
                  file:text-sm file:font-semibold
                  file:bg-primary-600 file:text-white
                  hover:file:bg-primary-700 file:cursor-pointer"
              />
              <p className="text-xs text-neutral-500 mt-1">
                JPG or PNG, up to 5 MB. We'll compress it locally before uploading.
              </p>

              {previewUrl && (
                <div className="mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 bg-neutral-100 dark:bg-neutral-900">
                  <img src={previewUrl} alt="PAN card preview" className="max-h-64 mx-auto rounded" />
                  {compressedSize != null && (
                    <p className="text-xs text-neutral-500 text-center mt-2">
                      Compressed size: {(compressedSize / 1024).toFixed(0)} KB
                    </p>
                  )}
                </div>
              )}
            </div>

            {error && (
              <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                className="btn btn-outline flex-1"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="btn btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? "Uploading…" : "Submit PAN"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
