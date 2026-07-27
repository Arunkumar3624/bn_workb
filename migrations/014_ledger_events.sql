-- Incremental migration — see migrations/013_job_timelines.sql for the
-- same pattern. Appended to schema.sql so a fresh `npm run migrate` still
-- gets this in one pass.
--
-- MASTER_ECONOMY_PLAN.md Part 1/Part 11 — the real per-event Ledger. Until
-- now, awardXp only ever wrote a running total to users.xp/bridge_tokens;
-- there was no way to show an honest "earn history" list (every mockup of
-- the Ledger page shows one) without inventing fake rows. This is that
-- real audit trail — one row per credit, the actual source of truth a
-- Ledger UI reads from.
CREATE TABLE ledger_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_type  TEXT NOT NULL,
  xp_delta    INTEGER NOT NULL DEFAULT 0,
  token_delta INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ledger_events_user_id_created_at ON ledger_events (user_id, created_at DESC);
