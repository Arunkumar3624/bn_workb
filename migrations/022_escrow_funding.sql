-- Incremental migration — see migrations/016_withdrawal_requests.sql for
-- the same "human-in-the-loop before real money moves" pattern.
--
-- Closes a real gap: today, ACCEPTED -> FUNDS_SECURED (secureFunds in
-- projects.controller.js) is an instant, unverified status flip — a
-- business clicks "Secure Funds" and the project is marked funded with no
-- payment proof of any kind, and that same self-reported budget figure is
-- what later becomes the worker's real wallet_balance credit at
-- completeProject. This migration adds a real verification step: the
-- business submits transfer proof (UTR/transaction ID + a screenshot),
-- which only moves the project to PENDING_FUNDS — WorkBridge staff
-- reviewing and confirming the transfer (resolveEscrowFunding in
-- admin.controller.js) is what actually grants FUNDS_SECURED and writes
-- the real ledger row. Same shape as PENDING_RELEASE/completeProject:
-- the business's action only requests the state, a real WorkBridge action
-- grants it.
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'PENDING_FUNDS' BEFORE 'FUNDS_SECURED';

ALTER TYPE platform_log_action ADD VALUE IF NOT EXISTS 'ESCROW_FUNDING_APPROVED';
ALTER TYPE platform_log_action ADD VALUE IF NOT EXISTS 'ESCROW_FUNDING_REJECTED';

-- Reuses withdrawal_status (PENDING/APPROVED/REJECTED) — semantically the
-- same lifecycle as withdrawal_requests, no need for a duplicate enum.
-- screenshot_url is a base64 data URI stored as TEXT, same convention as
-- users.avatar_url / profile.coverUrl elsewhere in this schema — no
-- separate file storage exists in this stack.
CREATE TABLE escrow_funding_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  business_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  utr_reference   TEXT NOT NULL,
  screenshot_url  TEXT NOT NULL,
  status          withdrawal_status NOT NULL DEFAULT 'PENDING',
  admin_note      TEXT,
  resolved_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);

CREATE INDEX idx_escrow_funding_requests_status  ON escrow_funding_requests (status, created_at);
CREATE INDEX idx_escrow_funding_requests_project ON escrow_funding_requests (project_id);
