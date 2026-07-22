import { query } from "../db/client.js";

// ─── Password reset codes (auth_otps table) ────────────────────────────────
// This table predates pending_signups — it was the original OTP store back
// when sign-in also required a code. Superseded there, but its exact shape
// (identifier/role/otp_code/expires_at) is a perfect fit for password-reset
// codes, so it's reused here rather than standing up a second near-identical
// table. Distinctly named from the pending-signup functions above so it's
// obvious at a glance which table each set operates on.

export async function deletePasswordResetOtp(email, role) {
  await query(`DELETE FROM auth_otps WHERE identifier = $1 AND role = $2`, [email, role]);
}

export async function createPasswordResetOtp({ email, role, code, expiresAt }) {
  const { rows } = await query(
    `INSERT INTO auth_otps (identifier, role, otp_code, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [email, role, code, expiresAt]
  );
  return rows[0];
}

export async function findLatestPasswordResetOtp(email, role) {
  const { rows } = await query(
    `SELECT * FROM auth_otps
     WHERE identifier = $1 AND role = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [email, role]
  );
  return rows[0] ?? null;
}

// ─── Pending signups (registration OTP) ────────────────────────────────────

export async function deletePendingSignup(email) {
  await query(`DELETE FROM pending_signups WHERE email = $1`, [email]);
}

export async function createPendingSignup({ email, role, name, phone, passwordHash, otpCode, expiresAt }) {
  const { rows } = await query(
    `INSERT INTO pending_signups (email, role, name, phone, password_hash, otp_code, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [email, role, name, phone ?? null, passwordHash, otpCode, expiresAt]
  );
  return rows[0];
}

export async function findPendingSignup(email) {
  const { rows } = await query(`SELECT * FROM pending_signups WHERE email = $1`, [email]);
  return rows[0] ?? null;
}

// Resend: update in place so name/phone/password_hash stay put — only the
// OTP and its clock reset. created_at doubles as "OTP last sent at".
export async function refreshPendingSignupOtp(email, { otpCode, expiresAt }) {
  const { rows } = await query(
    `UPDATE pending_signups SET otp_code = $2, expires_at = $3, created_at = now() WHERE email = $1 RETURNING *`,
    [email, otpCode, expiresAt]
  );
  return rows[0] ?? null;
}
