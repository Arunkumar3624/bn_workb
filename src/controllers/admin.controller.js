import { transaction } from "../db/client.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as adminRepo from "../repositories/admin.repository.js";
import * as projectsRepo from "../repositories/projects.repository.js";
import * as transactionsRepo from "../repositories/transactions.repository.js";
import * as usersRepo from "../repositories/users.repository.js";

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
