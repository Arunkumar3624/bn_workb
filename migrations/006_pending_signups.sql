-- Holds signup details temporarily between POST /api/auth/register and a
-- successful POST /api/auth/verify-otp. The real `users` row is only ever
-- created once verification succeeds — if someone abandons the OTP step
-- (closes the tab, never checks their email), their email/phone/password
-- never touch the permanent `users` table at all, so that email is
-- immediately free to register again.
CREATE TABLE IF NOT EXISTS pending_signups (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          CITEXT NOT NULL UNIQUE,
  role           user_role NOT NULL,
  name           TEXT NOT NULL,
  phone          TEXT,
  password_hash  TEXT NOT NULL,
  otp_code       TEXT NOT NULL,
  -- Doubles as "OTP last (re)sent at" for the resend cooldown — refreshed
  -- on every resend, not just at first creation.
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_signups_email ON pending_signups (email);
