import type { PointerEvent } from "react";
import { LETTER_VALUES } from "@scrabble/shared";

interface TileProps {
  letter: string; // "" means an unassigned blank
  isBlank?: boolean;
  selected?: boolean;
  faded?: boolean;
  draggable?: boolean;
  // Played by an opponent while this player was away from the game; the dot
  // takes that opponent's color (blue for the third player in the viewer's order).
  unseen?: "accent" | "third";
  // Just sent off in a tile exchange: shrinks and fades out in place.
  exchanging?: boolean;
  // Just swapped into a slot an exchanged tile vacated: grows and fades in.
  appearing?: boolean;
  onClick?: () => void;
  onPointerDown?: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove?: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel?: (e: PointerEvent<HTMLButtonElement>) => void;
}

export function Tile({
  letter,
  isBlank,
  selected,
  faded,
  draggable,
  unseen,
  exchanging,
  appearing,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: TileProps) {
  const value = isBlank ? 0 : LETTER_VALUES[letter] ?? 0;
  return (
    <button
      type="button"
      tabIndex={-1}
      className={`tile${selected ? " tile--selected" : ""}${faded ? " tile--faded" : ""}${
        isBlank ? " tile--blank" : ""
      }${draggable ? " tile--draggable" : ""}${exchanging ? " tile--exchanging" : ""}${
        appearing ? " tile--appearing" : ""
      }`}
      onClick={onClick}
      aria-disabled={!onClick && !draggable}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <span className="tile__letter">{letter}</span>
      {!isBlank && <span className="tile__value">{value}</span>}
      {unseen && (
        <span className={`tile__unseen-dot${unseen === "third" ? " tile__unseen-dot--third" : ""}`} aria-hidden="true" />
      )}
    </button>
  );
}
