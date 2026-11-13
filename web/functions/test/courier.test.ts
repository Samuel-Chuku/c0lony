import test from "node:test";
import assert from "node:assert/strict";
import { hashTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { courierConfig, courierDone, courierPending, courierStatus, courierSubmit } from "../_lib/courier.ts";
import { B, C, makeEnv, signedReq } from "./helpers.ts";

const COURIER = "0xec86fe12db326eBf69CFD3edE3EFa1F6b8405bFD".toLowerCase() as `0x${string}`;
const FEE_TO = C as `0x${string}`;
const acct = privateKeyToAccount("0x" + "11".repeat(32) as `0x${string}`);
const other = privateKeyToAccount("0x" + "22".repeat(32) as `0x${string}`);
const t = () => Math.floor(Date.now() / 1000);

const TYPES = {
  Send: [
    { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "amount", type: "uint256" },
    { name: "fee", type: "uint256" }, { name: "feeTo", type: "address" }, { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

type Over = { amount?: bigint; fee?: bigint; feeTo?: string; nonce?: bigint; deadline?: number; to?: string; signer?: typeof acct };

async function mkSend(o: Over = {}) {
  const msg = {
    from: acct.address, to: (o.to ?? B) as `0x${string}`, amount: o.amount ?? 100n * 10n ** 18n, fee: o.fee ?? 5n * 10n ** 18n,
    feeTo: (o.feeTo ?? FEE_TO) as `0x${string}`, nonce: o.nonce ?? 0n, deadline: BigInt(o.deadline ?? t() + 600),
  };
  const sig = await (o.signer ?? acct).signTypedData({
    domain: { name: "C0LONY Courier", version: "1", chainId: 46630, verifyingContract: COURIER },
    types: TYPES, primaryType: "Send", message: msg,
  });
  const send = Object.fromEntries(Object.entries(msg).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]));
  return { network: "testnet", send, sig };
}

const mkEnv = (opts: { network?: string; beat?: boolean | "stale" | "off" } = {}) => {
  const e = makeEnv({ NEXT_PUBLIC_NETWORK: opts.network ?? "testnet" });
  if (opts.beat !== false) {
    const seen = opts.beat === "stale" ? t() - 120 : t();
    e.d1.raw
      .prepare("INSERT INTO courier_keeper (network, enabled, min_fee, fee_to, courier, seen_at) VALUES ('testnet', ?, ?, ?, ?, ?)")
      .run(opts.beat === "off" ? 0 : 1, (5n * 10n ** 18n).toString(), FEE_TO, COURIER, seen);
  }
  return e;
};
const post = (body: unknown) => new Request("https://x.test/api/courier", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
const submit = async (env: ReturnType<typeof mkEnv>["env"], body: unknown) => {
  const r = await courierSubmit(post(body), env);
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
};

test("config reports the keeper heartbeat, only when fresh and enabled", async () => {
  const get = async (e: ReturnType<typeof mkEnv>) =>
    (await courierConfig(new Request("https://x.test/api/courier/config?network=testnet"), e.env)).json() as Promise<Record<string, unknown>>;
  const ok = await get(mkEnv());
  assert.equal(ok.enabled, true);
  assert.equal(ok.courier, COURIER);
  assert.equal(ok.feeTo, FEE_TO);
  assert.equal(ok.fee, (5n * 10n ** 18n).toString());
  assert.equal(ok.deadlineSec, 600);
  assert.equal(ok.approveAmount, "10000000000000000000000");
  for (const beat of [false, "stale", "off"] as const) {
    const r = await get(mkEnv({ beat }));
    assert.equal(r.enabled, false);
    assert.equal(r.courier, null);
  }
  const bad = await courierConfig(new Request("https://x.test/api/courier/config?network=nope"), mkEnv().env);
  assert.equal(bad.status, 400);
});

test("a valid signed send is queued and the id is the EIP-712 digest", async () => {
  const { env, d1 } = mkEnv();
  const body = await mkSend();
  const r = await submit(env, body);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "pending");
  const digest = hashTypedData({
    domain: { name: "C0LONY Courier", version: "1", chainId: 46630, verifyingContract: COURIER },
    types: TYPES, primaryType: "Send",
    message: {
      from: acct.address, to: B as `0x${string}`, amount: BigInt(body.send.amount as string), fee: BigInt(body.send.fee as string),
      feeTo: FEE_TO, nonce: 0n, deadline: BigInt(body.send.deadline as string),
    },
  }).toLowerCase();
  assert.equal(r.body.id, digest);
  const row = d1.raw.prepare("SELECT * FROM courier_requests").get() as { sender: string; receiver: string };
  assert.equal(row.sender, acct.address.toLowerCase());
  assert.equal(row.receiver, B);
});

test("the same signed message twice is one row", async () => {
  const { env, d1 } = mkEnv();
  const body = await mkSend();
  const a = await submit(env, body);
  const b = await submit(env, body);
  assert.equal(b.status, 200);
  assert.equal(a.body.id, b.body.id);
  assert.equal((d1.raw.prepare("SELECT COUNT(*) AS n FROM courier_requests").get() as { n: number }).n, 1);
});

test("rejects bad input", async () => {
  const { env, d1 } = mkEnv();
  const good = await mkSend();
  const cases: [string, unknown][] = [
    ["bad json", "{nope"],
    ["bad address", { ...good, send: { ...good.send, to: "0x123" } }],
    ["self send", { ...good, send: { ...good.send, to: acct.address } }],
    ["zero amount", { ...good, send: { ...good.send, amount: "0" } }],
    ["float amount", { ...good, send: { ...good.send, amount: "1.5" } }],
    ["huge uint", { ...good, send: { ...good.send, nonce: "9".repeat(79) } }],
    ["short sig", { ...good, sig: good.sig.slice(0, 100) }],
    ["no hex sig", { ...good, sig: "0x" + "z".repeat(130) }],
    ["unknown network", { ...good, network: "devnet" }],
    ["other network", { ...good, network: "mainnet" }],
    ["deadline past", await mkSend({ deadline: t() - 5 })],
    ["deadline too far", await mkSend({ deadline: t() + 1000 })],
    ["fee below min", await mkSend({ fee: 4n * 10n ** 18n })],
    ["wrong feeTo", await mkSend({ feeTo: B })],
    ["signer not from", await mkSend({ signer: other })],
    ["tampered field", { ...good, send: { ...good.send, amount: "1" } }],
  ];
  for (const [name, body] of cases) {
    const r = await submit(env, body);
    assert.ok(r.status >= 400 && r.status < 500, `${name}: ${r.status}`);
  }
  assert.equal((d1.raw.prepare("SELECT COUNT(*) AS n FROM courier_requests").get() as { n: number }).n, 0);
});

test("refuses when the keeper heartbeat is missing, stale or disabled", async () => {
  for (const beat of [false, "stale", "off"] as const) {
    const { env } = mkEnv({ beat });
    const r = await submit(env, await mkSend());
    assert.equal(r.status, 503, String(beat));
  }
});

test("rate limits: 6th pending is 429, then the daily caps", async () => {
  const { env, d1 } = mkEnv();
  for (let n = 0; n < 5; n++) assert.equal((await submit(env, await mkSend({ nonce: BigInt(n) }))).status, 200);
  const sixth = await submit(env, await mkSend({ nonce: 5n }));
  assert.equal(sixth.status, 429);
  assert.match(String(sixth.body.error), /Too many/);
  // finished sends free the pending slots but still count toward the 30 a day
  d1.raw.prepare("UPDATE courier_requests SET status = 'sent'").run();
  assert.equal((await submit(env, await mkSend({ nonce: 5n }))).status, 200);
  const ins = d1.raw.prepare(
    "INSERT INTO courier_requests VALUES (?, 'testnet', ?, ?, '1', '1', ?, '0', 1, '0x', 'sent', NULL, NULL, ?, ?, 'send', NULL)",
  );
  for (let n = 0; n < 24; n++) ins.run("0xdead" + n, acct.address.toLowerCase(), B, FEE_TO, t(), t());
  assert.equal((await submit(env, await mkSend({ nonce: 99n }))).status, 429);
  // another sender is fine until the network-wide cap
  d1.raw.prepare("DELETE FROM courier_requests").run();
  for (let n = 0; n < 500; n++) ins.run("0xbeef" + n, "0x" + (n + 1).toString(16).padStart(40, "0"), B, FEE_TO, t(), t());
  const r = await submit(env, await mkSend());
  assert.equal(r.status, 429);
});

test("status: unknown id is 404, a pending row past its deadline becomes expired", async () => {
  const { env, d1 } = mkEnv();
  const status = async (id: string) => courierStatus(new Request(`https://x.test/api/courier/status?id=${id}`), env);
  assert.equal((await status("0x" + "9".repeat(64))).status, 404);
  assert.equal((await status("nope")).status, 400);
  const { body } = await submit(env, await mkSend());
  const id = body.id as string;
  assert.deepEqual(await (await status(id)).json(), { id, status: "pending", reason: null, tx: null, purpose: "send", gasTx: null });
  d1.raw.prepare("UPDATE courier_requests SET deadline = ?").run(t() - 1);
  assert.equal(((await (await status(id)).json()) as { status: string }).status, "expired");
});

const beat = { enabled: true, minFee: (5n * 10n ** 18n).toString(), feeTo: FEE_TO, courier: COURIER };

test("pending and done need the keeper HMAC", async () => {
  const { env } = mkEnv();
  const plain = (path: string, b: unknown) => new Request("https://x.test" + path, { method: "POST", body: JSON.stringify(b) });
  assert.equal((await courierPending(plain("/api/courier/pending", { network: "testnet" }), env)).status, 401);
  assert.equal((await courierDone(plain("/api/courier/done", { id: "0x" + "1".repeat(64), status: "sent" }), env)).status, 401);
  const wrong = await signedReq("/api/courier/pending", { network: "testnet" }, { secret: "other" });
  assert.equal((await courierPending(wrong, env)).status, 401);
  const stale = await signedReq("/api/courier/pending", { network: "testnet" }, { ts: t() - 1000 });
  assert.equal((await courierPending(stale, env)).status, 401);
});

test("pending upserts the heartbeat, expires old rows and lists the oldest 20", async () => {
  const { env, d1 } = mkEnv({ beat: false });
  let r = await courierPending(await signedReq("/api/courier/pending", { network: "testnet", keeper: beat }), env);
  assert.deepEqual(((await r.json()) as { requests: unknown[] }).requests, []);
  const cfg = async () =>
    (await courierConfig(new Request("https://x.test/c?network=testnet"), env)).json() as Promise<{ enabled: boolean }>;
  assert.equal((await cfg()).enabled, true);
  for (let n = 0; n < 5; n++) await submit(env, await mkSend({ nonce: BigInt(n) }));
  d1.raw.prepare("UPDATE courier_requests SET deadline = ? WHERE nonce = '0'").run(t() - 1);
  r = await courierPending(await signedReq("/api/courier/pending", { network: "testnet", keeper: beat }), env);
  const list = ((await r.json()) as { requests: Record<string, string>[] }).requests;
  assert.equal(list.length, 4);
  assert.equal(list[0].sender, acct.address.toLowerCase());
  for (const k of ["id", "receiver", "amount", "fee", "feeTo", "nonce", "deadline", "sig"]) assert.ok(k in list[0], k);
  // keeper under its ETH floor: app stops offering it
  await courierPending(await signedReq("/api/courier/pending", { network: "testnet", keeper: { ...beat, enabled: false } }), env);
  assert.equal((await cfg()).enabled, false);
  // other network or a malformed heartbeat is refused
  assert.equal((await courierPending(await signedReq("/api/courier/pending", { network: "mainnet" }), env)).status, 400);
  assert.equal((await courierPending(await signedReq("/api/courier/pending", { network: "testnet", keeper: { ...beat, feeTo: "x" } }), env)).status, 400);
});

test("done moves forward only", async () => {
  const { env } = mkEnv();
  const { body } = await submit(env, await mkSend());
  const id = body.id as string;
  const tx = "0x" + "a".repeat(64);
  const done = async (b: Record<string, unknown>) =>
    ((await (await courierDone(await signedReq("/api/courier/done", { id, ...b }), env)).json()) as { updated: number }).updated;
  const status = async () =>
    (await (await courierStatus(new Request(`https://x.test/s?id=${id}`), env)).json()) as { status: string; tx: string | null; reason: string | null };
  assert.equal((await courierDone(await signedReq("/api/courier/done", { id, status: "bogus" }), env)).status, 400);
  assert.equal(await done({ status: "sending", tx }), 1);
  assert.deepEqual(await status(), { id, status: "sending", reason: null, tx, purpose: "send", gasTx: null });
  assert.equal(await done({ status: "sent", tx }), 1);
  assert.equal(await done({ status: "sending", tx }), 0);
  assert.equal(await done({ status: "failed", reason: "late" }), 0);
  assert.equal((await status()).status, "sent");
  // pending -> failed with a reason
  const two = await submit(env, await mkSend({ nonce: 1n }));
  const r = await courierDone(await signedReq("/api/courier/done", { id: two.body.id, status: "failed", reason: "BadNonce" }), env);
  assert.equal(((await r.json()) as { updated: number }).updated, 1);
  const s2 = await (await courierStatus(new Request(`https://x.test/s?id=${two.body.id}`), env)).json();
  assert.deepEqual(s2, { id: two.body.id, status: "failed", reason: "BadNonce", tx: null, purpose: "send", gasTx: null });
});


// ---- gas packs (docs/design/2026-11-13-wif-for-gas.md)

const PACK = { wei: String(10n ** 14n), wif: String(207n * 10n ** 18n) };
const gasBody = async (o: Over = {}) => ({ ...(await mkSend({ to: FEE_TO, amount: 207n * 10n ** 18n, ...o })), purpose: "gas" });
const advertise = (d1: ReturnType<typeof mkEnv>["d1"]) =>
  d1.raw.prepare("UPDATE courier_keeper SET pack_wei = ?, pack_wif = ?").run(PACK.wei, PACK.wif);

test("gas packs: config shows the pack only while the keeper advertises it, and the heartbeat sets it", async () => {
  const { env, d1 } = mkEnv({ beat: false });
  const cfg = async () =>
    (await courierConfig(new Request("https://x.test/c?network=testnet"), env)).json() as Promise<{ gasPack: unknown }>;
  await courierPending(await signedReq("/api/courier/pending", { network: "testnet", keeper: beat }), env);
  assert.equal((await cfg()).gasPack, null);
  await courierPending(await signedReq("/api/courier/pending", { network: "testnet", keeper: { ...beat, pack: PACK } }), env);
  assert.deepEqual((await cfg()).gasPack, PACK);
  await courierPending(await signedReq("/api/courier/pending", { network: "testnet", keeper: beat }), env);
  assert.equal((await cfg()).gasPack, null, "a heartbeat without a pack turns packs off");
  const bad = await courierPending(await signedReq("/api/courier/pending", { network: "testnet", keeper: { ...beat, pack: { wei: "x", wif: "1" } } }), env);
  assert.equal(bad.status, 400);
  void d1;
});

test("gas packs: a purchase is queued with its purpose, paid to the keeper, at the advertised price", async () => {
  const { env, d1 } = mkEnv();
  advertise(d1);
  const r = await submit(env, await gasBody());
  assert.equal(r.status, 200);
  const row = d1.raw.prepare("SELECT purpose, receiver FROM courier_requests").get() as { purpose: string; receiver: string };
  assert.deepEqual({ ...row }, { purpose: "gas", receiver: FEE_TO });
  const p = await courierPending(await signedReq("/api/courier/pending", { network: "testnet", keeper: { ...beat, pack: PACK } }), env);
  assert.equal(((await p.json()) as { requests: { purpose: string }[] }).requests[0].purpose, "gas");
  // 5% under the price is still honoured
  const ok = await submit(env, await gasBody({ amount: 197n * 10n ** 18n, nonce: 1n, signer: other }));
  assert.notEqual(ok.body.error, "price_changed");
});

test("gas packs: refused when off, paid elsewhere, under price, twice a day, or over the daily cap", async () => {
  const off = mkEnv();
  assert.equal((await submit(off.env, await gasBody())).body.error, "gas_off");
  const { env, d1 } = mkEnv();
  advertise(d1);
  assert.equal((await submit(env, await gasBody({ to: B }))).status, 400);
  assert.equal((await submit(env, await gasBody({ amount: 196n * 10n ** 18n }))).body.error, "price_changed");
  assert.equal((await submit(env, { ...(await gasBody()), purpose: "bogus" })).status, 400);
  assert.equal((await submit(env, await gasBody())).status, 200);
  assert.equal((await submit(env, await gasBody({ nonce: 1n }))).body.error, "gas_daily_limit");
  // a failed purchase doesn't count
  d1.raw.prepare("UPDATE courier_requests SET status = 'failed'").run();
  assert.equal((await submit(env, await gasBody({ nonce: 2n }))).status, 200);
  // network cap: 15 live purchases today from other wallets
  for (let i = 0; i < 15; i++) {
    d1.raw
      .prepare("INSERT INTO courier_requests VALUES (?, 'testnet', ?, ?, '1', '1', ?, '0', 1, '0x', 'sent', NULL, NULL, ?, ?, 'gas', NULL)")
      .run("0x" + String(i).padStart(64, "f"), "0x" + String(i).padStart(40, "e"), FEE_TO, FEE_TO, t(), t());
  }
  d1.raw.prepare("DELETE FROM courier_requests WHERE sender = ?").run(acct.address.toLowerCase());
  assert.equal((await submit(env, await gasBody({ nonce: 3n }))).body.error, "gas_busy");
});

test("gas packs: done records the pack transfer once, and status returns it", async () => {
  const { env, d1 } = mkEnv();
  advertise(d1);
  const { body } = await submit(env, await gasBody());
  const id = body.id as string;
  const tx = "0x" + "a".repeat(64);
  const gasTx = "0x" + "b".repeat(64);
  await courierDone(await signedReq("/api/courier/done", { id, status: "sent", tx }), env);
  await courierDone(await signedReq("/api/courier/done", { id, status: "sent", tx, gasTx }), env);
  await courierDone(await signedReq("/api/courier/done", { id, status: "sent", tx, gasTx: "0x" + "c".repeat(64) }), env);
  const s = (await (await courierStatus(new Request(`https://x.test/s?id=${id}`), env)).json()) as Record<string, unknown>;
  assert.deepEqual(s, { id, status: "sent", reason: null, tx, purpose: "gas", gasTx });
});
