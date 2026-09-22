import type { Board, BoardCell } from "@scrabble/shared";

const SIZE = 15;
const CENTER = 7;

// Standard 15x15 Scrabble bonus layout (symmetric across both diagonals).
const TRIPLE_WORD: [number, number][] = [
  [0, 0], [0, 7], [0, 14],
  [7, 0], [7, 14],
  [14, 0], [14, 7], [14, 14],
];

const DOUBLE_WORD: [number, number][] = [
  [1, 1], [2, 2], [3, 3], [4, 4],
  [1, 13], [2, 12], [3, 11], [4, 10],
  [13, 1], [12, 2], [11, 3], [10, 4],
  [13, 13], [12, 12], [11, 11], [10, 10],
];

const TRIPLE_LETTER: [number, number][] = [
  [1, 5], [1, 9],
  [5, 1], [5, 5], [5, 9], [5, 13],
  [9, 1], [9, 5], [9, 9], [9, 13],
  [13, 5], [13, 9],
];

const DOUBLE_LETTER: [number, number][] = [
  [0, 3], [0, 11],
  [2, 6], [2, 8],
  [3, 0], [3, 7], [3, 14],
  [6, 2], [6, 6], [6, 8], [6, 12],
  [7, 3], [7, 11],
  [8, 2], [8, 6], [8, 8], [8, 12],
  [11, 0], [11, 7], [11, 14],
  [12, 6], [12, 8],
  [14, 3], [14, 11],
];

function bonusAt(row: number, col: number): BoardCell["bonus"] {
  if (row === CENTER && col === CENTER) return "CENTER";
  if (TRIPLE_WORD.some(([r, c]) => r === row && c === col)) return "TW";
  if (DOUBLE_WORD.some(([r, c]) => r === row && c === col)) return "DW";
  if (TRIPLE_LETTER.some(([r, c]) => r === row && c === col)) return "TL";
  if (DOUBLE_LETTER.some(([r, c]) => r === row && c === col)) return "DL";
  return null;
}

export function createEmptyBoard(): Board {
  const board: Board = [];
  for (let row = 0; row < SIZE; row++) {
    const line: BoardCell[] = [];
    for (let col = 0; col < SIZE; col++) {
      line.push({ row, col, bonus: bonusAt(row, col), letter: null, isBlank: false });
    }
    board.push(line);
  }
  return board;
}

export const BOARD_SIZE = SIZE;
export const CENTER_CELL = { row: CENTER, col: CENTER };
