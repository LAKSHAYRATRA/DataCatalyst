import nodemailer from "nodemailer";

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
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
                <span style="font-size:28px;">🎙️</span>
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
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
                <span style="font-size:28px;">🎙️</span>
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
            <td style="background:linear-gradient(135deg,#f59e0b,#ef4444);padding:32px;text-align:center;">
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
                <span style="font-size:28px;">📝</span>
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
              <div style="background:#0f172a;border-left:4px solid #ef4444;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
                <p style="margin:0 0 6px;color:#f59e0b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Reason from reviewer</p>
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
