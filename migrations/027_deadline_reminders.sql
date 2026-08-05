-- Incremental migration — see migrations/026_push_subscriptions.sql for the
-- same pattern.
--
-- Marks a project once its "deadline in 1 day" push reminder has actually
-- been sent (see services/deadlineReminders.js), so the periodic scheduler
-- can query "not yet reminded" directly instead of re-notifying the same
-- project every time it runs. A nullable timestamp rather than a boolean —
-- keeping *when* it fired is free and useful for support/debugging, same
-- convention as decided_at on job_candidates.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deadline_reminder_sent_at TIMESTAMPTZ;
