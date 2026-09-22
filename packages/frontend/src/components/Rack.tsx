import type { PointerEvent } from "react";
import type { RackTile } from "@scrabble/shared";
import { Tile } from "./Tile";

export interface RackSlot {
  id: string;
  // null means this slot's tile is currently placed on the board (pending):
  // the slot stays in place, empty, so the other tiles don't shift.
  tile: RackTile | null;
}

interface RackProps {
  tiles: RackSlot[];
  exchangeSelection: Set<string>;
  mode: "place" | "exchange";
  onSelect: (tileId: string) => void;
  dragHandlers: (
    tileId: string,
    letter: string,
    isBlank: boolean
  ) => {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => void;
  };
  // Id of the rack tile currently being dragged, if any: its slot shows the
  // empty placeholder instead of the letter, which is already shown by the
  // drag ghost following the pointer.
  draggedTileId?: string;
}

export function Rack({ tiles, exchangeSelection, mode, onSelect, dragHandlers, draggedTileId }: RackProps) {
  return (
    <div className="rack" data-drop-target="rack">
      {tiles.map(({ id, tile: t }) =>
        t && t.id !== draggedTileId ? (
          <div key={id} className="rack__slot" data-drop-target={`rack-tile:${t.id}`}>
            <Tile
              letter={t.letter}
              isBlank={t.letter === ""}
              selected={mode === "exchange" ? exchangeSelection.has(t.id) : false}
              draggable={mode === "place"}
              onClick={mode === "exchange" ? () => onSelect(t.id) : undefined}
              {...(mode === "place" ? dragHandlers(t.id, t.letter, t.letter === "") : {})}
            />
          </div>
        ) : (
          <div key={id} className="rack__slot rack__slot--empty" data-drop-target={`rack-tile:${id}`} />
        )
      )}
    </div>
  );
}
