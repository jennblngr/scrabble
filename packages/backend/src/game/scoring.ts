import type { Board, MoveResult, PlacedTile, WordResult } from "@scrabble/shared";
import { LETTER_VALUES } from "./tiles.js";
import type { WordCells } from "./rules.js";

const BINGO_BONUS = 50;
const BINGO_TILE_COUNT = 7;

export function scoreMove(board: Board, words: WordCells[], placed: PlacedTile[]): MoveResult {
  const placedByPos = new Map(placed.map((t) => [key(t.row, t.col), t]));

  const wordResults: WordResult[] = words.map((word) => {
    let wordScore = 0;
    let wordMultiplier = 1;

    for (const { row, col } of word.cells) {
      const newTile = placedByPos.get(key(row, col));
      const existingCell = board[row][col];
      const isBlank = newTile ? newTile.isBlank : existingCell.isBlank;
      const letter = newTile ? newTile.letter : existingCell.letter!;
      const letterValue = isBlank ? 0 : LETTER_VALUES[letter] ?? 0;

      // Bonus squares only apply the turn a tile is placed on them.
      const bonus = newTile ? existingCell.bonus : null;
      let letterMultiplier = 1;
      if (bonus === "DL") letterMultiplier = 2;
      if (bonus === "TL") letterMultiplier = 3;
      if (bonus === "DW" || bonus === "CENTER") wordMultiplier *= 2;
      if (bonus === "TW") wordMultiplier *= 3;

      wordScore += letterValue * letterMultiplier;
    }

    wordScore *= wordMultiplier;

    return {
      word: word.cells.map(({ row, col }) => {
        const newTile = placedByPos.get(key(row, col));
        return newTile ? newTile.letter : board[row][col].letter!;
      }).join(""),
      cells: word.cells,
      score: wordScore,
    };
  });

  const totalScore =
    wordResults.reduce((sum, w) => sum + w.score, 0) + (placed.length === BINGO_TILE_COUNT ? BINGO_BONUS : 0);

  return {
    words: wordResults,
    totalScore,
    bingo: placed.length === BINGO_TILE_COUNT,
  };
}

function key(row: number, col: number): string {
  return `${row},${col}`;
}
