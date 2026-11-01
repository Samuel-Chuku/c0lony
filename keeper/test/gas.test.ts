import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { JsonStore } from "../src/state.ts";
import { StarterGas, type GasChain, type GasApi } from "../src/gas/starter.ts";
import { tmpDir } from "./helpers.ts";

const W1 = "0x" + "1".repeat(40);
const W2 = "0x" + "2".repeat(40);
const AMOUNT = 1000n;

function setup(dir = tmpDir()) {
  const balances = new Map<string, bigint>();
  let keeper = 10n ** 18n;
  const sends: string[] = [];
  const done: [number, string, string | undefined][] = [];
  let queue = [{ id: 1, wallet: W1 }];
  let n = 0;
  const chain: GasChain = {
    balanceOf: async (a) => balances.get(a) ?? 0n,
    keeperBalance: async () => keeper,
    send: async (to) => {
      sends.push(to);
      return "0x" + (++n).toString(16).padStart(64, "0");
    },
    wait: async () => true,
  };
  const api: GasApi = { pending: async () => queue, done: async (id, s, tx) => void done.push([id, s, tx]) };
  const logs: string[] = [];
  const now = { t: 100_000 };
  const make = () =>
    new StarterGas({
      api, chain, store: new JsonStore(join(dir, "gas-sent.json"), {}), amount: AMOUNT, below: 200n, minBalance: 500n,
      now: () => now.t, log: (m) => logs.push(m),
    });
  return { make, balances, sends, done, logs, now, setKeeper: (k: bigint) => (keeper = k), setQueue: (q: typeof queue) => (queue = q) };
}

test("sends once and reports sent with the tx", async () => {
  const s = setup();
  const g = s.make();
  await g.tick();
  await g.tick();
  assert.deepEqual(s.sends, [W1]);
  assert.equal(s.done[0][1], "sent");
  assert.match(s.done[0][2]!, /^0x0+1$/);
});

test("skips a wallet that is already funded", async () => {
  const s = setup();
  s.balances.set(W1, 200n);
  await s.make().tick();
  assert.deepEqual(s.sends, []);
  assert.deepEqual(s.done.map((d) => d[1]), ["skipped"]);
});

test("never resends after a restart", async () => {
  const s = setup();
  await s.make().tick();
  await s.make().tick(); // fresh instance, same state file, the app still lists the id
  assert.equal(s.sends.length, 1);
  assert.deepEqual(s.done.map((d) => d[1]), ["sent", "sent"]);
});

test("an id stuck at sending is resolved by balance, not resent", async () => {
  const dir = tmpDir();
  new JsonStore(join(dir, "gas-sent.json"), {}).write({ "1": { status: "sending" } });
  const s = setup(dir);
  s.balances.set(W1, AMOUNT); // the earlier send landed
  await s.make().tick();
  assert.deepEqual(s.sends, []);
  assert.deepEqual(s.done.map((d) => d[1]), ["skipped"]);
});

test("stops below the floor, alerts once an hour, resumes when topped up", async () => {
  const s = setup();
  s.setQueue([{ id: 1, wallet: W1 }, { id: 2, wallet: W2 }]);
  s.setKeeper(500n + AMOUNT - 1n);
  const g = s.make();
  await g.tick();
  await g.tick();
  assert.deepEqual(s.sends, []);
  assert.equal(s.logs.filter((l) => l.startsWith("ALERT")).length, 1);
  s.now.t += 3601;
  await g.tick();
  assert.equal(s.logs.filter((l) => l.startsWith("ALERT")).length, 2);
  s.setKeeper(10n ** 18n);
  await g.tick();
  assert.deepEqual(s.sends, [W1, W2]);
});
