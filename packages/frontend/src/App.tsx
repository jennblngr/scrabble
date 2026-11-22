import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { me } from "./api/auth";
import { createSocketConnection } from "./api/gameConnection";
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

function isDemoHash(): boolean {
  return /^#\/demo\/?$/.test(window.location.hash);
}

// Loaded on demand: the demo's word list and opponent stay out of the bundle
// of the private app.
const Demo = lazy(() => import("./pages/Demo"));

/**
 * The public demo is decided here, before anything else: while it is shown,
 * the private app below is not even mounted, so no session check, API call
 * or socket connection happens.
 */
export function App() {
  const [demo, setDemo] = useState(isDemoHash);

  useEffect(() => {
    const onHashChange = () => setDemo(isDemoHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (demo) {
    return (
      <Suspense fallback={<div className="game-loading">Chargement de la démo...</div>}>
        <Demo
          onExit={() => {
            window.location.hash = "";
            setDemo(false);
          }}
        />
      </Suspense>
    );
  }

  return <PrivateApp />;
}

function OnlineGame({ username, gameId, onBack }: { username: string; gameId: string; onBack: () => void }) {
  const connection = useMemo(() => createSocketConnection(gameId), [gameId]);
  return <Game username={username} gameId={gameId} connection={connection} onBack={onBack} />;
}

function PrivateApp() {
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
    return <OnlineGame key={gameId} username={username} gameId={gameId} onBack={backToList} />;
  }

  return <GamesList username={username} onLoggedOut={() => setUsername(null)} onOpenGame={openGame} />;
}
