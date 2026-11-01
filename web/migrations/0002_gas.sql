CREATE TABLE IF NOT EXISTS gas_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  did TEXT,
  wallet TEXT,
  network TEXT,
  status TEXT,
  tx TEXT,
  createdAt INTEGER,
  updatedAt INTEGER
);
CREATE INDEX IF NOT EXISTS gas_requests_wallet ON gas_requests (wallet, createdAt);
CREATE INDEX IF NOT EXISTS gas_requests_did ON gas_requests (did);
CREATE INDEX IF NOT EXISTS gas_requests_status ON gas_requests (status, createdAt);
