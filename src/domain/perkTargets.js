// Which perks boost a SPECIFIC thing (a job post, an application, a
// dispute, a withdrawal) rather than the whole account, and what makes a
// valid target for each — resolved here, server-side, so a purchase can
// never target something the caller doesn't own or that isn't eligible.
// Perks with no entry here (featured-employer, profile-audit) are
// account-wide and require no target at all.
import { query } from "../db/client.js";
import * as projectsRepo from "../repositories/projects.repository.js";
import * as jobCandidatesRepo from "../repositories/job_candidates.repository.js";
import { ApiError } from "../utils/ApiError.js";

async function validateOwnOpenProject(user, projectId) {
  const project = await projectsRepo.findById(projectId);
  if (!project) throw ApiError.notFound("Job post not found.");
  if (project.business_id !== user.id) throw ApiError.forbidden("Not your job post.");
  if (project.status !== "OPEN") {
    throw ApiError.badRequest("This perk only applies to an open job post still accepting applications.");
  }
  return project;
}

async function validateOwnDisputedProject(user, projectId) {
  const project = await projectsRepo.findById(projectId);
  if (!project) throw ApiError.notFound("Project not found.");
  if (project.business_id !== user.id && project.worker_id !== user.id) {
    throw ApiError.forbidden("You are not a participant on this project.");
  }
  if (project.status !== "DISPUTED") {
    throw ApiError.badRequest("This perk only applies to a project with an active dispute.");
  }
  return project;
}

// Same statuses BusinessProjects.jsx's isGhosted checks — a shield only
// makes sense once funds are actually held and the worker could otherwise
// be ghost-cancelled for missing the deadline.
const SHIELDABLE_STATUSES = new Set(["FUNDS_SECURED", "WORK_IN_PROGRESS"]);
async function validateOwnShieldableProject(user, projectId) {
  const project = await projectsRepo.findById(projectId);
  if (!project) throw ApiError.notFound("Project not found.");
  if (project.worker_id !== user.id) throw ApiError.forbidden("Not your project.");
  if (!SHIELDABLE_STATUSES.has(project.status)) {
    throw ApiError.badRequest("This perk only applies to an active, funded project still in progress.");
  }
  return project;
}

async function validateOwnPendingCandidate(user, candidateId) {
  const candidate = await jobCandidatesRepo.findById(candidateId);
  if (!candidate) throw ApiError.notFound("Application not found.");
  if (candidate.worker_id !== user.id) throw ApiError.forbidden("Not your application.");
  if (candidate.status !== "PENDING") {
    throw ApiError.badRequest("This perk only applies to an application still awaiting a decision.");
  }
  return candidate;
}

async function validateOwnPendingWithdrawal(user, withdrawalId) {
  const { rows } = await query(`SELECT * FROM withdrawal_requests WHERE id = $1`, [withdrawalId]);
  const withdrawal = rows[0];
  if (!withdrawal) throw ApiError.notFound("Withdrawal request not found.");
  if (withdrawal.worker_id !== user.id) throw ApiError.forbidden("Not your withdrawal request.");
  if (withdrawal.status !== "PENDING") {
    throw ApiError.badRequest("This perk only applies to a withdrawal still pending review.");
  }
  return withdrawal;
}

const TARGET_RULES = {
  "flash-post": { type: "project", validate: validateOwnOpenProject },
  "ai-shortlist": { type: "project", validate: validateOwnOpenProject },
  "enterprise-broadcast": { type: "project", validate: validateOwnOpenProject },
  "dispute-fast-track": { type: "project", validate: validateOwnDisputedProject },
  "gold-highlight": { type: "job_candidate", validate: validateOwnPendingCandidate },
  "momentum-shield": { type: "project", validate: validateOwnShieldableProject },
  "withdrawal-fast-track": { type: "withdrawal_request", validate: validateOwnPendingWithdrawal },
};

export function targetRuleFor(perkId) {
  return TARGET_RULES[perkId] ?? null;
}
