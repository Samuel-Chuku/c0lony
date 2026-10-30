// C0LONY keeper entry point: event intake (Quicknode Streams webhook, or eth_getLogs polling as fallback)
// plus the Voter's Pass proof endpoint. Settlement and notifications build on this intake.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config.ts";
import { Rpc } from "./intake/rpc.ts";
import { PollerSource } from "./intake/poller.ts";
import { StreamsWebhookServer } from "./intake/streamsWebhook.ts";
import { logKey, type EventSource, type LogFilter, type LogHandler } from "./intake/types.ts";
import { JsonStore } from "./state.ts";
import { loadVoteWallets, votesFilter, VoteStore } from "./voters/votes.ts";

const cfg = loadConfig();
mkdirSync(cfg.stateDir, { recursive: true });
const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);

const wallets = loadVoteWallets(cfg.voteWalletsFile);
const voteStore = new VoteStore(join(cfg.stateDir, "votes.json"), wallets);
const gameFilter: LogFilter = { addresses: cfg.gameAddresses, topics: [] };

// Game events are appended to an activity log (deduplicated); settlement/notifications consume it.
const seen = new Set<string>();
const onGameLogs: LogHandler = async (logs, info) => {
  for (const l of logs) {
    const key = logKey(l);
    if (seen.has(key)) continue;
    seen.add(key);
    appendFileSync(join(cfg.stateDir, "events.jsonl"), JSON.stringify({ ...l, via: info.source }) + "\n");
  }
  log(`game: ${logs.length} logs via ${info.source}`);
};
const onVoteLogs: LogHandler = async (logs, info) => {
  const added = voteStore.add(logs);
  log(`votes: ${logs.length} logs via ${info.source}, ${added} new`);
};

// Voter's Pass proofs for the frontend: GET /voters/proof/<address>
const proofs = new JsonStore<{ root?: string; proofs: Record<string, string[]> }>(join(cfg.stateDir, "proofs.json"), {
  proofs: {},
});

const server = new StreamsWebhookServer({
  maxAgeSec: cfg.streamsMaxAgeSec,
  log,
  get: (path) => {
    const m = /^\/voters\/proof\/(0x[0-9a-fA-F]{40})$/.exec(path);
    if (!m) return undefined;
    const p = proofs.read();
    const proof = p.proofs[m[1].toLowerCase()];
    return { status: 200, body: { address: m[1].toLowerCase(), root: p.root ?? null, eligible: !!proof, proof: proof ?? [] } };
  },
});

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

const shutdown = async () => {
  for (const [source] of sources) await source.stop();
  await server.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
