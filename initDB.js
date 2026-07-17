import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });

const { Client } = pg;
const schemaPath = path.resolve(__dirname, "schema.sql");

async function initDB() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  let exitCode = 0;

  console.log("============================================================");
  console.log("WorkBridge database initialization started");
  console.log("============================================================");
  console.log(`Reading schema from: ${schemaPath}`);

  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log("Connecting to PostgreSQL...");
    await client.connect();

    console.log("Executing schema.sql...");
    await client.query(schemaSql);

    console.log("============================================================");
    console.log("SUCCESS: WorkBridge database tables were built successfully.");
    console.log("============================================================");
  } catch (err) {
    exitCode = 1;
    console.error("============================================================");
    console.error("FAILED: WorkBridge database initialization failed.");
    console.error("============================================================");
    console.error(err);
  } finally {
    await client.end().catch((err) => {
      console.error("Failed to close PostgreSQL connection:");
      console.error(err);
    });
    process.exit(exitCode);
  }
}

initDB();
