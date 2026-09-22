import { pool } from "../db/pool.js";
import { config } from "../config.js";
import type { GameSummary } from "@scrabble/shared";
import { createGame, type InternalGame } from "./gameEngine.js";

const cache = new Map<string, InternalGame>();

export async function createNewGame(): Promise<InternalGame> {
  const game = createGame(config.players.player1.username, config.players.player2.username);
  cache.set(game.id, game);
  await persistGame(game);
  return game;
}

export async function listGames(): Promise<GameSummary[]> {
  const { rows } = await pool.query(
    `SELECT g.id, g.status, g.current_player_username, g.created_at, g.updated_at, g.last_reminded_at,
            p.username, p.score
     FROM games g
     JOIN game_players p ON p.game_id = g.id
     ORDER BY g.updated_at DESC, p.username ASC`
  );

  const byId = new Map<string, GameSummary>();
  for (const row of rows) {
    let summary = byId.get(row.id);
    if (!summary) {
      summary = {
        id: row.id,
        status: row.status,
        players: [] as unknown as GameSummary["players"],
        currentPlayerId: row.current_player_username,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastRemindedAt: row.last_reminded_at,
      };
      byId.set(row.id, summary);
    }
    (summary.players as { username: string; score: number }[]).push({
      username: row.username,
      score: row.score,
    });
  }

  return [...byId.values()];
}

export async function loadGame(id: string): Promise<InternalGame> {
  const cached = cache.get(id);
  if (cached) return cached;

  const { rows } = await pool.query(`SELECT * FROM games WHERE id = $1`, [id]);
  if (!rows[0]) throw new Error(`Game ${id} not found`);
  const row = rows[0];

  const { rows: playerRows } = await pool.query(
    `SELECT username, score, rack FROM game_players WHERE game_id = $1`,
    [id]
  );
  const players = playerRows.map((p) => ({
    id: p.username,
    username: p.username,
    score: p.score,
    rack: p.rack,
  })) as InternalGame["players"];

  const { rows: lastMoveRows } = await pool.query(
    `SELECT username, words, score FROM moves WHERE game_id = $1 AND kind = 'place' ORDER BY created_at DESC LIMIT 1`,
    [id]
  );
  const lastMoveRow = lastMoveRows[0];

  const game: InternalGame = {
    id: row.id,
    status: row.status,
    board: row.board,
    bag: row.bag,
    players,
    currentPlayerId: row.current_player_username,
    consecutivePasses: row.consecutive_passes,
    lastMove: lastMoveRow
      ? {
          username: lastMoveRow.username,
          words: (lastMoveRow.words as { word: string }[]).map((w) => w.word),
          score: lastMoveRow.score,
        }
      : null,
    isFirstMove: row.board.every((line: unknown[]) =>
      (line as { letter: string | null }[]).every((cell) => cell.letter === null)
    ),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastRemindedAt: row.last_reminded_at,
  };
  cache.set(game.id, game);
  return game;
}

export async function markReminded(gameId: string): Promise<void> {
  const { rows } = await pool.query(
    `UPDATE games SET last_reminded_at = now() WHERE id = $1 RETURNING last_reminded_at`,
    [gameId]
  );
  const cached = cache.get(gameId);
  if (cached) cached.lastRemindedAt = rows[0].last_reminded_at;
}

export async function persistGame(game: InternalGame): Promise<void> {
  await pool.query(
    `INSERT INTO games (id, status, board, bag, current_player_username, consecutive_passes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       board = EXCLUDED.board,
       bag = EXCLUDED.bag,
       current_player_username = EXCLUDED.current_player_username,
       consecutive_passes = EXCLUDED.consecutive_passes,
       updated_at = EXCLUDED.updated_at`,
    [
      game.id,
      game.status,
      JSON.stringify(game.board),
      JSON.stringify(game.bag),
      game.currentPlayerId,
      game.consecutivePasses,
      game.createdAt,
      game.updatedAt,
    ]
  );

  for (const player of game.players) {
    await pool.query(
      `INSERT INTO game_players (game_id, username, score, rack)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (game_id, username) DO UPDATE SET
         score = EXCLUDED.score,
         rack = EXCLUDED.rack`,
      [game.id, player.username, player.score, JSON.stringify(player.rack)]
    );
  }
}

export async function recordMove(
  gameId: string,
  username: string,
  kind: "place" | "pass" | "exchange",
  tiles: unknown,
  words: unknown,
  score: number
): Promise<void> {
  await pool.query(
    `INSERT INTO moves (game_id, username, kind, tiles, words, score) VALUES ($1, $2, $3, $4, $5, $6)`,
    [gameId, username, kind, JSON.stringify(tiles ?? null), JSON.stringify(words ?? null), score]
  );
}
