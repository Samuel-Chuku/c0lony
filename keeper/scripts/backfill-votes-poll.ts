// Fallback for the one-time Voter's Pass backfill when Quicknode Streams is not available:
// reads WIF transfers to the candidate wallets with eth_getLogs, from VOTES_START_BLOCK to head.
//   node --env-file=.env scripts/backfill-votes-poll.ts
import { join } from "node:path";
import { loadConfig } from "../src/config.ts";
import { Rpc } from "../src/intake/rpc.ts";
import { PollerSource } from "../src/intake/poller.ts";
import { loadVoteWallets, votesFilter, VoteStore } from "../src/voters/votes.ts";

const cfg = loadConfig();
const wallets = loadVoteWallets(cfg.voteWalletsFile);
const store = new VoteStore(join(cfg.stateDir, "votes.json"), wallets);
const rpc = new Rpc(cfg.votesRpcUrl);
const head = await rpc.blockNumber();
const poller = new PollerSource({
  rpc,
  filter: votesFilter(wallets),
  startBlock: cfg.votesStartBlock,
  endBlock: head,
  intervalMs: 0,
  chunkBlocks: cfg.chunkBlocks,
  confirmations: 0,
  cursorFile: join(cfg.stateDir, "votes-backfill-cursor.json"),
  log: console.log,
});
const last = await poller.tick(async (logs, info) => {
  const added = store.add(logs);
  console.log(`blocks ${info.fromBlock}-${info.toBlock}: ${logs.length} logs, ${added} new`);
});
console.log(`backfill reached block ${last} of ${head}`, store.stats());
