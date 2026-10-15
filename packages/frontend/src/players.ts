// The third seat of a 3-player game gets the blue accent instead of the red one.
export function isThirdSeat(players: { username: string }[], username: string | undefined): boolean {
  return players.findIndex((p) => p.username === username) === 2;
}
