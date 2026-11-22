import type { GameState, MoveResult, PlacedTile } from "@scrabble/shared";
import { getSocket } from "./socket";
import { subscribeToPush } from "../push";

export interface GameConnectionHandlers {
  onState: (state: GameState) => void;
  onError: (message: string) => void;
  onPreview: (result: MoveResult | null) => void;
}

/**
 * Everything the Game page needs from whatever runs the game: the server
 * over Socket.io for real games, or an in-browser engine for the demo.
 */
export interface GameConnection {
  /** Starts delivering events for this game; returns the cleanup function. */
  open: (handlers: GameConnectionHandlers) => () => void;
  place: (tiles: PlacedTile[]) => void;
  pass: () => void;
  exchange: (rackTileIds: string[]) => void;
  preview: (tiles: PlacedTile[]) => void;
}

export function createSocketConnection(gameId: string): GameConnection {
  return {
    open({ onState, onError, onPreview }) {
      const socket = getSocket();
      socket.on("game:state", onState);
      socket.on("game:error", onError);
      socket.on("game:preview", onPreview);

      // Socket.IO rooms don't survive a reconnection (e.g. the phone went to
      // sleep or the network dropped): re-join on every (re)connect, otherwise
      // this client stops receiving game:state and looks stuck after playing.
      const join = () => socket.emit("game:join", gameId);
      socket.on("connect", join);
      if (socket.connected) join();

      subscribeToPush().catch(() => {
        /* notifications are a nice-to-have; ignore failures (e.g. permission denied) */
      });

      return () => {
        socket.off("game:state");
        socket.off("game:error");
        socket.off("game:preview");
        socket.off("connect", join);
        socket.emit("game:leave", gameId);
      };
    },
    place: (tiles) => getSocket().emit("game:place", { gameId, tiles }),
    pass: () => getSocket().emit("game:pass", { gameId }),
    exchange: (rackTileIds) => getSocket().emit("game:exchange", { gameId, rackTileIds }),
    preview: (tiles) => getSocket().emit("game:preview", { gameId, tiles }),
  };
}
