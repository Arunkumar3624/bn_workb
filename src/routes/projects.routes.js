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
  listProjects,
  updateProjectStatus,
} from "../controllers/projects.controller.js";

export const projectsRouter = Router();

projectsRouter.use(guard);

projectsRouter.get("/", validate(listProjectsQuerySchema, "query"), listProjects);
projectsRouter.post("/", requireRole("business"), validate(createProjectSchema), createProject);
projectsRouter.patch("/:id", validate(updateProjectStatusSchema), updateProjectStatus);

// The Logic Bridge — deliberately its own route rather than
// PATCH /:id { status: "COMPLETED" }, since it does far more than a status
// update (ledger + wallet side effects, atomically). Keeping it a distinct
// endpoint makes that contract visible in the route table, not buried in an
// if-branch inside the generic PATCH handler.
projectsRouter.post("/:id/complete", requireRole("business"), completeProject);
