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
