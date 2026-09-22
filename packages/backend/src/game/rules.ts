import type { Board, PlacedTile } from "@scrabble/shared";
import { BOARD_SIZE, CENTER_CELL } from "./board.js";
import { isValidWord } from "./dictionary.js";

export class MoveError extends Error {}

export interface WordCells {
  cells: { row: number; col: number }[];
}

/**
 * Validates tile placement against Scrabble rules and returns every word
 * formed (the main word plus any perpendicular words created by crossing
 * existing tiles). Throws MoveError with a user-facing French message if the
 * placement is illegal. Does not mutate the board.
 */
export function validateAndExtractWords(board: Board, placed: PlacedTile[], isFirstMove: boolean): WordCells[] {
  if (placed.length === 0) {
    throw new MoveError("Aucune tuile posée.");
  }

  for (const t of placed) {
    if (t.row < 0 || t.row >= BOARD_SIZE || t.col < 0 || t.col >= BOARD_SIZE) {
      throw new MoveError("Position hors plateau.");
    }
    if (board[t.row][t.col].letter !== null) {
      throw new MoveError("Une tuile occupe déjà cette case.");
    }
  }

  const positions = new Set(placed.map((t) => `${t.row},${t.col}`));
  if (positions.size !== placed.length) {
    throw new MoveError("Deux tuiles ne peuvent pas occuper la même case.");
  }

  const rows = new Set(placed.map((t) => t.row));
  const cols = new Set(placed.map((t) => t.col));
  const singleRow = rows.size === 1;
  const singleCol = cols.size === 1;

  if (!singleRow && !singleCol) {
    throw new MoveError("Les tuiles doivent être alignées sur une seule ligne ou colonne.");
  }

  // Overlay the placed tiles onto a lookup so we can walk the board including this move.
  const occupied = (row: number, col: number): string | null => {
    const p = placed.find((t) => t.row === row && t.col === col);
    if (p) return p.letter;
    return board[row][col].letter;
  };

  const direction: "H" | "V" = singleRow && placed.length > 1 ? "H" : singleCol && placed.length > 1 ? "V" : singleRow ? "H" : "V";

  // Check there are no gaps between placed tiles along the main axis
  // (existing tiles are allowed to fill the gaps).
  if (direction === "H") {
    const row = placed[0].row;
    const minCol = Math.min(...placed.map((t) => t.col));
    const maxCol = Math.max(...placed.map((t) => t.col));
    for (let c = minCol; c <= maxCol; c++) {
      if (occupied(row, c) === null) {
        throw new MoveError("Il y a un trou dans le mot posé.");
      }
    }
  } else {
    const col = placed[0].col;
    const minRow = Math.min(...placed.map((t) => t.row));
    const maxRow = Math.max(...placed.map((t) => t.row));
    for (let r = minRow; r <= maxRow; r++) {
      if (occupied(r, col) === null) {
        throw new MoveError("Il y a un trou dans le mot posé.");
      }
    }
  }

  const boardIsEmpty = board.every((line) => line.every((cell) => cell.letter === null));

  if (isFirstMove || boardIsEmpty) {
    const coversCenter = placed.some((t) => t.row === CENTER_CELL.row && t.col === CENTER_CELL.col);
    if (!coversCenter) {
      throw new MoveError("Le premier mot doit passer par la case centrale.");
    }
  } else {
    const touchesExisting = placed.some((t) => hasAdjacentExistingTile(board, t.row, t.col));
    if (!touchesExisting) {
      throw new MoveError("Le mot doit être connecté à un mot déjà présent sur le plateau.");
    }
  }

  const words: WordCells[] = [];

  // Main word along the placement axis.
  const mainWord = extractWord(occupied, placed[0].row, placed[0].col, direction);
  if (mainWord.cells.length > 1) words.push(mainWord);

  // Perpendicular words formed at each newly placed tile.
  const crossDirection = direction === "H" ? "V" : "H";
  for (const t of placed) {
    const crossWord = extractWord(occupied, t.row, t.col, crossDirection);
    if (crossWord.cells.length > 1) words.push(crossWord);
  }

  if (words.length === 0) {
    throw new MoveError("Le mot doit contenir au moins deux lettres.");
  }

  for (const w of words) {
    const text = w.cells.map(({ row, col }) => occupied(row, col)).join("");
    if (!isValidWord(text)) {
      throw new MoveError(`"${text}" n'est pas un mot valide.`);
    }
  }

  return words;
}

function hasAdjacentExistingTile(board: Board, row: number, col: number): boolean {
  const neighbors = [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ];
  return neighbors.some(
    ([r, c]) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c].letter !== null
  );
}

function extractWord(
  occupied: (row: number, col: number) => string | null,
  row: number,
  col: number,
  direction: "H" | "V"
): WordCells {
  const dr = direction === "V" ? 1 : 0;
  const dc = direction === "H" ? 1 : 0;

  let startRow = row;
  let startCol = col;
  while (occupied(startRow - dr, startCol - dc) !== null) {
    startRow -= dr;
    startCol -= dc;
  }

  const cells: { row: number; col: number }[] = [];
  let r = startRow;
  let c = startCol;
  while (r < BOARD_SIZE && c < BOARD_SIZE && occupied(r, c) !== null) {
    cells.push({ row: r, col: c });
    r += dr;
    c += dc;
  }

  return { cells };
}
