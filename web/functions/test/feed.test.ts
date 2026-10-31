import test from "node:test";
import assert from "node:assert/strict";
import { ingest, feed, stats, summary, profiles } from "../_lib/handlers.ts";
import { verifyHmac, signHmac } from "../_lib/hmac.ts";
import { route } from "../_lib/route.ts";
import type { Env } from "../_lib/env.ts";
import { A, B, C, SECRET, ev, makeEnv, signedReq } from "./helpers.ts";

const now = () => Math.floor(Date.now() / 1000);
const get = (path: string) => new Request("https://x.test" + path);

test("hmac accepts good, rejects bad signature and stale timestamp", async () => {
  const t = String(now());
  const sig = await signHmac(SECRET, t, "body");
  assert.equal((await verifyHmac(SECRET, t, sig, "body")).ok, true);
  assert.equal((await verifyHmac(SECRET, t, sig, "bodY")).ok, false);
  assert.equal((await verifyHmac(SECRET, t, "00" + sig.slice(2), "body")).ok, false);
  assert.equal((await verifyHmac(SECRET, null, sig, "body")).ok, false);
  const old = String(now() - 400);
  const oldSig = await signHmac(SECRET, old, "body");
  assert.equal((await verifyHmac(SECRET, old, oldSig, "body")).ok, false);
});

test("ingest rejects unsigned and stale requests with 401", async () => {
  const { env } = makeEnv();
  const bad = await ingest(new Request("https://x.test/", { method: "POST", body: "{}" }), env);
  assert.equal(bad.status, 401);
  const stale = await ingest(await signedReq("/", { events: [] }, { ts: now() - 1000 }), env);
  assert.equal(stale.status, 401);
});

test("functions 404 without FEED_DB and 405 on wrong method", async () => {
  const h = route("GET", feed);
  assert.equal((await h({ request: get("/"), env: {} })).status, 404);
  const { env } = makeEnv();
  assert.equal((await h({ request: new Request("https://x.test/", { method: "POST" }), env })).status, 405);
});

test("ingest is idempotent", async () => {
  const { env, d1 } = makeEnv();
  const batch = { events: [ev("founded", [A], { colonyId: 1 }), ev("settled", [A, B], {})] };
  const r1 = await (await ingest(await signedReq("/", batch), env)).json();
  const r2 = await (await ingest(await signedReq("/", batch), env)).json();
  assert.deepEqual(r1, { inserted: 2 });
  assert.deepEqual(r2, { inserted: 0 });
  assert.equal((d1.raw.prepare("SELECT COUNT(*) c FROM event_actors").get() as { c: number }).c, 3);
});

test("ingest strips target/resource on raid_launched and guarded", async () => {
  const { env } = makeEnv();
  const batch = {
    events: [
      ev("raid_launched", [A, B], { raidId: "1", target: "sugar", resource: "sugar", soldiers: 5 }),
      ev("guarded", [B], { raidId: "1", resource: "leaves", target: "leaves" }),
      ev("revealed", [A, B], { raidId: "1", target: "sugar" }),
    ],
  };
  await ingest(await signedReq("/", batch), env);
  const { events } = await (await feed(get("/api/feed?type=raids"), env)).json() as { events: { type: string; data: Record<string, unknown> }[] };
  for (const e of events) {
    if (e.type === "revealed") assert.equal(e.data.target, "sugar");
    else {
      assert.equal("target" in e.data, false);
      assert.equal("resource" in e.data, false);
    }
  }
  assert.equal(events.length, 3);
});

test("ingest rejects malformed events and oversize batches", async () => {
  const { env } = makeEnv();
  const bad = await ingest(await signedReq("/", { events: [{ ...ev("founded", ["nope"]) }] }), env);
  assert.equal(bad.status, 400);
  const big = await ingest(await signedReq("/", { events: Array.from({ length: 501 }, () => ev("founded", [A])) }), env);
  assert.equal(big.status, 400);
});

async function seed() {
  const { env, d1 } = makeEnv();
  const t = now();
  const events = [
    ev("founded", [A], {}, t - 100),
    ev("paid", [A], { burned: "1500000000000000000000" }, t - 90),
    ev("paid", [B], { burned: "250500000000000000000" }, t - 80),
    ev("tended", [A], {}, t - 70),
    ev("assigned", [A], {}, t - 60),
    ev("raid_launched", [A, B], { raidId: "1", raider: A, defender: B }, t - 50),
    ev("settled", [A, B], { raidId: "1", raider: A, defender: B, outcome: "raider_won", lootResource: "sugar", lootAmount: "300" }, t - 40),
    ev("settled", [A, B], { raidId: "2", raider: B, defender: A, outcome: "raider_won", lootResource: "leaves", lootAmount: "70" }, t - 35),
    ev("settled", [C, B], { raidId: "3", raider: C, defender: B, outcome: "guarded", lootResource: null, lootAmount: "0" }, t - 30),
    ev("avenge_granted", [B, A], { raidId: "1", defender: B, raider: A, expiresAt: t + 3600 }, t - 25),
    ev("claimed", [A], { amount: "5" }, t - 20),
    ev("sponsored", [C], { amount: "9" }, t - 10),
  ];
  await ingest(await signedReq("/", { events }), env);
  return { env, d1, t };
}
type Page = { events: { id: number; type: string }[] };
const page = async (env: Env, q: string) => (await (await feed(get("/api/feed" + q), env)).json()) as Page;

test("feed filters", async () => {
  const { env } = await seed();
  const all = await page(env, "?type=all");
  assert.ok(!all.events.some((e) => ["paid", "tended", "assigned"].includes(e.type)));
  assert.equal(all.events.length, 8);
  assert.ok(all.events[0].id > all.events[1].id);
  const raids = await page(env, "?type=raids");
  assert.equal(raids.events.length, 5);
  const pot = await page(env, "?type=pot");
  assert.deepEqual(pot.events.map((e) => e.type), ["sponsored", "claimed"]);
  const mine = await page(env, `?type=mine&wallet=${A.toUpperCase().replace("0X", "0x")}`);
  assert.ok(mine.events.length >= 5 && mine.events.some((e) => e.type === "paid"));
  const w = await page(env, `?type=raids&wallet=${C}`);
  assert.equal(w.events.length, 1);
  assert.equal((await feed(get("/api/feed?type=mine"), env)).status, 400);
  assert.equal((await feed(get("/api/feed?type=zzz"), env)).status, 400);
  assert.equal((await feed(get("/api/feed?wallet=0x12"), env)).status, 400);
});

test("feed limit clamp and before cursor", async () => {
  const { env } = await seed();
  assert.equal((await page(env, "?limit=3")).events.length, 3);
  assert.equal((await page(env, "?limit=0")).events.length, 1);
  assert.equal((await page(env, "?limit=9999")).events.length, 8);
  const first = await page(env, "?limit=2");
  const next = await page(env, `?limit=2&before=${first.events[1].id}`);
  assert.ok(next.events.every((e) => e.id < first.events[1].id));
  const res = await feed(get("/api/feed"), env);
  assert.equal(res.headers.get("cache-control"), "public, max-age=10");
});

test("stats sums burned and counts raids", async () => {
  const { env } = await seed();
  const res = await stats(get("/"), env);
  assert.deepEqual(await res.json(), { burnedWif: "1750.5", raidsToday: 1 });
  assert.equal(res.headers.get("cache-control"), "public, max-age=30");
});

test("summary counts and avenge", async () => {
  const { env, t } = await seed();
  const res = await summary(get(`/api/feed/summary?wallet=${B}&since=${t - 1000}`), env);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const s = await res.json() as Record<string, unknown> & { rows: unknown[]; avenge: { raider: string; raidId: string } };
  assert.equal(s.raided, 1);
  assert.equal(s.defended, 1);
  assert.equal(s.raidsWon, 1);
  assert.equal(s.raidsLost, 0);
  assert.equal(s.lostSugar, "300");
  assert.equal(s.lostLeaves, "0");
  assert.equal(s.wonLeaves, "70");
  assert.equal(s.avenge.raider, A);
  assert.equal(s.avenge.raidId, "1");
  assert.ok(s.rows.length <= 20);
  const none = await (await summary(get(`/api/feed/summary?wallet=${C}&since=${t - 1000}`), env)).json() as { avenge: unknown };
  assert.equal(none.avenge, null);
  assert.equal((await summary(get("/api/feed/summary"), env)).status, 400);
});

test("profiles batch read", async () => {
  const { env, kv } = makeEnv();
  await kv.put(`w:${A}`, JSON.stringify({ wallet: A, xHandle: "ant", xAvatar: "http://a/p.png", updatedAt: 1 }));
  const res = await profiles(get(`/api/profiles?wallets=${A},${B},junk`), env);
  assert.deepEqual(await res.json(), { profiles: { [A]: { xHandle: "ant", xAvatar: "http://a/p.png" } } });
  assert.equal(res.headers.get("cache-control"), "public, max-age=60");
});
