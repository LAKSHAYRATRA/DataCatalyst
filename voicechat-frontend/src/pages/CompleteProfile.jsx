import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getUserInfo, setUserInfo, clearToken } from "../lib/auth";
import { apiPostJson } from "../lib/api";
import { REGIONAL_LANGUAGES } from "../lib/regionalLanguages";
import { INDIA_STATES, INDIA_STATE_NAMES } from "../lib/indiaData";
import {
  UserCheck,
  MapPin,
  Mic,
  ArrowRight,
  LogOut,
  AlertCircle
} from "lucide-react";

const TOTAL_STEPS = 3;

function ProgressBar({ step }) {
  const steps = ["Personal", "Address", "Equipment"];
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        {steps.map((label, i) => {
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

export default function CompleteProfile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(getUserInfo());

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  // Form State — completely empty by default
  const [firstname, setFirstname] = useState(
    (user?.firstname && user.firstname !== "Contributor" && !user.email?.startsWith(user.firstname)) ? user.firstname : ""
  );
  const [lastname, setLastname] = useState(user?.lastname || "");
  const [mobileNumber, setMobileNumber] = useState(user?.mobileNumber || user?.phone || "");
  const [dob, setDob] = useState(user?.dob ? new Date(user.dob).toISOString().split("T")[0] : "");
  const [gender, setGender] = useState(user?.gender || "");
  const [regionalLanguage, setRegionalLanguage] = useState(user?.regionalLanguage || "");

  // Step 2: Address Details
  const [street, setStreet] = useState(user?.address?.street || "");
  const [state, setState] = useState(user?.address?.state || "");
  const [city, setCity] = useState(user?.address?.city || "");
  const [pincode, setPincode] = useState(user?.address?.pincode || "");
  const [locality, setLocality] = useState(user?.locality || "urban");

  // Step 3: Equipment & Accents
  const [microphoneBrand, setMicrophoneBrand] = useState(user?.microphoneBrand || "");
  const [microphoneModel, setMicrophoneModel] = useState(user?.microphoneModel || "");
  const [accent, setAccent] = useState(user?.accent || "");
  const [dialect, setDialect] = useState(user?.dialect || "");

  const [cities, setCities] = useState([]);

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    if (user.isProfileComplete) {
      if (user.accountStatus === "pending_intro" || user.accountStatus === "rejected") {
        navigate("/intro-recording", { replace: true });
      } else if (user.accountStatus === "pending_approval") {
        navigate("/pending-approval", { replace: true });
      } else {
        navigate("/call", { replace: true });
      }
    }
  }, [user, navigate]);

  // Update cities whenever state changes
  useEffect(() => {
    if (state && INDIA_STATES[state]) {
      const stateCities = INDIA_STATES[state];
      setCities(stateCities);
      if (!city || !stateCities.includes(city)) {
        setCity(stateCities[0] || "");
      }
    } else {
      setCities([]);
    }
  }, [state]);

  const handleLogout = async () => {
    await clearToken();
    navigate("/login", { replace: true });
  };

  // ─── Step Navigation & Validation ──────────────────────────────────────────
  const goNext = () => {
    setGlobalError("");
    setFieldErrors({});

    if (step === 1) {
      const errors = {};
      if (!firstname.trim()) errors.firstname = "First name is required";
      if (!lastname.trim()) errors.lastname = "Last name is required";

      const cleanMobile = mobileNumber.replace(/[^0-9]/g, "");
      if (!cleanMobile) errors.mobileNumber = "Mobile number is required";
      else if (cleanMobile.length !== 10) errors.mobileNumber = "Enter a valid 10-digit mobile number";

      if (!gender) errors.gender = "Please select your gender";
      if (!regionalLanguage) errors.regionalLanguage = "Please select your primary native language";

      if (!dob) {
        errors.dob = "Date of birth is required";
      } else {
        const birthDate = new Date(dob);
        if (Number.isNaN(birthDate.getTime())) {
          errors.dob = "Please enter a valid date of birth";
        } else {
          const today = new Date();
          let age = today.getFullYear() - birthDate.getFullYear();
          const m = today.getMonth() - birthDate.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
          if (age < 18) errors.dob = "You must be at least 18 years old to contribute to Voclara projects";
          if (age > 65) errors.dob = "Age must be under 65 years";
        }
      }

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
    }

    if (step === 2) {
      const errors = {};
      if (!street.trim()) errors.street = "Street / Area address is required";
      if (!state.trim()) errors.state = "Please select a state";
      if (!city.trim()) errors.city = "City is required";
      if (!pincode.trim()) errors.pincode = "PIN code is required";
      else if (!/^\d{6}$/.test(pincode.trim())) errors.pincode = "Enter a valid 6-digit PIN code";

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
    }

    setFieldErrors({});
    setStep((s) => s + 1);
  };

  const goBack = () => {
    setGlobalError("");
    setFieldErrors({});
    setStep((s) => s - 1);
  };

  // ─── Final Step Submit ─────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setGlobalError("");
    setFieldErrors({});

    const errors = {};
    if (!microphoneBrand.trim()) errors.microphoneBrand = "Microphone brand is required";
    if (!microphoneModel.trim()) errors.microphoneModel = "Microphone model is required";
    if (!accent.trim()) errors.accent = "Accent is required";
    if (!dialect.trim()) errors.dialect = "Dialect is required";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        firstname: firstname.trim(),
        lastname: lastname.trim(),
        dob,
        gender,
        mobileNumber: mobileNumber.replace(/[^0-9]/g, ""),
        regionalLanguage,
        locality,
        address: {
          street: street.trim(),
          city: city.trim(),
          state: state.trim(),
          pincode: pincode.trim(),
        },
        microphoneBrand: microphoneBrand.trim(),
        microphoneModel: microphoneModel.trim(),
        accent: accent.trim(),
        dialect: dialect.trim(),
      };

      const res = await apiPostJson("/api/user/complete-profile", payload);
      if (res?.user) {
        setUserInfo(res.user);
        setUser(res.user);
        navigate("/intro-recording", { replace: true });
      }
    } catch (err) {
      console.error("Profile completion error:", err);
      setGlobalError(err?.body?.error || err.message || "Failed to save profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const darkInput = "w-full px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition-all";
  const darkSelect = "w-full px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-white focus:outline-none focus:border-primary-500 cursor-pointer";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-primary-500 selection:text-white relative overflow-hidden">
      {/* Background Ambient Glows */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -left-32 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Navbar */}
      <header className="bg-neutral-900/80 border-b border-neutral-800 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center p-1 shadow-md shadow-black/40">
              <img src="/logo.png" alt="Voclara Logo" className="w-7 h-7 object-contain" />
            </div>
            <div>
              <span className="font-extrabold text-white text-base tracking-tight">Voclara</span>
              <span className="text-[11px] text-neutral-400 block -mt-0.5">Contributor Onboarding</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-400 hidden sm:inline font-mono">{user?.email}</span>
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

      {/* Main Content Form */}
      <main className="flex-1 max-w-2xl mx-auto px-4 sm:px-6 py-8 w-full relative z-10">
        {/* Welcome Card */}
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl animate-slide-up">
          {user?.vendorCode && (
            <div className="mb-6 p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl flex items-center justify-between text-xs text-purple-200">
              <span className="font-medium">
                Registered by Agency Partner: <strong className="font-mono font-bold text-purple-300">{user.vendorCode}</strong>
              </span>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-500/30">
                Direct Contributor
              </span>
            </div>
          )}

          <ProgressBar step={step} />

          {globalError && (
            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs font-medium animate-scale-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{globalError}</span>
            </div>
          )}

          {/* ── STEP 1: Personal Information ── */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-white mb-2 pb-2 border-b border-neutral-800/80 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-primary-400" />
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
                    onChange={(e) => setFirstname(e.target.value)}
                  />
                </FormField>
                <FormField label="Last Name" id="lastname" required error={fieldErrors.lastname}>
                  <input
                    id="lastname"
                    type="text"
                    className={darkInput}
                    placeholder="Doe"
                    value={lastname}
                    onChange={(e) => setLastname(e.target.value)}
                  />
                </FormField>
              </div>

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
                    onChange={(e) => setMobileNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                  />
                </div>
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Gender" id="gender" required error={fieldErrors.gender}>
                  <select
                    id="gender"
                    className={darkSelect}
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </FormField>

                <FormField label="Primary Language" id="regionalLanguage" required error={fieldErrors.regionalLanguage}>
                  <select
                    id="regionalLanguage"
                    className={darkSelect}
                    value={regionalLanguage}
                    onChange={(e) => setRegionalLanguage(e.target.value)}
                  >
                    <option value="">Select language</option>
                    {REGIONAL_LANGUAGES.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
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
                  onChange={(e) => setDob(e.target.value)}
                  max={new Date().toISOString().split("T")[0]}
                />
              </FormField>
            </div>
          )}

          {/* ── STEP 2: Address Details ── */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-white mb-2 pb-2 border-b border-neutral-800/80 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-400" />
                2. Residential Location
              </h2>

              <FormField label="Street Address" id="street" required error={fieldErrors.street}>
                <input
                  id="street"
                  type="text"
                  className={darkInput}
                  placeholder="House/Flat No., Road, Landmark"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="State / UT" id="state" required error={fieldErrors.state}>
                  <select
                    id="state"
                    className={darkSelect}
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                  >
                    <option value="">Select State</option>
                    {INDIA_STATE_NAMES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="City / District" id="city" required error={fieldErrors.city}>
                  {cities.length > 0 ? (
                    <select
                      id="city"
                      className={darkSelect}
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    >
                      <option value="">Select City</option>
                      {cities.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="city"
                      type="text"
                      className={darkInput}
                      placeholder="e.g. Delhi"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  )}
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="PIN Code (6 Digits)" id="pincode" required error={fieldErrors.pincode}>
                  <input
                    id="pincode"
                    type="text"
                    className={`${darkInput} font-mono`}
                    placeholder="110001"
                    maxLength={6}
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
                  />
                </FormField>

                <FormField label="Area Locality" id="locality" required>
                  <select
                    id="locality"
                    className={darkSelect}
                    value={locality}
                    onChange={(e) => setLocality(e.target.value)}
                  >
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
              <h2 className="text-base font-bold text-white mb-2 pb-2 border-b border-neutral-800/80 flex items-center gap-2">
                <Mic className="w-4 h-4 text-purple-400" />
                3. Equipment & Dialect Profile
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Microphone Brand" id="microphoneBrand" required error={fieldErrors.microphoneBrand}>
                  <input
                    id="microphoneBrand"
                    type="text"
                    className={darkInput}
                    placeholder="e.g. Apple / Samsung / Boat"
                    value={microphoneBrand}
                    onChange={(e) => setMicrophoneBrand(e.target.value)}
                  />
                </FormField>
                <FormField label="Microphone Model" id="microphoneModel" required error={fieldErrors.microphoneModel}>
                  <input
                    id="microphoneModel"
                    type="text"
                    className={darkInput}
                    placeholder="e.g. Type-C Earphones / Built-in"
                    value={microphoneModel}
                    onChange={(e) => setMicrophoneModel(e.target.value)}
                  />
                </FormField>
              </div>

              <FormField label="Accent Description" id="accent" required error={fieldErrors.accent}>
                <input
                  id="accent"
                  type="text"
                  className={darkInput}
                  placeholder="e.g. Standard, Neutral, Haryanvi, Bihari"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                />
              </FormField>

              <FormField label="Spoken Dialect" id="dialect" required error={fieldErrors.dialect}>
                <input
                  id="dialect"
                  type="text"
                  className={darkInput}
                  placeholder="e.g. Standard Hindi, Awadhi, Bhojpuri"
                  value={dialect}
                  onChange={(e) => setDialect(e.target.value)}
                />
              </FormField>

              <div className="bg-primary-500/10 border border-primary-500/30 rounded-xl p-3 mt-2">
                <p className="text-xs text-primary-300 flex items-start gap-2">
                  <span className="text-base leading-none">ℹ️</span>
                  <span>This information helps match you with regional audio tasks. Any standard phone mic or earphones is fine.</span>
                </p>
              </div>
            </div>
          )}

          {/* ── Step navigation ── */}
          <div className={`mt-8 flex items-center ${step > 1 ? "justify-between" : "justify-end"} pt-4 border-t border-neutral-800/80`}>
            {step > 1 && (
              <button
                type="button"
                onClick={goBack}
                className="px-5 py-2.5 rounded-xl border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white text-xs font-semibold transition-all"
              >
                ← Back
              </button>
            )}

            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={goNext}
                className="px-8 py-2.5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-md shadow-primary-600/25 transition-all active:scale-[0.99]"
              >
                Next Step →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="px-8 py-2.5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 active:scale-[0.99] text-white font-bold text-xs rounded-xl shadow-md shadow-primary-600/25 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving Profile...</span>
                  </>
                ) : (
                  <>
                    <span>Complete Profile & Proceed</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
