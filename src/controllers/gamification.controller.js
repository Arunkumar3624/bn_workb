import { asyncHandler } from "../utils/asyncHandler.js";
import * as usersRepo from "../repositories/users.repository.js";
import * as ledgerEventsRepo from "../repositories/ledger_events.repository.js";
import { calculateLevel, calculateProgressBar, getTierData } from "../utils/gamification.js";

// GET /api/gamification/ledger — the caller's own real balance + earn
// history (ledger_events). Never returns platform_fee_pct — only tier_name
// (getTierData), same Abstracted Ladder boundary as everywhere else this
// data surfaces.
export const getLedger = asyncHandler(async (req, res) => {
  const user = await usersRepo.findById(req.user.id);
  const events = await ledgerEventsRepo.listForUser(req.user.id);

  const { currentLevel } = calculateLevel(user.xp);
  const { tier } = getTierData(currentLevel);

  res.json({
    data: {
      xp: user.xp,
      currentLevel,
      tier,
      bridgeTokens: user.bridge_tokens,
      progressPct: calculateProgressBar(user.xp),
      events,
    },
  });
});
