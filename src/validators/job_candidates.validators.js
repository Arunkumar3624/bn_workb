import { z } from "zod";

// POST /api/projects/:id/candidates — shape is the same whether a worker is
// applying or a business is inviting; which one it is (and therefore
// whether workerId is required/forbidden) depends on req.user.role, checked
// in the controller rather than here since the schema has no access to the
// authenticated user.
export const createCandidateSchema = z.object({
  workerId: z.string().uuid().optional(),
  message: z.string().trim().max(1000).optional(),
});

export const respondToCandidateSchema = z.object({
  accept: z.boolean(),
});
