// Feed events waiting to be acknowledged by the app. Kept on disk so a crash or an app outage loses nothing.
// Delivery is at-least-once: the server ignores duplicates (unique tx + logIndex), so resending is always safe.
import type { FeedEvent } from "./decode.ts";
import { signedPost, type FetchFn } from "./signed.ts";
import { JsonStore } from "../state.ts";

const BATCH = 200;
const MAX_BACKOFF_MS = 5 * 60_000;

export type OutboxOptions = {
  file: string;
  url: string; // .../api/feed/ingest
  secret: string;
  fetchFn?: FetchFn;
  now?: () => number; // ms
  log?: (msg: string) => void;
};

const keyOf = (e: FeedEvent) => `${e.tx}:${e.logIndex}`;

export class Outbox {
  private readonly store: JsonStore<FeedEvent[]>;
  private queue: FeedEvent[];
  private readonly o: Required<Omit<OutboxOptions, "file">>;
  private failures = 0;
  private retryAt = 0;
  private flushing = false;
  private timer?: NodeJS.Timeout;

  constructor(opts: OutboxOptions) {
    this.store = new JsonStore<FeedEvent[]>(opts.file, []);
    this.queue = this.store.read();
    this.o = { fetchFn: fetch, now: Date.now, log: () => {}, ...opts };
  }

  get size(): number {
    return this.queue.length;
  }

  add(events: FeedEvent[]): void {
    if (events.length === 0) return;
    const have = new Set(this.queue.map(keyOf));
    for (const e of events) {
      if (have.has(keyOf(e))) continue;
      have.add(keyOf(e));
      this.queue.push(e);
    }
    this.store.write(this.queue);
  }

  /** Sends everything queued in batches of 200. Returns true when the queue is empty. Never throws. */
  async flush(): Promise<boolean> {
    if (this.flushing || this.queue.length === 0) return this.queue.length === 0;
    if (this.o.now() < this.retryAt) return false;
    this.flushing = true;
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.slice(0, BATCH);
        const res = await signedPost(this.o.fetchFn, this.o.url, this.o.secret, { events: batch }, Math.floor(this.o.now() / 1000));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Drop only what was sent; events added during the request stay queued.
        const sent = new Set(batch.map(keyOf));
        this.queue = this.queue.filter((e) => !sent.has(keyOf(e)));
        this.store.write(this.queue);
        this.failures = 0;
      }
      return true;
    } catch (err) {
      this.failures++;
      const wait = Math.min(MAX_BACKOFF_MS, 2000 * 2 ** (this.failures - 1));
      this.retryAt = this.o.now() + wait;
      this.o.log(`feed: delivery failed (${err instanceof Error ? err.message : err}), ${this.queue.length} queued, retry in ${Math.round(wait / 1000)}s`);
      return false;
    } finally {
      this.flushing = false;
    }
  }

  start(intervalMs = 3000): void {
    this.timer = setInterval(() => void this.flush(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
