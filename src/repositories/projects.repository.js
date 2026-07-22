import { query } from "../db/client.js";

// Every function here is a thin wrapper around one SQL statement against
// schema.sql's `projects` table. Functions that accept `client` run inside
// an active transaction (see db/client.js's transaction()); the rest use
// the plain pool via `query`.

export async function findById(id, client = { query }) {
  const { rows } = await client.query(`SELECT * FROM projects WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

// Single-project fetch joined to both participants' public profiles — same
// join list() already does, just scoped to one row. Used by GET /:id.
export async function findByIdJoined(id) {
  const { rows } = await query(
    `SELECT p.*, w.name AS worker_name, b.name AS business_name
     FROM projects p
     JOIN public_user_profiles w ON w.id = p.worker_id
     JOIN public_user_profiles b ON b.id = p.business_id
     WHERE p.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function findByIdForUpdate(client, id) {
  // FOR UPDATE row-locks this project row for the duration of the
  // transaction, so a second concurrent "complete" call on the same
  // project blocks until the first one commits/rolls back instead of
  // racing it — required for strict consistency on the payout path.
  const { rows } = await client.query(`SELECT * FROM projects WHERE id = $1 FOR UPDATE`, [id]);
  return rows[0] ?? null;
}

export async function list({ businessId, workerId, status, page, pageSize }) {
  const conditions = [];
  const params = [];

  if (businessId) {
    params.push(businessId);
    conditions.push(`p.business_id = $${params.length}`);
  }
  if (workerId) {
    params.push(workerId);
    conditions.push(`p.worker_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`p.status = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(pageSize, (page - 1) * pageSize);

  // Joined so the frontend never has to do an N+1 lookup just to show who
  // a project is with — the public_user_profiles view (not the raw users
  // table) keeps this join from ever leaking email/phone.
  const { rows } = await query(
    `SELECT p.*, w.name AS worker_name, b.name AS business_name
     FROM projects p
     JOIN public_user_profiles w ON w.id = p.worker_id
     JOIN public_user_profiles b ON b.id = p.business_id
     ${where}
     ORDER BY p.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

export async function create({ businessId, workerId, title, description, budget, deadline }) {
  const { rows } = await query(
    `INSERT INTO projects (business_id, worker_id, title, description, budget, deadline)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [businessId, workerId, title, description ?? null, budget, deadline ?? null]
  );
  return rows[0];
}

export async function updateStatus(id, status, client = { query }, note = null) {
  const timelineEntry = note
    ? `jsonb_build_object('status', $2::text, 'at', now(), 'note', $3::text)`
    : `jsonb_build_object('status', $2::text, 'at', now())`;
  const params = note ? [id, status, note] : [id, status];

  const { rows } = await client.query(
    `UPDATE projects
     SET status = $2::project_status,
         timeline = timeline || ${timelineEntry}::jsonb
     WHERE id = $1
     RETURNING *`,
    params
  );
  return rows[0] ?? null;
}
