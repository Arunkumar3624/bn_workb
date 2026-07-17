import { ApiError } from "../utils/ApiError.js";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";

function requireEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.OTP_FROM_EMAIL;

  if (!apiKey || !from) {
    throw ApiError.internal("OTP email delivery is not configured.");
  }

  return { apiKey, from };
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
  const { apiKey, from } = requireEmailConfig();
  const safeCode = escapeHtml(otpCode);

  const response = await fetch(RESEND_EMAILS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "WorkBridge OTP/1.0",
    },
    body: JSON.stringify({
      from,
      to: [to],
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
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("[email:otp] Resend delivery failed:", result);
    throw ApiError.internal("Could not send the verification email.");
  }

  return result;
}
