import {
  applyExchange,
  applyPass,
  applyPlace,
  createGame,
  MoveError,
  previewPlace,
  toPublicState,
  type GameState,
} from "@scrabble/shared";
import type { GameConnection, GameConnectionHandlers } from "../api/gameConnection";
import { findBotMove } from "./bot";
import { DEMO_WORDS, isDemoWord } from "./words";

export const DEMO_PLAYER = "Vous";
export const DEMO_BOT = "Ordinateur";

// Pause before the opponent answers, so its move reads as a turn of its own
// (and the visitor's own score animation has time to play).
const BOT_DELAY_MS = 1800;

/**
 * A whole game held in memory, in this tab: the shared engine, the reduced
 * word list and the automatic opponent. Nothing here talks to the API or the
 * socket, and nothing is stored — closing the page discards the game.
 */
export function createLocalConnection(): GameConnection {
  const game = createGame("demo", [DEMO_PLAYER, DEMO_BOT]);
  let handlers: GameConnectionHandlers | null = null;
  let botTimer: ReturnType<typeof setTimeout> | null = null;

  // The engine mutates its board in place, while the page compares each state
  // with the previous one: hand it a copy, like a state coming off the wire.
  const snapshot = (): GameState => JSON.parse(JSON.stringify(toPublicState(game)));

  function publish() {
    handlers?.onState(snapshot());
    if (botTimer === null && game.status === "in_progress" && game.currentPlayerId === DEMO_BOT) {
      botTimer = setTimeout(playBotTurn, BOT_DELAY_MS);
    }
  }

  function playBotTurn() {
    botTimer = null;
    if (game.status !== "in_progress" || game.currentPlayerId !== DEMO_BOT) return;
    const move = findBotMove(game, DEMO_BOT, DEMO_WORDS, isDemoWord);
    if (move) applyPlace(game, DEMO_BOT, move, isDemoWord);
    else applyPass(game, DEMO_BOT);
    publish();
  }

  /** Runs one of the visitor's actions, reporting rule errors like the server does. */
  function act(action: () => void) {
    try {
      action();
      publish();
    } catch (err) {
      if (!(err instanceof MoveError)) throw err;
      handlers?.onError(err.message);
    }
  }

  return {
    open(next) {
      handlers = next;
      // Asynchronous like a socket, so the page never gets a state while it
      // is still subscribing.
      const first = setTimeout(() => {
        if (handlers === next) publish();
      }, 0);
      return () => {
        clearTimeout(first);
        if (botTimer !== null) clearTimeout(botTimer);
        botTimer = null;
        if (handlers === next) handlers = null;
      };
    },
    place(tiles) {
      // Remember which words the list turned down, to say that the demo's
      // dictionary is the limit rather than call a real word invalid.
      const unknown: string[] = [];
      const check = (word: string) => {
        const known = isDemoWord(word);
        if (!known) unknown.push(word);
        return known;
      };
      try {
        applyPlace(game, DEMO_PLAYER, tiles, check);
        publish();
      } catch (err) {
        if (!(err instanceof MoveError)) throw err;
        handlers?.onError(
          unknown.length > 0
            ? `« ${unknown[0]} » n'est pas dans le dictionnaire réduit de la démo.`
            : err.message
        );
      }
    },
    pass: () => act(() => applyPass(game, DEMO_PLAYER)),
    exchange: (rackTileIds) => act(() => applyExchange(game, DEMO_PLAYER, rackTileIds)),
    preview(tiles) {
      const result = previewPlace(game, tiles, isDemoWord);
      // Asynchronous for the same reason as the first state.
      setTimeout(() => handlers?.onPreview(result), 0);
    },
  };
}
