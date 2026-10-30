// Writes contracts/test/fixtures/voter_tree.json: a tree built by @openzeppelin/merkle-tree over the
// Foundry test wallets, so the contract test can prove the onchain leaf matches the JS library.
import { writeFileSync } from "node:fs";
import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildVoterTree } from "../src/voters/tree.ts";

// forge-std makeAddr(name) = vm.addr(uint256(keccak256(name)))
const makeAddr = (name: string) => privateKeyToAccount(keccak256(toHex(name))).address;
const names = ["alice", "bob", "dave", "erin", "frank"];
const { root, voters, proofs } = buildVoterTree(names.map(makeAddr));
const alice = makeAddr("alice").toLowerCase();
writeFileSync(
  "../contracts/test/fixtures/voter_tree.json",
  JSON.stringify({ generator: "@openzeppelin/merkle-tree StandardMerkleTree ['address']", root, voters, alice, aliceProof: proofs[alice] }, null, 2) + "\n",
);
console.log(root, voters.length, "voters; alice proof length", proofs[alice].length);
