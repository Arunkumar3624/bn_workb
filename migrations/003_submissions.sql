-- Incremental migration — applied directly against the running container
-- (see migrations/002_platform_logs.sql for the same pattern). The same
-- statements are appended to schema.sql so a fresh `npm run migrate` on an
-- empty database still gets this in one pass.

ALTER TYPE platform_log_action ADD VALUE IF NOT EXISTS 'SUBMISSION_APPROVED';
ALTER TYPE platform_log_action ADD VALUE IF NOT EXISTS 'SUBMISSION_REJECTED';

CREATE TYPE submission_type AS ENUM ('link', 'image');
CREATE TYPE submission_status AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- The Trust Checker — every deliverable either participant shares on a
-- project sits in PENDING_REVIEW until an admin reviews it; the counterparty
-- never sees it until APPROVED (enforced in submissions.controller.js).
CREATE TABLE submissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  submitted_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type              submission_type NOT NULL,
  url               TEXT,
  image_data        TEXT,
  caption           TEXT,
  status            submission_status NOT NULL DEFAULT 'PENDING_REVIEW',
  reviewed_by       UUID REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_submission_content CHECK (
    (type = 'link' AND url IS NOT NULL) OR (type = 'image' AND image_data IS NOT NULL)
  )
);

CREATE INDEX idx_submissions_project_id ON submissions (project_id);
CREATE INDEX idx_submissions_status ON submissions (status);

CREATE TRIGGER trg_submissions_updated_at
  BEFORE UPDATE ON submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
