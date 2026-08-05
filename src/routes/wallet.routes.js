import { Router } from "express";
import { guard, requireRole, blockDuringImpersonation } from "../middleware/guard.js";
import { validate } from "../middleware/validate.js";
import { ledgerQuerySchema, withdrawSchema } from "../validators/wallet.validators.js";
import { getWallet, withdraw, listMyWithdrawals } from "../controllers/wallet.controller.js";

export const walletRouter = Router();

walletRouter.use(guard);

walletRouter.get("/", validate(ledgerQuerySchema, "query"), getWallet);
// Only workers hold a payable wallet in this domain — a business's spend
// lives in their own transaction history, not a cash-out-able balance.
// blockDuringImpersonation: an admin debugging a worker's account must
// never be able to move real money out of it via a withdrawal request.
walletRouter.post("/withdraw", requireRole("worker"), blockDuringImpersonation, validate(withdrawSchema), withdraw);
walletRouter.get("/withdrawals", requireRole("worker"), listMyWithdrawals);
