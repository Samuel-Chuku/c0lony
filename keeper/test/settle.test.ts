import { test } from "node:test";
import assert from "node:assert/strict";
import type { RawEvent } from "../src/feed/decode.ts";
import { Settler, type SettleWallet } from "../src/settle/settler.ts";
import { fetchDrandSignature } from "../src/settle/drand.ts";
import { FakeReader } from "./feedHelpers.ts";

const launched = (id: number): RawEvent => ({ contract: "game", name: "RaidLaunched", args: { raidId: BigInt(id) } });
const revealed = (id: number, round: number, roundTime: number): RawEvent => ({ contract: "game", name: "Revealed", args: { raidId: BigInt(id), round: BigInt(round), roundTime: BigInt(roundTime) } });

function setup() {
  const now = { t: 10_000 };
  const reader = new FakeReader();
  const txs: string[] = [];
  const logs: string[] = [];
  let balance = 10n ** 18n;
  let sigReady = true;
  const wallet: SettleWallet = {
    balance: async () => balance,
    send: async (fn, id) => {
      txs.push(`${fn}:${id}`);
      return true;
    },
  };
  const settler = new Settler({
    reader, wallet, minBalance: 200n, now: () => now.t, log: (m) => logs.push(m),
    signature: async () => (sigReady ? "0xabcd" : null),
  });
  return { now, reader, txs, logs, settler, setBalance: (b: bigint) => (balance = b), setSig: (r: boolean) => (sigReady = r) };
}

test("settles a revealed raid 60 s after its round, once", async () => {
  const s = setup();
  s.reader.raids.set("1", { status: 2, launchedAt: 0, round: 5 });
  s.settler.onEvent(launched(1));
  s.settler.onEvent(revealed(1, 5, 10_000));
  await s.settler.tick();
  assert.deepEqual(s.txs, []); // too early
  s.now.t = 10_061;
  await s.settler.tick();
  await s.settler.tick();
  assert.deepEqual(s.txs, ["settle:1"]);
  assert.equal(s.settler.pendingCount, 0);
});

test("waits for the drand round to be published", async () => {
  const s = setup();
  s.reader.raids.set("1", { status: 2, launchedAt: 0, round: 5 });
  s.settler.onEvent(revealed(1, 5, 10_000));
  s.now.t = 10_100;
  s.setSig(false);
  await s.settler.tick();
  assert.deepEqual(s.txs, []);
  s.setSig(true);
  s.now.t += 11;
  await s.settler.tick();
  assert.deepEqual(s.txs, ["settle:1"]);
});

test("skips and forgets raids that are no longer Revealed (someone else settled)", async () => {
  const s = setup();
  s.reader.raids.set("1", { status: 3, launchedAt: 0, round: 5 });
  s.settler.onEvent(revealed(1, 5, 10_000));
  s.now.t = 10_100;
  await s.settler.tick();
  assert.deepEqual(s.txs, []);
  assert.equal(s.settler.pendingCount, 0);
});

test("a RaidSettled event stops tracking", async () => {
  const s = setup();
  s.settler.onEvent(revealed(1, 5, 10_000));
  s.settler.onEvent({ contract: "game", name: "RaidSettled", args: { raidId: 1n } });
  s.now.t = 10_100;
  await s.settler.tick();
  assert.deepEqual(s.txs, []);
});

test("below the balance floor nothing is sent, the alert is hourly, and sending resumes after a top-up", async () => {
  const s = setup();
  s.reader.raids.set("1", { status: 2, launchedAt: 0, round: 5 });
  s.settler.onEvent(revealed(1, 5, 10_000));
  s.setBalance(100n);
  s.now.t = 10_100;
  await s.settler.tick();
  s.now.t += 11;
  await s.settler.tick();
  assert.deepEqual(s.txs, []);
  assert.equal(s.logs.filter((l) => l.startsWith("ALERT")).length, 1);
  s.now.t += 3600;
  await s.settler.tick();
  assert.equal(s.logs.filter((l) => l.startsWith("ALERT")).length, 2);
  s.setBalance(10n ** 18n);
  s.now.t += 11;
  await s.settler.tick();
  assert.deepEqual(s.txs, ["settle:1"]);
});

test("collects revealed raids unsettled 48 h after their round, and sealed raids past their windows", async () => {
  const s = setup();
  s.reader.raids.set("1", { status: 2, launchedAt: 0, round: 5 });
  s.reader.raids.set("2", { status: 1, launchedAt: 5_000, round: 0 });
  s.settler.onEvent(revealed(1, 5, 10_000));
  s.settler.onEvent(launched(2));
  s.now.t = 10_000 + 48 * 3600 + 1;
  await s.settler.tick();
  assert.deepEqual(s.txs.sort(), ["collect:1", "collect:2"]);
});

test("sealed raids not yet past their windows are left alone", async () => {
  const s = setup();
  s.reader.raids.set("2", { status: 1, launchedAt: 9_000, round: 0 });
  s.settler.onEvent(launched(2));
  await s.settler.tick();
  assert.deepEqual(s.txs, []);
  assert.equal(s.settler.pendingCount, 1);
});

test("drand signature fetch returns 0x hex, or null when unpublished", async () => {
  const ok = (async () => new Response(JSON.stringify({ signature: "abcd" }))) as unknown as typeof fetch;
  const no = (async () => new Response("not found", { status: 404 })) as unknown as typeof fetch;
  assert.equal(await fetchDrandSignature(ok, "http://d", "hash", 5), "0xabcd");
  assert.equal(await fetchDrandSignature(no, "http://d", "hash", 5), null);
});
