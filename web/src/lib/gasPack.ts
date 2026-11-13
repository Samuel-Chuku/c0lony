"use client";
// Swap WIF for gas (docs/design/2026-11-13-wif-for-gas.md). Offered only when a wallet has run out of ETH: the player
// pays WIF through the Courier (to the keeper wallet) and the keeper sends a small pack of ETH back.
// The Courier needs a one-time WIF approval, which costs a little ETH; a wallet with none first gets a one-time top-up
// for that approval from the keeper.
import { erc20Abi, type Address } from "viem";
import { publicClient } from "./chain";
import { approveCourier, COURIER, sendViaCourier, courierReason, type CourierConfig } from "./courier";
import { WIF } from "./game";
import { invalidate } from "./store";
import type { ConnectedWallet } from "@privy-io/react-auth";

/** Gas a WIF approval uses, with headroom for the L1 data part. */
const APPROVE_GAS = 120_000n;
/** Gas a raid launch uses: what "about N raids" counts in. */
export const RAID_GAS = 330_000n;
const DECLINE_KEY = "c0lony:gasOffer:declinedAt";
const DECLINE_MS = 86_400_000;

export type PackStep = "approval-gas" | "approving" | "signing" | "swapping";
export const STEP_LABEL: Record<PackStep, string> = {
  "approval-gas": "Getting gas for the approval…",
  approving: "Approving WIF…",
  signing: "Swapping…",
  swapping: "Swapping…",
};

/** "No thanks" hides the offer on this device for a day. */
export function declinedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DECLINE_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DECLINE_MS;
  } catch {
    return false;
  }
}
export function decline(): void {
  try {
    localStorage.setItem(DECLINE_KEY, String(Date.now()));
  } catch {
    // private mode: the offer just shows again next time
  }
}

async function waitForEth(address: Address, above: bigint, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 4000));
    if ((await publicClient.getBalance({ address }).catch(() => 0n)) > above) return true;
  }
  return false;
}

/** Buys one gas pack. Throws an Error with a plain-English message when it doesn't go through. */
export async function buyGasPack(
  wallet: ConnectedWallet, cfg: CourierConfig, getToken: () => Promise<string | null>, onStep: (s: PackStep) => void,
): Promise<{ wifTx: string | null; gasTx: string | null }> {
  if (!COURIER || !cfg.enabled || !cfg.feeTo || !cfg.gasPack) throw new Error("Swapping WIF for gas isn't available right now.");
  const me = wallet.address as Address;
  const price = BigInt(cfg.gasPack.wif);
  const need = price + BigInt(cfg.fee);
  const [wif, allowance] = await Promise.all([
    publicClient.readContract({ address: WIF, abi: erc20Abi, functionName: "balanceOf", args: [me] }),
    publicClient.readContract({ address: WIF, abi: erc20Abi, functionName: "allowance", args: [me, COURIER as Address] }),
  ]);
  if (wif < need) throw new Error("Not enough WIF for the swap and its fee.");

  if (allowance < need) {
    const [eth, gasPrice] = await Promise.all([publicClient.getBalance({ address: me }), publicClient.getGasPrice()]);
    if (eth < gasPrice * APPROVE_GAS) {
      onStep("approval-gas");
      const token = await getToken();
      if (!token) throw new Error("Sign in again to continue.");
      const res = await fetch("/api/gas/approval", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ wallet: me.toLowerCase() }),
        signal: AbortSignal.timeout(15_000),
      });
      const out = (await res.json().catch(() => ({}))) as { status?: string; message?: string };
      if (out.status !== "queued") throw new Error(out.message ?? "Couldn't get gas for the approval right now.");
      if (!(await waitForEth(me, eth, 120_000))) throw new Error("The approval gas hasn't arrived yet. Try again in a minute.");
    }
    onStep("approving");
    const amount = BigInt(cfg.approveAmount);
    await approveCourier(wallet, amount > need ? amount : need);
  }

  onStep("signing");
  const r = await sendViaCourier(wallet, cfg, cfg.feeTo, price, "gas");
  void invalidate();
  if (r.status === "sent" && r.gasTx) return { wifTx: r.tx, gasTx: r.gasTx };
  if (r.status === "sent") return { wifTx: r.tx, gasTx: null }; // WIF landed, ETH still on its way
  throw new Error(r.status === "expired" ? courierReason("expired") : r.status === "failed" ? courierReason(r.reason) : "It's taking longer than usual. Check your wallet in a minute.");
}
