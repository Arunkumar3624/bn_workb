import { query } from "../db/client.js";

// ─── Verification queue ──────────────────────────────────────────────────────

export async function listPendingVerifications() {
  const { rows } = await query(
    `SELECT id, name, role, title, created_at
     FROM users
     WHERE verified = false AND role IN ('worker', 'business')
     ORDER BY created_at ASC`
  );
  return rows;
}

export async function setUserVerified(client, userId, verified) {
  const { rows } = await client.query(
    `UPDATE users SET verified = $2 WHERE id = $1 RETURNING id, name, role, verified`,
    [userId, verified]
  );
  return rows[0] ?? null;
}

// ─── KPI engine ───────────────────────────────────────────────────────────────
// Statuses that mean "the business's money is currently held on the
// platform, not yet paid out or cancelled" — i.e. the funds-secured pool.
const FUNDS_HELD_STATUSES = ["FUNDS_SECURED", "WORK_IN_PROGRESS", "FILES_SUBMITTED", "DISPUTED"];

export async function getPlatformStats() {
  const [{ rows: totalUsers }, { rows: jobsToday }, { rows: revenue }, { rows: pool }, { rows: totalProjects }, { rows: pendingVerifications }, { rows: openDisputes }] = await Promise.all([
    query(`SELECT count(*)::int AS count FROM users`),
    query(`SELECT count(*)::int AS count FROM projects WHERE created_at::date = now()::date`),
    query(`SELECT COALESCE(sum(amount), 0)::numeric AS total FROM transactions WHERE type = 'PLATFORM_FEE'`),
    query(
      `SELECT COALESCE(sum(budget), 0)::numeric AS total FROM projects WHERE status = ANY($1::project_status[])`,
      [FUNDS_HELD_STATUSES]
    ),
    // The following three power AdminOverviewTab's "Platform KPIs" progress
    // bars (verification backlog %, dispute rate %) with real ratios rather
    // than invented percentages.
    query(`SELECT count(*)::int AS count FROM projects`),
    query(`SELECT count(*)::int AS count FROM users WHERE verified = false AND role IN ('worker', 'business')`),
    query(`SELECT count(*)::int AS count FROM projects WHERE status = 'DISPUTED'`),
  ]);

  return {
    totalUsers: totalUsers[0].count,
    jobsToday: jobsToday[0].count,
    platformRevenue: revenue[0].total,
    fundsSecuredPool: pool[0].total,
    totalProjects: totalProjects[0].count,
    pendingVerifications: pendingVerifications[0].count,
    openDisputes: openDisputes[0].count,
  };
}

export async function getWeeklyRevenue() {
  // One row per of the last 7 days, zero-filled for days with no fee
  // transactions — a chart with gaps in the x-axis reads as broken data.
  const { rows } = await query(
    `SELECT
       to_char(d.day, 'Dy') AS day,
       COALESCE(sum(t.amount), 0)::numeric AS revenue
     FROM generate_series(current_date - interval '6 days', current_date, interval '1 day') AS d(day)
     LEFT JOIN transactions t
       ON t.type = 'PLATFORM_FEE' AND t.created_at::date = d.day
     GROUP BY d.day
     ORDER BY d.day`
  );
  return rows.map((r) => ({ day: r.day, revenue: Number(r.revenue) }));
}

// ─── Disputes ───────────────────────────────────────────────────────────────

export async function listDisputedProjects() {
  const { rows } = await query(
    `SELECT p.*, w.name AS worker_name, b.name AS business_name
     FROM projects p
     JOIN public_user_profiles w ON w.id = p.worker_id
     JOIN public_user_profiles b ON b.id = p.business_id
     WHERE p.status = 'DISPUTED'
     ORDER BY p.updated_at DESC`
  );
  return rows;
}

// ─── Platform audit log ───────────────────────────────────────────────────────

export async function insertPlatformLog(client, { adminId, action, targetUserId, targetProjectId, notes }) {
  const { rows } = await client.query(
    `INSERT INTO platform_logs (admin_id, action, target_user_id, target_project_id, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [adminId, action, targetUserId ?? null, targetProjectId ?? null, notes ?? null]
  );
  return rows[0];
}
