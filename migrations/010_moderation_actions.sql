-- Incremental migration — see migrations/009_security_monitor.sql for the
-- same pattern. Appended to schema.sql so a fresh `npm run migrate` still
-- gets this in one pass.
--
-- Message Monitor's moderation toolkit (admin.controller.js's
-- moderateMessageSender) needs two more audit-log actions beyond the four
-- added in 009: unbanning a wrongly-banned user, and deducting behavior
-- score points as a lighter-weight penalty than a full ban.
ALTER TYPE platform_log_action ADD VALUE IF NOT EXISTS 'SECURITY_USER_UNBANNED';
ALTER TYPE platform_log_action ADD VALUE IF NOT EXISTS 'SECURITY_POINTS_DEDUCTED';
