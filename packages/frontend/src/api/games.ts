import type { GameSummary } from "@scrabble/shared";
import { request } from "./request";

export function listGames(): Promise<{ games: GameSummary[] }> {
  return request<{ games: GameSummary[] }>("/api/games");
}

/** Without `opponents`, the server falls back to its default pairing. */
export function createGame(opponents?: string[]): Promise<{ gameId: string }> {
  return request<{ gameId: string }>("/api/games", {
    method: "POST",
    body: opponents ? JSON.stringify({ opponents }) : undefined,
  });
}

export function remindOpponent(gameId: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/games/${gameId}/remind`, { method: "POST" });
}

export function deleteGame(gameId: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/games/${gameId}`, { method: "DELETE" });
}
