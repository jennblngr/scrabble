/**
 * The players as `viewer` sees them: themselves first, then the others in
 * turn order starting with whoever plays right after them.
 */
export function playersFrom<T extends { username: string }>(players: T[], viewer: string): T[] {
  const start = players.findIndex((p) => p.username === viewer);
  if (start === -1) return players;
  return [...players.slice(start), ...players.slice(0, start)];
}

/**
 * Colors are relative to the logged-in player: they and the next player stay
 * red, and the third one in their view (playersFrom) gets the blue accent.
 * So the viewer is never blue themselves.
 */
export function isThirdFor(players: { username: string }[], viewer: string, username: string | undefined): boolean {
  return playersFrom(players, viewer).findIndex((p) => p.username === username) === 2;
}
