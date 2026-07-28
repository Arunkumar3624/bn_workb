import { Router } from "express";
import { guard } from "../middleware/guard.js";
import { getLedger, getBusinessTierStatus } from "../controllers/gamification.controller.js";

export const gamificationRouter = Router();

gamificationRouter.use(guard);
gamificationRouter.get("/ledger", getLedger);
gamificationRouter.get("/business-tier", getBusinessTierStatus);
