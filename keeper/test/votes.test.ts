import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { VoteStore, votesFilter, type VoteWallets } from "../src/voters/votes.ts";
import { extractLogs } from "../src/intake/extract.ts";
import { tmpDir, transferLog, WIF } from "./helpers.ts";

const C1 = "0xFCA4b2e0b789Cb2e2957e644F950B32b3F096295";
const C2 = "0x08BB76A2d34D7204cad9f6f54D82361E9Ddc49c1";
const wallets: VoteWallets = { event: "test", token: WIF, candidate_vote_wallets: [C1, C2] };
const A = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
const B = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";
const C = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC";

test("a voter sent at least 1 WIF to a candidate wallet (top-ups count)", () => {
  const store = new VoteStore(join(tmpDir(), "votes.json"), wallets);
  store.add([
    transferLog(A, C1, 10n ** 18n, 1), // a 1 WIF vote
    transferLog(B, C2, 2455n * 10n ** 18n, 2), // a large top-up still counts
    transferLog(C, C1, 10n ** 17n, 3), // 0.1 WIF: not a vote
    transferLog(C, "0x0000000000000000000000000000000000000001", 10n ** 18n, 4), // not a candidate
  ]);
  assert.deepEqual(store.voters(), [A.toLowerCase(), B.toLowerCase()].sort());
});

test("re-delivered logs are not double counted", () => {
  const store = new VoteStore(join(tmpDir(), "votes.json"), wallets);
  const l = transferLog(A, C1, 10n ** 18n, 1);
  assert.equal(store.add([l]), 1);
  assert.equal(store.add([l, l]), 0);
  assert.equal(store.stats().transfers, 1);
  assert.equal(store.stats().oneWifTransfers, 1);
});

test("ignores other tokens", () => {
  const store = new VoteStore(join(tmpDir(), "votes.json"), wallets);
  store.add([{ ...transferLog(A, C1, 10n ** 18n, 1), address: "0x0000000000000000000000000000000000000002" }]);
  assert.equal(store.voters().length, 0);
});

test("votes filter targets WIF Transfer logs to every candidate", () => {
  const f = votesFilter(wallets);
  assert.deepEqual(f.addresses, [WIF]);
  assert.equal(f.topics[2]?.length, 2);
  assert.equal(f.topics[1], null);
});

test("extracts logs from a block_with_receipts style payload with decimal numbers", () => {
  const payload = {
    data: [
      {
        block: { number: "0x3a0f6a1" },
        receipts: [
          {
            logs: [
              {
                address: WIF,
                topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", "0x0", "0x0"],
                data: "0x01",
                blockNumber: 60880545,
                transactionHash: "0xabc",
                logIndex: 7,
              },
            ],
          },
        ],
      },
    ],
  };
  const logs = extractLogs(payload);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].blockNumber, "0x" + (60880545).toString(16));
  assert.equal(logs[0].logIndex, "0x7");
});
