// Turns raw ColonyGame / SeasonPot logs into the FeedEvent rows the app stores (see the feed interface spec).
// Rule: nothing sealed ever reaches the feed. raid_launched and guarded carry no target or guard resource.
import { decodeEventLog, hexToString } from "viem";
import { colonyGameAbi, seasonPotAbi } from "../abi.ts";
import type { RawLog } from "../intake/types.ts";
import type { Rpc } from "../intake/rpc.ts";
import { JsonStore } from "../state.ts";

export type FeedType =
  | "founded" | "fed" | "tended" | "built" | "assigned" | "sped_up" | "shielded" | "revived" | "collapsed"
  | "raid_launched" | "guarded" | "revealed" | "settled" | "collected" | "avenge_granted" | "paid"
  | "sponsored" | "season_ended" | "season_finalized" | "claimed" | "unclaimed_rolled";

export type FeedData = Record<string, string | number | boolean | null>;

export type FeedEvent = {
  block: number;
  tx: string;
  logIndex: number;
  ts: number;
  type: FeedType;
  actors: string[];
  data: FeedData;
};

/** A decoded log before it becomes a feed row. Push and settle logic also read the non-feed events. */
export type RawEvent = { contract: "game" | "pot"; name: string; args: Record<string, any> };

export type RaidWallets = { raider: string; defender: string };

export type DecodeDeps = {
  gameAddress: string;
  potAddress: string;
  blockTime: (block: number) => Promise<number>;
  /** Fallback when a raid was not seen launching (reads raids(raidId) and the colony owners). */
  lookupRaid: (raidId: bigint) => Promise<RaidWallets | undefined>;
  directory: RaidDirectory;
};

const RESOURCE = ["none", "leaves", "sugar"] as const;
const OUTCOME = ["none", "raider_won", "raider_lost", "guarded"] as const;
const COLLECT_STATUS: Record<number, string> = { 4: "failed", 5: "refunded" };

const lc = (a: string) => a.toLowerCase();
const res = (n: number) => (n === 1 || n === 2 ? RESOURCE[n] : null);
/** bytes32 short ASCII strings are right-padded with zeros. */
export const ascii = (b: string) => hexToString(b as `0x${string}`, { size: 32 }).replace(/\0+$/, "");

/** raidId -> wallets, filled from raid_launched so revealed/collected rows can name their actors. Persisted across restarts. */
export class RaidDirectory {
  private readonly store: JsonStore<Record<string, RaidWallets>>;
  private readonly map: Record<string, RaidWallets>;

  constructor(path: string) {
    this.store = new JsonStore(path, {});
    this.map = this.store.read();
  }

  get(raidId: bigint): RaidWallets | undefined {
    return this.map[raidId.toString()];
  }

  set(raidId: bigint, w: RaidWallets): void {
    this.map[raidId.toString()] = w;
    this.store.write(this.map);
  }
}

/** Decodes one log with the ColonyGame or SeasonPot ABI. Returns null for anything else (treasury, unknown topics). */
export function decodeRaw(log: RawLog, gameAddress: string, potAddress: string): RawEvent | null {
  const a = lc(log.address);
  const isGame = a === lc(gameAddress);
  if (!isGame && a !== lc(potAddress)) return null;
  try {
    const d = decodeEventLog({
      abi: isGame ? colonyGameAbi : seasonPotAbi,
      data: log.data as `0x${string}`,
      topics: log.topics as [`0x${string}`],
    });
    return { contract: isGame ? "game" : "pot", name: d.eventName, args: (d.args ?? {}) as Record<string, any> };
  } catch {
    return null;
  }
}

/** Small cached block-timestamp reader on top of the existing Rpc class. */
export class BlockTimes {
  private readonly cache = new Map<number, number>();
  private readonly rpc: Rpc;

  constructor(rpc: Rpc) {
    this.rpc = rpc;
  }

  get = async (block: number): Promise<number> => {
    const hit = this.cache.get(block);
    if (hit !== undefined) return hit;
    const b = await this.rpc.call<{ timestamp: string } | null>("eth_getBlockByNumber", ["0x" + block.toString(16), false]);
    if (!b) throw new Error(`block ${block} not found`);
    const ts = Number(BigInt(b.timestamp));
    if (this.cache.size > 2000) this.cache.clear();
    this.cache.set(block, ts);
    return ts;
  };
}

const dedupe = (xs: string[]) => [...new Set(xs.map(lc))];

/** Decodes a log into a feed row, or null if the event is not part of the feed. */
export async function decodeLog(log: RawLog, deps: DecodeDeps): Promise<FeedEvent | null> {
  const ev = decodeRaw(log, deps.gameAddress, deps.potAddress);
  if (!ev) return null;
  const mapped = await mapEvent(ev, deps);
  if (!mapped) return null;
  const block = Number(BigInt(log.blockNumber));
  return {
    block,
    tx: lc(log.transactionHash),
    logIndex: Number(BigInt(log.logIndex)),
    ts: await deps.blockTime(block),
    type: mapped.type,
    actors: dedupe(mapped.actors),
    data: mapped.data,
  };
}

async function mapEvent(
  ev: RawEvent,
  deps: DecodeDeps,
): Promise<{ type: FeedType; actors: string[]; data: FeedData } | null> {
  const a = ev.args;
  const id = (x: bigint) => Number(x); // colony ids and seasons fit in a double
  if (ev.contract === "pot") {
    switch (ev.name) {
      case "Sponsored":
        return { type: "sponsored", actors: [a.sponsor], data: { season: id(a.season), amount: String(a.amount), name: a.name } };
      case "SeasonEnded":
        return { type: "season_ended", actors: [], data: { season: id(a.season), pot: String(a.pot), coloniesToRank: id(a.coloniesToRank) } };
      case "SeasonFinalized":
        return { type: "season_finalized", actors: [], data: { season: id(a.season), qualified: id(a.qualified), topCount: id(a.topCount) } };
      case "Claimed":
        return { type: "claimed", actors: [a.player], data: { season: id(a.season), colonyId: id(a.colonyId), amount: String(a.amount) } };
      case "UnclaimedRolled":
        return { type: "unclaimed_rolled", actors: [], data: { fromSeason: id(a.fromSeason), toSeason: id(a.toSeason), amount: String(a.amount) } };
      default:
        return null;
    }
  }
  switch (ev.name) {
    case "ColonyFounded":
      return { type: "founded", actors: [a.owner], data: { colonyId: id(a.colonyId), season: id(a.season), seasonDay: id(a.seasonDay) } };
    case "QueenFed":
      return {
        type: "fed",
        actors: [a.owner],
        data: {
          colonyId: id(a.colonyId), workers: id(a.workersAfter), born: id(a.born), died: id(a.died),
          scoreAdded: String(a.scoreAdded), totalScore: String(a.totalScore), fedUntil: id(a.fedUntil),
        },
      };
    case "Tended":
      return { type: "tended", actors: [a.owner], data: { colonyId: id(a.colonyId), leaves: String(a.leavesGained), sugar: String(a.sugarGained) } };
    case "Built":
      return {
        type: "built",
        actors: [a.owner],
        data: { colonyId: id(a.colonyId), building: ascii(a.building), leavesCost: String(a.leavesCost), sugarCost: String(a.sugarCost), count: id(a.newCount) },
      };
    case "WorkersAssigned":
      return { type: "assigned", actors: [a.owner], data: { colonyId: id(a.colonyId), trailWorkers: id(a.trailWorkers), farmWorkers: id(a.farmWorkers), idle: id(a.idle) } };
    case "SpedUp":
      return { type: "sped_up", actors: [a.owner], data: { colonyId: id(a.colonyId), forage: res(a.forage) } };
    case "Shielded":
      return { type: "shielded", actors: [a.owner], data: { colonyId: id(a.colonyId), until: id(a.until) } };
    case "Revived":
      return { type: "revived", actors: [a.owner], data: { colonyId: id(a.colonyId) } };
    case "ColonyCollapsed":
      return { type: "collapsed", actors: [a.owner], data: { colonyId: id(a.colonyId) } };
    case "RaidLaunched":
      deps.directory.set(a.raidId, { raider: lc(a.raiderOwner), defender: lc(a.defenderOwner) });
      return {
        type: "raid_launched",
        actors: [a.raiderOwner, a.defenderOwner],
        // No target: it stays sealed until Revealed.
        data: {
          raidId: String(a.raidId), raider: lc(a.raiderOwner), defender: lc(a.defenderOwner),
          raiderColony: id(a.raider), defenderColony: id(a.defender), soldiers: id(a.soldiers),
          guardDeadline: id(a.guardDeadline), isAvenge: Boolean(a.isAvenge),
        },
      };
    case "Guarded":
      // The guarded resource is deliberately dropped.
      return { type: "guarded", actors: [a.owner], data: { raidId: String(a.raidId), defender: lc(a.owner) } };
    case "Revealed": {
      const w = await raidWallets(a.raidId, deps);
      return {
        type: "revealed",
        actors: w ? [w.raider, w.defender] : [],
        data: { raidId: String(a.raidId), target: res(a.target), round: id(a.round), roundTime: id(a.roundTime) },
      };
    }
    case "RaidSettled":
      return {
        type: "settled",
        actors: [a.raiderOwner, a.defenderOwner],
        data: {
          raidId: String(a.raidId), raider: lc(a.raiderOwner), defender: lc(a.defenderOwner), outcome: OUTCOME[a.outcome] ?? "none",
          roll: String(a.roll), lootResource: res(a.lootResource), lootAmount: String(a.lootAmount),
          soldiersLost: id(a.soldiersLost), round: id(a.round),
        },
      };
    case "RaidCollected": {
      const w = await raidWallets(a.raidId, deps);
      return {
        type: "collected",
        actors: w ? [w.raider, w.defender] : [],
        data: { raidId: String(a.raidId), status: COLLECT_STATUS[a.status] ?? "failed", soldiersLost: id(a.soldiersLost) },
      };
    }
    case "AvengeGranted":
      return {
        type: "avenge_granted",
        actors: [a.defender, a.raider],
        data: { raidId: String(a.raidId), defender: lc(a.defender), raider: lc(a.raider), expiresAt: id(a.expiresAt) },
      };
    case "Paid":
      return {
        type: "paid",
        actors: [a.player],
        data: {
          colonyId: id(a.colonyId), action: ascii(a.action), amount: String(a.amount),
          toPot: String(a.toPot), burned: String(a.burned), toTreasury: String(a.toTreasury),
        },
      };
    default:
      return null;
  }
}

async function raidWallets(raidId: bigint, deps: DecodeDeps): Promise<RaidWallets | undefined> {
  const known = deps.directory.get(raidId);
  if (known) return known;
  try {
    const w = await deps.lookupRaid(raidId);
    if (w) deps.directory.set(raidId, w);
    return w;
  } catch {
    return undefined;
  }
}
