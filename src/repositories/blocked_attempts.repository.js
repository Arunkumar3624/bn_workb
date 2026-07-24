import { query } from "../db/client.js";

// Written by messages.controller.js the moment containsContactInfo rejects
// a send — the message itself is never stored, only this record of the
// attempt (see schema.sql's blocked_message_attempts comment for why).
export async function create({ projectId, senderId, attemptedText }) {
  const { rows } = await query(
    `INSERT INTO blocked_message_attempts (project_id, sender_id, attempted_text)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [projectId, senderId, attemptedText]
  );
  return rows[0];
}

export async function findById(id) {
  const { rows } = await query(`SELECT * FROM blocked_message_attempts WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

// Security Monitor's case queue — joined to sender/business/project names
// so the admin UI never needs a second lookup per row.
export async function listPending() {
  const { rows } = await query(
    `SELECT a.*, s.name AS sender_name, s.role AS sender_role,
            p.title AS project_title, p.worker_id, p.business_id,
            w.name AS worker_name, b.name AS business_name
     FROM blocked_message_attempts a
     JOIN public_user_profiles s ON s.id = a.sender_id
     JOIN projects p ON p.id = a.project_id
     LEFT JOIN public_user_profiles w ON w.id = p.worker_id
     LEFT JOIN public_user_profiles b ON b.id = p.business_id
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
