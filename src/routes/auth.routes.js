import { Router } from "express";
import { guard } from "../middleware/guard.js";
import { validate } from "../middleware/validate.js";
import { loginSchema, registerSchema } from "../validators/auth.validators.js";
import { login, me, register } from "../controllers/auth.controller.js";

export const authRouter = Router();

// Public — no `guard` on these two, unlike every other resource router.
authRouter.post("/register", validate(registerSchema), register);
authRouter.post("/login", validate(loginSchema), login);

authRouter.get("/me", guard, me);
