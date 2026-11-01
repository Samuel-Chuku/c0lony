import test from "node:test";
import assert from "node:assert/strict";
import { SignJWT, exportSPKI, generateKeyPair } from "jose";
import { gasDone, gasPending, gasStarter } from "../_lib/handlers.ts";
import { A, B, makeEnv, signedReq } from "./helpers.ts";

const APP = "app123";
const { publicKey, privateKey } = await generateKeyPair("ES256");
const pem = await exportSPKI(publicKey);

const tok = (sub = "did:privy:u1") =>
  new SignJWT({}).setProtectedHeader({ alg: "ES256" }).setSubject(sub)
    .setIssuer("privy.io").setAudience(APP).setIssuedAt().setExpirationTime("1h").sign(privateKey);

const mkEnv = (network?: string) =>
  makeEnv({ PRIVY_APP_ID: APP, PRIVY_VERIFICATION_KEY: pem, PRIVY_APP_SECRET: "shh", NEXT_PUBLIC_NETWORK: network });
const req = (token: string | null, body: unknown) =>
  new Request("https://x.test/", { method: "POST", body: JSON.stringify(body), headers: token ? { authorization: `Bearer ${token}` } : {} });

// A is embedded, B is an external wallet.
const mockFetch = (async () =>
  new Response(JSON.stringify({
    linked_accounts: [
      { type: "wallet", chain_type: "ethereum", address: A, wallet_client_type: "privy" },
      { type: "wallet", chain_type: "ethereum", address: B, wallet_client_type: "metamask" },
    ],
  }))) as unknown as typeof fetch;

const ask = async (env: ReturnType<typeof mkEnv>["env"], wallet: string, sub?: string) =>
  (await gasStarter(req(await tok(sub), { wallet }), env, mockFetch)).json() as Promise<{ status: string; message: string }>;

const rows = (d1: ReturnType<typeof mkEnv>["d1"]) =>
  d1.raw.prepare("SELECT * FROM gas_requests ORDER BY id").all() as { id: number; status: string; wallet: string; did: string; network: string }[];

test("testnet: any linked wallet, once per 24h per wallet", async () => {
  const { env, d1 } = mkEnv("testnet");
  assert.equal((await ask(env, A)).status, "queued");
  assert.equal((await ask(env, A)).status, "already");
  assert.equal((await ask(env, B)).status, "queued");
  assert.equal(rows(d1).length, 2);
  d1.raw.prepare("UPDATE gas_requests SET createdAt = createdAt - 90000").run();
  assert.equal((await ask(env, A)).status, "queued");
});

test("mainnet: embedded only, once ever per did and per wallet", async () => {
  const { env, d1 } = mkEnv("mainnet");
  assert.equal((await ask(env, B)).status, "not-eligible");
  assert.equal((await ask(env, A)).status, "queued");
  d1.raw.prepare("UPDATE gas_requests SET createdAt = createdAt - 999999").run();
  assert.equal((await ask(env, A)).status, "already");
  // same did, different wallet is also refused (even if it were embedded)
  d1.raw.prepare("UPDATE gas_requests SET wallet = ? WHERE id = 1").run("0x" + "9".repeat(40));
  assert.equal((await ask(env, A)).status, "already");
  // same wallet, different did
  d1.raw.prepare("UPDATE gas_requests SET did = 'other', wallet = ? WHERE id = 1").run(A);
  assert.equal((await ask(env, A)).status, "already");
  assert.equal(rows(d1).every((r) => r.network === "mainnet"), true);
});

test("failed or skipped requests do not use the allowance", async () => {
  const { env, d1 } = mkEnv("mainnet");
  assert.equal((await ask(env, A)).status, "queued");
  d1.raw.prepare("UPDATE gas_requests SET status = 'failed'").run();
  assert.equal((await ask(env, A)).status, "queued");
});

test("daily caps: 100 testnet, 25 mainnet", async () => {
  for (const [net, cap] of [["testnet", 100], ["mainnet", 25]] as const) {
    const { env, d1 } = mkEnv(net);
    const now = Math.floor(Date.now() / 1000);
    const ins = d1.raw.prepare("INSERT INTO gas_requests (did, wallet, network, status, createdAt, updatedAt) VALUES (?, ?, ?, 'sent', ?, ?)");
    for (let i = 0; i < cap; i++) ins.run(`d${i}`, "0x" + i.toString(16).padStart(40, "0"), net, now, now);
    assert.equal((await ask(env, A)).status, "limit");
    d1.raw.prepare("UPDATE gas_requests SET createdAt = ?").run(now - 90000);
    assert.equal((await ask(env, A)).status, "queued");
  }
});

test("a wallet not owned by the user is rejected; bad token and bad wallet fail", async () => {
  const { env } = mkEnv("testnet");
  const other = "0x" + "d".repeat(40);
  assert.equal((await gasStarter(req(await tok(), { wallet: other }), env, mockFetch)).status, 403);
  assert.equal((await gasStarter(req(null, { wallet: A }), env, mockFetch)).status, 401);
  assert.equal((await gasStarter(req(await tok(), { wallet: "nope" }), env, mockFetch)).status, 400);
});

test("pending and done need the HMAC; done updates once", async () => {
  const { env } = mkEnv("testnet");
  await ask(env, A);
  await ask(env, B);
  const bad = await signedReq("/api/gas/pending", {}, { secret: "wrong" });
  assert.equal((await gasPending(bad, env)).status, 401);
  const list = (await (await gasPending(await signedReq("/api/gas/pending", {}), env)).json()) as { requests: { id: number; wallet: string }[] };
  assert.deepEqual(list.requests.map((r) => r.wallet), [A, B]);
  const tx = "0x" + "e".repeat(64);
  const done = await gasDone(await signedReq("/api/gas/done", { id: list.requests[0].id, status: "sent", tx }), env);
  assert.deepEqual(await done.json(), { ok: true, updated: 1 });
  assert.equal((await gasDone(await signedReq("/api/gas/done", { id: list.requests[1].id, status: "weird" }), env)).status, 400);
  await gasDone(await signedReq("/api/gas/done", { id: list.requests[1].id, status: "skipped" }), env);
  const after = (await (await gasPending(await signedReq("/api/gas/pending", {}), env)).json()) as { requests: unknown[] };
  assert.equal(after.requests.length, 0);
  assert.equal((await gasDone(await signedReq("/api/gas/done", { id: 1, status: "failed" }, { secret: "wrong" }), env)).status, 401);
});
