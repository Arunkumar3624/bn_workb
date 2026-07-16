import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as usersRepo from "../repositories/users.repository.js";

const SALT_ROUNDS = 10;
const TOKEN_TTL = "7d";

// The caller's own profile — allowed to include email/phone (unlike
// public_user_profiles, which strips them for everyone else) but password_hash
// must never leave this module.
function toSelf(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, mustGetJwtSecret(), { expiresIn: TOKEN_TTL });
}

// POST /api/auth/register — public. role is restricted to worker|business
// by registerSchema; there is no path from this endpoint to an admin account.
export const register = asyncHandler(async (req, res) => {
  const { role, name, email, phone, password } = req.body;

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  let user;
  try {
    user = await usersRepo.create({ role, name, email, phone, passwordHash });
  } catch (err) {
    // 23505 = unique_violation — users.email is CITEXT UNIQUE.
    if (err.code === "23505") {
      throw ApiError.conflict("An account with this email already exists.");
    }
    throw err;
  }

  res.status(201).json({ data: { token: issueToken(user), user: toSelf(user) } });
});

// POST /api/auth/login — public. Generic error message on any failure (no
// such email, or wrong password) so this endpoint never reveals which one
// was wrong — that's a user-enumeration vector otherwise.
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await usersRepo.findByEmail(email);
  const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;

  if (!user || !passwordMatches) {
    throw ApiError.unauthorized("Invalid email or password.");
  }

  res.json({ data: { token: issueToken(user), user: toSelf(user) } });
});

// GET /api/auth/me — behind `guard`. req.user.id comes from the verified
// JWT, never a client-supplied param.
export const me = asyncHandler(async (req, res) => {
  const user = await usersRepo.findById(req.user.id);
  if (!user) throw ApiError.notFound("User not found.");
  res.json({ data: toSelf(user) });
});

function mustGetJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw ApiError.internal("JWT_SECRET is not configured on the server.");
  return secret;
}
