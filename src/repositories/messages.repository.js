import { query } from "../db/client.js";

// Plain text message. Attachment messages (submission_id set) go through
// createAttachment below instead, since those need the submission row
// created in the same transaction.
export async function create({ projectId, senderId, body }) {
  const { rows } = await query(
    `INSERT INTO messages (project_id, sender_id, body)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [projectId, senderId, body]
  );
  return rows[0];
}

export async function createLinkedToSubmission(client, { projectId, senderId, body, submissionId }) {
  const { rows } = await client.query(
    `INSERT INTO messages (project_id, sender_id, body, submission_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [projectId, senderId, body ?? null, submissionId]
  );
  return rows[0];
}

// Joined to the sender's public profile (name) and, when the message wraps
// a shared file, the submission itself — same shape submissions.repository
// .js's listForProject returns, so the frontend can render an attachment
// bubble with one code path shared with DeliverablesPanel. Visibility
// (submitter sees their own submission at any status; the counterparty only
// once APPROVED) is enforced by the caller, same as listSubmissions in
// submissions.controller.js — not here, to keep that one rule in one place
// conceptually even though it's applied in two controllers.
// Message Monitor's "Ban User" action needs to know who sent a given
// message and on which project, without pulling the whole listForProject
// join for one row.
export async function findById(id) {
  const { rows } = await query(`SELECT id, project_id, sender_id, body FROM messages WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listForProject(projectId) {
  const { rows } = await query(
    `SELECT m.id, m.project_id, m.sender_id, m.body, m.created_at,
            u.name AS sender_name,
            s.id AS submission_id, s.type AS submission_type, s.url AS submission_url,
            s.image_data AS submission_image_data, s.caption AS submission_caption,
            s.status AS submission_status, s.submitted_by AS submission_submitted_by,
            s.rejection_reason AS submission_rejection_reason
     FROM messages m
     JOIN public_user_profiles u ON u.id = m.sender_id
     LEFT JOIN submissions s ON s.id = m.submission_id
     WHERE m.project_id = $1
     ORDER BY m.created_at ASC`,
    [projectId]
  );
  return rows;
}
