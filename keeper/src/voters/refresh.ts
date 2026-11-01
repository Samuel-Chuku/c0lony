// Keeps the Voter's Pass current without anyone running a script: after each votes check that found new voters
// (and once at startup), rebuild the tree, publish voters.json and the proofs, and post the new root onchain
// if the keeper wallet is the contract's voter root setter. Votes are checked every 3 hours, so a new voter
// gets their pass within about 3 hours.
import type { Address, Hash, PublicClient, WalletClient } from "viem";
import { colonyGameAbi } from "../abi.ts";
import { buildVoterTree } from "./tree.ts";
import { publishVoterFiles } from "./publish.ts";
import type { VoteStore, VoteWallets } from "./votes.ts";

export type VoterRefreshDeps = {
  store: VoteStore;
  wallets: VoteWallets;
  publicDir: string;
  listUri: string;
  game?: Address;
  client?: PublicClient;
  wallet?: WalletClient; // the keeper wallet; root posting is skipped without it
  log: (msg: string) => void;
};

export function makeVoterRefresher(d: VoterRefreshDeps) {
  let lastRoot: string | null = null;
  let warnedSetter = false;

  return async function refresh(): Promise<void> {
    const { root, voters, proofs } = buildVoterTree(d.store.voters());
    if (root !== lastRoot) {
      publishVoterFiles(
        d.publicDir,
        {
          description:
            "Voter's Pass list: every address that sent at least 1 WIF to a World is Fair candidate vote wallet. " +
            "Rebuild the root with OpenZeppelin StandardMerkleTree.of(voters.map(a => [a]), ['address']). " +
            "Votes are checked every 3 hours.",
          root,
          count: voters.length,
          token: d.wallets.token,
          events: [{ name: d.wallets.event, candidateWallets: d.wallets.candidate_vote_wallets }],
          stats: d.store.stats(),
          updatedAt: Math.floor(Date.now() / 1000),
          voters,
        },
        proofs,
      );
      lastRoot = root;
      d.log(`voters: published ${voters.length} voters, root ${root}`);
    }
    if (!d.game || !d.client || !d.wallet?.account || voters.length === 0) return;

    const [onchain, setter, owner] = await Promise.all([
      d.client.readContract({ address: d.game, abi: colonyGameAbi, functionName: "voterRoot" }),
      d.client.readContract({ address: d.game, abi: colonyGameAbi, functionName: "voterRootSetter" }),
      d.client.readContract({ address: d.game, abi: colonyGameAbi, functionName: "owner" }),
    ]);
    if (onchain.toLowerCase() === root.toLowerCase()) return;
    const me = d.wallet.account.address.toLowerCase();
    if (setter.toLowerCase() !== me && owner.toLowerCase() !== me) {
      if (!warnedSetter) d.log("voters: keeper wallet is not the voter root setter; the new root is published but not posted");
      warnedSetter = true;
      return;
    }
    const hash: Hash = await d.wallet.writeContract({
      address: d.game,
      abi: colonyGameAbi,
      functionName: "setVoterRoot",
      args: [root as Hash, d.listUri],
      account: d.wallet.account,
      chain: d.wallet.chain,
    });
    const receipt = await d.client.waitForTransactionReceipt({ hash });
    d.log(`voters: root ${receipt.status === "success" ? "posted" : "FAILED"} onchain · ${hash}`);
  };
}
