import { Router } from "express";
import { guard, requireRole } from "../middleware/guard.js";
import {
  listVerifications,
  verifyUser,
  getPlatformStats,
  listDisputes,
  resolveDispute,
} from "../controllers/admin.controller.js";

export const adminRouter = Router();

// "Admin Guard" — every route below requires a valid JWT (guard) AND a
// role: "admin" claim (requireRole). This is the same requireRole(...) used
// to gate business-only/worker-only routes elsewhere — a separate bespoke
// adminMiddleware would just duplicate this exact check.
adminRouter.use(guard, requireRole("admin"));

adminRouter.get("/verify", listVerifications);
adminRouter.patch("/verify/:id", verifyUser);

adminRouter.get("/stats", getPlatformStats);

adminRouter.get("/disputes", listDisputes);
adminRouter.post("/disputes/:id/resolve", resolveDispute);
