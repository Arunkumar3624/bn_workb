import { Router } from "express";
import { guard, blockDuringImpersonation } from "../middleware/guard.js";
import { validate } from "../middleware/validate.js";
import {
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  deactivateSelfSchema,
} from "../validators/auth.validators.js";
import {
  register,
  login,
  verifyOtp,
  resendOtp,
  forgotPassword,
  resetPassword,
  changePassword,
  deactivateSelf,
  me,
} from "../controllers/auth.controller.js";

export const authRouter = Router();

// OTP only ever happens once, at registration, to verify the email address —
// sign-in is password-only (see login()'s email_verified guard).
authRouter.post("/register", validate(registerSchema), register);
authRouter.post("/verify-otp", validate(verifyOtpSchema), verifyOtp);
authRouter.post("/resend-otp", validate(resendOtpSchema), resendOtp);
authRouter.post("/login", validate(loginSchema), login);

// Password recovery — the one gap left by dropping OTP-per-login. Public,
// same as register/login.
authRouter.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);
authRouter.post("/reset-password", validate(resetPasswordSchema), resetPassword);

authRouter.get("/me", guard, me);

// Settings page — Security & Auth (change password) and Danger Zone
// (self-deactivation). Both require a valid session, unlike the
// forgot/reset-password pair above. blockDuringImpersonation: an admin
// impersonating this account for support debugging must never be able to
// change the real owner's password or deactivate their account — see
// guard.js's own comment.
authRouter.post("/change-password", guard, blockDuringImpersonation, validate(changePasswordSchema), changePassword);
authRouter.patch("/deactivate-self", guard, blockDuringImpersonation, validate(deactivateSelfSchema), deactivateSelf);
