import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Load the repo-root .env regardless of the process's cwd (npm --workspace
// scripts run with cwd set to the package directory, not the repo root).
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(here, "..", "..", "..", ".env") });

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL", process.env.DATABASE_URL),
  sessionSecret: required("SESSION_SECRET", process.env.SESSION_SECRET),
  players: {
    player1: {
      username: required("PLAYER1_USERNAME", process.env.PLAYER1_USERNAME),
      passwordHash: required("PLAYER1_PASSWORD_HASH", process.env.PLAYER1_PASSWORD_HASH),
    },
    player2: {
      username: required("PLAYER2_USERNAME", process.env.PLAYER2_USERNAME),
      passwordHash: required("PLAYER2_PASSWORD_HASH", process.env.PLAYER2_PASSWORD_HASH),
    },
  },
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? "",
    privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
    subject: process.env.VAPID_SUBJECT ?? "mailto:example@example.com",
  },
};
