import { query } from "../db/client.js";

export async function create({ projectId, submittedBy, type, url, imageData, caption }) {
  const { rows } = await query(
    `INSERT INTO submissions (project_id, submitted_by, type, url, image_data, caption)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [projectId, submittedBy, type, url ?? null, imageData ?? null, caption ?? null]
  );
  return rows[0];
}

export async function findById(id) {
  const { rows } = await query(`SELECT * FROM submissions WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

// Joined to the submitter's public profile (name) — every list view (worker,
// business, admin) wants "who sent this," not just a bare user id.
export async function listForProject(projectId) {
  const { rows } = await query(
    `SELECT s.*, u.name AS submitted_by_name
     FROM submissions s
     JOIN public_user_profiles u ON u.id = s.submitted_by
     WHERE s.project_id = $1
     ORDER BY s.created_at DESC`,
    [projectId]
  );
  return rows;
}

export async function listPendingReview() {
  const { rows } = await query(
    `SELECT s.*, u.name AS submitted_by_name, p.title AS project_title,
            p.business_id, p.worker_id
     FROM submissions s
     JOIN public_user_profiles u ON u.id = s.submitted_by
     JOIN projects p ON p.id = s.project_id
     WHERE s.status = 'PENDING_REVIEW'
     ORDER BY s.created_at ASC`
  );
  return rows;
}

export async function review(client, id, { status, reviewedBy, rejectionReason }) {
  const { rows } = await client.query(
    `UPDATE submissions
     SET status = $2::submission_status,
         reviewed_by = $3,
         reviewed_at = now(),
         rejection_reason = $4
     WHERE id = $1
     RETURNING *`,
    [id, status, reviewedBy, rejectionReason ?? null]
  );
  return rows[0] ?? null;
}
