-- The 2 or 3 known players authenticate via env-configured credentials (see config.ts),
-- so there is no public "users" table — the username is just a string key here.

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'finished')),
  board JSONB NOT NULL,
  bag JSONB NOT NULL,
  current_player_username TEXT NOT NULL,
  consecutive_passes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reminded_at TIMESTAMPTZ
);

ALTER TABLE games ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS game_players (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  rack JSONB NOT NULL DEFAULT '[]',
  PRIMARY KEY (game_id, username)
);

-- Turn order within the game (0 plays first). NULL for games created before
-- 3-player games existed, which only ever had 2 players.
ALTER TABLE game_players ADD COLUMN IF NOT EXISTS seat INTEGER;

CREATE TABLE IF NOT EXISTS moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('place', 'pass', 'exchange')),
  tiles JSONB,
  words JSONB,
  score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  username TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  keys JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (username, endpoint)
);

CREATE INDEX IF NOT EXISTS moves_game_id_idx ON moves(game_id);

-- Accounts created through an invitation link, plus password overrides for
-- the env-configured players (set through a reset link). See accounts.ts.
CREATE TABLE IF NOT EXISTS accounts (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Single-use links: 'invite' creates a new account, 'reset' sets a new
-- password for an existing one. Only a SHA-256 of the token is stored.
CREATE TABLE IF NOT EXISTS invitations (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('invite', 'reset')),
  username TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);
