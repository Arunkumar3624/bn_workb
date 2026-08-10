import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required to run the admin permissions migration.");
  process.exit(1);
}

const dbHost = new URL(databaseUrl).hostname;
const isLocalDb = dbHost === "localhost" || dbHost === "127.0.0.1" || !dbHost.includes(".");

const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});

try {
  const migrationPath = path.resolve(__dirname, "../migrations/034_admin_permissions.sql");
  const sql = readFileSync(migrationPath, "utf8");

  console.log(`Applying migrations/034_admin_permissions.sql to ${dbHost}...`);
  await pool.query(sql);
  console.log("Admin permissions migration applied successfully.");
} catch (err) {
  console.error("Admin permissions migration failed:");
  console.error(err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
