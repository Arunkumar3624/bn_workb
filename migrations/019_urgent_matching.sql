-- Incremental migration — see migrations/018_job_qualifications.sql for the
-- same pattern.
--
-- "Urgent Matching" — the Post a Job toggle was purely cosmetic before this
-- (it only changed the preview card's badge; the value never reached
-- createProject, so it silently dropped on submit and never persisted).
-- Real effect, using only data that already exists (no subscription
-- gating — that's deferred): urgent posts sort to the top of the Job
-- Board for everyone, and are visible to Silver-tier+ workers (current_level
-- >= 50) immediately, with a short public delay for everyone else (see
-- projects.repository.js's listOpen).
ALTER TABLE projects ADD COLUMN is_urgent BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_projects_is_urgent ON projects (is_urgent) WHERE is_urgent = true;
