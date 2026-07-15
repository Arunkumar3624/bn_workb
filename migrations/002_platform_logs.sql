-- Incremental migration — schema.sql doesn't have a versioned migration
-- system (see TECH_ROADMAP.md), so this is applied directly against the
-- running container rather than replaying the whole schema. The same
-- statements are appended to schema.sql itself so a fresh `npm run migrate`
-- on an empty database still gets this table in one pass.

CREATE TYPE platform_log_action AS ENUM (
  'VERIFY_APPROVED',
  'VERIFY_REJECTED',
  'DISPUTE_REFUNDED',
  'DISPUTE_RELEASED'
);

-- The admin audit trail — every admin "Execute" action (verify, resolve)
-- writes one row here, inside the SAME transaction as the action itself, so
-- a failed log write rolls back the whole action instead of leaving an
-- un-audited state change.
CREATE TABLE platform_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id           UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action             platform_log_action NOT NULL,
  target_user_id     UUID REFERENCES users(id) ON DELETE RESTRICT,
  target_project_id  UUID REFERENCES projects(id) ON DELETE RESTRICT,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_logs_admin_id ON platform_logs (admin_id);
CREATE INDEX idx_platform_logs_target_project_id ON platform_logs (target_project_id);

CREATE TRIGGER trg_platform_logs_updated_at
  BEFORE UPDATE ON platform_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
