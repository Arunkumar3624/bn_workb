import { Router } from "express";
import { guard } from "../middleware/guard.js";
import { validate } from "../middleware/validate.js";
import {
  loginSchema,
  registerSchema,
  sendOtpSchema,
  verifyOtpSchema,
} from "../validators/auth.validators.js";
import {
  login,
  me,
  register,
  sendOtp,
  verifyOtp,
} from "../controllers/auth.controller.js";

export const authRouter = Router();

// Public — no `guard` on these two, unlike every other resource router.
authRouter.post("/register", validate(registerSchema), register);
authRouter.post("/login", validate(loginSchema), login);
authRouter.post("/send-otp", validate(sendOtpSchema), sendOtp);
authRouter.post("/verify-otp", validate(verifyOtpSchema), verifyOtp);

authRouter.get("/me", guard, me);
