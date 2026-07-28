import { z } from "zod";

// POST /api/projects/:id/candidates — shape is the same whether a worker is
// applying or a business is inviting; which one it is (and therefore
// whether workerId is required/forbidden) depends on req.user.role, checked
// in the controller rather than here since the schema has no access to the
// authenticated user.
export const createCandidateSchema = z.object({
  workerId: z.string().uuid().optional(),
  message: z.string().trim().max(1000).optional(),
  // The "Fairness First" Behavior Score signal (see ApplicationQuizModal.jsx)
  // — only meaningful when a worker is applying (source=APPLICATION); a
  // business inviting someone never sends this. true = answered all 15
  // questions (+15), false = skipped the quiz (-5), omitted = no adjustment.
  quizAnswered: z.boolean().optional(),
});

export const respondToCandidateSchema = z.object({
  accept: z.boolean(),
});
