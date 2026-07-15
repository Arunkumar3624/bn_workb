import { transaction } from "../db/client.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { canTransition } from "../domain/projectStatus.js";
import * as projectsRepo from "../repositories/projects.repository.js";
import * as transactionsRepo from "../repositories/transactions.repository.js";
import * as usersRepo from "../repositories/users.repository.js";

const PLATFORM_FEE_PCT_FALLBACK = 8; // schema.sql's projects.platform_fee_pct default

// GET /api/projects — list projects the caller participates in. "?role=" is
// optional (defaults to both); a caller can never list someone else's
// projects by passing an arbitrary businessId/workerId — those are always
// derived from req.user, not the query string.
export const listProjects = asyncHandler(async (req, res) => {
  const { status, role, page, pageSize } = req.query;

  const filters = { status, page, pageSize };
  if (role === "worker" || req.user.role === "worker") filters.workerId = req.user.id;
  if (role === "business" || req.user.role === "business") filters.businessId = req.user.id;
  // Admins with no ?role filter see everything (no workerId/businessId
  // constraint added) — enforce that only admins get this unfiltered view.
  if (req.user.role !== "admin" && !filters.workerId && !filters.businessId) {
    throw ApiError.forbidden("Specify ?role=worker or ?role=business.");
  }

  const projects = await projectsRepo.list(filters);
  res.json({ data: projects, page, pageSize });
});

// POST /api/projects — a business creates a new project/invite. Only a
// business may call this (enforced by requireRole("business") in the
// router) — the caller becomes businessId, never a client-supplied value.
export const createProject = asyncHandler(async (req, res) => {
  const project = await projectsRepo.create({
    businessId: req.user.id,
    workerId: req.body.workerId,
    title: req.body.title,
    description: req.body.description,
    budget: req.body.budget,
    deadline: req.body.deadline,
  });
  res.status(201).json({ data: project });
});

// PATCH /api/projects/:id — advance the FSM by exactly one non-terminal
// step (or cancel/dispute). COMPLETED is deliberately unreachable here —
// see completeProject below for why that has to be its own endpoint.
export const updateProjectStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status: toStatus } = req.body;

  const project = await projectsRepo.findById(id);
  if (!project) throw ApiError.notFound("Project not found.");

  const isParticipant = project.worker_id === req.user.id || project.business_id === req.user.id;
  if (!isParticipant && req.user.role !== "admin") {
    throw ApiError.forbidden("You are not a participant on this project.");
  }

  const allowed = canTransition({ fromStatus: project.status, toStatus, actorRole: req.user.role });
  if (!allowed) {
    throw ApiError.badRequest(
      `Cannot move project from ${project.status} to ${toStatus} as ${req.user.role}.`
    );
  }

  const updated = await projectsRepo.updateStatus(id, toStatus);
  res.json({ data: updated });
});

// POST /api/projects/:id/complete — the Logic Bridge. Only reachable when
// FILES_SUBMITTED, only by the business on the project. Runs atomically:
// project status -> COMPLETED, a PAYOUT credit + PLATFORM_FEE debit land in
// the ledger, and the worker's wallet_balance is incremented — all inside
// one DB transaction, so a failure at any step rolls back every part of it
// (no "project marked complete but worker never got paid" split-brain state).
export const completeProject = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await transaction(async (client) => {
    // FOR UPDATE — locks the row so two concurrent completion attempts on
    // the same project can't both succeed.
    const project = await projectsRepo.findByIdForUpdate(client, id);
    if (!project) throw ApiError.notFound("Project not found.");

    if (project.business_id !== req.user.id) {
      throw ApiError.forbidden("Only the business on this project can release payment.");
    }
    if (project.status !== "FILES_SUBMITTED") {
      throw ApiError.badRequest(`Cannot complete a project in status ${project.status} — expected FILES_SUBMITTED.`);
    }

    // a. Update project status
    const updatedProject = await projectsRepo.updateStatus(id, "COMPLETED", client);

    // Compute payout — NUMERIC columns come back as strings from pg by
    // default; Number() here, then round to paise/cents in real money math
    // (a real implementation should use a decimal library, not floats —
    // flagged here rather than silently done wrong).
    const budget = Number(project.budget);
    const feePct = Number(project.platform_fee_pct ?? PLATFORM_FEE_PCT_FALLBACK);
    const fee = round2(budget * (feePct / 100));
    const earnings = round2(budget - fee);

    // b. Insert into the transactions ledger — one row per money movement,
    // not one row with a net amount, so the fee is independently auditable.
    const payoutTxn = await transactionsRepo.insert(
      {
        projectId: id,
        workerId: project.worker_id,
        businessId: project.business_id,
        type: "PAYOUT",
        direction: "credit",
        amount: earnings,
        fundsStatus: "RELEASED",
        referenceNote: `Payment released – ${project.title}`,
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

    // c. Update the worker's wallet balance
    await usersRepo.incrementWalletBalance(client, project.worker_id, earnings);

    return { project: updatedProject, payout: payoutTxn, earnings, fee };
  });
  // ^ transaction() commits here if we reached this line, or has already
  // rolled back and re-thrown if anything above threw.

  res.json({ data: result });
});

function round2(n) {
  return Math.round(n * 100) / 100;
}
