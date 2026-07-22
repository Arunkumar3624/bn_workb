import { query } from "../db/client.js";

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
