-- Incremental migration — see migrations/026_push_subscriptions.sql for the
-- same "one real table, no invented data" pattern.
--
-- Persists the exact same events push notifications already fire for
-- (buildProjectPushCopy in realtime/events.js) — those were fire-and-forget
-- to a device and gone forever once shown; this gives a user an in-app
-- history to actually look back at (the notification bell/drawer), sourced
-- from the same copy generation so the two can never say different things
-- about the same event.
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  type        TEXT NOT NULL, -- 'SYSTEM' | 'PAYMENT' | 'PROJECT'
  url         TEXT,          -- click-through target, same one push already used
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created_at ON notifications (user_id, created_at DESC);
