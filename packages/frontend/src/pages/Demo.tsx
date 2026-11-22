import { useMemo, useState } from "react";
import { Game } from "./Game";
import { createLocalConnection, DEMO_PLAYER } from "../demo/localConnection";

const REPOSITORY_URL = "https://github.com/jennblngr/scrabble";

interface DemoProps {
  onExit: () => void;
}

/**
 * Public demo: one game against an automatic opponent, entirely in the
 * browser. This page (and everything under ../demo) must never import the
 * API, socket or push modules.
 */
export default function Demo({ onExit }: DemoProps) {
  // Bumped by "Recommencer": a new number means a brand new local game.
  const [round, setRound] = useState(0);
  const connection = useMemo(() => createLocalConnection(), [round]);

  return (
    <Game
      key={round}
      username={DEMO_PLAYER}
      gameId="demo"
      connection={connection}
      onBack={onExit}
      backLabel="Quitter la démo"
      banner={
        <div className="demo-banner" role="note">
          <span className="demo-banner__text">
            <strong>Mode démo</strong> · dictionnaire réduit
          </span>
          <span className="demo-banner__actions">
            <button type="button" className="demo-banner__restart" onClick={() => setRound((n) => n + 1)}>
              Recommencer
            </button>
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </span>
        </div>
      }
    />
  );
}
