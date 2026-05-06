import bcrypt from "bcryptjs";
import crypto from "crypto";
import { User } from "../models/User.js";
import { Counter } from "../models/Counter.js";
import { OtpCode } from "../models/OtpCode.js";
import { isNonEmptyString, normalizeEmail } from "../util/validators.js";
import { generateOtp, sendOtpEmail, sendResetPasswordEmail } from "../util/emailService.js";
import { signToken } from "../auth.js";

const JWT_SECRET = process.env.JWT_SECRET || "";

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

// POST /api/auth/check-email
export async function checkEmail(req, res) {
  const email = normalizeEmail(req.body?.email);
  if (!isNonEmptyString(email)) {
    return res.status(400).json({ error: "invalid_email" });
  }
  const existing = await User.findOne({ email }).lean();
  res.json({ available: !existing });
}

// POST /api/auth/send-otp
export async function sendOtp(req, res) {
  const email = normalizeEmail(req.body?.email);
  const type = String(req.body?.type || "signup");

  if (!isNonEmptyString(email)) {
    return res.status(400).json({ error: "invalid_email" });
  }
  if (type !== "signup" && type !== "login") {
    return res.status(400).json({ error: "invalid_type" });
  }

  const recent = await OtpCode.findOne({
    email,
    type,
    createdAt: { $gte: new Date(Date.now() - 60 * 1000) },
  });
  if (recent) {
    return res.status(429).json({ error: "otp_too_soon", retryAfter: 60 });
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await OtpCode.create({ email, code, type, expiresAt });

  try {
    await sendOtpEmail(email, code, type);
  } catch (err) {
    console.error("Failed to send OTP email:", err);
    return res.status(500).json({ error: "email_send_failed" });
  }

  res.json({ ok: true });
}

// POST /api/auth/verify-otp
export async function verifyOtp(req, res) {
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code || "").trim();
  const type = String(req.body?.type || "signup");

  if (!isNonEmptyString(email) || !isNonEmptyString(code)) {
    return res.status(400).json({ error: "invalid_input" });
  }

  const otp = await OtpCode.findOne({ email, type, used: false })
    .sort({ createdAt: -1 })
    .lean();

  if (!otp) return res.status(400).json({ error: "otp_not_found" });
  if (new Date() > otp.expiresAt) return res.status(400).json({ error: "otp_expired" });
  if (otp.code !== code) return res.status(400).json({ error: "otp_invalid" });

  await OtpCode.updateOne({ _id: otp._id }, { $set: { used: true } });
  res.json({ ok: true });
}

// POST /api/auth/signup
export async function signup(req, res) {
  const firstname = String(req.body?.firstname || "").trim();
  const lastname = String(req.body?.lastname || "").trim();
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const gender = String(req.body?.gender || "").trim();
  const regionalLanguage = String(req.body?.regionalLanguage || "").trim();
  const locality = String(req.body?.locality || "").trim();
  const street = String(req.body?.address?.street || "").trim();
  const state = String(req.body?.address?.state || "").trim();
  const city = String(req.body?.address?.city || "").trim();
  const pincode = String(req.body?.address?.pincode || "").trim();
  const microphoneBrand = String(req.body?.microphoneBrand || "").trim();
  const microphoneModel = String(req.body?.microphoneModel || "").trim();
  const dob = req.body?.dob;
  const otpCode = String(req.body?.otpCode || "").trim();

  if (
    !isNonEmptyString(firstname) ||
    !isNonEmptyString(lastname) ||
    !isNonEmptyString(email) ||
    password.length < 6 ||
    !isNonEmptyString(gender) ||
    !isNonEmptyString(regionalLanguage) ||
    !isNonEmptyString(locality) ||
    !isNonEmptyString(street) ||
    !isNonEmptyString(state) ||
    !isNonEmptyString(city) ||
    !isNonEmptyString(pincode) ||
    !isNonEmptyString(microphoneBrand) ||
    !isNonEmptyString(microphoneModel) ||
    !dob ||
    !isNonEmptyString(otpCode)
  ) {
    return res.status(400).json({ error: "invalid_input" });
  }

  if (!["male", "female", "other"].includes(gender))
    return res.status(400).json({ error: "invalid_gender" });
  if (!["urban", "rural"].includes(locality))
    return res.status(400).json({ error: "invalid_locality" });
  if (!/^\d{6}$/.test(pincode))
    return res.status(400).json({ error: "invalid_pincode" });

  const otp = await OtpCode.findOne({ email, type: "signup", used: false })
    .sort({ createdAt: -1 })
    .lean();
  if (!otp || new Date() > otp.expiresAt || otp.code !== otpCode) {
    return res.status(400).json({ error: "otp_invalid_or_expired" });
  }
  await OtpCode.updateOne({ _id: otp._id }, { $set: { used: true } });

  const existing = await User.findOne({ email }).lean();
  if (existing) return res.status(409).json({ error: "user_exists" });

  const baseUsername = `${firstname.toLowerCase()}${lastname.toLowerCase()}`;
  let username = baseUsername;
  let counter = 1;
  while (await User.findOne({ username }).lean()) {
    username = `${baseUsername}${Math.floor(1000 + Math.random() * 9000)}`;
    counter++;
    if (counter > 10) break;
  }

  const { seq } = await Counter.findOneAndUpdate(
    { _id: "speaker_id" },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  const speaker_id = `spk_${seq}`;

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    firstname,
    lastname,
    username,
    email,
    passwordHash,
    gender,
    regionalLanguage,
    locality,
    address: { street, state, city, pincode },
    microphoneBrand,
    microphoneModel,
    dob: new Date(dob),
    isEmailVerified: true,
    speaker_id,
  });

  const token = signToken(
    { userId: user._id.toString(), tokenVersion: user.tokenVersion || 0 },
    JWT_SECRET
  );

  res.cookie("vc_token", token, cookieOptions());

  res.json({
    user: {
      id: user._id.toString(),
      firstname: user.firstname,
      lastname: user.lastname,
      email: user.email,
      isAdmin: user.isAdmin || false,
      isQA: user.isQA || false,
      qaLanguageCode: user.qaLanguageCode || user.qaLanguageCodes?.[0] || null,
      qaLanguageCodes: user.qaLanguageCodes || [],
      accountStatus: user.accountStatus || "pending_intro",
    },
  });
}

// POST /api/auth/login/initiate
export async function loginInitiate(req, res) {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");

  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    return res.status(400).json({ error: "invalid_input" });
  }

  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ error: "invalid_credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });

  const recent = await OtpCode.findOne({
    email,
    type: "login",
    createdAt: { $gte: new Date(Date.now() - 60 * 1000) },
  });
  if (recent) {
    return res.status(429).json({ error: "otp_too_soon", retryAfter: 60 });
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await OtpCode.create({ email, code, type: "login", expiresAt });

  try {
    await sendOtpEmail(email, code, "login");
  } catch (err) {
    console.error("Failed to send login OTP email:", err);
    return res.status(500).json({ error: "email_send_failed" });
  }

  res.json({ ok: true, otpSent: true });
}

// POST /api/auth/login  — needs io injected; we use a factory
export function makeLogin(io) {
  return async function login(req, res) {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const otpCode = String(req.body?.otpCode || "").trim();

    if (
      !isNonEmptyString(email) ||
      !isNonEmptyString(password) ||
      !isNonEmptyString(otpCode)
    ) {
      return res.status(400).json({ error: "invalid_input" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "invalid_credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });

    const otp = await OtpCode.findOne({ email, type: "login", used: false })
      .sort({ createdAt: -1 })
      .lean();
    if (!otp || new Date() > otp.expiresAt || otp.code !== otpCode) {
      return res.status(400).json({ error: "otp_invalid_or_expired" });
    }
    await OtpCode.updateOne({ _id: otp._id }, { $set: { used: true } });

    if (user.currentSocketId && io.sockets.sockets.has(user.currentSocketId)) {
      const oldSocket = io.sockets.sockets.get(user.currentSocketId);
      oldSocket.emit("force_logout", { reason: "logged_in_elsewhere" });
      oldSocket.disconnect(true);
    }

    const newTokenVersion = (user.tokenVersion || 0) + 1;
    await User.updateOne(
      { _id: user._id },
      { $set: { tokenVersion: newTokenVersion } }
    );
    user.tokenVersion = newTokenVersion;

    const token = signToken(
      { userId: user._id.toString(), tokenVersion: user.tokenVersion },
      JWT_SECRET
    );

    res.cookie("vc_token", token, cookieOptions());

    res.json({
      user: {
        id: user._id.toString(),
        firstname: user.firstname || "",
        lastname: user.lastname || "",
        email: user.email,
        isAdmin: user.isAdmin || false,
        isQA: user.isQA || false,
        qaLanguageCode: user.qaLanguageCode || user.qaLanguageCodes?.[0] || null,
        qaLanguageCodes: user.qaLanguageCodes || [],
        accountStatus: user.accountStatus || "pending_intro",
      },
    });
  };
}

// POST /api/auth/logout
export function logout(req, res) {
  res.clearCookie("vc_token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  });
  res.json({ ok: true });
}

// GET /api/auth/me
export function getMe(req, res) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  res.json({
    user: {
      id: req.user._id,
      firstname: req.user.firstname,
      lastname: req.user.lastname,
      username: req.user.username,
      email: req.user.email,
      isAdmin: req.user.isAdmin || false,
      isQA: req.user.isQA || false,
      qaLanguageCode: req.user.qaLanguageCode || req.user.qaLanguageCodes?.[0] || null,
      qaLanguageCodes: req.user.qaLanguageCodes || [],
      dailyCallLimit: req.user.dailyCallLimit,
      accountStatus: req.user.accountStatus || "pending_intro",
    },
  });
}

// GET /api/me  (legacy)
export async function legacyMe(req, res) {
  const user = await User.findById(req.userId)
    .select("firstname lastname email")
    .lean();
  if (!user) return res.status(404).json({ error: "not_found" });
  res.json({
    user: {
      id: user._id.toString(),
      firstname: user.firstname || "",
      lastname: user.lastname || "",
      email: user.email,
    },
  });
}

// POST /api/auth/forgot-password
export async function forgotPassword(req, res) {
  const email = normalizeEmail(req.body?.email);
  if (!isNonEmptyString(email)) {
    return res.status(400).json({ error: "invalid_email" });
  }

  const user = await User.findOne({ email });
  if (!user) {
    // Return OK even if user doesn't exist to prevent email enumeration
    return res.json({ ok: true });
  }

  const token = crypto.randomBytes(32).toString("hex");
  user.resetPasswordToken = token;
  user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
  await user.save();

  const resetUrl = `${process.env.FRONTEND_ORIGIN || "http://localhost:5173"}/reset-password?token=${token}`;
  
  try {
    await sendResetPasswordEmail(email, resetUrl);
    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to send reset password email:", err);
    res.status(500).json({ error: "email_send_failed" });
  }
}

// POST /api/auth/reset-password
export async function resetPassword(req, res) {
  const token = String(req.body?.token || "");
  const newPassword = String(req.body?.password || "");

  if (!isNonEmptyString(token) || newPassword.length < 6) {
    return res.status(400).json({ error: "invalid_input" });
  }

  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: new Date() },
  });

  if (!user) {
    return res.status(400).json({ error: "token_invalid_or_expired" });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.resetPasswordToken = null;
  user.resetPasswordExpires = null;
  
  // Revoke all existing sessions
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  
  await user.save();

  res.json({ ok: true });
}
