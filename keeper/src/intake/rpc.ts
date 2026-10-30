import type { LogFilter, RawLog } from "./types.ts";

/** Minimal JSON-RPC client over fetch (Quicknode endpoint URL from env). */
export class Rpc {
  private id = 0;
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  async call<T>(method: string, params: unknown[]): Promise<T> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }),
    });
    if (!res.ok) throw new RpcError(`${method}: HTTP ${res.status}`, res.status);
    const body = (await res.json()) as { result?: T; error?: { code: number; message: string } };
    if (body.error) throw new RpcError(`${method}: ${body.error.message}`, body.error.code);
    return body.result as T;
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
