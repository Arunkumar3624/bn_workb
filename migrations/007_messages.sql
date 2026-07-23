-- Incremental migration — see migrations/006_pending_signups.sql for the
-- same pattern. The same statements are appended to schema.sql so a fresh
-- `npm run migrate` on an empty database still gets this in one pass.

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
