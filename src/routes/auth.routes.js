import { Router } from "express";
import { guard } from "../middleware/guard.js";
import { validate } from "../middleware/validate.js";
import {
  sendOtpSchema,
  verifyOtpSchema,
} from "../validators/auth.validators.js";
import {
  me,
  sendOtp,
  verifyOtp,
} from "../controllers/auth.controller.js";

export const authRouter = Router();

// One role-agnostic password + OTP sign-in flow serves workers, businesses,
// and internally provisioned admins. Admin signup remains unavailable.
authRouter.post("/send-otp", validate(sendOtpSchema), sendOtp);
authRouter.post("/verify-otp", validate(verifyOtpSchema), verifyOtp);

authRouter.get("/me", guard, me);
