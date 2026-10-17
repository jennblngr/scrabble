import Fastify from "fastify";
import { config } from "./config.js";
import { allPlayers, loadAccounts } from "./accounts.js";
import { applySchema } from "./db/schema.js";
import { registerAuth, getUsernameFromRequest } from "./auth/auth.js";
import { createNewGame, listGames, loadGame, markReminded, deleteGame } from "./game/store.js";
import { MAX_PLAYERS } from "./game/gameEngine.js";
import { saveSubscription, notifyUser } from "./push.js";
import { setupSocket } from "./socket/index.js";

const app = Fastify({ logger: true });

// Before anything reads the database (loadAccounts below).
await applySchema();
await loadAccounts();
await registerAuth(app);

app.get("/api/health", async () => ({ ok: true }));

app.get("/api/games", async (req, reply) => {
  const username = getUsernameFromRequest(req);
  if (!username) return reply.code(401).send({ error: "Non authentifié" });
  return { games: await listGames(username) };
});

app.post<{ Body: { opponents?: string[] } | undefined }>("/api/games", async (req, reply) => {
  const username = getUsernameFromRequest(req);
  if (!username) return reply.code(401).send({ error: "Non authentifié" });

  // Without an explicit choice (clients from before 3-player games), keep the
  // original pairing: player1 against player2.
  const opponents = req.body?.opponents ?? [config.players.player1.username, config.players.player2.username];
  const participants = new Set([username, ...opponents]);
  const knownPlayers = allPlayers();
  const validOpponents = opponents.every((o) => knownPlayers.some((p) => p.username === o));
  if (!validOpponents || participants.size < 2 || participants.size > MAX_PLAYERS) {
    return reply.code(400).send({ error: "Choix des joueurs invalide" });
  }

  // The creator plays first; the others follow in the accounts' configured order.
  const ordered = knownPlayers.map((p) => p.username).filter((u) => participants.has(u));
  const creatorIndex = Math.max(ordered.indexOf(username), 0);
  const usernames = [...ordered.slice(creatorIndex), ...ordered.slice(0, creatorIndex)];
  const game = await createNewGame(usernames);

  for (const player of game.players) {
    if (player.username === username) continue;
    await notifyUser(player.username, {
      title: "Scrabble",
      body: `${username} a lancé une nouvelle partie !`,
    });
  }

  return { gameId: game.id };
});

app.post<{ Params: { id: string } }>("/api/games/:id/remind", async (req, reply) => {
  const username = getUsernameFromRequest(req);
  if (!username) return reply.code(401).send({ error: "Non authentifié" });

  const game = await loadGame(req.params.id);
  if (!game.players.some((p) => p.username === username)) {
    return reply.code(403).send({ error: "Accès refusé" });
  }
  if (game.status === "finished" || game.currentPlayerId === username) {
    return reply.code(400).send({ error: "Impossible de relancer maintenant" });
  }
  const lastActivity =
    game.lastRemindedAt && new Date(game.lastRemindedAt) > new Date(game.updatedAt)
      ? game.lastRemindedAt
      : game.updatedAt;
  const hoursSinceLastActivity = (Date.now() - new Date(lastActivity).getTime()) / 3_600_000;
  if (hoursSinceLastActivity < 24) {
    return reply.code(400).send({ error: "Trop tôt pour relancer" });
  }

  await notifyUser(game.currentPlayerId, {
    title: "Scrabble",
    body: `${username} attend que tu joues ton coup !`,
  });
  await markReminded(game.id);
  return { ok: true };
});

app.delete<{ Params: { id: string } }>("/api/games/:id", async (req, reply) => {
  const username = getUsernameFromRequest(req);
  if (!username) return reply.code(401).send({ error: "Non authentifié" });

  // La suppression n'est pas limitée aux joueurs de la partie : l'appli est
  // privée, et chaque joueur ne voit de toute façon que ses propres parties
  // dans la liste.
  await deleteGame(req.params.id);
  return { ok: true };
});

app.get("/api/push/vapid-public-key", async () => ({ publicKey: config.vapid.publicKey }));

app.post<{ Body: { subscription: { endpoint: string; keys: { p256dh: string; auth: string } } } }>(
  "/api/push/subscribe",
  async (req, reply) => {
    const username = getUsernameFromRequest(req);
    if (!username) return reply.code(401).send({ error: "Non authentifié" });
    await saveSubscription(username, req.body.subscription);
    return { ok: true };
  }
);

await app.ready();
setupSocket(app, app.server);

app.listen({ port: config.port, host: "0.0.0.0" }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
