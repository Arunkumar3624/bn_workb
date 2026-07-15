import pg from "pg";

if (!process.env.DATABASE_URL) {
  // Fail loudly at boot, not on the first query mid-request — a missing
  // connection string is a config error, not a runtime one.
  throw new Error(
    "DATABASE_URL is not set. Copy backend/.env.example to backend/.env and " +
      "point it at the Postgres container from docker-compose.yml."
  );
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

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
