import { test } from "node:test";
import assert from "node:assert/strict";
import { RANK_BATCH, SeasonCloser, rankOrder, type CloserChain, type ColonyResult } from "../src/season/closer.ts";

const row = (id: number, season: number, score: number, fedTwice = true, qualifies = true): ColonyResult => ({ id: BigInt(id), season, score: BigInt(score), fedTwice, qualifies });

test("rank order matches the pot: qualifying by score (ties lower id), then the rest by id", () => {
  const order = rankOrder([row(5, 1, 10, true, false), row(2, 1, 30), row(3, 1, 30), row(1, 1, 50), row(4, 1, 99, true, false)]);
  assert.deepEqual(order, [1n, 2n, 3n, 4n, 5n]);
});

function fake(opts: { now: number; end: number; colonies: ColonyResult[]; failEnd?: boolean }) {
  const pot = { ended: false, finalized: false, target: opts.colonies.filter((c) => c.season === 1 && c.fedTwice).length, submitted: 0 };
  const calls: string[] = [];
  const chain: CloserChain = {
    now: async () => opts.now,
    currentSeason: async () => (opts.now >= opts.end ? 2 : 1),
    seasonEnd: async (s) => opts.end + (s - 1) * 864000,
    potSeason: async (s) => (s === 1 ? { ...pot } : { ended: false, finalized: false, target: 0, submitted: 0 }),
    nextColonyId: async () => BigInt(opts.colonies.length + 1),
    colonyResult: async (id) => opts.colonies[Number(id) - 1],
    endSeason: async (s) => {
      calls.push(`end ${s}`);
      if (opts.failEnd) return false;
      pot.ended = true;
      if (pot.target === 0) pot.finalized = true;
      return true;
    },
    submitRanking: async (s, ids) => {
      calls.push(`rank ${s} ${ids.length}`);
      pot.submitted += ids.length;
      if (pot.submitted === pot.target) pot.finalized = true;
      return true;
    },
  };
  return { chain, calls, pot };
}

test("does nothing before the season ends", async () => {
  const f = fake({ now: 100, end: 200, colonies: [row(1, 1, 5)] });
  await new SeasonCloser({ chain: f.chain, log: () => {} }).tick();
  assert.deepEqual(f.calls, []);
});

test("ends, ranks in batches and finalizes; a second tick does nothing", async () => {
  const colonies = Array.from({ length: RANK_BATCH + 7 }, (_, i) => row(i + 1, 1, (i * 37) % 100));
  colonies.push(row(colonies.length + 1, 1, 3, false, false)); // never fed twice: not submitted
  colonies.push(row(colonies.length + 1, 2, 9)); // next season: not submitted
  const f = fake({ now: 300, end: 200, colonies });
  const c = new SeasonCloser({ chain: f.chain, log: () => {} });
  await c.tick();
  assert.deepEqual(f.calls, ["end 1", `rank 1 ${RANK_BATCH}`, "rank 1 7"]);
  assert.equal(f.pot.finalized, true);
  await c.tick();
  assert.equal(f.calls.length, 3);
});

test("a season nobody fed twice is final at endSeason", async () => {
  const f = fake({ now: 300, end: 200, colonies: [row(1, 1, 0, false, false)] });
  await new SeasonCloser({ chain: f.chain, log: () => {} }).tick();
  assert.deepEqual(f.calls, ["end 1"]);
  assert.equal(f.pot.finalized, true);
});

test("resumes a part-submitted ranking, and stops on a failed tx", async () => {
  const colonies = Array.from({ length: RANK_BATCH + 3 }, (_, i) => row(i + 1, 1, i));
  const f = fake({ now: 300, end: 200, colonies });
  f.pot.ended = true;
  f.pot.submitted = RANK_BATCH;
  await new SeasonCloser({ chain: f.chain, log: () => {} }).tick();
  assert.deepEqual(f.calls, ["rank 1 3"]);
  const g = fake({ now: 300, end: 200, colonies, failEnd: true });
  await new SeasonCloser({ chain: g.chain, log: () => {} }).tick();
  assert.deepEqual(g.calls, ["end 1"]);
});
