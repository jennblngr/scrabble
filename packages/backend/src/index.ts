import Fastify from "fastify";
import { config } from "./config.js";
import { registerAuth, getUsernameFromRequest } from "./auth/auth.js";
import { createNewGame, listGames, loadGame, markReminded, deleteGame } from "./game/store.js";
import { saveSubscription, notifyUser } from "./push.js";
import { setupSocket } from "./socket/index.js";

const app = Fastify({ logger: true });

await registerAuth(app);

app.get("/api/health", async () => ({ ok: true }));

app.get("/api/games", async (req, reply) => {
  const username = getUsernameFromRequest(req);
  if (!username) return reply.code(401).send({ error: "Non authentifié" });
  return { games: await listGames() };
});

app.post("/api/games", async (req, reply) => {
  const username = getUsernameFromRequest(req);
  if (!username) return reply.code(401).send({ error: "Non authentifié" });
  const game = await createNewGame();

  const opponent = game.players.find((p) => p.username !== username);
  if (opponent) {
    await notifyUser(opponent.username, {
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

  // Comme la liste des parties, la suppression n'est pas limitée aux joueurs
  // de cette partie précise : ce sont les 2 seuls comptes de l'appli et ils
  // partagent la même liste (y compris les vieilles parties de test).
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
