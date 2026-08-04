import { query } from "../db/client.js";

export async function insert(client, { projectId, businessId, amount, utrReference, screenshotUrl }) {
  const { rows } = await client.query(
    `INSERT INTO escrow_funding_requests (project_id, business_id, amount, utr_reference, screenshot_url)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [projectId, businessId, amount, utrReference, screenshotUrl]
  );
  return rows[0];
}

// FOR UPDATE — locks the row so two concurrent resolve attempts on the same
// request can't both succeed (mirrors withdrawal_requests.repository.js).
export async function findByIdForUpdate(client, id) {
  const { rows } = await client.query(`SELECT * FROM escrow_funding_requests WHERE id = $1 FOR UPDATE`, [id]);
  return rows[0] ?? null;
}

export async function markResolved(client, id, { status, adminNote, resolvedBy }) {
  const { rows } = await client.query(
    `UPDATE escrow_funding_requests
     SET status = $2, admin_note = $3, resolved_by = $4, resolved_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, status, adminNote ?? null, resolvedBy]
  );
  return rows[0] ?? null;
}

// Admin's "Escrow Funding" queue — oldest first, same convention as
// withdrawal_requests.repository.js's listPending.
export async function listPending() {
  const { rows } = await query(
    `SELECT efr.*, p.title AS project_title, b.name AS business_name
     FROM escrow_funding_requests efr
     JOIN projects p ON p.id = efr.project_id
     JOIN public_user_profiles b ON b.id = efr.business_id
     WHERE efr.status = 'PENDING'
     ORDER BY efr.created_at ASC`
  );
  return rows;
}
