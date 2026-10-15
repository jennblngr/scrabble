import { useEffect, useState } from "react";
import type { GameSummary } from "@scrabble/shared";
import { listGames, createGame, remindOpponent, deleteGame } from "../api/games";
import { logout, players as fetchPlayers } from "../api/auth";
import { ThemeToggle } from "../components/ThemeToggle";
import { Toast, type ToastState } from "../components/Toast";
import { isThirdSeat } from "../players";

const REMINDER_DELAY_MS = 24 * 60 * 60 * 1000;
const MAX_PLAYERS = 3;

// Every way to pick 1 to MAX_PLAYERS - 1 opponents among `others`, smallest
// games first (e.g. [Bob], [Estelle], [Bob, Estelle]).
function opponentChoices(others: string[]): string[][] {
  const choices: string[][] = [[]];
  for (const other of others) {
    for (const choice of [...choices]) choices.push([...choice, other]);
  }
  return choices
    .filter((c) => c.length >= 1 && c.length <= MAX_PLAYERS - 1)
    .sort((a, b) => a.length - b.length);
}

function joinNames(names: string[]): string {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
}

interface GamesListProps {
  username: string;
  onLoggedOut: () => void;
  onOpenGame: (gameId: string) => void;
}

export function GamesList({ username, onLoggedOut, onOpenGame }: GamesListProps) {
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [otherPlayers, setOtherPlayers] = useState<string[]>([]);
  const [choosing, setChoosing] = useState(false);

  function refresh() {
    listGames()
      .then(({ games }) => setGames(games))
      .catch((err) => setError((err as Error).message));
  }

  useEffect(refresh, []);

  useEffect(() => {
    fetchPlayers()
      .then(({ usernames }) => setOtherPlayers(usernames.filter((u) => u !== username)))
      .catch(() => {
        /* without the list, creating a game falls back to the default pairing */
      });
  }, [username]);

  const choices = opponentChoices(otherPlayers);

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

  function handleNewGameClick() {
    // A single possible opponent: nothing to choose, start right away.
    if (choices.length <= 1) {
      handleCreate(choices[0]);
    } else {
      setChoosing((v) => !v);
    }
  }

  async function handleCreate(opponents?: string[]) {
    setError(null);
    setCreating(true);
    try {
      const { gameId } = await createGame(opponents);
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

      <button
        type="button"
        className="games-list__new"
        onClick={handleNewGameClick}
        disabled={creating}
        aria-expanded={choices.length > 1 ? choosing : undefined}
      >
        {creating ? "Création..." : choosing ? "Annuler" : "+ Nouvelle partie"}
      </button>

      {choosing && (
        <ul className="games-list__choices">
          {choices.map((opponents) => (
            <li key={opponents.join("|")}>
              <button
                type="button"
                className="games-list__choice"
                onClick={() => handleCreate(opponents)}
                disabled={creating}
              >
                <span>Avec {joinNames(opponents)}</span>
                <span className="games-list__choice-count">{opponents.length + 1} joueurs</span>
              </button>
            </li>
          ))}
        </ul>
      )}

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
                        <GameRow
                          key={g.id}
                          game={g}
                          username={username}
                          onOpen={() => onOpenGame(g.id)}
                          onDelete={() => handleDelete(g.id)}
                          onRemind={setToast}
                        />
                      ))}
                    </ul>
                  </div>
                )}
                {theirTurn.length > 0 && (
                  <div className="games-list__group">
                    <h3>Son tour</h3>
                    <ul className="games-list__items">
                      {theirTurn.map((g) => (
                        <GameRow
                          key={g.id}
                          game={g}
                          username={username}
                          onOpen={() => onOpenGame(g.id)}
                          onDelete={() => handleDelete(g.id)}
                          onRemind={setToast}
                        />
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
                  <GameRow
                    key={g.id}
                    game={g}
                    username={username}
                    onOpen={() => onOpenGame(g.id)}
                    onDelete={() => handleDelete(g.id)}
                    onRemind={setToast}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

function GameRow({
  game,
  username,
  onOpen,
  onDelete,
  onRemind,
}: {
  game: GameSummary;
  username: string;
  onOpen: () => void;
  onDelete: () => void;
  onRemind: (toast: ToastState) => void;
}) {
  const [reminding, setReminding] = useState(false);
  const [remindHidden, setRemindHidden] = useState(false);

  const me = game.players.find((p) => p.username === username);
  const opponents = game.players.filter((p) => p.username !== username);
  const isMyTurn = game.status !== "finished" && game.currentPlayerId === username;
  // Me first, then the others in turn order.
  const scoreRow = me ? [me, ...opponents] : opponents;

  const myScore = me?.score ?? 0;
  const bestOpponentScore = Math.max(...opponents.map((p) => p.score));
  const status =
    game.status === "finished"
      ? myScore === bestOpponentScore
        ? "Égalité"
        : myScore > bestOpponentScore
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
      setRemindHidden(true);
      onRemind({ message: `Rappel envoyé avec succès à ${game.currentPlayerId} !`, variant: "success" });
    } catch {
      onRemind({ message: `Échec de l'envoi du rappel à ${game.currentPlayerId}`, variant: "error" });
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
          {scoreRow.map((p, i) => (
            <span key={p.username}>
              {i > 0 && " – "}
              <span
                className={isThirdSeat(game.players, p.username) ? "games-list__score-third" : undefined}
                title={p.username === username ? "Vous" : p.username}
              >
                {p.score}
              </span>
            </span>
          ))}
        </span>
        {status && <span className="games-list__status">{status}</span>}
      </button>
      {canRemind && (
        <button
          type="button"
          className={`games-list__remind${remindHidden ? " games-list__remind--hidden" : ""}`}
          onClick={handleRemind}
          disabled={reminding || remindHidden}
          aria-hidden={remindHidden}
          aria-label="Relancer"
          title="Relancer"
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
