import { query } from "../db/client.js";

// endpoint is globally unique per browser subscription (not per user) — the
// same browser re-subscribing (e.g. after clearing permissions and
// re-enabling) sends the same or a fresh endpoint, and re-enabling on a
// device that changed accounts should re-point it at the new user rather
// than erroring, hence upsert on the unique endpoint rather than a plain
// INSERT.
export async function upsert({ userId, endpoint, p256dh, auth }) {
  const { rows } = await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, p256dh = $3, auth = $4
     RETURNING *`,
    [userId, endpoint, p256dh, auth]
  );
  return rows[0];
}

export async function deleteByEndpoint(endpoint) {
  await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
}

export async function listForUser(userId) {
  const { rows } = await query(`SELECT * FROM push_subscriptions WHERE user_id = $1`, [userId]);
  return rows;
}

// A push send that comes back 404/410 means the browser/OS discarded that
// subscription (uninstalled, permissions revoked, etc.) — web-push can't
// tell us which user that was, only which endpoints, so pruning is keyed
// off endpoints, not user_id.
export async function deleteByEndpoints(endpoints) {
  if (endpoints.length === 0) return;
  await query(`DELETE FROM push_subscriptions WHERE endpoint = ANY($1)`, [endpoints]);
}
