// C0LONY keeper entry point: event intake (Quicknode Streams webhook, or eth_getLogs polling as fallback)
// plus the Voter's Pass proof endpoint. Settlement and notifications build on this intake.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config.ts";
import { Rpc, rpcHost } from "./intake/rpc.ts";
import { PollerSource } from "./intake/poller.ts";
import { StreamsWebhookServer } from "./intake/streamsWebhook.ts";
import { logKey, sortLogs, type EventSource, type LogFilter, type LogHandler } from "./intake/types.ts";
import { makePublicClient, ViemGameReader } from "./chain.ts";
import { BlockTimes, decodeLog, decodeRaw, RaidDirectory, type FeedEvent } from "./feed/decode.ts";
import { Outbox } from "./feed/outbox.ts";
import { PushClient } from "./push/client.ts";
import { PushPlanner } from "./push/planner.ts";
import { TelegramClient } from "./push/telegram.ts";
import { Scheduler } from "./push/scheduler.ts";
import { makeUnsealer } from "./settle/unseal.ts";
import { fetchDrandSignature } from "./settle/drand.ts";
import { replayHistory } from "./settle/history.ts";
import { Settler } from "./settle/settler.ts";
import { makeSettleWallet } from "./settle/wallet.ts";
import { httpGasApi, StarterGas } from "./gas/starter.ts";
import { makeVoterRefresher, whenQuiet } from "./voters/refresh.ts";
import { createWalletClient, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { makeChain, rpcTransport } from "./chain.ts";
import webpush from "web-push";
import { parseEther } from "viem";
import { JsonStore } from "./state.ts";
import { loadVoteWallets, votesFilter, VoteStore } from "./voters/votes.ts";

const cfg = loadConfig();
mkdirSync(cfg.stateDir, { recursive: true });
const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);

const wallets = loadVoteWallets(cfg.voteWalletsFile);
const voteStore = new VoteStore(join(cfg.stateDir, "votes.json"), wallets);
const gameFilter: LogFilter = { addresses: cfg.gameAddresses, topics: [] };

// Game events fan out to: the activity log (events.jsonl), the feed outbox, push, and the settler.
// Each part switches itself off (one log line) when its settings are missing, so the others still run.
const gameReady = Boolean(cfg.colonyGameAddress && cfg.seasonPotAddress);
const reader = gameReady ? new ViemGameReader(makePublicClient(cfg), cfg.colonyGameAddress) : undefined;

const outbox =
  cfg.feedApiBase && cfg.feedIngestSecret
    ? new Outbox({ file: join(cfg.stateDir, "feed-outbox.json"), url: `${cfg.feedApiBase}/api/feed/ingest`, secret: cfg.feedIngestSecret, log })
    : undefined;
if (!outbox) log("feed: FEED_API_BASE or FEED_INGEST_SECRET missing, feed delivery is off");

let planner: PushPlanner | undefined;
let scheduler: Scheduler | undefined;
const pushReady = cfg.pushEnabled && !!(cfg.vapidPublicKey && cfg.vapidPrivateKey && cfg.vapidSubject);
if (reader && cfg.feedApiBase && cfg.feedIngestSecret && (pushReady || cfg.telegramEnabled)) {
  if (pushReady) webpush.setVapidDetails(cfg.vapidSubject, cfg.vapidPublicKey, cfg.vapidPrivateKey);
  const client = new PushClient({
    apiBase: cfg.feedApiBase,
    secret: cfg.feedIngestSecret,
    send: pushReady ? (sub, body) => webpush.sendNotification(sub, body, { TTL: 3600 }) : undefined,
    telegram: cfg.telegramEnabled
      ? new TelegramClient({ apiBase: cfg.feedApiBase, secret: cfg.feedIngestSecret, token: cfg.telegramBotToken, log })
      : undefined,
    log,
  });
  let p: PushPlanner | undefined;
  scheduler = new Scheduler({ file: join(cfg.stateDir, "push-jobs.json"), fire: (job) => p!.fire(job), log });
  p = planner = new PushPlanner({ sched: scheduler, client, chain: reader, rosterFile: join(cfg.stateDir, "push-roster.json"), log });
  log(`alerts: push ${pushReady ? "on" : "off"} · telegram ${cfg.telegramEnabled ? "on" : "off"}`);
} else {
  log("alerts: off (needs FEED_API_BASE, FEED_INGEST_SECRET, game addresses, and VAPID keys or a Telegram bot token)");
}

let settler: Settler | undefined;
if (reader && cfg.keeperPrivateKey) {
  const client = makePublicClient(cfg);
  settler = new Settler({
    reader,
    wallet: makeSettleWallet(cfg, client),
    signature: (round) => fetchDrandSignature(fetch, cfg.drandApiUrl, cfg.drandChainHash, round),
    unseal: makeUnsealer(),
    minBalance: parseEther(cfg.minBalanceEth),
    log,
  });
  const n = replayHistory(join(cfg.stateDir, "events.jsonl"), settler, cfg.colonyGameAddress, cfg.seasonPotAddress);
  log(`settle: on, ${n} past events replayed, ${settler.pendingCount} raids tracked`);
} else {
  log("settle: off (needs KEEPER_PRIVATE_KEY and game addresses)");
}

let starterGas: StarterGas | undefined;
if (cfg.starterGasEnabled && cfg.keeperPrivateKey && cfg.feedApiBase && cfg.feedIngestSecret) {
  const client = makePublicClient(cfg);
  const account = privateKeyToAccount(cfg.keeperPrivateKey as Hash);
  const wallet = createWalletClient({ account, chain: makeChain(cfg), transport: rpcTransport(cfg.rpcUrls) });
  starterGas = new StarterGas({
    api: httpGasApi(fetch, cfg.feedApiBase, cfg.feedIngestSecret),
    chain: {
      balanceOf: (a) => client.getBalance({ address: a as Address }),
      keeperBalance: () => client.getBalance({ address: account.address }),
      send: (to, amount) => wallet.sendTransaction({ to: to as Address, value: amount }),
      // Testnet only: the mock WIF token has an open mint, and the keeper mints from the faucet queue.
      mintWif:
        cfg.network === "testnet" && cfg.wifAddress
          ? (to) =>
              wallet.writeContract({
                address: cfg.wifAddress as Address,
                abi: [{ type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] }] as const,
                functionName: "mint",
                args: [to as Address, parseEther(cfg.faucetWifAmount)],
              })
          : undefined,
      wait: async (hash) => (await client.waitForTransactionReceipt({ hash: hash as Hash })).status === "success",
    },
    store: new JsonStore(join(cfg.stateDir, "gas-sent.json"), {}),
    amount: parseEther(cfg.starterGasEth),
    below: parseEther(cfg.starterGasBelowEth),
    minBalance: parseEther(cfg.minBalanceEth),
    log,
  });
  log(`gas: starter gas on, ${cfg.starterGasEth} ETH to wallets under ${cfg.starterGasBelowEth} ETH`);
} else {
  log("gas: starter gas off (needs KEEPER_PRIVATE_KEY, FEED_API_BASE and FEED_INGEST_SECRET)");
}

const blockTimes = new BlockTimes(new Rpc(cfg.rpcUrls));
const directory = new RaidDirectory(join(cfg.stateDir, "raids.json"));
const decodeDeps = {
  gameAddress: cfg.colonyGameAddress,
  potAddress: cfg.seasonPotAddress,
  blockTime: blockTimes.get,
  lookupRaid: (id: bigint) => reader?.raidWallets(id) ?? Promise.resolve(undefined),
  directory,
};

const seen = new Set<string>();
const onGameLogs: LogHandler = async (logs, info) => {
  let failed: unknown;
  for (const l of sortLogs(logs)) {
    const key = logKey(l);
    if (seen.has(key)) continue;
    try {
      const raw = decodeRaw(l, cfg.colonyGameAddress, cfg.seasonPotAddress);
      const feed: FeedEvent | null = raw ? await decodeLog(l, decodeDeps) : null;
      if (raw) settler?.onEvent(raw);
      if (feed) {
        outbox?.add([feed]);
        await planner?.onEvent(feed);
      }
      if (raw?.name === "SeasonEndChanged") await planner?.onSeasonEndChanged(Number(raw.args.season), Number(raw.args.newEnd));
    } catch (err) {
      // e.g. block time lookup failed: leave the log unseen so the next delivery retries it
      failed = err;
      continue;
    }
    seen.add(key);
    appendFileSync(join(cfg.stateDir, "events.jsonl"), JSON.stringify({ ...l, via: info.source }) + "\n");
  }
  log(`game: ${logs.length} logs via ${info.source}`);
  if (failed) throw failed;
};
// The voter list republishes itself, and the keeper posts the new root onchain when it is the root setter.
const refreshVoters = makeVoterRefresher({
  store: voteStore,
  wallets,
  publicDir: cfg.votersPublicDir,
  listUri: cfg.votersListUri,
  game: cfg.colonyGameAddress ? (cfg.colonyGameAddress as Address) : undefined,
  client: cfg.colonyGameAddress ? makePublicClient(cfg) : undefined,
  wallet: cfg.keeperPrivateKey
    ? createWalletClient({ account: privateKeyToAccount(cfg.keeperPrivateKey as Hash), chain: makeChain(cfg), transport: rpcTransport(cfg.rpcUrls) })
    : undefined,
  log,
});
// Wait for votes to go quiet (60s) before refreshing, so catching up on old votes posts the root once, not per batch.
const runVoterRefresh = whenQuiet(
  () => refreshVoters().catch((e) => log(`voters: refresh failed: ${e instanceof Error ? e.message : e}`)),
  60_000,
);

const onVoteLogs: LogHandler = async (logs, info) => {
  const added = voteStore.add(logs);
  log(`votes: ${logs.length} logs via ${info.source}, ${added} new`);
  if (added > 0) runVoterRefresh();
};

// Voter's Pass proofs are static files (scripts/build-voters.ts) that Caddy serves at /voters/, not routes here.
const server = new StreamsWebhookServer({ maxAgeSec: cfg.streamsMaxAgeSec, log });

const sources: [EventSource, LogHandler][] = [];
if (cfg.eventSource === "streams") {
  if (cfg.gameAddresses.length > 0) sources.push([server.route("/streams/game", cfg.streamsGameToken, gameFilter), onGameLogs]);
  if (cfg.streamsVotesToken) sources.push([server.route("/streams/votes", cfg.streamsVotesToken, votesFilter(wallets)), onVoteLogs]);
} else {
  if (cfg.gameAddresses.length > 0) {
    sources.push([
      new PollerSource({
        rpc: new Rpc(cfg.rpcUrls),
        filter: gameFilter,
        startBlock: cfg.startBlock,
        intervalMs: cfg.pollIntervalMs,
        chunkBlocks: cfg.chunkBlocks,
        confirmations: cfg.confirmations,
        cursorFile: join(cfg.stateDir, "game-cursor.json"),
        log,
      }),
      onGameLogs,
    ]);
  }
  sources.push([
    new PollerSource({
      rpc: new Rpc(cfg.votesRpcUrls),
      filter: votesFilter(wallets),
      startBlock: cfg.votesStartBlock,
      intervalMs: cfg.votesPollIntervalMs,
      chunkBlocks: cfg.chunkBlocks,
      confirmations: cfg.confirmations,
      cursorFile: join(cfg.stateDir, "votes-cursor.json"),
      log,
    }),
    onVoteLogs,
  ]);
}

const port = await server.listen(cfg.webhookPort, cfg.webhookHost);
for (const [source, handler] of sources) await source.start(handler);
runVoterRefresh();
log(`keeper up on :${port} · network ${cfg.network} · intake ${cfg.eventSource} · ${sources.length} sources · rpc ${cfg.rpcUrls.map(rpcHost).join(" > ")}`);

outbox?.start();
scheduler?.start();
settler?.start();
starterGas?.start();

const shutdown = async () => {
  outbox?.stop();
  scheduler?.stop();
  settler?.stop();
  starterGas?.stop();
  for (const [source] of sources) await source.stop();
  await server.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
