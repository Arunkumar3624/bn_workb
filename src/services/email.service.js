import nodemailer from "nodemailer";
import { ApiError } from "../utils/ApiError.js";

let transporter = null;

// Lazily created and memoized — importing this module never throws even if
// SMTP env vars are absent (mirrors the old requireEmailConfig() gate,
// which only threw when actually called, not at import time).
function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, OTP_FROM_EMAIL } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !OTP_FROM_EMAIL) return null;

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465, // 465 = implicit TLS; 587/2525 = STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      // Nodemailer's defaults leave a failed connection attempt hanging for
      // ~2 minutes before giving up — a terrible wait for a registration
      // form. Fail fast instead; a real SMTP server responds in seconds.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transporter;
}

// The caller (auth.controller.js) decides what "not configured" means —
// console-log fallback in dev, hard failure in production — same shape as
// the old inline `RESEND_API_KEY && OTP_FROM_EMAIL` check.
export function isEmailConfigured() {
  return getTransporter() !== null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendOtpEmail({ to, otpCode, expiresInMinutes }) {
  const transport = getTransporter();
  if (!transport) throw ApiError.internal("OTP email delivery is not configured.");
  const safeCode = escapeHtml(otpCode);

  try {
    await transport.sendMail({
      from: process.env.OTP_FROM_EMAIL,
      to,
      subject: "Your WorkBridge verification code",
      text: `Your WorkBridge verification code is ${otpCode}. It expires in ${expiresInMinutes} minutes.`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
          <p>Your WorkBridge verification code is:</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:18px 0">${safeCode}</p>
          <p>This code expires in ${expiresInMinutes} minutes.</p>
          <p>If you did not request this code, you can ignore this email.</p>
        </div>
      `,
    });
  } catch (err) {
    console.error("[email:otp] SMTP delivery failed:", err);
    throw ApiError.internal("Could not send the verification email.");
  }
}
