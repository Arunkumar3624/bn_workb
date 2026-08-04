import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import * as usersRepo from "../repositories/users.repository.js";
import * as ledgerEventsRepo from "../repositories/ledger_events.repository.js";
import * as transactionsRepo from "../repositories/transactions.repository.js";
import { calculateLevel, calculateProgressBar, getBusinessTier, getTierData } from "../utils/gamification.js";

// GET /api/gamification/ledger — the caller's own real balance + earn
// history (ledger_events). Never returns platform_fee_pct — only tier_name
// (getTierData), same Abstracted Ladder boundary as everywhere else this
// data surfaces.
export const getLedger = asyncHandler(async (req, res) => {
  const user = await usersRepo.findById(req.user.id);
  const events = await ledgerEventsRepo.listForUser(req.user.id);

  const { currentLevel, xpForCurrentLevel, xpForNextLevel } = calculateLevel(user.xp);
  const { tier } = getTierData(currentLevel);

  res.json({
    data: {
      xp: user.xp,
      currentLevel,
      tier,
      bridgeTokens: user.bridge_tokens,
      progressPct: calculateProgressBar(user.xp),
      // The two thresholds calculateProgressBar's own percentage is derived
      // from — exposed so a UI (WorkerLevelRing.jsx) can show "X / Y XP to
      // next level" that numerically matches the ring's fill, instead of
      // re-deriving the curve itself or showing raw total xp (which would
      // NOT match progressPct once a worker is past Level 1).
      xpForCurrentLevel,
      xpForNextLevel,
      events,
    },
  });
});

// GET /api/gamification/business-tier — a business-only, separate track
// from the worker XP/Level system above. Tiered by real total spend
// (transactions.repository.js's sumFundsSecuredForBusiness), never XP.
export const getBusinessTierStatus = asyncHandler(async (req, res) => {
  if (req.user.role !== "business") {
    throw ApiError.forbidden("Enterprise Partner Tier is a business-only status.");
  }

  const totalSpend = await transactionsRepo.sumFundsSecuredForBusiness(req.user.id);
  const { tier, nextTier, nextThreshold } = getBusinessTier(totalSpend);

  res.json({ data: { totalSpend, tier, nextTier, nextThreshold } });
});
