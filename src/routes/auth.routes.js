import { Router } from "express";
import { guard } from "../middleware/guard.js";
import { validate } from "../middleware/validate.js";
import {
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  resendOtpSchema,
} from "../validators/auth.validators.js";
import {
  register,
  login,
  verifyOtp,
  resendOtp,
  me,
} from "../controllers/auth.controller.js";

export const authRouter = Router();

// OTP only ever happens once, at registration, to verify the email address —
// sign-in is password-only (see login()'s email_verified guard).
authRouter.post("/register", validate(registerSchema), register);
authRouter.post("/verify-otp", validate(verifyOtpSchema), verifyOtp);
authRouter.post("/resend-otp", validate(resendOtpSchema), resendOtp);
authRouter.post("/login", validate(loginSchema), login);

authRouter.get("/me", guard, me);
