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

// Reviews a user has RECEIVED — the trust-page use case (WorkerProfile.jsx's
// reviews section), same "public trust signal" category as
// public_user_profiles.rating/reviews_count, so this is a public read too.
// Joined to public_user_profiles for the reviewer's display name.
export async function listForReviewee(revieweeId) {
  const { rows } = await query(
    `SELECT r.*, p.name AS reviewer_name
     FROM reviews r
     JOIN public_user_profiles p ON p.id = r.reviewer_id
     WHERE r.reviewee_id = $1
     ORDER BY r.created_at DESC`,
    [revieweeId]
  );
  return rows;
}
