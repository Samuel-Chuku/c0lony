import { isRangeError, type Rpc } from "./rpc.ts";
import { JsonStore } from "../state.ts";
import { sortLogs, type EventSource, type LogFilter, type LogHandler } from "./types.ts";

export type PollerOptions = {
  rpc: Rpc;
  filter: LogFilter;
  /** First block to read when there is no saved cursor. */
  startBlock: number;
  /** Optional last block (for one-off backfills). */
  endBlock?: number;
  intervalMs: number;
  chunkBlocks: number;
  confirmations: number;
  /** Where the last fully processed block is saved, so restarts resume without gaps. */
  cursorFile: string;
  log?: (msg: string) => void;
};

/**
 * Fallback intake: reads eth_getLogs every `intervalMs` from the saved cursor to (head - confirmations),
 * in chunks. The cursor only advances after the handler has processed a chunk, so a crash re-delivers
 * rather than skips (handlers are idempotent).
 */
export class PollerSource implements EventSource {
  readonly kind = "poll" as const;
  private readonly opts: PollerOptions;
  private readonly cursor: JsonStore<{ lastBlock: number | null }>;
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopped = false;
  private chunk: number;

  constructor(opts: PollerOptions) {
    this.opts = opts;
    this.cursor = new JsonStore(opts.cursorFile, { lastBlock: null });
    this.chunk = opts.chunkBlocks;
  }

  async start(handler: LogHandler): Promise<void> {
    this.stopped = false;
    await this.tick(handler);
    const loop = () => {
      if (this.stopped) return;
      this.timer = setTimeout(async () => {
        await this.tick(handler);
        loop();
      }, this.opts.intervalMs);
    };
    loop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  /** One polling pass. Public so backfill scripts and tests can drive it directly. Returns the new cursor. */
  async tick(handler: LogHandler): Promise<number | null> {
    if (this.running) return this.cursor.read().lastBlock;
    this.running = true;
    try {
      const { rpc, filter, confirmations, endBlock } = this.opts;
      let head = (await rpc.blockNumber()) - confirmations;
      if (endBlock !== undefined) head = Math.min(head, endBlock);
      let from = (this.cursor.read().lastBlock ?? this.opts.startBlock - 1) + 1;

      while (from <= head && !this.stopped) {
        const to = Math.min(from + this.chunk - 1, head);
        let logs;
        try {
          logs = await rpc.getLogs(filter, from, to);
        } catch (err) {
          if (isRangeError(err) && this.chunk > 1) {
            this.chunk = Math.max(1, Math.floor(this.chunk / 2));
            this.opts.log?.(`getLogs range rejected; chunk now ${this.chunk} blocks`);
            continue;
          }
          throw err;
        }
        if (logs.length > 0) await handler(sortLogs(logs), { source: "poll", fromBlock: from, toBlock: to });
        this.cursor.write({ lastBlock: to });
        from = to + 1;
      }
      return this.cursor.read().lastBlock;
    } catch (err) {
      this.opts.log?.(`poll failed: ${err instanceof Error ? err.message : String(err)}`);
      return this.cursor.read().lastBlock;
    } finally {
      this.running = false;
    }
  }
}
