"use client";
// Shared reads and small derivations for the Colony screen and the Welcome-back pop-up.
import { FORAGE_FREE_CAP, useGameConfig, usePrices, useProfile, readColony, type ColonyView, type GameConfig } from "../../lib/game";
import { RES } from "../../lib/format";
import { useQuery } from "../../lib/store";
import { useVoterProof } from "../../lib/voter";

/** Full colony view (hand-forage timestamps and uncollected output), which getProfile doesn't carry. */
export function useColonyView(colonyId: bigint | null | undefined) {
  return useQuery(colonyId ? `colonyview:${colonyId}` : null, () => readColony(colonyId!), 30_000);
}

/** Found and feed prices as this player pays them: Voter's Pass discount applied when held or provable. */
export function usePlayerPrices(addr: string | null | undefined) {
  const prices = usePrices(addr);
  const cfg = useGameConfig();
  const voter = useVoterProof(addr);
  const profile = useProfile(addr);
  const hasPass = !!profile.data?.hasVoterPass;
  const eligible = !hasPass && !!voter.data?.eligible;
  const pct = BigInt(cfg.data?.voterDiscountPct ?? 20);
  const disc = (p: bigint) => (eligible ? (p * (100n - pct)) / 100n : p);
  return {
    found: prices.data ? disc(prices.data.found) : undefined,
    feed: prices.data ? disc(prices.data.feed) : undefined,
    proof: voter.data?.proof ?? [],
    passApplies: hasPass || eligible,
  };
}

export type Waiting = {
  leaves: bigint;
  sugar: bigint;
  leafReady: boolean;
  sugarReady: boolean;
  /** Seconds until the next hand forage is ready; null when both are home. */
  nextIn: number | null;
  nothing: boolean;
  /** The pantry: forage trips waiting, per kind (0 to PANTRY_TRIPS), and what one trip brings. */
  leafTrips: number;
  sugarTrips: number;
  trip: { leaves: number; sugar: number };
  /** Seconds until the next trip of each kind lands in the pantry; null when that side is full. */
  leafNext: number | null;
  sugarNext: number | null;
  /** Trail and farm output waiting, collected by the same Tend. */
  built: { leaves: bigint; sugar: bigint };
};

/** Missed forage trips wait in the pantry, at most this many of each kind; more are lost (contract FORAGE_BANK). */
export const PANTRY_TRIPS = 2;

/** Forage trips waiting since `last`: the first is ready at once, missed trips wait, at most 2. */
const tripsWaiting = (last: bigint, cooldown: number, now: number) =>
  last === 0n ? 1 : Math.min(PANTRY_TRIPS, Math.max(0, Math.floor((now - Number(last)) / cooldown)));

/** What one forage trip brings with `free` free ants (the first 30 count): leaves 6 + 0.5 each, sugar 4 + 0.3 each, rounded up. */
export function forageTrip(free: number) {
  const f = Math.min(Math.max(0, free), FORAGE_FREE_CAP);
  return { leaves: 6 + Math.ceil((f * 5) / 10), sugar: 4 + Math.ceil((f * 3) / 10) };
}

/** What Tend would collect now: trail and farm output plus every hand forage that is home. */
export function waitingNow(view: ColonyView, cfg: GameConfig, now: number): Waiting {
  const d = view.data;
  const leafCd = Number(cfg.leafForageCooldown);
  const sugarCd = Number(cfg.sugarForageCooldown);
  const leafTrips = tripsWaiting(d.lastLeafForage, leafCd, now);
  const sugarTrips = tripsWaiting(d.lastSugarForage, sugarCd, now);
  const leafReady = leafTrips > 0;
  const sugarReady = sugarTrips > 0;
  const trip = forageTrip(view.idle);
  const leaves = view.pendingLeaves + BigInt(leafTrips * trip.leaves) * RES;
  const sugar = view.pendingSugar + BigInt(sugarTrips * trip.sugar) * RES;
  const waits: number[] = [];
  if (!leafReady) waits.push(Number(d.lastLeafForage) + leafCd - now);
  if (!sugarReady) waits.push(Number(d.lastSugarForage) + sugarCd - now);
  return {
    leaves,
    sugar,
    leafReady,
    sugarReady,
    nextIn: waits.length ? Math.max(0, Math.min(...waits)) : null,
    nothing: leaves < RES && sugar < RES,
    leafTrips,
    sugarTrips,
    trip,
    leafNext: leafTrips >= PANTRY_TRIPS || d.lastLeafForage === 0n ? null : Math.max(0, Number(d.lastLeafForage) + (leafTrips + 1) * leafCd - now),
    sugarNext: sugarTrips >= PANTRY_TRIPS || d.lastSugarForage === 0n ? null : Math.max(0, Number(d.lastSugarForage) + (sugarTrips + 1) * sugarCd - now),
    built: { leaves: view.pendingLeaves, sugar: view.pendingSugar },
  };
}
