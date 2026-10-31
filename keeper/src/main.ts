// C0LONY keeper entry point: event intake (Quicknode Streams webhook, or eth_getLogs polling as fallback)
// plus the Voter's Pass proof endpoint. Settlement and notifications build on this intake.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config.ts";
import { Rpc } from "./intake/rpc.ts";
import { PollerSource } from "./intake/poller.ts";
import { StreamsWebhookServer } from "./intake/streamsWebhook.ts";
import { logKey, sortLogs, type EventSource, type LogFilter, type LogHandler } from "./intake/types.ts";
import { makePublicClient, ViemGameReader } from "./chain.ts";
import { BlockTimes, decodeLog, decodeRaw, RaidDirectory, type FeedEvent } from "./feed/decode.ts";
import { Outbox } from "./feed/outbox.ts";
import { PushClient } from "./push/client.ts";
import { PushPlanner } from "./push/planner.ts";
import { Scheduler } from "./push/scheduler.ts";
import { fetchDrandSignature } from "./settle/drand.ts";
import { replayHistory } from "./settle/history.ts";
import { Settler } from "./settle/settler.ts";
import { makeSettleWallet } from "./settle/wallet.ts";
import webpush from "web-push";
import { parseEther } from "viem";
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
if (reader && cfg.feedApiBase && cfg.feedIngestSecret && cfg.pushEnabled && cfg.vapidPublicKey && cfg.vapidPrivateKey && cfg.vapidSubject) {
  webpush.setVapidDetails(cfg.vapidSubject, cfg.vapidPublicKey, cfg.vapidPrivateKey);
  const client = new PushClient({
    apiBase: cfg.feedApiBase,
    secret: cfg.feedIngestSecret,
    send: (sub, body) => webpush.sendNotification(sub, body, { TTL: 3600 }),
    log,
  });
  let p: PushPlanner | undefined;
  scheduler = new Scheduler({ file: join(cfg.stateDir, "push-jobs.json"), fire: (job) => p!.fire(job), log });
  p = planner = new PushPlanner({ sched: scheduler, client, chain: reader, rosterFile: join(cfg.stateDir, "push-roster.json"), log });
} else {
  log("push: off (needs FEED_API_BASE, FEED_INGEST_SECRET, VAPID keys and subject, PUSH_ENABLED, game addresses)");
}

let settler: Settler | undefined;
if (reader && cfg.keeperPrivateKey) {
  const client = makePublicClient(cfg);
  settler = new Settler({
    reader,
    wallet: makeSettleWallet(cfg, client),
    signature: (round) => fetchDrandSignature(fetch, cfg.drandApiUrl, cfg.drandChainHash, round),
    minBalance: parseEther(cfg.minBalanceEth),
    log,
  });
  const n = replayHistory(join(cfg.stateDir, "events.jsonl"), settler, cfg.colonyGameAddress, cfg.seasonPotAddress);
  log(`settle: on, ${n} past events replayed, ${settler.pendingCount} raids tracked`);
} else {
  log("settle: off (needs KEEPER_PRIVATE_KEY and game addresses)");
}

const blockTimes = new BlockTimes(new Rpc(cfg.rpcUrl));
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
const onVoteLogs: LogHandler = async (logs, info) => {
  const added = voteStore.add(logs);
  log(`votes: ${logs.length} logs via ${info.source}, ${added} new`);
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
        rpc: new Rpc(cfg.rpcUrl),
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
      rpc: new Rpc(cfg.votesRpcUrl),
      filter: votesFilter(wallets),
      startBlock: cfg.votesStartBlock,
      intervalMs: cfg.pollIntervalMs,
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
log(`keeper up on :${port} · network ${cfg.network} · intake ${cfg.eventSource} · ${sources.length} sources`);

outbox?.start();
scheduler?.start();
settler?.start();

const shutdown = async () => {
  outbox?.stop();
  scheduler?.stop();
  settler?.stop();
  for (const [source] of sources) await source.stop();
  await server.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
