-- Testnet WIF faucet requests share the starter-gas queue: kind 'gas' sends ETH, kind 'wif' mints test WIF.
ALTER TABLE gas_requests ADD COLUMN kind TEXT NOT NULL DEFAULT 'gas';
CREATE INDEX IF NOT EXISTS gas_requests_kind_wallet ON gas_requests (kind, wallet, createdAt);
