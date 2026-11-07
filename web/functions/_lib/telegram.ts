// Telegram alerts: link a wallet to a Telegram chat with a one-time t.me start code, keep that chat's own alert
// switches, and hand the keeper the chats to send to. The bot token never leaves the server.
import { NETWORKS } from "../../src/config.ts";
import type { Env } from "./env.ts";
import { authed, jsonBody, signedBody } from "./handlers.ts";
import { fail, json, parseJson, readBody } from "./http.ts";
import { isRecord, normAddr, sanitizePrefs } from "./validate.ts";

type Res = Promise<Response>;
const CODE_TTL = 15 * 60;
const CHUNK = 90;
const now = () => Math.floor(Date.now() / 1000);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ph = (n: number) => Array.from({ length: n }, () => "?").join(",");

/** Telegram alerts are on only on a network that allows them (mainnet) and where the bot is configured. */
export function telegramOn(env: Env): boolean {
  const net = NETWORKS[env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet"];
  return net.telegram && !!env.TELEGRAM_BOT_TOKEN && !!env.TELEGRAM_BOT_USERNAME;
}

/** 24 url-safe characters (Telegram start parameters allow A-Z a-z 0-9 _ -, up to 64). */
export function newCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function tgApi(env: Env, fetchImpl: typeof fetch, method: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function ownWallet(request: Request, env: Env, fetchImpl: typeof fetch) {
  if (!telegramOn(env)) return fail(404, "Telegram alerts are not on here.");
  const a = await authed(request, env, fetchImpl);
  if (a instanceof Response) return a;
  const b = await jsonBody(request);
  if (b instanceof Response) return b;
  const wallet = normAddr(b.wallet);
  if (!wallet || !a.wallets.includes(wallet)) return fail(403, "That wallet is not linked to your account.");
  return { wallet, body: b };
}

/** POST {wallet, prefs?} -> {url}: a one-time link that opens the bot and links this wallet when Start is pressed. */
export async function tgLink(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Res {
  const o = await ownWallet(request, env, fetchImpl);
  if (o instanceof Response) return o;
  const db = env.FEED_DB!;
  const code = newCode();
  await db.batch([
    db.prepare("DELETE FROM tg_codes WHERE wallet = ? OR expiresAt < ?").bind(o.wallet, now()),
    db.prepare("INSERT INTO tg_codes (code, wallet, prefs, expiresAt) VALUES (?, ?, ?, ?)")
      .bind(code, o.wallet, JSON.stringify(sanitizePrefs(o.body.prefs)), now() + CODE_TTL),
  ]);
  return json({ url: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${code}` });
}

/** POST {wallet} -> {linked, prefs}. */
export async function tgStatus(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Res {
  const o = await ownWallet(request, env, fetchImpl);
  if (o instanceof Response) return o;
  const row = await env.FEED_DB!.prepare("SELECT prefs FROM tg_links WHERE wallet = ?").bind(o.wallet).first<{ prefs: string }>();
  return json({ linked: !!row, prefs: sanitizePrefs(row ? parseJson(row.prefs) : undefined) });
}

/** POST {wallet, prefs}. */
export async function tgPrefs(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Res {
  const o = await ownWallet(request, env, fetchImpl);
  if (o instanceof Response) return o;
  await env.FEED_DB!.prepare("UPDATE tg_links SET prefs = ? WHERE wallet = ?").bind(JSON.stringify(sanitizePrefs(o.body.prefs)), o.wallet).run();
  return json({ ok: true });
}

/** POST {wallet}: stop Telegram alerts for this wallet. */
export async function tgUnlink(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Res {
  const o = await ownWallet(request, env, fetchImpl);
  if (o instanceof Response) return o;
  const row = await env.FEED_DB!.prepare("SELECT chatId FROM tg_links WHERE wallet = ?").bind(o.wallet).first<{ chatId: string }>();
  await env.FEED_DB!.prepare("DELETE FROM tg_links WHERE wallet = ?").bind(o.wallet).run();
  if (row) await tgApi(env, fetchImpl, "sendMessage", { chat_id: row.chatId, text: `C0LONY alerts for ${short(o.wallet)} are off.` });
  return json({ ok: true });
}

/**
 * Telegram calls this for every message to the bot (set with setWebhook and secret_token). Always answers 200
 * once the secret matches, so Telegram does not retry. Handles /start <code> (link) and /stop (unlink all).
 */
export async function tgWebhook(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Res {
  if (!telegramOn(env) || !env.TELEGRAM_WEBHOOK_SECRET) return fail(404, "Not found.");
  if (request.headers.get("x-telegram-bot-api-secret-token") !== env.TELEGRAM_WEBHOOK_SECRET) return fail(401, "Bad secret.");
  const text = await readBody(request);
  const update = text === null ? undefined : parseJson(text);
  const msg = isRecord(update) && isRecord(update.message) ? update.message : null;
  const chat = msg && isRecord(msg.chat) ? msg.chat : null;
  if (!msg || !chat || chat.type !== "private" || typeof msg.text !== "string") return json({ ok: true });
  const chatId = String(chat.id);
  const app = new URL(request.url).origin;
  const reply = (t: string, button?: { text: string; url: string }) =>
    tgApi(env, fetchImpl, "sendMessage", {
      chat_id: chatId,
      text: t,
      ...(button ? { reply_markup: { inline_keyboard: [[button]] } } : {}),
    });
  const db = env.FEED_DB!;
  const [cmd, arg] = msg.text.trim().split(/\s+/, 2);

  if (cmd === "/start" && arg) {
    const row = await db.prepare("SELECT wallet, prefs FROM tg_codes WHERE code = ? AND expiresAt >= ?").bind(arg, now())
      .first<{ wallet: string; prefs: string }>();
    if (!row) {
      await reply("That link has expired. Open Settings in C0LONY and tap Connect Telegram again.", { text: "Open C0LONY", url: `${app}/settings` });
      return json({ ok: true });
    }
    await db.batch([
      db.prepare(
        `INSERT INTO tg_links (wallet, chatId, prefs, linkedAt) VALUES (?, ?, ?, ?)
         ON CONFLICT(wallet) DO UPDATE SET chatId = excluded.chatId, prefs = excluded.prefs, linkedAt = excluded.linkedAt`,
      ).bind(row.wallet, chatId, row.prefs, now()),
      db.prepare("DELETE FROM tg_codes WHERE code = ?").bind(arg),
    ]);
    await reply(
      `Linked. C0LONY alerts for ${short(row.wallet)} will arrive here: raids on you, raid results, a hungry queen, foragers home and the season's end.\n\nChoose which ones in Settings. Send /stop to turn them all off.`,
      { text: "Open my colony", url: app },
    );
    return json({ ok: true });
  }
  if (cmd === "/stop") {
    const r = await db.prepare("DELETE FROM tg_links WHERE chatId = ?").bind(chatId).run();
    await reply(r.meta.changes ? "C0LONY alerts are off. Connect again from Settings any time." : "No colony is linked to this chat.");
    return json({ ok: true });
  }
  await reply("This bot sends C0LONY alerts. To link your colony, open Settings in the game and tap Connect Telegram.", {
    text: "Open C0LONY", url: `${app}/settings`,
  });
  return json({ ok: true });
}

/** Keeper (signed) POST {wallets} -> {targets: [{wallet, chatId, prefs}]}. */
export async function tgTargets(request: Request, env: Env): Res {
  const s = await signedBody(request, env);
  if (s instanceof Response) return s;
  const b = parseJson(s.body);
  if (!isRecord(b) || !Array.isArray(b.wallets)) return fail(400, "Expected a wallets array.");
  if (b.wallets.length > 500) return fail(400, "At most 500 wallets per request.");
  const wallets = [...new Set(b.wallets.map((w) => normAddr(w)).filter((w): w is string => !!w))];
  const targets: unknown[] = [];
  for (let i = 0; i < wallets.length; i += CHUNK) {
    const part = wallets.slice(i, i + CHUNK);
    const { results } = await env.FEED_DB!
      .prepare(`SELECT wallet, chatId, prefs FROM tg_links WHERE wallet IN (${ph(part.length)})`)
      .bind(...part)
      .all<{ wallet: string; chatId: string; prefs: string }>();
    for (const r of results) targets.push({ wallet: r.wallet, chatId: r.chatId, prefs: sanitizePrefs(parseJson(r.prefs)) });
  }
  return json({ targets });
}

/** Keeper (signed) POST {chatIds}: chats that blocked the bot or no longer exist. */
export async function tgPrune(request: Request, env: Env): Res {
  const s = await signedBody(request, env);
  if (s instanceof Response) return s;
  const b = parseJson(s.body);
  if (!isRecord(b) || !Array.isArray(b.chatIds)) return fail(400, "Expected a chatIds array.");
  if (b.chatIds.length > 500) return fail(400, "At most 500 chats per request.");
  const ids = b.chatIds.filter((c): c is string => typeof c === "string");
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    await env.FEED_DB!.prepare(`DELETE FROM tg_links WHERE chatId IN (${ph(part.length)})`).bind(...part).run();
  }
  return json({ ok: true });
}
