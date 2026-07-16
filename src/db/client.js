import pg from "pg";

if (!process.env.DATABASE_URL) {
  // Fail loudly at boot, not on the first query mid-request — a missing
  // connection string is a config error, not a runtime one.
  throw new Error(
    "DATABASE_URL is not set. Copy backend/.env.example to backend/.env and " +
      "point it at the Postgres container from docker-compose.yml."
  );
}

// Local docker-compose Postgres has no SSL support at all; managed Postgres
// (Render, and every other host) requires it — enabling it unconditionally
// would break local dev, so it's keyed off whether the host is localhost.
// rejectUnauthorized: false because these hosts use provider-issued certs
// this client has no CA bundle for; the connection is still encrypted, just
// not chain-verified (the standard pattern for connecting to Render/Heroku-
// style managed Postgres without vendoring their CA cert).
// Bare hostnames with no dot — "localhost", "127.0.0.1", or a Docker
// Compose/network service name like "workbridge_db_container" — are always
// a local, non-SSL Postgres. Anything with a dot is a real DNS name (managed
// Postgres from Render or any other host), which requires SSL.
const dbHost = new URL(process.env.DATABASE_URL).hostname;
const isLocalDb = dbHost === "localhost" || dbHost === "127.0.0.1" || !dbHost.includes(".");

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});

// A pool-level connection error (e.g. the container restarts, a network
// blip) fires here asynchronously, outside any request — without this
// handler it's an uncaught exception that crashes the whole process.
pool.on("error", (err) => {
  console.error("[db] Unexpected error on an idle client:", err);
});

/** Single-statement query. Thin wrapper so controllers never import `pg` directly. */
export async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Runs `work(client)` inside BEGIN/COMMIT, ROLLBACK on any thrown error.
 * `client` inside `work` is a single checked-out connection — every query
 * inside the callback MUST run through it, not through `query()`/the pool,
 * or it won't be part of the transaction. Always releases the connection
 * back to the pool, success or failure.
 */
export async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
