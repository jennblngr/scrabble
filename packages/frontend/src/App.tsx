import { useEffect, useState } from "react";
import { me } from "./api/auth";
import { Login } from "./pages/Login";
import { Game } from "./pages/Game";
import { GamesList } from "./pages/GamesList";

function gameIdFromHash(): string | null {
  const match = window.location.hash.match(/^#\/game\/(.+)$/);
  return match ? match[1] : null;
}

export function App() {
  const [username, setUsername] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [gameId, setGameId] = useState<string | null>(gameIdFromHash);

  useEffect(() => {
    me()
      .then((m) => setUsername(m.username))
      .catch(() => setUsername(null))
      .finally(() => setChecked(true));
  }, []);

  useEffect(() => {
    const onHashChange = () => setGameId(gameIdFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function openGame(id: string) {
    window.location.hash = `#/game/${id}`;
    setGameId(id);
  }

  function backToList() {
    window.location.hash = "";
    setGameId(null);
  }

  if (!checked) return null;

  if (!username) {
    return <Login onLoggedIn={setUsername} />;
  }

  if (gameId) {
    return <Game username={username} gameId={gameId} onBack={backToList} />;
  }

  return <GamesList username={username} onLoggedOut={() => setUsername(null)} onOpenGame={openGame} />;
}
