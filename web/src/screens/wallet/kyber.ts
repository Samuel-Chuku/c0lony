// KyberSwap Aggregator (EVM swaps): GET /routes then POST /route/build. ETH in, WIF out, 0.5% fee on the input
// paid to the treasury. Field names follow the Kyber docs (evm-swaps page).
import { CONFIG, NETWORK } from "../../config";
import { WIF } from "../../lib/game";

export const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
export const FEE_BPS = 50;
export const SLIPPAGE_BPS = 50;

export type RouteSummary = { amountIn: string; amountOut: string; amountInUsd?: string; amountOutUsd?: string } & Record<string, unknown>;
export type Quote = { routeSummary: RouteSummary; routerAddress: string; amountIn: bigint; amountOut: bigint; impactPct: number | null };
export type Built = { to: `0x${string}`; data: `0x${string}`; value: bigint };

const headers = { "x-client-id": CONFIG.kyber.clientId };

async function unwrap<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as { code?: number; message?: string; data?: T } | null;
  if (!res.ok || !body || body.code !== 0 || !body.data) {
    const code = body?.code;
    if (code === 4008 || code === 4010) throw new Error("No route for that amount right now. Try a different amount.");
    if (code === 4009) throw new Error("That amount is too large for one swap. Try a smaller amount.");
    throw new Error("The swap service didn't answer. Try again in a moment.");
  }
  return body.data;
}

export async function getQuote(amountInWei: bigint, signal?: AbortSignal): Promise<Quote> {
  const params = new URLSearchParams({
    tokenIn: NATIVE,
    tokenOut: WIF,
    amountIn: amountInWei.toString(),
    chargeFeeBy: "currency_in",
    isInBps: "true",
    feeAmount: String(FEE_BPS),
    feeReceiver: NETWORK.contracts.treasury,
    source: CONFIG.kyber.clientId,
  });
  const res = await fetch(`${CONFIG.kyber.apiUrl}/routes?${params}`, { headers, signal });
  const data = await unwrap<{ routerAddress: string; routeSummary: RouteSummary }>(res);
  const s = data.routeSummary;
  const inUsd = Number(s.amountInUsd);
  const outUsd = Number(s.amountOutUsd);
  const impactPct = inUsd > 0 && Number.isFinite(outUsd) ? Math.max(0, ((inUsd - outUsd) / inUsd) * 100) : null;
  return { routeSummary: s, routerAddress: data.routerAddress, amountIn: BigInt(s.amountIn), amountOut: BigInt(s.amountOut), impactPct };
}

export async function buildSwap(quote: Quote, wallet: string): Promise<Built> {
  const res = await fetch(`${CONFIG.kyber.apiUrl}/route/build`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      routeSummary: quote.routeSummary,
      sender: wallet,
      recipient: wallet,
      slippageTolerance: SLIPPAGE_BPS,
      source: CONFIG.kyber.clientId,
    }),
  });
  const d = await unwrap<{ routerAddress: string; data: string; transactionValue: string }>(res);
  return { to: d.routerAddress as `0x${string}`, data: d.data as `0x${string}`, value: BigInt(d.transactionValue) };
}
