import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { PollerSource } from "../src/intake/poller.ts";
import { Rpc, RpcError } from "../src/intake/rpc.ts";
import type { LogFilter, RawLog } from "../src/intake/types.ts";
import { tmpDir, transferLog } from "./helpers.ts";

const filter: LogFilter = { addresses: [], topics: [] };

class FakeRpc {
  head = 1000;
  maxRange = Infinity;
  calls: [number, number][] = [];
  logs: RawLog[] = [];
  async blockNumber() {
    return this.head;
  }
  async getLogs(_f: LogFilter, from: number, to: number) {
    this.calls.push([from, to]);
    if (to - from + 1 > this.maxRange) throw new RpcError("query exceeds max block range 100", -32602);
    return this.logs.filter((l) => {
      const b = Number(BigInt(l.blockNumber));
      return b >= from && b <= to;
    });
  }
}

function poller(rpc: FakeRpc, dir: string, extra: Partial<ConstructorParameters<typeof PollerSource>[0]> = {}) {
  return new PollerSource({
    rpc: rpc as unknown as Rpc,
    filter,
    startBlock: 100,
    intervalMs: 15_000,
    chunkBlocks: 300,
    confirmations: 2,
    cursorFile: join(dir, "cursor.json"),
    ...extra,
  });
}

test("reads from start block to head minus confirmations in chunks, then resumes from the cursor", async () => {
  const rpc = new FakeRpc();
  rpc.logs = [transferLog("0x1", "0x2", 1n, 150), transferLog("0x1", "0x2", 1n, 990, 1), transferLog("0x1", "0x2", 1n, 999)];
  const dir = tmpDir();
  const got: RawLog[] = [];
  const p = poller(rpc, dir);
  assert.equal(await p.tick(async (l) => void got.push(...l)), 998);
  assert.deepEqual(rpc.calls, [[100, 399], [400, 699], [700, 998]]);
  assert.equal(got.length, 2, "block 999 not yet confirmed");

  rpc.head = 1010;
  rpc.calls = [];
  const p2 = poller(rpc, dir); // restart: resumes from saved cursor
  assert.equal(await p2.tick(async (l) => void got.push(...l)), 1008);
  assert.deepEqual(rpc.calls, [[999, 1008]]);
  assert.equal(got.length, 3);
});

test("halves the chunk when the RPC rejects the range", async () => {
  const rpc = new FakeRpc();
  rpc.head = 400;
  rpc.maxRange = 100;
  const p = poller(rpc, tmpDir(), { confirmations: 0 });
  assert.equal(await p.tick(async () => {}), 400);
  assert.ok(rpc.calls.every(([f, t]) => t - f + 1 <= 300));
  assert.ok(rpc.calls.filter(([f, t]) => t - f + 1 <= 100).length >= 3);
});

test("cursor does not advance when the handler fails", async () => {
  const rpc = new FakeRpc();
  rpc.logs = [transferLog("0x1", "0x2", 1n, 120)];
  const dir = tmpDir();
  const p = poller(rpc, dir);
  const last = await p.tick(async () => {
    throw new Error("boom");
  });
  assert.equal(last, null, "nothing marked processed");
  let delivered = 0;
  await poller(rpc, dir).tick(async (l) => void (delivered += l.length));
  assert.equal(delivered, 1, "re-delivered after restart");
});

test("respects an end block for one-off backfills", async () => {
  const rpc = new FakeRpc();
  const p = poller(rpc, tmpDir(), { endBlock: 250 });
  assert.equal(await p.tick(async () => {}), 250);
});
