import { Router } from "express";
import { listPublicOpenJobs } from "../controllers/public.controller.js";

export const publicRouter = Router();

// No guard anywhere in this router, deliberately — everything here is meant
// to be reachable by a logged-out visitor. Real writes (applying, inviting)
// still require a real account and stay behind projectsRouter's guard.
publicRouter.get("/open-jobs", listPublicOpenJobs);
