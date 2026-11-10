"use client";
// Pay gas in WIF for "Send WIF to a colony" (see docs/design/2026-11-10-wif-gas-courier.md).
// The player approves the Courier contract once (a normal transaction), then each send is only a signature:
// the app queues it, the keeper submits it and pays the ETH, and the player pays a small WIF fee in the same
// transaction. The fee recipient is part of what the player signs, so nobody can redirect it.
import { erc20Abi, type Address, type Hash } from "viem";
import { NETWORK, NETWORK_NAME } from "../config";
import { chain, publicClient } from "./chain";
import { WIF } from "./game";
import { invalidate, useQuery } from "./store";
import { walletClientFor } from "./tx";
import type { ConnectedWallet } from "@privy-io/react-auth";

export const COURIER = (NETWORK.contracts as { courier?: string }).courier as Address | "" | undefined;

export type CourierConfig = { enabled: boolean; courier: string | null; feeTo: string | null; fee: string; deadlineSec: number; approveAmount: string };

const courierAbi = [
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

const TYPES = {
  Send: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "fee", type: "uint256" },
    { name: "feeTo", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `The server answered ${res.status}.`);
  return body as T;
}

/** The keeper's live settings: whether WIF gas is on right now, the fee, and who receives it. */
export function useCourierConfig() {
  return useQuery(COURIER ? "courier:config" : null, () => getJson<CourierConfig>(`/api/courier/config?network=${NETWORK_NAME}`), 60_000);
}

/** How much WIF the Courier may move for this wallet (0n when none). */
export function useCourierAllowance(wallet: string | null | undefined) {
  return useQuery(COURIER && wallet ? `courier:allowance:${wallet.toLowerCase()}` : null, () =>
    publicClient.readContract({ address: WIF, abi: erc20Abi, functionName: "allowance", args: [wallet as Address, COURIER as Address] }), 30_000);
}

/** One normal transaction (ETH gas) letting the Courier move up to `amount` WIF. 0 revokes. */
export async function approveCourier(wallet: ConnectedWallet, amount: bigint): Promise<Hash> {
  const client = await walletClientFor(wallet);
  const hash = await client.writeContract({ address: WIF, abi: erc20Abi, functionName: "approve", args: [COURIER as Address, amount] });
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error("The approval reverted.");
  return hash;
}

/** The relay's short reasons, in plain words for the result line. */
const REASONS: Record<string, string> = {
  fee_too_low: "the WIF gas fee just changed. Check it and send again",
  expired: "it timed out, and nothing left your wallet",
  bad_nonce: "another send from your wallet went first. Send again",
  low_balance: "not enough WIF for the amount plus the fee",
  low_allowance: "WIF gas needs turning on again (Settings shows its limit)",
  bad_signature: "the signature didn't check out. Send again",
  bad_digest: "the signature didn't check out. Send again",
  wrong_fee_to: "the WIF gas settings changed. Send again",
  interrupted: "the relay was interrupted, and nothing left your wallet. Send again",
};
export const courierReason = (r: string | null | undefined) => (r && REASONS[r]) || r || "the relay couldn't send it";

export type CourierResult = { status: "sent" | "failed" | "expired" | "pending" | "sending"; tx: string | null; reason: string | null };

/** Signs a Send, queues it, and waits up to 2 minutes for the keeper to land it. */
export async function sendViaCourier(wallet: ConnectedWallet, cfg: CourierConfig, to: string, amount: bigint): Promise<CourierResult> {
  if (!COURIER || !cfg.enabled || !cfg.feeTo) throw new Error("Paying gas in WIF is off right now. Pay gas in ETH instead.");
  const from = wallet.address.toLowerCase() as Address;
  const nonce = await publicClient.readContract({ address: COURIER as Address, abi: courierAbi, functionName: "nonces", args: [from] });
  const deadline = BigInt(Math.floor(Date.now() / 1000) + Math.min(cfg.deadlineSec || 600, 600));
  const message = { from, to: to.toLowerCase() as Address, amount, fee: BigInt(cfg.fee), feeTo: cfg.feeTo as Address, nonce, deadline };
  const client = await walletClientFor(wallet);
  const sig = await client.signTypedData({
    account: from,
    domain: { name: "C0LONY Courier", version: "1", chainId: chain.id, verifyingContract: COURIER as Address },
    types: TYPES,
    primaryType: "Send",
    message,
  });
  const queued = await getJson<{ id: string; status: CourierResult["status"] }>("/api/courier", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      network: NETWORK_NAME,
      send: { ...message, amount: String(amount), fee: String(message.fee), nonce: String(nonce), deadline: String(deadline) },
      sig,
    }),
  }).catch((e: Error) => {
    if (e.message === "fee_too_low") void invalidate();
    throw new Error(courierReason(e.message));
  });
  const until = Date.now() + 120_000;
  for (;;) {
    const s = await getJson<CourierResult & { id: string }>(`/api/courier/status?id=${queued.id}`).catch(() => null);
    if (s && (s.status === "sent" || s.status === "failed" || s.status === "expired")) return s;
    if (Date.now() > until) return s ?? { status: "pending", tx: null, reason: null };
    await new Promise((r) => setTimeout(r, 2000));
  }
}
