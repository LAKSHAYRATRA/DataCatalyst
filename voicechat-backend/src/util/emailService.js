import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "../config/s3.js";

const GMAIL_USER = process.env.GMAIL_USER || "";
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || "";

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
    },
});

/**
 * Generate a random 6-digit OTP string.
 */
export function generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Send an OTP email.
 * @param {string} to  - Recipient email
 * @param {string} otp - 6-digit OTP code
 * @param {'signup'|'login'} purpose
 */
export async function sendOtpEmail(to, otp, purpose = "signup") {
    const subject =
        purpose === "signup"
            ? "Verify your Voclara account"
            : "Your Voclara login OTP";

    const action =
        purpose === "signup"
            ? "complete your account registration"
            : "sign in to your account";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center;">
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;text-align:center;line-height:56px;margin:0 auto 12px auto;display:block;">
                <span style="font-size:28px;line-height:56px;vertical-align:middle;">🎙️</span>
              </div>
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Voclara</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Professional Audio Platform</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <h2 style="margin:0 0 8px;color:#f1f5f9;font-size:20px;font-weight:600;">Your Verification Code</h2>
              <p style="margin:0 0 28px;color:#94a3b8;font-size:14px;line-height:1.6;">
                Use the code below to ${action}. It expires in <strong style="color:#a5b4fc;">10 minutes</strong>.
              </p>
              <!-- OTP Box -->
              <div style="background:#0f172a;border:2px solid #6366f1;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
                <span style="font-size:42px;font-weight:800;letter-spacing:12px;color:#818cf8;font-family:monospace;">${otp}</span>
              </div>
              <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;text-align:center;">
                If you didn't request this, you can safely ignore this email.<br/>
                Do not share this code with anyone.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#0f172a;padding:16px 40px;text-align:center;">
              <p style="margin:0;color:#475569;font-size:11px;">© 2026 Voclara. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await transporter.sendMail({
        from: `"Voclara" <${GMAIL_USER}>`,
        to,
        subject,
        html,
    });
}

/**
 * Send a password reset email.
 * @param {string} to - Recipient email
 * @param {string} resetUrl - URL to reset password (includes token)
 */
export async function sendResetPasswordEmail(to, resetUrl) {
    const subject = "Reset your Voclara password";
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center;">
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;text-align:center;line-height:56px;margin:0 auto 12px auto;display:block;">
                <span style="font-size:28px;line-height:56px;vertical-align:middle;">🎙️</span>
              </div>
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Voclara</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Professional Audio Platform</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <h2 style="margin:0 0 8px;color:#f1f5f9;font-size:20px;font-weight:600;">Password Reset Request</h2>
              <p style="margin:0 0 28px;color:#94a3b8;font-size:14px;line-height:1.6;">
                We received a request to reset your password. Click the button below to choose a new one. This link expires in <strong style="color:#a5b4fc;">1 hour</strong>.
              </p>
              <!-- Button -->
              <div style="text-align:center;margin-bottom:28px;">
                <a href="${resetUrl}" style="background:#6366f1;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block;box-shadow:0 4px 12px rgba(99,102,241,0.3);">Reset Password</a>
              </div>
              <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;text-align:center;">
                If you didn't request this, you can safely ignore this email.<br/>
                Or copy and paste this link in your browser:<br/>
                <span style="color:#6366f1;word-break:break-all;">${resetUrl}</span>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#0f172a;padding:16px 40px;text-align:center;">
              <p style="margin:0;color:#475569;font-size:11px;">© 2026 Voclara. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await transporter.sendMail({
        from: `"Voclara" <${GMAIL_USER}>`,
        to,
        subject,
        html,
    });
}

/**
 * Send an agreement rejection email with the admin's reason.
 */
export async function sendAgreementRejectionEmail(to, firstName, reason) {
    const subject = "Action required — please re-sign your Voclara Contributor Agreement";
    const safeReason = String(reason || "").trim() || "No reason provided.";
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center;">
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;text-align:center;line-height:56px;margin:0 auto 12px auto;display:block;">
                <span style="font-size:28px;line-height:56px;vertical-align:middle;">📝</span>
              </div>
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Voclara</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Contributor Agreement Review</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px;">
              <h2 style="margin:0 0 8px;color:#f1f5f9;font-size:20px;font-weight:600;">Hi ${firstName || "there"},</h2>
              <p style="margin:0 0 20px;color:#94a3b8;font-size:14px;line-height:1.6;">
                Your Contributor Agreement submission was reviewed by our team and could not be accepted as submitted. You'll need to re-sign the agreement before continuing.
              </p>
              <div style="background:#0f172a;border-left:4px solid #6366f1;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
                <p style="margin:0 0 6px;color:#818cf8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Reason from reviewer</p>
                <p style="margin:0;color:#e2e8f0;font-size:14px;line-height:1.6;">${safeReason.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
              </div>
              <p style="margin:0 0 24px;color:#94a3b8;font-size:14px;line-height:1.6;">
                Log in to Voclara and re-sign the Contributor Agreement to continue. The reason above will also be shown on the page.
              </p>
              <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;text-align:center;">
                Questions? Reply to this email or contact grievances@datacatalyst.in.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#0f172a;padding:16px 40px;text-align:center;">
              <p style="margin:0;color:#475569;font-size:11px;">© 2026 Voclara. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await transporter.sendMail({
        from: `"Voclara" <${GMAIL_USER}>`,
        to,
        subject,
        html,
    });
}

/**
 * Send an email confirming receipt of the introductory audio recording.
 */
export async function sendIntroSubmissionEmail(to, firstName, lastName) {
    const subject = "Application received — Voclara";
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center;">
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;text-align:center;line-height:56px;margin:0 auto 12px auto;display:block;">
                <span style="font-size:28px;line-height:56px;vertical-align:middle;">🎙️</span>
              </div>
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Voclara</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Professional Audio Platform</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <h2 style="margin:0 0 16px;color:#f1f5f9;font-size:20px;font-weight:600;">Dear ${firstName} ${lastName},</h2>
              <p style="margin:0 0 16px;color:#e2e8f0;font-size:14px;line-height:1.6;">
                Your application for contributing on <a href="https://voclara.com" style="color:#818cf8;text-decoration:none;font-weight:600;">voclara.com</a> has been received.
              </p>
              <p style="margin:0 0 28px;color:#94a3b8;font-size:14px;line-height:1.6;">
                The audio sample will be reviewed by our QA team.
              </p>
              <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;text-align:center;border-top:1px solid #334155;padding-top:20px;">
                Thank you for applying to be a contributor!
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#0f172a;padding:16px 40px;text-align:center;">
              <p style="margin:0;color:#475569;font-size:11px;">© 2026 Voclara. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await transporter.sendMail({
        from: `"Voclara" <${GMAIL_USER}>`,
        to,
        subject,
        html,
    });
}

/**
 * Send an email congratulating the user on approval and prompting them to sign the contract.
 */
export async function sendIntroApprovalEmail(to, firstName) {
    const subject = "Application approved — Complete your Voclara onboarding";
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center;">
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;text-align:center;line-height:56px;margin:0 auto 12px auto;display:block;">
                <span style="font-size:28px;line-height:56px;vertical-align:middle;">🎉</span>
              </div>
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Voclara</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Professional Audio Platform</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <h2 style="margin:0 0 16px;color:#f1f5f9;font-size:20px;font-weight:600;">Congratulations ${firstName}!</h2>
              <p style="margin:0 0 16px;color:#e2e8f0;font-size:14px;line-height:1.6;">
                Your voice sample application has been approved by our QA team.
              </p>
              <p style="margin:0 0 24px;color:#94a3b8;font-size:14px;line-height:1.6;">
                To complete your onboarding and start contributing, please log in to Voclara and sign the Contributor Agreement.
              </p>
              <!-- Button -->
              <div style="text-align:center;margin-bottom:28px;">
                <a href="https://voclara.com/login" style="background:#6366f1;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block;box-shadow:0 4px 12px rgba(99,102,241,0.3);">Sign Agreement</a>
              </div>
              <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;text-align:center;border-top:1px solid #334155;padding-top:20px;">
                We are excited to have you on board!
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#0f172a;padding:16px 40px;text-align:center;">
              <p style="margin:0;color:#475569;font-size:11px;">© 2026 Voclara. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await transporter.sendMail({
        from: `"Voclara" <${GMAIL_USER}>`,
        to,
        subject,
        html,
    });
}

/**
 * Send an email notifying the user of audio sample rejection, prompting them to record a new one.
 */
export async function sendIntroRejectionEmail(to, firstName, reason) {
    const subject = "Action required — Your Voclara contributor application status";
    const safeReason = String(reason || "").trim() || "No reason provided.";
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center;">
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;text-align:center;line-height:56px;margin:0 auto 12px auto;display:block;">
                <span style="font-size:28px;line-height:56px;vertical-align:middle;">🎙️</span>
              </div>
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Voclara</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Professional Audio Platform</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <h2 style="margin:0 0 16px;color:#f1f5f9;font-size:20px;font-weight:600;">Hi ${firstName},</h2>
              <p style="margin:0 0 16px;color:#e2e8f0;font-size:14px;line-height:1.6;">
                Your introductory voice sample application was reviewed by our team and could not be accepted as submitted.
              </p>
              <div style="background:#0f172a;border-left:4px solid #6366f1;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
                <p style="margin:0 0 6px;color:#818cf8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Reason from reviewer</p>
                <p style="margin:0;color:#e2e8f0;font-size:14px;line-height:1.6;">${safeReason.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
              </div>
              <p style="margin:0 0 28px;color:#94a3b8;font-size:14px;line-height:1.6;">
                Please log in to Voclara and record a new voice sample following the instructions to re-apply.
              </p>
              <!-- Button -->
              <div style="text-align:center;margin-bottom:28px;">
                <a href="https://voclara.com/login" style="background:#6366f1;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block;box-shadow:0 4px 12px rgba(99,102,241,0.3);">Record New Sample</a>
              </div>
              <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;text-align:center;border-top:1px solid #334155;padding-top:20px;">
                Thank you for your effort!
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#0f172a;padding:16px 40px;text-align:center;">
              <p style="margin:0;color:#475569;font-size:11px;">© 2026 Voclara. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await transporter.sendMail({
        from: `"Voclara" <${GMAIL_USER}>`,
        to,
        subject,
        html,
    });
}

/**
 * Send an email notifying the user of repeated sample rejection and account deletion.
 */
export async function sendIntroFinalDeletionEmail(to, firstName) {
    const subject = "Application declined — Voclara account closed";
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#ef4444,#b91c1c);padding:32px;text-align:center;">
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;text-align:center;line-height:56px;margin:0 auto 12px auto;display:block;">
                <span style="font-size:28px;line-height:56px;vertical-align:middle;">❌</span>
              </div>
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Voclara</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Professional Audio Platform</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <h2 style="margin:0 0 16px;color:#f1f5f9;font-size:20px;font-weight:600;">Hi ${firstName},</h2>
              <p style="margin:0 0 16px;color:#e2e8f0;font-size:14px;line-height:1.6;">
                Your introductory voice sample application was reviewed by our team and has been rejected for a second time.
              </p>
              <p style="margin:0 0 28px;color:#94a3b8;font-size:14px;line-height:1.6;">
                As per our platform policies, repeated rejection of the introductory voice sample results in application cancellation. Your Voclara account and submitted files have been deleted from our database.
              </p>
              <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;text-align:center;border-top:1px solid #334155;padding-top:20px;">
                Thank you for your interest and your time.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#0f172a;padding:16px 40px;text-align:center;">
              <p style="margin:0;color:#475569;font-size:11px;">© 2026 Voclara. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await transporter.sendMail({
        from: `"Voclara" <${GMAIL_USER}>`,
        to,
        subject,
        html,
    });
}

/**
 * Send an email confirming that the Contributor Agreement has been signed and is under review.
 */
export async function sendAgreementSignedEmail(to, firstName) {
    const subject = "Contributor Agreement received — Voclara";
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center;">
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;text-align:center;line-height:56px;margin:0 auto 12px auto;display:block;">
                <span style="font-size:28px;line-height:56px;vertical-align:middle;">📝</span>
              </div>
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Voclara</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Professional Audio Platform</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <h2 style="margin:0 0 16px;color:#f1f5f9;font-size:20px;font-weight:600;">Hi ${firstName},</h2>
              <p style="margin:0 0 16px;color:#e2e8f0;font-size:14px;line-height:1.6;">
                We have received your signed Voclara Contributor Agreement.
              </p>
              <p style="margin:0 0 28px;color:#94a3b8;font-size:14px;line-height:1.6;">
                Our admin team will review it shortly. Once approved, you will be notified via email and can begin applying to active voice recording and calling projects.
              </p>
              <!-- Button -->
              <div style="text-align:center;margin-bottom:28px;">
                <a href="https://voclara.com/login" style="background:#6366f1;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block;box-shadow:0 4px 12px rgba(99,102,241,0.3);">Go to Dashboard</a>
              </div>
              <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;text-align:center;border-top:1px solid #334155;padding-top:20px;">
                Thank you for your cooperation!
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#0f172a;padding:16px 40px;text-align:center;">
              <p style="margin:0;color:#475569;font-size:11px;">© 2026 Voclara. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await transporter.sendMail({
        from: `"Voclara" <${GMAIL_USER}>`,
        to,
        subject,
        html,
    });
}

/**
 * Send an email confirming that the Contributor Agreement has been approved, with the PDF attached.
 */
export async function sendAgreementApprovedEmail(to, firstName, s3Key) {
    const subject = "Contributor Agreement approved — Welcome to Voclara!";
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center;">
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;text-align:center;line-height:56px;margin:0 auto 12px auto;display:block;">
                <span style="font-size:28px;line-height:56px;vertical-align:middle;">🏆</span>
              </div>
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Voclara</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Professional Audio Platform</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <h2 style="margin:0 0 16px;color:#f1f5f9;font-size:20px;font-weight:600;">Hi ${firstName},</h2>
              <p style="margin:0 0 16px;color:#e2e8f0;font-size:14px;line-height:1.6;">
                Great news! Your signed Voclara Contributor Agreement has been approved by our admin team.
              </p>
              <p style="margin:0 0 28px;color:#94a3b8;font-size:14px;line-height:1.6;">
                A copy of your signed agreement has been attached to this email. You are now fully onboarded as a Voclara Contributor! You can log in to your dashboard to start applying to active voice recording and calling projects.
              </p>
              <!-- Button -->
              <div style="text-align:center;margin-bottom:28px;">
                <a href="https://voclara.com/login" style="background:#6366f1;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block;box-shadow:0 4px 12px rgba(99,102,241,0.3);">Explore Projects</a>
              </div>
              <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;text-align:center;border-top:1px solid #334155;padding-top:20px;">
                Welcome to the team!
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#0f172a;padding:16px 40px;text-align:center;">
              <p style="margin:0;color:#475569;font-size:11px;">© 2026 Voclara. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const attachments = [];
    if (s3Key) {
        if (s3Key.startsWith("local:")) {
            const localFileName = s3Key.replace("local:", "");
            const localFilePath = path.join(process.cwd(), "recordings", "agreements", localFileName);
            if (fs.existsSync(localFilePath)) {
                attachments.push({
                    filename: "Voclara-Contributor-Agreement.pdf",
                    path: localFilePath,
                    contentType: "application/pdf"
                });
            }
        } else {
            // Stream from S3
            try {
                const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key });
                const s3Doc = await s3Client.send(command);
                attachments.push({
                    filename: "Voclara-Contributor-Agreement.pdf",
                    content: s3Doc.Body,
                    contentType: "application/pdf"
                });
            } catch (err) {
                console.error("Failed to fetch agreement PDF from S3 for email attachment:", err.message);
                const baseName = path.basename(s3Key);
                const fallbackPath = path.join(process.cwd(), "recordings", "agreements", baseName);
                if (fs.existsSync(fallbackPath)) {
                    attachments.push({
                        filename: "Voclara-Contributor-Agreement.pdf",
                        path: fallbackPath,
                        contentType: "application/pdf"
                    });
                }
            }
        }
    }

    await transporter.sendMail({
        from: `"Voclara" <${GMAIL_USER}>`,
        to,
        subject,
        html,
        attachments,
    });
}

/**
 * Send an email confirming receipt of a project (language) application.
 */
export async function sendProjectApplicationReceivedEmail(to, firstName, languageName, projectType) {
    const subject = `Project application received — Voclara`;
    const typeLabel = projectType === "call" ? "Calling" : "Phrase Recording";
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center;">
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;text-align:center;line-height:56px;margin:0 auto 12px auto;display:block;">
                <span style="font-size:28px;line-height:56px;vertical-align:middle;">📁</span>
              </div>
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Voclara</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Professional Audio Platform</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <h2 style="margin:0 0 16px;color:#f1f5f9;font-size:20px;font-weight:600;">Hi ${firstName},</h2>
              <p style="margin:0 0 16px;color:#e2e8f0;font-size:14px;line-height:1.6;">
                We have received your application for the **${languageName} ${typeLabel}** project.
              </p>
              <p style="margin:0 0 28px;color:#94a3b8;font-size:14px;line-height:1.6;">
                Our QA team will review your application audio sample shortly. Once reviewed, you will be notified of the decision via email.
              </p>
              <!-- Button -->
              <div style="text-align:center;margin-bottom:28px;">
                <a href="https://voclara.com/login" style="background:#6366f1;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block;box-shadow:0 4px 12px rgba(99,102,241,0.3);">Go to Dashboard</a>
              </div>
              <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;text-align:center;border-top:1px solid #334155;padding-top:20px;">
                Thank you for applying!
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#0f172a;padding:16px 40px;text-align:center;">
              <p style="margin:0;color:#475569;font-size:11px;">© 2026 Voclara. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await transporter.sendMail({
        from: `"Voclara" <${GMAIL_USER}>`,
        to,
        subject,
        html,
    });
}

/**
 * Send an email confirming that a project (language) application has been approved.
 */
export async function sendProjectApplicationApprovedEmail(to, firstName, languageName, projectType) {
    const subject = `Project application approved — Voclara`;
    const typeLabel = projectType === "call" ? "Calling" : "Phrase Recording";
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center;">
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;text-align:center;line-height:56px;margin:0 auto 12px auto;display:block;">
                <span style="font-size:28px;line-height:56px;vertical-align:middle;">✓</span>
              </div>
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Voclara</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Professional Audio Platform</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <h2 style="margin:0 0 16px;color:#f1f5f9;font-size:20px;font-weight:600;">Hi ${firstName},</h2>
              <p style="margin:0 0 16px;color:#e2e8f0;font-size:14px;line-height:1.6;">
                Congratulations! Your application for the **${languageName} ${typeLabel}** project has been approved.
              </p>
              <p style="margin:0 0 28px;color:#94a3b8;font-size:14px;line-height:1.6;">
                You can now log in to Voclara and start recording tasks for this project immediately!
              </p>
              <!-- Button -->
              <div style="text-align:center;margin-bottom:28px;">
                <a href="https://voclara.com/login" style="background:#6366f1;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block;box-shadow:0 4px 12px rgba(99,102,241,0.3);">Start Earning</a>
              </div>
              <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;text-align:center;border-top:1px solid #334155;padding-top:20px;">
                Thank you for contributing!
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#0f172a;padding:16px 40px;text-align:center;">
              <p style="margin:0;color:#475569;font-size:11px;">© 2026 Voclara. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await transporter.sendMail({
        from: `"Voclara" <${GMAIL_USER}>`,
        to,
        subject,
        html,
    });
}

/**
 * Send an email notifying that a project (language) application has been rejected.
 */
export async function sendProjectApplicationRejectedEmail(to, firstName, languageName, projectType) {
    const subject = `Application update — Voclara project status`;
    const typeLabel = projectType === "call" ? "Calling" : "Phrase Recording";
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center;">
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;text-align:center;line-height:56px;margin:0 auto 12px auto;display:block;">
                <span style="font-size:28px;line-height:56px;vertical-align:middle;">🔄</span>
              </div>
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Voclara</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Professional Audio Platform</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <h2 style="margin:0 0 16px;color:#f1f5f9;font-size:20px;font-weight:600;">Hi ${firstName},</h2>
              <p style="margin:0 0 16px;color:#e2e8f0;font-size:14px;line-height:1.6;">
                Your application for the **${languageName} ${typeLabel}** project has been reviewed and was not approved.
              </p>
              <p style="margin:0 0 28px;color:#94a3b8;font-size:14px;line-height:1.6;">
                You are welcome to record a new sample and apply again for this project from the dashboard.
              </p>
              <!-- Button -->
              <div style="text-align:center;margin-bottom:28px;">
                <a href="https://voclara.com/login" style="background:#6366f1;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block;box-shadow:0 4px 12px rgba(99,102,241,0.3);">Try Again</a>
              </div>
              <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;text-align:center;border-top:1px solid #334155;padding-top:20px;">
                Thank you for your effort!
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#0f172a;padding:16px 40px;text-align:center;">
              <p style="margin:0;color:#475569;font-size:11px;">© 2026 Voclara. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await transporter.sendMail({
        from: `"Voclara" <${GMAIL_USER}>`,
        to,
        subject,
        html,
    });
}






