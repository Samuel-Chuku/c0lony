// Builds the Voter's Pass list and Merkle tree from the indexed vote transfers.
//   node --env-file=.env scripts/build-voters.ts
// Writes VOTERS_PUBLIC_DIR/voters.json (public: anyone can rebuild the root) and proofs/<address>.json, which
// Caddy serves from the VPS so daily list updates never need a site redeploy.
import { join } from "node:path";
import { loadConfig } from "../src/config.ts";
import { loadVoteWallets, VoteStore } from "../src/voters/votes.ts";
import { buildVoterTree } from "../src/voters/tree.ts";
import { publishVoterFiles } from "../src/voters/publish.ts";

const cfg = loadConfig();
const wallets = loadVoteWallets(cfg.voteWalletsFile);
const store = new VoteStore(join(cfg.stateDir, "votes.json"), wallets);
const { root, voters, proofs } = buildVoterTree(store.voters());

const published = {
  description:
    "Voter's Pass list: every address that sent at least 1 WIF to a World is Fair candidate vote wallet. " +
    "Rebuild the root with OpenZeppelin StandardMerkleTree.of(voters.map(a => [a]), ['address']).",
  root,
  count: voters.length,
  token: wallets.token,
  events: [{ name: wallets.event, candidateWallets: wallets.candidate_vote_wallets }],
  stats: store.stats(),
  voters,
};
publishVoterFiles(cfg.votersPublicDir, published, proofs);
console.log(`root ${root} · ${voters.length} voters ·`, store.stats());
