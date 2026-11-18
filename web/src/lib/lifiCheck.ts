// The safety check on a LI.FI quote (docs/design/2026-11-18-lifi-cross-chain-wif.md), kept free of imports so the
// tests can load it directly. A quote passes only if it delivers WIF on Robinhood Chain to the player's own address,
// spends exactly what the player chose, and approves and calls only the LI.FI contract pinned for that chain.
export type Expect = { srcId: number; lifi: string; token: string; native: boolean; amount: bigint; player: string; home: number; wif: string };

const lower = (s: unknown) => String(s ?? "").toLowerCase();
const big = (s: unknown) => { try { return BigInt(String(s ?? "")); } catch { return -1n; } };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function quotePasses(d: any, x: Expect): boolean {
  const a = d?.action ?? {};
  const t = d?.transactionRequest ?? {};
  const approval = d?.estimate?.approvalAddress;
  return (
    Number(a.toChainId) === x.home && lower(a.toToken?.address) === lower(x.wif) &&
    lower(a.toAddress) === lower(x.player) && lower(a.fromAddress) === lower(x.player) &&
    Number(a.fromChainId) === x.srcId && lower(a.fromToken?.address) === lower(x.token) && big(a.fromAmount) === x.amount &&
    Number(t.chainId) === x.srcId && lower(t.to) === lower(x.lifi) &&
    (x.native || lower(approval) === lower(x.lifi))
  );
}
