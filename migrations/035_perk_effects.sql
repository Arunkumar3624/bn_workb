-- Incremental migration — see migrations/021_perk_purchases.sql for the
-- purchase-transaction half of this feature (already real: token debit +
-- persisted redemption row with a resolved expiry).
--
-- This migration adds what's needed to wire a REAL effect into each perk:
-- 1. target_type/target_id — most perks aren't account-wide toggles, they
--    boost a specific thing (a job post, an application, a dispute, a
--    withdrawal). An untyped reference (same "free-text discriminator"
--    shape as ledger_events.event_type) resolved by perk_id in application
--    code, rather than one nullable FK column per possible target table.
-- 2. consumed_at — the missing "used" signal for one-time perks. Until now
--    `expires_at IS NULL` meant "no expiry, active forever," which can't
--    distinguish "one-time, still available" from "one-time, already used."
ALTER TABLE perk_purchases ADD COLUMN target_type TEXT;
ALTER TABLE perk_purchases ADD COLUMN target_id UUID;
ALTER TABLE perk_purchases ADD COLUMN consumed_at TIMESTAMPTZ;

CREATE INDEX idx_perk_purchases_target ON perk_purchases (perk_id, target_id) WHERE target_id IS NOT NULL;

-- Skill Bridge Profile Audit (worker perk) — same "self-reported request,
-- real WorkBridge action grants it" shape as escrow_funding_requests /
-- withdrawal_requests, but the outcome is a written review, not an
-- approve/reject state machine — its own small status enum instead of
-- reusing withdrawal_status.
CREATE TYPE audit_status AS ENUM ('PENDING', 'REVIEWED');

CREATE TABLE profile_audit_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  purchase_id UUID REFERENCES perk_purchases(id) ON DELETE SET NULL,
  status      audit_status NOT NULL DEFAULT 'PENDING',
  admin_note  TEXT,
  resolved_by UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_profile_audit_requests_status ON profile_audit_requests (status, created_at);
CREATE INDEX idx_profile_audit_requests_worker ON profile_audit_requests (worker_id, created_at DESC);
