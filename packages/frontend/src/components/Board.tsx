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
  // "row,col" of each tile placed by the last move, used to draw a halo
  // around the whole word.
  waveCells?: Set<string>;
  // Total score of the move that just placed waveCells, shown as a floating
  // badge above the halo.
  moveScore?: number | null;
  // "row,col" of opponent tiles played while this player was away, shown
  // with a small dot instead of the halo above.
  // "row,col" -> color of the dot, for tiles played while this player was away.
  unseenOpponentCells?: Map<string, "accent" | "third">;
}

const BONUS_LABEL: Record<string, string> = {
  TW: "MT",
  DW: "MD",
  TL: "LT",
  DL: "LD",
  CENTER: "★",
};

export function Board({
  board,
  pending,
  preview,
  dragHandlers,
  waveCells,
  moveScore,
  unseenOpponentCells,
}: BoardProps) {
  const pendingByCell = new Map(pending.map((t) => [`${t.row},${t.col}`, t]));

  const previewCells = new Set(
    (preview?.words ?? []).flatMap((word) => word.cells.map(({ row, col }) => `${row},${col}`))
  );

  // Bounding box of the tiles just placed by the last move: since a move
  // always places its tiles in a single row or column, this rectangle spans
  // exactly the word that was played, and is used to draw one halo around
  // all of it instead of one per tile.
  let wordBounds: { minRow: number; maxRow: number; minCol: number; maxCol: number } | null = null;
  if (waveCells) {
    for (const cellKey of waveCells) {
      const [r, c] = cellKey.split(",").map(Number);
      if (!wordBounds) {
        wordBounds = { minRow: r, maxRow: r, minCol: c, maxCol: c };
      } else {
        wordBounds.minRow = Math.min(wordBounds.minRow, r);
        wordBounds.maxRow = Math.max(wordBounds.maxRow, r);
        wordBounds.minCol = Math.min(wordBounds.minCol, c);
        wordBounds.maxCol = Math.max(wordBounds.maxCol, c);
      }
    }
  }

  // Bounding box of the preview, used to center the score badge above it and,
  // when the preview is a simple straight word, to draw a single dashed
  // rectangle instead of one outline segment per cell (see
  // previewIsRectangular below).
  let previewBounds: { minRow: number; maxRow: number; minCol: number; maxCol: number } | null = null;
  for (const cellKey of previewCells) {
    const [r, c] = cellKey.split(",").map(Number);
    if (!previewBounds) {
      previewBounds = { minRow: r, maxRow: r, minCol: c, maxCol: c };
    } else {
      previewBounds.minRow = Math.min(previewBounds.minRow, r);
      previewBounds.maxRow = Math.max(previewBounds.maxRow, r);
      previewBounds.minCol = Math.min(previewBounds.minCol, c);
      previewBounds.maxCol = Math.max(previewBounds.maxCol, c);
    }
  }

  // True when the preview is just one straight word (no cross word), i.e.
  // previewCells fully fills its own bounding box. In that (common) case the
  // outline is drawn as a single rectangle on the shared overlay below, so
  // the dash pattern is continuous and stays put when the move is validated.
  // An irregular shape (a cross word formed alongside the main word) falls
  // back to the per-cell outline, which hugs the exact shape instead of
  // boxing in unrelated cells.
  const previewIsRectangular =
    !!previewBounds &&
    previewCells.size ===
      (previewBounds.maxRow - previewBounds.minRow + 1) * (previewBounds.maxCol - previewBounds.minCol + 1);

  function previewOutline(row: number, col: number): CSSProperties | undefined {
    if (previewIsRectangular) return undefined;
    if (!previewCells.has(`${row},${col}`)) return undefined;
    const top = previewCells.has(`${row - 1},${col}`);
    const bottom = previewCells.has(`${row + 1},${col}`);
    const left = previewCells.has(`${row},${col - 1}`);
    const right = previewCells.has(`${row},${col + 1}`);
    const dashed = "2px dashed var(--color-accent)";
    // Rendered as a dedicated overlay (not a border on the cell itself) so it
    // paints above the tile and isn't dimmed by the pending tile's own opacity.
    // On sides that connect to another preview cell, extend the overlay into the
    // board's 1px cell gap (and skip the border there) so the dashed line on the
    // other axis spans the gap instead of breaking at every grid line. On exposed
    // sides, extend the overlay outward by the border thickness so the dashed
    // line lands just outside the cell instead of overlapping the tile inside it.
    return {
      top: top ? -1 : -2,
      bottom: bottom ? -1 : -2,
      left: left ? -1 : -2,
      right: right ? -1 : -2,
      borderTop: top ? "none" : dashed,
      borderBottom: bottom ? "none" : dashed,
      borderLeft: left ? "none" : dashed,
      borderRight: right ? "none" : dashed,
    };
  }

  // The live preview and the just-played halo are never on screen together
  // (validating a move clears the preview), so they share a single overlay
  // element: same geometry, same badge, only the state class differs. That
  // way the badge doesn't jump between two differently-styled boxes as the
  // move is validated — it just changes state in place.
  const overlay = wordBounds
    ? {
        bounds: wordBounds,
        state: "played",
        boxed: true,
        label: moveScore != null ? `+${moveScore}` : null,
      }
    : previewBounds && preview
    ? {
        bounds: previewBounds,
        state: "preview",
        boxed: previewIsRectangular,
        label: `${preview.totalScore}`,
      }
    : null;

  return (
    <div className="board">
      {board.map((line) =>
        line.map((cell) => {
          const key = `${cell.row},${cell.col}`;
          const pendingTile = pendingByCell.get(key);
          const letter = pendingTile?.letter ?? cell.letter;
          const isBlank = pendingTile?.isBlank ?? cell.isBlank;

          // Explicit grid placement (rather than relying on auto-flow) so
          // adding the board__word-box overlay below, which needs an
          // explicit position to span multiple cells, doesn't push these
          // cells sideways to dodge the area it occupies.
          const gridPosition: CSSProperties = { gridRow: cell.row + 1, gridColumn: cell.col + 1 };

          if (letter !== null && letter !== undefined) {
            return (
              <div key={key} className="board__cell" style={gridPosition}>
                <Tile
                  letter={letter}
                  isBlank={isBlank}
                  faded={!!pendingTile}
                  draggable={!!pendingTile}
                  unseen={pendingTile ? undefined : unseenOpponentCells?.get(key)}
                  {...(pendingTile ? dragHandlers(cell.row, cell.col, letter, isBlank) : {})}
                />
                <div className="board__cell__outline" style={previewOutline(cell.row, cell.col)} />
              </div>
            );
          }

          return (
            <div
              key={key}
              className={`board__cell board__cell--empty${cell.bonus ? ` board__cell--${cell.bonus}` : ""}`}
              style={gridPosition}
              data-drop-target={`cell:${cell.row}:${cell.col}`}
            >
              {cell.bonus ? BONUS_LABEL[cell.bonus] : ""}
              <div className="board__cell__outline" style={previewOutline(cell.row, cell.col)} />
            </div>
          );
        })
      )}
      {overlay && (
        <div
          className={`board__word-box board__word-box--${overlay.state}${
            overlay.boxed ? " board__word-box--boxed" : ""
          }${
            // The badge normally floats above the word; .board (and its
            // board-viewport ancestor) both clip overflow for zoom/pan, so a
            // word on the very top row would otherwise have its badge
            // clipped away entirely rather than just overlapping something.
            overlay.bounds.minRow === 0 ? " board__word-box--flip" : ""
          }`}
          style={{
            gridRow: `${overlay.bounds.minRow + 1} / ${overlay.bounds.maxRow + 2}`,
            gridColumn: `${overlay.bounds.minCol + 1} / ${overlay.bounds.maxCol + 2}`,
          }}
        >
          {overlay.label && <span className="board__word-box__score">{overlay.label}</span>}
        </div>
      )}
    </div>
  );
}
