import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiPostJson } from "../lib/api.js";
import { setUserInfo } from "../lib/auth.js";
import { INDIA_STATE_NAMES } from "../lib/indiaData.js";
import { REGIONAL_LANGUAGES } from "../lib/regionalLanguages.js";

const TOTAL_STEPS = 4;

function ProgressBar({ step }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        {["Personal", "Address", "Equipment", "Verify Email"].map((label, i) => {
          const num = i + 1;
          const done = step > num;
          const active = step === num;
          return (
            <div key={label} className="flex flex-col items-center flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${done
                  ? "bg-primary-600 text-white"
                  : active
                    ? "bg-primary-100 text-primary-700 border-2 border-primary-500"
                    : "bg-neutral-200 text-neutral-500"
                  }`}
              >
                {done ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  num
                )}
              </div>
              <span className={`text-xs mt-1 font-medium ${active ? "text-primary-600" : "text-neutral-400"}`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="relative h-1 bg-neutral-200 rounded-full mt-1">
        <div
          className="absolute h-1 bg-primary-500 rounded-full transition-all duration-500"
          style={{ width: `${((step - 1) / (TOTAL_STEPS - 1)) * 100}%` }}
        />
      </div>
    </div>
  );
}

function FormField({ label, id, required, children, error }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-neutral-700 mb-2">
        {label} {required && <span className="text-error-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-error-600">{error}</p>}
    </div>
  );
}

export default function Signup() {
  const navigate = useNavigate();

  // Step tracker
  const [step, setStep] = useState(1);
  const [globalError, setGlobalError] = useState("");
  const [loading, setLoading] = useState(false);

  // Step 1 — Personal Info
  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [gender, setGender] = useState("");
  const [regionalLanguage, setRegionalLanguage] = useState("");
  const [locality, setLocality] = useState("");
  const [dob, setDob] = useState("");

  // Step 2 — Address
  const [street, setStreet] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");

  // Step 3 — Equipment
  const [micBrand, setMicBrand] = useState("");
  const [micModel, setMicModel] = useState("");

  // Step 4 — OTP
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [fieldErrors, setFieldErrors] = useState({});

  // ─── Validation ──────────────────────────────────────────────────────────
  function validateStep1() {
    const errs = {};
    if (!firstname.trim()) errs.firstname = "Required";
    if (!lastname.trim()) errs.lastname = "Required";
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) errs.email = "Valid email required";
    if (password.length < 6) errs.password = "Minimum 6 characters";
    if (password !== confirmPassword) errs.confirmPassword = "Passwords do not match";
    if (!gender) errs.gender = "Required";
    if (!regionalLanguage) errs.regionalLanguage = "Required";
    if (!locality) errs.locality = "Required";
    if (!dob) errs.dob = "Required";
    return errs;
  }

  function validateStep2() {
    const errs = {};
    if (!street.trim()) errs.street = "Required";
    if (!state) errs.state = "Required";
    if (!city) errs.city = "Required";
    if (!/^\d{6}$/.test(pincode)) errs.pincode = "Must be a 6-digit number";
    return errs;
  }

  function validateStep3() {
    const errs = {};
    if (!micBrand.trim()) errs.micBrand = "Required";
    if (!micModel.trim()) errs.micModel = "Required";
    return errs;
  }

  // ─── Step navigation ──────────────────────────────────────────────────────
  async function goNext() {
    setGlobalError("");
    let errs = {};
    if (step === 1) errs = validateStep1();
    if (step === 2) errs = validateStep2();
    if (step === 3) errs = validateStep3();

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    // On Step 1: check if email is already registered before advancing
    if (step === 1) {
      setLoading(true);
      try {
        const res = await apiPostJson("/api/auth/check-email", { email });
        if (!res.available) {
          setFieldErrors({ email: "This email is already registered. Please sign in." });
          setLoading(false);
          return;
        }
      } catch {
        setGlobalError("Could not verify email. Please try again.");
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    setFieldErrors({});
    setStep((s) => s + 1);

    if (step === 3) {
      // Auto-send OTP when moving to step 4
      sendOtp();
    }
  }

  function goBack() {
    setGlobalError("");
    setFieldErrors({});
    setStep((s) => s - 1);
  }

  // ─── OTP ─────────────────────────────────────────────────────────────────
  async function sendOtp() {
    setLoading(true);
    try {
      await apiPostJson("/api/auth/send-otp", { email, type: "signup" });
      setOtpSent(true);
      startResendCooldown();
    } catch (e) {
      if (e.message === "otp_too_soon") {
        setOtpSent(true);
        startResendCooldown();
      } else {
        setGlobalError("Failed to send OTP. Please check your email and try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  function startResendCooldown() {
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  // ─── Submit ───────────────────────────────────────────────────────────────
  async function onSubmit(e) {
    e.preventDefault();
    if (!otp.trim() || otp.length !== 6) {
      setFieldErrors({ otp: "Enter the 6-digit OTP" });
      return;
    }
    setGlobalError("");
    setFieldErrors({});
    setLoading(true);
    try {
      const res = await apiPostJson("/api/auth/signup", {
        firstname,
        lastname,
        email,
        password,
        gender,
        regionalLanguage,
        locality,
        address: { street, state, city, pincode },
        microphoneBrand: micBrand,
        microphoneModel: micModel,
        dob,
        otpCode: otp,
      });
      setUserInfo(res.user);
      navigate("/intro-recording");
    } catch (e2) {
      const msg = e2.message;
      if (msg === "otp_invalid_or_expired") setGlobalError("OTP is incorrect or expired. Request a new one.");
      else if (msg === "user_exists") setGlobalError("An account with this email already exists.");
      else setGlobalError(msg || "Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ─── Render helpers ───────────────────────────────────────────────────────
  const inputClass = "input w-full";
  const selectClass = "input w-full appearance-none cursor-pointer";

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
      <div className="w-full max-w-lg animate-fade-in">
        {/* Brand */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-3">

            <img src="/logo.png" alt="Voclara Logo" className="w-16 h-16 object-contain shadow-sm" />

          </div>
          <h1 className="text-2xl font-bold text-neutral-900">Create Account</h1>
          <p className="text-neutral-500 text-sm mt-1">Join Voclara today</p>
        </div>

        <div className="card animate-slide-up">
          <ProgressBar step={step} />

          {/* ── STEP 1: Personal Info ── */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-neutral-800 mb-1">Personal Information</h2>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="First Name" id="firstname" required error={fieldErrors.firstname}>
                  <input id="firstname" type="text" className={inputClass} placeholder="John"
                    value={firstname} onChange={e => setFirstname(e.target.value)} />
                </FormField>
                <FormField label="Last Name" id="lastname" required error={fieldErrors.lastname}>
                  <input id="lastname" type="text" className={inputClass} placeholder="Doe"
                    value={lastname} onChange={e => setLastname(e.target.value)} />
                </FormField>
              </div>

              <FormField label="Email Address" id="email" required error={fieldErrors.email}>
                <input id="email" type="email" className={inputClass} placeholder="you@example.com"
                  value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Password" id="password" required error={fieldErrors.password}>
                  <input id="password" type="password" className={inputClass} placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)} minLength="6" />
                </FormField>
                <FormField label="Confirm Password" id="confirmPassword" required error={fieldErrors.confirmPassword}>
                  <input id="confirmPassword" type="password" className={inputClass} placeholder="••••••••"
                    value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Gender" id="gender" required error={fieldErrors.gender}>
                  <select id="gender" className={selectClass} value={gender} onChange={e => setGender(e.target.value)}>
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </FormField>
                <FormField label="Locality" id="locality" required error={fieldErrors.locality}>
                  <select id="locality" className={selectClass} value={locality} onChange={e => setLocality(e.target.value)}>
                    <option value="">Select locality</option>
                    <option value="urban">Urban</option>
                    <option value="rural">Rural</option>
                  </select>
                </FormField>
              </div>

              <FormField label="Regional Language" id="language" required error={fieldErrors.regionalLanguage}>
                <select id="language" className={selectClass} value={regionalLanguage} onChange={e => setRegionalLanguage(e.target.value)}>
                  <option value="">Select your regional language</option>
                  {REGIONAL_LANGUAGES.map(lang => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </FormField>

              <FormField label="Date of Birth" id="dob" required error={fieldErrors.dob}>
                <input id="dob" type="date" className={inputClass}
                  value={dob} onChange={e => setDob(e.target.value)} />
              </FormField>
            </div>
          )}

          {/* ── STEP 2: Address ── */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-neutral-800 mb-1">Address Details</h2>

              <FormField label="Street Address" id="street" required error={fieldErrors.street}>
                <input id="street" type="text" className={inputClass} placeholder="House No., Street, Area"
                  value={street} onChange={e => setStreet(e.target.value)} />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="State" id="state" required error={fieldErrors.state}>
                  <select id="state" className={selectClass} value={state}
                    onChange={e => { setState(e.target.value); setCity(""); }}>
                    <option value="">Select state</option>
                    {INDIA_STATE_NAMES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="City" id="city" required error={fieldErrors.city}>
                  <input
                    id="city"
                    type="text"
                    className={inputClass}
                    placeholder="Enter your city"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                  />
                </FormField>
              </div>

              <FormField label="Pin Code" id="pincode" required error={fieldErrors.pincode}>
                <input id="pincode" type="text" className={inputClass} placeholder="6-digit PIN code"
                  value={pincode} onChange={e => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6} inputMode="numeric" />
              </FormField>
            </div>
          )}

          {/* ── STEP 3: Equipment ── */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-neutral-800 mb-1">Microphone Details</h2>
              <p className="text-sm text-neutral-500 mb-2">Tell us about the microphone you'll use for voice calls.</p>

              <FormField label="Microphone Brand" id="micBrand" required error={fieldErrors.micBrand}>
                <input id="micBrand" type="text" className={inputClass}
                  placeholder="e.g. HyperX, Rode, Blue, Boya, boat"
                  value={micBrand} onChange={e => setMicBrand(e.target.value)} />
              </FormField>

              <FormField label="Microphone Model" id="micModel" required error={fieldErrors.micModel}>
                <input id="micModel" type="text" className={inputClass}
                  placeholder="e.g. Cloud II, NT-USB, Yeti, BY-M1"
                  value={micModel} onChange={e => setMicModel(e.target.value)} />
              </FormField>

              <div className="bg-primary-50 border border-primary-100 rounded-lg p-3 mt-2">
                <p className="text-xs text-primary-700 flex items-start gap-2">
                  <span className="text-base leading-none">ℹ️</span>
                  <span>This information helps us understand microphone usage patterns across our users. Any microphone type is fine.</span>
                </p>
              </div>
            </div>
          )}

          {/* ── STEP 4: Email OTP ── */}
          {step === 4 && (
            <form onSubmit={onSubmit}>
              <div className="space-y-5">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 bg-primary-100 rounded-full mb-3">
                    <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-neutral-800">Verify Your Email</h2>
                  <p className="text-sm text-neutral-500 mt-1">
                    We sent a 6-digit OTP to<br />
                    <span className="font-semibold text-neutral-700">{email}</span>
                  </p>
                </div>

                <FormField label="Enter OTP" id="otp" required error={fieldErrors.otp}>
                  <input
                    id="otp"
                    type="text"
                    className={`${inputClass} text-center text-2xl font-mono tracking-widest letter-spacing-4`}
                    placeholder="— — — — — —"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </FormField>

                <p className="text-xs text-neutral-500 text-center">OTP expires in 10 minutes</p>

                {/* Resend */}
                <div className="text-center">
                  {resendCooldown > 0 ? (
                    <span className="text-sm text-neutral-400">Resend OTP in {resendCooldown}s</span>
                  ) : (
                    <button
                      type="button"
                      onClick={sendOtp}
                      disabled={loading}
                      className="text-sm text-primary-600 hover:text-primary-700 font-semibold transition-colors"
                    >
                      Resend OTP
                    </button>
                  )}
                </div>

                {globalError && (
                  <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-lg text-sm animate-scale-in">
                    {globalError}
                  </div>
                )}

                <button type="submit" disabled={loading || otp.length !== 6} className="btn btn-primary w-full">
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Creating Account...
                    </span>
                  ) : (
                    "Verify & Create Account"
                  )}
                </button>
              </div>
            </form>
          )}

          {/* ── Errors (steps 1-3) ── */}
          {step < 4 && globalError && (
            <div className="mt-4 bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-lg text-sm animate-scale-in">
              {globalError}
            </div>
          )}

          {/* ── Step navigation (steps 1-3) ── */}
          {step < 4 && (
            <div className={`mt-6 flex ${step > 1 ? "justify-between" : "justify-end"}`}>
              {step > 1 && (
                <button type="button" onClick={goBack}
                  className="btn btn-outline px-6">
                  ← Back
                </button>
              )}
              <button
                type="button"
                onClick={goNext}
                disabled={loading}
                className="btn btn-primary px-8"
              >
                {loading && step === 3 ? (
                  <span className="flex items-center">
                    <svg className="animate-spin mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Sending OTP...
                  </span>
                ) : step === 3 ? (
                  "Send OTP & Verify →"
                ) : (
                  "Next →"
                )}
              </button>
            </div>
          )}

          {/* ── Sign in link ── */}
          <div className="mt-6 text-center border-t border-neutral-100 pt-4">
            <p className="text-sm text-neutral-600">
              Already have an account?{" "}
              <Link to="/login" className="text-primary-600 hover:text-primary-700 font-semibold transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>


      </div>
    </div>
  );
}
