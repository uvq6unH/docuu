export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS rooms (
  room_code TEXT PRIMARY KEY,
  host_player_id TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'LOBBY',
  map_hash TEXT NOT NULL,
  protocol_version INTEGER NOT NULL DEFAULT 1,
  captain_id TEXT,
  selected_jail_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_rooms_created ON rooms(created_at);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT CHECK(role IN ('POLICE', 'ROBBER') OR role IS NULL),
  ready INTEGER NOT NULL DEFAULT 0,
  is_host INTEGER NOT NULL DEFAULT 0,
  is_captain INTEGER NOT NULL DEFAULT 0,
  resume_token TEXT NOT NULL,
  connected INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL,
  FOREIGN KEY (room_code) REFERENCES rooms(room_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_players_room ON players(room_code);
CREATE INDEX IF NOT EXISTS idx_players_resume ON players(resume_token);

CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  map_hash TEXT NOT NULL,
  selected_jail_id TEXT,
  phase TEXT NOT NULL DEFAULT 'JAIL_SELECTION',
  winner TEXT CHECK(winner IN ('POLICE', 'ROBBER') OR winner IS NULL),
  win_reason TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_seconds REAL DEFAULT 0.0,
  total_captures INTEGER NOT NULL DEFAULT 0,
  total_rescues INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (room_code) REFERENCES rooms(room_code)
);

CREATE INDEX IF NOT EXISTS idx_matches_room ON matches(room_code);
CREATE INDEX IF NOT EXISTS idx_matches_started ON matches(started_at);

CREATE TABLE IF NOT EXISTS match_player_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  role TEXT NOT NULL,
  captures_count INTEGER NOT NULL DEFAULT 0,
  rescues_count INTEGER NOT NULL DEFAULT 0,
  time_jailed_ms INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'FREE',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE,
  UNIQUE(match_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_match_stats_player ON match_player_stats(player_id);

CREATE TABLE IF NOT EXISTS game_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  match_id TEXT NOT NULL,
  tick INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  actor_id TEXT,
  target_id TEXT,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_events_match ON game_events(match_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON game_events(event_type);

CREATE TABLE IF NOT EXISTS request_dedup (
  request_id TEXT PRIMARY KEY,
  room_code TEXT,
  response_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dedup_expires ON request_dedup(expires_at);
`;
