-- Incremental migration for OTP-based authentication support.
-- This adds the auth_otps table used by /api/auth/send-otp and /api/auth/verify-otp.

CREATE TABLE IF NOT EXISTS auth_otps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier   TEXT NOT NULL,
  role         user_role NOT NULL,
  otp_code     TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_otps_identifier_role ON auth_otps (identifier, role);
CREATE INDEX IF NOT EXISTS idx_auth_otps_expires_at ON auth_otps (expires_at);
