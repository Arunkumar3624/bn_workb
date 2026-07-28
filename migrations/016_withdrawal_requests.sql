-- Incremental migration — see migrations/015_pending_release.sql for the
-- same "human-in-the-loop before real money moves" pattern, applied here to
-- worker cash-outs instead of business fund releases.
--
-- Today's POST /wallet/withdraw instantly debits wallet_balance and writes
-- a WITHDRAWAL transaction row from a free-text "destination" string — no
-- real UPI ID/bank account is ever captured, and there's no admin-facing
-- record of it at all (admin.repository.js's listAllInvoices only reads
-- the `projects` table). This table gives withdrawals their own real
-- lifecycle: PENDING the moment a worker requests one (wallet_balance is
-- debited immediately, so the same funds can't be withdrawn twice), then
-- APPROVED (staff actually sent the money — a real transactions.WITHDRAWAL
-- row is written at that point) or REJECTED (staff couldn't complete it —
-- wallet_balance is refunded).

CREATE TYPE withdrawal_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE payout_method AS ENUM ('UPI', 'BANK_TRANSFER');

CREATE TABLE withdrawal_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id       uuid NOT NULL REFERENCES users(id),
  amount          numeric(12, 2) NOT NULL CHECK (amount > 0),
  payout_method   payout_method NOT NULL,
  payout_details  text NOT NULL, -- UPI id, or "Bank: X · Acc: Y · IFSC: Z"
  status          withdrawal_status NOT NULL DEFAULT 'PENDING',
  admin_note      text,
  resolved_by     uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

CREATE INDEX idx_withdrawal_requests_status ON withdrawal_requests (status, created_at);
CREATE INDEX idx_withdrawal_requests_worker ON withdrawal_requests (worker_id, created_at DESC);

ALTER TYPE platform_log_action ADD VALUE IF NOT EXISTS 'WITHDRAWAL_APPROVED';
ALTER TYPE platform_log_action ADD VALUE IF NOT EXISTS 'WITHDRAWAL_REJECTED';
