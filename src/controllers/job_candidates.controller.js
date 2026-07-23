import { transaction } from "../db/client.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as projectsRepo from "../repositories/projects.repository.js";
import * as candidatesRepo from "../repositories/job_candidates.repository.js";
import * as usersRepo from "../repositories/users.repository.js";
import { emitProjectEvent, emitToUser } from "../realtime/events.js";

const UNIQUE_VIOLATION = "23505";

// POST /api/projects/:id/candidates — either a worker applying to an OPEN
// post (source=APPLICATION, workerId forced to req.user.id) or the
// business that owns it inviting one specific worker directly
// (source=INVITE, workerId required in the body). Which one it is comes
// entirely from req.user.role — the client never gets to choose source.
export const createCandidate = asyncHandler(async (req, res) => {
  const project = await projectsRepo.findById(req.params.id);
  if (!project) throw ApiError.notFound("Project not found.");
  if (project.status !== "OPEN") {
    throw ApiError.badRequest("This job is no longer accepting applications or invites.");
  }

  let workerId;
  let source;

  if (req.user.role === "worker") {
    source = "APPLICATION";
    workerId = req.user.id;
  } else if (req.user.role === "business") {
    if (project.business_id !== req.user.id) {
      throw ApiError.forbidden("You can only invite workers to your own job posts.");
    }
    if (!req.body.workerId) {
      throw ApiError.badRequest("workerId is required when a business invites a worker.");
    }
    const invitedWorker = await usersRepo.findById(req.body.workerId);
    if (!invitedWorker || invitedWorker.role !== "worker") {
      throw ApiError.badRequest("workerId must reference an existing worker.");
    }
    source = "INVITE";
    workerId = req.body.workerId;
  } else {
    throw ApiError.forbidden("Only a worker or a business may act on a job post.");
  }

  let candidate;
  try {
    candidate = await candidatesRepo.create({
      projectId: project.id,
      workerId,
      source,
      message: req.body.message,
    });
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      throw ApiError.conflict(
        source === "APPLICATION" ? "You've already applied to this job." : "This worker has already been invited to this job."
      );
    }
    throw err;
  }

  // A new application notifies the business; a new direct invite notifies
  // the worker being invited — the other side of whichever action just
  // happened. Neither is a project participant yet (worker_id is still
  // null on an OPEN post), so this goes straight to their own user room
  // rather than through emitProjectEvent.
  if (source === "APPLICATION") {
    emitToUser(project.business_id, "CANDIDATE_CREATED", {
      candidateId: candidate.id,
      projectId: project.id,
      projectTitle: project.title,
      source,
    });
  } else {
    emitToUser(workerId, "CANDIDATE_CREATED", {
      candidateId: candidate.id,
      projectId: project.id,
      projectTitle: project.title,
      source,
    });
  }

  res.status(201).json({ data: candidate });
});

// GET /api/projects/:id/candidates — the business reviewing everyone who's
// applied or been invited on their own OPEN post.
export const listCandidatesForProject = asyncHandler(async (req, res) => {
  const project = await projectsRepo.findById(req.params.id);
  if (!project) throw ApiError.notFound("Project not found.");
  if (project.business_id !== req.user.id && req.user.role !== "admin") {
    throw ApiError.forbidden("You can only view candidates on your own job posts.");
  }

  const candidates = await candidatesRepo.listForProject(project.id);
  res.json({ data: candidates });
});

// GET /api/candidates/mine — a worker's own pending/decided candidacies
// (jobs they applied to, invites sent to them) — the "My Applications &
// Invites" view.
export const listMyCandidates = asyncHandler(async (req, res) => {
  const candidates = await candidatesRepo.listForWorker(req.user.id);
  res.json({ data: candidates });
});

// PATCH /api/candidates/:id — accept or decline a candidacy. Who's allowed
// to respond depends on source: an INVITE is the business's move already
// made, so only the invited worker can accept/decline it; an APPLICATION is
// the worker's move already made, so only the business reviews it.
// Accepting either one assigns the project (OPEN -> ACCEPTED, worker_id
// set) and closes every sibling candidacy on that project as CLOSED — see
// job_candidates.repository.js's closeOthersForProject.
export const respondToCandidate = asyncHandler(async (req, res) => {
  const { accept } = req.body;

  const result = await transaction(async (client) => {
    const candidate = await candidatesRepo.findByIdForUpdate(client, req.params.id);
    if (!candidate) throw ApiError.notFound("Candidacy not found.");

    const project = await projectsRepo.findByIdForUpdate(client, candidate.project_id);
    if (!project) throw ApiError.notFound("Project not found.");

    const isInviteResponder = candidate.source === "INVITE" && candidate.worker_id === req.user.id;
    const isApplicationResponder = candidate.source === "APPLICATION" && project.business_id === req.user.id;
    if (!isInviteResponder && !isApplicationResponder) {
      throw ApiError.forbidden("You are not able to respond to this.");
    }

    if (candidate.status !== "PENDING") {
      throw ApiError.badRequest(`This was already ${candidate.status.toLowerCase()}.`);
    }
    if (project.status !== "OPEN") {
      throw ApiError.badRequest("This job is no longer open — it was already filled.");
    }

    if (!accept) {
      const declined = await candidatesRepo.updateStatus(client, candidate.id, "DECLINED");
      return { declined, project, candidate };
    }

    await candidatesRepo.updateStatus(client, candidate.id, "ACCEPTED");
    const assignedProject = await projectsRepo.assignWorker(client, project.id, candidate.worker_id, "ACCEPTED");
    const closedCandidates = await candidatesRepo.closeOthersForProject(client, project.id, candidate.id);

    return { assignedProject, closedCandidates, candidate };
  });

  if (!accept) {
    // A declined INVITE (business's move) or a declined APPLICATION (the
    // business rejecting one applicant) — either way, the job stays OPEN
    // and only the other side of this one candidacy needs to hear about it.
    if (result.candidate.source === "INVITE") {
      emitToUser(result.project.business_id, "CANDIDATE_DECLINED", {
        candidateId: result.candidate.id,
        projectId: result.project.id,
        projectTitle: result.project.title,
      });
    } else {
      emitToUser(result.candidate.worker_id, "CANDIDATE_DECLINED", {
        candidateId: result.candidate.id,
        projectId: result.project.id,
        projectTitle: result.project.title,
      });
    }
    return res.json({ data: result.declined });
  }

  // Both real participants now exist on the project — this reaches them
  // through the normal project rooms, same as every other status change.
  emitProjectEvent(result.assignedProject, "CANDIDATE_ACCEPTED", {
    candidateId: result.candidate.id,
  });

  // Everyone else who applied or was invited lost out to this acceptance —
  // none of them are project participants, so each gets a direct nudge.
  for (const closed of result.closedCandidates) {
    emitToUser(closed.worker_id, "JOB_FILLED", {
      candidateId: closed.id,
      projectId: result.assignedProject.id,
      projectTitle: result.assignedProject.title,
    });
  }

  res.json({ data: result.assignedProject });
});
