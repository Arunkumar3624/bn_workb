import { query } from "../db/client.js";

export async function findById(id) {
  const { rows } = await query(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function findPublicProfileById(id) {
  const { rows } = await query(`SELECT * FROM public_user_profiles WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

// Row-locks the wallet owner's user row so a concurrent withdrawal/payout
// can't read a stale balance while this one is in flight.
export async function findForUpdate(client, id) {
  const { rows } = await client.query(`SELECT * FROM users WHERE id = $1 FOR UPDATE`, [id]);
  return rows[0] ?? null;
}

export async function incrementWalletBalance(client, userId, delta) {
  const { rows } = await client.query(
    `UPDATE users SET wallet_balance = wallet_balance + $2 WHERE id = $1 RETURNING *`,
    [userId, delta]
  );
  return rows[0] ?? null;
}
