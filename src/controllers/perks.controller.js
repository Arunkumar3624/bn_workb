import { transaction } from "../db/client.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as usersRepo from "../repositories/users.repository.js";
import * as ledgerEventsRepo from "../repositories/ledger_events.repository.js";
import * as perkPurchasesRepo from "../repositories/perk_purchases.repository.js";
import { calculateLevel } from "../utils/gamification.js";
import { findPerkTier } from "../domain/perksCatalog.js";

// GET /api/perks/purchases — the caller's own redemption history.
export const listPurchases = asyncHandler(async (req, res) => {
  const purchases = await perkPurchasesRepo.listForUser(req.user.id);
  res.json({ data: purchases });
});

// POST /api/perks/purchase — spends real Bridge Tokens/Corporate Credits
// (same users.bridge_tokens column and Ledger for both roles) on a catalog
// perk. Cost is always resolved server-side via findPerkTier — never
// trusted from the request body, so a tampered client can't buy a perk for
// less than its real price.
//
// This makes the purchase itself real: the balance debit (ledger_events +
// users.bridge_tokens, same awardXp path completeProject uses) and the
// perk_purchases record. The perk's actual effect on job-feed ranking /
// proposal-matching (MASTER_ECONOMY_PLAN.md Phase 3's slot-cap logic) is a
// separate, not-yet-built feature — same "real data or honestly-labeled
// preview" boundary as everywhere else on this platform.
export const purchasePerk = asyncHandler(async (req, res) => {
  const { perkId, tierId } = req.body;
  const found = findPerkTier(req.user.role, perkId, tierId);
  if (!found) {
    throw ApiError.badRequest("Unknown perk or tier for your account type.");
  }
  const { perk, tier } = found;

  const result = await transaction(async (client) => {
    const user = await usersRepo.findForUpdate(client, req.user.id);
    if (!user) throw ApiError.notFound("User not found.");
    if (user.bridge_tokens < tier.cost) {
      throw ApiError.badRequest(`Not enough balance — need ${tier.cost}, have ${user.bridge_tokens}.`);
    }

    const { currentLevel } = calculateLevel(user.xp);
    const updatedUser = await usersRepo.awardXp(client, req.user.id, {
      xpDelta: 0,
      tokenDelta: -tier.cost,
      currentLevel,
    });

    await ledgerEventsRepo.create(client, {
      userId: req.user.id,
      eventType: `PERK_PURCHASE:${perk.id}:${tier.id}`,
      xpDelta: 0,
      tokenDelta: -tier.cost,
    });

    const expiresAt = tier.durationHours
      ? new Date(Date.now() + tier.durationHours * 60 * 60 * 1000).toISOString()
      : null;

    const purchase = await perkPurchasesRepo.create(client, {
      userId: req.user.id,
      perkId: perk.id,
      tierId: tier.id,
      label: `${perk.name} — ${tier.label}`,
      tokenCost: tier.cost,
      expiresAt,
    });

    return { purchase, bridgeTokens: updatedUser.bridge_tokens };
  });

  res.status(201).json({ data: result });
});
