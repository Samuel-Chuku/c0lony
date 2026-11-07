import test from "node:test";
import assert from "node:assert/strict";
import { Rpc, rpcHost } from "../src/intake/rpc.ts";
import { urlList } from "../src/config.ts";

type Reply = { status?: number; body?: unknown; throws?: boolean };

function fakeFetch(replies: Record<string, Reply[]>) {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    const q = replies[url];
    const r = (q.length > 1 ? q.shift() : q[0]) ?? { throws: true };
    if (r.throws) throw new TypeError("fetch failed");
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const ok = (result: unknown): Reply => ({ body: { jsonrpc: "2.0", id: 1, result } });
const rpcErr = (message: string): Reply => ({ body: { jsonrpc: "2.0", id: 1, error: { code: -32000, message } } });

test("urlList splits and trims", () => {
  assert.deepEqual(urlList(" https://a/x , https://b/y,,"), ["https://a/x", "https://b/y"]);
  assert.equal(rpcHost("https://go.example.io/secretkey"), "go.example.io");
});

test("uses the primary when it answers", async () => {
  const f = fakeFetch({ A: [ok("0x10")], B: [ok("0x20")] });
  const rpc = new Rpc(["A", "B"], { fetch: f.fn });
  assert.equal(await rpc.blockNumber(), 16);
  assert.deepEqual(f.calls, ["A"]);
});

test("falls over on network, HTTP and RPC errors, and benches the failed endpoint", async () => {
  let t = 0;
  const f = fakeFetch({ A: [{ throws: true }, ok("0x1")], B: [{ status: 429 }], C: [rpcErr("boom"), ok("0x30")] });
  const rpc = new Rpc(["A", "B", "C"], { fetch: f.fn, now: () => t, coolDownMs: 1000 });
  await assert.rejects(rpc.blockNumber()); // all three fail once
  t = 10; // all cooling down: try them all again in order
  assert.equal(await rpc.blockNumber(), 1);
  t = 2000;
  f.calls.length = 0;
  assert.equal(await rpc.blockNumber(), 1);
  assert.deepEqual(f.calls, ["A"]);
});

test("a benched endpoint is skipped until its cool-down ends", async () => {
  let t = 0;
  const f = fakeFetch({ A: [{ throws: true }, ok("0x1")], B: [ok("0x2")] });
  const rpc = new Rpc(["A", "B"], { fetch: f.fn, now: () => t, coolDownMs: 1000 });
  assert.equal(await rpc.blockNumber(), 2);
  f.calls.length = 0;
  assert.equal(await rpc.blockNumber(), 2);
  assert.deepEqual(f.calls, ["B"]);
  t = 1001;
  assert.equal(await rpc.blockNumber(), 1);
});

test("a range error tries the next endpoint, and is the error thrown when every endpoint fails", async () => {
  const f = fakeFetch({ A: [rpcErr("Block range is too large")], B: [ok([])] });
  const rpc = new Rpc(["A", "B"], { fetch: f.fn });
  assert.deepEqual(await rpc.getLogs({ addresses: [], topics: [] }, 1, 20_000), []);
  const g = fakeFetch({ A: [{ throws: true }], B: [rpcErr("Block range is too large")] });
  const rpc2 = new Rpc(["A", "B"], { fetch: g.fn });
  await assert.rejects(rpc2.getLogs({ addresses: [], topics: [] }, 1, 20_000), /range/);
});
