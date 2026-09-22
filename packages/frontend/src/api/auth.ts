import { request } from "./request";

export interface Me {
  username: string;
}

export function login(username: string, password: string): Promise<Me> {
  return request<Me>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function logout(): Promise<void> {
  return request("/api/auth/logout", { method: "POST" });
}

export function me(): Promise<Me> {
  return request<Me>("/api/auth/me");
}

export function players(): Promise<{ usernames: string[] }> {
  return request<{ usernames: string[] }>("/api/auth/players");
}
