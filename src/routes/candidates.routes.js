import { Router } from "express";
import { guard, requireRole } from "../middleware/guard.js";
import { validate } from "../middleware/validate.js";
import { listMyCandidates, respondToCandidate } from "../controllers/job_candidates.controller.js";
import { respondToCandidateSchema } from "../validators/job_candidates.validators.js";

export const candidatesRouter = Router();

candidatesRouter.use(guard);

// A worker's own applications + invites — not scoped to a single project,
// so it lives under its own /candidates prefix rather than nested under
// /projects/:id like createCandidate/listCandidatesForProject are.
candidatesRouter.get("/mine", requireRole("worker"), listMyCandidates);
candidatesRouter.patch("/:id", validate(respondToCandidateSchema), respondToCandidate);
