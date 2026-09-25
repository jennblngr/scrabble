import type { CSSProperties, PointerEvent } from "react";
import type { Board as BoardType, MoveResult, PlacedTile } from "@scrabble/shared";
import { Tile } from "./Tile";

interface BoardProps {
  board: BoardType;
  pending: PlacedTile[];
  preview: MoveResult | null;
  dragHandlers: (
    row: number,
    col: number,
    letter: string,
    isBlank: boolean
  ) => {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => void;
  };
  // Maps "row,col" of a just-placed tile to its wave animation delay (ms).
  waveCells?: Map<string, number>;
}

const BONUS_LABEL: Record<string, string> = {
  TW: "MT",
  DW: "MD",
  TL: "LT",
  DL: "LD",
  CENTER: "★",
};

export function Board({ board, pending, preview, dragHandlers, waveCells }: BoardProps) {
  const pendingByCell = new Map(pending.map((t) => [`${t.row},${t.col}`, t]));

  const previewCells = new Set(
    (preview?.words ?? []).flatMap((word) => word.cells.map(({ row, col }) => `${row},${col}`))
  );

  // Pick the bottom-right-most highlighted cell as the anchor for the score badge.
  let scoreAnchor: string | null = null;
  for (const cellKey of previewCells) {
    if (!scoreAnchor) {
      scoreAnchor = cellKey;
      continue;
    }
    const [r, c] = cellKey.split(",").map(Number);
    const [ar, ac] = scoreAnchor.split(",").map(Number);
    if (r + c > ar + ac) scoreAnchor = cellKey;
  }

  function previewOutline(row: number, col: number): CSSProperties | undefined {
    if (!previewCells.has(`${row},${col}`)) return undefined;
    const top = previewCells.has(`${row - 1},${col}`);
    const bottom = previewCells.has(`${row + 1},${col}`);
    const left = previewCells.has(`${row},${col - 1}`);
    const right = previewCells.has(`${row},${col + 1}`);
    const edges = [
      !top && "inset 0 3px 0 0 var(--preview-outline)",
      !bottom && "inset 0 -3px 0 0 var(--preview-outline)",
      !left && "inset 3px 0 0 0 var(--preview-outline)",
      !right && "inset -3px 0 0 0 var(--preview-outline)",
    ].filter(Boolean);
    // Rendered as a dedicated overlay (not a box-shadow on the cell itself) so it
    // paints above the tile and isn't dimmed by the pending tile's own opacity.
    // On sides that connect to another preview cell, extend the overlay into the
    // board's 1px cell gap so the border bars on the other axis span the gap
    // instead of breaking at every grid line. On exposed (bordered) sides,
    // extend the overlay outward by the border thickness so the inset shadow
    // lands just outside the cell instead of overlapping the tile inside it.
    return {
      top: top ? -1 : -3,
      bottom: bottom ? -1 : -3,
      left: left ? -1 : -3,
      right: right ? -1 : -3,
      boxShadow: edges.join(", "),
    };
  }

  return (
    <div className="board">
      {board.map((line) =>
        line.map((cell) => {
          const key = `${cell.row},${cell.col}`;
          const pendingTile = pendingByCell.get(key);
          const letter = pendingTile?.letter ?? cell.letter;
          const isBlank = pendingTile?.isBlank ?? cell.isBlank;
          const showScore = key === scoreAnchor;
          const waveDelayMs = waveCells?.get(key);

          if (letter !== null && letter !== undefined) {
            return (
              <div key={key} className={`board__cell${waveDelayMs !== undefined ? " board__cell--wave" : ""}`}>
                <Tile
                  letter={letter}
                  isBlank={isBlank}
                  faded={!!pendingTile}
                  draggable={!!pendingTile}
                  waveDelayMs={waveDelayMs}
                  {...(pendingTile ? dragHandlers(cell.row, cell.col, letter, isBlank) : {})}
                />
                {showScore && <span className="board__cell__preview-score">{preview!.totalScore}</span>}
                <div className="board__cell__outline" style={previewOutline(cell.row, cell.col)} />
              </div>
            );
          }

          return (
            <div
              key={key}
              className={`board__cell board__cell--empty${cell.bonus ? ` board__cell--${cell.bonus}` : ""}`}
              data-drop-target={`cell:${cell.row}:${cell.col}`}
            >
              {cell.bonus ? BONUS_LABEL[cell.bonus] : ""}
              {showScore && <span className="board__cell__preview-score">{preview!.totalScore}</span>}
              <div className="board__cell__outline" style={previewOutline(cell.row, cell.col)} />
            </div>
          );
        })
      )}
    </div>
  );
}
