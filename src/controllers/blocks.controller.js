import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as usersRepo from "../repositories/users.repository.js";
import * as userBlocksRepo from "../repositories/user_blocks.repository.js";

// POST /api/blocks/:userId — block another real user, both directions
// (WhatsApp-style). Reversible any time via DELETE below.
export const blockUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (userId === req.user.id) throw ApiError.badRequest("You can't block yourself.");

  const target = await usersRepo.findById(userId);
  if (!target) throw ApiError.notFound("User not found.");

  await userBlocksRepo.block(req.user.id, userId);
  res.status(201).json({ data: { blockedByMe: true, blockedMe: false } });
});

// DELETE /api/blocks/:userId — unblock, at any time, only by whoever placed
// the block (unblocking someone who blocked you is meaningless — that's
// their block to lift).
export const unblockUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  await userBlocksRepo.unblock(req.user.id, userId);
  const status = await userBlocksRepo.getStatus(req.user.id, userId);
  res.json({ data: { blockedByMe: status.blocked_by_me, blockedMe: status.blocked_me } });
});

// GET /api/blocks/:userId/status — both directions, so the chat composer
// can distinguish "you blocked them" from "they blocked you" and show the
// right copy/action for each.
export const getBlockStatus = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const status = await userBlocksRepo.getStatus(req.user.id, userId);
  res.json({ data: { blockedByMe: status.blocked_by_me, blockedMe: status.blocked_me } });
});
