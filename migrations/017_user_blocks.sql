-- Incremental migration — see migrations/016_withdrawal_requests.sql for
-- the same pattern.
--
-- WhatsApp-style blocking: either participant on a chat can block the
-- other — blocks messaging in BOTH directions (not just one-way muting),
-- reversible any time by the blocker. This is a plain user-to-user
-- relationship, not scoped to one project — a business/worker pair often
-- has more than one project over time, and a block should follow the
-- relationship, not just one job.
CREATE TABLE user_blocks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  blocked_id  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_blocks UNIQUE (blocker_id, blocked_id),
  CONSTRAINT chk_no_self_block CHECK (blocker_id <> blocked_id)
);

CREATE INDEX idx_user_blocks_blocker ON user_blocks (blocker_id);
CREATE INDEX idx_user_blocks_blocked ON user_blocks (blocked_id);
