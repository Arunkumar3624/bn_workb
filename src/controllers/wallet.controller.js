import { transaction } from "../db/client.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as transactionsRepo from "../repositories/transactions.repository.js";
import * as usersRepo from "../repositories/users.repository.js";

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

// POST /api/wallet/withdraw — cash out to a bank/UPI destination. Debits
// wallet_balance and records a WITHDRAWAL row atomically so a crash between
// the two can't leave the ledger and the cached balance disagreeing.
export const withdraw = asyncHandler(async (req, res) => {
  const { amount, destination } = req.body;

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
    const txn = await transactionsRepo.insert(
      {
        // A WITHDRAWAL isn't tied to any one project or business — schema.sql
        // makes project_id/business_id nullable specifically for this case
        // (chk_project_scoped_unless_withdrawal enforces that every other
        // transaction type still requires both).
        projectId: null,
        businessId: null,
        workerId: req.user.id,
        type: "WITHDRAWAL",
        direction: "debit",
        amount,
        referenceNote: `Withdrawal to ${destination}`,
      },
      client
    );

    return { balance: updatedUser.wallet_balance, transaction: txn };
  });

  res.status(201).json({ data: result });
});
