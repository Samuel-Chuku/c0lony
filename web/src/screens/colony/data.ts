"use client";
// Shared reads and small derivations for the Colony screen and the Welcome-back pop-up.
import { useGameConfig, usePrices, useProfile, readColony, type ColonyView, type GameConfig } from "../../lib/game";
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
};

const ready = (last: bigint, cooldown: number, now: number) => last === 0n || now >= Number(last) + cooldown;

/** What Tend would collect now: trail and farm output plus every hand forage that is home. */
export function waitingNow(view: ColonyView, cfg: GameConfig, now: number): Waiting {
  const d = view.data;
  const leafCd = Number(cfg.leafForageCooldown);
  const sugarCd = Number(cfg.sugarForageCooldown);
  const leafReady = ready(d.lastLeafForage, leafCd, now);
  const sugarReady = ready(d.lastSugarForage, sugarCd, now);
  const leaves = view.pendingLeaves + (leafReady ? 6n * RES : 0n);
  const sugar = view.pendingSugar + (sugarReady ? BigInt(3 + Math.floor((d.workers * 8) / 100)) * RES : 0n);
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
  };
}
