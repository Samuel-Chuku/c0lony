import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RawLog } from "../src/intake/types.ts";

export function sign(token: string, nonce: string, timestamp: string, payload: string): string {
  return createHmac("sha256", Buffer.from(token)).update(Buffer.from(nonce + timestamp + payload)).digest("hex");
}

export function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "colony-keeper-"));
}

export const WIF = "0x5173b8eA6923c2d40267890D45C46a3480954773";
export const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export function topic(addr: string): string {
  return "0x" + addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

export function transferLog(from: string, to: string, wei: bigint, block: number, index = 0, tx?: string): RawLog {
  return {
    address: WIF,
    topics: [TRANSFER, topic(from), topic(to)],
    data: "0x" + wei.toString(16).padStart(64, "0"),
    blockNumber: "0x" + block.toString(16),
    transactionHash: tx ?? "0x" + (block * 1000 + index).toString(16).padStart(64, "0"),
    logIndex: "0x" + index.toString(16),
  };
}
