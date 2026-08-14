import { query } from "../db/client.js";

// One row per redemption, written inside the same transaction as the
// users.bridge_tokens debit that paid for it (see perks.controller.js's
// purchasePerk) — same pattern as ledger_events.repository.js. targetType/
// targetId are optional — most perks boost a specific job post/application/
// dispute/withdrawal (see perkTargets.js), a few (featured-employer,
// profile-audit) are account-wide and leave these null.
export async function create(client, { userId, perkId, tierId, label, tokenCost, expiresAt, targetType, targetId }) {
  const { rows } = await client.query(
    `INSERT INTO perk_purchases (user_id, perk_id, tier_id, label, token_cost, expires_at, target_type, target_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [userId, perkId, tierId, label, tokenCost, expiresAt, targetType ?? null, targetId ?? null]
  );
  return rows[0];
}

// The caller's own redemption history, most recent first — the shop's
// "Recent Purchases" strip reads this.
export async function listForUser(userId, { limit = 20 } = {}) {
  const { rows } = await query(
    `SELECT id, perk_id, tier_id, label, token_cost, expires_at, target_type, target_id, consumed_at, created_at
     FROM perk_purchases
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

// "Active" = not expired (or never expires) AND not yet consumed — the
// single definition every perk effect and the shop's "Active Perks" strip
// both read from, so a purchase can never look active in one place and
// spent/expired in another.
export async function listActiveForUser(userId) {
  const { rows } = await query(
    `SELECT id, perk_id, tier_id, label, token_cost, expires_at, target_type, target_id, consumed_at, created_at
     FROM perk_purchases
     WHERE user_id = $1
       AND consumed_at IS NULL
       AND (expires_at IS NULL OR expires_at > now())
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

// The one active purchase (if any) backing a specific perk effect check —
// e.g. "does this project have an active flash-post boost?" resolves to
// `findActive(businessId, 'flash-post', { targetId: projectId })`. Locks
// the row (FOR UPDATE) when passed a transaction client so a one-time perk
// can't be consumed twice by two concurrent requests.
export async function findActive(userId, perkId, { targetId = null, client = null } = {}) {
  const runner = client ?? { query };
  const forUpdate = client ? "FOR UPDATE" : "";
  const { rows } = await runner.query(
    `SELECT * FROM perk_purchases
     WHERE user_id = $1
       AND perk_id = $2
       AND consumed_at IS NULL
       AND (expires_at IS NULL OR expires_at > now())
       AND ($3::uuid IS NULL OR target_id = $3)
     ORDER BY created_at DESC
     LIMIT 1
     ${forUpdate}`,
    [userId, perkId, targetId]
  );
  return rows[0] ?? null;
}

// Marks a one-time perk as spent — called the moment its effect actually
// fires (e.g. the shortlist was generated, the broadcast was sent, the
// Ghosting Failsafe was actually blocked once). Time-boxed perks never call
// this; they just expire on their own via expires_at.
export async function consume(client, purchaseId) {
  const { rows } = await client.query(
    `UPDATE perk_purchases SET consumed_at = now() WHERE id = $1 RETURNING *`,
    [purchaseId]
  );
  return rows[0] ?? null;
}
