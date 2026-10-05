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
  // Ids of tiles just sent off for exchange: shown shrinking/fading out in
  // place rather than interactive.
  exchangingIds?: Set<string>;
  // Ids of replacement tiles that just swapped into a vacated slot: shown
  // growing/fading in instead of popping in instantly.
  appearingIds?: Set<string>;
}

export function Rack({
  tiles,
  exchangeSelection,
  mode,
  onSelect,
  dragHandlers,
  draggedTileId,
  exchangingIds,
  appearingIds,
}: RackProps) {
  return (
    <div className="rack" data-drop-target="rack">
      {tiles.map(({ id, tile: t }) => {
        const exchanging = !!t && !!exchangingIds?.has(t.id);
        const appearing = !!t && !!appearingIds?.has(t.id);
        return t && t.id !== draggedTileId ? (
          <div key={id} className="rack__slot" data-drop-target={`rack-tile:${t.id}`}>
            <Tile
              letter={t.letter}
              isBlank={t.letter === ""}
              selected={mode === "exchange" ? exchangeSelection.has(t.id) : false}
              draggable={mode === "place" && !exchanging}
              exchanging={exchanging}
              appearing={appearing}
              onClick={mode === "exchange" && !exchanging ? () => onSelect(t.id) : undefined}
              {...(mode === "place" && !exchanging ? dragHandlers(t.id, t.letter, t.letter === "") : {})}
            />
          </div>
        ) : (
          <div key={id} className="rack__slot rack__slot--empty" data-drop-target={`rack-tile:${id}`} />
        );
      })}
    </div>
  );
}
