import { resolve } from "node:path";

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v !== undefined && v !== "") return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing env var ${name}`);
}

function int(name: string, fallback: number): number {
  const n = Number(env(name, String(fallback)));
  if (!Number.isInteger(n)) throw new Error(`${name} must be an integer`);
  return n;
}

export type EventSourceKind = "streams" | "poll";

export function loadConfig() {
  const network = env("NETWORK", "testnet");
  if (network !== "testnet" && network !== "mainnet") throw new Error("NETWORK must be testnet or mainnet");
  const eventSource = env("EVENT_SOURCE", "streams") as EventSourceKind;
  if (eventSource !== "streams" && eventSource !== "poll") throw new Error("EVENT_SOURCE must be streams or poll");
  const stateDir = resolve(env("STATE_DIR", "state"));

  return {
    network,
    chainId: network === "mainnet" ? 4663 : 46630,
    // Quicknode endpoints (keys stay in env)
    rpcUrl: network === "mainnet" ? env("ROBINHOOD_RPC_URL") : env("ROBINHOOD_TESTNET_RPC_URL"),
    // Votes are always read from mainnet, where $WIF and World is Fair live
    votesRpcUrl: env("ROBINHOOD_RPC_URL"),
    eventSource,
    pollIntervalMs: int("POLL_INTERVAL_MS", 15_000),
    chunkBlocks: int("GETLOGS_CHUNK_BLOCKS", 10_000),
    confirmations: int("CONFIRMATIONS", 2),
    webhookHost: env("WEBHOOK_HOST", "0.0.0.0"),
    webhookPort: int("WEBHOOK_PORT", 8787),
    streamsGameToken: env("STREAMS_GAME_TOKEN", ""),
    streamsVotesToken: env("STREAMS_VOTES_TOKEN", ""),
    streamsMaxAgeSec: int("STREAMS_MAX_AGE_SEC", 600),
    gameAddresses: [env("COLONY_GAME_ADDRESS", ""), env("SEASON_POT_ADDRESS", ""), env("TREASURY_ADDRESS", "")].filter(
      Boolean,
    ),
    startBlock: int("START_BLOCK", 0),
    voteWalletsFile: resolve(env("VOTE_WALLETS_FILE", "../data/world-is-fair-vote-wallets.json")),
    votesStartBlock: int("VOTES_START_BLOCK", 40_000_000),
    votersListUri: env("VOTERS_LIST_URI", "https://keeper.c0lony.xyz/voters/voters.json"),
    // Served as static files by Caddy at https://keeper.c0lony.xyz/voters/ (voters.json, proofs/<address>.json)
    votersPublicDir: resolve(env("VOTERS_PUBLIC_DIR", "public/voters")),
    // Signed delivery to the app's Pages Functions (feed ingest, push targets). Empty = feed and push are off.
    feedApiBase: env("FEED_API_BASE", "").replace(/\/+$/, ""),
    feedIngestSecret: env("FEED_INGEST_SECRET", ""),
    // Web Push (VAPID). PUSH_ENABLED defaults to on when both keys are present.
    vapidPublicKey: env("VAPID_PUBLIC_KEY", ""),
    vapidPrivateKey: env("VAPID_PRIVATE_KEY", ""),
    vapidSubject: env("VAPID_SUBJECT", ""),
    pushEnabled: env("PUSH_ENABLED", env("VAPID_PUBLIC_KEY", "") && env("VAPID_PRIVATE_KEY", "") ? "true" : "false") === "true",
    // Settlement wallet; empty = settling is off
    keeperPrivateKey: env("KEEPER_PRIVATE_KEY", ""),
    minBalanceEth: env("MIN_BALANCE_ETH", "0.0002"),
    drandApiUrl: env("DRAND_API_URL", "https://api.drand.sh").replace(/\/+$/, ""),
    drandChainHash: env("DRAND_CHAIN_HASH", "04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3"),
    colonyGameAddress: env("COLONY_GAME_ADDRESS", ""),
    seasonPotAddress: env("SEASON_POT_ADDRESS", ""),
    stateDir,
  };
}

export type Config = ReturnType<typeof loadConfig>;
