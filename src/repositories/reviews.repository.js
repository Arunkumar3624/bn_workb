import { query } from "../db/client.js";

export async function create({ projectId, reviewerId, revieweeId, rating, feedback }) {
  // uq_one_review_per_project_per_reviewer (schema.sql) turns a duplicate
  // submission into a unique_violation (Postgres error code 23505) — the
  // controller maps that to a 409 Conflict.
  const { rows } = await query(
    `INSERT INTO reviews (project_id, reviewer_id, reviewee_id, rating, feedback)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [projectId, reviewerId, revieweeId, rating, feedback ?? null]
  );
  return rows[0];
}

export async function findByProjectAndReviewer(projectId, reviewerId) {
  const { rows } = await query(
    `SELECT * FROM reviews WHERE project_id = $1 AND reviewer_id = $2`,
    [projectId, reviewerId]
  );
  return rows[0] ?? null;
}
