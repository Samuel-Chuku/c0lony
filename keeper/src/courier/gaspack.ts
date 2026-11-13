// Gas packs: a player who has run out of ETH pays WIF through the Courier (to this keeper wallet), and the keeper sends
// a small, fixed pack of ETH back. Design: docs/design/2026-11-13-wif-for-gas.md.
//
// This file holds the price (a KyberSwap quote for the pack, plus a markup, within sanity bounds) and the small
// chain interface the relay uses to pay packs exactly once. The relay (relay.ts) does the checks and the bookkeeping.
import { NATIVE } from "./swap.ts";

const E = 10n ** 18n;

export type PackPrice = { wei: bigint; wif: bigint };

export interface PackPricer {
  /** The current pack and its WIF price, or null when packs should not be offered (no fresh, sane quote). */
  current(): Promise<PackPrice | null>;
}

/** What the relay needs from the chain to judge a buyer and pay a pack exactly once. */
export interface PackChain {
  ethBalance(address: string): Promise<bigint>;
  gasPrice(): Promise<bigint>;
  /** Signs an ETH transfer from the keeper WITHOUT broadcasting it, so its hash can be saved first. */
  signEth(to: string, value: bigint): Promise<{ hash: string; raw: string; nonce: number }>;
  /** Broadcasts a signed transaction. Resending the same bytes can never pay twice (same nonce). */
  broadcast(raw: string): Promise<void>;
  /** The keeper's mined transaction count: once it passes a saved nonce, that nonce can never be used again. */
  keeperNonce(): Promise<number>;
}

/** WIF per pack: the quote plus the markup, rounded UP to a whole WIF. */
export function packWif(quotedWif: bigint, markupBps: number): bigint {
  const raw = (quotedWif * BigInt(10_000 + markupBps) + 9_999n) / 10_000n;
  return ((raw + E - 1n) / E) * E;
}

/**
 * Prices a pack from a quote function (KyberSwap on mainnet, a fixed number on testnet), at most every `refreshSec`.
 * A failed refresh keeps the last good price until it is `staleSec` old; outside [minWif, maxWif] there is no price.
 */
export class QuotedPackPricer implements PackPricer {
  private price: PackPrice | null = null;
  private pricedAt = 0;
  private triedAt = Number.NEGATIVE_INFINITY;
  private readonly o: {
    quoteWif: (wei: bigint) => Promise<bigint>; wei: bigint; markupBps: number; minWif: bigint; maxWif: bigint;
    refreshSec: number; staleSec: number; now: () => number; log: (m: string) => void;
  };

  constructor(opts: {
    quoteWif: (wei: bigint) => Promise<bigint>; wei: bigint; markupBps: number; minWif: bigint; maxWif: bigint;
    refreshSec?: number; staleSec?: number; now?: () => number; log?: (m: string) => void;
  }) {
    this.o = { refreshSec: 600, staleSec: 1800, now: () => Math.floor(Date.now() / 1000), log: () => {}, ...opts };
  }

  async current(): Promise<PackPrice | null> {
    const now = this.o.now();
    if (now - this.triedAt >= this.o.refreshSec) {
      this.triedAt = now;
      try {
        const wif = packWif(await this.o.quoteWif(this.o.wei), this.o.markupBps);
        if (wif < this.o.minWif || wif > this.o.maxWif) {
          this.price = null;
          this.o.log(`gas pack: quote ${wif / E} WIF is outside ${this.o.minWif / E}-${this.o.maxWif / E}, packs paused`);
        } else {
          if (!this.price || this.price.wif !== wif) this.o.log(`gas pack: ${wif / E} WIF for ${this.o.wei} wei`);
          this.price = { wei: this.o.wei, wif };
          this.pricedAt = now;
        }
      } catch (err) {
        this.o.log(`gas pack: quote failed, keeping the last price for now (${err instanceof Error ? err.message : String(err)})`);
      }
    }
    return this.price && now - this.pricedAt <= this.o.staleSec ? this.price : null;
  }
}

/** KyberSwap: how much WIF `wei` of ETH buys right now (the same API the app's Get WIF sheet uses). */
export function kyberWifForEth(fetchFn: typeof fetch, apiUrl: string, clientId: string, wif: string) {
  return async (wei: bigint): Promise<bigint> => {
    const params = new URLSearchParams({ tokenIn: NATIVE, tokenOut: wif, amountIn: wei.toString(), source: clientId });
    const res = await fetchFn(`${apiUrl}/routes?${params}`, { headers: { "x-client-id": clientId }, signal: AbortSignal.timeout(15_000) });
    const body = (await res.json().catch(() => null)) as { code?: number; data?: { routeSummary?: { amountOut?: string } } } | null;
    const out = body?.data?.routeSummary?.amountOut;
    if (!res.ok || body?.code !== 0 || !out) throw new Error(`KyberSwap answered ${res.status} (code ${body?.code ?? "?"})`);
    return BigInt(out);
  };
}
