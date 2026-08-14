import { query } from "../db/client.js";

// One thread per user (uq_support_threads_user) — find-or-create so a
// user's first support message doesn't need a separate "start a
// conversation" step.
export async function findOrCreateThreadForUser(client, userId) {
  const { rows } = await client.query(
    `INSERT INTO support_threads (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING *`,
    [userId]
  );
  return rows[0];
}

export async function getThreadForUser(userId) {
  const { rows } = await query(`SELECT * FROM support_threads WHERE user_id = $1`, [userId]);
  return rows[0] ?? null;
}

export async function findById(id) {
  const { rows } = await query(`SELECT * FROM support_threads WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function insertMessage(client, { threadId, senderId, senderRole, body }) {
  const { rows } = await client.query(
    `INSERT INTO support_messages (thread_id, sender_id, sender_role, body)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [threadId, senderId, senderRole, body]
  );
  return rows[0];
}

// A message from either side reopens a RESOLVED thread — the user or staff
// picking the conversation back up is exactly what should un-resolve it.
export async function touchThread(client, threadId, { reopen } = {}) {
  const { rows } = await client.query(
    reopen
      ? `UPDATE support_threads SET status = 'OPEN', updated_at = now() WHERE id = $1 RETURNING *`
      : `UPDATE support_threads SET updated_at = now() WHERE id = $1 RETURNING *`,
    [threadId]
  );
  return rows[0];
}

export async function setStatus(threadId, status) {
  const { rows } = await query(
    `UPDATE support_threads SET status = $2::support_status WHERE id = $1 RETURNING *`,
    [threadId, status]
  );
  return rows[0] ?? null;
}

export async function listMessagesForThread(threadId) {
  const { rows } = await query(
    `SELECT sm.*, u.name AS sender_name
     FROM support_messages sm
     JOIN public_user_profiles u ON u.id = sm.sender_id
     WHERE sm.thread_id = $1
     ORDER BY sm.created_at ASC`,
    [threadId]
  );
  return rows;
}

// Admin's Support inbox — every thread, newest activity first, with the
// real requester's name/role and their most recent message as a preview
// (a correlated subquery per thread is fine at this scale — the same
// tradeoff admin.repository.js's listAllInvoices already makes elsewhere).
export async function listThreadsForAdmin() {
  const { rows } = await query(
    `SELECT st.*, u.name AS user_name, u.role AS user_role,
            (SELECT body FROM support_messages sm WHERE sm.thread_id = st.id ORDER BY sm.created_at DESC LIMIT 1) AS last_message,
            (SELECT created_at FROM support_messages sm WHERE sm.thread_id = st.id ORDER BY sm.created_at DESC LIMIT 1) AS last_message_at
     FROM support_threads st
     JOIN public_user_profiles u ON u.id = st.user_id
     ORDER BY st.updated_at DESC
     LIMIT 200`
  );
  return rows;
}
