-- Incremental migration — moves chat from strictly per-project to a
-- persistent per-relationship thread: one (business_id, worker_id) pair now
-- has exactly one chat_threads row, spanning every project they've ever done
-- together, instead of a brand new conversation per project. This is
-- additive and non-breaking — the existing /api/projects/:id/messages
-- routes keep working exactly as before (still filtered to one project);
-- thread_id is a new, initially-parallel lookup key that the new
-- /api/threads/:id routes use for the merged view. See
-- messages.controller.js's mustBeParticipant (unchanged) vs.
-- mustBeThreadParticipant (new).

CREATE TABLE IF NOT EXISTS chat_threads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  worker_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_chat_threads_business_worker UNIQUE (business_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_threads_business_id ON chat_threads (business_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_worker_id ON chat_threads (worker_id);

DROP TRIGGER IF EXISTS trg_chat_threads_updated_at ON chat_threads;
CREATE TRIGGER trg_chat_threads_updated_at
  BEFORE UPDATE ON chat_threads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- project_id stays populated for every message the OLD per-project routes
-- write (unchanged) — thread_id is purely additive there. A message sent
-- through the NEW /api/threads/:id route with no specific project in mind
-- leaves project_id NULL, which is why NOT NULL has to come off.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES chat_threads(id) ON DELETE CASCADE;
ALTER TABLE messages ALTER COLUMN project_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_thread_id_created_at ON messages (thread_id, created_at);

-- Same additive change for Security Monitor's evidence table — a blocked
-- attempt made through the new thread routes isn't necessarily about one
-- specific project either.
ALTER TABLE blocked_message_attempts ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES chat_threads(id) ON DELETE CASCADE;
ALTER TABLE blocked_message_attempts ALTER COLUMN project_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blocked_attempts_thread_id ON blocked_message_attempts (thread_id);

-- ─── Backfill ───────────────────────────────────────────────────────────────
-- One chat_threads row per unique (business_id, worker_id) pair that has
-- ever exchanged a message, then point every existing message/blocked
-- attempt at it. Every project with messages already has a real worker_id —
-- messages.controller.js's mustBeParticipant requires a real participant,
-- and only a project with a real worker_id ever has one — so this join is
-- never against a NULL worker_id.

INSERT INTO chat_threads (business_id, worker_id)
SELECT DISTINCT p.business_id, p.worker_id
FROM projects p
JOIN messages m ON m.project_id = p.id
WHERE p.worker_id IS NOT NULL
ON CONFLICT (business_id, worker_id) DO NOTHING;

UPDATE messages m
SET thread_id = ct.id
FROM projects p
JOIN chat_threads ct ON ct.business_id = p.business_id AND ct.worker_id = p.worker_id
WHERE m.project_id = p.id
  AND m.thread_id IS NULL;

UPDATE blocked_message_attempts a
SET thread_id = ct.id
FROM projects p
JOIN chat_threads ct ON ct.business_id = p.business_id AND ct.worker_id = p.worker_id
WHERE a.project_id = p.id
  AND a.thread_id IS NULL;
