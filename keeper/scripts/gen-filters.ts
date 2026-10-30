// Writes the Quicknode Streams filter functions to keeper/streams/.
//   node scripts/gen-filters.ts
// Reads candidate vote wallets from VOTE_WALLETS_FILE and game addresses from env.
import { mkdirSync, writeFileSync } from "node:fs";
import { renderFilter } from "../src/intake/filterTemplate.ts";
import { loadVoteWallets, votesFilter } from "../src/voters/votes.ts";

const walletsFile = process.env.VOTE_WALLETS_FILE ?? "../data/world-is-fair-vote-wallets.json";
const wallets = loadVoteWallets(walletsFile);
mkdirSync("streams", { recursive: true });

writeFileSync("streams/wif-votes.filter.js", renderFilter("wif-votes", votesFilter(wallets)));
console.log(`streams/wif-votes.filter.js: ${wallets.candidate_vote_wallets.length} candidate wallets`);

const game = [process.env.COLONY_GAME_ADDRESS, process.env.SEASON_POT_ADDRESS, process.env.TREASURY_ADDRESS].filter(
  (a): a is string => !!a,
);
if (game.length > 0) {
  writeFileSync("streams/colony-events.filter.js", renderFilter("colony-events", { addresses: game, topics: [] }));
  console.log(`streams/colony-events.filter.js: ${game.length} contracts`);
} else {
  console.log("colony-events filter skipped: set COLONY_GAME_ADDRESS, SEASON_POT_ADDRESS, TREASURY_ADDRESS after deploy");
}
