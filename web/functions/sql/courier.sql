-- WIF gas courier (design: docs/design/2026-11-10-wif-gas-courier.md). Run once in the D1 console, like tg_codes.
CREATE TABLE IF NOT EXISTS courier_requests (
  id TEXT PRIMARY KEY, network TEXT NOT NULL,
  sender TEXT NOT NULL, receiver TEXT NOT NULL,
  amount TEXT NOT NULL, fee TEXT NOT NULL, fee_to TEXT NOT NULL,
  nonce TEXT NOT NULL, deadline INTEGER NOT NULL, sig TEXT NOT NULL,
  status TEXT NOT NULL, reason TEXT, tx TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS courier_pending ON courier_requests (status, network, created_at);
CREATE INDEX IF NOT EXISTS courier_sender ON courier_requests (sender, created_at);
CREATE TABLE IF NOT EXISTS courier_keeper (
  network TEXT PRIMARY KEY, enabled INTEGER NOT NULL, min_fee TEXT NOT NULL,
  fee_to TEXT NOT NULL, courier TEXT NOT NULL, seen_at INTEGER NOT NULL
);
