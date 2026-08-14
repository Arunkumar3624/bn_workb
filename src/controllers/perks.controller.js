import { transaction } from "../db/client.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as usersRepo from "../repositories/users.repository.js";
import * as ledgerEventsRepo from "../repositories/ledger_events.repository.js";
import * as perkPurchasesRepo from "../repositories/perk_purchases.repository.js";
import * as profileAuditRepo from "../repositories/profile_audit_requests.repository.js";
import { calculateLevel } from "../utils/gamification.js";
import { findPerkTier } from "../domain/perksCatalog.js";
import { targetRuleFor } from "../domain/perkTargets.js";

// GET /api/perks/purchases — the caller's own redemption history.
export const listPurchases = asyncHandler(async (req, res) => {
  const purchases = await perkPurchasesRepo.listForUser(req.user.id);
  res.json({ data: purchases });
});

// GET /api/perks/profile-audits — the caller's own Skill Bridge Profile
// Audit request history (WorkerProfile.jsx shows the latest one's status).
export const listMyProfileAudits = asyncHandler(async (req, res) => {
  const audits = await profileAuditRepo.listForWorker(req.user.id);
  res.json({ data: audits });
});

// GET /api/perks/active — the caller's currently-active purchases (not
// expired, not consumed) — the shop's "Active Perks" strip, and the same
// definition every perk effect check below uses.
export const listActivePurchases = asyncHandler(async (req, res) => {
  const purchases = await perkPurchasesRepo.listActiveForUser(req.user.id);
  res.json({ data: purchases });
});

// POST /api/perks/purchase — spends real Bridge Tokens/Corporate Credits
// (same users.bridge_tokens column and Ledger for both roles) on a catalog
// perk. Cost is always resolved server-side via findPerkTier — never
// trusted from the request body, so a tampered client can't buy a perk for
// less than its real price.
//
// Most perks boost a SPECIFIC thing (a job post, an application, a
// dispute, a withdrawal) rather than the whole account — targetId is
// required/validated via perkTargets.js's targetRuleFor whenever the perk
// needs one, so a purchase can never end up pointed at something the
// caller doesn't own or that isn't eligible.
export const purchasePerk = asyncHandler(async (req, res) => {
  const { perkId, tierId, targetId } = req.body;
  const found = findPerkTier(req.user.role, perkId, tierId);
  if (!found) {
    throw ApiError.badRequest("Unknown perk or tier for your account type.");
  }
  const { perk, tier } = found;

  const rule = targetRuleFor(perk.id);
  if (rule && !targetId) {
    throw ApiError.badRequest("This perk needs a target — pick what it should apply to.");
  }

  const result = await transaction(async (client) => {
    // Validated inside the transaction (not before it) so the eligibility
    // check and the token debit see the same consistent snapshot.
    if (rule) {
      await rule.validate(req.user, targetId);
    }

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
      targetType: rule?.type ?? null,
      targetId: rule ? targetId : null,
    });

    // Profile Audit's real effect is a request that lands in Admin's real
    // review queue — it doesn't wait for a separate action, purchasing it
    // IS the request.
    if (perk.id === "profile-audit") {
      await profileAuditRepo.create(client, { workerId: req.user.id, purchaseId: purchase.id });
    }

    return { purchase, bridgeTokens: updatedUser.bridge_tokens };
  });

  res.status(201).json({ data: result });
});
