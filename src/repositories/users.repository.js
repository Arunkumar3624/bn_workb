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

// Lightweight — only the one column guard.js and the login flow actually
// need, so a banned-user check doesn't pull the whole row on every request.
export async function isActive(id) {
  const { rows } = await query(`SELECT is_active FROM users WHERE id = $1`, [id]);
  return rows[0]?.is_active ?? false;
}

// Security Monitor's "Ban User"/"Unban User" actions (admin.controller.js's
// resolveBlockedAttempt and moderateMessageSender) — the only writer of
// this column.
export async function setActive(client, id, active) {
  const { rows } = await client.query(
    `UPDATE users SET is_active = $2 WHERE id = $1 RETURNING *`,
    [id, active]
  );
  return rows[0] ?? null;
}

// Message Monitor's "Deduct Points" action. behavior_score is nullable
// (nobody writes it yet elsewhere), so an unset score is treated as a clean
// 1000 — "full trust until proven otherwise" — the same semantic the 0-1000
// scale/marketing copy ("Behavior Score makes strong delivery visible")
// implies. delta is negative for a deduction; clamped to the schema's
// 0-1000 CHECK range either way.
export async function adjustBehaviorScore(client, id, delta) {
  const { rows } = await client.query(
    `UPDATE users
     SET behavior_score = LEAST(1000, GREATEST(0, COALESCE(behavior_score, 1000) + $2))
     WHERE id = $1
     RETURNING *`,
    [id, delta]
  );
  return rows[0] ?? null;
}

// Only ever called with role 'worker' | 'business' — see
// auth.validators.js's registerSchema, which excludes 'admin' at the
// boundary so this repo function never has to re-check it.
//
// emailVerified defaults true (matching the column default) so every
// existing caller — create-admin.js, the RetailX/Priya seed script — keeps
// working unchanged. POST /api/auth/verify-otp is the only caller that
// passes true explicitly and deliberately — a `users` row for a fresh
// signup is only ever created there, once the OTP check already succeeded
// (see pending_signups / auth.controller.js), so it's always verified from
// the moment it exists.
export async function create({ role, name, email, phone, passwordHash, emailVerified = true }) {
  const { rows } = await query(
    `INSERT INTO users (role, name, email, phone, password_hash, email_verified)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [role, name, email, phone ?? null, passwordHash, emailVerified]
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

// The caller's own profile edit (PATCH /api/profiles/me) — title/phone
// overwrite when provided, profilePatch is shallow-merged into the existing
// `profile` JSONB via Postgres's `||` so an edit to one field (e.g. bio)
// never clobbers sibling fields (e.g. skills) the caller didn't send.
//
// avatarUrl is three-state, not two: undefined ("key omitted — leave
// avatar_url alone"), null ("client explicitly wants to reset to the
// default avatar"), or a URL string ("set it"). COALESCE can't tell the
// first two apart since both arrive as SQL NULL, so avatarUrl's presence is
// checked in JS and passed as a separate boolean flag instead.
export async function updateSelf(id, { avatarUrl, title, phone, profilePatch }) {
  const avatarProvided = avatarUrl !== undefined;
  const { rows } = await query(
    `UPDATE users
     SET avatar_url = CASE WHEN $2 THEN $3 ELSE avatar_url END,
         title = COALESCE($4, title),
         phone = COALESCE($5, phone),
         profile = profile || $6::jsonb
     WHERE id = $1
     RETURNING *`,
    [id, avatarProvided, avatarUrl ?? null, title ?? null, phone ?? null, JSON.stringify(profilePatch ?? {})]
  );
  return rows[0] ?? null;
}

// POST /api/auth/reset-password's only DB write — the reset OTP itself is
// verified by the caller (auth.controller.js) before this ever runs.
export async function updatePassword(id, passwordHash) {
  const { rows } = await query(
    `UPDATE users SET password_hash = $2 WHERE id = $1 RETURNING *`,
    [id, passwordHash]
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
