import type { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import cookie from "@fastify/cookie";
import { config } from "../config.js";

const SESSION_COOKIE = "scrabble_session";
const knownPlayers = [config.players.player1, config.players.player2];

export async function registerAuth(app: FastifyInstance) {
  await app.register(cookie, {
    secret: config.sessionSecret,
  });

  app.post<{ Body: { username: string; password: string } }>("/api/auth/login", async (req, reply) => {
    const { username, password } = req.body ?? {};
    const player = knownPlayers.find((p) => p.username === username);
    const valid = player ? await bcrypt.compare(password ?? "", player.passwordHash) : false;

    if (!player || !valid) {
      return reply.code(401).send({ error: "Identifiants invalides" });
    }

    reply.setCookie(SESSION_COOKIE, username, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      signed: true,
      maxAge: 60 * 60 * 24 * 30, // 30 days — this is a 2-player private app, long sessions are fine
    });
    return { username };
  });

  app.get("/api/auth/players", async () => {
    return { usernames: knownPlayers.map((p) => p.username) };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (req, reply) => {
    const username = getUsernameFromRequest(req);
    if (!username) return reply.code(401).send({ error: "Non authentifié" });
    return { username };
  });
}

export function getUsernameFromRequest(req: { cookies: Record<string, string | undefined>; unsignCookie: (v: string) => { valid: boolean; value: string | null } }): string | null {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  return knownPlayers.some((p) => p.username === unsigned.value) ? unsigned.value : null;
}

/** Used by the Socket.io handshake, which only has a raw Cookie header string. */
export function getUsernameFromCookieHeader(app: FastifyInstance, cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const parsed = app.parseCookie(cookieHeader);
  const raw = parsed[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = app.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  return knownPlayers.some((p) => p.username === unsigned.value) ? unsigned.value : null;
}
