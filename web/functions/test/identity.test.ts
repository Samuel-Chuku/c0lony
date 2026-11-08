import test from "node:test";
import assert from "node:assert/strict";
import { SignJWT, exportSPKI, generateKeyPair } from "jose";
import { ingest, profiles } from "../_lib/handlers.ts";
import { avatarGet, avatarUpload } from "../_lib/identity.ts";
import { A, B, ev, makeEnv, signedReq } from "./helpers.ts";

const APP = "app123";
const { publicKey, privateKey } = await generateKeyPair("ES256");
const pem = await exportSPKI(publicKey);
const tok = () => new SignJWT({}).setProtectedHeader({ alg: "ES256" }).setSubject("did:privy:u1")
  .setIssuer("privy.io").setAudience(APP).setIssuedAt().setExpirationTime("1h").sign(privateKey);
const mkEnv = () => makeEnv({ PRIVY_APP_ID: APP, PRIVY_VERIFICATION_KEY: pem, PRIVY_APP_SECRET: "shh" });
const privy = (async () => new Response(JSON.stringify({
  linked_accounts: [{ type: "wallet", chain_type: "ethereum", address: A, wallet_client_type: "privy" }],
}))) as unknown as typeof fetch;
const up = async (body: unknown) => new Request("https://x/", { method: "POST", body: JSON.stringify(body), headers: { authorization: `Bearer ${await tok()}` } });
const get = (q: string) => new Request("https://x" + q);
type P = { profiles: Record<string, { xHandle: string | null; name?: string; avatar?: string }> };

// 1x1 PNG
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("a name from a signed 'named' event shows in profiles, beside the X record", async () => {
  const { env, kv } = mkEnv();
  await kv.put(`w:${B}`, JSON.stringify({ wallet: B, xHandle: "bee", xAvatar: "http://x/b.png" }));
  await ingest(await signedReq("/", { events: [ev("named", [A], { name: "pixy" }), ev("named", [B], { name: "Bad Name" })] }), env);
  const p = (await (await profiles(get(`/api/profiles?wallets=${A},${B}`), env)).json()) as P;
  assert.equal(p.profiles[A].name, "pixy");
  assert.equal(p.profiles[A].xHandle, null);
  assert.equal(p.profiles[B].xHandle, "bee");
  assert.equal(p.profiles[B].name, undefined, "names that break the onchain rules are ignored");
  // a later rename wins
  await ingest(await signedReq("/", { events: [ev("named", [A], { name: "pixy2" })] }), env);
  const p2 = (await (await profiles(get(`/api/profiles?wallets=${A}`), env)).json()) as P;
  assert.equal(p2.profiles[A].name, "pixy2");
});

test("picture upload: owner only, image types only, size capped, served with safe headers", async () => {
  const { env } = mkEnv();
  assert.equal((await avatarUpload(await up({ wallet: B, image: `data:image/png;base64,${PNG}` }), env, privy)).status, 403);
  assert.equal((await avatarUpload(await up({ wallet: A, image: "data:image/svg+xml;base64,PHN2Zz4=" }), env, privy)).status, 400);
  assert.equal((await avatarUpload(await up({ wallet: A, image: `data:image/png;base64,${btoa("not a png at all")}` }), env, privy)).status, 400);
  const big = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47) + "x".repeat(120_000));
  assert.equal((await avatarUpload(await up({ wallet: A, image: `data:image/png;base64,${big}` }), env, privy)).status, 413);
  const ok = await avatarUpload(await up({ wallet: A, image: `data:image/png;base64,${PNG}` }), env, privy);
  assert.equal(ok.status, 200);
  const p = (await (await profiles(get(`/api/profiles?wallets=${A}`), env)).json()) as P;
  assert.match(p.profiles[A].avatar!, /^\/api\/avatar\?w=0xa{40}&v=\d+$/);
  const img = await avatarGet(get(p.profiles[A].avatar!), env);
  assert.equal(img.headers.get("content-type"), "image/png");
  assert.equal(img.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await img.arrayBuffer()).byteLength > 20, true);
  // removing it
  await avatarUpload(await up({ wallet: A, image: null }), env, privy);
  assert.equal((await avatarGet(get(`/api/avatar?w=${A}`), env)).status, 404);
});
