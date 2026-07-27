-- Incremental migration — see migrations/011_system_notices.sql for the
-- same pattern. Appended to schema.sql so a fresh `npm run migrate` still
-- gets this in one pass.
--
-- MASTER_ECONOMY_PLAN.md Phase 1 — the data foundation only. No app logic
-- reads/writes these columns yet; that's Phase 1's next step (the
-- quality-gate + Momentum/Ledger event writers), not this migration.

-- Two-Door Reveal state (Part 3 of the plan) — 'hidden' until a worker
-- reaches Door A (first completed job) or Door B (5 consecutive
-- rejections); the app layer flips this, nothing here does it
-- automatically.
CREATE TYPE standing_door_state AS ENUM ('hidden', 'win', 'span');

-- Worker Economy columns (Task 1). Conceptually worker-only per this
-- phase's scope, but — matching the existing wallet_balance precedent —
-- left unrestricted by role at the schema level rather than adding a new
-- CHECK constraint; the business-side Ledger (Corporate Credits) and its
-- own XP track are a later phase, not modeled here yet.
ALTER TABLE users ADD COLUMN xp             INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN current_level  INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN bridge_tokens  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN current_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN standing_door  standing_door_state NOT NULL DEFAULT 'hidden';

ALTER TABLE users ADD CONSTRAINT chk_xp_non_negative CHECK (xp >= 0);
ALTER TABLE users ADD CONSTRAINT chk_current_level_min CHECK (current_level >= 1);
ALTER TABLE users ADD CONSTRAINT chk_bridge_tokens_non_negative CHECK (bridge_tokens >= 0);
ALTER TABLE users ADD CONSTRAINT chk_current_streak_non_negative CHECK (current_streak >= 0);

-- Deliberately NOT added to public_user_profiles (schema.sql) in this
-- migration — the Two-Door Reveal's entire point is that xp/current_level
-- stay hidden until standing_door leaves 'hidden'. Exposing them on the
-- public view before that gating logic exists would leak the exact thing
-- the design is meant to hide. That wiring is Phase 3, not this migration.

-- ─── The Abstracted Ladder's backend-only config (Task 2) ──────────────────
-- MASTER_ECONOMY_PLAN.md Part 5a — real fee percentages live only here,
-- looked up by level at project completion. No API route ever serves this
-- table's platform_fee_pct column to a client; only the tier_name may
-- surface in UI copy.
CREATE TABLE gamification_config (
  level_threshold   INTEGER PRIMARY KEY,
  tier_name         VARCHAR(50) NOT NULL,
  platform_fee_pct  NUMERIC(4, 2) NOT NULL,

  CONSTRAINT chk_level_threshold_min CHECK (level_threshold >= 1),
  CONSTRAINT chk_platform_fee_pct_range CHECK (platform_fee_pct BETWEEN 0 AND 100)
);

INSERT INTO gamification_config (level_threshold, tier_name, platform_fee_pct) VALUES
  (1,   'Standard', 10.00),
  (50,  'Silver',   9.00),
  (100, 'Gold',     8.50),
  (150, 'Platinum', 8.25),
  (200, 'Diamond',  8.00);
