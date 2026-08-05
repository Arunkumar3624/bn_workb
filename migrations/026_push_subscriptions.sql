-- Incremental migration — see migrations/024_last_login_streak.sql for the
-- same pattern.
--
-- One row per browser/device a user has granted Notification permission
-- and subscribed to push on (see push.service.js / routes/push.routes.js).
-- A user can have several — phone, laptop, a second browser — each with its
-- own endpoint. endpoint is the push service URL the browser's Push API
-- returned (unique per subscription); p256dh/auth are the encryption keys
-- web-push needs to encrypt the payload for that specific endpoint.
CREATE TABLE push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions (user_id);
