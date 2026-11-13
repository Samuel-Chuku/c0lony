import { resolve } from "node:path";

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v !== undefined && v !== "") return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing env var ${name}`);
}

/** Comma-separated RPC URLs, in the order to try them (first is primary, the rest are fallbacks). */
export function urlList(raw: string): string[] {
  return raw.split(",").map((u) => u.trim()).filter(Boolean);
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
    // RPC endpoints in priority order, comma-separated (keys stay in env). Later ones are used only when earlier ones fail.
    rpcUrls: urlList(network === "mainnet" ? env("ROBINHOOD_RPC_URL") : env("ROBINHOOD_TESTNET_RPC_URL")),
    // Votes are always read from mainnet, where $WIF and World is Fair live
    votesRpcUrls: urlList(env("ROBINHOOD_RPC_URL")),
    eventSource,
    pollIntervalMs: int("POLL_INTERVAL_MS", 15_000),
    // Votes only change the Voter's Pass list, so they are checked every 3 hours (players are told to allow that).
    votesPollIntervalMs: int("VOTES_POLL_INTERVAL_MS", 10_800_000),
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
    // Telegram alerts (same bot as the app's TELEGRAM_BOT_TOKEN Pages secret). On by default on mainnet when the
    // token is set; TELEGRAM_ENABLED=true forces it on elsewhere (for a test), false turns it off.
    telegramBotToken: env("TELEGRAM_BOT_TOKEN", ""),
    telegramEnabled:
      env("TELEGRAM_ENABLED", network === "mainnet" && env("TELEGRAM_BOT_TOKEN", "") ? "true" : "false") === "true" && !!env("TELEGRAM_BOT_TOKEN", ""),
    // Settlement wallet; empty = settling is off
    keeperPrivateKey: env("KEEPER_PRIVATE_KEY", ""),
    minBalanceEth: env("MIN_BALANCE_ETH", "0.0002"),
    drandApiUrl: env("DRAND_API_URL", "https://api.drand.sh").replace(/\/+$/, ""),
    drandChainHash: env("DRAND_CHAIN_HASH", "04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3"),
    // Starter gas: ETH sent to a new player's wallet (the app queues the requests). On by default when the
    // keeper key and the app link are set; STARTER_GAS_ENABLED=false turns it off.
    starterGasEnabled:
      env("STARTER_GAS_ENABLED", env("KEEPER_PRIVATE_KEY", "") && env("FEED_API_BASE", "") && env("FEED_INGEST_SECRET", "") ? "true" : "false") === "true",
    // Testnet WIF faucet: the mock token the keeper mints from, and how much per request (once a day per wallet).
    wifAddress: env("WIF_ADDRESS", network === "mainnet" ? "" : "0xC7524F3D78E5f6150aff0Eac811e9Bd0D0Fd9B68"),
    // Gifts ("Send WIF to a colony"): WIF transfers between players, read from the token's Transfer logs. On mainnet
    // the token is fixed to $WIF (docs/DEPLOYMENTS.md) so a testnet WIF_ADDRESS left in the env can't redirect it.
    giftTokenAddress: network === "mainnet" ? "0x5173b8eA6923c2d40267890D45C46a3480954773" : env("WIF_ADDRESS", "0xC7524F3D78E5f6150aff0Eac811e9Bd0D0Fd9B68"),
    giftsEnabled: env("GIFTS_ENABLED", "true") === "true",
    faucetWifAmount: env("FAUCET_WIF_AMOUNT", "10000"),
    starterGasEth: env("STARTER_GAS_ETH", network === "mainnet" ? "0.00003" : "0.001"),
    starterGasBelowEth: env("STARTER_GAS_BELOW_ETH", network === "mainnet" ? "0.00002" : "0.0002"),
    // WIF gas courier: relays players' signed WIF sends and pays the gas (the app queues them). Mainnet stays off until
    // its Courier is deployed and COURIER_ADDRESS is set. The token is read from the Courier itself, never from env.
    courierAddress: env("COURIER_ADDRESS", network === "mainnet" ? "" : "0xec86Fe12db326eBf69CFD3edE3EFa1F6b8405bFD"),
    courierEnabled:
      env("COURIER_ENABLED", "true") === "true" &&
      !!env("COURIER_ADDRESS", network === "mainnet" ? "" : "0xec86Fe12db326eBf69CFD3edE3EFa1F6b8405bFD") &&
      !!env("KEEPER_PRIVATE_KEY", "") && !!env("FEED_API_BASE", "") && !!env("FEED_INGEST_SECRET", ""),
    courierMinFeeWif: env("COURIER_MIN_FEE_WIF", "5"),
    // Fee WIF -> ETH (mainnet only): when keeper ETH is under SWAP_BELOW_ETH and it holds at least SWAP_MIN_WIF.
    courierSwapEnabled: network === "mainnet" && env("COURIER_SWAP_ENABLED", "true") === "true",
    courierSwapBelowEth: env("COURIER_SWAP_BELOW_ETH", "0.0005"),
    courierSwapMinWif: env("COURIER_SWAP_MIN_WIF", "100"),
    // Gas packs (docs/design/2026-11-13-wif-for-gas.md): a player out of ETH pays WIF through the Courier and gets a
    // fixed pack of ETH back. Needs the courier. Off on mainnet until GAS_PACK_ENABLED=true is set there.
    gasPackEnabled: env("GAS_PACK_ENABLED", network === "mainnet" ? "false" : "true") === "true",
    gasPackEth: env("GAS_PACK_ETH", "0.0001"),
    gasPackMarkupBps: Number(env("GAS_PACK_MARKUP_BPS", "1000")),
    gasPackMinWif: env("GAS_PACK_MIN_WIF", "50"),
    gasPackMaxWif: env("GAS_PACK_MAX_WIF", "1000"),
    // Testnet has no KyberSwap: a fixed quote (before the markup) stands in for it.
    gasPackTestnetWif: env("GAS_PACK_TESTNET_WIF", "188"),
    gasPackDailyCap: Number(env("GAS_PACK_DAILY_CAP", "15")),
    gasPackFloorEth: env("GAS_PACK_FLOOR_ETH", "0.0005"),
    // One-time ETH for an out-of-gas player to approve the Courier, so they can buy a pack (embedded wallets only).
    approvalDripEth: env("APPROVAL_DRIP_ETH", "0.000005"),
    kyberApiUrl: env("KYBER_API_URL", "https://aggregator-api.kyberswap.com/robinhood/api/v1").replace(/\/+$/, ""),
    colonyGameAddress: env("COLONY_GAME_ADDRESS", ""),
    seasonPotAddress: env("SEASON_POT_ADDRESS", ""),
    stateDir,
  };
}

export type Config = ReturnType<typeof loadConfig>;
