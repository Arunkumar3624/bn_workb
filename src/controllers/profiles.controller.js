import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as usersRepo from "../repositories/users.repository.js";

// GET /api/profiles/:id — the ONE unauthenticated read in this API.
// Queries public_user_profiles (schema.sql), a view with no email/phone
// columns at all — there's no field to accidentally leak here even if this
// controller's SELECT * were sloppy, because those columns don't exist in
// the view's result set.
export const getPublicProfile = asyncHandler(async (req, res) => {
  const profile = await usersRepo.findPublicProfileById(req.params.id);
  if (!profile) throw ApiError.notFound("Profile not found.");
  res.json({ data: profile });
});

// GET /api/profiles?role=worker — the browse-workers listing
// (BusinessWorkers.jsx). Same public_user_profiles view as the single-id
// route, so no PII is ever in the result set.
export const listPublicProfiles = asyncHandler(async (req, res) => {
  const profiles = await usersRepo.listPublicProfiles({ role: req.query.role });
  res.json({ data: profiles });
});

// PATCH /api/profiles/me — behind `guard`. req.user.id only; there is no
// :id param here, so a caller can never edit anyone else's profile.
export const updateOwnProfile = asyncHandler(async (req, res) => {
  const { avatarUrl, title, phone, profilePatch } = req.body;
  const updated = await usersRepo.updateSelf(req.user.id, { avatarUrl, title, phone, profilePatch });
  if (!updated) throw ApiError.notFound("User not found.");
  const { password_hash, ...safe } = updated;
  res.json({ data: safe });
});
