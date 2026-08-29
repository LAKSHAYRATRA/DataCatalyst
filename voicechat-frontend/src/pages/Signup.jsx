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

function FormField({ label, id, required, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-neutral-700 mb-1">
        {label} {required && <span className="text-error-500">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-error-500 mt-1">{error}</p>}
    </div>
  );
}

export default function Signup() {
  const navigate = useNavigate();
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
      });
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
                <input id="email" type="email" className={inputClass} placeholder="john@example.com"
                  value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
              </FormField>

              <FormField label="Mobile Number (10 Digits)" id="mobileNumber" required error={fieldErrors.mobileNumber}>
                <div className="relative flex rounded-xl shadow-sm">
                  <span className="inline-flex items-center px-3.5 rounded-l-xl border border-r-0 border-neutral-300 bg-neutral-100 text-neutral-600 text-sm font-bold">
                    🇮🇳 +91
                  </span>
                  <input
                    id="mobileNumber"
                    type="tel"
                    maxLength={10}
                    className="input w-full rounded-l-none font-mono tracking-wider"
                    placeholder="9876543210"
                    value={mobileNumber}
                    onChange={e => setMobileNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                  />
                </div>
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Password" id="password" required error={fieldErrors.password}>
                  <input id="password" type="password" className={inputClass} placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)} />
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

                <FormField label="Primary Language" id="regionalLanguage" required error={fieldErrors.regionalLanguage}>
                  <select id="regionalLanguage" className={selectClass} value={regionalLanguage} onChange={e => setRegionalLanguage(e.target.value)}>
                    <option value="">Select language</option>
                    {REGIONAL_LANGUAGES.map(lang => (
                      <option key={lang} value={lang}>{lang}</option>
                    ))}
                  </select>
                </FormField>
              </div>

              <FormField label="Date of Birth" id="dob" required error={fieldErrors.dob}>
                <input id="dob" type="date" className={inputClass} value={dob} onChange={e => setDob(e.target.value)} max={new Date().toISOString().split("T")[0]} />
              </FormField>
            </div>
          )}

          {/* ── STEP 2: Address Info ── */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-neutral-800 mb-1">Address Details</h2>

              <FormField label="Street Address" id="street" required error={fieldErrors.street}>
                <input id="street" type="text" className={inputClass} placeholder="123 Main St, Apt 4B"
                  value={street} onChange={e => setStreet(e.target.value)} />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="State" id="state" required error={fieldErrors.state}>
                  <select id="state" className={selectClass} value={state} onChange={e => setState(e.target.value)}>
                    <option value="">Select State</option>
                    {INDIA_STATE_NAMES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </FormField>

                <FormField label="City / District" id="city" required error={fieldErrors.city}>
                  <input id="city" type="text" className={inputClass} placeholder="e.g. Mumbai"
                    value={city} onChange={e => setCity(e.target.value)} />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Pincode" id="pincode" required error={fieldErrors.pincode}>
                  <input id="pincode" type="text" className={inputClass} placeholder="400001"
                    maxLength={6} value={pincode} onChange={e => setPincode(e.target.value.replace(/\D/g, ""))} />
                </FormField>

                <FormField label="Area Locality" id="locality" required>
                  <select id="locality" className={selectClass} value={locality} onChange={e => setLocality(e.target.value)}>
                    <option value="urban">Urban</option>
                    <option value="rural">Rural</option>
                  </select>
                </FormField>
              </div>
            </div>
          )}

          {/* ── STEP 3: Equipment & Accents ── */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-neutral-800 mb-1">Equipment & Accent</h2>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Microphone Brand" id="micBrand" required error={fieldErrors.micBrand}>
                  <input id="micBrand" type="text" className={inputClass} placeholder="e.g. Realtek / Apple"
                    value={micBrand} onChange={e => setMicBrand(e.target.value)} />
                </FormField>
                <FormField label="Microphone Model" id="micModel" required error={fieldErrors.micModel}>
                  <input id="micModel" type="text" className={inputClass} placeholder="e.g. Built-in / AirPods"
                    value={micModel} onChange={e => setMicModel(e.target.value)} />
                </FormField>
              </div>

              <FormField label="Accent Description" id="accent" required error={fieldErrors.accent}>
                <input id="accent" type="text" className={inputClass} placeholder="e.g. Neutral Indian, North Indian"
                  value={accent} onChange={e => setAccent(e.target.value)} />
              </FormField>

              <FormField label="Dialect" id="dialect" required error={fieldErrors.dialect}>
                <input id="dialect" type="text" className={inputClass} placeholder="e.g. Standard Hindi"
                  value={dialect} onChange={e => setDialect(e.target.value)} />
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

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
                  <span className="text-base leading-none">⚠️</span>
                  <span>If you don't find the OTP in your inbox, make sure to check the <strong>SPAM</strong> folder of your mail.</span>
                </div>

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

                <p className="text-xs text-neutral-500 text-center leading-relaxed">
                  By clicking Verify & Create Account, you agree to Voclara's{" "}
                  <a href="/Legal/Voclara-ToS.html" target="_blank" rel="noopener noreferrer" className="text-primary-600 underline hover:text-primary-700">
                    Terms of Service
                  </a>{" "}and{" "}
                  <a href="/Legal/Voclara-Privacy-Policy.html" target="_blank" rel="noopener noreferrer" className="text-primary-600 underline hover:text-primary-700">
                    Privacy Policy
                  </a>. Voice sample consent is captured separately before recording.
                </p>
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
