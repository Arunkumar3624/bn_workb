import { Router } from "express";
import { guard, requireRole } from "../middleware/guard.js";
import { validate } from "../middleware/validate.js";
import {
  createProjectSchema,
  listProjectsQuerySchema,
  updateProjectStatusSchema,
} from "../validators/projects.validators.js";
import {
  completeProject,
  createProject,
  getProject,
  listOpenProjects,
  listProjects,
  secureFunds,
  updateProjectStatus,
} from "../controllers/projects.controller.js";
import { createSubmission, listSubmissions } from "../controllers/submissions.controller.js";
import { createSubmissionSchema } from "../validators/submissions.validators.js";
import { listMessages, sendAttachmentMessage, sendMessage } from "../controllers/messages.controller.js";
import { sendAttachmentMessageSchema, sendMessageSchema } from "../validators/messages.validators.js";
import { createCandidate, listCandidatesForProject } from "../controllers/job_candidates.controller.js";
import { createCandidateSchema } from "../validators/job_candidates.validators.js";

export const projectsRouter = Router();

projectsRouter.use(guard);

// Registered before "/:id" — otherwise Express would match "open" as an
// :id and route it into getProject instead of the job board feed below.
projectsRouter.get("/open", requireRole("worker"), listOpenProjects);

projectsRouter.get("/", validate(listProjectsQuerySchema, "query"), listProjects);
projectsRouter.post("/", requireRole("business"), validate(createProjectSchema), createProject);
projectsRouter.get("/:id", getProject);
projectsRouter.patch("/:id", validate(updateProjectStatusSchema), updateProjectStatus);

// The Open Job Board's apply/invite step — either a worker applying to an
// OPEN post or the owning business inviting a specific worker to it (see
// job_candidates.controller.js's createCandidate for how source is decided
// server-side from req.user.role, never trusted from the client).
projectsRouter.post("/:id/candidates", validate(createCandidateSchema), createCandidate);
projectsRouter.get("/:id/candidates", listCandidatesForProject);

// Both deliberately their own routes rather than PATCH /:id { status: ... },
// since each does far more than a status update (ledger side effects,
// atomically). Keeping them distinct endpoints makes that contract visible
// in the route table, not buried in an if-branch inside the generic PATCH
// handler.
projectsRouter.post("/:id/secure-funds", requireRole("business"), secureFunds);
projectsRouter.post("/:id/complete", requireRole("business"), completeProject);

// The Trust Checker — either participant can submit a deliverable (link or
// small image); every submission starts PENDING_REVIEW (see
// submissions.controller.js's listSubmissions for the visibility rule).
projectsRouter.post("/:id/submissions", validate(createSubmissionSchema), createSubmission);
projectsRouter.get("/:id/submissions", listSubmissions);

// The real-time chat thread — one continuous conversation per project (see
// messages table's comment in schema.sql). Attachment messages reuse the
// Trust Checker moderation pipeline (messages.controller.js's
// sendAttachmentMessage creates the underlying submission + message row
// together), so listMessages applies the same visibility rule as
// listSubmissions above.
projectsRouter.get("/:id/messages", listMessages);
projectsRouter.post("/:id/messages", validate(sendMessageSchema), sendMessage);
projectsRouter.post("/:id/messages/attachment", validate(sendAttachmentMessageSchema), sendAttachmentMessage);
