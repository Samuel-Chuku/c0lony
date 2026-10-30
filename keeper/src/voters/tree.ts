import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

/**
 * Builds the Voter's Pass tree exactly as ColonyGame checks it: OpenZeppelin StandardMerkleTree with one
 * `address` value per leaf, i.e. leaf = keccak256(bytes.concat(keccak256(abi.encode(addr)))).
 */
export function buildVoterTree(voters: string[]) {
  const unique = [...new Set(voters.map((a) => a.toLowerCase()))].sort();
  const tree = StandardMerkleTree.of(
    unique.map((a) => [a]),
    ["address"],
  );
  const proofs: Record<string, string[]> = {};
  for (const [i, [addr]] of tree.entries()) proofs[(addr as string).toLowerCase()] = tree.getProof(i);
  return { root: tree.root, voters: unique, proofs };
}
