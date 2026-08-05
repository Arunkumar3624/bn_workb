// MSG91 SMS — reserved for the small list of high-value events where a
// push notification alone isn't enough (see events.js for the free,
// unlimited push channel every other real-time event already uses). SMS
// costs money per message and requires a DLT-approved template per message
// type, so this is deliberately NOT a generic "send any text" utility —
// only the three named senders below exist, one per approved template.

const MSG91_API_URL = "https://control.msg91.com/api/v5/flow/";

// Placeholder DLT template IDs — MSG91 issues a real one per approved
// template after DLT registration (see TRAI/DLT compliance note in the
// conversation this shipped from). Swap these for the real IDs once
// approved; nothing else in this file needs to change.
const TEMPLATES = {
  HIRED: "TEMPLATE_ID_HIRED_PLACEHOLDER",
  ESCROW_FUNDED: "TEMPLATE_ID_ESCROW_FUNDED_PLACEHOLDER",
  DEADLINE: "TEMPLATE_ID_DEADLINE_PLACEHOLDER",
};

// MSG91 requires the bare 91-prefixed number, no "+", no leading 0, no
// spaces/dashes — this app's users.phone has never been normalized on the
// way in (registerSchema just checks it's non-empty), so it could be
// stored as "9876543210", "09876543210", "+91 98765 43210", etc. Taking the
// last 10 digits and re-prefixing "91" is robust to all of those regardless
// of how it was originally entered.
function formatIndianPhone(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  const last10 = digits.slice(-10);
  return `91${last10}`;
}

// The Failsafe — MSG91_AUTH_KEY won't exist until DLT approval finishes,
// which can take days, and this can't block that work. Every send is
// logged either way (what would have gone out, or what actually did) so
// the call sites below never need their own configured/not-configured
// branching — same "optional, never breaks the caller" convention as
// push.service.js's sendPushToUser and email.service.js's requireEmailConfig.
async function sendSms({ to, templateId, variables = {} }) {
  const phone = formatIndianPhone(to);
  const authKey = process.env.MSG91_AUTH_KEY;

  if (!authKey) {
    console.log("[sms] MSG91_AUTH_KEY not set — SMS not sent. Would have sent:", {
      to: phone,
      templateId,
      variables,
    });
    return { sent: false, reason: "not_configured" };
  }

  try {
    const response = await fetch(MSG91_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", authkey: authKey },
      body: JSON.stringify({
        template_id: templateId,
        short_url: "0",
        recipients: [{ mobiles: phone, ...variables }],
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("[sms] MSG91 delivery failed:", response.status, result);
      return { sent: false, reason: "delivery_failed" };
    }
    return { sent: true, result };
  } catch (err) {
    console.error("[sms] MSG91 request failed:", err);
    return { sent: false, reason: "request_error" };
  }
}

// The three approved call sites — see projects.controller.js's
// createProject (direct invite), admin.controller.js's resolveEscrowFunding
// (real fund verification, not the business's initial submission), and
// deadlineReminders.js's checkAndSendDeadlineReminders.
export function sendHiredSms(phone, variables) {
  return sendSms({ to: phone, templateId: TEMPLATES.HIRED, variables });
}

export function sendEscrowFundedSms(phone, variables) {
  return sendSms({ to: phone, templateId: TEMPLATES.ESCROW_FUNDED, variables });
}

export function sendDeadlineSms(phone, variables) {
  return sendSms({ to: phone, templateId: TEMPLATES.DEADLINE, variables });
}
