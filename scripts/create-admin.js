// backend/scripts/create-admin.js
// Public registration deliberately can never create an admin account (see
// auth.validators.js's registerSchema) — this is the one legitimate way to
// provision one, for any environment (local, staging, production). Point it
// at the right database via DATABASE_URL, e.g.:
//
//   $env:DATABASE_URL = "<production connection string>"   (PowerShell)
//   node scripts/create-admin.js --name "Platform Admin" --email admin@workbridge.io --password "…"
//
// Run from the backend/ directory so dotenv/config picks up backend/.env
// automatically when DATABASE_URL isn't already set in the shell — an
// explicit shell env var always wins over the .env file.

import "dotenv/config";
import bcrypt from "bcryptjs";
import { query } from "../src/db/client.js";

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i]?.replace(/^--/, "");
    args[key] = process.argv[i + 1];
  }
  return args;
}

const { name, email, password } = parseArgs();

if (!name || !email || !password) {
  console.error("Usage: node scripts/create-admin.js --name \"Full Name\" --email admin@example.com --password \"...\"");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 10);

try {
  const { rows } = await query(
    `INSERT INTO users (role, name, email, password_hash)
     VALUES ('admin', $1, $2, $3)
     RETURNING id, name, email, role`,
    [name, email, passwordHash]
  );
  console.log(`Admin created: ${rows[0].name} <${rows[0].email}> (id ${rows[0].id})`);
} catch (err) {
  if (err.code === "23505") {
    console.error(`An account with email ${email} already exists.`);
    process.exit(1);
  }
  throw err;
}

process.exit(0);
