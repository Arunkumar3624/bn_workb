import { Router } from "express";
import { guard } from "../middleware/guard.js";
import { validate } from "../middleware/validate.js";
import { createReviewSchema, updateReviewSchema, listReviewsQuerySchema } from "../validators/reviews.validators.js";
import { createReview, updateReview, listReviews, listFeaturedReviews } from "../controllers/reviews.controller.js";

export const reviewsRouter = Router();

// Public — same trust-signal category as public_user_profiles.rating (see
// listReviews's comment). Only POST/PATCH (submitting/editing a review)
// need `guard`.
reviewsRouter.get("/featured", listFeaturedReviews);
reviewsRouter.get("/", validate(listReviewsQuerySchema, "query"), listReviews);
reviewsRouter.post("/", guard, validate(createReviewSchema), createReview);
reviewsRouter.patch("/:projectId", guard, validate(updateReviewSchema), updateReview);
