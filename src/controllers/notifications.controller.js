import { asyncHandler } from "../utils/asyncHandler.js";
import * as notificationsRepo from "../repositories/notifications.repository.js";

// GET /api/notifications — the caller's own real history, newest first,
// plus the unread count so the bell badge and the list never disagree
// (computed from the same table in the same request, not two round trips
// that could race).
export const listNotifications = asyncHandler(async (req, res) => {
  const [notifications, unreadCount] = await Promise.all([
    notificationsRepo.listForUser(req.user.id),
    notificationsRepo.countUnread(req.user.id),
  ]);
  res.json({ data: { notifications, unreadCount } });
});

// PATCH /api/notifications/mark-read — clears every unread row for this
// user at once, fired when the drawer opens (see NotificationBell.jsx) —
// there's no per-item "mark read" affordance.
export const markRead = asyncHandler(async (req, res) => {
  await notificationsRepo.markAllRead(req.user.id);
  res.json({ data: { message: "Marked as read." } });
});
