// Number and time formatting for screen copy. No em dashes; middle dots separate facts.

export const RES = 1_000_000_000n; // leaves and sugar are stored with 9 decimals
const WEI = 1_000_000_000_000_000_000n;

const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const two = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** WIF in wei → "2,310" (whole WIF), or up to 2 decimals under 10. */
export function fmtWif(wei: bigint): string {
  const whole = wei / WEI;
  if (whole >= 10n) return int.format(whole);
  return two.format(Number(wei) / 1e18);
}

/** Leaves or sugar in RES units → whole units, rounded down: "240". */
export function fmtRes(units: bigint): string {
  return int.format(units / RES);
}

export function fmtInt(n: number | bigint): string {
  return int.format(n);
}

/** ETH in wei → "0.0012". */
export function fmtEth(wei: bigint): string {
  const n = Number(wei) / 1e18;
  return n === 0 ? "0" : n < 0.0001 ? "<0.0001" : n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

/** Seconds → "41h 12m", "12m", "3d 4h". Never negative. */
export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d >= 3) return `${d}d ${h}h`;
  if (d > 0 || h > 0) return `${d * 24 + h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** Unix seconds in the past → "2m ago", "3h ago", "2d ago". */
export function timeAgo(ts: number, now: number): string {
  const s = Math.max(0, now - ts);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function shortAddress(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

/** A handle for display: "@name" when X is linked, else the short address. */
export function displayName(address: string, xHandle?: string | null): string {
  return xHandle ? `@${xHandle}` : shortAddress(address);
}
