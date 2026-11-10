import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { hashTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { JsonStore } from "../src/state.ts";
import {
  CourierRelay, sendTypedData, toSendArgs, type CourierApi, type CourierChain, type CourierRequest, type CourierStatus, type Heartbeat,
} from "../src/courier/relay.ts";
import { CourierSwapper, routeProblem, shouldSwap, KYBER_ROUTER_ALLOWLIST, type KyberApi, type SwapChain } from "../src/courier/swap.ts";
import { tmpDir } from "./helpers.ts";

const COURIER = "0xec86Fe12db326eBf69CFD3edE3EFa1F6b8405bFD";
const KEEPER = "0x" + "c".repeat(40);
const RECEIVER = "0x" + "b".repeat(40);
const player = privateKeyToAccount(("0x" + "11".repeat(32)) as `0x${string}`);
const stranger = privateKeyToAccount(("0x" + "22".repeat(32)) as `0x${string}`);
const E = 10n ** 18n;
const NOW = 1_000_000;

async function mkReq(o: { fee?: bigint; feeTo?: string; nonce?: bigint; deadline?: number; signer?: typeof player; id?: string } = {}): Promise<CourierRequest> {
  const base: CourierRequest = {
    id: "", sender: player.address.toLowerCase(), receiver: RECEIVER, amount: String(100n * E), fee: String(o.fee ?? 5n * E),
    feeTo: o.feeTo ?? KEEPER, nonce: String(o.nonce ?? 0n), deadline: o.deadline ?? NOW + 600, sig: "0x",
  };
  const typed = sendTypedData(toSendArgs(base), COURIER, 46630);
  base.sig = await (o.signer ?? player).signTypedData(typed);
  base.id = o.id ?? hashTypedData(typed).toLowerCase();
  return base;
}

function setup(dir = tmpDir()) {
  const sends: string[] = [];
  const done: [string, CourierStatus, string | undefined, string | undefined][] = [];
  const beats: Heartbeat[] = [];
  const order: string[] = [];
  const logs: string[] = [];
  const w = {
    queue: [] as CourierRequest[], balance: 10n ** 18n, nonce: 0n, tokenBalance: 1000n * E, allowance: 1000n * E,
    simulate: null as string | null, receipt: "success" as "success" | "reverted" | "timeout", apiDown: false, n: 0, state: dir,
  };
  const store = () => new JsonStore<never>(join(dir, "courier-sent.json"), {} as never);
  const api: CourierApi = {
    pending: async (b) => {
      if (w.apiDown) throw new Error("down");
      beats.push(b);
      return w.queue;
    },
    done: async (id, s, tx, reason) => {
      if (w.apiDown) throw new Error("down");
      order.push(`done:${s}`);
      done.push([id, s, tx, reason]);
    },
  };
  const chain: CourierChain = {
    keeperBalance: async () => w.balance,
    nonceOf: async () => w.nonce,
    tokenBalance: async () => w.tokenBalance,
    allowance: async () => w.allowance,
    simulate: async () => w.simulate,
    send: async (s) => {
      order.push(`send:${store().read() && JSON.stringify(store().read())}`);
      sends.push(String(s.nonce));
      return "0x" + (++w.n).toString(16).padStart(64, "0");
    },
    receipt: async () => w.receipt,
  };
  const make = () =>
    new CourierRelay({
      api, chain, store: store(), keeper: KEEPER, courier: COURIER, chainId: 46630, minFee: 5n * E, minBalance: 1000n,
      now: () => NOW, log: (m) => logs.push(m),
    });
  return { w, make, sends, done, beats, order, logs, store };
}

const last = <T,>(a: T[]) => a[a.length - 1];

test("relays a valid request once, reports sending then sent", async () => {
  const s = setup();
  s.w.queue = [await mkReq()];
  const r = s.make();
  await r.tick();
  assert.deepEqual(s.sends, ["0"]);
  assert.deepEqual(s.done.map((d) => d[1]), ["sending", "sent"]);
  assert.match(last(s.done)[2]!, /^0x0+1$/);
  await r.tick(); // the app still lists it for a moment
  assert.deepEqual(s.sends, ["0"]);
});

test("never sends twice across a restart", async () => {
  const s = setup();
  s.w.queue = [await mkReq()];
  await s.make().tick();
  s.w.nonce = 1n;
  await s.make().tick(); // fresh instance, same state file
  assert.deepEqual(s.sends, ["0"]);
});

test("writes sending to the state file before it broadcasts", async () => {
  const s = setup();
  const req = await mkReq();
  s.w.queue = [req];
  await s.make().tick();
  const sendEntry = s.order.find((o) => o.startsWith("send:"))!;
  assert.match(sendEntry, new RegExp(`"${req.id}":\\{"status":"sending"`));
});

test("a stuck sending entry is resolved by its receipt and never resent", async () => {
  const s = setup();
  const req = await mkReq();
  s.w.queue = [req];
  s.w.receipt = "timeout";
  await s.make().tick();
  assert.deepEqual(s.done.map((d) => d[1]), ["sending"]);
  s.w.receipt = "success";
  s.w.queue = []; // the app no longer lists it (its row is "sending"), the keeper still finishes it
  await s.make().tick();
  assert.deepEqual(s.sends, ["0"]);
  assert.deepEqual(s.done.map((d) => d[1]), ["sending", "sent"]);
  // a reverted receipt reports failed
  const s2 = setup();
  s2.w.queue = [await mkReq()];
  s2.w.receipt = "timeout";
  await s2.make().tick();
  s2.w.receipt = "reverted";
  await s2.make().tick();
  assert.equal(last(s2.done)[1], "failed");
});

test("a crash before the tx hash came back: nonce moved means sent, else failed, never resent", async () => {
  for (const [nonce, want] of [[1n, "sent"], [0n, "failed"]] as const) {
    const s = setup();
    const req = await mkReq();
    new JsonStore(join(s.w.state, "courier-sent.json"), {}).write({
      [req.id]: { status: "sending", from: req.sender, nonce: "0", at: NOW },
    });
    s.w.nonce = nonce;
    s.w.queue = [req];
    await s.make().tick();
    assert.deepEqual(s.sends, []);
    assert.equal(last(s.done)[1], want);
  }
});

test("a final result the app missed is reported again", async () => {
  const s = setup();
  s.w.queue = [await mkReq()];
  s.w.apiDown = false;
  const r = s.make();
  await r.tick();
  s.done.length = 0;
  // simulate an unreported failure
  const st = s.store().read() as Record<string, { reported?: boolean }>;
  for (const k of Object.keys(st)) st[k].reported = false;
  s.store().write(st as never);
  s.w.queue = [];
  await r.tick();
  assert.deepEqual(s.done.map((d) => d[1]), ["sent"]);
});

const rejects: [string, (s: ReturnType<typeof setup>) => Promise<CourierRequest>, string][] = [
  ["bad signature", () => mkReq({ signer: stranger }), "bad_signature"],
  ["wrong digest", () => mkReq({ id: "0x" + "9".repeat(64) }), "bad_digest"],
  ["wrong feeTo", () => mkReq({ feeTo: RECEIVER }), "wrong_fee_to"],
  ["fee too low", () => mkReq({ fee: 4n * E }), "fee_too_low"],
  ["expired", () => mkReq({ deadline: NOW + 10 }), "expired"],
  ["wrong nonce", async (s) => ((s.w.nonce = 3n), mkReq({ nonce: 0n })), "bad_nonce"],
  ["low balance", async (s) => ((s.w.tokenBalance = 104n * E), mkReq()), "low_balance"],
  ["low allowance", async (s) => ((s.w.allowance = 104n * E), mkReq()), "low_allowance"],
  ["simulation reverts", async (s) => ((s.w.simulate = "BadNonce"), mkReq()), "BadNonce"],
];
for (const [name, build, reason] of rejects) {
  test(`rejects without a transaction: ${name}`, async () => {
    const s = setup();
    s.w.queue = [await build(s)];
    await s.make().tick();
    assert.deepEqual(s.sends, []);
    assert.deepEqual(s.done.map((d) => [d[1], d[3]]), [["failed", reason]]);
  });
}

test("under the ETH floor: the heartbeat says disabled and nothing is sent", async () => {
  const s = setup();
  s.w.balance = 999n;
  s.w.queue = [await mkReq()];
  await s.make().tick();
  assert.equal(s.beats[0].enabled, false);
  assert.deepEqual(s.sends, []);
  assert.deepEqual(s.done, []);
  assert.ok(s.logs.some((l) => l.startsWith("ALERT")));
  s.w.balance = 1000n;
  await s.make().tick();
  assert.equal(last(s.beats).enabled, true);
  assert.equal(last(s.beats).feeTo, KEEPER);
  assert.equal(last(s.beats).courier, COURIER);
  assert.equal(last(s.beats).minFee, String(5n * E));
  assert.deepEqual(s.sends, ["0"]);
});

test("a reverted transaction is reported failed with the tx", async () => {
  const s = setup();
  s.w.queue = [await mkReq()];
  s.w.receipt = "reverted";
  await s.make().tick();
  assert.deepEqual(s.done.map((d) => d[1]), ["sending", "failed"]);
  assert.ok(last(s.done)[2]);
});

// ---------------------------------------------------------------- fee swap

const WIF = "0x" + "5".repeat(40);
const ROUTER = KYBER_ROUTER_ALLOWLIST[0];
const quote = { routerAddress: ROUTER, routeSummary: {}, amountOut: 1000n };
const built = { routerAddress: ROUTER, data: "0xabcd", value: 0n, amountOut: 1000n };

test("swap decision: low ETH, enough WIF, once an hour, enabled", () => {
  const base = { enabled: true, ethBalance: 100n, wifBalance: 100n * E, below: 500n, minWif: 100n * E, now: 10_000, lastAttempt: 0 };
  assert.equal(shouldSwap(base), true);
  assert.equal(shouldSwap({ ...base, ethBalance: 500n }), false);
  assert.equal(shouldSwap({ ...base, wifBalance: 100n * E - 1n }), false);
  assert.equal(shouldSwap({ ...base, lastAttempt: 10_000 - 3599 }), false);
  assert.equal(shouldSwap({ ...base, lastAttempt: 10_000 - 3600 }), true);
  assert.equal(shouldSwap({ ...base, enabled: false }), false);
});

test("route checks: allowlist, matching routers, 97% floor, no ETH out", () => {
  assert.equal(routeProblem(quote, built), null);
  assert.match(routeProblem({ ...quote, routerAddress: "0x" + "d".repeat(40) }, { ...built, routerAddress: "0x" + "d".repeat(40) })!, /allowlist/);
  assert.match(routeProblem({ ...quote, routerAddress: "0x" + "d".repeat(40) }, built)!, /different routers/);
  assert.equal(routeProblem(quote, { ...built, amountOut: 970n }), null);
  assert.match(routeProblem(quote, { ...built, amountOut: 969n })!, /97%/);
  assert.match(routeProblem(quote, { ...built, amountOutMin: 969n })!, /97%/);
  assert.match(routeProblem(quote, { ...built, value: 1n })!, /ETH/);
});

function swapSetup(over: { eth?: bigint; wif?: bigint; build?: typeof built; simulate?: boolean; allowance?: bigint } = {}) {
  const calls: string[] = [];
  const logs: string[] = [];
  const dir = tmpDir();
  const kyber: KyberApi = {
    quote: async (_t, amt) => (calls.push(`quote:${amt}`), quote),
    build: async () => (calls.push("build"), over.build ?? built),
  };
  const chain: SwapChain = {
    ethBalance: async () => over.eth ?? 100n,
    wifBalance: async () => over.wif ?? 200n * E,
    allowance: async () => over.allowance ?? 0n,
    approve: async (_s, a) => void calls.push(`approve:${a}`),
    simulate: async () => (calls.push("simulate"), over.simulate ?? true),
    send: async () => (calls.push("send"), true),
  };
  const mk = (now: number, enabled = true) =>
    new CourierSwapper({
      kyber, chain, store: new JsonStore(join(dir, "courier-swap.json"), { lastAttempt: 0 }), keeper: KEEPER, wif: WIF, enabled,
      below: 500n, minWif: 100n * E, now: () => now, log: (m) => logs.push(m),
    });
  return { calls, logs, mk };
}

test("swap: approves the exact amount, simulates, sends, and keeps 1 WIF back", async () => {
  const s = swapSetup();
  await s.mk(10_000).maybeSwap();
  assert.deepEqual(s.calls, [`quote:${199n * E}`, "build", `approve:${199n * E}`, "simulate", "send"]);
});

test("swap: once an hour even across a restart, and after a failure too", async () => {
  const s = swapSetup({ simulate: false });
  await s.mk(10_000).maybeSwap();
  assert.ok(!s.calls.includes("send"));
  const before = s.calls.length;
  await s.mk(10_000 + 3599).maybeSwap();
  assert.equal(s.calls.length, before);
  await s.mk(10_000 + 3600).maybeSwap();
  assert.ok(s.calls.length > before);
});

test("swap: nothing happens when off, with enough ETH, or too little WIF", async () => {
  for (const o of [{ eth: 500n }, { wif: 99n * E }]) {
    const s = swapSetup(o);
    await s.mk(10_000).maybeSwap();
    assert.deepEqual(s.calls, []);
  }
  const off = swapSetup();
  await off.mk(10_000, false).maybeSwap();
  assert.deepEqual(off.calls, []);
});

test("swap: a bad route is never approved or sent", async () => {
  const s = swapSetup({ build: { ...built, amountOut: 900n } });
  await s.mk(10_000).maybeSwap();
  assert.deepEqual(s.calls, [`quote:${199n * E}`, "build"]);
  assert.ok(s.logs.some((l) => /97%/.test(l)));
});

test("swap: skips the approval when the allowance already covers it", async () => {
  const s = swapSetup({ allowance: 199n * E });
  await s.mk(10_000).maybeSwap();
  assert.ok(!s.calls.some((c) => c.startsWith("approve")));
  assert.ok(s.calls.includes("send"));
});
