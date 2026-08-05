import webpush from "web-push";
import * as pushSubscriptionsRepo from "../repositories/push_subscriptions.repository.js";

// Same "optional, silent no-op without config" convention as
// email.service.js's requireEmailConfig — push is a real feature once
// VAPID_* is set (see .env / Render env vars), but its absence should
// never break the request that triggered the notification (a chat message
// send, a project status change, etc. must still succeed either way).
function requirePushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

const config = requirePushConfig();
if (config) {
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
}

export function isPushConfigured() {
  return config !== null;
}

export function getVapidPublicKey() {
  return config?.publicKey ?? null;
}

// Fire-and-forget from the caller's perspective — every call site in
// events.js already just triggered a real socket event for the same
// notification; a push failure (unconfigured, a dead subscription, a
// transient network error) must never throw back into that code path.
// Sends to every device this user has subscribed on, and prunes any
// subscription the push service reports as gone (404/410 — uninstalled,
// permission revoked, or the browser expired it) so listForUser stops
// carrying dead weight.
export async function sendPushToUser(userId, { title, body, url }) {
  if (!config) return;

  const subscriptions = await pushSubscriptionsRepo.listForUser(userId);
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({ title, body, url: url ?? "/" });
  const staleEndpoints = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          staleEndpoints.push(sub.endpoint);
        } else {
          console.error(`[push] Delivery to ${sub.endpoint} failed:`, err.statusCode, err.body);
        }
      }
    })
  );

  if (staleEndpoints.length > 0) {
    await pushSubscriptionsRepo.deleteByEndpoints(staleEndpoints);
  }
}
