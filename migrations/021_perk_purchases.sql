-- Incremental migration — see migrations/020_support_threads.sql for the
-- same pattern. Appended to schema.sql so a fresh `npm run migrate` still
-- gets this in one pass.
--
-- Turns "Purchase" in BusinessPerksShop.jsx / WorkerTokenShop.jsx from an
-- inert "coming soon" button into a real, Ledger-backed spend — one row
-- per redemption, with a resolved expiry for time-boxed tiers. The perk's
-- real effect on job-feed ranking / proposal-matching (MASTER_ECONOMY_PLAN.md
-- Phase 3's slot-cap logic) is still a separate, not-yet-built feature —
-- this only makes the purchase itself (balance debit + persisted record)
-- real, same "real data or honestly-labeled preview" principle used
-- everywhere else on this platform.
CREATE TABLE perk_purchases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  perk_id     TEXT NOT NULL,
  tier_id     TEXT NOT NULL,
  label       TEXT NOT NULL,
  token_cost  INTEGER NOT NULL CHECK (token_cost > 0),
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_perk_purchases_user_id_created_at ON perk_purchases (user_id, created_at DESC);
