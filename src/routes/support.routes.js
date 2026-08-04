import { Router } from "express";
import { guard, requireRole } from "../middleware/guard.js";
import { validate } from "../middleware/validate.js";
import { sendSupportMessageSchema, resolveThreadSchema } from "../validators/support.validators.js";
import {
  getMyThread,
  sendMyMessage,
  listThreadsForAdmin,
  getThreadMessagesForAdmin,
  sendAdminMessage,
  updateThreadStatus,
} from "../controllers/support.controller.js";

export const supportRouter = Router();

supportRouter.use(guard);

// A worker or business's own conversation with WorkBridge staff.
supportRouter.get("/thread", getMyThread);
supportRouter.post("/thread/messages", validate(sendSupportMessageSchema), sendMyMessage);

// Staff's Customer Care inbox — every conversation, any user.
supportRouter.get("/threads", requireRole("admin"), listThreadsForAdmin);
supportRouter.get("/threads/:id/messages", requireRole("admin"), getThreadMessagesForAdmin);
supportRouter.post("/threads/:id/messages", requireRole("admin"), validate(sendSupportMessageSchema), sendAdminMessage);
supportRouter.patch("/threads/:id", requireRole("admin"), validate(resolveThreadSchema), updateThreadStatus);
