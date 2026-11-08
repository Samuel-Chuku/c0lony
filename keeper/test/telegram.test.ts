import { test } from "node:test";
import assert from "node:assert/strict";
import { PushClient } from "../src/push/client.ts";
import { TelegramClient, type TgTarget } from "../src/push/telegram.ts";
import { ALICE, BOB } from "./feedHelpers.ts";

function setup(targets: TgTarget[], status: (chatId: string) => [number, string?] = () => [200]) {
  const photos: Record<string, unknown>[] = [];
  const pruned: string[][] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    if (url.includes("/api/telegram/targets")) {
      const { wallets } = JSON.parse(init!.body as string);
      return new Response(JSON.stringify({ targets: targets.filter((t) => wallets.includes(t.wallet)) }));
    }
    if (url.includes("/api/telegram/prune")) {
      pruned.push(JSON.parse(init!.body as string).chatIds);
      return new Response("{}");
    }
    if (url.startsWith("https://api.telegram.org/bottok/sendPhoto")) {
      const body = JSON.parse(init!.body as string);
      const [code, description] = status(body.chat_id);
      if (code === 200) photos.push(body);
      return new Response(JSON.stringify({ ok: code === 200, description }), { status: code });
    }
    return new Response("no", { status: 404 });
  }) as unknown as typeof fetch;
  const tg = new TelegramClient({ apiBase: "https://app.x", secret: "k", token: "tok", fetchFn });
  return { tg, photos, pruned, fetchFn };
}
const P = { title: "C0LONY", body: "@bob is marching on your colony. Guard within 4h.", url: "/?tab=raids", tag: "raid-1" };

test("sends a picture card with an action button to the linked chat", async () => {
  const { tg, photos } = setup([{ wallet: ALICE, chatId: "42", prefs: {} }]);
  assert.equal(await tg.notify(ALICE, "raided", P), 1);
  const m = photos[0] as { chat_id: string; photo: string; caption: string; reply_markup: { inline_keyboard: { text: string; url: string }[][] } };
  assert.equal(m.chat_id, "42");
  assert.equal(m.photo, "https://app.x/tg/raided.png");
  assert.match(m.caption, /^<b>C0LONY<\/b>\n@bob is marching/);
  assert.deepEqual(m.reply_markup.inline_keyboard[0][0], { text: "Guard now", url: "https://app.x/?tab=raids" });
});

test("honours the chat's switches, uses the payload's image, escapes HTML", async () => {
  const { tg, photos } = setup([{ wallet: ALICE, chatId: "42", prefs: { raided: false } }]);
  assert.equal(await tg.notify(ALICE, "raided", P), 0);
  await tg.notify(ALICE, "result", { ...P, body: "a <b> & c", image: "won" });
  const m = photos[0] as { photo: string; caption: string };
  assert.equal(m.photo, "https://app.x/tg/won.png");
  assert.match(m.caption, /a &lt;b&gt; &amp; c/);
});

test("blocked or missing chats are pruned; other errors are not", async () => {
  const { tg, pruned } = setup(
    [{ wallet: ALICE, chatId: "1", prefs: {} }, { wallet: ALICE, chatId: "2", prefs: {} }, { wallet: ALICE, chatId: "3", prefs: {} }],
    (c) => (c === "1" ? [403, "Forbidden: bot was blocked by the user"] : c === "2" ? [400, "Bad Request: chat not found"] : [429, "Too Many Requests"]),
  );
  assert.equal(await tg.notify(ALICE, "raided", P), 0);
  assert.deepEqual(pruned, [["1", "2"]]);
});

test("PushClient delivers to Telegram even with push off, and a Telegram outage does not stop push", async () => {
  const { tg, photos, fetchFn } = setup([{ wallet: BOB, chatId: "7", prefs: {} }]);
  const onlyTg = new PushClient({ apiBase: "https://app.x", secret: "k", telegram: tg, fetchFn });
  assert.equal(await onlyTg.notify(BOB, "forage", P), 1);
  assert.equal(photos.length, 1);

  const broken = new TelegramClient({ apiBase: "https://down", secret: "k", token: "tok", fetchFn: (async () => { throw new Error("down"); }) as unknown as typeof fetch });
  const pushed: string[] = [];
  const pushFetch = (async (url: string) =>
    url.includes("/api/push/targets")
      ? new Response(JSON.stringify({ targets: [{ wallet: BOB, endpoint: "https://p", keys: { p256dh: "a", auth: "b" }, prefs: {} }] }))
      : fetchFn(url)) as unknown as typeof fetch;
  const both = new PushClient({ apiBase: "https://app.x", secret: "k", telegram: broken, send: async (s) => void pushed.push(s.endpoint), fetchFn: pushFetch });
  assert.equal(await both.notify(BOB, "forage", P), 1);
  assert.deepEqual(pushed, ["https://p"]);
});

test("alert labels: X handle first, then the onchain name, then a short address", async () => {
  const profiles: Record<string, unknown> = { [ALICE]: { xHandle: "alice", name: "ignored" }, [BOB]: { xHandle: null, name: "bobs_ants" } };
  const fetchFn = (async (url: string) => {
    const w = new URL(url).searchParams.get("wallets")!;
    return new Response(JSON.stringify({ profiles: profiles[w] ? { [w]: profiles[w] } : {} }));
  }) as unknown as typeof fetch;
  const c = new PushClient({ apiBase: "https://app.x", secret: "k", fetchFn });
  assert.equal(await c.label(ALICE), "@alice");
  assert.equal(await c.label(BOB), "bobs_ants");
  assert.match(await c.label("0x" + "c".repeat(40)), /^0xcccc…cccc$/);
});
