import { Router } from "express";
import { guard } from "../middleware/guard.js";
import { validate } from "../middleware/validate.js";
import { listProfilesQuerySchema, updateOwnProfileSchema } from "../validators/profiles.validators.js";
import { getPublicProfile, listPublicProfiles, updateOwnProfile } from "../controllers/profiles.controller.js";

export const profilesRouter = Router();

// Deliberately no `guard` on these two — public profiles (the worker
// share-link page, e.g. /p/priya-sharma on the frontend, and the
// browse-workers listing) must be readable by a logged-out visitor. This is
// the exception the brief calls out.
profilesRouter.get("/", validate(listProfilesQuerySchema, "query"), listPublicProfiles);
profilesRouter.get("/:id", getPublicProfile);

// The one write in this router — guarded, self only (see updateOwnProfile).
profilesRouter.patch("/me", guard, validate(updateOwnProfileSchema), updateOwnProfile);
