import { transaction } from "../db/client.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { canTransition } from "../domain/projectStatus.js";
import * as projectsRepo from "../repositories/projects.repository.js";
import * as transactionsRepo from "../repositories/transactions.repository.js";
import * as usersRepo from "../repositories/users.repository.js";
import * as ledgerEventsRepo from "../repositories/ledger_events.repository.js";
import { emitProjectEvent } from "../realtime/events.js";
import { calculateLevel } from "../utils/gamification.js";

// The first real token-earning trigger — MASTER_ECONOMY_PLAN.md's Ledger
// Tokens (Bridge Tokens) had a column since migration 012 but nothing ever
// credited any; every real account's balance was permanently 0 until this.
const COMPLETION_TOKEN_REWARD = 25;

// The business-side counterpart — first real trigger for a business's own
// Corporate Credits/XP track, previously also permanently 0 for every
// account (see migration 012's note that the business-side Ledger was "a
// later phase, not modeled here yet").
const BUSINESS_COMPLETION_XP_REWARD = 30;
const BUSINESS_COMPLETION_TOKEN_REWARD = 15;

const PLATFORM_FEE_PCT_FALLBACK = 8; // schema.sql's projects.platform_fee_pct default

// GET /api/projects — list projects the caller participates in. "?role=" is
// optional (defaults to both); a caller can never list someone else's
// projects by passing an arbitrary businessId/workerId — those are always
// derived from req.user, not the query string.
export const listProjects = asyncHandler(async (req, res) => {
  const { status, role, page, pageSize } = req.query;

  const filters = { status, page, pageSize, viewerId: req.user.id };
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

// GET /api/projects/:id — a single project, joined to both participants'
// public profiles. Only a participant (or admin) may fetch it — same
// participant check as updateProjectStatus.
export const getProject = asyncHandler(async (req, res) => {
  const project = await projectsRepo.findByIdJoined(req.params.id);
  if (!project) throw ApiError.notFound("Project not found.");

  const isParticipant = project.worker_id === req.user.id || project.business_id === req.user.id;
  if (!isParticipant && req.user.role !== "admin") {
    throw ApiError.forbidden("You are not a participant on this project.");
  }

  res.json({ data: project });
});

// GET /api/projects/open — the Job Board feed. Any authenticated worker can
// browse every OPEN, unassigned post — unlike listProjects above, this is
// deliberately NOT scoped to "projects I participate in."
export const listOpenProjects = asyncHandler(async (_req, res) => {
  const projects = await projectsRepo.listOpen();
  res.json({ data: projects });
});

// applicationWindow is now a plain number of days the business chose on
// the Post Job form — resolved to a real future timestamp here, once, so
// there's a single source of truth for the "now + N days" math instead of
// the frontend and backend each computing it independently.
const MIN_APPLICATION_WINDOW_DAYS = 1;
const MAX_APPLICATION_WINDOW_DAYS = 90;

function resolveApplicationDeadline(applicationWindowDays) {
  const days = Number(applicationWindowDays);
  if (!Number.isFinite(days) || days < MIN_APPLICATION_WINDOW_DAYS || days > MAX_APPLICATION_WINDOW_DAYS) {
    return null;
  }
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// POST /api/projects — a business creates a new project. Only a
// business may call this (enforced by requireRole("business") in the
// router) — the caller becomes businessId, never a client-supplied value.
// Omitting workerId posts an OPEN job board listing; passing one keeps the
// original direct-invite behavior (project starts INVITED).
export const createProject = asyncHandler(async (req, res) => {
  const project = await projectsRepo.create({
    businessId: req.user.id,
    workerId: req.body.workerId,
    title: req.body.title,
    description: req.body.description,
    budget: req.body.budget,
    deadline: req.body.deadline,
    applicationDeadline: resolveApplicationDeadline(req.body.applicationWindow),
    estimatedDuration: req.body.estimatedDuration,
  });

  // The worker has never seen this project before now, so they can't have
  // joined its project:<id> room yet — emitProjectEvent still reaches them
  // via their private user:<id> room, joined automatically on connect.
  const joined = await projectsRepo.findByIdJoined(project.id);
  emitProjectEvent(joined, "PROJECT_CREATED", {
    title: project.title,
    budget: Number(project.budget),
    businessName: joined.business_name,
  });

  res.status(201).json({ data: project });
});

// PATCH /api/projects/:id — advance the FSM by exactly one non-terminal
// step (or cancel/dispute). COMPLETED is deliberately unreachable here —
// see completeProject below for why that has to be its own endpoint.
export const updateProjectStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status: toStatus, note } = req.body;

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

  const updated = await projectsRepo.updateStatus(id, toStatus, undefined, note);

  // The only realtime emit that fires for a WORKER-initiated change (Start
  // Work, Submit Work) — secureFunds/completeProject below are business-
  // only actions with their own emits.
  emitProjectEvent(updated, "STATUS_CHANGED", { status: toStatus, actorRole: req.user.role, note });

  res.json({ data: updated });
});

// POST /api/projects/:id/secure-funds — ACCEPTED -> FUNDS_SECURED, only by
// the business on the project. Its own atomic endpoint (not a plain PATCH)
// because it writes a FUNDS_SECURED ledger row alongside the status change —
// same reasoning as completeProject below. No wallet_balance touched here:
// only workers hold a spendable balance in this schema, and this transaction
// represents money moving into holding, not being paid out yet.
export const secureFunds = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await transaction(async (client) => {
    const project = await projectsRepo.findByIdForUpdate(client, id);
    if (!project) throw ApiError.notFound("Project not found.");

    if (project.business_id !== req.user.id) {
      throw ApiError.forbidden("Only the business on this project can secure funds.");
    }
    if (project.status !== "ACCEPTED") {
      throw ApiError.badRequest(`Cannot secure funds for a project in status ${project.status} — expected ACCEPTED.`);
    }

    const updatedProject = await projectsRepo.updateStatus(id, "FUNDS_SECURED", client);

    const txn = await transactionsRepo.insert(
      {
        projectId: id,
        workerId: project.worker_id,
        businessId: project.business_id,
        type: "FUNDS_SECURED",
        direction: "debit",
        amount: Number(project.budget),
        fundsStatus: "HELD",
        referenceNote: `Funds secured – ${project.title}`,
      },
      client
    );

    return { project: updatedProject, transaction: txn };
  });

  // Emitted after commit, never before — the business's own tab already has
  // this via the HTTP response; this nudges the worker's open tab live.
  emitProjectEvent(result.project, "FUNDS_SECURED", { amount: Number(result.project.budget) });

  res.json({ data: result });
});

// POST /api/projects/:id/request-release — business's "Approve & Release"
// action. Only moves FILES_SUBMITTED -> PENDING_RELEASE; no ledger writes,
// no wallet credit — the business is signaling WorkBridge to release funds
// it's holding, not releasing them itself. The actual payout only happens
// when staff act on it via completeProject below, from the Admin Panel's
// Fund Releases tab.
export const requestRelease = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const project = await projectsRepo.findById(id);
  if (!project) throw ApiError.notFound("Project not found.");

  if (project.business_id !== req.user.id) {
    throw ApiError.forbidden("Only the business on this project can request a release.");
  }
  if (project.status !== "FILES_SUBMITTED") {
    throw ApiError.badRequest(`Cannot request release for a project in status ${project.status} — expected FILES_SUBMITTED.`);
  }

  const updated = await projectsRepo.updateStatus(id, "PENDING_RELEASE");

  emitProjectEvent(updated, "STATUS_CHANGED", { status: "PENDING_RELEASE", actorRole: "business" });

  res.json({ data: updated });
});

// POST /api/projects/:id/complete — the Logic Bridge, and the one place
// real money actually moves. Only reachable when PENDING_RELEASE, only by
// WorkBridge staff (admin) — a business's own "Approve & Release" click no
// longer reaches this directly, see requestRelease above. Runs atomically:
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

    if (req.user.role !== "admin") {
      throw ApiError.forbidden("Only WorkBridge staff can release secured funds.");
    }
    if (project.status !== "PENDING_RELEASE") {
      throw ApiError.badRequest(`Cannot complete a project in status ${project.status} — expected PENDING_RELEASE.`);
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

    // d. MASTER_ECONOMY_PLAN.md's Core Loop — award completion XP inside
    // this same transaction, so a failed payout can never leave XP awarded
    // for a project that didn't actually complete. +50 is a flat first-cut
    // value (Part 4's full design distinguishes on-time/+150 vs early/+200;
    // that distinction isn't wired yet — this is deliberately the simpler
    // version to get the loop working end-to-end first).
    const workerBefore = await usersRepo.findForUpdate(client, project.worker_id);
    const newXp = workerBefore.xp + 50;
    const { currentLevel: newLevel } = calculateLevel(newXp);
    const leveledUp = newLevel > workerBefore.current_level;
    // MASTER_ECONOMY_PLAN.md Part 3 — Door A of the Two-Door Reveal. A
    // completed project always satisfies it, whether the worker was
    // 'hidden' (first-ever completion) or 'span' (previously revealed
    // early via 5 rejections, now upgrading to a real win) — only 'win'
    // itself is a no-op. This was the one piece of the Core Loop that
    // hadn't actually been wired despite being described as working.
    await usersRepo.awardXp(client, project.worker_id, {
      xpDelta: 50,
      tokenDelta: COMPLETION_TOKEN_REWARD,
      currentLevel: newLevel,
      standingDoor: "win",
    });
    await ledgerEventsRepo.create(client, {
      userId: project.worker_id,
      eventType: "PROJECT_COMPLETED",
      xpDelta: 50,
      tokenDelta: COMPLETION_TOKEN_REWARD,
    });

    // MASTER_ECONOMY_PLAN.md Part 7 — the business-side Ledger's first
    // real earning trigger ("project successfully closed without
    // dispute"). completeProject only ever runs on a project that reached
    // COMPLETED normally (a disputed project follows admin.controller.js's
    // resolveDispute instead), so every call here already satisfies
    // "no dispute" — no extra check needed.
    const businessBefore = await usersRepo.findForUpdate(client, project.business_id);
    const newBusinessXp = businessBefore.xp + BUSINESS_COMPLETION_XP_REWARD;
    const { currentLevel: newBusinessLevel } = calculateLevel(newBusinessXp);
    await usersRepo.awardXp(client, project.business_id, {
      xpDelta: BUSINESS_COMPLETION_XP_REWARD,
      tokenDelta: BUSINESS_COMPLETION_TOKEN_REWARD,
      currentLevel: newBusinessLevel,
    });
    await ledgerEventsRepo.create(client, {
      userId: project.business_id,
      eventType: "PROJECT_COMPLETED_NO_DISPUTE",
      xpDelta: BUSINESS_COMPLETION_XP_REWARD,
      tokenDelta: BUSINESS_COMPLETION_TOKEN_REWARD,
    });

    return { project: updatedProject, payout: payoutTxn, earnings, fee, leveledUp, newLevel, newXp };
  });
  // ^ transaction() commits here if we reached this line, or has already
  // rolled back and re-thrown if anything above threw.

  // leveledUp/newLevel ride along on the same realtime event — the
  // business is who calls this endpoint, so the HTTP response alone would
  // only ever reach their browser. This is the only path that gets the
  // result to the worker's own already-connected socket in real time.
  emitProjectEvent(result.project, "COMPLETED", {
    earnings: result.earnings,
    fee: result.fee,
    leveledUp: result.leveledUp,
    newLevel: result.newLevel,
  });

  res.json({ data: result });
});

function round2(n) {
  return Math.round(n * 100) / 100;
}
