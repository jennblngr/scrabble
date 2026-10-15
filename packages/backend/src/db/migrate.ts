import { pool } from "./pool.js";
import { applySchema } from "./schema.js";

async function main() {
  await applySchema();
  console.log("Migration applied.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
