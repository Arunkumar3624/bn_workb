import { Router } from "express";
import { guard } from "../middleware/guard.js";
import { validate } from "../middleware/validate.js";
import { getVapidKey, subscribe, unsubscribe } from "../controllers/push.controller.js";
import { subscribeSchema, unsubscribeSchema } from "../validators/push.validators.js";

export const pushRouter = Router();

// Public — the VAPID public key isn't secret (it's embedded in the
// browser's own subscribe() call), and the frontend needs it before it
// knows whether push is even configured on this deploy.
pushRouter.get("/vapid-public-key", getVapidKey);

pushRouter.use(guard);
pushRouter.post("/subscribe", validate(subscribeSchema), subscribe);
pushRouter.post("/unsubscribe", validate(unsubscribeSchema), unsubscribe);
