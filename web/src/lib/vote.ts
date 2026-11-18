"use client";
// World is Flat final: vote for C0LONY without leaving the game. The vote contract burns the WIF and counts it for
// project 43; it doesn't care which site sent the transaction. Same rules as the official vote page: approve exactly
// the amount (never unlimited), simulate before signing, and stop 20 seconds before the deadline.
import { useSyncExternalStore } from "react";
import { erc20Abi, type Address, type Hash } from "viem";
import { NETWORK } from "../config";
import { publicClient } from "./chain";
import { WIF } from "./game";
import type { walletClientFor } from "./tx";

export const VOTE = "vote" in NETWORK ? NETWORK.vote : null;
const SAFETY = 20; // seconds: a vote this close to the deadline might be mined too late

const voteAbi = [
  { type: "function", name: "vote", stateMutability: "nonpayable", inputs: [
    { name: "submissionId", type: "uint256" }, { name: "amount", type: "uint256" }, { name: "deadline", type: "uint256" },
  ], outputs: [] },
] as const;

/** Seconds left to vote, or 0 when there is no vote on this network or it has closed. */
export function voteLeft(now: number): number {
  return VOTE ? Math.max(0, VOTE.deadline - SAFETY - now) : 0;
}

// ---- the vote sheet's open state, shared by the login pop-up, the banner and anywhere else
let open = false;
const listeners = new Set<() => void>();
export function openVote() { open = true; listeners.forEach((l) => l()); }
export function closeVote() { open = false; listeners.forEach((l) => l()); }
export function useVoteOpen(): boolean {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => open, () => false);
}

/** Approves exactly `amount` if the allowance is short, then votes. Returns the vote's hash. */
export async function castVote(client: Awaited<ReturnType<typeof walletClientFor>>, amount: bigint, onStep: (s: "approving" | "voting") => void): Promise<Hash> {
  if (!VOTE) throw new Error("voting isn't open here");
  if (voteLeft(Math.floor(Date.now() / 1000)) <= 0) throw new Error("voting has closed");
  const account = client.account.address;
  const spender = VOTE.contract as Address;
  const allowance = await publicClient.readContract({ address: WIF, abi: erc20Abi, functionName: "allowance", args: [account, spender] });
  if (allowance < amount) {
    onStep("approving");
    const { request } = await publicClient.simulateContract({ account, address: WIF, abi: erc20Abi, functionName: "approve", args: [spender, amount] });
    const approve = await client.writeContract(request);
    const r = await publicClient.waitForTransactionReceipt({ hash: approve });
    if (r.status !== "success") throw new Error("the approval reverted");
  }
  onStep("voting");
  if (voteLeft(Math.floor(Date.now() / 1000)) <= 0) throw new Error("voting has closed");
  const { request } = await publicClient.simulateContract({
    account, address: spender, abi: voteAbi, functionName: "vote", args: [BigInt(VOTE.projectId), amount, BigInt(VOTE.deadline)],
  });
  return client.writeContract(request);
}
