import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Verifies the Bearer JWT and attaches { id, role } to req.user. Applied to
// every router except /api/profiles (public profiles are the one resource
// that's readable unauthenticated — see routes/profiles.routes.js).
//
// Token payload contract (issued at login, not built here — out of scope
// for this skeleton): { sub: userId, role: "worker" | "business" | "admin" }
export const guard = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw ApiError.unauthorized("Missing or malformed Authorization header — expected 'Bearer <token>'.");
  }

  let payload;
  try {
    payload = jwt.verify(token, mustGetJwtSecret());
  } catch {
    throw ApiError.unauthorized("Invalid or expired token.");
  }

  if (!payload?.sub || !payload?.role) {
    throw ApiError.unauthorized("Token payload is missing required claims (sub, role).");
  }

  req.user = { id: payload.sub, role: payload.role };
  next();
});

// requireRole("business") — use after `guard` on routes only one role may
// call (e.g. only a business can post a job or release a payment).
export function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      throw ApiError.unauthorized("guard middleware must run before requireRole.");
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw ApiError.forbidden(`This action requires one of: ${allowedRoles.join(", ")}.`);
    }
    next();
  };
}

function mustGetJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw ApiError.internal("JWT_SECRET is not configured on the server.");
  }
  return secret;
}
