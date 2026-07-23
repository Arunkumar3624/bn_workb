-- WorkBridge — PostgreSQL Schema
-- Design notes at the bottom of this file explain the non-obvious calls.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";   -- case-insensitive email uniqueness/lookups

-- ─── Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('worker', 'business', 'admin');

-- Mirrors the frontend's PROJECT_STATUS_FLOW exactly (utils/projectStatus.js),
-- plus two terminal states the demo build never modeled: CANCELLED/DISPUTED.
CREATE TYPE project_status AS ENUM (
  'OPEN',              -- public job post, no worker assigned yet — see job_candidates
  'INVITED',           -- business has proposed/invited, worker hasn't responded
  'ACCEPTED',           -- worker accepted (or business hired) but no funds moved yet
  'FUNDS_SECURED',
  'WORK_IN_PROGRESS',
  'FILES_SUBMITTED',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED'
);

CREATE TYPE transaction_type AS ENUM (
  'FUNDS_SECURED',  -- business's payment moves into holding
  'PLATFORM_FEE',   -- WorkBridge's cut, deducted at payout
  'PAYOUT',         -- worker's earnings released to their wallet
  'WITHDRAWAL',      -- worker cashes out of WorkBridge to their bank/UPI
  'REFUND'
);

CREATE TYPE transaction_direction AS ENUM ('credit', 'debit');

-- Named funds_status, not escrow_status — WorkBridge product copy never
-- uses "escrow" (funds/secured/protection instead); kept consistent here
-- even though this is an internal schema term, not user-facing text.
CREATE TYPE funds_status AS ENUM ('HELD', 'RELEASED', 'REFUNDED');

-- ─── updated_at trigger ─────────────────────────────────────────────────────
-- Applied to all 4 tables below so "updated_at" is a real audit fact, not a
-- column the application has to remember to touch by hand.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 1. users ───────────────────────────────────────────────────────────────
-- One table for all three roles rather than three separate profile tables —
-- worker/business-specific fields that don't apply to every role live in
-- `profile` (JSONB) instead of a long list of always-nullable columns.
-- Contact fields (email/phone) live here but are NEVER selected into a
-- public-facing response without an auth check — see public_user_profiles
-- view below, which is the only thing an unauthenticated API route should
-- ever query.

CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role              user_role NOT NULL,
  name              TEXT NOT NULL,
  email             CITEXT NOT NULL UNIQUE,
  phone             TEXT,
  password_hash     TEXT NOT NULL,
  avatar_url        TEXT,
  title             TEXT,                          -- e.g. "Full-Stack Developer" (worker) / "Retail" (business industry)
  verified          BOOLEAN NOT NULL DEFAULT FALSE, -- ID-verified worker / payment-verified business
  -- Registration-OTP confirmed — NOT the same flag as `verified` above (see
  -- migrations/005_email_verified.sql). Defaults TRUE for fresh-install/seed
  -- rows; only POST /api/auth/register explicitly sets this FALSE for a new
  -- signup awaiting its OTP.
  email_verified    BOOLEAN NOT NULL DEFAULT TRUE,
  behavior_score    SMALLINT,                       -- 0–1000 trust metric; workers/businesses only
  rating            NUMERIC(3, 2),                  -- cached avg of reviews.rating for this user
  reviews_count     INTEGER NOT NULL DEFAULT 0,
  wallet_balance    NUMERIC(12, 2) NOT NULL DEFAULT 0, -- cached; transactions is the source of truth (see notes)
  profile           JSONB NOT NULL DEFAULT '{}',     -- role-specific extras: skills[], hourly_rate, company_size, etc.
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Admin accounts don't carry a Behavior Score — it's a worker/business
  -- trust metric, meaningless for platform staff.
  CONSTRAINT chk_admin_has_no_behavior_score
    CHECK (role <> 'admin' OR behavior_score IS NULL),

  CONSTRAINT chk_behavior_score_range
    CHECK (behavior_score IS NULL OR behavior_score BETWEEN 0 AND 1000),

  CONSTRAINT chk_rating_range
    CHECK (rating IS NULL OR rating BETWEEN 0 AND 5)
);

CREATE INDEX idx_users_role ON users (role);

-- Originally the registration-OTP store; superseded there by
-- pending_signups below (which holds the OTP alongside the rest of a
-- not-yet-verified signup). Repurposed for password-reset codes instead of
-- standing up a near-identical second table — see auth.repository.js's
-- createPasswordResetOtp/findLatestPasswordResetOtp/deletePasswordResetOtp.
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

-- Holds signup details temporarily between POST /api/auth/register and a
-- successful POST /api/auth/verify-otp — see migrations/006_pending_signups.sql
-- for the full rationale (the real `users` row is only created once
-- verification succeeds, so an abandoned signup never touches `users`).
CREATE TABLE IF NOT EXISTS pending_signups (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          CITEXT NOT NULL UNIQUE,
  role           user_role NOT NULL,
  name           TEXT NOT NULL,
  phone          TEXT,
  password_hash  TEXT NOT NULL,
  otp_code       TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(), -- doubles as "OTP last (re)sent at"
  expires_at     TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_signups_email ON pending_signups (email);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The only view an unauthenticated (or cross-user) API route should read
-- from — email and phone are structurally absent, not just filtered by the
-- application layer, so a forgotten `WHERE` clause can't leak them.
-- `profile` IS included — it's the free-form public professional info
-- (skills/hourly_rate/bio/location, set via PATCH /api/profiles/me), not
-- PII, and BusinessWorkers.jsx's browse-workers listing needs it.
CREATE VIEW public_user_profiles AS
  SELECT id, role, name, avatar_url, title, verified, behavior_score,
         rating, reviews_count, created_at, profile
  FROM users;

-- ─── 2. projects ────────────────────────────────────────────────────────────
-- The canonical replacement for the frontend's invitesDb + businessThreadsDb
-- split — one row per project, always linked to exactly one worker and one
-- business (never nullable; a project can't exist without both parties,
-- unlike the old "qa" pre-hire threads which only had a business + candidate
-- with no committed worker yet — model those as INVITED/ACCEPTED status
-- instead of a nullable worker_id).

CREATE TABLE projects (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- Nullable: an OPEN job post has no worker yet — see job_candidates for
  -- how one eventually gets assigned (application accepted, or a direct
  -- invite accepted). Every other status always carries a real worker_id.
  worker_id         UUID REFERENCES users(id) ON DELETE RESTRICT,
  title             TEXT NOT NULL,
  description       TEXT,
  budget            NUMERIC(12, 2) NOT NULL CHECK (budget > 0),
  platform_fee_pct  NUMERIC(5, 2) NOT NULL DEFAULT 8.00,
  status            project_status NOT NULL DEFAULT 'INVITED',
  deadline          DATE,
  -- Append-only FSM history, e.g. [{"status": "FUNDS_SECURED", "at": "..."}].
  -- A normalized project_timeline_events table (project_id, status,
  -- occurred_at) would be the more correct audit-trail design — recommended
  -- if you want real per-event querying/indexing later; kept as JSONB here
  -- to stay within the 4 core tables asked for.
  timeline          JSONB NOT NULL DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_worker_business_distinct CHECK (worker_id <> business_id)
);

CREATE INDEX idx_projects_business_id ON projects (business_id);
CREATE INDEX idx_projects_worker_id   ON projects (worker_id);
CREATE INDEX idx_projects_status      ON projects (status);

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Enforces "strictly links to a Worker and a Business" at the data layer,
-- not just by column naming — a plain FK can't check the referenced row's
-- role, so this needs a trigger.
CREATE OR REPLACE FUNCTION enforce_project_participant_roles()
RETURNS TRIGGER AS $$
DECLARE
  business_role user_role;
  worker_role   user_role;
BEGIN
  SELECT role INTO business_role FROM users WHERE id = NEW.business_id;
  IF business_role IS DISTINCT FROM 'business' THEN
    RAISE EXCEPTION 'projects.business_id (%) must reference a user with role = business', NEW.business_id;
  END IF;

  -- worker_id is only ever NULL for an OPEN post — nothing to check yet.
  IF NEW.worker_id IS NOT NULL THEN
    SELECT role INTO worker_role FROM users WHERE id = NEW.worker_id;
    IF worker_role IS DISTINCT FROM 'worker' THEN
      RAISE EXCEPTION 'projects.worker_id (%) must reference a user with role = worker', NEW.worker_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projects_enforce_roles
  BEFORE INSERT OR UPDATE OF business_id, worker_id ON projects
  FOR EACH ROW EXECUTE FUNCTION enforce_project_participant_roles();

-- ─── 3. transactions ────────────────────────────────────────────────────────
-- The wallet ledger — every credit/debit against a worker's wallet_balance
-- (and, for FUNDS_SECURED/PLATFORM_FEE rows, the business's payment) is a
-- row here. business_id/worker_id are denormalized off `projects` for query
-- convenience (list a user's transactions without a join) but project_id
-- remains the source of truth for which project they belong to.

CREATE TABLE transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: a WITHDRAWAL is a worker cashing out their own wallet, not
  -- tied to any one project or business. Every other transaction type
  -- (FUNDS_SECURED/PLATFORM_FEE/PAYOUT/REFUND) is project-scoped and must
  -- carry both — enforced by chk_project_scoped_unless_withdrawal below.
  project_id        UUID REFERENCES projects(id) ON DELETE RESTRICT,
  worker_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  business_id       UUID REFERENCES users(id) ON DELETE RESTRICT,
  type              transaction_type NOT NULL,
  direction         transaction_direction NOT NULL,
  amount            NUMERIC(12, 2) NOT NULL CHECK (amount > 0), -- always positive; direction carries the sign
  currency          CHAR(3) NOT NULL DEFAULT 'INR',
  funds_status      funds_status,
  reference_note    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_project_scoped_unless_withdrawal
    CHECK (type = 'WITHDRAWAL' OR (project_id IS NOT NULL AND business_id IS NOT NULL))
);

CREATE INDEX idx_transactions_project_id  ON transactions (project_id);
CREATE INDEX idx_transactions_worker_id   ON transactions (worker_id);
CREATE INDEX idx_transactions_business_id ON transactions (business_id);
CREATE INDEX idx_transactions_created_at  ON transactions (created_at DESC);

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 4. reviews ─────────────────────────────────────────────────────────────
-- The Success Hub's rating/review submission — one row per (project,
-- reviewer). A completed project produces up to two rows: worker rates
-- business, business rates worker.

CREATE TABLE reviews (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  reviewer_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewee_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  rating            SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_reviewer_reviewee_distinct CHECK (reviewer_id <> reviewee_id),
  CONSTRAINT uq_one_review_per_project_per_reviewer UNIQUE (project_id, reviewer_id)
);

CREATE INDEX idx_reviews_project_id  ON reviews (project_id);
CREATE INDEX idx_reviews_reviewee_id ON reviews (reviewee_id);

CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 5. platform_logs ───────────────────────────────────────────────────────
-- The admin audit trail — every admin "Execute" action (verify, resolve
-- dispute) writes one row here, inside the SAME transaction as the action
-- itself, so a failed log write rolls back the whole action instead of
-- leaving an un-audited state change. See migrations/002_platform_logs.sql
-- for the incremental version of this same addition.

CREATE TYPE platform_log_action AS ENUM (
  'VERIFY_APPROVED',
  'VERIFY_REJECTED',
  'DISPUTE_REFUNDED',
  'DISPUTE_RELEASED',
  'SUBMISSION_APPROVED',
  'SUBMISSION_REJECTED'
);

CREATE TABLE platform_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id           UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action             platform_log_action NOT NULL,
  target_user_id     UUID REFERENCES users(id) ON DELETE RESTRICT,
  target_project_id  UUID REFERENCES projects(id) ON DELETE RESTRICT,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_logs_admin_id ON platform_logs (admin_id);
CREATE INDEX idx_platform_logs_target_project_id ON platform_logs (target_project_id);

CREATE TRIGGER trg_platform_logs_updated_at
  BEFORE UPDATE ON platform_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 6. submissions ─────────────────────────────────────────────────────────
-- The Trust Checker — every deliverable either participant shares on a
-- project (a worker's finished-work link/image, or a business's reference
-- material) sits in PENDING_REVIEW until an admin looks at it. The
-- counterparty never sees a submission until it's APPROVED — enforced by
-- the API layer (submissions.controller.js), since a plain SELECT can't
-- express "unless you're the submitter."
--
-- `url` (type='link') is the primary path — Google Drive/Dropbox/OneDrive/
-- any URL — since there's no object-storage (S3/GCS) integration yet.
-- `image_data` (type='image') is a small direct upload, stored as a data URL
-- the same way users.avatar_url is; it is NOT a general file-upload
-- mechanism and is capped client+server-side at a few MB, never 50-500MB —
-- that scale of binary needs real object storage, not a Postgres TEXT column.

CREATE TYPE submission_type AS ENUM ('link', 'image');
CREATE TYPE submission_status AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

CREATE TABLE submissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  submitted_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type              submission_type NOT NULL,
  url               TEXT,
  image_data        TEXT,
  caption           TEXT,
  status            submission_status NOT NULL DEFAULT 'PENDING_REVIEW',
  reviewed_by       UUID REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_submission_content CHECK (
    (type = 'link' AND url IS NOT NULL) OR (type = 'image' AND image_data IS NOT NULL)
  )
);

CREATE INDEX idx_submissions_project_id ON submissions (project_id);
CREATE INDEX idx_submissions_status ON submissions (status);

CREATE TRIGGER trg_submissions_updated_at
  BEFORE UPDATE ON submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 7. messages ────────────────────────────────────────────────────────────
-- Real-time per-project chat — one continuous thread spanning a project's
-- whole lifecycle (invite through completion), replacing the fake seeded
-- conversations in WorkerNegotiationInbox.jsx / BusinessNegotiationHub.jsx.
-- A message either carries text (body) or wraps a shared file
-- (submission_id, reusing the existing Trust Checker moderation pipeline —
-- see messages.repository.js for how visibility mirrors submissions' own
-- "submitter sees any status, counterparty only sees APPROVED" rule).

CREATE TABLE messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sender_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body          TEXT,
  submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_message_content CHECK (body IS NOT NULL OR submission_id IS NOT NULL)
);

CREATE INDEX idx_messages_project_id_created_at ON messages (project_id, created_at);

-- ─── 8. job_candidates ──────────────────────────────────────────────────────
-- The Open Job Board — a project can start life unassigned (worker_id
-- NULL, status OPEN), visible to every worker on the public feed. Workers
-- apply, or a business can directly invite one specific worker to an
-- already-open post without creating a second project — both paths are
-- "candidacies" against the SAME open project row, and the project itself
-- is only ever assigned a worker at the moment one candidacy is accepted
-- (by whichever side didn't initiate it: the business accepts an
-- application, the worker accepts an invite). Nothing about a pending
-- candidacy mutates the project row, so the public feed (WHERE status =
-- 'OPEN') stays accurate for every candidate still deciding — including an
-- invited worker who hasn't responded yet.

CREATE TYPE job_candidate_source AS ENUM ('APPLICATION', 'INVITE');
CREATE TYPE job_candidate_status AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CLOSED');

CREATE TABLE job_candidates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  worker_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source        job_candidate_source NOT NULL,
  status        job_candidate_status NOT NULL DEFAULT 'PENDING',
  message       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at    TIMESTAMPTZ,

  CONSTRAINT uq_job_candidate_project_worker UNIQUE (project_id, worker_id)
);

CREATE INDEX idx_job_candidates_project_id ON job_candidates (project_id);
CREATE INDEX idx_job_candidates_worker_id  ON job_candidates (worker_id);
CREATE INDEX idx_job_candidates_status     ON job_candidates (status);

CREATE TRIGGER trg_job_candidates_updated_at
  BEFORE UPDATE ON job_candidates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Design notes ───────────────────────────────────────────────────────────
--
-- 1. wallet_balance is a cache, transactions is the ledger of record.
--    Keep them in sync inside the same DB transaction that inserts a PAYOUT
--    row (application-level, or a trigger on transactions if you want the
--    DB to own it) — never let a client write wallet_balance directly.
--
-- 2. RESTRICT (not CASCADE) on every FK to users/projects. A marketplace's
--    financial and review history should never silently disappear because
--    someone deleted a user or project row — soft-delete (an is_active /
--    deleted_at column) is the right pattern here, not hard DELETE.
--
-- 3. NUMERIC(12,2) everywhere money appears — max ₹9,999,999,999.99, two
--    decimal places, exact (no float rounding error). Never FLOAT/DOUBLE
--    for currency, per the brief.
--
-- 4. Security: public_user_profiles is the only view with no email/phone
--    columns at all — structural, not a WHERE clause an engineer could
--    forget. Any endpoint serving profile data to someone who isn't the
--    user themselves (or an authenticated admin) should query this view,
--    not the users table directly.
