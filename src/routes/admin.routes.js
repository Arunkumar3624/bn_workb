import { Router } from "express";
import { guard, requireRole } from "../middleware/guard.js";
import { validate } from "../middleware/validate.js";
import {
  listVerifications,
  verifyUser,
  getPlatformStats,
  listDisputes,
  resolveDispute,
  listAllUsers,
  listTransactions,
} from "../controllers/admin.controller.js";
import { listPendingSubmissions, reviewSubmission } from "../controllers/submissions.controller.js";
import { reviewSubmissionSchema } from "../validators/submissions.validators.js";

export const adminRouter = Router();

// "Admin Guard" — every route below requires a valid JWT (guard) AND a
// role: "admin" claim (requireRole). This is the same requireRole(...) used
// to gate business-only/worker-only routes elsewhere — a separate bespoke
// adminMiddleware would just duplicate this exact check.
adminRouter.use(guard, requireRole("admin"));

adminRouter.get("/verify", listVerifications);
adminRouter.patch("/verify/:id", verifyUser);

adminRouter.get("/users", listAllUsers);

adminRouter.get("/stats", getPlatformStats);

adminRouter.get("/disputes", listDisputes);
adminRouter.post("/disputes/:id/resolve", resolveDispute);

adminRouter.get("/transactions", listTransactions);

// The Trust Checker's moderation queue.
adminRouter.get("/submissions", listPendingSubmissions);
adminRouter.patch("/submissions/:id", validate(reviewSubmissionSchema), reviewSubmission);
