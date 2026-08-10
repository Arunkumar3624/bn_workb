-- The Onboarding Wizard's completion flag — a real, server-persisted
-- column (not just a localStorage flag) so it doesn't reappear on a
-- different device/browser. Defaults FALSE for new signups and TRUE for
-- every existing account (they've already been using the app — there's
-- nothing to "onboard" them into retroactively).
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_completed_onboarding BOOLEAN NOT NULL DEFAULT FALSE;
-- Backfill only — every account that already exists as of this migration
-- has necessarily already been using the app. The DEFAULT FALSE above still
-- applies to every new signup from here on.
UPDATE users SET has_completed_onboarding = TRUE WHERE has_completed_onboarding = FALSE;
