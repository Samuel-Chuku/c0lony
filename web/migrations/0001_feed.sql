CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  block INTEGER,
  tx TEXT,
  logIndex INTEGER,
  ts INTEGER,
  type TEXT,
  actors TEXT,
  data TEXT,
  UNIQUE (tx, logIndex)
);
CREATE INDEX IF NOT EXISTS events_type_id ON events (type, id);
CREATE INDEX IF NOT EXISTS events_ts ON events (ts);

CREATE TABLE IF NOT EXISTS event_actors (
  eventId INTEGER,
  wallet TEXT,
  PRIMARY KEY (wallet, eventId)
);

CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  wallet TEXT,
  keys TEXT,
  prefs TEXT,
  updatedAt INTEGER
);
CREATE INDEX IF NOT EXISTS push_subs_wallet ON push_subs (wallet);
