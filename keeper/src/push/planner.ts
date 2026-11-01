// Decides which pushes follow from game events: immediate ones (raided, result) and timed ones (queued in the Scheduler).
// Copy rules: title starts "C0LONY", no emoji, no em dashes, resources are leaves and sugar.
import type { GameReader } from "../chain.ts";
import type { FeedEvent } from "../feed/decode.ts";
import { JsonStore } from "../state.ts";
import type { PushClient } from "./client.ts";
import { MAX_LATE_SEC, Scheduler, type FireFn, type Job, type PushPayload } from "./scheduler.ts";

const HOUR = 3600;
const QUEEN_LIFE = 72 * HOUR; // an unfed queen starves 72 h after founding or her last feeding
const DEFAULT_LEAF_FORAGE = 6 * HOUR; // fallback if getConfig() cannot be read

/** RES units (1e9 = 1) as a short number: "84", "1.5". */
export function fmtRes(raw: string): string {
  const v = BigInt(raw);
  const whole = v / 1_000_000_000n;
  const frac = Number(v % 1_000_000_000n) / 1e9;
  const s = frac === 0 ? "" : frac.toFixed(2).replace(/0+$/, "").replace(/\.$/, "").slice(1);
  return `${whole}${s}`;
}

const pos = (e: FeedEvent) => e.block * 1_000_000 + e.logIndex;
const payload = (body: string, url: string, tag: string): PushPayload => ({ title: "C0LONY", body, url, tag });

export class PushPlanner {
  private readonly o: {
    sched: Scheduler;
    client: PushClient;
    chain: GameReader;
    rosterFile: string;
    now: () => number;
    log: (m: string) => void;
  };
  private readonly roster: JsonStore<Record<string, string[]>>; // season -> wallets with a living colony
  private rosterData: Record<string, string[]>;
  private leafCooldown?: number;

  constructor(opts: { sched: Scheduler; client: PushClient; chain: GameReader; rosterFile: string; now?: () => number; log?: (m: string) => void }) {
    this.o = { now: () => Math.floor(Date.now() / 1000), log: () => {}, ...opts };
    this.roster = new JsonStore(opts.rosterFile, {});
    this.rosterData = this.roster.read();
  }

  /** The scheduler's fire step: re-check what can have changed since scheduling, then send. */
  fire: FireFn = async (job: Job) => {
    let body = job.payload.body;
    if (job.pref === "avenge") {
      const raider = job.meta?.raider ?? "";
      const { available } = await this.o.chain.avengeAvailable(job.wallet, raider);
      if (!available) return "skip"; // already used
      body = `Your free avenge on ${await this.o.client.label(raider)} ends in 2h.`;
    }
    await this.o.client.notify(job.wallet, job.pref, { ...job.payload, body });
    return "sent";
  };

  async onEvent(e: FeedEvent): Promise<void> {
    try {
      await this.handle(e);
    } catch (err) {
      this.o.log(`push: could not plan for ${e.type} ${e.tx}:${e.logIndex} (${err instanceof Error ? err.message : err})`);
    }
  }

  private async handle(e: FeedEvent): Promise<void> {
    const { sched } = this.o;
    const wallet = e.actors[0];
    switch (e.type) {
      case "founded": {
        this.addToRoster(Number(e.data.season), wallet);
        this.careJobs(e, wallet, "hungry", e.ts + QUEEN_LIFE);
        await this.forageJob(e, wallet);
        await this.seasonJob(Number(e.data.season), wallet);
        break;
      }
      case "fed":
        this.careJobs(e, wallet, "hungry", Number(e.data.fedUntil));
        break;
      case "tended":
        await this.forageJob(e, wallet);
        break;
      case "collapsed":
        for (const g of ["hungry", "forage"]) sched.advance(wallet, g, pos(e));
        sched.cancel(wallet, ["hungry12", "hungry2", "forage"]);
        this.removeFromRoster(wallet);
        break;
      case "raid_launched": {
        if (this.stale(e.ts)) break;
        const defender = String(e.data.defender);
        if (!sched.claim(`raided:${e.data.raidId}`)) break;
        const hours = Math.max(1, Math.ceil((Number(e.data.guardDeadline) - this.o.now()) / HOUR));
        const who = await this.o.client.label(String(e.data.raider));
        await this.o.client.notify(defender, "raided", payload(`${who} is marching on your colony. Guard within ${hours}h.`, "/?tab=raids", `raid-${e.data.raidId}`));
        break;
      }
      case "settled": {
        if (this.stale(e.ts)) break;
        const id = String(e.data.raidId);
        const won = e.data.outcome === "raider_won";
        const loot = `${fmtRes(String(e.data.lootAmount))} ${e.data.lootResource ?? "leaves"}`;
        const url = `/report?raid=${id}`;
        const raiderBody = won ? `Raid result is in: you took ${loot}.` : e.data.outcome === "guarded" ? "Raid result is in: they had guarded the right resource." : "Raid result is in: your raid failed.";
        const defenderBody = won ? `You were raided: lost ${loot}.` : "You held them off.";
        for (const [w, pref, body] of [
          [String(e.data.raider), "result", raiderBody],
          [String(e.data.defender), "result", defenderBody],
        ] as const) {
          if (!sched.claim(`result:${id}:${w}`)) continue;
          await this.o.client.notify(w, pref, payload(body, url, `result-${id}`));
        }
        break;
      }
      case "avenge_granted": {
        const at = Number(e.data.expiresAt) - 2 * HOUR;
        sched.schedule({
          key: `avenge:${e.data.raidId}`,
          at,
          wallet: String(e.data.defender),
          pref: "avenge",
          payload: payload("", "/?tab=raids", `avenge-${e.data.raidId}`),
          meta: { raider: String(e.data.raider) },
        });
        break;
      }
    }
  }

  /** Called when SeasonEndChanged arrives: the old 24 h reminders are wrong, so queue new ones. */
  async onSeasonEndChanged(season: number, newEnd: number): Promise<void> {
    this.o.sched.cancelPrefix(`season:${season}:`);
    for (const w of this.rosterData[String(season)] ?? []) this.queueSeason(season, newEnd, w);
  }

  private async seasonJob(season: number, wallet: string): Promise<void> {
    this.queueSeason(season, await this.o.chain.seasonEnd(season), wallet);
  }

  private queueSeason(season: number, end: number, wallet: string): void {
    this.o.sched.schedule({
      key: `season:${season}:${end}:${wallet}`,
      at: end - 24 * HOUR,
      wallet,
      pref: "season",
      payload: payload(`Season ${season} ends in 24h.`, "/?tab=live", `season-${season}`),
    });
  }

  /** hungry12 and hungry2 for one fed/founded event; a newer event for the same wallet replaces older jobs. */
  private careJobs(e: FeedEvent, wallet: string, group: string, fedUntil: number): void {
    const { sched } = this.o;
    if (!sched.advance(wallet, group, pos(e))) return;
    sched.cancel(wallet, ["hungry12", "hungry2"]);
    sched.schedule({ key: `hungry12:${wallet}:${fedUntil}`, at: fedUntil - 12 * HOUR, wallet, pref: "hungry12", payload: payload("Your queen is hungry in 12h. Feed her to keep the colony.", "/", "hungry") });
    sched.schedule({ key: `hungry2:${wallet}:${fedUntil}`, at: fedUntil - 2 * HOUR, wallet, pref: "hungry2", payload: payload("Your queen starves in 2h.", "/", "hungry") });
  }

  private async forageJob(e: FeedEvent, wallet: string): Promise<void> {
    const { sched } = this.o;
    if (!sched.advance(wallet, "forage", pos(e))) return;
    sched.cancel(wallet, ["forage"]);
    this.leafCooldown ??= await this.o.chain.leafForageCooldown().catch(() => DEFAULT_LEAF_FORAGE);
    sched.schedule({ key: `forage:${wallet}:${e.ts}`, at: e.ts + this.leafCooldown, wallet, pref: "forage", payload: payload("Foragers are home. Tend to collect.", "/", "forage") });
  }

  private stale(ts: number): boolean {
    return this.o.now() - ts > MAX_LATE_SEC;
  }

  private addToRoster(season: number, wallet: string): void {
    const list = (this.rosterData[String(season)] ??= []);
    if (!list.includes(wallet)) list.push(wallet);
    this.roster.write(this.rosterData);
  }

  private removeFromRoster(wallet: string): void {
    for (const k of Object.keys(this.rosterData)) this.rosterData[k] = this.rosterData[k].filter((w) => w !== wallet);
    this.roster.write(this.rosterData);
  }
}
