export type Letter = string; // single uppercase letter, or "" for a played blank

export interface BoardCell {
  row: number;
  col: number;
  bonus: "TW" | "DW" | "TL" | "DL" | "CENTER" | null;
  /** letter currently placed here, or null if empty */
  letter: Letter | null;
  /** true if this letter was placed as a blank tile (scores 0, displayed distinctly) */
  isBlank: boolean;
}

export type Board = BoardCell[][];

export interface RackTile {
  id: string; // unique instance id, so the UI can track a specific tile
  letter: Letter; // "" for a blank tile not yet assigned a letter
}

export type Direction = "H" | "V";

export interface PlacedTile {
  row: number;
  col: number;
  letter: Letter;
  isBlank: boolean;
  rackTileId: string;
}

export interface Player {
  id: string;
  username: string;
  score: number;
  rack: RackTile[];
}

export type GameStatus = "waiting" | "in_progress" | "finished";

export interface LastMove {
  username: string;
  words: string[];
  score: number;
}

export interface GameState {
  id: string;
  status: GameStatus;
  board: Board;
  bagCount: number;
  players: [Player, Player];
  currentPlayerId: string;
  consecutivePasses: number;
  lastMove: LastMove | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlayerSummary {
  username: string;
  score: number;
}

/** Lightweight game listing entry (no board/bag, for the games list view). */
export interface GameSummary {
  id: string;
  status: GameStatus;
  players: [PlayerSummary, PlayerSummary];
  currentPlayerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WordResult {
  word: string;
  cells: { row: number; col: number }[];
  score: number;
}

export interface MoveResult {
  words: WordResult[];
  totalScore: number;
  bingo: boolean; // used all 7 tiles
}

// --- Socket.io event contracts ---

export interface ServerToClientEvents {
  "game:state": (state: GameState) => void;
  "game:error": (message: string) => void;
  "game:chat": (payload: { from: string; message: string; at: string }) => void;
  "game:preview": (result: MoveResult | null) => void;
}

export interface ClientToServerEvents {
  "game:join": (gameId: string) => void;
  "game:leave": (gameId: string) => void;
  "game:place": (payload: { gameId: string; tiles: PlacedTile[] }) => void;
  "game:pass": (payload: { gameId: string }) => void;
  "game:exchange": (payload: { gameId: string; rackTileIds: string[] }) => void;
  "game:chat": (payload: { gameId: string; message: string }) => void;
  "game:preview": (payload: { gameId: string; tiles: PlacedTile[] }) => void;
}
