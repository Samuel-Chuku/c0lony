// Time-based push jobs (hungry queen, foragers home, avenge ending, season ending), kept on disk.
// Jobs are deduped by key, so a restart or an event replay never sends the same push twice.
import { JsonStore } from "../state.ts";

/** Anything more than this late (downtime, long outage) is dropped rather than sent stale. */
export const MAX_LATE_SEC = 30 * 60;
const SENT_KEEP = 5000;

export type PushPayload = { title: string; body: string; url: string; tag: string };

export type Job = {
  key: string;
  at: number; // unix seconds
  wallet: string;
  pref: string;
  payload: PushPayload;
  /** Extra facts the fire step needs (for example the raider an avenge is against). */
  meta?: Record<string, string>;
};

type State = {
  jobs: Job[];
  sent: string[]; // keys already delivered or dropped, newest last
  // Highest event position (block * 1e6 + logIndex) seen per "<wallet>:<group>", so replaying an old event
  // can never replace the jobs of a newer one.
  latest: Record<string, number>;
};

/** Return "sent" or "skip" when handled; throw to retry on the next tick. */
export type FireFn = (job: Job) => Promise<"sent" | "skip">;

export class Scheduler {
  private readonly store: JsonStore<State>;
  private state: State;
  private readonly fire: FireFn;
  private readonly now: () => number; // unix seconds
  private readonly log: (msg: string) => void;
  private sentSet: Set<string>;
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(opts: { file: string; fire: FireFn; now?: () => number; log?: (msg: string) => void }) {
    this.store = new JsonStore<State>(opts.file, { jobs: [], sent: [], latest: {} });
    this.state = this.store.read();
    this.sentSet = new Set(this.state.sent);
    this.fire = opts.fire;
    this.now = opts.now ?? (() => Math.floor(Date.now() / 1000));
    this.log = opts.log ?? (() => {});
  }

  get pending(): readonly Job[] {
    return this.state.jobs;
  }

  /** Records that `position` is the newest event for this wallet+group. False means a newer one was already seen. */
  advance(wallet: string, group: string, position: number): boolean {
    const k = `${wallet}:${group}`;
    if ((this.state.latest[k] ?? -1) > position) return false;
    this.state.latest[k] = position;
    return true;
  }

  schedule(job: Job): boolean {
    if (this.sentSet.has(job.key) || this.state.jobs.some((j) => j.key === job.key)) return false;
    this.state.jobs.push(job);
    this.save();
    return true;
  }

  /** Removes pending jobs for `wallet` whose pref is in `prefs` (a newer fed/tended supersedes them). */
  cancel(wallet: string, prefs: string[], keyPrefix?: string): void {
    const before = this.state.jobs.length;
    this.state.jobs = this.state.jobs.filter(
      (j) => !(j.wallet === wallet && prefs.includes(j.pref) && (!keyPrefix || j.key.startsWith(keyPrefix))),
    );
    if (this.state.jobs.length !== before) this.save();
  }

  /** Cancels every pending job whose key starts with the prefix, any wallet. */
  cancelPrefix(keyPrefix: string): void {
    const before = this.state.jobs.length;
    this.state.jobs = this.state.jobs.filter((j) => !j.key.startsWith(keyPrefix));
    if (this.state.jobs.length !== before) this.save();
  }

  /** Marks a key as used. False if it was already used (the caller must then not send). */
  claim(key: string): boolean {
    if (this.sentSet.has(key)) return false;
    this.markSent(key);
    this.save();
    return true;
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const now = this.now();
      for (const job of [...this.state.jobs].sort((a, b) => a.at - b.at)) {
        if (job.at > now) continue;
        if (now - job.at > MAX_LATE_SEC) {
          this.log(`push: dropping ${job.key}, ${Math.round((now - job.at) / 60)} min late`);
          this.finish(job);
          continue;
        }
        try {
          await this.fire(job);
          this.finish(job);
        } catch (err) {
          // Keep it; retried next tick until it is too late.
          this.log(`push: ${job.key} failed (${err instanceof Error ? err.message : err}), will retry`);
        }
      }
    } finally {
      this.ticking = false;
    }
  }

  start(intervalMs = 30_000): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private finish(job: Job): void {
    this.state.jobs = this.state.jobs.filter((j) => j.key !== job.key);
    this.markSent(job.key);
    this.save();
  }

  private markSent(key: string): void {
    this.sentSet.add(key);
    this.state.sent.push(key);
    if (this.state.sent.length > SENT_KEEP) {
      for (const k of this.state.sent.splice(0, this.state.sent.length - SENT_KEEP)) this.sentSet.delete(k);
    }
  }

  private save(): void {
    this.store.write(this.state);
  }
}
