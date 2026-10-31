"use client";
// Client for the app's own API (feed, profiles). Handles come from X via Privy, never typed by the player.
import { useQuery } from "./store";

export type FeedType =
  | "founded" | "fed" | "tended" | "built" | "assigned" | "sped_up" | "shielded" | "revived" | "collapsed"
  | "raid_launched" | "guarded" | "revealed" | "settled" | "collected" | "avenge_granted" | "paid"
  | "sponsored" | "season_ended" | "season_finalized" | "claimed" | "unclaimed_rolled";

export type FeedEvent = {
  id: number;
  block: number;
  tx: string;
  logIndex: number;
  ts: number;
  type: FeedType;
  actors: string[];
  data: Record<string, string | number | boolean | null>;
};

export type FeedFilter = "all" | "raids" | "mine" | "pot";
export type XProfile = { xHandle: string | null; xAvatar: string | null };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status === 404 ? "The live feed isn't switched on yet." : `The server answered ${res.status}.`);
  return (await res.json()) as T;
}

export function feedUrl(type: FeedFilter, opts: { wallet?: string; before?: number; limit?: number; since?: number } = {}) {
  const q = new URLSearchParams({ type });
  if (opts.wallet) q.set("wallet", opts.wallet.toLowerCase());
  if (opts.before) q.set("before", String(opts.before));
  if (opts.since) q.set("since", String(opts.since));
  q.set("limit", String(opts.limit ?? 20));
  return `/api/feed?${q}`;
}

export const fetchFeed = (url: string) => getJson<{ events: FeedEvent[] }>(url).then((r) => r.events);

export function useFeed(type: FeedFilter, wallet?: string | null, limit = 20, intervalMs = 15_000) {
  const url = type === "mine" && !wallet ? null : feedUrl(type, { wallet: wallet ?? undefined, limit });
  return useQuery(url ? `feed:${url}` : null, () => fetchFeed(url!), intervalMs);
}

export function useFeedStats() {
  return useQuery("feed:stats", () => getJson<{ burnedWif: string; raidsToday: number }>("/api/feed/stats"), 30_000);
}

export type Summary = {
  since: number;
  rows: FeedEvent[];
  raided: number;
  defended: number;
  raidsWon: number;
  raidsLost: number;
  lostLeaves: string;
  lostSugar: string;
  wonLeaves: string;
  wonSugar: string;
  avenge: { raider: string; expiresAt: number; raidId: string } | null;
};

export const fetchSummary = (wallet: string, since: number) =>
  getJson<Summary>(`/api/feed/summary?wallet=${wallet.toLowerCase()}&since=${since}`);

// ---- X profiles, batched: every avatar on screen asks once, one request per tick.
const profileCache = new Map<string, XProfile | null>();
const pending = new Set<string>();
const subscribers = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const wallets = [...pending].slice(0, 100);
  wallets.forEach((w) => pending.delete(w));
  if (pending.size) timer = setTimeout(flush, 50);
  if (!wallets.length) return;
  getJson<{ profiles: Record<string, XProfile> }>(`/api/profiles?wallets=${wallets.join(",")}`)
    .then((r) => wallets.forEach((w) => profileCache.set(w, r.profiles[w] ?? null)))
    .catch(() => wallets.forEach((w) => profileCache.set(w, null)))
    .finally(() => subscribers.forEach((s) => s()));
}

export function requestProfile(wallet: string): XProfile | null | undefined {
  const w = wallet.toLowerCase();
  if (profileCache.has(w)) return profileCache.get(w);
  if (!pending.has(w)) {
    pending.add(w);
    if (!timer) timer = setTimeout(flush, 50);
  }
  return undefined;
}

export function subscribeProfiles(cb: () => void) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/** Saves this device's player's X profile server-side (verified through Privy). */
export async function postProfile(token: string): Promise<{ wallets: string[]; xHandle: string | null; xAvatar: string | null }> {
  const res = await fetch("/api/profile", { method: "POST", headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`The server answered ${res.status}.`);
  const out = await res.json();
  for (const w of out.wallets as string[]) profileCache.set(w, { xHandle: out.xHandle, xAvatar: out.xAvatar });
  subscribers.forEach((s) => s());
  return out;
}
