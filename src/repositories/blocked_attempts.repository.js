import { query } from "../db/client.js";

// Written by messages.controller.js the moment containsContactInfo rejects
// a send — the message itself is never stored, only this record of the
// attempt (see schema.sql's blocked_message_attempts comment for why).
// projectId is null for an attempt made through the thread-wide route with
// no single project in mind; threadId is set for every attempt now (both
// the old per-project routes and the new thread routes resolve one).
export async function create({ projectId = null, threadId = null, senderId, attemptedText }) {
  const { rows } = await query(
    `INSERT INTO blocked_message_attempts (project_id, thread_id, sender_id, attempted_text)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [projectId, threadId, senderId, attemptedText]
  );
  return rows[0];
}

export async function findById(id) {
  const { rows } = await query(`SELECT * FROM blocked_message_attempts WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

// Security Monitor's case queue — joined to sender/business/project names
// so the admin UI never needs a second lookup per row. project_id/thread_id
// are both LEFT JOINs now (an attempt made through the thread-wide route
// with no single project has no project row to join) — worker_id/business_id
// fall back to the thread when there's no project to pull them from.
export async function listPending() {
  const { rows } = await query(
    `SELECT a.*, s.name AS sender_name, s.role AS sender_role,
            p.title AS project_title,
            COALESCE(p.worker_id, ct.worker_id) AS worker_id,
            COALESCE(p.business_id, ct.business_id) AS business_id,
            w.name AS worker_name, b.name AS business_name
     FROM blocked_message_attempts a
     JOIN public_user_profiles s ON s.id = a.sender_id
     LEFT JOIN projects p ON p.id = a.project_id
     LEFT JOIN chat_threads ct ON ct.id = a.thread_id
     LEFT JOIN public_user_profiles w ON w.id = COALESCE(p.worker_id, ct.worker_id)
     LEFT JOIN public_user_profiles b ON b.id = COALESCE(p.business_id, ct.business_id)
     WHERE a.status = 'PENDING'
     ORDER BY a.created_at DESC`
  );
  return rows;
}

export async function resolve(client, id, { status, resolvedBy, resolutionNote }) {
  const { rows } = await client.query(
    `UPDATE blocked_message_attempts
     SET status = $2::blocked_attempt_status,
         resolved_by = $3,
         resolved_at = now(),
         resolution_note = $4
     WHERE id = $1
     RETURNING *`,
    [id, status, resolvedBy, resolutionNote ?? null]
  );
  return rows[0] ?? null;
}
