import { query } from "../db/client.js";

// The real audit trail behind the Ledger UI — one row per credit, written
// inside the same transaction as the users.xp/bridge_tokens update that
// caused it (see projects.controller.js's completeProject), so the running
// total and the history list can never drift apart.
export async function create(client, { userId, eventType, xpDelta = 0, tokenDelta = 0 }) {
  const { rows } = await client.query(
    `INSERT INTO ledger_events (user_id, event_type, xp_delta, token_delta)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, eventType, xpDelta, tokenDelta]
  );
  return rows[0];
}

// The caller's own history, most recent first — Ledger page reads this.
export async function listForUser(userId, { limit = 50 } = {}) {
  const { rows } = await query(
    `SELECT id, event_type, xp_delta, token_delta, created_at
     FROM ledger_events
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows;
}
