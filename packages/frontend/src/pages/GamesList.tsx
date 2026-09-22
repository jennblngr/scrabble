import { useEffect, useState } from "react";
import type { GameSummary } from "@scrabble/shared";
import { listGames, createGame, remindOpponent } from "../api/games";
import { logout } from "../api/auth";
import { ThemeToggle } from "../components/ThemeToggle";

interface GamesListProps {
  username: string;
  onLoggedOut: () => void;
  onOpenGame: (gameId: string) => void;
}

const REMINDER_DELAY_MS = 24 * 60 * 60 * 1000;

export function GamesList({ username, onLoggedOut, onOpenGame }: GamesListProps) {
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function refresh() {
    listGames()
      .then(({ games }) => setGames(games))
      .catch((err) => setError((err as Error).message));
  }

  useEffect(refresh, []);

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      const { gameId } = await createGame();
      onOpenGame(gameId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const inProgress = games?.filter((g) => g.status !== "finished") ?? [];
  const finished = games?.filter((g) => g.status === "finished") ?? [];
  const myTurn = inProgress.filter((g) => g.currentPlayerId === username);
  const theirTurn = inProgress.filter((g) => g.currentPlayerId !== username);

  return (
    <div className="games-list">
      <header className="games-list__header">
        <h1>Scrabble</h1>
        <div className="games-list__header-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={() => logout().then(onLoggedOut)}
            aria-label="Déconnexion"
            title="Déconnexion"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
          <ThemeToggle />
        </div>
      </header>

      {error && <p className="game__error">{error}</p>}

      <button type="button" className="games-list__new" onClick={handleCreate} disabled={creating}>
        {creating ? "Création..." : "+ Nouvelle partie"}
      </button>

      {games === null ? (
        <p className="games-list__empty">Chargement...</p>
      ) : (
        <>
          <section>
            <h2>Parties en cours</h2>
            {inProgress.length === 0 ? (
              <p className="games-list__empty">Aucune partie en cours.</p>
            ) : (
              <>
                {myTurn.length > 0 && (
                  <div className="games-list__group">
                    <h3>Votre tour</h3>
                    <ul className="games-list__items">
                      {myTurn.map((g) => (
                        <GameRow key={g.id} game={g} username={username} onOpen={() => onOpenGame(g.id)} />
                      ))}
                    </ul>
                  </div>
                )}
                {theirTurn.length > 0 && (
                  <div className="games-list__group">
                    <h3>Son tour</h3>
                    <ul className="games-list__items">
                      {theirTurn.map((g) => (
                        <GameRow key={g.id} game={g} username={username} onOpen={() => onOpenGame(g.id)} />
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>

          <section>
            <h2>Parties terminées</h2>
            {finished.length === 0 ? (
              <p className="games-list__empty">Aucune partie terminée.</p>
            ) : (
              <ul className="games-list__items">
                {finished.map((g) => (
                  <GameRow key={g.id} game={g} username={username} onOpen={() => onOpenGame(g.id)} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function GameRow({ game, username, onOpen }: { game: GameSummary; username: string; onOpen: () => void }) {
  const [reminded, setReminded] = useState(false);
  const [reminding, setReminding] = useState(false);

  const me = game.players.find((p) => p.username === username);
  const opponent = game.players.find((p) => p.username !== username);
  const isMyTurn = game.status !== "finished" && game.currentPlayerId === username;

  const status =
    game.status === "finished"
      ? (me?.score ?? 0) === (opponent?.score ?? 0)
        ? "Égalité"
        : (me?.score ?? 0) > (opponent?.score ?? 0)
          ? "Gagnée"
          : "Perdue"
      : null;

  // TEMP: condition 24h désactivée pour visualiser le bouton — à remettre après.
  const canRemind =
    game.status !== "finished" &&
    !isMyTurn; /* && Date.now() - new Date(game.updatedAt).getTime() >= REMINDER_DELAY_MS */

  async function handleRemind(e: React.MouseEvent) {
    e.stopPropagation();
    setReminding(true);
    try {
      await remindOpponent(game.id);
      setReminded(true);
    } catch {
      // ignore: relance best-effort, l'utilisateur peut réessayer
    } finally {
      setReminding(false);
    }
  }

  return (
    <li className={`games-list__item${isMyTurn ? " games-list__item--active" : ""}`}>
      <button type="button" className="games-list__item-open" onClick={onOpen}>
        <span className="games-list__score">
          {me?.score ?? 0} – {opponent?.score ?? 0}
        </span>
        {status && <span className="games-list__status">{status}</span>}
      </button>
      {canRemind && (
        <button
          type="button"
          className="games-list__remind"
          onClick={handleRemind}
          disabled={reminding || reminded}
          aria-label={reminded ? "Notification envoyée" : "Relancer"}
          title={reminded ? "Notification envoyée" : "Relancer"}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
        </button>
      )}
    </li>
  );
}
