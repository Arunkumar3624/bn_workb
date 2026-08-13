import { query } from "../db/client.js";

// A worker applying to an OPEN post (source='APPLICATION') or a business
// inviting a specific worker to one of their own OPEN posts
// (source='INVITE') — see schema.sql's job_candidates comment for the full
// lifecycle. uq_job_candidate_project_worker_pending (one *outstanding*
// candidacy per worker per project — see migrations/025_reinvite_after_decision.sql)
// turns a duplicate insert into a unique_violation (Postgres code 23505)
// while a PENDING one already exists — the controller maps that to a 409
// Conflict, same pattern reviews.repository.js's create() already documents
// for its own unique constraint. Once that prior one is DECLINED or CLOSED,
// this insert succeeds again — the same worker can be re-invited/re-apply.
export async function create({ projectId, workerId, source, message }, client = { query }) {
  const { rows } = await client.query(
    `INSERT INTO job_candidates (project_id, worker_id, source, message)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [projectId, workerId, source, message ?? null]
  );
  return rows[0];
}

export async function findById(id) {
  const { rows } = await query(`SELECT * FROM job_candidates WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

// Row-locks the candidacy for the duration of the accept transaction — same
// reasoning as projects.repository.js's findByIdForUpdate, so two concurrent
// "accept" calls on sibling candidacies for the same project can't both
// succeed and assign the project to two different workers.
export async function findByIdForUpdate(client, id) {
  const { rows } = await client.query(`SELECT * FROM job_candidates WHERE id = $1 FOR UPDATE`, [id]);
  return rows[0] ?? null;
}

// The business's applicant/invite review list for one of their own OPEN
// projects — joined to the worker's public profile so the UI can show a
// name/rating/skills without a second round trip per row.
// standing_door/current_level are joined from `users` directly, not
// public_user_profiles — that view deliberately excludes them (see
// migrations/012_gamification_foundation.sql) so the Two-Door Reveal can't
// leak on any public/anonymous surface. This query is safe to include them
// on: job_candidates.controller.js's listCandidatesForProject already
// gates it to only the business that owns the project (or an admin).
// xp/bridge_tokens are still never selected here — only the derived,
// already-gated reveal state and level, never the raw currency.
export async function listForProject(projectId) {
  const { rows } = await query(
    `SELECT c.*, w.name AS worker_name, w.avatar_url, w.title AS worker_title,
            w.rating, w.reviews_count, w.profile, w.standing_door, w.current_level
     FROM job_candidates c
     JOIN users w ON w.id = c.worker_id
     WHERE c.project_id = $1
     ORDER BY c.created_at DESC`,
    [projectId]
  );
  return rows;
}

// A worker's own candidacies — both jobs they applied to and invites a
// business sent them — joined to the project + business name so a "My
// Applications & Invites" view doesn't need a second lookup per row.
export async function listForWorker(workerId) {
  const { rows } = await query(
    `SELECT c.*, p.title AS project_title, p.budget, p.description, p.status AS project_status,
            COALESCE(NULLIF(b.profile->>'companyName', ''), b.name) AS business_name,
            b.avatar_url AS business_avatar_url
     FROM job_candidates c
     JOIN projects p ON p.id = c.project_id
     JOIN public_user_profiles b ON b.id = p.business_id
     WHERE c.worker_id = $1
     ORDER BY c.created_at DESC`,
    [workerId]
  );
  return rows;
}

// BusinessWorkers.jsx's "Invited" badge — a worker with an outstanding
// PENDING invite on one of this business's own OPEN posts should show as
// already-invited *before* a second invite attempt hits the unique index
// (uq_job_candidate_project_worker_pending) and 409s. Only source='INVITE'
// counts here — a worker who applied on their own isn't someone "you
// invited", so that shouldn't light up the same badge.
export async function listPendingInvitedWorkerIdsForBusiness(businessId) {
  const { rows } = await query(
    `SELECT DISTINCT c.worker_id
     FROM job_candidates c
     JOIN projects p ON p.id = c.project_id
     WHERE p.business_id = $1 AND c.source = 'INVITE' AND c.status = 'PENDING'`,
    [businessId]
  );
  return rows.map((r) => r.worker_id);
}

// The Hustle Stats card's backend — how many jobs this worker has actually
// applied to (source='APPLICATION' only; an INVITE was the business's move,
// not the worker's own hustle) this week and this month. date_trunc bounds
// are computed in the query itself (UTC, Postgres's default unless the
// session overrides it) rather than passed in from the app, so "this
// week"/"this month" can never drift from what "now" means to the DB.
export async function countApplicationsByPeriod(workerId) {
  const { rows } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE created_at >= date_trunc('week', now())) AS this_week,
       COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now())) AS this_month
     FROM job_candidates
     WHERE worker_id = $1 AND source = 'APPLICATION'`,
    [workerId]
  );
  return {
    thisWeek: Number(rows[0].this_week),
    thisMonth: Number(rows[0].this_month),
  };
}

export async function updateStatus(client, id, status) {
  const { rows } = await client.query(
    `UPDATE job_candidates
     SET status = $2::job_candidate_status, decided_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, status]
  );
  return rows[0] ?? null;
}

// Once one candidacy on a project is accepted, every other still-PENDING
// candidacy on that same project is filled by someone else — flip them all
// to CLOSED in one statement and return the rows so the caller can notify
// each of those workers individually (see job_candidates.controller.js).
export async function closeOthersForProject(client, projectId, exceptCandidateId) {
  const { rows } = await client.query(
    `UPDATE job_candidates
     SET status = 'CLOSED', decided_at = now()
     WHERE project_id = $1 AND id <> $2 AND status = 'PENDING'
     RETURNING *`,
    [projectId, exceptCandidateId]
  );
  return rows;
}
