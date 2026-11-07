import test from "node:test";
import assert from "node:assert/strict";
import { SignJWT, exportSPKI, generateKeyPair } from "jose";
import { tgLink, tgPrefs, tgPrune, tgStatus, tgTargets, tgUnlink, tgWebhook } from "../_lib/telegram.ts";
import { A, B, makeEnv, signedReq } from "./helpers.ts";

const APP = "app123";
const { publicKey, privateKey } = await generateKeyPair("ES256");
const pem = await exportSPKI(publicKey);
const tok = () =>
  new SignJWT({}).setProtectedHeader({ alg: "ES256" }).setSubject("did:privy:u1")
    .setIssuer("privy.io").setAudience(APP).setIssuedAt().setExpirationTime("1h").sign(privateKey);

const TG = { TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_BOT_USERNAME: "c0lony_bot", TELEGRAM_WEBHOOK_SECRET: "hook" };
const mkEnv = (network = "mainnet", extra: Record<string, unknown> = TG) =>
  makeEnv({ PRIVY_APP_ID: APP, PRIVY_VERIFICATION_KEY: pem, PRIVY_APP_SECRET: "shh", NEXT_PUBLIC_NETWORK: network, ...extra });

// Privy says the user owns A only. Telegram calls are recorded.
function fakes() {
  const sent: { method: string; body: Record<string, unknown> }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    if (url.startsWith("https://api.telegram.org/")) {
      sent.push({ method: url.split("/").pop()!, body: JSON.parse(String(init?.body)) });
      return new Response("{}");
    }
    return new Response(JSON.stringify({ linked_accounts: [{ type: "wallet", chain_type: "ethereum", address: A, wallet_client_type: "privy" }] }));
  }) as unknown as typeof fetch;
  return { f, sent };
}
const authReq = async (body: unknown) =>
  new Request("https://app.test/", { method: "POST", body: JSON.stringify(body), headers: { authorization: `Bearer ${await tok()}` } });
const hook = (text: string, chatId = 42, secret = "hook", type = "private") =>
  new Request("https://app.test/api/telegram/webhook", {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify({ update_id: 1, message: { message_id: 1, text, chat: { id: chatId, type } } }),
  });
const codeOf = (url: string) => new URL(url).searchParams.get("start")!;

test("off on testnet and without a bot token", async () => {
  const { f } = fakes();
  assert.equal((await tgLink(await authReq({ wallet: A }), mkEnv("testnet").env, f)).status, 404);
  assert.equal((await tgLink(await authReq({ wallet: A }), mkEnv("mainnet", {}).env, f)).status, 404);
  assert.equal((await tgWebhook(hook("/start x"), mkEnv("testnet").env, f)).status, 404);
});

test("link: only your own wallet; the code opens the bot", async () => {
  const { env } = mkEnv();
  const { f } = fakes();
  assert.equal((await tgLink(await authReq({ wallet: B }), env, f)).status, 403);
  const r = (await (await tgLink(await authReq({ wallet: A }), env, f)).json()) as { url: string };
  assert.match(r.url, /^https:\/\/t\.me\/c0lony_bot\?start=[A-Za-z0-9_-]{24}$/);
});

test("webhook rejects a wrong secret", async () => {
  const { env } = mkEnv();
  const { f, sent } = fakes();
  assert.equal((await tgWebhook(hook("/start x", 42, "nope"), env, f)).status, 401);
  assert.equal(sent.length, 0);
});

test("start links once, status and prefs follow, targets and prune work", async () => {
  const { env } = mkEnv();
  const { f, sent } = fakes();
  const { url } = (await (await tgLink(await authReq({ wallet: A, prefs: { forage: false } }), env, f)).json()) as { url: string };
  assert.equal((await tgWebhook(hook(`/start ${codeOf(url)}`), env, f)).status, 200);
  assert.match(String(sent.at(-1)!.body.text), /^Linked/);
  // used once
  await tgWebhook(hook(`/start ${codeOf(url)}`, 99), env, f);
  assert.match(String(sent.at(-1)!.body.text), /expired/);

  const st = (await (await tgStatus(await authReq({ wallet: A }), env, f)).json()) as { linked: boolean; prefs: Record<string, boolean> };
  assert.equal(st.linked, true);
  assert.equal(st.prefs.forage, false);
  assert.equal(st.prefs.raided, true);
  await tgPrefs(await authReq({ wallet: A, prefs: { raided: false } }), env, f);

  const t = (await (await tgTargets(await signedReq("/", { wallets: [A, B] }), env)).json()) as { targets: { wallet: string; chatId: string; prefs: Record<string, boolean> }[] };
  assert.deepEqual(t.targets.map((x) => [x.wallet, x.chatId, x.prefs.raided]), [[A, "42", false]]);
  assert.equal((await tgTargets(new Request("https://x/", { method: "POST", body: "{}" }), env)).status, 401);

  await tgPrune(await signedReq("/", { chatIds: ["42"] }), env);
  const after = (await (await tgStatus(await authReq({ wallet: A }), env, f)).json()) as { linked: boolean };
  assert.equal(after.linked, false);
});

test("an expired code does not link; /stop and unlink remove the chat", async () => {
  const { env, d1 } = mkEnv();
  const { f, sent } = fakes();
  const { url } = (await (await tgLink(await authReq({ wallet: A }), env, f)).json()) as { url: string };
  d1.raw.prepare("UPDATE tg_codes SET expiresAt = 0").run();
  await tgWebhook(hook(`/start ${codeOf(url)}`), env, f);
  assert.equal((d1.raw.prepare("SELECT COUNT(*) c FROM tg_links").get() as { c: number }).c, 0);

  const l2 = (await (await tgLink(await authReq({ wallet: A }), env, f)).json()) as { url: string };
  await tgWebhook(hook(`/start ${codeOf(l2.url)}`), env, f);
  await tgWebhook(hook("/stop"), env, f);
  assert.match(String(sent.at(-1)!.body.text), /off/);
  assert.equal((d1.raw.prepare("SELECT COUNT(*) c FROM tg_links").get() as { c: number }).c, 0);

  const l3 = (await (await tgLink(await authReq({ wallet: A }), env, f)).json()) as { url: string };
  await tgWebhook(hook(`/start ${codeOf(l3.url)}`), env, f);
  await tgUnlink(await authReq({ wallet: A }), env, f);
  assert.equal((d1.raw.prepare("SELECT COUNT(*) c FROM tg_links").get() as { c: number }).c, 0);
});

test("group chats and other text get no link", async () => {
  const { env, d1 } = mkEnv();
  const { f, sent } = fakes();
  const { url } = (await (await tgLink(await authReq({ wallet: A }), env, f)).json()) as { url: string };
  await tgWebhook(hook(`/start ${codeOf(url)}`, 7, "hook", "group"), env, f);
  assert.equal((d1.raw.prepare("SELECT COUNT(*) c FROM tg_links").get() as { c: number }).c, 0);
  await tgWebhook(hook("hello"), env, f);
  assert.match(String(sent.at(-1)!.body.text), /Connect Telegram/);
});
