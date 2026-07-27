import { Router } from "express";
import { guard } from "../middleware/guard.js";
import { getLedger } from "../controllers/gamification.controller.js";

export const gamificationRouter = Router();

gamificationRouter.use(guard);
gamificationRouter.get("/ledger", getLedger);
