import { useEffect, useState } from "react";
import type { GameSummary } from "@scrabble/shared";
import { listGames, createGame, remindOpponent, deleteGame } from "../api/games";
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

  // Reprendre l'app depuis l'arrière-plan (PWA remise au premier plan, onglet
  // réactivé, retour depuis le cache de navigation) ne remonte pas ce
  // composant : sans ça, la liste resterait figée tant qu'on ne force pas un
  // rechargement manuel.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, []);

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

  async function handleDelete(gameId: string) {
    if (!window.confirm("Supprimer cette partie ? Cette action est irréversible.")) return;
    setError(null);
    try {
      await deleteGame(gameId);
      setGames((prev) => prev?.filter((g) => g.id !== gameId) ?? prev);
    } catch (err) {
      setError((err as Error).message);
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
                        <GameRow key={g.id} game={g} username={username} onOpen={() => onOpenGame(g.id)} onDelete={() => handleDelete(g.id)} />
                      ))}
                    </ul>
                  </div>
                )}
                {theirTurn.length > 0 && (
                  <div className="games-list__group">
                    <h3>Son tour</h3>
                    <ul className="games-list__items">
                      {theirTurn.map((g) => (
                        <GameRow key={g.id} game={g} username={username} onOpen={() => onOpenGame(g.id)} onDelete={() => handleDelete(g.id)} />
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
                  <GameRow key={g.id} game={g} username={username} onOpen={() => onOpenGame(g.id)} onDelete={() => handleDelete(g.id)} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function GameRow({
  game,
  username,
  onOpen,
  onDelete,
}: {
  game: GameSummary;
  username: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
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

  const lastActivity =
    game.lastRemindedAt && new Date(game.lastRemindedAt) > new Date(game.updatedAt)
      ? game.lastRemindedAt
      : game.updatedAt;
  const canRemind =
    game.status !== "finished" &&
    !isMyTurn &&
    Date.now() - new Date(lastActivity).getTime() >= REMINDER_DELAY_MS;

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

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    onDelete();
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
      <button
        type="button"
        className="games-list__delete"
        onClick={handleDeleteClick}
        aria-label="Supprimer la partie"
        title="Supprimer la partie"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
          <path d="M10 11v6"></path>
          <path d="M14 11v6"></path>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
        </svg>
      </button>
    </li>
  );
}
