import type { LogFilter, RawLog } from "./types.ts";

/** Host only, so logs never carry an endpoint key. */
export function rpcHost(url: string): string {
  try { return new URL(url).host; } catch { return "rpc"; }
}

type Fetch = typeof fetch;

/**
 * Minimal JSON-RPC client over fetch with ordered failover: each call tries the endpoints in order and moves
 * to the next on a network error, timeout, HTTP error or RPC error. An endpoint that failed is skipped for
 * `coolDownMs` unless every endpoint is cooling down. If all fail, a range error wins (so the poller halves
 * its range), otherwise the first endpoint's error is thrown.
 */
export class Rpc {
  private id = 0;
  private readonly urls: string[];
  private readonly downUntil: number[];
  private readonly timeoutMs: number;
  private readonly coolDownMs: number;
  private readonly fetchFn: Fetch;
  private readonly now: () => number;

  constructor(
    urls: string | string[],
    opts: { timeoutMs?: number; coolDownMs?: number; fetch?: Fetch; now?: () => number } = {},
  ) {
    this.urls = Array.isArray(urls) ? urls : [urls];
    if (this.urls.length === 0) throw new Error("Rpc needs at least one URL");
    this.downUntil = this.urls.map(() => 0);
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.coolDownMs = opts.coolDownMs ?? 60_000;
    this.fetchFn = opts.fetch ?? fetch;
    this.now = opts.now ?? Date.now;
  }

  private async callOne<T>(url: string, method: string, params: unknown[]): Promise<T> {
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new RpcError(`${method}: HTTP ${res.status} from ${rpcHost(url)}`, res.status);
    const body = (await res.json()) as { result?: T; error?: { code: number; message: string } };
    if (body.error) throw new RpcError(`${method}: ${body.error.message}`, body.error.code);
    return body.result as T;
  }

  async call<T>(method: string, params: unknown[]): Promise<T> {
    const t = this.now();
    const live = this.urls.map((_, i) => i).filter((i) => this.downUntil[i] <= t);
    const order = live.length > 0 ? live : this.urls.map((_, i) => i);
    const errors: unknown[] = [];
    for (const i of order) {
      try {
        const out = await this.callOne<T>(this.urls[i], method, params);
        this.downUntil[i] = 0;
        return out;
      } catch (e) {
        errors.push(e);
        // A range error is about the request, not the endpoint: don't bench the endpoint for it.
        if (!isRangeError(e)) this.downUntil[i] = this.now() + this.coolDownMs;
      }
    }
    throw errors.find(isRangeError) ?? errors[0];
  }

  async blockNumber(): Promise<number> {
    return Number(BigInt(await this.call<string>("eth_blockNumber", [])));
  }

  async getLogs(filter: LogFilter, fromBlock: number, toBlock: number): Promise<RawLog[]> {
    return this.call<RawLog[]>("eth_getLogs", [
      {
        address: filter.addresses,
        topics: filter.topics,
        fromBlock: "0x" + fromBlock.toString(16),
        toBlock: "0x" + toBlock.toString(16),
      },
    ]);
  }
}

export class RpcError extends Error {
  readonly code: number;

  constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}

/** True when the RPC rejected the request because the block range or result set was too large. */
export function isRangeError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  return /range|too many|limit|exceed|10000|query returned more than/.test(msg);
}
