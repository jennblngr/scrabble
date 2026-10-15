import { useEffect, useState } from "react";
import { me } from "./api/auth";
import { Login } from "./pages/Login";
import { Game } from "./pages/Game";
import { GamesList } from "./pages/GamesList";
import { Invitation } from "./pages/Invitation";

function gameIdFromHash(): string | null {
  const match = window.location.hash.match(/^#\/game\/(.+)$/);
  return match ? match[1] : null;
}

function invitationTokenFromHash(): string | null {
  const match = window.location.hash.match(/^#\/invitation\/(.+)$/);
  return match ? match[1] : null;
}

export function App() {
  const [username, setUsername] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [gameId, setGameId] = useState<string | null>(gameIdFromHash);
  const [invitationToken, setInvitationToken] = useState<string | null>(invitationTokenFromHash);

  useEffect(() => {
    me()
      .then((m) => setUsername(m.username))
      .catch(() => setUsername(null))
      .finally(() => setChecked(true));
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setGameId(gameIdFromHash());
      setInvitationToken(invitationTokenFromHash());
    };
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

  function leaveInvitation() {
    // replaceState: going "back" must not reopen a link that was just used.
    history.replaceState(null, "", window.location.pathname);
    setInvitationToken(null);
  }

  if (!checked) return null;

  // Shown even when already logged in on this device: using the link logs in
  // as the invited (or reset) player.
  if (invitationToken) {
    return (
      <Invitation
        token={invitationToken}
        onDone={(name) => {
          leaveInvitation();
          setUsername(name);
        }}
        onCancel={leaveInvitation}
      />
    );
  }

  if (!username) {
    return <Login onLoggedIn={setUsername} />;
  }

  if (gameId) {
    return <Game username={username} gameId={gameId} onBack={backToList} />;
  }

  return <GamesList username={username} onLoggedOut={() => setUsername(null)} onOpenGame={openGame} />;
}
