import { useEffect, useState } from "react";
import { login, players as fetchPlayers } from "../api/auth";
import { ThemeToggle } from "../components/ThemeToggle";
import { PasswordField } from "../components/PasswordField";

interface LoginProps {
  onLoggedIn: (username: string) => void;
}

export function Login({ onLoggedIn }: LoginProps) {
  const [players, setPlayers] = useState<string[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPlayers()
      .then(({ usernames }) => {
        setPlayers(usernames);
        setUsername((current) => current || usernames[0] || "");
      })
      .catch((err) => setError((err as Error).message));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const me = await login(username, password);
      onLoggedIn(me.username);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <div className="login__header">
        <h1>Scrabble</h1>
        <ThemeToggle />
      </div>
      <form onSubmit={handleSubmit}>
        <fieldset className="login__players">
          <legend>Pseudo</legend>
          {players.map((p) => (
            <label key={p} className="login__player-option">
              <input
                type="radio"
                name="username"
                value={p}
                checked={username === p}
                onChange={() => setUsername(p)}
              />
              {p}
            </label>
          ))}
        </fieldset>
        <PasswordField label="Mot de passe" value={password} onChange={setPassword} autoComplete="current-password" />
        {error && <p className="login__error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
