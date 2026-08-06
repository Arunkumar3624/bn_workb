-- Incremental migration — see migrations/025_reinvite_after_decision.sql for
-- the same "one real fix, no invented tables" pattern.
--
-- Lets a worker pin exactly ONE earned badge (WorkerMilestones.jsx's
-- MILESTONES, mirrored here as MILESTONE_LEVELS in
-- src/utils/gamification.js) to show as a small overlay icon on their
-- avatar — unlike Clash of Clans' 3-badge loadout, WorkBridge only ever
-- shows one. Levels are a hardcoded CHECK, not a foreign key, since
-- milestones are a static design-doc list, not a DB table.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pinned_milestone_level INTEGER;

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_pinned_milestone_level;
ALTER TABLE users ADD CONSTRAINT chk_pinned_milestone_level
  CHECK (pinned_milestone_level IS NULL OR pinned_milestone_level IN (5, 10, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 175, 200));

-- public_user_profiles must re-derive its column list since ALTER TABLE
-- doesn't retroactively change an existing view — pinned_milestone_level is
-- masked to NULL until standing_door leaves 'hidden', the same Two-Door
-- Reveal gate xp/current_level are already held behind, so a business can't
-- see a badge before a worker's real track record has been revealed.
CREATE OR REPLACE VIEW public_user_profiles AS
  SELECT id, role, name, avatar_url, title, verified, behavior_score,
         rating, reviews_count, created_at, profile,
         CASE WHEN standing_door <> 'hidden' THEN pinned_milestone_level ELSE NULL END AS pinned_milestone_level
  FROM users;
