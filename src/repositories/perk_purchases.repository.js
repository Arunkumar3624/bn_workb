import { query } from "../db/client.js";

// One row per redemption, written inside the same transaction as the
// users.bridge_tokens debit that paid for it (see perks.controller.js's
// purchasePerk) — same pattern as ledger_events.repository.js.
export async function create(client, { userId, perkId, tierId, label, tokenCost, expiresAt }) {
  const { rows } = await client.query(
    `INSERT INTO perk_purchases (user_id, perk_id, tier_id, label, token_cost, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, perkId, tierId, label, tokenCost, expiresAt]
  );
  return rows[0];
}

// The caller's own redemption history, most recent first — the shop's
// "Recent Purchases" strip reads this.
export async function listForUser(userId, { limit = 20 } = {}) {
  const { rows } = await query(
    `SELECT id, perk_id, tier_id, label, token_cost, expires_at, created_at
     FROM perk_purchases
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows;
}
