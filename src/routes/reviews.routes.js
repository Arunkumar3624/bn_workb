import { Router } from "express";
import { guard } from "../middleware/guard.js";
import { validate } from "../middleware/validate.js";
import { createReviewSchema } from "../validators/reviews.validators.js";
import { createReview } from "../controllers/reviews.controller.js";

export const reviewsRouter = Router();

reviewsRouter.use(guard);

reviewsRouter.post("/", validate(createReviewSchema), createReview);
