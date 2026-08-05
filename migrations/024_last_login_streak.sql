-- Incremental migration — see migrations/023_impersonation_audit.sql for
-- the same "one real column, no invented tables" pattern.
--
-- Backs the Daily Streak Engine: users.current_streak already exists
-- (schema.sql) but nothing has ever written to it — it's sat at its
-- default 0 for every user. This adds the one column needed to compute it
-- for real: the last time this user actually logged in, compared against
-- now() on every login (see users.repository.js's recordLogin).
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
