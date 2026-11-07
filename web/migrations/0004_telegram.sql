-- Telegram alerts: one linked chat per wallet, with its own alert switches (separate from push).
CREATE TABLE IF NOT EXISTS tg_links (
  wallet TEXT PRIMARY KEY,
  chatId TEXT NOT NULL,
  prefs TEXT NOT NULL,
  linkedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tg_links_chat ON tg_links (chatId);
-- One-time codes carried in the t.me/<bot>?start=<code> link. Short-lived; used once.
CREATE TABLE IF NOT EXISTS tg_codes (
  code TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  prefs TEXT NOT NULL,
  expiresAt INTEGER NOT NULL
);
