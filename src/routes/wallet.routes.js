import { Router } from "express";
import { guard, requireRole } from "../middleware/guard.js";
import { validate } from "../middleware/validate.js";
import { ledgerQuerySchema, withdrawSchema } from "../validators/wallet.validators.js";
import { getWallet, withdraw } from "../controllers/wallet.controller.js";

export const walletRouter = Router();

walletRouter.use(guard);

walletRouter.get("/", validate(ledgerQuerySchema, "query"), getWallet);
// Only workers hold a payable wallet in this domain — a business's spend
// lives in their own transaction history, not a cash-out-able balance.
walletRouter.post("/withdraw", requireRole("worker"), validate(withdrawSchema), withdraw);
