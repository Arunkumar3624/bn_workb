import { query } from "../db/client.js";

export async function insert(
  { projectId, workerId, businessId, type, direction, amount, fundsStatus, referenceNote },
  client = { query }
) {
  const { rows } = await client.query(
    `INSERT INTO transactions (project_id, worker_id, business_id, type, direction, amount, funds_status, reference_note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [projectId, workerId, businessId, type, direction, amount, fundsStatus ?? null, referenceNote ?? null]
  );
  return rows[0];
}

export async function listForUser(userId, { page, pageSize }) {
  const { rows } = await query(
    `SELECT * FROM transactions
     WHERE worker_id = $1 OR business_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, pageSize, (page - 1) * pageSize]
  );
  return rows;
}
