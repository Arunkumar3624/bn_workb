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
  listProjects,
  secureFunds,
  updateProjectStatus,
} from "../controllers/projects.controller.js";
import { createSubmission, listSubmissions } from "../controllers/submissions.controller.js";
import { createSubmissionSchema } from "../validators/submissions.validators.js";

export const projectsRouter = Router();

projectsRouter.use(guard);

projectsRouter.get("/", validate(listProjectsQuerySchema, "query"), listProjects);
projectsRouter.post("/", requireRole("business"), validate(createProjectSchema), createProject);
projectsRouter.get("/:id", getProject);
projectsRouter.patch("/:id", validate(updateProjectStatusSchema), updateProjectStatus);

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
