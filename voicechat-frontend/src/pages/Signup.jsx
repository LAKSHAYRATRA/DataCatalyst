import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
                  ? "bg-primary-600 text-white shadow-md shadow-primary-600/30"
                  : active
                    ? "bg-primary-500/20 text-primary-300 border-2 border-primary-500 shadow-sm"
                    : "bg-neutral-800 text-neutral-500 border border-neutral-700/80"
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
              <span className={`text-[11px] mt-1.5 font-medium ${active ? "text-primary-400 font-bold" : "text-neutral-500"}`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="relative h-1.5 bg-neutral-800 rounded-full mt-2 overflow-hidden">
        <div
          className="absolute h-full bg-gradient-to-r from-primary-600 to-indigo-500 rounded-full transition-all duration-500"
          style={{ width: `${((step - 1) / (TOTAL_STEPS - 1)) * 100}%` }}
        />
      </div>
    </div>
  );
}

function FormField({ label, id, required, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
        {label} {required && <span className="text-rose-400">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-rose-400 mt-1 font-medium">{error}</p>}
    </div>
  );
}

export default function Signup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const vendorCode = (searchParams.get("vendor") || searchParams.get("ref") || "").trim().toUpperCase();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [email, setEmail] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [gender, setGender] = useState("");
  const [regionalLanguage, setRegionalLanguage] = useState("");
  const [dob, setDob] = useState("");

  // Step 2: Address
  const [street, setStreet] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [locality, setLocality] = useState("urban");

  // Step 3: Equipment & Accent
  const [micBrand, setMicBrand] = useState("");
  const [micModel, setMicModel] = useState("");
  const [accent, setAccent] = useState("");
  const [dialect, setDialect] = useState("");

  // Step 4: OTP
  const [otp, setOtp] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

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

  async function sendOtp() {
    setGlobalError("");
    setLoading(true);
    try {
      await apiPostJson("/api/auth/send-otp", { email, type: "signup" });
      startResendCooldown();
    } catch (err) {
      if (err.message === "otp_too_soon") {
        startResendCooldown();
      } else {
        setGlobalError(err.message || "Failed to send OTP. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  // ─── Step Validation & Navigation ─────────────────────────────────────────
  async function goNext() {
    setGlobalError("");
    setFieldErrors({});

    if (step === 1) {
      const errors = {};
      if (!firstname.trim()) errors.firstname = "First name is required";
      if (!lastname.trim()) errors.lastname = "Last name is required";
      if (!email.trim()) errors.email = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address";
      if (!mobileNumber.trim()) errors.mobileNumber = "Mobile number is required";
      else if (!/^[6-9]\d{9}$/.test(mobileNumber.replace(/[^0-9]/g, ""))) errors.mobileNumber = "Enter a valid 10-digit mobile number";
      if (!password) errors.password = "Password is required";
      else if (password.length < 6) errors.password = "Password must be at least 6 characters";
      if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match";
      if (!gender) errors.gender = "Please select gender";
      if (!regionalLanguage) errors.regionalLanguage = "Please select your primary language";

      if (!dob) {
        errors.dob = "Date of birth is required";
      } else {
        const dobDate = new Date(dob);
        if (Number.isNaN(dobDate.getTime())) {
          errors.dob = "Please enter a valid date of birth";
        } else {
          const today = new Date();
          let age = today.getFullYear() - dobDate.getFullYear();
          const m = today.getMonth() - dobDate.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) age--;
          if (age < 18) errors.dob = "You must be at least 18 years old";
          if (age > 65) errors.dob = "Maximum age allowed to register is 65 years";
        }
      }

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }

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

    if (step === 2) {
      const errors = {};
      if (!street.trim()) errors.street = "Street address is required";
      if (!state.trim()) errors.state = "Please select a state";
      if (!city.trim()) errors.city = "City is required";
      if (!pincode.trim()) errors.pincode = "Pincode is required";
      else if (!/^\d{6}$/.test(pincode.trim())) errors.pincode = "Enter a valid 6-digit pincode";
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
    }

    if (step === 3) {
      const errors = {};
      if (!micBrand.trim()) errors.micBrand = "Microphone brand is required";
      if (!micModel.trim()) errors.micModel = "Microphone model is required";
      if (!accent.trim()) errors.accent = "Accent is required";
      if (!dialect.trim()) errors.dialect = "Dialect is required";
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }

      // Transition to Step 4 and send OTP
      setStep(4);
      sendOtp();
      return;
    }

    setFieldErrors({});
    setStep((s) => s + 1);
  }

  function goBack() {
    setGlobalError("");
    setFieldErrors({});
    setStep((s) => s - 1);
  }

  // ─── Submit ───────────────────────────────────────────────────────────────
  async function onSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    setGlobalError("");
    setFieldErrors({});
    setLoading(true);
    try {
      const res = await apiPostJson("/api/auth/signup", {
        firstname,
        lastname,
        email,
        mobileNumber: mobileNumber.trim(),
        password,
        gender,
        regionalLanguage,
        locality,
        address: { street, state, city, pincode },
        microphoneBrand: micBrand,
        microphoneModel: micModel,
        accent: accent.trim(),
        dialect: dialect.trim(),
        dob,
        otpCode: otp,
        vendorCode: vendorCode || undefined,
      });
      if (res.token) localStorage.setItem("vc_token", res.token);
      setUserInfo(res.user);
      navigate("/intro-recording");
    } catch (e2) {
      const msg = e2.message;
      if (msg === "user_exists") setGlobalError("An account with this email already exists.");
      else if (msg === "underage") setGlobalError("You must be at least 18 years old to sign up.");
      else if (msg === "overage") setGlobalError("Maximum age allowed to register is 65 years.");
      else if (msg === "invalid_dob") setGlobalError("Please enter a valid date of birth.");
      else if (msg === "otp_invalid_or_expired") setGlobalError("The OTP entered is incorrect or has expired.");
      else setGlobalError(msg || "Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const darkInput = "w-full px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition-all";
  const darkSelect = "w-full px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-white focus:outline-none focus:border-primary-500 cursor-pointer";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4 relative overflow-hidden selection:bg-primary-500 selection:text-white">
      {/* Background Ambient Glows */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-lg animate-fade-in relative z-10 py-6">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-3 p-2 rounded-2xl bg-neutral-900 border border-neutral-800 shadow-xl shadow-black/40">
            <img src="/logo.png" alt="Voclara Logo" className="w-14 h-14 object-contain" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Create Account</h1>
          <p className="text-neutral-400 text-sm mt-1">Join Voclara as a voice contributor</p>
        </div>

        {/* Signup Card */}
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl animate-slide-up">
          {vendorCode && (
            <div className="mb-6 p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl flex items-center justify-between text-xs text-purple-200">
              <span className="font-medium">
                Joining via Agency Partner: <strong className="font-mono font-bold text-purple-300">{vendorCode}</strong>
              </span>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-500/30">
                Direct Contributor
              </span>
            </div>
          )}

          <ProgressBar step={step} />

          {/* ── STEP 1: Personal Info ── */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-white mb-2 pb-2 border-b border-neutral-800/80">
                1. Personal Information
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="First Name" id="firstname" required error={fieldErrors.firstname}>
                  <input
                    id="firstname"
                    type="text"
                    className={darkInput}
                    placeholder="John"
                    value={firstname}
                    onChange={e => setFirstname(e.target.value)}
                  />
                </FormField>
                <FormField label="Last Name" id="lastname" required error={fieldErrors.lastname}>
                  <input
                    id="lastname"
                    type="text"
                    className={darkInput}
                    placeholder="Doe"
                    value={lastname}
                    onChange={e => setLastname(e.target.value)}
                  />
                </FormField>
              </div>

              <FormField label="Email Address" id="email" required error={fieldErrors.email}>
                <input
                  id="email"
                  type="email"
                  className={darkInput}
                  placeholder="john@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </FormField>

              <FormField label="Mobile Number (10 Digits)" id="mobileNumber" required error={fieldErrors.mobileNumber}>
                <div className="relative flex rounded-xl shadow-sm">
                  <span className="inline-flex items-center px-3.5 rounded-l-xl border border-r-0 border-neutral-800 bg-neutral-950 text-neutral-400 text-xs font-bold">
                    🇮🇳 +91
                  </span>
                  <input
                    id="mobileNumber"
                    type="tel"
                    maxLength={10}
                    className="w-full px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-r-xl text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 font-mono tracking-wider"
                    placeholder="9876543210"
                    value={mobileNumber}
                    onChange={e => setMobileNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                  />
                </div>
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Password" id="password" required error={fieldErrors.password}>
                  <input
                    id="password"
                    type="password"
                    className={darkInput}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </FormField>
                <FormField label="Confirm Password" id="confirmPassword" required error={fieldErrors.confirmPassword}>
                  <input
                    id="confirmPassword"
                    type="password"
                    className={darkInput}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Gender" id="gender" required error={fieldErrors.gender}>
                  <select id="gender" className={darkSelect} value={gender} onChange={e => setGender(e.target.value)}>
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </FormField>

                <FormField label="Primary Language" id="regionalLanguage" required error={fieldErrors.regionalLanguage}>
                  <select id="regionalLanguage" className={darkSelect} value={regionalLanguage} onChange={e => setRegionalLanguage(e.target.value)}>
                    <option value="">Select language</option>
                    {REGIONAL_LANGUAGES.map(lang => (
                      <option key={lang} value={lang}>{lang}</option>
                    ))}
                  </select>
                </FormField>
              </div>

              <FormField label="Date of Birth (Must be 18+)" id="dob" required error={fieldErrors.dob}>
                <input
                  id="dob"
                  type="date"
                  className={darkInput}
                  value={dob}
                  onChange={e => setDob(e.target.value)}
                  max={new Date().toISOString().split("T")[0]}
                />
              </FormField>
            </div>
          )}

          {/* ── STEP 2: Address Info ── */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-white mb-2 pb-2 border-b border-neutral-800/80">
                2. Residential Location
              </h2>

              <FormField label="Street Address" id="street" required error={fieldErrors.street}>
                <input
                  id="street"
                  type="text"
                  className={darkInput}
                  placeholder="123 Main St, Apt 4B"
                  value={street}
                  onChange={e => setStreet(e.target.value)}
                />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="State / UT" id="state" required error={fieldErrors.state}>
                  <select id="state" className={darkSelect} value={state} onChange={e => setState(e.target.value)}>
                    <option value="">Select State</option>
                    {INDIA_STATE_NAMES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </FormField>

                <FormField label="City / District" id="city" required error={fieldErrors.city}>
                  <input
                    id="city"
                    type="text"
                    className={darkInput}
                    placeholder="e.g. Mumbai"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="PIN Code" id="pincode" required error={fieldErrors.pincode}>
                  <input
                    id="pincode"
                    type="text"
                    className={`${darkInput} font-mono`}
                    placeholder="400001"
                    maxLength={6}
                    value={pincode}
                    onChange={e => setPincode(e.target.value.replace(/\D/g, ""))}
                  />
                </FormField>

                <FormField label="Area Locality" id="locality" required>
                  <select id="locality" className={darkSelect} value={locality} onChange={e => setLocality(e.target.value)}>
                    <option value="urban">Urban (City)</option>
                    <option value="rural">Rural (Village / Town)</option>
                  </select>
                </FormField>
              </div>
            </div>
          )}

          {/* ── STEP 3: Equipment & Accents ── */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-white mb-2 pb-2 border-b border-neutral-800/80">
                3. Equipment & Dialect
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Microphone Brand" id="micBrand" required error={fieldErrors.micBrand}>
                  <input
                    id="micBrand"
                    type="text"
                    className={darkInput}
                    placeholder="e.g. Apple / Samsung / Boat"
                    value={micBrand}
                    onChange={e => setMicBrand(e.target.value)}
                  />
                </FormField>
                <FormField label="Microphone Model" id="micModel" required error={fieldErrors.micModel}>
                  <input
                    id="micModel"
                    type="text"
                    className={darkInput}
                    placeholder="e.g. Built-in Mic / Earphones"
                    value={micModel}
                    onChange={e => setMicModel(e.target.value)}
                  />
                </FormField>
              </div>

              <FormField label="Accent Description" id="accent" required error={fieldErrors.accent}>
                <input
                  id="accent"
                  type="text"
                  className={darkInput}
                  placeholder="e.g. Neutral Indian, North Indian"
                  value={accent}
                  onChange={e => setAccent(e.target.value)}
                />
              </FormField>

              <FormField label="Dialect" id="dialect" required error={fieldErrors.dialect}>
                <input
                  id="dialect"
                  type="text"
                  className={darkInput}
                  placeholder="e.g. Standard Hindi, Bhojpuri, Awadhi"
                  value={dialect}
                  onChange={e => setDialect(e.target.value)}
                />
              </FormField>

              <div className="bg-primary-500/10 border border-primary-500/30 rounded-xl p-3 mt-2">
                <p className="text-xs text-primary-300 flex items-start gap-2">
                  <span className="text-base leading-none">ℹ️</span>
                  <span>This helps matching you with regional audio tasks. Any standard earphone or phone mic is acceptable.</span>
                </p>
              </div>
            </div>
          )}

          {/* ── STEP 4: Email OTP ── */}
          {step === 4 && (
            <form onSubmit={onSubmit}>
              <div className="space-y-5">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 bg-primary-500/10 border border-primary-500/30 rounded-2xl mb-3 text-primary-400">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-white">Verify Your Email</h2>
                  <p className="text-xs text-neutral-400 mt-1">
                    We sent a 6-digit OTP to<br />
                    <span className="font-mono font-semibold text-primary-300">{email}</span>
                  </p>
                </div>

                <FormField label="Enter 6-Digit OTP" id="otp" required error={fieldErrors.otp}>
                  <input
                    id="otp"
                    type="text"
                    className={`${darkInput} text-center text-2xl font-mono tracking-widest`}
                    placeholder="— — — — — —"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </FormField>

                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 flex items-start gap-2">
                  <span className="text-base leading-none">⚠️</span>
                  <span>If you don't find the OTP in your inbox, make sure to check your <strong>SPAM</strong> folder.</span>
                </div>

                <p className="text-xs text-neutral-500 text-center">OTP expires in 10 minutes</p>

                {/* Resend */}
                <div className="text-center">
                  {resendCooldown > 0 ? (
                    <span className="text-xs text-neutral-500">Resend OTP in {resendCooldown}s</span>
                  ) : (
                    <button
                      type="button"
                      onClick={sendOtp}
                      disabled={loading}
                      className="text-xs text-primary-400 hover:text-primary-300 font-semibold transition-colors"
                    >
                      Resend OTP
                    </button>
                  )}
                </div>

                {globalError && (
                  <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 px-4 py-3 rounded-xl text-xs font-medium animate-scale-in">
                    {globalError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="w-full py-3.5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-primary-600/25 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Creating Account...
                    </span>
                  ) : (
                    "Verify & Create Account →"
                  )}
                </button>

                <p className="text-[11px] text-neutral-500 text-center leading-relaxed">
                  By clicking Verify & Create Account, you agree to Voclara's{" "}
                  <a href="/Legal/Voclara-ToS.html" target="_blank" rel="noopener noreferrer" className="text-primary-400 underline hover:text-primary-300">
                    Terms of Service
                  </a>{" "}and{" "}
                  <a href="/Legal/Voclara-Privacy-Policy.html" target="_blank" rel="noopener noreferrer" className="text-primary-400 underline hover:text-primary-300">
                    Privacy Policy
                  </a>.
                </p>
              </div>
            </form>
          )}

          {/* ── Errors (steps 1-3) ── */}
          {step < 4 && globalError && (
            <div className="mt-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 px-4 py-3 rounded-xl text-xs font-medium animate-scale-in">
              {globalError}
            </div>
          )}

          {/* ── Step navigation (steps 1-3) ── */}
          {step < 4 && (
            <div className={`mt-6 flex items-center ${step > 1 ? "justify-between" : "justify-end"} pt-3 border-t border-neutral-800/80`}>
              {step > 1 && (
                <button
                  type="button"
                  onClick={goBack}
                  className="px-5 py-2.5 rounded-xl border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white text-xs font-semibold transition-all"
                >
                  ← Back
                </button>
              )}
              <button
                type="button"
                onClick={goNext}
                disabled={loading}
                className="px-8 py-2.5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-md shadow-primary-600/25 transition-all disabled:opacity-50"
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
                  "Next Step →"
                )}
              </button>
            </div>
          )}

          {/* ── Sign in link ── */}
          <div className="mt-6 text-center border-t border-neutral-800/80 pt-4">
            <p className="text-xs text-neutral-400">
              Already have an account?{" "}
              <Link to="/login" className="text-primary-400 hover:text-primary-300 font-semibold transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
