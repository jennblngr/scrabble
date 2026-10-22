import type { FastifyInstance, FastifyReply } from "fastify";
import bcrypt from "bcrypt";
import cookie from "@fastify/cookie";
import { config } from "../config.js";
import {
  acceptInvitation,
  allPlayers,
  createInvitation,
  findInvitation,
  findPlayer,
  InvitationError,
  MIN_PASSWORD_LENGTH,
  type InvitationKind,
} from "../accounts.js";

const SESSION_COOKIE = "scrabble_session";

function setSessionCookie(reply: FastifyReply, username: string) {
  reply.setCookie(SESSION_COOKIE, username, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    signed: true,
    // 1 year, renewed on every app launch (see /api/auth/me) — this is a small
    // private app: a player who keeps playing should never get logged out.
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function registerAuth(app: FastifyInstance) {
  await app.register(cookie, {
    secret: config.sessionSecret,
  });

  app.post<{ Body: { username: string; password: string } }>("/api/auth/login", async (req, reply) => {
    const { username, password } = req.body ?? {};
    const player = findPlayer(username);
    const valid = player ? await bcrypt.compare(password ?? "", player.passwordHash) : false;

    if (!player || !valid) {
      return reply.code(401).send({ error: "Identifiants invalides" });
    }

    setSessionCookie(reply, player.username);
    return { username: player.username };
  });

  app.get("/api/auth/players", async () => {
    return { usernames: allPlayers().map((p) => p.username) };
  });

  // Invitation / password reset links. Creating one needs a logged-in player;
  // using one doesn't (the token itself is the credential).
  app.post<{ Body: { kind?: InvitationKind; username?: string } }>("/api/invitations", async (req, reply) => {
    const createdBy = getUsernameFromRequest(req);
    if (!createdBy) return reply.code(401).send({ error: "Non authentifié" });
    const kind = req.body?.kind;
    if (kind !== "invite" && kind !== "reset") return reply.code(400).send({ error: "Type de lien invalide" });
    try {
      const token = await createInvitation(kind, req.body?.username ?? "", createdBy);
      return { token };
    } catch (err) {
      if (err instanceof InvitationError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.get<{ Params: { token: string } }>("/api/invitations/:token", async (req, reply) => {
    const invitation = await findInvitation(req.params.token);
    if (!invitation) return reply.code(404).send({ error: "Ce lien n'est plus valide." });
    return { ...invitation, minPasswordLength: MIN_PASSWORD_LENGTH };
  });

  app.post<{ Params: { token: string }; Body: { password?: string } }>(
    "/api/invitations/:token",
    async (req, reply) => {
      try {
        const username = await acceptInvitation(req.params.token, req.body?.password ?? "");
        setSessionCookie(reply, username);
        return { username };
      } catch (err) {
        if (err instanceof InvitationError) return reply.code(400).send({ error: err.message });
        throw err;
      }
    }
  );

  app.post("/api/auth/logout", async (req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (req, reply) => {
    const username = getUsernameFromRequest(req);
    if (!username) return reply.code(401).send({ error: "Non authentifié" });
    // Called each time the app opens: pushes the expiry back.
    setSessionCookie(reply, username);
    return { username };
  });
}

export function getUsernameFromRequest(req: { cookies: Record<string, string | undefined>; unsignCookie: (v: string) => { valid: boolean; value: string | null } }): string | null {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  return findPlayer(unsigned.value) ? unsigned.value : null;
}

/** Used by the Socket.io handshake, which only has a raw Cookie header string. */
export function getUsernameFromCookieHeader(app: FastifyInstance, cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const parsed = app.parseCookie(cookieHeader);
  const raw = parsed[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = app.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  return findPlayer(unsigned.value) ? unsigned.value : null;
}
