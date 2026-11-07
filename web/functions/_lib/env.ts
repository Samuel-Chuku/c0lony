export interface Env {
  FEED_DB?: D1Database;
  PROFILES?: KVNamespace;
  PRIVY_APP_ID?: string;
  PRIVY_VERIFICATION_KEY?: string;
  PRIVY_APP_SECRET?: string;
  FEED_INGEST_SECRET?: string;
  NEXT_PUBLIC_NETWORK?: string;
  // Telegram alerts (mainnet): the bot token from @BotFather and the secret set on its webhook.
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_BOT_USERNAME?: string; // without the @
  TELEGRAM_WEBHOOK_SECRET?: string;
}
