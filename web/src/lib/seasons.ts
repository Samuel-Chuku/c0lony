"use client";
// Finished seasons: results generated from the chain by scripts/season-snapshot.ts into public/season-data/<n>.json.
// A finished season never changes except for claims, which come live from the feed.
import { useQuery } from "./store";
import { useFeed } from "./api";

export type PastColony = {
  id: number; owner: string; name: string | null; foundedAt: number; foundTx: string;
  rank: number | null; top: boolean; qualifies: boolean; fedTwice: boolean; alive: boolean;
  score: number; feeds: number; workers: number; born: number; died: number;
  tends: number; leaves: number; sugar: number; builds: number; chambers: number; farms: number; trails: number;
  raids: number; raidsWon: number; raidsLost: number; raidsGuarded: number; loot: number; soldiersLost: number; avenges: number;
  raided: number; guards: number; lootLost: number; shields: number; speedups: number; revives: number; collapses: number;
  wifSpent: number; wifBurned: number; wifToPot: number; lastFedAt: number;
  share: number; claimTx: string | null; claimedAt: number | null;
};
export type PastRaid = {
  id: string; raider: number; defender: number; raiderOwner: string; defenderOwner: string; outcome: number; roll: number;
  lootResource: "leaves" | "sugar"; loot: number; soldiers: number; soldiersLost: number; round: number; isAvenge: boolean;
  launchedAt: number; settledAt: number; tx: string;
};
export type SeasonResult = {
  season: number; start: number; end: number; endedAt: number; endTx: string; finalizedAt: number; finalizeTx: string; finalizedBlock: number;
  endChanges: { from: number; to: number; tx: string; at: number }[];
  contracts: { colonyGame: string; seasonPot: string; treasury: string; wif: string; drandVerifier: string };
  pot: { total: number; seed: number; fromPlay: number; half: number; topCount: number; qualified: number; sumAll: number; sumTop: number;
    sponsors: { by: string; name: string; amount: number; tx: string; at: number }[] };
  spend: { total: number; toPot: number; burned: number; toTreasury: number };
  byAction: Record<string, { count: number; wif: number }>;
  givenBack: { by: string; toSeason: number; name: string; amount: number; tx: string; at: number }[];
  totals: Record<string, number>;
  colonies: PastColony[];
  raids: PastRaid[];
  timeline: { at: number; kind: string; text: string; tx: string }[];
};
export type SeasonIndex = { seasons: { season: number; start: number; end: number; pot: number; colonies: number; winner: number | null }[] };

/** The wallet that founded genesis and runs it as C0LONY's own house colony. */
export const HOUSE = "0x4b11611cf7c90aec2003721d71107d7e1cbf37c2";
export const isHouse = (owner: string) => owner.toLowerCase() === HOUSE;

const get = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`The results file answered ${r.status}.`);
  return (await r.json()) as T;
};
export const useSeasonIndex = () => useQuery("seasons:index", () => get<SeasonIndex>("/season-data/index.json"), 3_600_000);
export const useSeasonResult = (n: number | null) =>
  useQuery(n ? `seasons:${n}` : null, () => get<SeasonResult>(`/season-data/${n}.json`), 3_600_000);

/** Claims made after the results file was written, from the live feed: colonyId → tx. */
export function useLiveClaims(season: number | null) {
  const feed = useFeed("pot", null, 100, 60_000).data ?? [];
  const out = new Map<number, { tx: string; amount: number; at: number }>();
  for (const e of feed) {
    if (e.type !== "claimed" || Number(e.data.season) !== season) continue;
    out.set(Number(e.data.colonyId), { tx: e.tx, amount: Number(BigInt(String(e.data.amount)) / 10n ** 12n) / 1e6, at: e.ts });
  }
  return out;
}

/** Claim status with the live feed on top of the file. */
export function claimOf(c: PastColony, live: Map<number, { tx: string; at: number }>) {
  const l = live.get(c.id);
  return { tx: c.claimTx ?? l?.tx ?? null, at: c.claimedAt ?? l?.at ?? null };
}

export type Award = { key: string; title: string; colony: PastColony; value: string; note: string };

const best = (cs: PastColony[], score: (c: PastColony) => number, tie?: (c: PastColony) => number) => {
  const pool = cs.filter((c) => score(c) > 0);
  if (!pool.length) return null;
  return [...pool].sort((a, b) => score(b) - score(a) || (tie ? tie(b) - tie(a) : 0) || a.id - b.id)[0];
};
const n0 = (n: number) => Math.round(n).toLocaleString("en-US");

/** Awards go to players: the house colony (genesis) is left out. */
export function awardsOf(r: SeasonResult): Award[] {
  const cs = r.colonies.filter((c) => !isHouse(c.owner));
  const out: Award[] = [];
  const push = (key: string, title: string, c: PastColony | null, value: string, note: string) => { if (c) out.push({ key, title, colony: c, value, note }); };
  const raider = best(cs, (c) => c.raidsWon, (c) => c.loot);
  push("raider", "Top raider", raider, raider ? `${raider.raidsWon} of ${raider.raids} raids won` : "", raider ? `${n0(raider.loot)} carried home` : "");
  const defender = best(cs, (c) => c.guards, (c) => -c.lootLost);
  push("defender", "Best defender", defender, defender ? `${defender.guards} raid${defender.guards === 1 ? "" : "s"} guarded` : "", defender ? `raided ${defender.raided} times, lost ${n0(defender.lootLost)}` : "");
  const tender = best(cs, (c) => c.tends);
  push("tender", "Most active tender", tender, tender ? `${n0(tender.tends)} tends` : "", tender ? `${n0(tender.leaves)} leaves · ${n0(tender.sugar)} sugar` : "");
  const builder = best(cs, (c) => c.builds);
  push("builder", "Master builder", builder, builder ? `${builder.builds} buildings` : "", builder ? `${builder.chambers} chambers · ${builder.farms} farms · ${builder.trails} trails` : "");
  const biggest = best(cs, (c) => c.workers);
  push("biggest", "Biggest colony", biggest, biggest ? `${n0(biggest.workers)} ants` : "", biggest ? `${n0(biggest.born)} born this season` : "");
  const loyal = best(cs, (c) => c.feeds, (c) => c.score);
  push("loyal", "Most devoted to the queen", loyal, loyal ? `fed ${loyal.feeds} times` : "", "every feeding adds to the score");
  const spender = best(cs, (c) => c.wifSpent);
  push("spender", "Biggest backer", spender, spender ? `${n0(spender.wifSpent)} WIF spent` : "", spender ? `${n0(spender.wifBurned)} WIF of it burned` : "");
  return out;
}

export const biggestRaid = (r: SeasonResult) => [...r.raids].filter((x) => x.outcome === 1 && !isHouse(x.raiderOwner)).sort((a, b) => b.loot - a.loot)[0] ?? null;

export const fmtW = (n: number, dp = 2) => n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: dp });
export const fmtDay = (ts: number) => new Date(ts * 1000).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
