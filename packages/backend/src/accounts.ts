import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { pool } from "./db/pool.js";
import { config, type KnownPlayer } from "./config.js";

const INVITATION_TTL_DAYS = 7;
export const MIN_PASSWORD_LENGTH = 8;
const USERNAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,19}$/u;

export type InvitationKind = "invite" | "reset";

// Accounts stored in the database: the ones created through an invitation,
// plus new passwords chosen by env-configured players through a reset link.
// Kept in memory (single backend process) so that authentication, which runs
// on every request and socket handshake, stays synchronous.
let dbAccounts: KnownPlayer[] = [];

export async function loadAccounts(): Promise<void> {
  const { rows } = await pool.query<{ username: string; password_hash: string }>(
    `SELECT username, password_hash FROM accounts ORDER BY created_at, username`
  );
  dbAccounts = rows.map((r) => ({ username: r.username, passwordHash: r.password_hash }));
}

/**
 * Every account, in seat order: the two env-configured players first, then
 * invited players by arrival. A password set through a reset link takes
 * precedence over the env one.
 */
export function allPlayers(): KnownPlayer[] {
  const envPlayers = [config.players.player1, config.players.player2];
  const overrides = new Map(dbAccounts.map((a) => [a.username, a]));
  const envNames = new Set(envPlayers.map((p) => p.username));
  return [
    ...envPlayers.map((p) => overrides.get(p.username) ?? p),
    ...dbAccounts.filter((a) => !envNames.has(a.username)),
  ];
}

export function findPlayer(username: string | null | undefined): KnownPlayer | undefined {
  return allPlayers().find((p) => p.username === username);
}

function isTaken(username: string): boolean {
  const lower = username.toLocaleLowerCase("fr");
  return allPlayers().some((p) => p.username.toLocaleLowerCase("fr") === lower);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class InvitationError extends Error {}

/** Returns the raw token, to put in the link. Only its hash is stored. */
export async function createInvitation(kind: InvitationKind, rawUsername: string, createdBy: string): Promise<string> {
  const username = rawUsername.trim();
  if (kind === "invite") {
    if (!USERNAME_PATTERN.test(username)) {
      throw new InvitationError("Prénom invalide (20 caractères max, lettres et chiffres).");
    }
    if (isTaken(username)) throw new InvitationError("Ce joueur existe déjà.");
  } else if (!findPlayer(username)) {
    throw new InvitationError("Joueur inconnu.");
  }

  const token = randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO invitations (token_hash, kind, username, created_by, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(days => $5))`,
    [hashToken(token), kind, username, createdBy, INVITATION_TTL_DAYS]
  );
  return token;
}

/** The pending (unused, unexpired) invitation behind a token, if any. */
export async function findInvitation(token: string): Promise<{ kind: InvitationKind; username: string } | null> {
  const { rows } = await pool.query(
    `SELECT kind, username FROM invitations
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [hashToken(token)]
  );
  return rows[0] ?? null;
}

/** Consumes the invitation and sets the password. Returns the username. */
export async function acceptInvitation(token: string, password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new InvitationError(`Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  }
  const passwordHash = await bcrypt.hash(password, 12);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Marking it used in the same statement that checks it makes the link
    // single-use even if it is submitted twice at once.
    const { rows } = await client.query<{ kind: InvitationKind; username: string }>(
      `UPDATE invitations SET used_at = now()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       RETURNING kind, username`,
      [hashToken(token)]
    );
    const invitation = rows[0];
    if (!invitation) throw new InvitationError("Ce lien n'est plus valide.");

    if (invitation.kind === "invite") {
      // Another invitation for the same name may have been accepted first.
      if (isTaken(invitation.username)) throw new InvitationError("Ce joueur existe déjà.");
      await client.query(`INSERT INTO accounts (username, password_hash) VALUES ($1, $2)`, [
        invitation.username,
        passwordHash,
      ]);
    } else {
      if (!findPlayer(invitation.username)) throw new InvitationError("Joueur inconnu.");
      await client.query(
        `INSERT INTO accounts (username, password_hash) VALUES ($1, $2)
         ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [invitation.username, passwordHash]
      );
    }
    await client.query("COMMIT");
    await loadAccounts();
    return invitation.username;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
