import { asyncHandler } from "../utils/asyncHandler.js";
import * as pushSubscriptionsRepo from "../repositories/push_subscriptions.repository.js";
import { getVapidPublicKey, isPushConfigured } from "../services/push.service.js";

// GET /api/push/vapid-public-key — public (no guard needed, this key isn't
// secret; it's embedded in every subscribe request the browser itself
// makes). configured:false lets the frontend skip showing the "Enable
// notifications" toggle at all rather than offering a button that would
// just fail.
export const getVapidKey = asyncHandler(async (_req, res) => {
  res.json({ data: { publicKey: getVapidPublicKey(), configured: isPushConfigured() } });
});

// POST /api/push/subscribe
export const subscribe = asyncHandler(async (req, res) => {
  const { endpoint, keys } = req.body;
  const saved = await pushSubscriptionsRepo.upsert({
    userId: req.user.id,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  });
  res.status(201).json({ data: saved });
});

// POST /api/push/unsubscribe — "disable notifications" on this device, or
// called defensively by the frontend when the browser itself reports the
// subscription as gone.
export const unsubscribe = asyncHandler(async (req, res) => {
  await pushSubscriptionsRepo.deleteByEndpoint(req.body.endpoint);
  res.status(204).send();
});
