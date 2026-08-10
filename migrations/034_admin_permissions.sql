-- Real, minimal Support-tier RBAC — until now `user_role` had exactly one
-- 'admin' value, so every admin account was implicitly a super admin with
-- unrestricted access. These two flags let a super admin dial back a
-- specific admin account's rights on the two actions the "Access Control
-- Matrix" UI already claimed to gate (Ban Users, Force Release Escrow) —
-- previously that UI was pure mock state (see AdminTeamTab.jsx), backed by
-- nothing. Meaningless for worker/business rows; defaults TRUE so every
-- existing admin keeps exactly the full access they already had today, with
-- no migration-day surprise.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_ban_users BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS can_release_funds BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TYPE platform_log_action ADD VALUE IF NOT EXISTS 'PERMISSIONS_UPDATED';
