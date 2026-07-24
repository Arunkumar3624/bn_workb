// backend/scripts/reactivate-account.js
// One-off: reverses Security Monitor's "Ban User" action for a real account
// (sets users.is_active back to true). Use this when an account was banned
// in error — e.g. an admin account got banned because admins can send chat
// messages as themselves (they pass mustBeParticipant), and testing the
// contact-info block logged the attempt under the admin's own sender_id.
//
// Run from the backend/ directory so dotenv/config picks up backend/.env:
//   node scripts/reactivate-account.js
// Against production, same DATABASE_URL override as every other script here:
//   $env:DATABASE_URL = "<production connection string>"; node scripts/reactivate-account.js

import "dotenv/config";
import { transaction } from "../src/db/client.js";
import * as usersRepo from "../src/repositories/users.repository.js";

const EMAIL = "arunkumar.palaniselvam.s@gmail.com";

async function main() {
  const user = await usersRepo.findByEmail(EMAIL);
  if (!user) throw new Error(`No user found for ${EMAIL}.`);

  console.log(`Found ${EMAIL} — role=${user.role}, is_active=${user.is_active}`);

  if (user.is_active) {
    console.log("Already active — nothing to do.");
    return;
  }

  await transaction(async (client) => {
    await usersRepo.setActive(client, user.id, true);
  });

  console.log(`Reactivated ${EMAIL}. They can sign in again now.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
