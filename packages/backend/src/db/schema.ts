import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "./pool.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(path.join(here, "schema.sql"), "utf8");

// Arbitrary key, shared by every process applying the schema.
const SCHEMA_LOCK_KEY = 4_215_118;

/**
 * Applies schema.sql. It is idempotent (IF NOT EXISTS everywhere), so it runs
 * on every backend start: an environment that never runs `db:migrate` (e.g. a
 * preview) still gets the tables the code needs. The advisory lock keeps two
 * processes (backend + migrate script) from racing on the same CREATE TABLE.
 */
export async function applySchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [SCHEMA_LOCK_KEY]);
    await client.query(schema);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [SCHEMA_LOCK_KEY]).catch(() => {});
    client.release();
  }
}
