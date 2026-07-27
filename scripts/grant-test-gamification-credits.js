// backend/scripts/grant-test-gamification-credits.js
// One-off: grants test XP/tokens to the real worker and business accounts
// so their real Ledger/Shop/Milestones pages have something to actually
// test purchases and tier progression against. Uses the exact same
// awardXp + ledger_events path completeProject uses — logged as a
// "TEST_GRANT" event type so it's honestly distinguishable in the Ledger's
// activity history from anything actually earned, not silently invented.
//
// Run from the backend/ directory so dotenv/config picks up backend/.env:
//   node scripts/grant-test-gamification-credits.js
// Against production, same DATABASE_URL override as every other script here:
//   $env:DATABASE_URL = "<production connection string>"; node scripts/grant-test-gamification-credits.js

import "dotenv/config";
import { transaction } from "../src/db/client.js";
import * as usersRepo from "../src/repositories/users.repository.js";
import * as ledgerEventsRepo from "../src/repositories/ledger_events.repository.js";
import { calculateLevel } from "../src/utils/gamification.js";

const GRANTS = [
  { email: "arun0362004@gmail.com", role: "worker", xp: 2200, tokens: 200 },
  { email: "markantan01031952@gmail.com", role: "business", xp: 1600, tokens: 200 },
];

async function grant({ email, xp, tokens }) {
  const user = await usersRepo.findByEmail(email);
  if (!user) throw new Error(`No user found for ${email}.`);

  const newXp = user.xp + xp;
  const { currentLevel } = calculateLevel(newXp);

  await transaction(async (client) => {
    await usersRepo.awardXp(client, user.id, { xpDelta: xp, tokenDelta: tokens, currentLevel });
    await ledgerEventsRepo.create(client, {
      userId: user.id,
      eventType: "TEST_GRANT",
      xpDelta: xp,
      tokenDelta: tokens,
    });
  });

  console.log(`Granted ${email}: +${xp} XP (now Level ${currentLevel}), +${tokens} tokens.`);
}

async function main() {
  for (const g of GRANTS) {
    await grant(g);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
