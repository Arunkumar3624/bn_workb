import { transaction } from "../db/client.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { containsContactInfo } from "../utils/contactFilter.js";
import * as projectsRepo from "../repositories/projects.repository.js";
import * as messagesRepo from "../repositories/messages.repository.js";
import * as submissionsRepo from "../repositories/submissions.repository.js";
import { emitProjectEvent } from "../realtime/events.js";

async function mustBeParticipant(req, projectId) {
  const project = await projectsRepo.findById(projectId);
  if (!project) throw ApiError.notFound("Project not found.");

  const isParticipant = project.worker_id === req.user.id || project.business_id === req.user.id;
  if (!isParticipant && req.user.role !== "admin") {
    throw ApiError.forbidden("You are not a participant on this project.");
  }
  return project;
}

const CONTACT_INFO_MESSAGE =
  "Sharing phone numbers or email addresses in chat isn't allowed — keep contact details off WorkBridge.";

// POST /api/projects/:id/messages — a plain text chat message. One
// continuous thread per project (see the messages table's own comment in
// schema.sql) — this doesn't gate on project status the way the old fake
// per-negotiation chats did, since the same thread now also carries the
// Active Workspace conversation.
export const sendMessage = asyncHandler(async (req, res) => {
  const project = await mustBeParticipant(req, req.params.id);

  const { body } = req.body;
  if (containsContactInfo(body)) {
    throw ApiError.badRequest(CONTACT_INFO_MESSAGE);
  }

  const message = await messagesRepo.create({
    projectId: req.params.id,
    senderId: req.user.id,
    body,
  });

  emitProjectEvent(project, "MESSAGE_CREATED", {
    messageId: message.id,
    senderId: req.user.id,
  });

  res.status(201).json({ data: message });
});

// POST /api/projects/:id/messages/attachment — a file/link shared inline in
// chat. Creates the underlying submission (the same Trust Checker
// moderation queue DeliverablesPanel already uses) and the message row that
// surfaces it in the feed in one transaction, so a message can never end up
// pointing at a submission that doesn't exist.
export const sendAttachmentMessage = asyncHandler(async (req, res) => {
  const project = await mustBeParticipant(req, req.params.id);

  const { type, url, imageData, caption } = req.body;
  if (containsContactInfo(caption)) {
    throw ApiError.badRequest(CONTACT_INFO_MESSAGE);
  }

  const { message, submission } = await transaction(async (client) => {
    const createdSubmission = await submissionsRepo.createWithClient(client, {
      projectId: req.params.id,
      submittedBy: req.user.id,
      type,
      url,
      imageData,
      caption,
    });
    const createdMessage = await messagesRepo.createLinkedToSubmission(client, {
      projectId: req.params.id,
      senderId: req.user.id,
      body: caption ?? null,
      submissionId: createdSubmission.id,
    });
    return { message: createdMessage, submission: createdSubmission };
  });

  // Two events, not one — DeliverablesPanel listens for SUBMISSION_CREATED
  // (unchanged contract; still fires for every submission no matter where it
  // was created from) and ChatThread listens for MESSAGE_CREATED.
  emitProjectEvent(project, "SUBMISSION_CREATED", {
    submissionId: submission.id,
    submittedBy: req.user.id,
  });
  emitProjectEvent(project, "MESSAGE_CREATED", {
    messageId: message.id,
    senderId: req.user.id,
  });

  res.status(201).json({ data: message });
});

// GET /api/projects/:id/messages — mirrors listSubmissions' visibility rule
// (submissions.controller.js): an attachment message is only visible to the
// counterparty once its submission is APPROVED — PENDING_REVIEW/REJECTED
// stay invisible to them, not just unlabeled. Admins and the sender always
// see it. Plain text messages (no submission_id) never went through
// moderation, so they carry no such gate.
export const listMessages = asyncHandler(async (req, res) => {
  await mustBeParticipant(req, req.params.id);

  const all = await messagesRepo.listForProject(req.params.id);
  const visible =
    req.user.role === "admin"
      ? all
      : all.filter(
          (m) => !m.submission_id || m.submission_submitted_by === req.user.id || m.submission_status === "APPROVED"
        );

  res.json({ data: visible });
});
