// Gas packs (docs/design/2026-11-13-wif-for-gas.md): price, refusals before any WIF moves, and paying exactly once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { hashTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { JsonStore } from "../src/state.ts";
import { CourierRelay, sendTypedData, toSendArgs, type CourierApi, type CourierChain, type CourierRequest, type Heartbeat } from "../src/courier/relay.ts";
import { QuotedPackPricer, packWif, type PackChain, type PackPrice } from "../src/courier/gaspack.ts";
import { StarterGas, type GasChain } from "../src/gas/starter.ts";
import { tmpDir } from "./helpers.ts";

const COURIER = "0xec86Fe12db326eBf69CFD3edE3EFa1F6b8405bFD";
const KEEPER = "0x" + "c".repeat(40);
const player = privateKeyToAccount(("0x" + "11".repeat(32)) as `0x${string}`);
const player2 = privateKeyToAccount(("0x" + "33".repeat(32)) as `0x${string}`);
const E = 10n ** 18n;
const NOW = 1_000_000;
const PACK = 10n ** 14n; // 0.0001 ETH
const PRICE: PackPrice = { wei: PACK, wif: 207n * E };
const FLOOR = 5n * 10n ** 14n; // 0.0005 ETH
const GAS_PRICE = 20_000_000n; // 0.02 gwei: "has gas" means >= 2 x 400k x this = 0.000016 ETH

async function mkGasReq(o: { amount?: bigint; to?: string; signer?: typeof player; nonce?: bigint } = {}): Promise<CourierRequest> {
  const signer = o.signer ?? player;
  const base: CourierRequest = {
    id: "", sender: signer.address.toLowerCase(), receiver: o.to ?? KEEPER, amount: String(o.amount ?? PRICE.wif), fee: String(5n * E),
    feeTo: KEEPER, nonce: String(o.nonce ?? 0n), deadline: NOW + 600, sig: "0x", purpose: "gas",
  };
  const typed = sendTypedData(toSendArgs(base), COURIER, 46630);
  base.sig = await signer.signTypedData(typed);
  base.id = hashTypedData(typed).toLowerCase();
  return base;
}

function setup(dir = tmpDir()) {
  const w = {
    queue: [] as CourierRequest[], keeperEth: 10n ** 16n, playerEth: 0n, price: PRICE as PackPrice | null,
    receipts: new Map<string, "success" | "reverted" | "timeout">(), keeperNonce: 0, nextNonce: 0, n: 0,
    broadcastFails: false,
  };
  const relays: string[] = []; // courier sends (WIF moves)
  const signed: { hash: string; nonce: number; to: string; value: bigint }[] = [];
  const broadcasts: string[] = [];
  const done: { id: string; status: string; tx?: string; reason?: string; gasTx?: string }[] = [];
  const beats: Heartbeat[] = [];
  const logs: string[] = [];
  const api: CourierApi = {
    pending: async (b) => (beats.push(b), w.queue),
    done: async (id, status, tx, reason, gasTx) => void done.push({ id, status, tx, reason, gasTx }),
  };
  const chain: CourierChain = {
    keeperBalance: async () => w.keeperEth,
    nonceOf: async () => 0n,
    tokenBalance: async () => 1000n * E,
    allowance: async () => 1000n * E,
    simulate: async () => null,
    send: async () => {
      const h = "0x" + (++w.n).toString(16).padStart(64, "0");
      relays.push(h);
      w.receipts.set(h, "success");
      return h;
    },
    receipt: async (h) => w.receipts.get(h) ?? "timeout",
  };
  const packChain: PackChain = {
    ethBalance: async () => w.playerEth,
    gasPrice: async () => GAS_PRICE,
    signEth: async (to, value) => {
      const nonce = w.nextNonce++;
      const hash = "0xeth" + (++w.n).toString(16).padStart(60, "0");
      signed.push({ hash, nonce, to, value });
      return { hash, raw: "raw:" + hash, nonce };
    },
    broadcast: async (raw) => {
      if (w.broadcastFails) throw new Error("node said no");
      broadcasts.push(raw);
    },
    keeperNonce: async () => w.keeperNonce,
  };
  const store = new JsonStore<never>(join(dir, "courier-sent.json"), {} as never);
  const make = (packOn = true) =>
    new CourierRelay({
      api, chain, store, keeper: KEEPER, courier: COURIER, chainId: 46630, minFee: 5n * E, minBalance: 2n * 10n ** 14n,
      pack: packOn ? { pricer: { current: async () => w.price }, chain: packChain, dailyCap: 15, floor: FLOOR } : undefined,
      now: () => NOW, log: (m) => logs.push(m),
    });
  return { w, make, relays, signed, broadcasts, done, beats, logs };
}

const last = <T,>(a: T[]) => a[a.length - 1];

test("pack price: quote plus markup, rounded up to a whole WIF", () => {
  assert.equal(packWif(188_397_778_261_402_780_000n, 1000), 208n * E); // 188.39 x 1.1 = 207.2 -> 208
  assert.equal(packWif(100n * E, 1000), 110n * E);
  assert.equal(packWif(100n * E, 0), 100n * E);
});

test("pricer: out-of-bounds quotes pause packs; a failed refresh keeps the last price until it goes stale", async () => {
  let t = 0;
  let quote: bigint | Error = 188n * E;
  const p = new QuotedPackPricer({
    quoteWif: async () => { if (quote instanceof Error) throw quote; return quote; },
    wei: PACK, markupBps: 1000, minWif: 50n * E, maxWif: 1000n * E, refreshSec: 600, staleSec: 1800, now: () => t,
  });
  assert.deepEqual(await p.current(), { wei: PACK, wif: 207n * E });
  quote = new Error("down");
  t = 700;
  assert.deepEqual(await p.current(), { wei: PACK, wif: 207n * E }, "kept while fresh");
  t = 1900;
  assert.equal(await p.current(), null, "stale after 30 minutes without a good quote");
  quote = 5000n * E;
  t = 2600;
  assert.equal(await p.current(), null, "too expensive: no price");
  quote = 10n * E;
  t = 3300;
  assert.equal(await p.current(), null, "too cheap: no price");
});

test("heartbeat advertises packs only with a price and room for two packs above the pack floor", async () => {
  const s = setup();
  await s.make().tick();
  assert.deepEqual(last(s.beats).pack, { wei: String(PACK), wif: String(207n * E) });
  s.w.keeperEth = FLOOR + 2n * PACK - 1n;
  await s.make().tick();
  assert.equal(last(s.beats).pack, undefined);
  s.w.keeperEth = 10n ** 16n;
  s.w.price = null;
  await s.make().tick();
  assert.equal(last(s.beats).pack, undefined);
  await s.make(false).tick();
  assert.equal(last(s.beats).pack, undefined);
});

test("a purchase moves the WIF once, pays the pack once, and reports both transactions", async () => {
  const s = setup();
  s.w.queue = [await mkGasReq()];
  await s.make().tick();
  assert.equal(s.relays.length, 1);
  assert.equal(s.signed.length, 1);
  assert.equal(s.signed[0].to.toLowerCase(), player.address.toLowerCase());
  assert.equal(s.signed[0].value, PACK);
  s.w.receipts.set(s.signed[0].hash, "success");
  s.w.keeperNonce = 1;
  await s.make().tick(); // the same request still in the queue, and the pack's receipt now in
  assert.equal(s.relays.length, 1, "never relayed twice");
  assert.equal(s.signed.length, 1, "never paid twice");
  const paid = s.done.find((d) => d.gasTx);
  assert.ok(paid, "the pack tx is reported");
  assert.equal(paid!.gasTx, s.signed[0].hash);
  assert.equal(paid!.tx, s.relays[0]);
  await s.make().tick();
  assert.equal(s.signed.length, 1);
});

const refusals: [string, (s: ReturnType<typeof setup>) => Promise<CourierRequest>, string, boolean?][] = [
  ["packs off", () => mkGasReq(), "gas_off", false],
  ["no price", async (s) => ((s.w.price = null), mkGasReq()), "gas_off"],
  ["paid to someone else", () => mkGasReq({ to: "0x" + "b".repeat(40) }), "wrong_receiver"],
  ["price moved more than 5%", () => mkGasReq({ amount: 196n * E }), "price_changed"],
  ["the player still has gas", async (s) => ((s.w.playerEth = 16n * 10n ** 12n), mkGasReq()), "has_gas"],
  ["keeper too close to the pack floor", async (s) => ((s.w.keeperEth = FLOOR + PACK - 1n), mkGasReq()), "gas_busy"],
];
for (const [name, build, reason, packOn] of refusals) {
  test(`refused before any WIF moves: ${name}`, async () => {
    const s = setup();
    s.w.queue = [await build(s)];
    await s.make(packOn ?? true).tick();
    assert.deepEqual(s.relays, []);
    assert.deepEqual(s.signed, []);
    assert.deepEqual(s.done.map((d) => [d.status, d.reason]), [["failed", reason]]);
  });
}

test("a signed amount within 5% of the current price is honoured", async () => {
  const s = setup();
  s.w.queue = [await mkGasReq({ amount: 197n * E })]; // 197 >= 95% of 207
  await s.make().tick();
  assert.equal(s.relays.length, 1);
});

test("one pack per wallet per day, and the daily cap across all wallets", async () => {
  const s = setup();
  s.w.queue = [await mkGasReq()];
  await s.make().tick();
  s.w.queue = [await mkGasReq({ nonce: 1n })];
  await s.make().tick();
  assert.equal(s.relays.length, 1);
  assert.equal(last(s.done).reason, "gas_daily_limit");

  const t = setup();
  const relay = new CourierRelay({
    api: { pending: async () => t.w.queue, done: async (id, status, tx, reason) => void t.done.push({ id, status, tx, reason }) },
    chain: {
      keeperBalance: async () => 10n ** 16n, nonceOf: async () => 0n, tokenBalance: async () => 1000n * E, allowance: async () => 1000n * E,
      simulate: async () => null, send: async () => (t.relays.push("x"), "0x" + "e".repeat(64)), receipt: async () => "success",
    },
    store: new JsonStore<never>(join(tmpDir(), "c.json"), {} as never), keeper: KEEPER, courier: COURIER, chainId: 46630,
    minFee: 5n * E, minBalance: 0n,
    pack: {
      pricer: { current: async () => PRICE }, dailyCap: 1, floor: FLOOR,
      chain: { ethBalance: async () => 0n, gasPrice: async () => GAS_PRICE, signEth: async () => ({ hash: "0x" + "f".repeat(64), raw: "r", nonce: 0 }), broadcast: async () => {}, keeperNonce: async () => 0 },
    },
    now: () => NOW,
  });
  t.w.queue = [await mkGasReq()];
  await relay.tick();
  t.w.queue = [await mkGasReq({ signer: player2 })];
  await relay.tick();
  assert.equal(t.relays.length, 1);
  assert.equal(last(t.done).reason, "gas_busy");
});

test("restart mid-payment: the saved transfer is re-broadcast byte for byte, never signed again", async () => {
  const s = setup();
  s.w.queue = [await mkGasReq()];
  s.w.broadcastFails = true; // signed and saved, but the node never took it
  await s.make().tick().catch(() => {});
  assert.equal(s.signed.length, 1);
  assert.equal(s.broadcasts.length, 0);
  s.w.broadcastFails = false;
  s.w.queue = [];
  await s.make().tick(); // a fresh relay, as after a restart
  assert.equal(s.signed.length, 1, "not signed again");
  assert.deepEqual(s.broadcasts, ["raw:" + s.signed[0].hash], "the same bytes");
  s.w.receipts.set(s.signed[0].hash, "success");
  s.w.keeperNonce = 1;
  await s.make().tick();
  assert.equal(s.signed.length, 1);
  assert.equal(s.done.filter((d) => d.gasTx).length, 1);
});

test("a transfer whose nonce went to another transaction is re-signed only after two checks with no receipt", async () => {
  const s = setup();
  s.w.queue = [await mkGasReq()];
  await s.make().tick();
  assert.equal(s.signed.length, 1);
  s.w.queue = [];
  s.w.keeperNonce = 1; // nonce 0 used, but not by our transfer (no receipt for it)
  await s.make().tick();
  assert.equal(s.signed.length, 1, "first miss: wait");
  await s.make().tick();
  assert.equal(s.signed.length, 2, "second miss: re-signed with a new nonce");
  assert.equal(s.signed[1].nonce, 1);
  s.w.receipts.set(s.signed[1].hash, "success");
  s.w.keeperNonce = 2;
  await s.make().tick();
  assert.equal(s.done.filter((d) => d.gasTx).length, 1);
  assert.equal(last(s.done.filter((d) => d.gasTx)).gasTx, s.signed[1].hash);
});

test("a pending transfer whose receipt turns up late is never paid twice", async () => {
  const s = setup();
  s.w.queue = [await mkGasReq()];
  await s.make().tick();
  s.w.queue = [];
  s.w.keeperNonce = 1;
  await s.make().tick(); // first miss
  s.w.receipts.set(s.signed[0].hash, "success"); // it was ours after all
  await s.make().tick();
  assert.equal(s.signed.length, 1);
  assert.equal(s.done.filter((d) => d.gasTx).length, 1);
});

test("an owed pack is paid even after a restart between the WIF landing and the payment", async () => {
  const s = setup();
  s.w.queue = [await mkGasReq()];
  const r = s.make();
  // Simulate: the WIF send landed, then the keeper died before paying (no signEth yet).
  const realSign = (r as unknown as { o: { pack: { chain: PackChain } } }).o.pack.chain.signEth;
  (r as unknown as { o: { pack: { chain: PackChain } } }).o.pack.chain.signEth = async () => { throw new Error("killed"); };
  await r.tick();
  assert.equal(s.relays.length, 1);
  assert.equal(s.signed.length, 0);
  (r as unknown as { o: { pack: { chain: PackChain } } }).o.pack.chain.signEth = realSign;
  s.w.queue = [];
  await s.make().tick();
  assert.equal(s.signed.length, 1, "paid after the restart");
  assert.equal(s.relays.length, 1);
});

// ---- approval top-up (starter gas queue, kind "approval")

function starter(o: { walletEth: bigint; approval?: bigint }) {
  const sent: [string, bigint][] = [];
  const done: [number, string][] = [];
  const chain: GasChain = {
    balanceOf: async () => o.walletEth,
    keeperBalance: async () => 10n ** 16n,
    send: async (to, amount) => (sent.push([to, amount]), "0x" + "a".repeat(64)),
    wait: async () => true,
  };
  const g = new StarterGas({
    api: { pending: async () => [{ id: 7, wallet: "0x" + "d".repeat(40), kind: "approval" }], done: async (id, st) => void done.push([id, st]) },
    chain, store: new JsonStore(join(tmpDir(), "gas.json"), {}), amount: 3n * 10n ** 13n, below: 2n * 10n ** 13n,
    minBalance: 2n * 10n ** 14n, approvalAmount: o.approval,
  });
  return { g, sent, done };
}

test("approval top-up: sends the small approval amount once to a wallet that can't pay for its approval", async () => {
  const a = starter({ walletEth: 0n, approval: 5n * 10n ** 12n });
  await a.g.tick();
  assert.deepEqual(a.sent.map((x) => x[1]), [5n * 10n ** 12n]);
  assert.deepEqual(a.done, [[7, "sent"]]);
  await a.g.tick();
  assert.equal(a.sent.length, 1, "never twice");
});

test("approval top-up: skipped when the wallet can already pay, or when packs are off", async () => {
  const rich = starter({ walletEth: 5n * 10n ** 12n, approval: 5n * 10n ** 12n });
  await rich.g.tick();
  assert.deepEqual(rich.sent, []);
  assert.deepEqual(rich.done, [[7, "skipped"]]);
  const off = starter({ walletEth: 0n });
  await off.g.tick();
  assert.deepEqual(off.sent, []);
  assert.deepEqual(off.done, [[7, "skipped"]]);
});
