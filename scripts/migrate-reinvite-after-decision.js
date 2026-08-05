import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required to run the reinvite-after-decision migration.");
  process.exit(1);
}

const dbHost = new URL(databaseUrl).hostname;
const isLocalDb = dbHost === "localhost" || dbHost === "127.0.0.1" || !dbHost.includes(".");

const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});

try {
  const migrationPath = path.resolve(__dirname, "../migrations/025_reinvite_after_decision.sql");
  const sql = readFileSync(migrationPath, "utf8");

  console.log(`Applying migrations/025_reinvite_after_decision.sql to ${dbHost}...`);
  await pool.query(sql);
  console.log("Reinvite-after-decision migration applied successfully.");
} catch (err) {
  console.error("Reinvite-after-decision migration failed:");
  console.error(err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
