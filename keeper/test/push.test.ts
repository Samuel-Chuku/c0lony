import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import type { FeedEvent } from "../src/feed/decode.ts";
import { PushClient, type PushTarget } from "../src/push/client.ts";
import { fmtRes, PushPlanner } from "../src/push/planner.ts";
import { Scheduler, type Job } from "../src/push/scheduler.ts";
import { ALICE, BOB, FakeReader } from "./feedHelpers.ts";
import { tmpDir } from "./helpers.ts";

const H = 3600;

function setup(now = { t: 1_000_000 }) {
  const dir = tmpDir();
  const sent: { wallet: string; pref: string; body: string }[] = [];
  const fired: Job[] = [];
  const reader = new FakeReader();
  const target = (wallet: string, prefs: Record<string, boolean> = {}): PushTarget => ({ wallet, endpoint: "https://push/" + wallet, keys: { p256dh: "p", auth: "a" }, prefs });
  let targets: PushTarget[] = [target(ALICE), target(BOB)];
  const gone = new Set<string>();
  const pruned: string[][] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    if (url.includes("/api/push/targets")) {
      const { wallets } = JSON.parse(init!.body as string);
      return new Response(JSON.stringify({ targets: targets.filter((t) => wallets.includes(t.wallet)) }));
    }
    if (url.includes("/api/push/prune")) {
      pruned.push(JSON.parse(init!.body as string).endpoints);
      return new Response("{}");
    }
    if (url.includes("/api/profiles")) {
      return new Response(JSON.stringify({ profiles: url.includes(ALICE) ? { [ALICE]: { xHandle: "alice" } } : {} }));
    }
    return new Response("no", { status: 404 });
  }) as unknown as typeof fetch;
  const client = new PushClient({
    apiBase: "http://app",
    secret: "k",
    fetchFn,
    send: async (sub, body) => {
      if (gone.has(sub.endpoint)) throw Object.assign(new Error("gone"), { statusCode: 410 });
      const wallet = sub.endpoint.split("/").pop()!;
      const p = JSON.parse(body);
      sent.push({ wallet, pref: p.tag, body: p.body });
      fired.push(p);
    },
  });
  let planner: PushPlanner;
  const sched = new Scheduler({ file: join(dir, "j.json"), now: () => now.t, fire: (j) => planner.fire(j) });
  planner = new PushPlanner({ sched, client, chain: reader, rosterFile: join(dir, "r.json"), now: () => now.t });
  return { dir, sent, sched, planner, reader, now, client, setTargets: (t: PushTarget[]) => (targets = t), gone, pruned };
}

const ev = (type: FeedEvent["type"], actors: string[], data: FeedEvent["data"], block = 10, ts = 1_000_000): FeedEvent => ({
  block, tx: "0x" + block, logIndex: 0, ts, type, actors, data,
});

test("fmtRes formats RES units", () => {
  assert.equal(fmtRes("84000000000"), "84");
  assert.equal(fmtRes("1500000000"), "1.5");
  assert.equal(fmtRes("0"), "0");
});

test("fed schedules hungry12 and hungry2; a newer fed replaces them; an older replayed fed does not", async () => {
  const s = setup();
  await s.planner.onEvent(ev("fed", [ALICE], { fedUntil: 1_000_000 + 72 * H }, 10));
  assert.deepEqual(s.sched.pending.map((j) => j.pref).sort(), ["hungry12", "hungry2"]);
  await s.planner.onEvent(ev("fed", [ALICE], { fedUntil: 1_000_000 + 100 * H }, 20));
  assert.equal(s.sched.pending.length, 2);
  assert.ok(s.sched.pending.every((j) => j.at >= 1_000_000 + 88 * H));
  await s.planner.onEvent(ev("fed", [ALICE], { fedUntil: 1_000_000 + 72 * H }, 10)); // replay of the old one
  assert.ok(s.sched.pending.every((j) => j.at >= 1_000_000 + 88 * H));
});

test("scheduled push is sent once, honours prefs, and a replay does not resend", async () => {
  const s = setup();
  await s.planner.onEvent(ev("tended", [ALICE], {}, 10, 1_000_000)); // forage at +6h
  assert.equal(s.sched.pending[0].at, 1_000_000 + 6 * H);
  s.now.t += 6 * H + 5;
  await s.sched.tick();
  assert.equal(s.sent.length, 1);
  assert.match(s.sent[0].body, /Foragers are home/);
  await s.planner.onEvent(ev("tended", [ALICE], {}, 10, 1_000_000)); // replayed event
  s.now.t += 10;
  await s.sched.tick();
  assert.equal(s.sent.length, 1);

  s.setTargets([{ wallet: BOB, endpoint: "https://push/" + BOB, keys: { p256dh: "p", auth: "a" }, prefs: { forage: false } }]);
  await s.planner.onEvent(ev("tended", [BOB], {}, 30, s.now.t));
  s.now.t += 6 * H + 5;
  await s.sched.tick();
  assert.equal(s.sent.length, 1); // BOB opted out
});

test("jobs more than 30 minutes late are dropped, and survive a restart as pending until then", async () => {
  const s = setup();
  await s.planner.onEvent(ev("tended", [ALICE], {}, 10, 1_000_000));
  const again = new Scheduler({ file: join(s.dir, "j.json"), now: () => s.now.t + 6 * H + 31 * 60, fire: async () => "sent" });
  assert.equal(again.pending.length, 1);
  await again.tick();
  assert.equal(again.pending.length, 0);
});

test("avenge is skipped when already used", async () => {
  const s = setup();
  await s.planner.onEvent(ev("avenge_granted", [BOB, ALICE], { raidId: "5", defender: BOB, raider: ALICE, expiresAt: 1_000_000 + 24 * H }));
  assert.equal(s.sched.pending[0].at, 1_000_000 + 22 * H);
  s.reader.avenge.set(`${BOB}:${ALICE}`, false);
  s.now.t += 22 * H + 1;
  await s.sched.tick();
  assert.equal(s.sent.length, 0);
  assert.equal(s.sched.pending.length, 0);
});

test("avenge push names the raider by X handle", async () => {
  const s = setup();
  await s.planner.onEvent(ev("avenge_granted", [BOB, ALICE], { raidId: "5", defender: BOB, raider: ALICE, expiresAt: 1_000_000 + 24 * H }));
  s.now.t += 22 * H + 1;
  await s.sched.tick();
  assert.equal(s.sent[0].body, "Your free avenge on @alice ends in 2h.");
});

test("raided push falls back to a short address and is not repeated", async () => {
  const s = setup();
  const e = ev("raid_launched", [BOB, ALICE], { raidId: "3", raider: BOB, defender: ALICE, guardDeadline: 1_000_000 + 4 * H });
  await s.planner.onEvent(e);
  await s.planner.onEvent(e);
  assert.equal(s.sent.length, 1);
  assert.equal(s.sent[0].wallet, ALICE);
  assert.equal(s.sent[0].body, "0x2222…2222 is marching on your colony. Guard within 4h.");
});

test("settled pushes both players; stale replays are skipped; gone endpoints are pruned", async () => {
  const s = setup();
  const e = ev("settled", [ALICE, BOB], { raidId: "3", raider: ALICE, defender: BOB, outcome: "raider_won", lootResource: "sugar", lootAmount: "84000000000" });
  s.gone.add("https://push/" + BOB);
  await s.planner.onEvent(e);
  assert.equal(s.sent.length, 1);
  assert.equal(s.sent[0].body, "Raid result is in: you took 84 sugar.");
  assert.deepEqual(s.pruned, [["https://push/" + BOB]]);
  const stale = ev("settled", [ALICE, BOB], { raidId: "4", raider: ALICE, defender: BOB, outcome: "raider_lost" }, 11, 1_000_000 - 3600);
  await s.planner.onEvent(stale);
  assert.equal(s.sent.length, 1);
});

test("season reminders follow SeasonEndChanged", async () => {
  const s = setup();
  await s.planner.onEvent(ev("founded", [ALICE], { season: 1 }));
  const first = s.sched.pending.filter((j) => j.pref === "season");
  assert.equal(first.length, 1);
  await s.planner.onSeasonEndChanged(1, 3_000_000_000);
  const after = s.sched.pending.filter((j) => j.pref === "season");
  assert.equal(after.length, 1);
  assert.equal(after[0].at, 3_000_000_000 - 24 * H);
  await s.planner.onEvent(ev("collapsed", [ALICE], {}, 50));
  await s.planner.onSeasonEndChanged(1, 3_100_000_000);
  assert.equal(s.sched.pending.filter((j) => j.pref === "season").length, 0);
});
