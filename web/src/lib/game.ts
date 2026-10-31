"use client";
// Chain reads for the screens. Everything is read through useQuery so screens share requests.
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { NETWORK } from "../config";
import { colonyGameAbi, erc20Abi, seasonPotAbi } from "./abi";
import { publicClient } from "./chain";
import { useQuery } from "./store";

export const GAME = NETWORK.contracts.colonyGame as Address;
export const POT = NETWORK.contracts.seasonPot as Address;
export const WIF = NETWORK.contracts.wif as Address;
export const DEPLOYED = GAME.length === 42;

// Enums as numbers, matching ColonyGame.sol
export const Status = { None: 0, Alive: 1, Starving: 2, Collapsed: 3, SeasonOver: 4 } as const;
export const Resource = { None: 0, Leaves: 1, Sugar: 2 } as const;
export const RaidStatus = { None: 0, Sealed: 1, Revealed: 2, Settled: 3, Failed: 4, Refunded: 5 } as const;
export const Outcome = { None: 0, RaiderWon: 1, RaiderLost: 2, Guarded: 3 } as const;

const game = { address: GAME, abi: colonyGameAbi } as const;
const pot = { address: POT, abi: seasonPotAbi } as const;

export type Profile = Awaited<ReturnType<typeof readProfile>>;
export type GameConfig = Awaited<ReturnType<typeof readConfig>>;
export type ColonyView = Awaited<ReturnType<typeof readColony>>;
export type Raid = Awaited<ReturnType<typeof readRaid>>;

export const readProfile = (player: Address) => publicClient.readContract({ ...game, functionName: "getProfile", args: [player] });
export const readConfig = () => publicClient.readContract({ ...game, functionName: "getConfig" });
export const readColony = (id: bigint) => publicClient.readContract({ ...game, functionName: "getColony", args: [id] });

export async function readRaid(raidId: bigint) {
  const r = await publicClient.readContract({ ...game, functionName: "raids", args: [raidId] });
  const [raider, defender, soldiers, status, guard, target, outcome, launchedAt, round, commitment] = r;
  return { id: raidId, raider, defender, soldiers, status, guard, target, outcome, launchedAt, round, commitment };
}

/** Unix seconds now, ticking every `ms`. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function useProfile(player: string | null | undefined) {
  return useQuery(player ? `profile:${player.toLowerCase()}` : null, () => readProfile(player as Address), 30_000);
}

export function useGameConfig() {
  return useQuery("config", readConfig, 300_000);
}

export function usePrices(player: string | null | undefined) {
  return useQuery(
    player ? `prices:${player.toLowerCase()}` : "prices:none",
    async () => {
      const [found, feed] = await publicClient.readContract({
        ...game,
        functionName: "pricesFor",
        args: [(player ?? "0x0000000000000000000000000000000000000000") as Address],
      });
      return { found, feed };
    },
    300_000,
  );
}

export function useBalances(player: string | null | undefined) {
  return useQuery(
    player ? `balances:${player.toLowerCase()}` : null,
    async () => {
      const [wif, eth, allowance] = await Promise.all([
        publicClient.readContract({ address: WIF, abi: erc20Abi, functionName: "balanceOf", args: [player as Address] }),
        publicClient.getBalance({ address: player as Address }),
        publicClient.readContract({ address: WIF, abi: erc20Abi, functionName: "allowance", args: [player as Address, GAME] }),
      ]);
      return { wif, eth, allowance };
    },
    30_000,
  );
}

export function useSeason() {
  return useQuery(
    "season",
    async () => {
      const season = await publicClient.readContract({ ...game, functionName: "currentSeason" });
      const [start, end, s] = await Promise.all([
        publicClient.readContract({ ...game, functionName: "seasonStart", args: [season] }),
        publicClient.readContract({ ...game, functionName: "seasonEnd", args: [season] }),
        publicClient.readContract({ ...pot, functionName: "seasons", args: [season] }),
      ]);
      return { season, start: Number(start), end: Number(end), pot: s[0] };
    },
    60_000,
  );
}

/** Day N of the season and its length in days, for "DAY 6 OF 21". */
export function seasonDays(start: number, end: number, now: number) {
  const total = Math.max(1, Math.round((end - start) / 86400));
  const day = Math.min(total, Math.max(1, Math.floor((now - start) / 86400) + 1));
  return { day, total };
}

export type ColonyRow = {
  id: bigint;
  owner: string;
  status: number;
  workers: number;
  capacity: number;
  idle: number;
  leaves: bigint; // RES, including uncollected output
  sugar: bigint;
  score: bigint;
  feedCount: number;
  fedUntil: number;
  shieldUntil: number;
  openIncoming: number;
  lastRaidLaunch: number;
  foundedAt: number;
};

/**
 * Every colony of the current season (one batched RPC request per 50 ids). Fine at hackathon scale; a real
 * index would come from the feed database later.
 */
export function useColonies() {
  return useQuery(
    "colonies",
    async () => {
      const [season, next] = await Promise.all([
        publicClient.readContract({ ...game, functionName: "currentSeason" }),
        publicClient.readContract({ ...game, functionName: "nextColonyId" }),
      ]);
      const ids: bigint[] = [];
      for (let i = 1n; i < next; i++) ids.push(i);
      const rows: ColonyRow[] = [];
      for (let i = 0; i < ids.length; i += 50) {
        const views = await Promise.all(ids.slice(i, i + 50).map(readColony));
        for (const v of views) {
          const c = v.data;
          if (c.season !== season || c.collapseMarked) continue;
          rows.push({
            id: v.id,
            owner: c.owner.toLowerCase(),
            status: v.status,
            workers: c.workers,
            capacity: Number(v.capacity),
            idle: v.idle,
            leaves: c.leaves + v.pendingLeaves,
            sugar: c.sugar + v.pendingSugar,
            score: c.score,
            feedCount: c.feedCount,
            fedUntil: Number(c.lastFed) + 72 * 3600,
            shieldUntil: Number(c.shieldUntil),
            openIncoming: c.openIncoming,
            lastRaidLaunch: Number(c.lastRaidLaunch),
            foundedAt: Number(c.foundedAt),
          });
        }
      }
      return rows;
    },
    60_000,
  );
}

/** Raids still open for a colony (as raider or defender), with their details. */
export function useActiveRaids(colonyId: bigint | null | undefined) {
  return useQuery(
    colonyId ? `raids:${colonyId}` : null,
    async () => {
      const ids = await publicClient.readContract({ ...game, functionName: "getActiveRaids", args: [colonyId!] });
      return Promise.all(ids.map(readRaid));
    },
    20_000,
  );
}

export function useRaid(raidId: bigint | null) {
  return useQuery(raidId !== null ? `raid:${raidId}` : null, () => readRaid(raidId!), 20_000);
}

export function useAvenge(defender: string | null | undefined, raider: string | null | undefined) {
  return useQuery(
    defender && raider ? `avenge:${defender.toLowerCase()}:${raider.toLowerCase()}` : null,
    async () => {
      const [ok, expiresAt] = await publicClient.readContract({
        ...game,
        functionName: "avengeAvailable",
        args: [defender as Address, raider as Address],
      });
      return { ok, expiresAt: Number(expiresAt) };
    },
    60_000,
  );
}

/** Raid range rule from launchRaid: neither colony more than double the other's workers. */
export function inRange(myWorkers: number, theirWorkers: number): boolean {
  return theirWorkers * 2 >= myWorkers && theirWorkers <= myWorkers * 2;
}

/** Building costs, from the contract formulas (whole leaves; a farm costs the same in sugar too). */
export function buildCosts(chambers: number, ants: number) {
  return {
    chamber: Math.max(10, chambers, Math.floor(ants / 5)),
    trail: Math.max(50, 2 * chambers, Math.floor(ants / 2)),
    farm: Math.max(25, chambers, Math.floor(ants / 4)),
  };
}

export const WORKERS_PER_CHAMBER = 5;
export const WORKERS_PER_BUILDING = 100;
export const MAX_SOLDIER_PCT = 30;
export const MIN_RAID_WORKERS = 10;

/** Most soldiers a colony can send: 30% of idle workers, rounded down. */
export function maxSoldiers(idle: number): number {
  return Math.floor((idle * MAX_SOLDIER_PCT) / 100);
}

/**
 * Estimated pot share now, using the payout rule in SeasonPot: half the pot split by score among qualifying
 * colonies, the other half by score among the top quarter. Qualifying is approximated as fed twice and alive.
 */
export function estimateShare(potWei: bigint, rows: ColonyRow[], colonyId: bigint): bigint {
  const q = rows.filter((r) => r.feedCount >= 2 && r.status === Status.Alive).sort((a, b) => (b.score > a.score ? 1 : b.score < a.score ? -1 : Number(a.id - b.id)));
  const me = q.findIndex((r) => r.id === colonyId);
  if (me < 0 || potWei === 0n) return 0n;
  const sumAll = q.reduce((s, r) => s + r.score, 0n);
  const top = Math.floor((q.length + 3) / 4);
  const sumTop = q.slice(0, top).reduce((s, r) => s + r.score, 0n);
  const score = q[me].score;
  if (score === 0n || sumAll === 0n) return 0n;
  const half = potWei / 2n;
  let amount = (half * score) / sumAll;
  if (me < top && sumTop > 0n) amount += ((potWei - half) * score) / sumTop;
  return amount;
}
