import { Router } from "express";
import { guard } from "../middleware/guard.js";
import { validate } from "../middleware/validate.js";
import {
  loginSchema,
  sendOtpSchema,
  verifyOtpSchema,
} from "../validators/auth.validators.js";
import {
  login,
  me,
  sendOtp,
  verifyOtp,
} from "../controllers/auth.controller.js";

export const authRouter = Router();

// Admins are internally provisioned and use password login. Public worker
// and business registration/sign-in both go through the two OTP endpoints,
// so there is no password-only route that can bypass verification.
authRouter.post("/login", validate(loginSchema), login);
authRouter.post("/send-otp", validate(sendOtpSchema), sendOtp);
authRouter.post("/verify-otp", validate(verifyOtpSchema), verifyOtp);

authRouter.get("/me", guard, me);
