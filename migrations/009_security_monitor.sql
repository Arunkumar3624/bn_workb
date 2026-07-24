-- Incremental migration — see migrations/008_job_board.sql for the same
-- pattern. Appended to schema.sql so a fresh `npm run migrate` still gets
-- this in one pass.
--
-- Real account ban — set FALSE by Security Monitor's "Ban User" action.
-- Checked at login (auth.controller.js) and on every authenticated request
-- (guard.js), so a ban actually stops someone, not just future logins.
ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TYPE platform_log_action ADD VALUE IF NOT EXISTS 'SECURITY_REDACTED_AND_SENT';
ALTER TYPE platform_log_action ADD VALUE IF NOT EXISTS 'SECURITY_USER_BANNED';
ALTER TYPE platform_log_action ADD VALUE IF NOT EXISTS 'SECURITY_WARNING_SENT';
ALTER TYPE platform_log_action ADD VALUE IF NOT EXISTS 'SECURITY_DISMISSED';

-- Chat's contact-info filter (utils/contactFilter.js) hard-blocks a message
-- before it's ever stored — nothing "slips through" to review after the
-- fact. This is the one place that attempt is recorded anyway, purely for
-- Security Monitor to spot someone repeatedly trying to move a conversation
-- off-platform. The blocked text itself is stored here (nowhere else) —
-- visible only to admins, never to the counterparty.
CREATE TYPE blocked_attempt_status AS ENUM ('PENDING', 'REDACTED_AND_SENT', 'BANNED', 'WARNED', 'DISMISSED');

CREATE TABLE blocked_message_attempts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  sender_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  attempted_text    TEXT NOT NULL,
  status            blocked_attempt_status NOT NULL DEFAULT 'PENDING',
  resolved_by       UUID REFERENCES users(id) ON DELETE RESTRICT,
  resolved_at       TIMESTAMPTZ,
  resolution_note   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_blocked_attempts_project_id ON blocked_message_attempts (project_id);
CREATE INDEX idx_blocked_attempts_sender_id  ON blocked_message_attempts (sender_id);
CREATE INDEX idx_blocked_attempts_status     ON blocked_message_attempts (status);
