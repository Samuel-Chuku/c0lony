// Turns the WIF fees the Courier earns back into ETH for gas, in batches, through the KyberSwap aggregator (the same
// API the app's Get WIF sheet uses, here WIF in and native ETH out). Mainnet only.
//
// Safety: only when ETH is low and enough WIF has built up; at most one attempt an hour (kept across restarts); the
// router must be the one KyberSwap returned AND be on the allowlist below; the built route may not return less than
// 97% of the quote; the router is approved for exactly the swap amount; the swap is simulated before it is sent.
// A failure only logs, and the next try is an hour later.
import { JsonStore } from "../state.ts";

/** KyberSwap MetaAggregationRouterV2 on Robinhood Chain: returned by the Kyber API and recorded in docs/DEPLOYMENTS.md. */
export const KYBER_ROUTER_ALLOWLIST: readonly string[] = ["0x6131B5fae19EA4f9D964eAc0408E4408b66337b5"];
export const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const MIN_OUT_BPS = 9700n; // built output must be at least 97% of the quoted output
const SLIPPAGE_BPS = 100; // asked of Kyber, so the calldata's own minimum return is ~99% of the quote
const SWAP_EVERY_SEC = 3600;
const RESERVE_WIF = 10n ** 18n; // keep 1 WIF back

export type Quote = { routerAddress: string; routeSummary: Record<string, unknown>; amountOut: bigint };
export type Built = { routerAddress: string; data: string; value: bigint; amountOut: bigint; amountOutMin?: bigint };

export interface KyberApi {
  quote(tokenIn: string, amountIn: bigint): Promise<Quote>;
  build(quote: Quote, sender: string): Promise<Built>;
}

export interface SwapChain {
  ethBalance(): Promise<bigint>;
  wifBalance(): Promise<bigint>;
  allowance(spender: string): Promise<bigint>;
  /** Approves `spender` for exactly `amount` and waits for it. */
  approve(spender: string, amount: bigint): Promise<void>;
  /** Simulates the swap call; true when it would succeed. */
  simulate(to: string, data: string, value: bigint): Promise<boolean>;
  /** Sends the swap and waits; true on success. */
  send(to: string, data: string, value: bigint): Promise<boolean>;
}

export function shouldSwap(i: {
  enabled: boolean; ethBalance: bigint; wifBalance: bigint; below: bigint; minWif: bigint; now: number; lastAttempt: number;
}): boolean {
  return i.enabled && i.ethBalance < i.below && i.wifBalance >= i.minWif && i.now - i.lastAttempt >= SWAP_EVERY_SEC;
}

/** Why a quote/build pair must not be used, or null when it is fine. */
export function routeProblem(q: Quote, b: Built, allowlist: readonly string[] = KYBER_ROUTER_ALLOWLIST): string | null {
  const router = b.routerAddress.toLowerCase();
  if (!allowlist.some((a) => a.toLowerCase() === router)) return `router ${b.routerAddress} is not on the allowlist`;
  if (q.routerAddress.toLowerCase() !== router) return "the quote and the build name different routers";
  if (b.value !== 0n) return "the swap would send ETH (it should only spend WIF)";
  const floor = (q.amountOut * MIN_OUT_BPS) / 10_000n;
  if (b.amountOut < floor) return "the built route returns less than 97% of the quote";
  if (b.amountOutMin !== undefined && b.amountOutMin < floor) return "the swap's minimum return is under 97% of the quote";
  return null;
}

export class CourierSwapper {
  private readonly o: {
    kyber: KyberApi; chain: SwapChain; store: JsonStore<{ lastAttempt: number }>; keeper: string; wif: string;
    enabled: boolean; below: bigint; minWif: bigint; allowlist: readonly string[]; now: () => number; log: (m: string) => void;
  };

  constructor(opts: {
    kyber: KyberApi; chain: SwapChain; store: JsonStore<{ lastAttempt: number }>; keeper: string; wif: string;
    enabled: boolean; below: bigint; minWif: bigint; allowlist?: readonly string[]; now?: () => number; log?: (m: string) => void;
  }) {
    this.o = { allowlist: KYBER_ROUTER_ALLOWLIST, now: () => Math.floor(Date.now() / 1000), log: () => {}, ...opts };
  }

  async maybeSwap(): Promise<void> {
    if (!this.o.enabled) return;
    const now = this.o.now();
    const lastAttempt = this.o.store.read().lastAttempt;
    if (now - lastAttempt < SWAP_EVERY_SEC) return;
    const [ethBalance, wifBalance] = await Promise.all([this.o.chain.ethBalance(), this.o.chain.wifBalance()]);
    if (!shouldSwap({ enabled: true, ethBalance, wifBalance, below: this.o.below, minWif: this.o.minWif, now, lastAttempt })) return;
    // From here on this counts as an attempt, win or lose: the next one is an hour away.
    this.o.store.write({ lastAttempt: now });
    const amount = wifBalance - RESERVE_WIF;
    try {
      const quote = await this.o.kyber.quote(this.o.wif, amount);
      const built = await this.o.kyber.build(quote, this.o.keeper);
      const problem = routeProblem(quote, built, this.o.allowlist);
      if (problem) return void this.o.log(`courier swap: not sent, ${problem}`);
      if ((await this.o.chain.allowance(built.routerAddress)) < amount) await this.o.chain.approve(built.routerAddress, amount);
      if (!(await this.o.chain.simulate(built.routerAddress, built.data, built.value))) {
        return void this.o.log("courier swap: not sent, the simulation failed");
      }
      const ok = await this.o.chain.send(built.routerAddress, built.data, built.value);
      this.o.log(`courier swap: ${ok ? "swapped" : "reverted"} ${amount} wei of WIF for about ${quote.amountOut} wei of ETH`);
    } catch (err) {
      this.o.log(`courier swap: failed, will retry in an hour (${err instanceof Error ? err.message : String(err)})`);
    }
  }
}

type Json = { code?: number; message?: string; data?: Record<string, unknown> };

/** Kyber aggregator over HTTP: GET /routes then POST /route/build, field names as in the app's wallet/kyber.ts. */
export function httpKyber(fetchFn: typeof fetch, apiUrl: string, clientId: string): KyberApi {
  const headers = { "x-client-id": clientId };
  const data = async (res: Response): Promise<Record<string, unknown>> => {
    const body = (await res.json().catch(() => null)) as Json | null;
    if (!res.ok || !body || body.code !== 0 || !body.data) throw new Error(`KyberSwap answered ${res.status} (code ${body?.code ?? "?"})`);
    return body.data;
  };
  return {
    async quote(tokenIn, amountIn) {
      const params = new URLSearchParams({ tokenIn, tokenOut: NATIVE, amountIn: amountIn.toString(), source: clientId });
      const d = await data(await fetchFn(`${apiUrl}/routes?${params}`, { headers }));
      const s = d.routeSummary as Record<string, unknown>;
      return { routerAddress: String(d.routerAddress), routeSummary: s, amountOut: BigInt(String(s.amountOut)) };
    },
    async build(quote, sender) {
      const res = await fetchFn(`${apiUrl}/route/build`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          routeSummary: quote.routeSummary, sender, recipient: sender, slippageTolerance: SLIPPAGE_BPS, source: clientId,
        }),
      });
      const d = await data(res);
      return {
        routerAddress: String(d.routerAddress),
        data: String(d.data),
        value: BigInt(String(d.transactionValue ?? "0")),
        amountOut: BigInt(String(d.amountOut)),
        amountOutMin: d.amountOutMin !== undefined ? BigInt(String(d.amountOutMin)) : undefined,
      };
    },
  };
}
