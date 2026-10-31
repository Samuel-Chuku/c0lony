"use client";
// Voter's Pass proofs, published as static files by the keeper. A proof is used only when its root matches
// the root the contract holds now; otherwise the player simply pays the normal price.
import type { Address, Hex } from "viem";
import { CONFIG } from "../config";
import { colonyGameAbi } from "./abi";
import { publicClient } from "./chain";
import { GAME } from "./game";
import { useQuery } from "./store";

export type VoterProof = { address: string; root: Hex; proof: Hex[] };

export async function fetchVoterProof(address: string): Promise<VoterProof | null> {
  const res = await fetch(`${CONFIG.proofsBaseUrl}/proofs/${address.toLowerCase()}.json`).catch(() => null);
  if (!res || !res.ok) return null;
  const body = (await res.json()) as VoterProof;
  const root = await publicClient.readContract({ address: GAME, abi: colonyGameAbi, functionName: "voterRoot" });
  return body.root?.toLowerCase() === root.toLowerCase() ? body : null;
}

/** The proof to pass to foundColony / feedQueen: [] when there is none or the pass is already held. */
export function useVoterProof(address: string | null | undefined) {
  return useQuery(
    address ? `voterproof:${address.toLowerCase()}` : null,
    async () => {
      const used = await publicClient.readContract({ address: GAME, abi: colonyGameAbi, functionName: "voterUsed", args: [address as Address] });
      if (used !== "0x0000000000000000000000000000000000000000") return { proof: [] as Hex[], eligible: false };
      const p = await fetchVoterProof(address!);
      return { proof: (p?.proof ?? []) as Hex[], eligible: !!p };
    },
    600_000,
  );
}
