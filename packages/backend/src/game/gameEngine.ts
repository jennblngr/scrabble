import { randomUUID } from "node:crypto";
import type { MoveResult, PlacedTile } from "@scrabble/shared";
import {
  applyPlace as applyPlaceWith,
  createGame as createGameWithId,
  previewPlace as previewPlaceWith,
  type InternalGame,
} from "@scrabble/shared";
import { isValidWord } from "./dictionary.js";

// The engine itself lives in @scrabble/shared (it is also used by the
// frontend's offline demo). This module binds it to what only the server
// has: the full dictionary and Node's UUID generator.
export {
  applyExchange,
  applyPass,
  MAX_PLAYERS,
  MIN_PLAYERS,
  recentMovesLimit,
  toPublicState,
  type InternalGame,
} from "@scrabble/shared";

/** `usernames` is the turn order: the first one plays first. */
export function createGame(usernames: string[]): InternalGame {
  return createGameWithId(randomUUID(), usernames);
}

export function previewPlace(game: InternalGame, placed: PlacedTile[]): MoveResult | null {
  return previewPlaceWith(game, placed, isValidWord);
}

export function applyPlace(game: InternalGame, username: string, placed: PlacedTile[]): MoveResult {
  return applyPlaceWith(game, username, placed, isValidWord);
}
