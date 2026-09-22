import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type { FastifyInstance } from "fastify";
import type { ClientToServerEvents, ServerToClientEvents } from "@scrabble/shared";
import { getUsernameFromCookieHeader } from "../auth/auth.js";
import { loadGame, persistGame, recordMove } from "../game/store.js";
import { applyExchange, applyPass, applyPlace, previewPlace, toPublicState } from "../game/gameEngine.js";
import { MoveError } from "../game/rules.js";
import { notifyUser } from "../push.js";

declare module "socket.io" {
  interface Socket {
    username: string;
  }
}

export function setupSocket(app: FastifyInstance, httpServer: HttpServer) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    path: "/socket.io",
  });

  io.use((socket, next) => {
    const username = getUsernameFromCookieHeader(app, socket.handshake.headers.cookie);
    if (!username) return next(new Error("unauthorized"));
    socket.username = username;
    next();
  });

  io.on("connection", (socket) => {
    socket.on("game:join", async (gameId) => {
      try {
        if (!gameId) throw new Error("gameId manquant.");
        const game = await loadGame(gameId);
        socket.join(`game:${game.id}`);
        socket.emit("game:state", toPublicState(game));
      } catch (err) {
        socket.emit("game:error", (err as Error).message);
      }
    });

    socket.on("game:leave", (gameId) => {
      socket.leave(`game:${gameId}`);
    });

    socket.on("game:place", async ({ gameId, tiles }) => {
      try {
        const game = await loadGame(gameId);
        const result = applyPlace(game, socket.username, tiles);
        await persistGame(game);
        await recordMove(game.id, socket.username, "place", tiles, result.words, result.totalScore);
        io.to(`game:${game.id}`).emit("game:state", toPublicState(game));
        await notifyUser(game.currentPlayerId, {
          title: "Scrabble",
          body: `${socket.username} a joué et marqué ${result.totalScore} points. À toi de jouer !`,
        });
      } catch (err) {
        socket.emit("game:error", errorMessage(err));
      }
    });

    socket.on("game:preview", async ({ gameId, tiles }) => {
      try {
        const game = await loadGame(gameId);
        socket.emit("game:preview", previewPlace(game, tiles));
      } catch {
        socket.emit("game:preview", null);
      }
    });

    socket.on("game:pass", async ({ gameId }) => {
      try {
        const game = await loadGame(gameId);
        applyPass(game, socket.username);
        await persistGame(game);
        await recordMove(game.id, socket.username, "pass", null, null, 0);
        io.to(`game:${game.id}`).emit("game:state", toPublicState(game));
      } catch (err) {
        socket.emit("game:error", errorMessage(err));
      }
    });

    socket.on("game:exchange", async ({ gameId, rackTileIds }) => {
      try {
        const game = await loadGame(gameId);
        applyExchange(game, socket.username, rackTileIds);
        await persistGame(game);
        await recordMove(game.id, socket.username, "exchange", rackTileIds, null, 0);
        io.to(`game:${game.id}`).emit("game:state", toPublicState(game));
      } catch (err) {
        socket.emit("game:error", errorMessage(err));
      }
    });

    socket.on("game:chat", ({ gameId, message }) => {
      io.to(`game:${gameId}`).emit("game:chat", {
        from: socket.username,
        message,
        at: new Date().toISOString(),
      });
    });
  });

  return io;
}

function errorMessage(err: unknown): string {
  if (err instanceof MoveError) return err.message;
  console.error(err);
  return "Une erreur est survenue.";
}
