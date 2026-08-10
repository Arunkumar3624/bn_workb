-- The Dual-Ban Moderation Engine — a softer, reversible sibling to the
-- existing full account ban (users.is_active). A full ban invalidates the
-- session, blocks login, and freezes everything, which traps a business's
-- escrowed funds mid-project if the only real issue was chat behavior (a
-- contact-info leak, harassment) — the worker still needs to be able to
-- submit their finished work and get paid. is_chat_banned only ever gates
-- sending a chat message (see messages.controller.js's assertNotChatBanned)
-- — it never touches login, submissions, or payouts.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_chat_banned BOOLEAN NOT NULL DEFAULT FALSE;

-- Distinct audit log actions from the existing SECURITY_USER_BANNED/
-- SECURITY_USER_UNBANNED pair, so Security Monitor's history can tell a
-- full ban apart from a chat-only one.
ALTER TYPE platform_log_action ADD VALUE IF NOT EXISTS 'SECURITY_CHAT_BANNED';
ALTER TYPE platform_log_action ADD VALUE IF NOT EXISTS 'SECURITY_CHAT_UNBANNED';
