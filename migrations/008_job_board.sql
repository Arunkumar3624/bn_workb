-- Incremental migration — see migrations/007_messages.sql for the same
-- pattern. Appended to schema.sql so a fresh `npm run migrate` still gets
-- this in one pass.
--
-- The Open Job Board — a project can now start life unassigned (worker_id
-- NULL, status OPEN), visible to every worker on the public feed. Workers
-- apply, or a business can directly invite one specific worker to an
-- already-open post without creating a second project — both paths are
-- "candidacies" against the SAME open project row (job_candidates), and the
-- project itself is only ever assigned a worker at the moment one candidacy
-- is accepted (by whichever side didn't initiate it: the business accepts
-- an application, the worker accepts an invite). See
-- job_candidates.repository.js for the full lifecycle.

ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'OPEN' BEFORE 'INVITED';

ALTER TABLE projects ALTER COLUMN worker_id DROP NOT NULL;

-- The existing role-enforcement trigger looked up NEW.worker_id
-- unconditionally — with worker_id nullable, that lookup would find no row
-- and always raise. Skip the worker-side check entirely for an unassigned
-- (OPEN) project; the business-side check still always runs.
CREATE OR REPLACE FUNCTION enforce_project_participant_roles()
RETURNS TRIGGER AS $$
DECLARE
  business_role user_role;
  worker_role   user_role;
BEGIN
  SELECT role INTO business_role FROM users WHERE id = NEW.business_id;
  IF business_role IS DISTINCT FROM 'business' THEN
    RAISE EXCEPTION 'projects.business_id (%) must reference a user with role = business', NEW.business_id;
  END IF;

  IF NEW.worker_id IS NOT NULL THEN
    SELECT role INTO worker_role FROM users WHERE id = NEW.worker_id;
    IF worker_role IS DISTINCT FROM 'worker' THEN
      RAISE EXCEPTION 'projects.worker_id (%) must reference a user with role = worker', NEW.worker_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TYPE job_candidate_source AS ENUM ('APPLICATION', 'INVITE');
CREATE TYPE job_candidate_status AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CLOSED');

-- One row per (project, worker) candidacy — either the worker applied
-- (source=APPLICATION) or the business invited them directly
-- (source=INVITE) while the project was still OPEN. Accepting one candidacy
-- assigns the project's worker_id and flips every other still-PENDING
-- candidacy on that project to CLOSED ("this job was filled by someone
-- else") — nothing about a candidacy mutates the project row until that
-- moment, so the public feed (WHERE status = 'OPEN') stays accurate for
-- every candidate still deciding, including an invited worker who hasn't
-- responded yet.
CREATE TABLE job_candidates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  worker_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source        job_candidate_source NOT NULL,
  status        job_candidate_status NOT NULL DEFAULT 'PENDING',
  message       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at    TIMESTAMPTZ,

  CONSTRAINT uq_job_candidate_project_worker UNIQUE (project_id, worker_id)
);

CREATE INDEX idx_job_candidates_project_id ON job_candidates (project_id);
CREATE INDEX idx_job_candidates_worker_id  ON job_candidates (worker_id);
CREATE INDEX idx_job_candidates_status     ON job_candidates (status);

CREATE TRIGGER trg_job_candidates_updated_at
  BEFORE UPDATE ON job_candidates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
