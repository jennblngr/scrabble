import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "./pool.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(path.join(here, "schema.sql"), "utf8");

async function main() {
  await pool.query(schema);
  console.log("Migration applied.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
