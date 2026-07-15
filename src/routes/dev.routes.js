import { Router } from "express";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as usersRepo from "../repositories/users.repository.js";

// DEV-ONLY token issuance. There is no real login flow yet (see
// TECH_ROADMAP.md's "Multi-User Authentication" item — deliberately not
// built) — AuthPage.jsx on the frontend is UI-only. This exists so the
// frontend can get a *real, validly-signed* JWT to call guarded routes
// during local development, without faking a production auth system.
// mounted only when NODE_ENV !== "production" — see routes/index.js.
export const devRouter = Router();

devRouter.post(
  "/token",
  asyncHandler(async (req, res) => {
    const { userId } = req.body ?? {};
    if (!userId) throw ApiError.badRequest("userId is required.");

    const user = await usersRepo.findById(userId);
    if (!user) throw ApiError.notFound(`No user with id ${userId}.`);

    const token = jwt.sign({ sub: user.id, role: user.role }, mustGetJwtSecret(), {
      expiresIn: "12h",
    });

    res.json({ data: { token, user: { id: user.id, role: user.role, name: user.name } } });
  })
);

function mustGetJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw ApiError.internal("JWT_SECRET is not configured on the server.");
  return secret;
}
