-- Incremental migration — see migrations/024_last_login_streak.sql for the
-- same "one real fix, no invented tables" pattern.
--
-- uq_job_candidate_project_worker was a blanket UNIQUE(project_id,
-- worker_id) — it also blocked a *new* invite/application after the old
-- one was already resolved (DECLINED, or CLOSED because someone else got
-- the job), permanently locking that worker out of that job post forever.
-- A worker declining once shouldn't mean the business can never try again
-- on a job that's still open — only an outstanding PENDING candidacy
-- should block a duplicate.
ALTER TABLE job_candidates DROP CONSTRAINT IF EXISTS uq_job_candidate_project_worker;

CREATE UNIQUE INDEX IF NOT EXISTS uq_job_candidate_project_worker_pending
  ON job_candidates (project_id, worker_id)
  WHERE status = 'PENDING';
