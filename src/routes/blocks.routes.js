import { Router } from "express";
import { guard } from "../middleware/guard.js";
import { blockUser, unblockUser, getBlockStatus } from "../controllers/blocks.controller.js";

export const blocksRouter = Router();

blocksRouter.use(guard);

blocksRouter.get("/:userId/status", getBlockStatus);
blocksRouter.post("/:userId", blockUser);
blocksRouter.delete("/:userId", unblockUser);
