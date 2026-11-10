import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { encodeAbiParameters, encodeEventTopics, erc20Abi } from "viem";
import { decodeGift, Players } from "../src/feed/gifts.ts";
import { fmtWif } from "../src/push/planner.ts";
import type { RawLog } from "../src/intake/types.ts";
import { ALICE, BOB } from "./feedHelpers.ts";
import { tmpDir } from "./helpers.ts";

const WIF = "0x00000000000000000000000000000000000000c3";
const CAROL = "0x3333333333333333333333333333333333333333";

function transfer(from: string, to: string, value: bigint, address = WIF, block = 200, index = 1): RawLog {
  return {
    address,
    topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from: from as `0x${string}`, to: to as `0x${string}` } }) as string[],
    data: encodeAbiParameters([{ type: "uint256" }], [value]),
    blockNumber: "0x" + block.toString(16),
    transactionHash: "0x" + "ab".repeat(32),
    logIndex: "0x" + index.toString(16),
  };
}

function deps() {
  const players = new Players(join(tmpDir(), "players.json"));
  players.add(ALICE);
  players.add(BOB.toUpperCase().replace("0X", "0x"));
  return { wifAddress: WIF, players, blockTime: async (b: number) => 1_700_000_000 + b };
}

test("a WIF transfer between two players is a gift row", async () => {
  const g = await decodeGift(transfer(ALICE, BOB, 200n * 10n ** 18n), deps());
  assert.equal(g?.type, "gift");
  assert.deepEqual(g?.actors, [ALICE, BOB]);
  assert.deepEqual(g?.data, { from: ALICE, to: BOB, amount: String(200n * 10n ** 18n) });
  assert.equal(g?.ts, 1_700_000_200);
  assert.equal(g?.logIndex, 1);
});

test("transfers involving a non-player, to yourself, of zero, or from another token are ignored", async () => {
  const d = deps();
  assert.equal(await decodeGift(transfer(ALICE, CAROL, 5n), d), null); // CAROL never founded
  assert.equal(await decodeGift(transfer(CAROL, BOB, 5n), d), null);
  assert.equal(await decodeGift(transfer(ALICE, ALICE, 5n), d), null);
  assert.equal(await decodeGift(transfer(ALICE, BOB, 0n), d), null);
  assert.equal(await decodeGift(transfer(ALICE, BOB, 5n, "0x00000000000000000000000000000000000000d4"), d), null);
  assert.equal(await decodeGift({ ...transfer(ALICE, BOB, 5n), removed: true }, d), null);
});

test("players persist across restarts", () => {
  const path = join(tmpDir(), "players.json");
  const a = new Players(path);
  a.add(ALICE);
  a.add(ALICE);
  const b = new Players(path);
  assert.ok(b.has(ALICE.toUpperCase().replace("0X", "0x")));
  assert.equal(b.size, 1);
});

test("fmtWif", () => {
  assert.equal(fmtWif(String(1250n * 10n ** 18n)), "1,250");
  assert.equal(fmtWif(String(125n * 10n ** 17n)), "12.5");
  assert.equal(fmtWif(String(10n ** 16n)), "0.01");
  assert.equal(fmtWif("0"), "0");
});
