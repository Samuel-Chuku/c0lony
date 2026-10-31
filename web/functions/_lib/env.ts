export interface Env {
  FEED_DB?: D1Database;
  PROFILES?: KVNamespace;
  PRIVY_APP_ID?: string;
  PRIVY_VERIFICATION_KEY?: string;
  PRIVY_APP_SECRET?: string;
  FEED_INGEST_SECRET?: string;
}
