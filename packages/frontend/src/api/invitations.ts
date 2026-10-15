import { request } from "./request";

export type InvitationKind = "invite" | "reset";

export interface Invitation {
  kind: InvitationKind;
  username: string;
  minPasswordLength: number;
}

export function createInvitation(kind: InvitationKind, username: string): Promise<{ token: string }> {
  return request<{ token: string }>("/api/invitations", {
    method: "POST",
    body: JSON.stringify({ kind, username }),
  });
}

export function getInvitation(token: string): Promise<Invitation> {
  return request<Invitation>(`/api/invitations/${encodeURIComponent(token)}`);
}

export function acceptInvitation(token: string, password: string): Promise<{ username: string }> {
  return request<{ username: string }>(`/api/invitations/${encodeURIComponent(token)}`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

/** The link to send: hash-routed, so the token never reaches server logs. */
export function invitationUrl(token: string): string {
  return `${window.location.origin}/#/invitation/${token}`;
}
