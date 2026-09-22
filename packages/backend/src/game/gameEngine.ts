import { randomUUID } from "node:crypto";
import type { Board, GameState, LastMove, MoveResult, PlacedTile, Player, RackTile } from "@scrabble/shared";
import { createEmptyBoard } from "./board.js";
import { createBag, fillRack, LETTER_VALUES, RACK_SIZE } from "./tiles.js";
import { MoveError, validateAndExtractWords } from "./rules.js";
import { scoreMove } from "./scoring.js";

const MAX_CONSECUTIVE_NON_PLAYS = 4; // 2 passes/exchanges per player with no tile placed ends the game

export interface InternalGame {
  id: string;
  status: GameState["status"];
  board: Board;
  bag: string[];
  players: [Player, Player];
  currentPlayerId: string;
  consecutivePasses: number;
  lastMove: LastMove | null;
  isFirstMove: boolean;
  createdAt: string;
  updatedAt: string;
}

export function createGame(player1Username: string, player2Username: string): InternalGame {
  let bag = createBag();
  const p1Draw = fillRack(bag, []);
  bag = p1Draw.bag;
  const p2Draw = fillRack(bag, []);
  bag = p2Draw.bag;

  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    status: "in_progress",
    board: createEmptyBoard(),
    bag,
    players: [
      { id: player1Username, username: player1Username, score: 0, rack: p1Draw.rack },
      { id: player2Username, username: player2Username, score: 0, rack: p2Draw.rack },
    ],
    currentPlayerId: player1Username,
    consecutivePasses: 0,
    lastMove: null,
    isFirstMove: true,
    createdAt: now,
    updatedAt: now,
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
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
  };
}

function requireTurn(game: InternalGame, username: string) {
  if (game.status !== "in_progress") throw new MoveError("La partie est terminée.");
  if (game.currentPlayerId !== username) throw new MoveError("Ce n'est pas ton tour.");
}

function otherPlayer(game: InternalGame, username: string): Player {
  return game.players.find((p) => p.username !== username)!;
}

function currentPlayer(game: InternalGame, username: string): Player {
  return game.players.find((p) => p.username === username)!;
}

function advanceTurn(game: InternalGame) {
  game.currentPlayerId = otherPlayer(game, game.currentPlayerId).username;
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
  game.lastMove = { username: player.username, words: result.words.map((w) => w.word), score: result.totalScore };

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
  game.consecutivePasses += 1;
  if (game.consecutivePasses >= MAX_CONSECUTIVE_NON_PLAYS) {
    finishGameByExhaustion(game);
  } else {
    advanceTurn(game);
  }
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
  game.consecutivePasses += 1;

  if (game.consecutivePasses >= MAX_CONSECUTIVE_NON_PLAYS) {
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

/** A player emptied their rack with an empty bag: standard end-game scoring. */
function finishGameEarly(game: InternalGame, finisherUsername: string) {
  const finisher = currentPlayer(game, finisherUsername);
  const opponent = otherPlayer(game, finisherUsername);
  const opponentRackValue = rackValue(opponent.rack);
  finisher.score += opponentRackValue;
  opponent.score -= opponentRackValue;
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
