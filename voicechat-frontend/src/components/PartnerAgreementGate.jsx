import React, { useState, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";
import {
  ShieldCheck,
  Building,
  User,
  Phone,
  MapPin,
  FileCheck,
  CreditCard,
  RotateCcw,
  AlertTriangle,
  Lock,
  CheckCircle2,
  ExternalLink,
  LogOut,
  Calendar,
  Home,
  Compass
} from "lucide-react";
import { apiPostJson } from "../lib/api.js";
import Swal from "sweetalert2";

export default function PartnerAgreementGate({ vendor, onSigned, onLogout }) {
  const isStudio = Boolean(vendor?.isStudio);
  const sigRef = useRef(null);

  // Form State for Partner Details
  const [formData, setFormData] = useState({
    signatoryName: vendor?.contactPerson || "",
    phone: vendor?.phone || "",
    address: vendor?.address || "",
    city: vendor?.city || "",
    state: vendor?.state || "",
    cityState: vendor?.cityState || "",
    panOrGst: vendor?.panOrGst || vendor?.payoutDetails?.panNumber || ""
  });

  // Checkboxes State
  const [checkboxes, setCheckboxes] = useState({
    legalAuthority: false,
    directArtistPayout: false,
    nonCircumvention: false,
    electronicSignatureConsent: false
  });

  const [sigEmpty, setSigEmpty] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const todayStr = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  const handleClearSig = () => {
    if (sigRef.current) {
      sigRef.current.clear();
      setSigEmpty(true);
    }
  };

  const handleSigEnd = () => {
    if (sigRef.current && !sigRef.current.isEmpty()) {
      setSigEmpty(false);
    }
  };

  const allChecked = Object.values(checkboxes).every(Boolean);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (!formData.signatoryName.trim()) {
      setErrorMsg(isStudio ? "Please enter the Authorized Signatory's Full Name." : "Please enter your Full Name.");
      return;
    }
    if (!formData.phone.trim()) {
      setErrorMsg("Please enter your Official Mobile / WhatsApp Number.");
      return;
    }

    if (isStudio) {
      // Studio requirements: Registered City & State + GST/PAN
      if (!formData.cityState.trim()) {
        setErrorMsg("Please enter your Studio's Registered City & State.");
        return;
      }
      if (!formData.panOrGst.trim()) {
        setErrorMsg("Please enter your Studio's Business GST Number or PAN.");
        return;
      }
    } else {
      // Vendor requirements: Personal details (Address, City, State, Mobile). No GST needed.
      if (!formData.address.trim()) {
        setErrorMsg("Please enter your Residential / Personal Address.");
        return;
      }
      if (!formData.city.trim()) {
        setErrorMsg("Please enter your City.");
        return;
      }
      if (!formData.state.trim()) {
        setErrorMsg("Please enter your State.");
        return;
      }
    }

    if (!allChecked) {
      setErrorMsg("Please confirm and accept all mandatory declarations below.");
      return;
    }
    if (sigEmpty || !sigRef.current || sigRef.current.isEmpty()) {
      setErrorMsg("Please draw your digital signature in the signature box.");
      return;
    }

    let signatureDataUrl = "";
    try {
      signatureDataUrl = sigRef.current.toDataURL("image/png");
    } catch (err) {
      setErrorMsg("Failed to capture digital signature. Please redraw and retry.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        signatoryName: formData.signatoryName.trim(),
        phone: formData.phone.trim(),
        confirmations: checkboxes,
        signatureDataUrl
      };

      if (isStudio) {
        payload.cityState = formData.cityState.trim();
        payload.panOrGst = formData.panOrGst.trim().toUpperCase();
      } else {
        payload.address = formData.address.trim();
        payload.city = formData.city.trim();
        payload.state = formData.state.trim();
        payload.cityState = `${formData.city.trim()}, ${formData.state.trim()}`;
        if (formData.panOrGst) payload.panOrGst = formData.panOrGst.trim().toUpperCase();
      }

      const res = await apiPostJson("/api/vendor/sign-agreement", payload);

      if (res?.ok) {
        Swal.fire({
          icon: "success",
          title: "Master Agreement Executed!",
          text: "Your partnership agreement has been electronically verified and recorded. Welcome to DataCatalyst Operations Network!",
          background: "#171717",
          color: "#fff",
          confirmButtonColor: isStudio ? "#9333ea" : "#059669"
        });
        if (onSigned) {
          onSigned(res.vendor);
        }
      } else {
        setErrorMsg(res?.error || "Failed to execute agreement.");
      }
    } catch (err) {
      setErrorMsg(err?.body?.error || err.message || "Failed to execute agreement.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-start p-4 sm:p-6 lg:p-10 font-sans">
      {/* Top Floating Bar */}
      <div className="w-full max-w-5xl flex items-center justify-between py-3 px-5 mb-6 bg-neutral-900/90 border border-neutral-800 rounded-2xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl border ${isStudio ? "bg-purple-600/20 border-purple-500/30 text-purple-400" : "bg-emerald-600/20 border-emerald-500/30 text-emerald-400"}`}>
            <Building className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm sm:text-base">{vendor?.name || "Partner Entity"}</span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-neutral-800 text-primary-400 border border-neutral-700">
                {vendor?.vendorCode}
              </span>
              <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border ${isStudio ? "bg-purple-500/20 text-purple-300 border-purple-500/30" : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"}`}>
                {isStudio ? "Recording Studio Partner" : "Talent Sourcing Vendor"}
              </span>
            </div>
            <span className="text-[11px] text-neutral-400">Step 1 of 1: Master Service Agreement Execution</span>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition-colors"
          title="Sign Out"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-5xl bg-neutral-900/80 border border-neutral-800 rounded-3xl p-6 sm:p-8 lg:p-10 shadow-2xl backdrop-blur-md">
        {/* Header Alert */}
        <div className="mb-8 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-amber-300">Action Required: Complete Onboarding & Sign Master Agreement</h3>
            <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
              {isStudio
                ? "Recording Studio partners require registered GST and registered city/state verification prior to acoustic facility project allocations."
                : "Talent sourcing vendors do not require company registration or GST. Please provide your personal contact and residential address details to execute your agreement."}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* SECTION 1: Partner Information Textboxes */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-600/30 text-primary-400 text-xs font-bold border border-primary-500/40">1</span>
              <h2 className="text-base font-bold text-white">
                {isStudio ? "Studio Legal Registration & Authorized Signatory" : "Vendor Personal Contact & Residential Details"}
              </h2>
            </div>
            <p className="text-xs text-neutral-400 mb-4">
              {isStudio
                ? "Studio entity requires registered GST and City & State for operational tax and acoustic facility compliance."
                : "Company registration and GST are NOT needed for sourcing vendors. Only your personal details (Full Name, Mobile, Address, City & State) are required."}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Partner Name (Disabled) */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  {isStudio ? "Studio / Entity Name" : "Vendor / Sourcing Agency Name"}
                </label>
                <div className="relative">
                  <Building className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
                  <input
                    type="text"
                    disabled
                    value={vendor?.name || ""}
                    className="w-full pl-9 pr-3 py-2.5 bg-neutral-800/60 border border-neutral-700/60 rounded-xl text-neutral-300 text-xs cursor-not-allowed font-medium"
                  />
                </div>
              </div>

              {/* Vendor Code (Disabled) */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Operational Partner Code</label>
                <div className="relative">
                  <CreditCard className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
                  <input
                    type="text"
                    disabled
                    value={vendor?.vendorCode || ""}
                    className="w-full pl-9 pr-3 py-2.5 bg-neutral-800/60 border border-neutral-700/60 rounded-xl text-primary-400 text-xs cursor-not-allowed font-mono font-bold"
                  />
                </div>
              </div>

              {/* Authorized Signatory / Full Name */}
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  {isStudio ? "Authorized Signatory Full Name" : "Your Full Name (Sourcing Head)"} <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={formData.signatoryName}
                    onChange={(e) => setFormData({ ...formData, signatoryName: e.target.value })}
                    className="w-full pl-9 pr-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-primary-500 transition-colors"
                  />
                </div>
              </div>

              {/* Phone / WhatsApp */}
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Mobile Number / WhatsApp <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. 9876543210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full pl-9 pr-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-primary-500 transition-colors"
                  />
                </div>
              </div>

              {isStudio ? (
                <>
                  {/* STUDIO FIELD 1: Registered City & State */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      Studio Registered City & State <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                      <input
                        type="text"
                        required
                        placeholder="e.g. Mumbai, Maharashtra"
                        value={formData.cityState}
                        onChange={(e) => setFormData({ ...formData, cityState: e.target.value })}
                        className="w-full pl-9 pr-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition-colors"
                      />
                    </div>
                  </div>

                  {/* STUDIO FIELD 2: GST Number / PAN */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      Studio GST Number / Business PAN <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <FileCheck className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                      <input
                        type="text"
                        required
                        placeholder="e.g. 27ABCDE1234F1Z5 or ABCDE1234F"
                        value={formData.panOrGst}
                        onChange={(e) => setFormData({ ...formData, panOrGst: e.target.value.toUpperCase() })}
                        className="w-full pl-9 pr-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-xs font-mono uppercase placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition-colors"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* VENDOR FIELD 1: Personal Residential Address */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      Personal / Residential Address <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <Home className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                      <input
                        type="text"
                        required
                        placeholder="e.g. Flat 402, Green Valley Apartments, Andheri West"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        className="w-full pl-9 pr-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                  </div>

                  {/* VENDOR FIELD 2: City */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      City <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                      <input
                        type="text"
                        required
                        placeholder="e.g. Mumbai"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        className="w-full pl-9 pr-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                  </div>

                  {/* VENDOR FIELD 3: State */}
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      State <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <Compass className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                      <input
                        type="text"
                        required
                        placeholder="e.g. Maharashtra"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                        className="w-full pl-9 pr-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* SECTION 2: Agreement Document Clauses Preview */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-600/30 text-primary-400 text-xs font-bold border border-primary-500/40">2</span>
                <h2 className="text-base font-bold text-white">
                  {isStudio ? "Recording Studio Partner Master Agreement" : "Talent Sourcing Vendor Master Agreement"}
                </h2>
              </div>
              <span className="text-[11px] text-neutral-400 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Effective: {todayStr}
              </span>
            </div>

            {/* Scrollable Agreement Content Container */}
            <div className="max-h-96 overflow-y-auto p-5 rounded-2xl bg-neutral-950/80 border border-neutral-800 text-neutral-300 text-xs leading-relaxed space-y-4 shadow-inner">
              {/* DataCatalyst Formal Header */}
              <div className="border-b border-neutral-800 pb-3 flex items-center justify-between">
                <div>
                  <h1 className="text-sm font-black text-sky-400 tracking-wide">DATACATALYST</h1>
                  <p className="text-[10px] text-neutral-400">VOCLARA VOICE OPERATIONS NETWORK · Regd. under Indian Partnership Act, 1932</p>
                </div>
                <div className="text-right text-[10px] text-neutral-500">
                  <p>Ref: DC / VOC / {isStudio ? "STD" : "VEN"} / 2026 / {vendor?.vendorCode}</p>
                  <p>Operations Base: Sri Ganganagar, Rajasthan</p>
                </div>
              </div>

              {/* Dynamic Partner Details Stamp */}
              {isStudio ? (
                <div className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800 grid grid-cols-2 gap-2 text-[11px]">
                  <div><span className="text-neutral-500">Studio Entity:</span> <b className="text-white">{vendor?.name}</b></div>
                  <div><span className="text-neutral-500">Authorized Signatory:</span> <b className="text-white">{formData.signatoryName || "[Authorized Signatory]"}</b></div>
                  <div><span className="text-neutral-500">Registered City / State:</span> <b className="text-white">{formData.cityState || "[Registered City, State]"}</b></div>
                  <div><span className="text-neutral-500">GST / PAN No:</span> <b className="text-white font-mono">{formData.panOrGst || "[GST / PAN Number]"}</b></div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800 grid grid-cols-2 gap-2 text-[11px]">
                  <div><span className="text-neutral-500">Vendor / Sourcing Head:</span> <b className="text-white">{vendor?.name}</b></div>
                  <div><span className="text-neutral-500">Authorized Name:</span> <b className="text-white">{formData.signatoryName || "[Authorized Name]"}</b></div>
                  <div><span className="text-neutral-500">Mobile / WhatsApp:</span> <b className="text-white">{formData.phone ? `+91 - ${formData.phone}` : "[Mobile Number]"}</b></div>
                  <div><span className="text-neutral-500">City / State:</span> <b className="text-white">{formData.city && formData.state ? `${formData.city}, ${formData.state}` : (formData.city || formData.state || "[City, State]")}</b></div>
                  <div className="col-span-2"><span className="text-neutral-500">Residential Address:</span> <b className="text-white">{formData.address || "[Residential Address]"}</b></div>
                </div>
              )}

              {/* Clauses Body */}
              <div className="space-y-3 text-[11.5px]">
                <p className="font-semibold text-white">
                  SUBJECT: MASTER B2B SERVICE AGREEMENT FOR {isStudio ? "RECORDING STUDIO ACOUSTIC EXECUTION AND ARTIST MANAGEMENT" : "TALENT SOURCING AND PARTICIPANT WORKFORCE OPERATIONS"}
                </p>

                <p>
                  This Master Agreement is entered into between <b>M/s DataCatalyst</b> ("Company"), administering the <b>Voclara</b> voice AI operations platform, and the Partner identified above ("Partner"). Both parties agree to the strict terms set forth herein:
                </p>

                {/* Clause 1 */}
                <div>
                  <h4 className="font-bold text-white">1. Scope of Engagement & Acoustic Standards</h4>
                  <p className="text-neutral-400 mt-0.5">
                    {isStudio
                      ? "The Studio agrees to provide acoustic recording facilities, studio-grade hardware (microphones, pop filters, treated acoustic rooms under 35dB noise floor), and oversee voice contributors during recording sessions."
                      : "The Vendor agrees to source, screen, and deploy eligible voice contributors meeting language, demographic, and acoustic hardware guidelines."}
                  </p>
                </div>

                {/* Clause 2: Commercial Model */}
                <div className="p-3 rounded-xl bg-primary-950/20 border border-primary-800/30">
                  <h4 className="font-bold text-primary-300">2. Commercial Model & Contributor Remuneration (Direct Disbursement)</h4>
                  <p className="text-neutral-300 mt-1">
                    {isStudio
                      ? "The Studio acknowledges that for all voice recording projects, DataCatalyst allocates a total approved project rate ($/hr). The Studio establishes the contributor payrate on the platform. DataCatalyst shall DISBURSE CONTRIBUTOR REMUNERATION DIRECTLY to the voice artist. The Studio shall be entitled to the net difference (Studio Facility & Engineering Margin) upon final QA audit approval."
                      : "DataCatalyst shall DISBURSE CONTRIBUTOR REMUNERATION DIRECTLY to participants engaged by the Vendor. The Vendor shall receive an agreed sourcing commission margin ($/approved hour) directly from DataCatalyst upon client QA acceptance."}
                  </p>
                </div>

                {/* Clause 3 */}
                <div>
                  <h4 className="font-bold text-white">3. Quality Assurance, Rejections & Audit Contingency</h4>
                  <p className="text-neutral-400 mt-0.5">
                    All audio submitted through the Voclara platform is subject to dual automated algorithms and human QA audits (SNR checks, speech clipping, background intrusion, pronunciation accuracy). Rejections exceeding allowable thresholds will not be payable to either contributor or partner.
                  </p>
                </div>

                {/* Clause 4: Non-Circumvention (STRICT, NO CLIENT NAMES) */}
                <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-800/30">
                  <h4 className="font-bold text-rose-300">4. Strict 24-Month Non-Circumvention & Non-Solicitation</h4>
                  <p className="text-neutral-300 mt-1">
                    The Partner covenants that during this agreement and for a period of <b>twenty-four (24) months</b> following termination, the Partner shall not directly or indirectly contact, solicit, pitch, contract with, or perform voice recording services for any client, sponsor, or downstream buyer of DataCatalyst introduced or serviced through this platform, without express written authorization from DataCatalyst. Violation warrants liquidated damages of ₹25,00,000 or 100% of realized revenue, whichever is greater.
                  </p>
                </div>

                {/* Clause 5 */}
                <div>
                  <h4 className="font-bold text-white">5. Independent Contractor & Account Suspension Rights</h4>
                  <p className="text-neutral-400 mt-0.5">
                    The relationship between the parties is that of independent commercial entities. DataCatalyst reserves the absolute unilateral right to immediately freeze or terminate the Partner's portal access and project allocations in the event of fraud, submission of synthetic/re-recorded audio, or breach of confidentiality covenants.
                  </p>
                </div>

                {/* Clause 6: Authority & Electronic Execution */}
                <div>
                  <h4 className="font-bold text-white">6. Legal Authority & Indian IT Act 2000 Compliance</h4>
                  <p className="text-neutral-400 mt-0.5">
                    This document is executed electronically in compliance with Section 10A of the Information Technology Act, 2000. Affixing a digital signature below constitutes a legally enforceable contract binding on the entity and its authorized officers.
                  </p>
                </div>

                {/* Divyam's Issuance Block */}
                <div className="mt-4 pt-3 border-t border-neutral-800 text-[11px] text-neutral-400">
                  <p className="text-white font-bold">ISSUED & RATIFIED FOR M/S DATACATALYST:</p>
                  <p className="text-primary-400 font-semibold mt-0.5">DIVYAM BHATIA</p>
                  <p className="text-[10px] text-neutral-500">Founder & Technology Advisor (Silent Partner)</p>
                  <p className="text-[10px] text-neutral-500">M/s DataCatalyst · Operations Base, Rajasthan</p>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: Checkboxes & Signature Pad */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-600/30 text-primary-400 text-xs font-bold border border-primary-500/40">3</span>
              <h2 className="text-base font-bold text-white">Digital Execution & Signature Capture</h2>
            </div>

            {/* Checkboxes */}
            <div className="space-y-3 mb-6 bg-neutral-950/60 p-4 rounded-2xl border border-neutral-800">
              <label className="flex items-start gap-3 cursor-pointer text-xs text-neutral-300 select-none">
                <input
                  type="checkbox"
                  checked={checkboxes.legalAuthority}
                  onChange={(e) => setCheckboxes({ ...checkboxes, legalAuthority: e.target.checked })}
                  className="mt-0.5 w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-primary-500 focus:ring-primary-500 focus:ring-offset-neutral-900"
                />
                <span>I confirm that I am of legal age (18+) and have the full legal authority to enter into this Master Agreement.</span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer text-xs text-neutral-300 select-none">
                <input
                  type="checkbox"
                  checked={checkboxes.directArtistPayout}
                  onChange={(e) => setCheckboxes({ ...checkboxes, directArtistPayout: e.target.checked })}
                  className="mt-0.5 w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-primary-500 focus:ring-primary-500 focus:ring-offset-neutral-900"
                />
                <span>I explicitly accept the commercial model wherein DataCatalyst directly pays voice contributors/participants, with our margin/facility fee settled upon QA approval.</span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer text-xs text-neutral-300 select-none">
                <input
                  type="checkbox"
                  checked={checkboxes.nonCircumvention}
                  onChange={(e) => setCheckboxes({ ...checkboxes, nonCircumvention: e.target.checked })}
                  className="mt-0.5 w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-primary-500 focus:ring-primary-500 focus:ring-offset-neutral-900"
                />
                <span>I agree to the strict 24-month non-circumvention, non-solicitation, and confidential operational guidelines.</span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer text-xs text-neutral-300 select-none">
                <input
                  type="checkbox"
                  checked={checkboxes.electronicSignatureConsent}
                  onChange={(e) => setCheckboxes({ ...checkboxes, electronicSignatureConsent: e.target.checked })}
                  className="mt-0.5 w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-primary-500 focus:ring-primary-500 focus:ring-offset-neutral-900"
                />
                <span>I consent to signing this agreement electronically under Section 10A of the Information Technology Act, 2000.</span>
              </label>
            </div>

            {/* Signature Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-neutral-300">
                  Draw Authorized Digital Signature <span className="text-rose-400">*</span>
                </label>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                  sigEmpty ? "bg-amber-500/10 text-amber-400 border-amber-500/30" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                }`}>
                  {sigEmpty ? "Awaiting Signature" : "Signature Captured ✓"}
                </span>
              </div>

              <div className="border-2 border-dashed border-neutral-700 hover:border-primary-500/50 rounded-2xl bg-white overflow-hidden touch-none p-1 transition-colors">
                <SignatureCanvas
                  ref={sigRef}
                  penColor="#0f172a"
                  onEnd={handleSigEnd}
                  canvasProps={{
                    width: 720,
                    height: 180,
                    className: "w-full h-36 sm:h-44 cursor-crosshair",
                    style: { display: "block", touchAction: "none" }
                  }}
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleClearSig}
                  className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white underline transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Clear & Re-draw
                </button>
                <span className="text-[11px] text-neutral-500">
                  Draw using mouse cursor or touchscreen finger.
                </span>
              </div>
            </div>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <p>{errorMsg}</p>
            </div>
          )}

          {/* Submit Action */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting || !allChecked || sigEmpty}
              className={`w-full py-4 rounded-2xl font-bold text-sm text-white shadow-xl transition-all flex items-center justify-center gap-2 ${
                submitting || !allChecked || sigEmpty
                  ? "bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700"
                  : isStudio
                  ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-purple-600/30"
                  : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/30"
              }`}
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Generating Stamped Master Agreement PDF & Verifying...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  <span>Accept & Digitally Sign Master Agreement</span>
                </>
              )}
            </button>
            <p className="text-[11px] text-neutral-500 text-center mt-2.5">
              By executing this agreement, an authenticated 2-page PDF document will be generated and archived in our compliance repository.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
