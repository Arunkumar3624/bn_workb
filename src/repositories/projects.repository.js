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
// worker is a LEFT JOIN — an OPEN post has no worker yet, and this still
// needs to return that row (with worker_name null) rather than hiding it.
export async function findByIdJoined(id) {
  const { rows } = await query(
    `SELECT p.*, w.name AS worker_name, b.name AS business_name
     FROM projects p
     LEFT JOIN public_user_profiles w ON w.id = p.worker_id
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

export async function list({ businessId, workerId, status, page, pageSize, viewerId }) {
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

  // How many approved deliverables are sitting on this project that the
  // viewer didn't submit themselves — the one client-visible signal for
  // "there's something to look at here" without building a full read/unread
  // tracking system. IS DISTINCT FROM (not !=) so a null viewerId (shouldn't
  // happen — every caller is authenticated) still counts safely instead of
  // comparing against NULL and silently returning zero rows.
  params.push(viewerId ?? null);
  const viewerParamIndex = params.length;

  params.push(pageSize, (page - 1) * pageSize);

  // Joined so the frontend never has to do an N+1 lookup just to show who
  // a project is with — the public_user_profiles view (not the raw users
  // table) keeps this join from ever leaking email/phone. worker is a LEFT
  // JOIN — an OPEN post (worker_id NULL) must still show up in the
  // business's own project list, just with worker_name null.
  const { rows } = await query(
    `SELECT p.*, w.name AS worker_name, b.name AS business_name,
            (SELECT count(*)::int FROM submissions s
             WHERE s.project_id = p.id
               AND s.status = 'APPROVED'
               AND s.submitted_by IS DISTINCT FROM $${viewerParamIndex}
            ) AS new_deliverables_count
     FROM projects p
     LEFT JOIN public_user_profiles w ON w.id = p.worker_id
     JOIN public_user_profiles b ON b.id = p.business_id
     ${where}
     ORDER BY p.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

// The public Job Board feed — every OPEN, unassigned post, newest first.
// Any authenticated worker may browse this (no ownership filter, unlike
// list() above) — see job_candidates.controller.js's listOpenProjects.
export async function listOpen() {
  const { rows } = await query(
    `SELECT p.*, b.name AS business_name, b.rating AS business_rating,
            (SELECT count(*)::int FROM job_candidates c
             WHERE c.project_id = p.id AND c.source = 'APPLICATION'
            ) AS applicant_count
     FROM projects p
     JOIN public_user_profiles b ON b.id = p.business_id
     WHERE p.status = 'OPEN'
     ORDER BY p.created_at DESC
     LIMIT 100`
  );
  return rows;
}

// workerId is nullable — a business "casting the net" post is created with
// workerId omitted (status defaults to OPEN below); the existing direct-
// invite flow still passes a real workerId (status defaults to INVITED,
// same as before this feature existed).
export async function create({ businessId, workerId, title, description, budget, deadline, status }) {
  const resolvedStatus = status ?? (workerId ? "INVITED" : "OPEN");
  const { rows } = await query(
    `INSERT INTO projects (business_id, worker_id, title, description, budget, deadline, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7::project_status)
     RETURNING *`,
    [businessId, workerId ?? null, title, description ?? null, budget, deadline ?? null, resolvedStatus]
  );
  return rows[0];
}

// The moment a job_candidates row is accepted (job_candidates.controller.js)
// — assigns the project's worker_id and moves it out of OPEN in one
// statement, same timeline-append pattern as updateStatus.
export async function assignWorker(client, projectId, workerId, status) {
  const { rows } = await client.query(
    `UPDATE projects
     SET worker_id = $2,
         status = $3::project_status,
         timeline = timeline || jsonb_build_object('status', $3::text, 'at', now())
     WHERE id = $1
     RETURNING *`,
    [projectId, workerId, status]
  );
  return rows[0] ?? null;
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
