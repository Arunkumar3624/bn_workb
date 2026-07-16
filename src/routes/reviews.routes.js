import { Router } from "express";
import { guard } from "../middleware/guard.js";
import { validate } from "../middleware/validate.js";
import { createReviewSchema, listReviewsQuerySchema } from "../validators/reviews.validators.js";
import { createReview, listReviews } from "../controllers/reviews.controller.js";

export const reviewsRouter = Router();

// Public — same trust-signal category as public_user_profiles.rating (see
// listReviews's comment). Only POST (submitting a review) needs `guard`.
reviewsRouter.get("/", validate(listReviewsQuerySchema, "query"), listReviews);
reviewsRouter.post("/", guard, validate(createReviewSchema), createReview);
