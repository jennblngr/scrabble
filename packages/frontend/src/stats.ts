import type { GameSummary } from "@scrabble/shared";

export type GameOutcome = "won" | "lost" | "tied";

/** How a finished game ended for `username`: tied when level with the best opponent. */
export function gameOutcome(game: GameSummary, username: string): GameOutcome {
  const myScore = game.players.find((p) => p.username === username)?.score ?? 0;
  const bestOpponentScore = Math.max(...game.players.filter((p) => p.username !== username).map((p) => p.score));
  if (myScore === bestOpponentScore) return "tied";
  return myScore > bestOpponentScore ? "won" : "lost";
}

export interface PlayerStats {
  /** Finished games only: a game still in progress has no result yet. */
  played: number;
  wins: number;
  losses: number;
  ties: number;
  /** Mean final score per finished game, null before the first one. */
  averageScore: number | null;
  /** Highest final score in a finished game, null before the first one. */
  bestScore: number | null;
  /** Wins per loss; null without any loss, where the ratio is undefined. */
  winLossRatio: number | null;
}

export function computeStats(games: GameSummary[], username: string): PlayerStats {
  const finished = games.filter(
    (g) => g.status === "finished" && g.players.some((p) => p.username === username)
  );
  const scores = finished.map((g) => g.players.find((p) => p.username === username)!.score);
  const outcomes = finished.map((g) => gameOutcome(g, username));
  const wins = outcomes.filter((o) => o === "won").length;
  const losses = outcomes.filter((o) => o === "lost").length;

  return {
    played: finished.length,
    wins,
    losses,
    ties: outcomes.filter((o) => o === "tied").length,
    averageScore: scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null,
    bestScore: scores.length > 0 ? Math.max(...scores) : null,
    winLossRatio: losses > 0 ? wins / losses : null,
  };
}
