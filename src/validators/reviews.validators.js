import { z } from "zod";

export const createReviewSchema = z.object({
  projectId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  feedback: z.string().max(2000).optional(),
});

export const listReviewsQuerySchema = z.object({
  revieweeId: z.string().uuid(),
});
