import { useEffect, useState } from "react";
import { login, players as fetchPlayers } from "../api/auth";
import { ThemeToggle } from "../components/ThemeToggle";

interface LoginProps {
  onLoggedIn: (username: string) => void;
}

export function Login({ onLoggedIn }: LoginProps) {
  const [players, setPlayers] = useState<string[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
        <label>
          Mot de passe
          <div className="login__password-field">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="login__password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              )}
            </button>
          </div>
        </label>
        {error && <p className="login__error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
