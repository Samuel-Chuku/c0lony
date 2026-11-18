"use client";
// Get WIF with USDC, USDT or a gas token from another chain, through LI.FI (docs/design/2026-11-18-lifi-cross-chain-wif.md).
// The player signs on the source chain; LI.FI's bridge delivers WIF to the same address on Robinhood Chain.
// Every quote is checked before signing: it must deliver WIF on Robinhood Chain to the player's own address, and
// approve and call only the LI.FI contract pinned for that chain in config. Approvals are for the exact amount.
import { createPublicClient, createWalletClient, custom, erc20Abi, http, type Address, type Chain, type Hash } from "viem";
import { arbitrum, arc, base, bsc, hyperEvm, mainnet, monad, optimism, unichain } from "viem/chains";
import type { ConnectedWallet } from "@privy-io/react-auth";
import { CROSS_CHAIN } from "../config";
import { chain as home } from "./chain";
import { WIF } from "./game";
import { quotePasses } from "./lifiCheck";

export type CrossChain = (typeof CROSS_CHAIN.chains)[number];
export type CrossToken = CrossChain["tokens"][number];
export const NATIVE = "0x0000000000000000000000000000000000000000";
export const VIEM_CHAINS: Record<number, Chain> = {
  1: mainnet, 10: optimism, 56: bsc, 130: unichain, 143: monad, 999: hyperEvm, 5042: arc, 8453: base, 42161: arbitrum,
};
const USDT_ETHEREUM = "0xdac17f958d2ee523a2206206994597c13d831ec7"; // needs its allowance set to 0 before a new one

const clients = new Map<number, ReturnType<typeof createPublicClient>>();
export function clientFor(id: number) {
  let c = clients.get(id);
  if (!c) { c = createPublicClient({ chain: VIEM_CHAINS[id], transport: http(undefined, { timeout: 15_000 }) }); clients.set(id, c); }
  return c;
}

export async function balanceOf(src: CrossChain, token: CrossToken, owner: Address): Promise<bigint> {
  const c = clientFor(src.id);
  if (token.address === NATIVE) return c.getBalance({ address: owner });
  return c.readContract({ address: token.address as Address, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
}

export type LifiQuote = {
  src: CrossChain;
  token: CrossToken;
  amount: bigint;
  toAmount: bigint;
  toAmountMin: bigint;
  feesUsd: number;
  gasUsd: number;
  seconds: number;
  tool: string;
  tx: { to: Address; data: `0x${string}`; value: bigint; gas?: bigint };
  approval: Address | null;
};

const lower = (s: unknown) => String(s ?? "").toLowerCase();
const big = (s: unknown) => { try { return BigInt(String(s ?? "0")); } catch { return 0n; } };

/** A checked quote, or an Error with a plain-English message. */
export async function getLifiQuote(src: CrossChain, token: CrossToken, amount: bigint, player: Address, signal?: AbortSignal): Promise<LifiQuote> {
  const params = new URLSearchParams({
    fromChain: String(src.id), toChain: String(home.id), fromToken: token.address, toToken: WIF, fromAmount: amount.toString(),
    fromAddress: player, toAddress: player, slippage: String(CROSS_CHAIN.slippage), integrator: CROSS_CHAIN.integrator,
  });
  const res = await fetch(`${CROSS_CHAIN.api}/quote?${params}`, { signal: signal ?? AbortSignal.timeout(20_000) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (await res.json().catch(() => null)) as any;
  if (!res.ok || !d?.estimate) {
    const msg = String(d?.message ?? "");
    throw new Error(/amount|too (low|small)|minimum/i.test(msg) ? "That amount is too small to route. Try a little more." : "No route for that right now. Try another amount or token.");
  }
  const a = d.action ?? {};
  const t = d.transactionRequest ?? {};
  const e = d.estimate;
  const approval = token.address === NATIVE ? null : (e.approvalAddress as Address);
  // the checks that make this safe to sign
  const ok = quotePasses(d, { srcId: src.id, lifi: src.lifi, token: token.address, native: token.address === NATIVE, amount, player, home: home.id, wif: WIF });
  if (!ok) throw new Error("That route didn't pass C0LONY's safety checks, so nothing was sent. Try again.");
  return {
    src, token, amount,
    toAmount: big(e.toAmount), toAmountMin: big(e.toAmountMin),
    feesUsd: (e.feeCosts ?? []).reduce((s: number, f: { amountUSD?: string }) => s + Number(f.amountUSD ?? 0), 0),
    gasUsd: (e.gasCosts ?? []).reduce((s: number, g: { amountUSD?: string }) => s + Number(g.amountUSD ?? 0), 0),
    seconds: Number(e.executionDuration ?? 0),
    tool: String(d.toolDetails?.name ?? d.tool ?? "LI.FI"),
    tx: { to: t.to, data: t.data, value: big(t.value), gas: t.gasLimit ? big(t.gasLimit) : undefined },
    approval,
  };
}

export type SendStep = "switching" | "approving" | "sending";

/** Switches the wallet to the source chain, approves exactly the amount if needed, sends LI.FI's transaction and
 *  waits for it on the source chain. Returns the source transaction hash. Switches back to Robinhood Chain after. */
export async function sendLifi(wallet: ConnectedWallet, q: LifiQuote, onStep: (s: SendStep) => void): Promise<Hash> {
  const viemChain = VIEM_CHAINS[q.src.id];
  const player = wallet.address as Address;
  const pub = clientFor(q.src.id);
  try {
    onStep("switching");
    await wallet.switchChain(q.src.id);
    const client = createWalletClient({ account: player, chain: viemChain, transport: custom(await wallet.getEthereumProvider()) });
    if (q.approval) {
      const token = q.token.address as Address;
      const allowance = await pub.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [player, q.approval] });
      if (allowance < q.amount) {
        onStep("approving");
        if (allowance > 0n && lower(token) === USDT_ETHEREUM) {
          const zero = await client.writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [q.approval, 0n] });
          await pub.waitForTransactionReceipt({ hash: zero });
        }
        const hash = await client.writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [q.approval, q.amount] });
        const r = await pub.waitForTransactionReceipt({ hash });
        if (r.status !== "success") throw new Error("the approval reverted");
      }
    }
    onStep("sending");
    const hash = await client.sendTransaction({ to: q.tx.to, data: q.tx.data, value: q.tx.value, gas: q.tx.gas });
    const r = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
    if (r.status !== "success") throw new Error("the transaction reverted on " + q.src.name);
    return hash;
  } finally {
    wallet.switchChain(home.id).catch(() => {});
  }
}

export type LifiStatus = { state: "pending" | "done" | "partial" | "refunded" | "failed"; receivedTx: string | null; receivedAmount: bigint; receivedSymbol: string };

/** One status check. LI.FI says NOT_FOUND for a few seconds after sending; that reads as pending. */
export async function lifiStatus(hash: string, fromChain: number): Promise<LifiStatus> {
  const res = await fetch(`${CROSS_CHAIN.api}/status?${new URLSearchParams({ txHash: hash, fromChain: String(fromChain), toChain: String(home.id) })}`, { signal: AbortSignal.timeout(15_000) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (await res.json().catch(() => ({}))) as any;
  const status = String(d.status ?? "PENDING");
  const sub = String(d.substatus ?? "");
  const recv = d.receiving ?? {};
  const out = { receivedTx: recv.txHash ? String(recv.txHash) : null, receivedAmount: big(recv.amount), receivedSymbol: String(recv.token?.symbol ?? "WIF") };
  if (status === "DONE") return { state: sub === "REFUNDED" ? "refunded" : sub === "PARTIAL" ? "partial" : "done", ...out };
  if (status === "FAILED" || status === "INVALID") return { state: "failed", ...out };
  return { state: "pending", ...out };
}

// ---- the transfer in flight, kept in this browser so a reload keeps tracking it
export type Pending = { hash: string; fromChain: number; chainName: string; at: number; expected: string };
const KEY = (player: string) => `c0lony:lifi:${player.toLowerCase()}`;
export function savePending(player: string, p: Pending | null) {
  try { if (p) localStorage.setItem(KEY(player), JSON.stringify(p)); else localStorage.removeItem(KEY(player)); } catch { /* private mode */ }
}
export function loadPending(player: string): Pending | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY(player)) ?? "null") as Pending | null;
    return p && Date.now() - p.at < 24 * 3600_000 ? p : null;
  } catch { return null; }
}

export function explorerTx(chainId: number, hash: string): string {
  const url = VIEM_CHAINS[chainId]?.blockExplorers?.default.url;
  return url ? `${url}/tx/${hash}` : `https://scan.li.fi/tx/${hash}`;
}
