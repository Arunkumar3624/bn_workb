import { z } from "zod";

// Shape of the PushSubscription object the browser's Push API returns —
// see pushNotifications.js on the frontend, which posts subscription.toJSON()
// directly.
export const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});
