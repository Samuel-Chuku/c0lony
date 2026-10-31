import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeLog, decodeRaw } from "../src/feed/decode.ts";
import { ALICE, BOB, bytes32, decodeDeps, GAME, makeLog, POT } from "./feedHelpers.ts";

const colony = (n: number) => BigInt(n);

test("founded, fed, tended, built map to feed rows", async () => {
  const d = decodeDeps();
  const founded = await decodeLog(makeLog("game", "ColonyFounded", { colonyId: colony(7), owner: ALICE, season: 1, foundedAt: 5n, seasonDay: 3 }, 50, 2), d);
  assert.equal(founded?.type, "founded");
  assert.deepEqual(founded?.actors, [ALICE]);
  assert.deepEqual(founded?.data, { colonyId: 7, season: 1, seasonDay: 3 });
  assert.equal(founded?.block, 50);
  assert.equal(founded?.logIndex, 2);
  assert.equal(founded?.ts, 1_700_000_050);

  const fed = await decodeLog(makeLog("game", "QueenFed", { colonyId: 7n, owner: ALICE, workersAfter: 12, born: 3, died: 1, scoreAdded: 25n, totalScore: 100n, fedUntil: 999n }), d);
  assert.deepEqual(fed?.data, { colonyId: 7, workers: 12, born: 3, died: 1, scoreAdded: "25", totalScore: "100", fedUntil: 999 });

  const tended = await decodeLog(makeLog("game", "Tended", { colonyId: 7n, owner: ALICE, leavesGained: 5_000_000_000n, sugarGained: 0n }), d);
  assert.deepEqual(tended?.data, { colonyId: 7, leaves: "5000000000", sugar: "0" });

  const built = await decodeLog(makeLog("game", "Built", { colonyId: 7n, owner: ALICE, building: bytes32("farm"), leavesCost: 1n, sugarCost: 2n, newCount: 4 }), d);
  assert.deepEqual(built?.data, { colonyId: 7, building: "farm", leavesCost: "1", sugarCost: "2", count: 4 });
});

test("assigned, sped_up, shielded, revived, collapsed", async () => {
  const d = decodeDeps();
  const a = await decodeLog(makeLog("game", "WorkersAssigned", { colonyId: 1n, owner: ALICE, trailWorkers: 2, farmWorkers: 3, idle: 1 }), d);
  assert.deepEqual(a?.data, { colonyId: 1, trailWorkers: 2, farmWorkers: 3, idle: 1 });
  const s = await decodeLog(makeLog("game", "SpedUp", { colonyId: 1n, owner: ALICE, forage: 2 }), d);
  assert.equal(s?.type, "sped_up");
  assert.equal(s?.data.forage, "sugar");
  assert.deepEqual((await decodeLog(makeLog("game", "Shielded", { colonyId: 1n, owner: ALICE, until: 77n }), d))?.data, { colonyId: 1, until: 77 });
  assert.equal((await decodeLog(makeLog("game", "Revived", { colonyId: 1n, owner: ALICE }), d))?.type, "revived");
  assert.equal((await decodeLog(makeLog("game", "ColonyCollapsed", { colonyId: 1n, owner: ALICE }), d))?.type, "collapsed");
});

test("raid_launched and guarded carry no resource", async () => {
  const d = decodeDeps();
  const launched = await decodeLog(
    makeLog("game", "RaidLaunched", { raidId: 9n, raider: 1n, defender: 2n, raiderOwner: ALICE, defenderOwner: BOB, soldiers: 4, guardDeadline: 5000n, isAvenge: false }),
    d,
  );
  assert.deepEqual(launched?.actors, [ALICE, BOB]);
  assert.equal(launched?.data.raidId, "9");
  assert.deepEqual(Object.keys(launched!.data).sort(), ["defender", "defenderColony", "guardDeadline", "isAvenge", "raider", "raiderColony", "raidId", "soldiers"].sort());
  assert.ok(!("target" in launched!.data) && !("guard" in launched!.data) && !("resource" in launched!.data));

  const guarded = await decodeLog(makeLog("game", "Guarded", { raidId: 9n, defender: 2n, owner: BOB, resource: 1 }), d);
  assert.deepEqual(guarded?.data, { raidId: "9", defender: BOB });
  assert.deepEqual(guarded?.actors, [BOB]);
});

test("revealed and collected take actors from the launch, or fall back to a chain lookup", async () => {
  const d = decodeDeps();
  await decodeLog(makeLog("game", "RaidLaunched", { raidId: 9n, raider: 1n, defender: 2n, raiderOwner: ALICE, defenderOwner: BOB, soldiers: 4, guardDeadline: 5000n, isAvenge: false }), d);
  const rev = await decodeLog(makeLog("game", "Revealed", { raidId: 9n, target: 1, round: 123n, roundTime: 456n }), d);
  assert.deepEqual(rev?.actors, [ALICE, BOB]);
  assert.deepEqual(rev?.data, { raidId: "9", target: "leaves", round: 123, roundTime: 456 });
  const col = await decodeLog(makeLog("game", "RaidCollected", { raidId: 9n, status: 5, soldiersLost: 0 }), d);
  assert.deepEqual(col?.data, { raidId: "9", status: "refunded", soldiersLost: 0 });

  const d2 = decodeDeps({ lookupRaid: async () => ({ raider: ALICE, defender: BOB }) });
  const rev2 = await decodeLog(makeLog("game", "Revealed", { raidId: 77n, target: 2, round: 1n, roundTime: 2n }), d2);
  assert.deepEqual(rev2?.actors, [ALICE, BOB]);
  assert.equal(d2.directory.get(77n)?.raider, ALICE);
});

test("settled, avenge_granted, paid", async () => {
  const d = decodeDeps();
  const s = await decodeLog(
    makeLog("game", "RaidSettled", {
      raidId: 9n, raider: 1n, defender: 2n, raiderOwner: ALICE, defenderOwner: BOB, outcome: 1, roll: 42n,
      lootResource: 2, lootAmount: 84_000_000_000n, soldiersLost: 1, round: 8n, settler: ALICE, refund: 0n,
    }),
    d,
  );
  assert.deepEqual(s?.data, {
    raidId: "9", raider: ALICE, defender: BOB, outcome: "raider_won", roll: "42", lootResource: "sugar",
    lootAmount: "84000000000", soldiersLost: 1, round: 8,
  });
  const guardedOutcome = await decodeLog(
    makeLog("game", "RaidSettled", {
      raidId: 9n, raider: 1n, defender: 2n, raiderOwner: ALICE, defenderOwner: BOB, outcome: 3, roll: 1n,
      lootResource: 0, lootAmount: 0n, soldiersLost: 0, round: 8n, settler: ALICE, refund: 0n,
    }),
    decodeDeps(),
  );
  assert.equal(guardedOutcome?.data.outcome, "guarded");
  assert.equal(guardedOutcome?.data.lootResource, null);

  const av = await decodeLog(makeLog("game", "AvengeGranted", { defender: BOB, raider: ALICE, raidId: 9n, expiresAt: 99n }), d);
  assert.deepEqual(av?.actors, [BOB, ALICE]);
  assert.equal(av?.data.expiresAt, 99);

  const paid = await decodeLog(makeLog("game", "Paid", { colonyId: 1n, player: ALICE, action: bytes32("speedUp"), amount: 10n, toPot: 7n, burned: 2n, toTreasury: 1n }), d);
  assert.deepEqual(paid?.data, { colonyId: 1, action: "speedUp", amount: "10", toPot: "7", burned: "2", toTreasury: "1" });
});

test("season pot events", async () => {
  const d = decodeDeps();
  const sp = await decodeLog(makeLog("pot", "Sponsored", { season: 1, sponsor: ALICE, amount: 5n, name: "Acme" }), d);
  assert.deepEqual(sp?.data, { season: 1, amount: "5", name: "Acme" });
  assert.deepEqual(sp?.actors, [ALICE]);
  assert.deepEqual((await decodeLog(makeLog("pot", "SeasonEnded", { season: 1, pot: 9n, coloniesToRank: 3 }), d))?.actors, []);
  assert.equal((await decodeLog(makeLog("pot", "SeasonFinalized", { season: 1, qualified: 3, topCount: 1, sumAll: 1n, sumTop: 1n }), d))?.data.topCount, 1);
  const cl = await decodeLog(makeLog("pot", "Claimed", { season: 1, colonyId: 4n, player: ALICE, amount: 8n }), d);
  assert.deepEqual(cl?.data, { season: 1, colonyId: 4, amount: "8" });
  assert.equal((await decodeLog(makeLog("pot", "UnclaimedRolled", { fromSeason: 1, toSeason: 2, amount: 3n }), d))?.type, "unclaimed_rolled");
});

test("events outside the feed and foreign logs are ignored", async () => {
  const d = decodeDeps();
  assert.equal(await decodeLog(makeLog("game", "SeasonStarted", { season: 2, start: 1n, end: 2n }), d), null);
  assert.equal(await decodeLog(makeLog("pot", "Deposited", { season: 1, from: ALICE, amount: 1n, newPot: 1n }), d), null);
  const foreign = { ...makeLog("game", "Revived", { colonyId: 1n, owner: ALICE }), address: "0x00000000000000000000000000000000000000ff" };
  assert.equal(await decodeLog(foreign, d), null);
  assert.equal(decodeRaw(foreign, GAME, POT), null);
});
