import { randomUUID } from "node:crypto";
import type { Board, GameState, LastMove, MoveResult, PlacedTile, Player, RackTile, RecentMove } from "@scrabble/shared";
import { createEmptyBoard } from "./board.js";
import { createBag, fillRack, LETTER_VALUES, RACK_SIZE } from "./tiles.js";
import { MoveError, validateAndExtractWords } from "./rules.js";
import { scoreMove } from "./scoring.js";

// 2 passes/exchanges per player in a row with no tile placed ends the game.
const NON_PLAYS_PER_PLAYER = 2;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 3;

export interface InternalGame {
  id: string;
  status: GameState["status"];
  board: Board;
  bag: string[];
  /** In turn order. */
  players: Player[];
  currentPlayerId: string;
  consecutivePasses: number;
  lastMove: LastMove | null;
  recentMoves: RecentMove[];
  isFirstMove: boolean;
  createdAt: string;
  updatedAt: string;
  lastRemindedAt: string | null;
}

/** `usernames` is the turn order: the first one plays first. */
export function createGame(usernames: string[]): InternalGame {
  if (usernames.length < MIN_PLAYERS || usernames.length > MAX_PLAYERS) {
    throw new Error(`A game needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players.`);
  }

  let bag = createBag();
  const players: Player[] = usernames.map((username) => {
    const draw = fillRack(bag, []);
    bag = draw.bag;
    return { id: username, username, score: 0, rack: draw.rack };
  });

  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    status: "in_progress",
    board: createEmptyBoard(),
    bag,
    players,
    currentPlayerId: usernames[0],
    consecutivePasses: 0,
    lastMove: null,
    recentMoves: [],
    isFirstMove: true,
    createdAt: now,
    updatedAt: now,
    lastRemindedAt: null,
  };
}

export function toPublicState(game: InternalGame): GameState {
  return {
    id: game.id,
    status: game.status,
    board: game.board,
    bagCount: game.bag.length,
    players: game.players,
    currentPlayerId: game.currentPlayerId,
    consecutivePasses: game.consecutivePasses,
    lastMove: game.lastMove,
    recentMoves: game.recentMoves,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
  };
}

function requireTurn(game: InternalGame, username: string) {
  if (game.status !== "in_progress") throw new MoveError("La partie est terminée.");
  if (game.currentPlayerId !== username) throw new MoveError("Ce n'est pas ton tour.");
}

function currentPlayer(game: InternalGame, username: string): Player {
  return game.players.find((p) => p.username === username)!;
}

/** Number of turns kept in recentMoves: one per other player. */
export function recentMovesLimit(playerCount: number): number {
  return Math.max(playerCount - 1, 1);
}

function pushRecentMove(game: InternalGame, move: RecentMove) {
  game.recentMoves = [...game.recentMoves, move].slice(-recentMovesLimit(game.players.length));
}

function advanceTurn(game: InternalGame) {
  const index = game.players.findIndex((p) => p.username === game.currentPlayerId);
  game.currentPlayerId = game.players[(index + 1) % game.players.length].username;
  game.updatedAt = new Date().toISOString();
}

/**
 * Read-only check used to preview a not-yet-submitted placement: validates it the
 * same way applyPlace does, but never mutates the game and never throws — an
 * illegal placement simply has no preview.
 */
export function previewPlace(game: InternalGame, placed: PlacedTile[]): MoveResult | null {
  try {
    const words = validateAndExtractWords(game.board, placed, game.isFirstMove);
    return scoreMove(game.board, words, placed);
  } catch (err) {
    if (err instanceof MoveError) return null;
    throw err;
  }
}

export function applyPlace(game: InternalGame, username: string, placed: PlacedTile[]): MoveResult {
  requireTurn(game, username);
  const player = currentPlayer(game, username);

  const rackById = new Map(player.rack.map((t) => [t.id, t]));
  for (const t of placed) {
    const rackTile = rackById.get(t.rackTileId);
    if (!rackTile) throw new MoveError("Cette tuile n'est pas dans ton chevalet.");
    if (!t.isBlank && rackTile.letter !== t.letter) {
      throw new MoveError("La lettre ne correspond pas à la tuile du chevalet.");
    }
    if (t.isBlank && rackTile.letter !== "") {
      throw new MoveError("Cette tuile n'est pas un joker.");
    }
  }

  const words = validateAndExtractWords(game.board, placed, game.isFirstMove);
  const result = scoreMove(game.board, words, placed);

  for (const t of placed) {
    game.board[t.row][t.col] = {
      ...game.board[t.row][t.col],
      letter: t.letter,
      isBlank: t.isBlank,
    };
  }

  const usedIds = new Set(placed.map((t) => t.rackTileId));
  player.rack = player.rack.filter((t) => !usedIds.has(t.id));
  player.score += result.totalScore;

  const { rack, bag } = fillRack(game.bag, player.rack);
  player.rack = rack;
  game.bag = bag;

  game.isFirstMove = false;
  game.consecutivePasses = 0;
  game.lastMove = {
    username: player.username,
    words: result.words.map((w) => w.word),
    score: result.totalScore,
    cells: placed.map((t) => ({ row: t.row, col: t.col })),
  };
  pushRecentMove(game, { ...game.lastMove, kind: "place", tileCount: placed.length });

  if (game.bag.length === 0 && player.rack.length === 0) {
    finishGameEarly(game, player.username);
  } else {
    advanceTurn(game);
  }

  game.updatedAt = new Date().toISOString();
  return result;
}

export function applyPass(game: InternalGame, username: string) {
  requireTurn(game, username);
  pushRecentMove(game, { username, kind: "pass", words: [], score: 0, cells: [], tileCount: 0 });
  game.consecutivePasses += 1;
  if (tooManyNonPlays(game)) {
    finishGameByExhaustion(game);
  } else {
    advanceTurn(game);
  }
}

function tooManyNonPlays(game: InternalGame): boolean {
  return game.consecutivePasses >= NON_PLAYS_PER_PLAYER * game.players.length;
}

export function applyExchange(game: InternalGame, username: string, rackTileIds: string[]) {
  requireTurn(game, username);
  if (game.bag.length < rackTileIds.length) {
    throw new MoveError("Pas assez de tuiles dans le sac pour échanger.");
  }

  const player = currentPlayer(game, username);
  const idsToExchange = new Set(rackTileIds);
  const tilesToExchange = player.rack.filter((t) => idsToExchange.has(t.id));
  if (tilesToExchange.length !== rackTileIds.length) {
    throw new MoveError("Certaines tuiles à échanger ne sont pas dans ton chevalet.");
  }

  const keptRack = player.rack.filter((t) => !idsToExchange.has(t.id));
  const bagWithReturnedTiles = shuffleIn(game.bag, tilesToExchange.map((t) => t.letter));
  const { rack, bag } = fillRack(bagWithReturnedTiles, keptRack);

  player.rack = rack;
  game.bag = bag;
  pushRecentMove(game, { username, kind: "exchange", words: [], score: 0, cells: [], tileCount: rackTileIds.length });
  game.consecutivePasses += 1;

  if (tooManyNonPlays(game)) {
    finishGameByExhaustion(game);
  } else {
    advanceTurn(game);
  }
}

function shuffleIn(bag: string[], returnedLetters: string[]): string[] {
  const combined = [...bag, ...returnedLetters];
  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }
  return combined;
}

function rackValue(rack: RackTile[]): number {
  return rack.reduce((sum, t) => sum + (t.letter === "" ? 0 : LETTER_VALUES[t.letter] ?? 0), 0);
}

/**
 * A player emptied their rack with an empty bag: standard end-game scoring.
 * Each opponent loses the value of their own rack, and the finisher gains the
 * total of all of them.
 */
function finishGameEarly(game: InternalGame, finisherUsername: string) {
  const finisher = currentPlayer(game, finisherUsername);
  for (const opponent of game.players) {
    if (opponent === finisher) continue;
    const opponentRackValue = rackValue(opponent.rack);
    finisher.score += opponentRackValue;
    opponent.score -= opponentRackValue;
  }
  game.status = "finished";
}

/** Too many consecutive passes/exchanges: each player loses the value of their own rack. */
function finishGameByExhaustion(game: InternalGame) {
  for (const player of game.players) {
    player.score -= rackValue(player.rack);
  }
  game.status = "finished";
}

export { RACK_SIZE };
