import type { PointerEvent } from "react";
import { LETTER_VALUES } from "@scrabble/shared";

interface TileProps {
  letter: string; // "" means an unassigned blank
  isBlank?: boolean;
  selected?: boolean;
  faded?: boolean;
  draggable?: boolean;
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
      }${draggable ? " tile--draggable" : ""}`}
      onClick={onClick}
      aria-disabled={!onClick && !draggable}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <span className="tile__letter">{letter}</span>
      {!isBlank && <span className="tile__value">{value}</span>}
    </button>
  );
}
