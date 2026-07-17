import { query } from "../db/client.js";

export async function findById(id) {
  const { rows } = await query(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

// CITEXT on users.email makes this comparison case-insensitive at the DB
// level already — no need to lower() here.
export async function findByEmail(email) {
  const { rows } = await query(`SELECT * FROM users WHERE email = $1`, [email]);
  return rows[0] ?? null;
}

export async function findByPhone(phone) {
  const { rows } = await query(`SELECT * FROM users WHERE phone = $1 LIMIT 1`, [phone]);
  return rows[0] ?? null;
}

// Only ever called with role 'worker' | 'business' — see
// auth.validators.js's registerSchema, which excludes 'admin' at the
// boundary so this repo function never has to re-check it.
export async function create({ role, name, email, phone, passwordHash }) {
  const { rows } = await query(
    `INSERT INTO users (role, name, email, phone, password_hash)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [role, name, email, phone ?? null, passwordHash]
  );
  return rows[0];
}

export async function findPublicProfileById(id) {
  const { rows } = await query(`SELECT * FROM public_user_profiles WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

// Browse-workers listing (BusinessWorkers.jsx) — ranked by rating then
// review count, both NULLS LAST since a brand-new worker has neither yet.
export async function listPublicProfiles({ role }) {
  const { rows } = await query(
    `SELECT * FROM public_user_profiles
     WHERE role = $1
     ORDER BY rating DESC NULLS LAST, reviews_count DESC
     LIMIT 100`,
    [role]
  );
  return rows;
}

// The caller's own profile edit (PATCH /api/profiles/me) — avatarUrl/title
// overwrite when provided, profilePatch is shallow-merged into the existing
// `profile` JSONB via Postgres's `||` so an edit to one field (e.g. bio)
// never clobbers sibling fields (e.g. skills) the caller didn't send.
export async function updateSelf(id, { avatarUrl, title, profilePatch }) {
  const { rows } = await query(
    `UPDATE users
     SET avatar_url = COALESCE($2, avatar_url),
         title = COALESCE($3, title),
         profile = profile || $4::jsonb
     WHERE id = $1
     RETURNING *`,
    [id, avatarUrl ?? null, title ?? null, JSON.stringify(profilePatch ?? {})]
  );
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
