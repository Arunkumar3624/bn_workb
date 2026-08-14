import { query } from "../db/client.js";

// One row per (business_id, worker_id) pair — the persistent relationship
// thread that backs both the original per-project chat routes and the newer
// entity-wide ones. Created lazily the moment a project between the two
// first gets a real worker_id — either a direct invite (projects.controller
// .js's createProject, which assigns worker_id from birth) or an accepted
// open-post candidacy (job_candidates.controller.js's respondToCandidate) —
// mirroring messages.controller.js's mustBeParticipant, which has always
// allowed chat as soon as a real worker_id exists, not just after
// acceptance. Reused for every project after that. The INSERT ... ON CONFLICT ...
// DO UPDATE (a no-op update) is what lets this always RETURNING the row
// whether it was just created or already existed, in one round trip, with
// no read-then-write race — DO NOTHING can't return an existing row.
export async function getOrCreateThread(businessId, workerId, client = { query }) {
  const { rows } = await client.query(
    `INSERT INTO chat_threads (business_id, worker_id)
     VALUES ($1, $2)
     ON CONFLICT (business_id, worker_id) DO UPDATE SET updated_at = chat_threads.updated_at
     RETURNING *`,
    [businessId, workerId]
  );
  return rows[0];
}

export async function findById(id, client = { query }) {
  const { rows } = await client.query(`SELECT * FROM chat_threads WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

// The merged Negotiations inbox: one row per counterparty instead of one
// per project. Joins whichever side of the pair ISN'T req.user (public
// profile only — no email/phone) and the thread's latest message, the same
// shape a WhatsApp-style chat list needs for its preview/sort order.
export async function getUserThreads(userId) {
  const { rows } = await query(
    `SELECT ct.*,
            other.id AS other_user_id, other.name AS other_name,
            other.avatar_url AS other_avatar_url, other.verified AS other_verified,
            lm.body AS last_message_body, lm.created_at AS last_message_at,
            lm.sender_id AS last_message_sender_id
     FROM chat_threads ct
     JOIN public_user_profiles other
       ON other.id = CASE WHEN ct.business_id = $1 THEN ct.worker_id ELSE ct.business_id END
     LEFT JOIN LATERAL (
       SELECT body, created_at, sender_id FROM messages
       WHERE thread_id = ct.id
       ORDER BY created_at DESC
       LIMIT 1
     ) lm ON true
     WHERE ct.business_id = $1 OR ct.worker_id = $1
     ORDER BY COALESCE(lm.created_at, ct.created_at) DESC
     LIMIT 200`,
    [userId]
  );
  return rows;
}
