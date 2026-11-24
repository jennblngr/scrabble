import { useEffect, useState } from "react";
import { listGames } from "../api/games";
import { ThemeToggle } from "../components/ThemeToggle";
import { computeStats, type PlayerStats } from "../stats";

interface StatsProps {
  username: string;
  onBack: () => void;
}

const decimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const ratio = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatRatio(stats: PlayerStats): string {
  if (stats.winLossRatio !== null) return ratio.format(stats.winLossRatio);
  // No defeat: unbeaten if there is at least one win, otherwise nothing to compare.
  return stats.wins > 0 ? "∞" : "–";
}

export function Stats({ username, onBack }: StatsProps) {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listGames()
      .then(({ games }) => setStats(computeStats(games, username)))
      .catch((err) => setError((err as Error).message));
  }, [username]);

  return (
    <div className="games-list">
      <header className="games-list__header">
        <div className="stats__title">
          <button
            type="button"
            className="icon-btn"
            onClick={onBack}
            aria-label="Retour aux parties"
            title="Retour aux parties"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>
          <h1>Statistiques</h1>
        </div>
        <ThemeToggle />
      </header>

      {error && <p className="game__error">{error}</p>}

      {!error && stats === null && <p className="games-list__empty">Chargement...</p>}

      {stats && (
        <dl className="stats__grid">
          <StatCard label="Parties jouées" value={String(stats.played)} wide />
          <StatCard label="Score moyen par partie" value={stats.averageScore === null ? "–" : decimal.format(stats.averageScore)} wide />
          <StatCard label="Meilleur score" value={stats.bestScore === null ? "–" : String(stats.bestScore)} wide />
          <StatCard label="Victoires" value={String(stats.wins)} />
          <StatCard label="Défaites" value={String(stats.losses)} />
          <StatCard
            label="Ratio victoires / défaites"
            value={formatRatio(stats)}
            note={stats.ties > 0 ? `${stats.ties} égalité${stats.ties > 1 ? "s" : ""} non comptée${stats.ties > 1 ? "s" : ""}` : undefined}
            wide
          />
        </dl>
      )}
    </div>
  );
}

function StatCard({ label, value, note, wide }: { label: string; value: string; note?: string; wide?: boolean }) {
  return (
    <div className={`stats__card${wide ? " stats__card--wide" : ""}`}>
      <dt className="stats__label">{label}</dt>
      <dd className="stats__value">{value}</dd>
      {note && <dd className="stats__note">{note}</dd>}
    </div>
  );
}
