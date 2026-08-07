import { query } from "../db/client.js";

// realtime/events.js's fireNotification is fire-and-forget (same pattern as
// its firePush neighbor) — a failed insert here should never break the
// socket emit or push send it runs alongside, so this is a plain query, no
// transaction/client param needed.
export async function create({ userId, title, message, type, url }) {
  const { rows } = await query(
    `INSERT INTO notifications (user_id, title, message, type, url)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, title, message, type, url ?? null]
  );
  return rows[0];
}

// GET /api/notifications — newest first, capped so a long-idle account
// doesn't pull years of history into one response.
export async function listForUser(userId, limit = 50) {
  const { rows } = await query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

export async function countUnread(userId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );
  return rows[0]?.count ?? 0;
}

// PATCH /api/notifications/mark-read — every unread row for this user at
// once, not one id at a time; the drawer has no per-item "mark read"
// affordance, opening it is what clears the badge.
export async function markAllRead(userId) {
  await query(`UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`, [userId]);
}
