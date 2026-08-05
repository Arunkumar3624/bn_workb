-- Incremental migration — see migrations/016_withdrawal_requests.sql for
-- the same "real event enum, no invented data" pattern.
--
-- Backs POST /api/admin/impersonate (admin.controller.js) — an admin-only,
-- audited "log in as this user" capability for support/debugging, not a
-- generic auth bypass. Every impersonation session writes a real
-- platform_logs row (admin id, target user id, timestamp) before the
-- short-lived elevated JWT is ever issued.
ALTER TYPE platform_log_action ADD VALUE IF NOT EXISTS 'IMPERSONATION_STARTED';
