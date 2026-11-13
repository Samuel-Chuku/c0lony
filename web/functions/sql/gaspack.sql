-- Gas packs (design: docs/design/2026-11-13-wif-for-gas.md). Run once in the D1 console of each app database,
-- BEFORE the code that uses these columns goes live. Adds a purpose and the pack's ETH transfer to courier requests,
-- and the advertised pack (size and WIF price) to the keeper heartbeat.
ALTER TABLE courier_requests ADD COLUMN purpose TEXT NOT NULL DEFAULT 'send';
ALTER TABLE courier_requests ADD COLUMN gas_tx TEXT;
ALTER TABLE courier_keeper ADD COLUMN pack_wei TEXT NOT NULL DEFAULT '0';
ALTER TABLE courier_keeper ADD COLUMN pack_wif TEXT NOT NULL DEFAULT '0';
CREATE INDEX IF NOT EXISTS courier_purpose ON courier_requests (purpose, network, created_at);
