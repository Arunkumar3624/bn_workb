// backend/scripts/grant-test-max-level.js
// One-off, scoped to your own real worker test account only (same email
// grant-test-gamification-credits.js already uses) — bumps it straight to
// Level 200, the hard prestige cap, so every MILESTONES badge (and every
// material-rank visual band in WorkerMilestones.jsx) shows as achieved and
// pinnable for real testing. Idempotent: computes the exact XP delta needed
// to reach the cap from your CURRENT xp, so running it twice never
// over-grants. Uses the same awardXp + ledger_events path completeProject
// uses, logged as "TEST_GRANT" so it's honestly distinguishable in the
// Ledger's activity history from anything actually earned.
//
// Deliberately NOT named "*-test.js" — Node's test runner (`npm test` ->
// `node --test`) auto-discovers any file matching that glob and tries to
// run it as a test suite, which fails since this is a one-off script, not
// a test file.
//
// Run from the backend/ directory so dotenv/config picks up backend/.env:
//   node scripts/grant-test-max-level.js
// Against production, same DATABASE_URL override as every other script here:
//   $env:DATABASE_URL = "<production connection string>"; node scripts/grant-test-max-level.js

import "dotenv/config";
import { transaction } from "../src/db/client.js";
import * as usersRepo from "../src/repositories/users.repository.js";
import * as ledgerEventsRepo from "../src/repositories/ledger_events.repository.js";
import { calculateLevel } from "../src/utils/gamification.js";

const TEST_EMAIL = "arun0362004@gmail.com";
const MAX_LEVEL = 200;
const TEST_TOKENS = 5000; // generous — also lets you test every Token Shop tier

// Binary-search the XP curve for the smallest xp that calculateLevel()
// reports as MAX_LEVEL, rather than hardcoding a threshold that could drift
// out of sync with gamification.js's BASE/GROWTH constants.
function xpForMaxLevel() {
  let lo = 0;
  let hi = 50_000_000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (calculateLevel(mid).currentLevel >= MAX_LEVEL) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

async function main() {
  const user = await usersRepo.findByEmail(TEST_EMAIL);
  if (!user) throw new Error(`No user found for ${TEST_EMAIL}.`);

  const targetXp = xpForMaxLevel();
  const xpDelta = Math.max(0, targetXp - user.xp);

  if (xpDelta === 0) {
    console.log(`${TEST_EMAIL} is already Level ${calculateLevel(user.xp).currentLevel} — no XP needed.`);
  } else {
    await transaction(async (client) => {
      await usersRepo.awardXp(client, user.id, { xpDelta, tokenDelta: TEST_TOKENS, currentLevel: MAX_LEVEL });
      await ledgerEventsRepo.create(client, {
        userId: user.id,
        eventType: "TEST_GRANT",
        xpDelta,
        tokenDelta: TEST_TOKENS,
      });
    });
    console.log(`Granted ${TEST_EMAIL}: +${xpDelta} XP (now Level ${MAX_LEVEL}), +${TEST_TOKENS} tokens.`);
  }

  console.log("Every MILESTONES badge (Level 5 through 200) is now achieved and pinnable — reload the Badges page.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
