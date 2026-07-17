import { query } from "../db/client.js";

export async function findUserByIdentifier(identifier, role) {
  const isPhone = /^\d{10}$/.test(identifier);
  const column = isPhone ? "phone" : "email";
  const { rows } = await query(
    `SELECT * FROM users WHERE ${column} = $1 AND role = $2 LIMIT 1`,
    [identifier, role]
  );
  return rows[0] ?? null;
}

export async function findAnyUserByIdentifier(identifier) {
  const isPhone = /^\d{10}$/.test(identifier);
  const column = isPhone ? "phone" : "email";
  const { rows } = await query(
    `SELECT * FROM users WHERE ${column} = $1 LIMIT 1`,
    [identifier]
  );
  return rows[0] ?? null;
}

export async function deleteOtpsForIdentifier(identifier, role) {
  await query(`DELETE FROM auth_otps WHERE identifier = $1 AND role = $2`, [identifier, role]);
}

export async function createOtp({ identifier, role, code, expiresAt }) {
  const { rows } = await query(
    `INSERT INTO auth_otps (identifier, role, otp_code, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [identifier, role, code, expiresAt]
  );
  return rows[0];
}

export async function findLatestOtp(identifier, role) {
  const { rows } = await query(
    `SELECT * FROM auth_otps
     WHERE identifier = $1
       AND role = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [identifier, role]
  );
  return rows[0] ?? null;
}
