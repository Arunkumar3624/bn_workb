// backend/scripts/migrate.js
// Pipes schema.sql into the running Postgres container via `docker exec`.
// ESM (this package is "type": "module") and reads schema.sql directly in
// Node rather than shelling out to `cat schema.sql | docker exec ...` —
// that pipe only works in a POSIX shell; this runs the same on PowerShell,
// cmd, and bash.

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The container's credentials live in the ROOT .env (the one
// docker-compose.yml reads) — not backend/.env, which holds the app's own
// DATABASE_URL. Both must describe the same database, but this script only
// needs the container's own POSTGRES_USER/POSTGRES_DB to talk to psql.
const rootEnvPath = path.resolve(__dirname, "../../.env");
if (!existsSync(rootEnvPath)) {
  console.error(`Root .env not found at ${rootEnvPath} — copy .env.example there first.`);
  process.exit(1);
}
dotenv.config({ path: rootEnvPath });

const containerName = "workbridge_db_container";
const dbUser = process.env.POSTGRES_USER;
const dbName = process.env.POSTGRES_DB;

if (!dbUser || !dbName) {
  console.error("POSTGRES_USER / POSTGRES_DB missing from the root .env.");
  process.exit(1);
}

const schemaPath = path.resolve(__dirname, "../schema.sql");
const schemaSql = readFileSync(schemaPath, "utf8");

console.log(`Applying schema.sql to ${containerName}...`);

const result = spawnSync("docker", ["exec", "-i", containerName, "psql", "-U", dbUser, "-d", dbName], {
  input: schemaSql,
  stdio: ["pipe", "inherit", "inherit"],
});

if (result.error) {
  console.error("Could not run `docker` — is Docker installed and on your PATH?");
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`Migration failed (exit ${result.status}). Is the container running? Try: docker compose up -d`);
  process.exit(1);
}

console.log("Schema applied successfully — your database is ready.");
