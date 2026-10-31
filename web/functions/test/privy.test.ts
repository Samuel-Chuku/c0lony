import test from "node:test";
import assert from "node:assert/strict";
import { SignJWT, exportSPKI, generateKeyPair } from "jose";
import { profile, pushSubscribe, pushTargets, pushPrefs, pushUnsubscribe } from "../_lib/handlers.ts";
import { verifyPrivyToken } from "../_lib/privy.ts";
import { A, B, makeEnv, signedReq } from "./helpers.ts";

const APP = "app123";
const { publicKey, privateKey } = await generateKeyPair("ES256");
const pem = await exportSPKI(publicKey);

const tok = (o: { iss?: string; aud?: string; exp?: string } = {}) =>
  new SignJWT({}).setProtectedHeader({ alg: "ES256" }).setSubject("did:privy:u1")
    .setIssuer(o.iss ?? "privy.io").setAudience(o.aud ?? APP).setIssuedAt().setExpirationTime(o.exp ?? "1h").sign(privateKey);

const privyEnv = () => makeEnv({ PRIVY_APP_ID: APP, PRIVY_VERIFICATION_KEY: pem, PRIVY_APP_SECRET: "shh" });
const req = (token: string | null, body: unknown = {}) =>
  new Request("https://x.test/", { method: "POST", body: JSON.stringify(body), headers: token ? { authorization: `Bearer ${token}` } : {} });

let calls: { url: string; headers: Record<string, string> }[] = [];
const mockFetch = (async (url: string, init: { headers: Record<string, string> }) => {
  calls.push({ url, headers: init.headers });
  return new Response(JSON.stringify({
    linked_accounts: [
      { type: "twitter_oauth", username: "ant", profile_picture_url: "https://p/a.png" },
      { type: "wallet", chain_type: "ethereum", address: A.toUpperCase().replace("0X", "0x") },
      { type: "wallet", chain_type: "solana", address: "So1" },
    ],
  }));
}) as unknown as typeof fetch;

test("token verification: good passes; wrong audience, issuer, expired fail", async () => {
  const { env } = privyEnv();
  assert.equal(await verifyPrivyToken(await tok(), env), "did:privy:u1");
  assert.equal(await verifyPrivyToken(await tok({ aud: "other" }), env), null);
  assert.equal(await verifyPrivyToken(await tok({ iss: "evil.io" }), env), null);
  assert.equal(await verifyPrivyToken(await tok({ exp: "-1m" }), env), null);
  assert.equal(await verifyPrivyToken("garbage", env), null);
  assert.equal(await verifyPrivyToken(null, env), null);
});

test("profile writes KV from Privy, ignoring the request body", async () => {
  const { env, kv } = privyEnv();
  calls = [];
  const res = await profile(req(await tok(), { xHandle: "evil", wallets: [B] }), env, mockFetch);
  assert.deepEqual(await res.json(), { wallets: [A], xHandle: "ant", xAvatar: "https://p/a.png" });
  assert.equal(calls[0].url, "https://api.privy.io/v1/users/did%3Aprivy%3Au1");
  assert.equal(calls[0].headers["privy-app-id"], APP);
  assert.equal(calls[0].headers.authorization, "Basic " + btoa(`${APP}:shh`));
  assert.ok(kv.m.has(`w:${A}`) && kv.m.has("u:did:privy:u1") && !kv.m.has(`w:${B}`));
  assert.equal((await profile(req(null), env, mockFetch)).status, 401);
});

test("push subscribe, prefs, targets, unsubscribe, prune", async () => {
  const { env } = privyEnv();
  const t = await tok();
  const sub = { endpoint: "https://push.example/1", keys: { p256dh: "pk", auth: "au" } };
  assert.equal((await pushSubscribe(req(t, { wallet: B, subscription: sub }), env, mockFetch)).status, 403);
  assert.equal((await pushSubscribe(req(t, { wallet: A, subscription: sub, prefs: { raided: false } }), env, mockFetch)).status, 200);
  const targets = async () =>
    ((await (await pushTargets(await signedReq("/", { wallets: [A, B] }), env)).json()) as { targets: { prefs: Record<string, boolean>; keys: unknown }[] }).targets;
  let ts = await targets();
  assert.equal(ts.length, 1);
  assert.equal(ts[0].prefs.raided, false);
  assert.equal(ts[0].prefs.result, true);
  assert.deepEqual(ts[0].keys, { p256dh: "pk", auth: "au" });
  await pushPrefs(req(t, { wallet: A, endpoint: sub.endpoint, prefs: { raided: true, season: false } }), env, mockFetch);
  ts = await targets();
  assert.equal(ts[0].prefs.raided, true);
  assert.equal(ts[0].prefs.season, false);
  await pushUnsubscribe(req(t, { endpoint: sub.endpoint }), env, mockFetch);
  assert.equal((await targets()).length, 0);
  await pushSubscribe(req(t, { wallet: A, subscription: sub }), env, mockFetch);
  const { pushPrune } = await import("../_lib/handlers.ts");
  await pushPrune(await signedReq("/", { endpoints: [sub.endpoint] }), env);
  assert.equal((await targets()).length, 0);
  assert.equal((await pushTargets(req(null, { wallets: [A] }), env)).status, 401);
});
