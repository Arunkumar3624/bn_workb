import { Router } from "express";
import { guard } from "../middleware/guard.js";
import { listNotifications, markRead } from "../controllers/notifications.controller.js";

export const notificationsRouter = Router();

notificationsRouter.use(guard);
notificationsRouter.get("/", listNotifications);
notificationsRouter.patch("/mark-read", markRead);
