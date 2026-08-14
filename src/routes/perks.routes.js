import { Router } from "express";
import { guard } from "../middleware/guard.js";
import { listPurchases, listActivePurchases, listMyProfileAudits, purchasePerk } from "../controllers/perks.controller.js";

export const perksRouter = Router();

perksRouter.use(guard);
perksRouter.get("/purchases", listPurchases);
perksRouter.get("/active", listActivePurchases);
perksRouter.get("/profile-audits", listMyProfileAudits);
perksRouter.post("/purchase", purchasePerk);
