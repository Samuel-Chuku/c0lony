import { test } from "node:test";
import assert from "node:assert/strict";
import { whenQuiet } from "../src/voters/refresh.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("a burst of vote batches leads to one root post, after things go quiet", async () => {
  let runs = 0;
  const trigger = whenQuiet(async () => void runs++, 30);
  for (let i = 0; i < 50; i++) {
    trigger();
    await wait(2);
  }
  assert.equal(runs, 0, "nothing posted while batches keep arriving");
  await wait(60);
  assert.equal(runs, 1, "posted exactly once after the burst");
});

test("votes arriving during a post get one more post afterwards", async () => {
  let runs = 0;
  const trigger = whenQuiet(async () => {
    runs++;
    await wait(40);
  }, 10);
  trigger();
  await wait(20); // first run is now in progress
  trigger();
  trigger();
  await wait(120);
  assert.equal(runs, 2);
});
