import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { join } from "node:path";
import type { FeedEvent } from "../src/feed/decode.ts";
import { Outbox } from "../src/feed/outbox.ts";
import { signedHeaders } from "../src/feed/signed.ts";
import { tmpDir } from "./helpers.ts";

const ev = (n: number): FeedEvent => ({ block: n, tx: "0x" + n.toString(16), logIndex: 0, ts: n, type: "tended", actors: [], data: {} });

test("signature is HMAC-SHA256(secret, timestamp + '.' + body) with the spec headers", () => {
  const h = signedHeaders("s3cret", '{"a":1}', 1730000000);
  assert.equal(h["x-c0-timestamp"], "1730000000");
  assert.equal(h["x-c0-signature"], createHmac("sha256", "s3cret").update('1730000000.{"a":1}').digest("hex"));
});

test("sends batches of at most 200 with signed headers, then empties", async () => {
  const sizes: number[] = [];
  const headers: Record<string, string>[] = [];
  const fetchFn = (async (_url: string, init: RequestInit) => {
    sizes.push(JSON.parse(init.body as string).events.length);
    headers.push(init.headers as Record<string, string>);
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const o = new Outbox({ file: join(tmpDir(), "o.json"), url: "http://x/api/feed/ingest", secret: "k", fetchFn, now: () => 1_000_000 });
  o.add(Array.from({ length: 450 }, (_, i) => ev(i)));
  assert.equal(await o.flush(), true);
  assert.deepEqual(sizes, [200, 200, 50]);
  assert.equal(o.size, 0);
  assert.equal(headers[0]["x-c0-timestamp"], "1000");
});

test("failures keep events, back off, and retry; restart resumes; duplicates are not queued twice", async () => {
  const dir = tmpDir();
  const file = join(dir, "o.json");
  let now = 1_000_000;
  let up = false;
  let calls = 0;
  const fetchFn = (async () => {
    calls++;
    return new Response("{}", { status: up ? 200 : 503 });
  }) as unknown as typeof fetch;
  const mk = () => new Outbox({ file, url: "http://x", secret: "k", fetchFn, now: () => now });
  const o = mk();
  o.add([ev(1), ev(2), ev(1)]);
  assert.equal(o.size, 2);
  assert.equal(await o.flush(), false);
  assert.equal(calls, 1);
  assert.equal(await o.flush(), false); // still backing off, no request
  assert.equal(calls, 1);

  const restarted = mk(); // crash and restart: queue is on disk
  assert.equal(restarted.size, 2);
  up = true;
  now += 10_000;
  assert.equal(await restarted.flush(), true);
  assert.equal(restarted.size, 0);
  assert.equal(mk().size, 0);
});
