import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildVoterTree } from "../src/voters/tree.ts";
import { publishVoterFiles } from "../src/voters/publish.ts";
import { tmpDir } from "./helpers.ts";

const A = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
const B = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";
const C = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC";

function read(dir: string, rel: string) {
  return JSON.parse(readFileSync(join(dir, rel), "utf8"));
}

test("writes one proof file per voter plus voters.json, all on the same root", () => {
  const dir = tmpDir();
  const { root, voters, proofs } = buildVoterTree([A, B, C]);
  publishVoterFiles(dir, { root, voters }, proofs);
  assert.equal(read(dir, "voters.json").root, root);
  assert.equal(readdirSync(join(dir, "proofs")).length, 3);
  const f = read(dir, `proofs/${A.toLowerCase()}.json`);
  assert.deepEqual(f, { address: A.toLowerCase(), root, proof: proofs[A.toLowerCase()] });
});

test("republishing swaps the whole set and leaves no temp folders", () => {
  const dir = tmpDir();
  const first = buildVoterTree([A, B]);
  publishVoterFiles(dir, { root: first.root }, first.proofs);
  const second = buildVoterTree([A, B, C]);
  publishVoterFiles(dir, { root: second.root }, second.proofs);
  assert.equal(read(dir, `proofs/${A.toLowerCase()}.json`).root, second.root);
  assert.ok(existsSync(join(dir, `proofs/${C.toLowerCase()}.json`)));
  assert.deepEqual(readdirSync(dir).sort(), ["proofs", "voters.json"]);
});
