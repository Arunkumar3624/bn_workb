import { Router } from "express";
import { guard, requireRole } from "../middleware/guard.js";
import { validate } from "../middleware/validate.js";
import {
  getMyCandidateStats,
  getPendingInvitedWorkers,
  listMyCandidates,
  respondToCandidate,
} from "../controllers/job_candidates.controller.js";
import { respondToCandidateSchema } from "../validators/job_candidates.validators.js";

export const candidatesRouter = Router();

candidatesRouter.use(guard);

// A worker's own applications + invites — not scoped to a single project,
// so it lives under its own /candidates prefix rather than nested under
// /projects/:id like createCandidate/listCandidatesForProject are.
candidatesRouter.get("/mine", requireRole("worker"), listMyCandidates);
// The Hustle Stats card — /stats before /:id so it isn't swallowed by the
// PATCH /:id route's param matching on the shared router.
candidatesRouter.get("/stats", requireRole("worker"), getMyCandidateStats);
// BusinessWorkers.jsx's "Invited" badge source of truth.
candidatesRouter.get("/pending-invited-workers", requireRole("business"), getPendingInvitedWorkers);
candidatesRouter.patch("/:id", validate(respondToCandidateSchema), respondToCandidate);
