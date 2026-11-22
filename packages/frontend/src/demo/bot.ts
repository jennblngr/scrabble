import {
  BOARD_SIZE,
  CENTER_CELL,
  previewPlace,
  type InternalGame,
  type PlacedTile,
  type WordValidator,
} from "@scrabble/shared";

/**
 * The demo opponent: deliberately simple. It tries every word of its small
 * list across each tile already on the board (or across the centre square on
 * the first move), lets the shared engine validate and score each attempt,
 * and keeps the best one. Returns null when it finds nothing to play.
 */
export function findBotMove(
  game: InternalGame,
  username: string,
  words: readonly string[],
  isValidWord: WordValidator
): PlacedTile[] | null {
  const rack = game.players.find((p) => p.username === username)?.rack ?? [];
  if (rack.length === 0) return null;

  // Squares a word may be laid across: every tile on the board, or the centre.
  const anchors: { row: number; col: number; letter: string | null }[] = [];
  for (const line of game.board) {
    for (const cell of line) {
      if (cell.letter !== null) anchors.push({ row: cell.row, col: cell.col, letter: cell.letter });
    }
  }
  if (anchors.length === 0) anchors.push({ ...CENTER_CELL, letter: null });

  /** Lays `word` from (row, col); null if it does not fit the board or the rack. */
  function layOut(word: string, row: number, col: number, horizontal: boolean): PlacedTile[] | null {
    const endRow = horizontal ? row : row + word.length - 1;
    const endCol = horizontal ? col + word.length - 1 : col;
    if (row < 0 || col < 0 || endRow >= BOARD_SIZE || endCol >= BOARD_SIZE) return null;

    const available = [...rack];
    const placed: PlacedTile[] = [];
    for (let i = 0; i < word.length; i++) {
      const r = horizontal ? row : row + i;
      const c = horizontal ? col + i : col;
      const existing = game.board[r][c].letter;
      if (existing !== null) {
        if (existing !== word[i]) return null;
        continue;
      }
      let index = available.findIndex((t) => t.letter === word[i]);
      const isBlank = index === -1;
      if (isBlank) index = available.findIndex((t) => t.letter === "");
      if (index === -1) return null;
      const [tile] = available.splice(index, 1);
      placed.push({ row: r, col: c, letter: word[i], isBlank, rackTileId: tile.id });
    }
    return placed.length > 0 ? placed : null;
  }

  let best: PlacedTile[] | null = null;
  let bestScore = -1;

  for (const word of words) {
    for (const anchor of anchors) {
      for (let i = 0; i < word.length; i++) {
        if (anchor.letter !== null && word[i] !== anchor.letter) continue;
        for (const horizontal of [true, false]) {
          const placed = horizontal
            ? layOut(word, anchor.row, anchor.col - i, true)
            : layOut(word, anchor.row - i, anchor.col, false);
          if (!placed) continue;
          const result = previewPlace(game, placed, isValidWord);
          if (result && result.totalScore > bestScore) {
            best = placed;
            bestScore = result.totalScore;
          }
        }
      }
    }
  }

  return best;
}
