import type { GameSummary } from "@scrabble/shared";
import { request } from "./request";

export function listGames(): Promise<{ games: GameSummary[] }> {
  return request<{ games: GameSummary[] }>("/api/games");
}

export function createGame(): Promise<{ gameId: string }> {
  return request<{ gameId: string }>("/api/games", { method: "POST" });
}

export function remindOpponent(gameId: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/games/${gameId}/remind`, { method: "POST" });
}

export function deleteGame(gameId: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/games/${gameId}`, { method: "DELETE" });
}
