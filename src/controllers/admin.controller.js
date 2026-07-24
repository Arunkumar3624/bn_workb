import { transaction } from "../db/client.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { containsContactInfo } from "../utils/contactFilter.js";
import * as adminRepo from "../repositories/admin.repository.js";
import * as projectsRepo from "../repositories/projects.repository.js";
import * as transactionsRepo from "../repositories/transactions.repository.js";
import * as usersRepo from "../repositories/users.repository.js";
import * as messagesRepo from "../repositories/messages.repository.js";
import * as blockedAttemptsRepo from "../repositories/blocked_attempts.repository.js";
import { emitProjectEvent } from "../realtime/events.js";

const PLATFORM_FEE_PCT_FALLBACK = 8;

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ─── Verification Center ─────────────────────────────────────────────────────

// GET /api/admin/verify
export const listVerifications = asyncHandler(async (_req, res) => {
  const data = await adminRepo.listPendingVerifications();
  res.json({ data });
});

// GET /api/admin/users — the full user directory for the admin Users tab.
export const listAllUsers = asyncHandler(async (_req, res) => {
  const data = await adminRepo.listAllUsers();
  res.json({ data });
});

// PATCH /api/admin/verify/:id — body: { approved: boolean }
// Approve sets users.is_verified (verified column); Reject leaves it false
// but still writes an audit row, so there's a record even though nothing
// about the user row itself changes. Both wrapped in a transaction with the
// platform_logs insert — a failed log write rolls back the verification too.
export const verifyUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { approved } = req.body ?? {};
  if (typeof approved !== "boolean") {
    throw ApiError.badRequest("Body must include { approved: boolean }.");
  }

  const result = await transaction(async (client) => {
    const user = await usersRepo.findById(id);
    if (!user) throw ApiError.notFound("User not found.");
    if (user.verified) throw ApiError.badRequest("User is already verified.");

    const updated = approved ? await adminRepo.setUserVerified(client, id, true) : user;

    await adminRepo.insertPlatformLog(client, {
      adminId: req.user.id,
      action: approved ? "VERIFY_APPROVED" : "VERIFY_REJECTED",
      targetUserId: id,
      notes: approved ? `Approved verification for ${user.name}` : `Rejected verification for ${user.name}`,
    });

    return updated;
  });

  res.json({ data: result });
});

// ─── Escrow Oversight (KPI Engine) ────────────────────────────────────────────

// GET /api/admin/stats
export const getPlatformStats = asyncHandler(async (_req, res) => {
  const [stats, weeklyRevenue] = await Promise.all([adminRepo.getPlatformStats(), adminRepo.getWeeklyRevenue()]);
  res.json({ data: { ...stats, weeklyRevenue } });
});

// ─── Dispute Management ───────────────────────────────────────────────────────

// GET /api/admin/disputes
export const listDisputes = asyncHandler(async (_req, res) => {
  const data = await adminRepo.listDisputedProjects();
  res.json({ data });
});

// POST /api/admin/disputes/:id/resolve — body: { resolution: "refund" | "release" }
// The "Nuclear Options." Reuses the exact same ledger/wallet primitives as
// POST /api/projects/:id/complete (projects/transactions/users repos), plus
// a platform_logs row — all inside one transaction, so status + ledger +
// wallet + audit log commit together or not at all.
export const resolveDispute = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { resolution } = req.body ?? {};
  if (resolution !== "refund" && resolution !== "release") {
    throw ApiError.badRequest('Body must include { resolution: "refund" | "release" }.');
  }

  const result = await transaction(async (client) => {
    const project = await projectsRepo.findByIdForUpdate(client, id);
    if (!project) throw ApiError.notFound("Project not found.");
    if (project.status !== "DISPUTED") {
      throw ApiError.badRequest(`Cannot resolve a project in status ${project.status} — expected DISPUTED.`);
    }

    if (resolution === "refund") {
      // Nothing was ever paid out at DISPUTED (that only happens at
      // COMPLETED), so refunding just voids the hold — no wallet debit,
      // one REFUND ledger row for the audit trail.
      const updatedProject = await projectsRepo.updateStatus(id, "CANCELLED", client);

      const refundTxn = await transactionsRepo.insert(
        {
          projectId: id,
          workerId: project.worker_id,
          businessId: project.business_id,
          type: "REFUND",
          direction: "debit",
          amount: Number(project.budget),
          fundsStatus: "REFUNDED",
          referenceNote: `Dispute resolved — refunded to business – ${project.title}`,
        },
        client
      );

      await adminRepo.insertPlatformLog(client, {
        adminId: req.user.id,
        action: "DISPUTE_REFUNDED",
        targetProjectId: id,
        notes: `Refunded ${formatAmount(project.budget)} to ${project.business_id}`,
      });

      return { project: updatedProject, transaction: refundTxn };
    }

    // resolution === "release" — identical math to completeProject.
    const updatedProject = await projectsRepo.updateStatus(id, "COMPLETED", client);

    const budget = Number(project.budget);
    const feePct = Number(project.platform_fee_pct ?? PLATFORM_FEE_PCT_FALLBACK);
    const fee = round2(budget * (feePct / 100));
    const earnings = round2(budget - fee);

    const payoutTxn = await transactionsRepo.insert(
      {
        projectId: id,
        workerId: project.worker_id,
        businessId: project.business_id,
        type: "PAYOUT",
        direction: "credit",
        amount: earnings,
        fundsStatus: "RELEASED",
        referenceNote: `Dispute resolved — released to freelancer – ${project.title}`,
      },
      client
    );
    await transactionsRepo.insert(
      {
        projectId: id,
        workerId: project.worker_id,
        businessId: project.business_id,
        type: "PLATFORM_FEE",
        direction: "debit",
        amount: fee,
        referenceNote: `Platform fee (${feePct}%) – ${project.title}`,
      },
      client
    );
    await usersRepo.incrementWalletBalance(client, project.worker_id, earnings);

    await adminRepo.insertPlatformLog(client, {
      adminId: req.user.id,
      action: "DISPUTE_RELEASED",
      targetProjectId: id,
      notes: `Released ${formatAmount(earnings)} to worker ${project.worker_id}`,
    });

    return { project: updatedProject, payout: payoutTxn, earnings, fee };
  });

  res.json({ data: result });
});

// ─── Transaction History ──────────────────────────────────────────────────────

// GET /api/admin/transactions
export const listTransactions = asyncHandler(async (_req, res) => {
  const data = await adminRepo.listAllInvoices();
  res.json({ data });
});

function formatAmount(n) {
  return `₹${Number(n).toLocaleString("en-IN")}`;
}

// ─── Security Monitor ─────────────────────────────────────────────────────────
// Reviews blocked_message_attempts (messages.controller.js writes one every
// time containsContactInfo rejects a send) — the actual message content is
// never stored anywhere else, so this queue is the only record of it.

// GET /api/admin/blocked-attempts
export const listBlockedAttempts = asyncHandler(async (_req, res) => {
  const data = await blockedAttemptsRepo.listPending();
  res.json({ data });
});

// GET /api/admin/messages?search=... — the message monitor. Separate from
// blocked-attempts: this searches every real message ever sent, so support
// can proactively catch contact-info shares the filter's regex misses
// (evasion tricks like commas/odd spacing between digits), not just the
// ones that got auto-blocked.
export const searchMessages = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const data = await adminRepo.searchMessages({ search });
  res.json({ data });
});

// GET /api/admin/messages/businesses — Message Monitor's "Cascading
// Workspace" left column.
export const listMonitoredBusinesses = asyncHandler(async (_req, res) => {
  const data = await adminRepo.listMonitoredBusinesses();
  res.json({ data });
});

// GET /api/admin/messages/businesses/:businessId/workers — middle column.
export const listWorkersForBusiness = asyncHandler(async (req, res) => {
  const data = await adminRepo.listWorkersForBusiness(req.params.businessId);
  res.json({ data });
});

// PATCH /api/admin/users/:id/moderate — the Cascading Workspace's top-bar
// actions (Warn/Deduct/Ban/Unban) on a selected worker/business, independent
// of any single message. Same real effects and same admin-immunity guard as
// moderateMessageSender below; kept separate because there's no message row
// to anchor the log note to here — projectId/note are optional context.
// body: { action: "ban" | "unban" | "warn" | "deduct_points", points?, projectId?, note? }
export const moderateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, points, projectId, note } = req.body ?? {};

  const target = await usersRepo.findById(id);
  if (!target) throw ApiError.notFound("User not found.");

  let logAction;
  let logNotes;
  let noticeMessage = null;

  const result = await transaction(async (client) => {
    let updated = target;

    if (action === "ban") {
      if (target.role === "admin") {
        throw ApiError.badRequest("Admin accounts can't be banned from Message Monitor.");
      }
      updated = await usersRepo.setActive(client, target.id, false);
      logAction = "SECURITY_USER_BANNED";
      logNotes = note || `Banned ${target.name} from Message Monitor.`;
    } else if (action === "unban") {
      updated = await usersRepo.setActive(client, target.id, true);
      logAction = "SECURITY_USER_UNBANNED";
      logNotes = note || `Unbanned ${target.name} from Message Monitor.`;
    } else if (action === "warn") {
      // A real, permanent message in the project's own chat — both sides
      // see it, and it stays in the transcript as proof they were told,
      // so a later ban can't be met with "I didn't know the rules."
      if (!projectId) {
        throw ApiError.badRequest("projectId is required to warn a user — the warning is delivered in that project's chat.");
      }
      const noticeText =
        note ||
        `Admin Warning: sharing phone numbers, email addresses, or other contact details in chat is not allowed on WorkBridge. This is a formal warning — continued violations may result in account suspension.`;
      noticeMessage = await messagesRepo.createSystemNotice(client, { projectId, adminId: req.user.id, body: noticeText });
      logAction = "SECURITY_WARNING_SENT";
      logNotes = `Warned ${target.name} from Message Monitor: "${noticeText}"`;
    } else if (action === "deduct_points") {
      if (target.role === "admin") {
        throw ApiError.badRequest("Admin accounts don't have a behavior score.");
      }
      const amount = Number(points);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw ApiError.badRequest("points must be a positive number.");
      }
      updated = await usersRepo.adjustBehaviorScore(client, target.id, -amount);
      logAction = "SECURITY_POINTS_DEDUCTED";
      logNotes = note || `Deducted ${amount} behavior score points from ${target.name}.`;
    } else {
      throw ApiError.badRequest("action must be one of: ban, unban, warn, deduct_points.");
    }

    await adminRepo.insertPlatformLog(client, {
      adminId: req.user.id,
      action: logAction,
      targetUserId: target.id,
      targetProjectId: projectId || null,
      notes: logNotes,
    });

    return updated;
  });

  // The warning needs to show up live for whoever has that project's chat
  // open right now, not just on their next reload — same event ChatThread
  // already listens for (MESSAGE_CREATED).
  if (noticeMessage) {
    const project = await projectsRepo.findById(projectId);
    if (project) {
      emitProjectEvent(project, "MESSAGE_CREATED", { messageId: noticeMessage.id, senderId: req.user.id });
    }
  }

  res.json({ data: result });
});

// PATCH /api/admin/messages/:id/moderate — Message Monitor's manual
// counterpart to blocked-attempts' resolution actions: support found a real
// contact-info share (or other bad behavior) that evaded the auto-filter
// and is acting on the sender directly off that message.
// body: { action: "ban" | "unban" | "warn" | "deduct_points", points? }
export const moderateMessageSender = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, points } = req.body ?? {};

  const message = await messagesRepo.findById(id);
  if (!message) throw ApiError.notFound("Message not found.");

  const target = await usersRepo.findById(message.sender_id);
  if (!target) throw ApiError.notFound("Sender not found.");

  let logAction;
  let logNotes;

  const result = await transaction(async (client) => {
    let updated = target;

    if (action === "ban") {
      if (target.role === "admin") {
        throw ApiError.badRequest("Admin accounts can't be banned from Message Monitor.");
      }
      updated = await usersRepo.setActive(client, target.id, false);
      logAction = "SECURITY_USER_BANNED";
      logNotes = `Banned ${target.name} from Message Monitor for: "${message.body}"`;
    } else if (action === "unban") {
      updated = await usersRepo.setActive(client, target.id, true);
      logAction = "SECURITY_USER_UNBANNED";
      logNotes = `Unbanned ${target.name} from Message Monitor (message: "${message.body}")`;
    } else if (action === "warn") {
      logAction = "SECURITY_WARNING_SENT";
      logNotes = `Warned ${target.name} from Message Monitor for: "${message.body}"`;
    } else if (action === "deduct_points") {
      if (target.role === "admin") {
        throw ApiError.badRequest("Admin accounts don't have a behavior score.");
      }
      const amount = Number(points);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw ApiError.badRequest("points must be a positive number.");
      }
      updated = await usersRepo.adjustBehaviorScore(client, target.id, -amount);
      logAction = "SECURITY_POINTS_DEDUCTED";
      logNotes = `Deducted ${amount} behavior score points from ${target.name} for: "${message.body}"`;
    } else {
      throw ApiError.badRequest("action must be one of: ban, unban, warn, deduct_points.");
    }

    await adminRepo.insertPlatformLog(client, {
      adminId: req.user.id,
      action: logAction,
      targetUserId: target.id,
      targetProjectId: message.project_id,
      notes: logNotes,
    });

    return updated;
  });

  res.json({ data: result });
});

// PATCH /api/admin/blocked-attempts/:id — body: { action, editedBody?, note? }
// action: "redact_and_send" (creates a real message with the admin's cleaned
// text, on the original sender's behalf) | "ban" (real — sets
// users.is_active false, enforced by guard.js/auth.controller.js) | "warn" |
// "dismiss" (both log-only — no notification system exists to actually
// deliver a warning yet).
export const resolveBlockedAttempt = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, editedBody, note } = req.body;

  const attempt = await blockedAttemptsRepo.findById(id);
  if (!attempt) throw ApiError.notFound("Blocked attempt not found.");
  if (attempt.status !== "PENDING") {
    throw ApiError.badRequest(`This was already resolved (${attempt.status}).`);
  }

  let sentMessage = null;

  const result = await transaction(async (client) => {
    let status;
    let logAction;
    let logNotes;

    if (action === "redact_and_send") {
      if (!editedBody || !editedBody.trim()) {
        throw ApiError.badRequest("editedBody is required to redact and send.");
      }
      if (containsContactInfo(editedBody)) {
        throw ApiError.badRequest("The edited message still contains contact info — remove it before sending.");
      }
      sentMessage = await messagesRepo.create({
        projectId: attempt.project_id,
        senderId: attempt.sender_id,
        body: editedBody.trim(),
      });
      status = "REDACTED_AND_SENT";
      logAction = "SECURITY_REDACTED_AND_SENT";
      logNotes = `Redacted and forwarded a blocked message on project ${attempt.project_id}`;
    } else if (action === "ban") {
      const target = await usersRepo.findById(attempt.sender_id);
      if (target?.role === "admin") {
        throw ApiError.badRequest("Admin accounts can't be banned from Security Monitor.");
      }
      await usersRepo.setActive(client, attempt.sender_id, false);
      status = "BANNED";
      logAction = "SECURITY_USER_BANNED";
      logNotes = `Banned ${attempt.sender_name} for a blocked contact-info attempt`;
    } else if (action === "warn") {
      status = "WARNED";
      logAction = "SECURITY_WARNING_SENT";
      logNotes = `Warned ${attempt.sender_name} for a blocked contact-info attempt`;
    } else if (action === "dismiss") {
      status = "DISMISSED";
      logAction = "SECURITY_DISMISSED";
      logNotes = "Dismissed a blocked contact-info attempt as a false alarm";
    } else {
      throw ApiError.badRequest("action must be one of: redact_and_send, ban, warn, dismiss.");
    }

    const resolved = await blockedAttemptsRepo.resolve(client, id, {
      status,
      resolvedBy: req.user.id,
      resolutionNote: note,
    });

    await adminRepo.insertPlatformLog(client, {
      adminId: req.user.id,
      action: logAction,
      targetUserId: attempt.sender_id,
      targetProjectId: attempt.project_id,
      notes: logNotes,
    });

    return resolved;
  });

  // Only redact_and_send creates something the sender's own chat needs to
  // see live — ban/warn/dismiss have no realtime-visible side effect for
  // either participant.
  if (sentMessage) {
    const project = await projectsRepo.findById(attempt.project_id);
    if (project) {
      emitProjectEvent(project, "MESSAGE_CREATED", { messageId: sentMessage.id, senderId: attempt.sender_id });
    }
  }

  res.json({ data: result });
});
