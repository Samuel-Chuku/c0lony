"use client";
// Client for the app's own API (feed, profiles). Handles come from X via Privy, never typed by the player.
import { useQuery } from "./store";

export type FeedType =
  | "founded" | "named" | "fed" | "tended" | "built" | "assigned" | "sped_up" | "shielded" | "revived" | "collapsed"
  | "raid_launched" | "guarded" | "revealed" | "settled" | "collected" | "avenge_granted" | "paid"
  | "sponsored" | "season_ended" | "season_finalized" | "claimed" | "unclaimed_rolled" | "gift";

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

export type FeedFilter = "all" | "raids" | "mine" | "pot" | "burns";
/**
 * How a player shows up. Players who linked X show their X handle and picture. Everyone else shows the name they
 * set onchain (`name`) and the picture they uploaded, which the loader below puts in `xAvatar` so every avatar
 * on screen follows the same rule.
 */
export type XProfile = { xHandle: string | null; xAvatar: string | null; name?: string; avatar?: string };

/** Applies the rule: X first; otherwise the chosen name and the uploaded picture. */
export function resolveProfile(p: XProfile | null | undefined): XProfile | null {
  if (!p) return null;
  if (p.xHandle) return { xHandle: p.xHandle, xAvatar: p.xAvatar };
  return { xHandle: null, xAvatar: p.avatar ?? null, name: p.name };
}

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

export const fetchFeed = (url: string) =>
  getJson<{ events: FeedEvent[] }>(url).then((r) => {
    // A player who just named their colony: show the new name everywhere without waiting for the cache to age.
    for (const e of r.events) {
      const w = e.type === "named" ? e.actors[0]?.toLowerCase() : undefined;
      if (w && profileCache.has(w) && (profileAt.get(w) ?? 0) < e.ts * 1000) reloadProfile(w); // read before the rename
    }
    return r.events;
  });

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

// ---- X profiles, batched: every avatar on screen asks once, one request per tick. Entries go stale after
// PROFILE_TTL_MS and are fetched again in the background (the old value shows meanwhile), so a name or picture
// another player sets reaches tabs that stay open for days.
const PROFILE_TTL_MS = 5 * 60_000;
const profileCache = new Map<string, XProfile | null>();
const profileAt = new Map<string, number>();
const setProfile = (w: string, p: XProfile | null) => {
  profileCache.set(w, p);
  profileAt.set(w, Date.now());
};
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
    .then((r) => wallets.forEach((w) => setProfile(w, resolveProfile(r.profiles[w]))))
    .catch(() => wallets.forEach((w) => { if (!profileCache.has(w)) setProfile(w, null); else profileAt.set(w, Date.now()); }))
    .finally(() => subscribers.forEach((s) => s()));
}

export function requestProfile(wallet: string): XProfile | null | undefined {
  const w = wallet.toLowerCase();
  const fresh = Date.now() - (profileAt.get(w) ?? 0) < PROFILE_TTL_MS;
  if (!fresh && !pending.has(w)) {
    pending.add(w);
    if (!timer) timer = setTimeout(flush, 50);
  }
  return profileCache.has(w) ? profileCache.get(w) : undefined;
}

/** Profiles for many wallets at once (100 per request), filling the shared cache. Missing = no profile. */
export async function loadProfiles(wallets: string[]): Promise<Map<string, XProfile | null>> {
  const out = new Map<string, XProfile | null>();
  const need = [...new Set(wallets.map((w) => w.toLowerCase()))];
  for (const w of need) if (profileCache.has(w) && Date.now() - (profileAt.get(w) ?? 0) < PROFILE_TTL_MS) out.set(w, profileCache.get(w)!);
  const todo = need.filter((w) => !out.has(w));
  for (let i = 0; i < todo.length; i += 100) {
    const part = todo.slice(i, i + 100);
    const r = await getJson<{ profiles: Record<string, XProfile> }>(`/api/profiles?wallets=${part.join(",")}`);
    for (const w of part) {
      const p = resolveProfile(r.profiles[w]);
      setProfile(w, p);
      out.set(w, p);
    }
  }
  if (todo.length) subscribers.forEach((s) => s());
  return out;
}

/** Forgets a wallet's cached profile and loads it again (after a rename or a new picture). */
export function reloadProfile(wallet: string) {
  const w = wallet.toLowerCase();
  profileAt.delete(w); // stale now: the next read fetches it again, keeping the old value on screen meanwhile
  requestProfile(w);
  subscribers.forEach((s) => s());
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
  // Only an X account replaces what is shown; otherwise keep the chosen name and picture, and re-read them.
  for (const w of out.wallets as string[]) {
    if (out.xHandle) setProfile(w, { xHandle: out.xHandle, xAvatar: out.xAvatar });
    else reloadProfile(w);
  }
  subscribers.forEach((s) => s());
  return out;
}
