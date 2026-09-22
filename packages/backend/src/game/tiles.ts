import type { RackTile } from "@scrabble/shared";
import { LETTER_DATA, RACK_SIZE } from "@scrabble/shared";

export { LETTER_DATA, LETTER_VALUES, RACK_SIZE, BLANK } from "@scrabble/shared";

export function createBag(): string[] {
  const bag: string[] = [];
  for (const { letter, count } of LETTER_DATA) {
    for (let i = 0; i < count; i++) bag.push(letter);
  }
  return shuffle(bag);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let tileIdCounter = 0;
function nextTileId(): string {
  tileIdCounter += 1;
  return `t${Date.now().toString(36)}${tileIdCounter}`;
}

export function drawTiles(bag: string[], count: number): { drawn: RackTile[]; remaining: string[] } {
  const remaining = [...bag];
  const drawn: RackTile[] = [];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const letter = remaining.pop()!;
    drawn.push({ id: nextTileId(), letter });
  }
  return { drawn, remaining };
}

export function fillRack(bag: string[], rack: RackTile[]): { rack: RackTile[]; bag: string[] } {
  const missing = RACK_SIZE - rack.length;
  if (missing <= 0) return { rack, bag };
  const { drawn, remaining } = drawTiles(bag, missing);
  return { rack: [...rack, ...drawn], bag: remaining };
}
