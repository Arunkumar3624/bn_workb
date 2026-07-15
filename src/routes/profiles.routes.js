import { Router } from "express";
import { getPublicProfile } from "../controllers/profiles.controller.js";

// Deliberately no `guard` on this router — public profiles (the worker
// share-link page, e.g. /p/priya-sharma on the frontend) must be readable
// by a logged-out visitor. This is the sole exception the brief calls out.
export const profilesRouter = Router();

profilesRouter.get("/:id", getPublicProfile);
