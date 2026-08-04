-- Incremental migration — see migrations/017_user_blocks.sql for the same
-- pattern.
--
-- Real-time Customer Care — one continuous support conversation per user
-- (worker or business) with WorkBridge staff, separate from project chat
-- (messages table) since it isn't scoped to any one project. Mirrors the
-- real project-chat architecture (one thread, append-only messages,
-- delivered live over the same socket infrastructure) rather than
-- inventing a different shape for the same kind of problem.
CREATE TYPE support_status AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE support_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status      support_status NOT NULL DEFAULT 'OPEN',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_support_threads_user UNIQUE (user_id)
);

CREATE TABLE support_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id    UUID NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
  sender_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- Denormalized off the sender's real role at send time — 'admin' here
  -- specifically means "WorkBridge staff sent this," not just any user
  -- whose role happens to be admin later; keeps ChatThread-style rendering
  -- (which side is this bubble on) a pure lookup, no join needed.
  sender_role  user_role NOT NULL,
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_messages_thread_id ON support_messages (thread_id, created_at);
CREATE INDEX idx_support_threads_status ON support_threads (status, updated_at DESC);

CREATE TRIGGER trg_support_threads_updated_at
  BEFORE UPDATE ON support_threads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
