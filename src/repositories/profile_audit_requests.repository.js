import { query } from "../db/client.js";

// Written inside the same transaction as the perk_purchases row that paid
// for it (see perks.controller.js's purchasePerk) — same pattern as
// escrow_funding_requests.repository.js's insert.
export async function create(client, { workerId, purchaseId }) {
  const { rows } = await client.query(
    `INSERT INTO profile_audit_requests (worker_id, purchase_id)
     VALUES ($1, $2)
     RETURNING *`,
    [workerId, purchaseId]
  );
  return rows[0];
}

// Admin's "Profile Audits" queue — oldest first, same convention as
// escrow_funding_requests.repository.js's listPending.
export async function listPending() {
  const { rows } = await query(
    `SELECT ar.*, w.name AS worker_name, w.title AS worker_title
     FROM profile_audit_requests ar
     JOIN public_user_profiles w ON w.id = ar.worker_id
     WHERE ar.status = 'PENDING'
     ORDER BY ar.created_at ASC`
  );
  return rows;
}

export async function findByIdForUpdate(client, id) {
  const { rows } = await client.query(`SELECT * FROM profile_audit_requests WHERE id = $1 FOR UPDATE`, [id]);
  return rows[0] ?? null;
}

export async function markReviewed(client, id, { adminNote, resolvedBy }) {
  const { rows } = await client.query(
    `UPDATE profile_audit_requests
     SET status = 'REVIEWED', admin_note = $2, resolved_by = $3, resolved_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, adminNote, resolvedBy]
  );
  return rows[0] ?? null;
}

// The worker's own audit history — WorkerProfile.jsx shows the latest
// request's status (Pending / Reviewed + the admin's note).
export async function listForWorker(workerId) {
  const { rows } = await query(
    `SELECT id, status, admin_note, created_at, resolved_at
     FROM profile_audit_requests
     WHERE worker_id = $1
     ORDER BY created_at DESC`,
    [workerId]
  );
  return rows;
}
