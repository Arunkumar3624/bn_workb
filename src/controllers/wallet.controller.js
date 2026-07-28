import { transaction } from "../db/client.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as transactionsRepo from "../repositories/transactions.repository.js";
import * as usersRepo from "../repositories/users.repository.js";
import * as withdrawalRequestsRepo from "../repositories/withdrawal_requests.repository.js";

// GET /api/wallet — the caller's own balance + a page of their ledger.
// There's no :userId param — you can only ever fetch your own wallet,
// derived from the JWT, never someone else's by guessing an id.
export const getWallet = asyncHandler(async (req, res) => {
  const [user, transactions] = await Promise.all([
    usersRepo.findById(req.user.id),
    transactionsRepo.listForUser(req.user.id, req.query),
  ]);

  if (!user) throw ApiError.notFound("User not found.");

  res.json({
    data: {
      balance: user.wallet_balance,
      transactions,
    },
  });
});

// POST /api/wallet/withdraw — requests a cash-out to a real UPI id/bank
// account. Debits wallet_balance immediately (so the same funds can't be
// requested twice) and opens a PENDING withdrawal_requests row — but does
// NOT write a transactions.WITHDRAWAL row yet, since no real money has
// actually moved to the worker's bank/UPI account. That only happens once
// WorkBridge staff mark it resolved (see admin.controller.js's
// resolveWithdrawal) — same human-in-the-loop shape as requestRelease /
// completeProject in projects.controller.js.
export const withdraw = asyncHandler(async (req, res) => {
  const { amount, payoutMethod, payoutDetails } = req.body;

  const result = await transaction(async (client) => {
    const user = await usersRepo.findForUpdate(client, req.user.id);
    if (!user) throw ApiError.notFound("User not found.");

    if (Number(user.wallet_balance) < amount) {
      throw ApiError.badRequest("Insufficient balance.", {
        balance: user.wallet_balance,
        requested: amount,
      });
    }

    const updatedUser = await usersRepo.incrementWalletBalance(client, req.user.id, -amount);
    const request = await withdrawalRequestsRepo.insert(client, {
      workerId: req.user.id,
      amount,
      payoutMethod,
      payoutDetails,
    });

    return { balance: updatedUser.wallet_balance, request };
  });

  res.status(201).json({ data: result });
});

// GET /api/wallet/withdrawals — the worker's own withdrawal request
// history (PENDING/APPROVED/REJECTED), so WorkerWallet.jsx can honestly show
// "still pending" instead of implying a withdrawal completed the moment it
// was requested.
export const listMyWithdrawals = asyncHandler(async (req, res) => {
  const data = await withdrawalRequestsRepo.listForWorker(req.user.id);
  res.json({ data });
});
