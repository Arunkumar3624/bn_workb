import { Router } from "express";
import { guard } from "../middleware/guard.js";
import { listPurchases, purchasePerk } from "../controllers/perks.controller.js";

export const perksRouter = Router();

perksRouter.use(guard);
perksRouter.get("/purchases", listPurchases);
perksRouter.post("/purchase", purchasePerk);
