import { pool } from "../db/pool.js";
import type { GameSummary } from "@scrabble/shared";
import { createGame, recentMovesLimit, type InternalGame } from "./gameEngine.js";

const cache = new Map<string, InternalGame>();

/** `usernames` is the turn order: the first one plays first. */
export async function createNewGame(usernames: string[]): Promise<InternalGame> {
  const game = createGame(usernames);
  cache.set(game.id, game);
  await persistGame(game);
  return game;
}

/** The games `username` takes part in, most recently active first. */
export async function listGames(username: string): Promise<GameSummary[]> {
  const { rows } = await pool.query(
    `SELECT g.id, g.status, g.current_player_username, g.created_at, g.updated_at, g.last_reminded_at,
            p.username, p.score
     FROM games g
     JOIN game_players p ON p.game_id = g.id
     WHERE g.id IN (SELECT game_id FROM game_players WHERE username = $1)
     ORDER BY g.updated_at DESC, g.id, p.seat NULLS LAST, p.username ASC`,
    [username]
  );

  const byId = new Map<string, GameSummary>();
  for (const row of rows) {
    let summary = byId.get(row.id);
    if (!summary) {
      summary = {
        id: row.id,
        status: row.status,
        players: [],
        currentPlayerId: row.current_player_username,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastRemindedAt: row.last_reminded_at,
      };
      byId.set(row.id, summary);
    }
    summary.players.push({
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
    // Games created before seats existed have none; with only 2 players,
    // their order doesn't matter for turn rotation.
    `SELECT username, score, rack FROM game_players WHERE game_id = $1 ORDER BY seat NULLS LAST, username`,
    [id]
  );
  const players = playerRows.map((p) => ({
    id: p.username,
    username: p.username,
    score: p.score,
    rack: p.rack,
  }));

  const { rows: lastMoveRows } = await pool.query(
    `SELECT username, words, score, tiles FROM moves WHERE game_id = $1 AND kind = 'place' ORDER BY created_at DESC LIMIT 1`,
    [id]
  );
  const lastMoveRow = lastMoveRows[0];

  const { rows: recentRows } = await pool.query(
    `SELECT username, kind, words, score, tiles FROM moves WHERE game_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [id, recentMovesLimit(players.length)]
  );
  const recentMoves: InternalGame["recentMoves"] = recentRows.reverse().map((m) => {
    // tiles holds the placed tiles for a place, the exchanged rack tile ids
    // for an exchange, and null for a pass.
    const tiles = (m.tiles ?? []) as unknown[];
    return {
      username: m.username,
      kind: m.kind,
      words: m.kind === "place" ? (m.words as { word: string }[]).map((w) => w.word) : [],
      score: m.score,
      cells:
        m.kind === "place"
          ? (tiles as { row: number; col: number }[]).map((t) => ({ row: t.row, col: t.col }))
          : [],
      tileCount: tiles.length,
    };
  });

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
          cells: (lastMoveRow.tiles as { row: number; col: number }[]).map((t) => ({
            row: t.row,
            col: t.col,
          })),
        }
      : null,
    recentMoves,
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

export async function deleteGame(gameId: string): Promise<void> {
  await pool.query(`DELETE FROM games WHERE id = $1`, [gameId]);
  cache.delete(gameId);
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

  for (const [seat, player] of game.players.entries()) {
    await pool.query(
      `INSERT INTO game_players (game_id, username, seat, score, rack)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (game_id, username) DO UPDATE SET
         seat = EXCLUDED.seat,
         score = EXCLUDED.score,
         rack = EXCLUDED.rack`,
      [game.id, player.username, seat, player.score, JSON.stringify(player.rack)]
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
