import { asyncHandler } from "../utils/asyncHandler.js";
import * as projectsRepo from "../repositories/projects.repository.js";

// GET /api/public/open-jobs — deliberately unguarded (see routes/public.routes.js).
// Browsing the Job Board shouldn't require an account, same pattern as
// profiles.routes.js's public profile/worker-directory routes. Anonymous
// visitors get the same default (lowest-tier) visibility a Bronze worker
// would — urgent posts only show once their 3-hour Silver+ head start has
// elapsed (see projects.repository.js's listOpen).
export const listPublicOpenJobs = asyncHandler(async (_req, res) => {
  const projects = await projectsRepo.listOpen();
  res.json({ data: projects });
});
