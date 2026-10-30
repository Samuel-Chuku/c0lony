import type { RawLog } from "./types.ts";

const MAX_DEPTH = 8;

function toHex(v: unknown): string | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return "0x" + v.toString(16);
  if (typeof v === "bigint") return "0x" + v.toString(16);
  if (typeof v === "string") {
    if (/^0x[0-9a-fA-F]*$/.test(v)) return v;
    if (/^\d+$/.test(v)) return "0x" + BigInt(v).toString(16);
  }
  return undefined;
}

function asLog(o: Record<string, unknown>, inheritedBlock?: string): RawLog | undefined {
  if (typeof o.address !== "string" || !Array.isArray(o.topics) || typeof o.transactionHash !== "string") {
    return undefined;
  }
  const blockNumber = toHex(o.blockNumber) ?? inheritedBlock;
  const logIndex = toHex(o.logIndex);
  if (blockNumber === undefined || logIndex === undefined) return undefined;
  return {
    address: o.address,
    topics: (o.topics as unknown[]).map(String),
    data: typeof o.data === "string" ? o.data : "0x",
    blockNumber,
    transactionHash: o.transactionHash,
    logIndex,
    blockHash: typeof o.blockHash === "string" ? o.blockHash : undefined,
    removed: o.removed === true,
  };
}

/**
 * Pulls every log-shaped object out of a Streams payload. Our filter functions send
 * `{ logs: [...] }`, but this also copes with raw dataset payloads (blocks with receipts, arrays of logs).
 */
export function extractLogs(payload: unknown): RawLog[] {
  const out: RawLog[] = [];
  const walk = (node: unknown, depth: number, block?: string) => {
    if (depth > MAX_DEPTH || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1, block);
      return;
    }
    const obj = node as Record<string, unknown>;
    const log = asLog(obj, block);
    if (log) {
      out.push(log);
      return;
    }
    const here = toHex(obj.blockNumber) ?? (typeof obj.number === "string" ? toHex(obj.number) : undefined) ?? block;
    for (const value of Object.values(obj)) walk(value, depth + 1, here);
  };
  walk(payload, 0);
  return out;
}
