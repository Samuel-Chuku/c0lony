import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { renderFilter } from "../src/intake/filterTemplate.ts";
import { extractLogs } from "../src/intake/extract.ts";
import { transferLog, TRANSFER, topic, WIF } from "./helpers.ts";

const CANDIDATE = "0xFCA4b2e0b789Cb2e2957e644F950B32b3F096295";
const src = renderFilter("wif-votes", { addresses: [WIF], topics: [[TRANSFER], null, [topic(CANDIDATE)]] });

function run(stream: unknown) {
  const ctx: Record<string, unknown> = { BigInt };
  runInNewContext(src + "\nresult = main(stream);", Object.assign(ctx, { stream }));
  return ctx.result;
}

test("filter keeps only matching logs from a block_with_receipts payload", () => {
  const vote = transferLog("0x1111111111111111111111111111111111111111", CANDIDATE, 10n ** 18n, 60_000_000);
  const other = transferLog("0x1111111111111111111111111111111111111111", "0x9999999999999999999999999999999999999999", 1n, 60_000_000, 1);
  const out = run({ data: [{ block: { number: "0x3938700" }, receipts: [{ logs: [vote, other] }] }], metadata: {} }) as {
    logs: unknown[];
  };
  assert.equal(out.logs.length, 1);
  // The keeper parses the filter's output format
  assert.equal(extractLogs(out)[0].transactionHash, vote.transactionHash);
});

test("filter returns null for blocks with no matching logs", () => {
  assert.equal(run({ data: [{ receipts: [{ logs: [] }] }] }), null);
});
