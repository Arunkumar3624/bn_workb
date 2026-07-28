import { query } from "../db/client.js";

// ON CONFLICT DO NOTHING — blocking someone twice is a harmless no-op, not
// a 409; the uq_user_blocks constraint is there to keep the table clean,
// not to reject a repeat click.
export async function block(blockerId, blockedId) {
  const { rows } = await query(
    `INSERT INTO user_blocks (blocker_id, blocked_id)
     VALUES ($1, $2)
     ON CONFLICT (blocker_id, blocked_id) DO NOTHING
     RETURNING *`,
    [blockerId, blockedId]
  );
  return rows[0] ?? null;
}

export async function unblock(blockerId, blockedId) {
  await query(`DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2`, [blockerId, blockedId]);
}

// Both directions in one round trip — the chat composer needs to know not
// just "did I block them" but "did they block me" too, since either one
// should stop messages from flowing (WhatsApp-style: a block is mutual in
// effect, even though only one side chose it).
export async function getStatus(userId, otherUserId) {
  const { rows } = await query(
    `SELECT
       EXISTS(SELECT 1 FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2) AS blocked_by_me,
       EXISTS(SELECT 1 FROM user_blocks WHERE blocker_id = $2 AND blocked_id = $1) AS blocked_me`,
    [userId, otherUserId]
  );
  return rows[0];
}
