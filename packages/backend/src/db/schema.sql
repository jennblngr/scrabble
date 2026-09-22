-- Two known players authenticate via env-configured credentials (see config.ts),
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
