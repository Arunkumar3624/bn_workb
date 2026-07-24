// backend/scripts/set-company-name.js
// One-off: sets profile.companyName for a real, already-existing business
// account — the same field BusinessCompany.jsx's Edit Profile form now
// saves for real. Running this is equivalent to opening Company Page ->
// Edit Profile -> typing the name in yourself; this just does it directly.
//
// Run from the backend/ directory so dotenv/config picks up backend/.env:
//   node scripts/set-company-name.js
// Against production, same DATABASE_URL override as every other script here:
//   $env:DATABASE_URL = "<production connection string>"; node scripts/set-company-name.js

import "dotenv/config";
import * as usersRepo from "../src/repositories/users.repository.js";

const BUSINESS_EMAIL = "markantan01031952@gmail.com";
const COMPANY_NAME = "RetailX Pvt Ltd";

async function main() {
  const business = await usersRepo.findByEmail(BUSINESS_EMAIL);
  if (!business) throw new Error(`No user found for ${BUSINESS_EMAIL}.`);
  if (business.role !== "business") throw new Error(`${BUSINESS_EMAIL} exists but is role="${business.role}", expected "business".`);

  await usersRepo.updateSelf(business.id, {
    profilePatch: { companyName: COMPANY_NAME },
  });

  console.log(`Set companyName = "${COMPANY_NAME}" for ${BUSINESS_EMAIL}.`);
  console.log("Reload Company Page / Post a Job / Find Workers — all three now show this name consistently.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
