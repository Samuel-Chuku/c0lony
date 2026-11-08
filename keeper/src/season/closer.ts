// Closes each season as soon as its end time passes: endSeason, then the ranking in batches, so the pot is final
// and players can claim within minutes. Both calls are open to anyone and the pot checks the order itself, so the
// keeper can't change who gets paid; it only saves someone from doing it by hand. Safe to restart: everything is
// read from the chain on each tick.
import { createWalletClient, type Address, type Hash, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { colonyGameAbi, seasonPotAbi } from "../abi.ts";
import { makeChain, rpcTransport } from "../chain.ts";
import type { Config } from "../config.ts";

export type PotSeason = { ended: boolean; finalized: boolean; target: number; submitted: number };
export type ColonyResult = { id: bigint; season: number; score: bigint; fedTwice: boolean; qualifies: boolean };

export interface CloserChain {
  now(): Promise<number>; // chain time, unix seconds
  currentSeason(): Promise<number>;
  seasonEnd(season: number): Promise<number>;
  potSeason(season: number): Promise<PotSeason>;
  nextColonyId(): Promise<bigint>;
  colonyResult(id: bigint): Promise<ColonyResult>;
  endSeason(season: number): Promise<boolean>; // true when the tx succeeded
  submitRanking(season: number, ids: bigint[]): Promise<boolean>;
}

export const RANK_BATCH = 50;

/** The order SeasonPot.submitRanking accepts: qualifying by score (high first, ties lower id), then the rest by id. */
export function rankOrder(rows: ColonyResult[]): bigint[] {
  return [...rows]
    .sort((a, b) => {
      if (a.qualifies !== b.qualifies) return a.qualifies ? -1 : 1;
      if (a.qualifies && a.score !== b.score) return a.score > b.score ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    })
    .map((r) => r.id);
}

export class SeasonCloser {
  private busy = false;
  private timer?: NodeJS.Timeout;
  private lastClosed = 0; // highest season known to be finalized
  private readonly o: { chain: CloserChain; log: (m: string) => void };
  constructor(o: { chain: CloserChain; log: (m: string) => void }) {
    this.o = o;
  }

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const { chain, log } = this.o;
      const now = await chain.now();
      const current = await chain.currentSeason();
      // Look at every season up to the current one that hasn't been seen finalized.
      for (let s = Math.max(1, this.lastClosed + 1); s <= current; s++) {
        if (now < (await chain.seasonEnd(s))) break; // this season (and later ones) are still running
        let ps = await chain.potSeason(s);
        if (!ps.ended) {
          log(`season ${s}: ended, closing it`);
          if (!(await chain.endSeason(s))) return;
          ps = await chain.potSeason(s);
        }
        if (!ps.finalized) {
          const rows: ColonyResult[] = [];
          const next = await chain.nextColonyId();
          for (let id = 1n; id < next; id++) {
            const r = await chain.colonyResult(id);
            if (r.season === s && r.fedTwice) rows.push(r);
          }
          const order = rankOrder(rows);
          if (order.length !== ps.target) {
            log(`season ${s}: ALERT found ${order.length} colonies fed twice, the pot expects ${ps.target}; not submitting`);
            return;
          }
          for (let i = ps.submitted; i < order.length; i += RANK_BATCH) {
            const batch = order.slice(i, i + RANK_BATCH);
            if (!(await chain.submitRanking(s, batch))) return;
            log(`season ${s}: ranked ${Math.min(i + RANK_BATCH, order.length)} of ${order.length}`);
          }
          ps = await chain.potSeason(s);
          if (!ps.finalized) return;
          log(`season ${s}: final, claims are open`);
        }
        this.lastClosed = s;
      }
    } catch (e) {
      this.o.log(`season: close failed (${e instanceof Error ? e.message : e}), will retry`);
    } finally {
      this.busy = false;
    }
  }

  start(intervalMs = 60_000): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

// ---- viem implementation

export function viemCloserChain(cfg: Config, client: PublicClient): CloserChain {
  const game = cfg.colonyGameAddress as Address;
  const pot = cfg.seasonPotAddress as Address;
  const wallet = createWalletClient({
    account: privateKeyToAccount(cfg.keeperPrivateKey as Hash),
    chain: makeChain(cfg),
    transport: rpcTransport(cfg.rpcUrls),
  });
  const send = async (fn: () => Promise<Hash>) => (await client.waitForTransactionReceipt({ hash: await fn() })).status === "success";
  return {
    now: async () => Number((await client.getBlock()).timestamp),
    currentSeason: async () => Number(await client.readContract({ address: game, abi: colonyGameAbi, functionName: "currentSeason" })),
    seasonEnd: async (s) => Number(await client.readContract({ address: game, abi: colonyGameAbi, functionName: "seasonEnd", args: [s] })),
    potSeason: async (s) => {
      const r = (await client.readContract({ address: pot, abi: seasonPotAbi, functionName: "seasons", args: [s] })) as readonly unknown[];
      // (pot, claimed, sumAll, sumTop, lastKey, target, submitted, qualified, topCount, finalizedAt, ended, finalized, rolled)
      return { target: Number(r[5]), submitted: Number(r[6]), ended: Boolean(r[10]), finalized: Boolean(r[11]) };
    },
    nextColonyId: async () => BigInt(await client.readContract({ address: game, abi: colonyGameAbi, functionName: "nextColonyId" })),
    colonyResult: async (id) => {
      const [season, score, fedTwice, qualifies] = await client.readContract({ address: game, abi: colonyGameAbi, functionName: "colonyResult", args: [id] });
      return { id, season: Number(season), score, fedTwice, qualifies };
    },
    endSeason: (s) => send(() => wallet.writeContract({ address: pot, abi: seasonPotAbi, functionName: "endSeason", args: [s] })),
    submitRanking: (s, ids) => send(() => wallet.writeContract({ address: pot, abi: seasonPotAbi, functionName: "submitRanking", args: [s, ids] })),
  };
}
