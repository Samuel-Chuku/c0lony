import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { StreamsWebhookServer } from "../src/intake/streamsWebhook.ts";
import type { LogFilter, RawLog } from "../src/intake/types.ts";
import { sign, transferLog, TRANSFER, topic, WIF } from "./helpers.ts";

const CANDIDATE = "0xFCA4b2e0b789Cb2e2957e644F950B32b3F096295";
const filter: LogFilter = { addresses: [WIF], topics: [[TRANSFER], null, [topic(CANDIDATE)]] };

async function setup(handler?: (logs: RawLog[]) => Promise<void>) {
  const server = new StreamsWebhookServer({
    maxAgeSec: 600,
    get: (p) => (p === "/voters/proof/x" ? { status: 200, body: { ok: true } } : undefined),
  });
  const received: RawLog[][] = [];
  const src = server.route("/streams/votes", "secret", filter);
  await src.start(handler ?? (async (logs) => void received.push(logs)));
  const port = await server.listen(0, "127.0.0.1");
  const post = async (body: string, opts: { token?: string; nonce?: string; ts?: string; gzip?: boolean } = {}) => {
    const nonce = opts.nonce ?? Math.random().toString(36).slice(2);
    const ts = opts.ts ?? String(Math.floor(Date.now() / 1000));
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-qn-nonce": nonce,
      "x-qn-timestamp": ts,
      "x-qn-signature": sign(opts.token ?? "secret", nonce, ts, body),
    };
    if (opts.gzip) headers["content-encoding"] = "gzip";
    const res = await fetch(`http://127.0.0.1:${port}/streams/votes`, {
      method: "POST",
      headers,
      body: opts.gzip ? gzipSync(body) : body,
    });
    return { status: res.status, text: await res.text() };
  };
  return { server, port, received, post };
}

const vote = transferLog("0x1111111111111111111111111111111111111111", CANDIDATE, 10n ** 18n, 60_000_000);
const other = transferLog("0x2222222222222222222222222222222222222222", "0x3333333333333333333333333333333333333333", 5n, 60_000_001);

test("accepts a signed delivery and passes only matching logs", async () => {
  const { server, received, post } = await setup();
  const r = await post(JSON.stringify({ stream: "wif-votes", logs: [vote, other] }));
  assert.equal(r.status, 200);
  assert.equal(received.length, 1);
  assert.equal(received[0].length, 1);
  assert.equal(received[0][0].transactionHash, vote.transactionHash);
  await server.close();
});

test("verifies gzip deliveries over the decoded body", async () => {
  const { server, received, post } = await setup();
  const r = await post(JSON.stringify({ logs: [vote] }), { gzip: true });
  assert.equal(r.status, 200);
  assert.equal(received.length, 1);
  await server.close();
});

test("rejects a bad signature (401) and missing headers (400)", async () => {
  const { server, port, received, post } = await setup();
  assert.equal((await post(JSON.stringify({ logs: [vote] }), { token: "wrong" })).status, 401);
  const res = await fetch(`http://127.0.0.1:${port}/streams/votes`, { method: "POST", body: "{}" });
  assert.equal(res.status, 400);
  assert.equal(received.length, 0);
  await server.close();
});

test("rejects stale timestamps", async () => {
  const { server, received, post } = await setup();
  const old = String(Math.floor(Date.now() / 1000) - 3600);
  assert.equal((await post(JSON.stringify({ logs: [vote] }), { ts: old })).status, 401);
  assert.equal(received.length, 0);
  await server.close();
});

test("a replayed nonce is acknowledged but not processed twice", async () => {
  const { server, received, post } = await setup();
  const body = JSON.stringify({ logs: [vote] });
  const ts = String(Math.floor(Date.now() / 1000));
  assert.equal((await post(body, { nonce: "same", ts })).status, 200);
  assert.equal((await post(body, { nonce: "same", ts })).text, "duplicate");
  assert.equal(received.length, 1);
  await server.close();
});

test("handler failure returns 500 so Quicknode retries", async () => {
  const { server, post } = await setup(async () => {
    throw new Error("db down");
  });
  assert.equal((await post(JSON.stringify({ logs: [vote] }))).status, 500);
  await server.close();
});

test("unknown path is 404; GET endpoints and /health are served", async () => {
  const { server, port } = await setup();
  assert.equal((await fetch(`http://127.0.0.1:${port}/streams/nope`, { method: "POST" })).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
  const r = await fetch(`http://127.0.0.1:${port}/voters/proof/x`);
  assert.deepEqual(await r.json(), { ok: true });
  await server.close();
});
