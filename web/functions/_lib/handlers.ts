import type { Env } from "./env.ts";
import {
  MAX_INGEST, SUMMARY_TYPES, buildFeedQuery, feedFromBlock, normaliseEvent, placeholders, rowToEvent, sumBurned, summarise,
  type FeedEvent,
} from "./feed.ts";
import { verifyHmac } from "./hmac.ts";
import { enabled, fail, json, parseJson, readBody } from "./http.ts";
import { bearer, profileFor, refreshProfile, userWallets, verifyPrivyToken } from "./privy.ts";
import { clampInt, isRecord, normAddr, sanitizePrefs } from "./validate.ts";
import { avatarUrl, setNameFromChain, type Identity } from "./identity.ts";

type Res = Promise<Response>;
const CHUNK = 90; // D1 allows 100 bound parameters per statement

export async function signedBody(request: Request, env: Env): Promise<{ body: string } | Response> {
  const body = await readBody(request);
  if (body === null) return fail(413, "That request is too large.");
  const v = await verifyHmac(
    env.FEED_INGEST_SECRET, request.headers.get("x-c0-timestamp"), request.headers.get("x-c0-signature"), body,
  );
  return v.ok ? { body } : fail(401, v.error);
}

export async function ingest(request: Request, env: Env): Res {
  const db = env.FEED_DB!;
  const s = await signedBody(request, env);
  if (s instanceof Response) return s;
  const parsed = parseJson(s.body);
  if (!isRecord(parsed) || !Array.isArray(parsed.events)) return fail(400, "Expected an events array.");
  if (parsed.events.length > MAX_INGEST) return fail(400, `At most ${MAX_INGEST} events per request.`);
  const events: FeedEvent[] = [];
  for (const raw of parsed.events) {
    const e = normaliseEvent(raw);
    if (!e) return fail(400, "One of the events is malformed.");
    events.push(e);
  }
  if (events.length === 0) return json({ inserted: 0 });
  const ins = db.prepare(
    "INSERT OR IGNORE INTO events (block, tx, logIndex, ts, type, actors, data) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const results = await db.batch(
    events.map((e) => ins.bind(e.block, e.tx, e.logIndex, e.ts, e.type, JSON.stringify(e.actors), JSON.stringify(e.data))),
  );
  const fresh = events.filter((_, i) => (results[i]?.meta?.changes ?? 0) > 0);
  const withActors = fresh.filter((e) => e.actors.length > 0);
  if (withActors.length) {
    const link = db.prepare(
      "INSERT OR IGNORE INTO event_actors (eventId, wallet) SELECT id, ? FROM events WHERE tx = ? AND logIndex = ?",
    );
    await db.batch(withActors.flatMap((e) => e.actors.map((w) => link.bind(w, e.tx, e.logIndex))));
  }
  // Names set onchain become the display name of players without X (applied in chain order).
  for (const e of fresh) if (e.type === "named" && e.actors[0]) await setNameFromChain(env, e.actors[0], e.data.name);
  return json({ inserted: fresh.length });
}

export async function feed(request: Request, env: Env): Res {
  const q = buildFeedQuery(new URL(request.url).searchParams, feedFromBlock(env.NEXT_PUBLIC_NETWORK));
  if ("error" in q) return fail(400, q.error);
  const { results } = await env.FEED_DB!.prepare(q.sql).bind(...q.args).all();
  return json({ events: (results as never[]).map(rowToEvent) }, 200, "public, max-age=10");
}

export async function stats(_request: Request, env: Env): Res {
  const db = env.FEED_DB!;
  const from = feedFromBlock(env.NEXT_PUBLIC_NETWORK);
  const burned = await db
    .prepare("SELECT json_extract(data, '$.burned') AS b FROM events WHERE type = 'paid' AND block >= ?")
    .bind(from)
    .all();
  const since = Math.floor(Date.now() / 1000) - 86400;
  const raids = await db
    .prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'raid_launched' AND ts >= ? AND block >= ?")
    .bind(since, from)
    .first<{ n: number }>();
  return json(
    {
      burnedWif: sumBurned((burned.results as { b: string | number | null }[]).map((r) => r.b)),
      raidsToday: raids?.n ?? 0,
    },
    200,
    "public, max-age=30",
  );
}

export async function summary(request: Request, env: Env): Res {
  const p = new URL(request.url).searchParams;
  const wallet = normAddr(p.get("wallet"));
  if (!wallet) return fail(400, "A valid wallet is needed.");
  const now = Math.floor(Date.now() / 1000);
  const since = clampInt(p.get("since"), now - 86400, 0, 4_102_444_800);
  const db = env.FEED_DB!;
  const types = SUMMARY_TYPES;
  const from = feedFromBlock(env.NEXT_PUBLIC_NETWORK);
  const { results } = await db
    .prepare(
      `SELECT e.id, e.block, e.tx, e.logIndex, e.ts, e.type, e.actors, e.data FROM events e
       JOIN event_actors a ON a.eventId = e.id
       WHERE a.wallet = ? AND e.ts >= ? AND e.block >= ? AND e.type IN (${placeholders(types.length)})
       ORDER BY e.id DESC LIMIT 2000`,
    )
    .bind(wallet, since, from, ...types)
    .all();
  const av = await db
    .prepare(
      `SELECT e.id, e.block, e.tx, e.logIndex, e.ts, e.type, e.actors, e.data FROM events e
       JOIN event_actors a ON a.eventId = e.id
       WHERE a.wallet = ? AND e.type = 'avenge_granted' AND e.block >= ?
         AND NOT EXISTS (SELECT 1 FROM events l WHERE l.type = 'raid_launched'
           AND CAST(json_extract(l.data, '$.raidId') AS TEXT) = CAST(json_extract(e.data, '$.raidId') AS TEXT)
           AND json_extract(l.data, '$.isAvenge') = 1)
       ORDER BY e.id DESC LIMIT 10`,
    )
    .bind(wallet, from)
    .all();
  const body = summarise(
    (results as never[]).map(rowToEvent), wallet, since, now, (av.results as never[]).map(rowToEvent),
  );
  return json(body);
}

export async function profile(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Res {
  const did = await verifyPrivyToken(bearer(request), env);
  if (!did) return fail(401, "Sign in again to continue.");
  const p = await refreshProfile(did, env, fetchImpl);
  if (!p) return fail(502, "Could not load your profile right now.");
  return json({ wallets: p.wallets, xHandle: p.xHandle, xAvatar: p.xAvatar });
}

export async function profiles(request: Request, env: Env): Res {
  const raw = new URL(request.url).searchParams.get("wallets") ?? "";
  const wallets = [...new Set(raw.split(",").map((w) => normAddr(w)).filter((w): w is string => !!w))];
  if (raw && wallets.length === 0) return fail(400, "No valid wallets were given.");
  if (raw.split(",").length > 100) return fail(400, "At most 100 wallets at a time.");
  type Out = { xHandle: string | null; xAvatar: string | null; name?: string; avatar?: string };
  const out: Record<string, Out> = {};
  if (env.PROFILES && wallets.length) {
    // Two records per wallet (X, and name/picture); KV reads at most 100 keys at a time.
    for (let i = 0; i < wallets.length; i += 50) {
      const part = wallets.slice(i, i + 50);
      const got = (await env.PROFILES.get(part.flatMap((w) => [`w:${w}`, `id:${w}`]), "json")) as Map<string, unknown>;
      for (const w of part) {
        const r = got.get(`w:${w}`) as { xHandle?: string | null; xAvatar?: string | null } | null | undefined;
        const id = (got.get(`id:${w}`) ?? {}) as Identity;
        const o: Out = { xHandle: r?.xHandle ?? null, xAvatar: r?.xAvatar ?? null };
        if (id.name) o.name = id.name;
        if (id.avatarV) o.avatar = avatarUrl(w, id.avatarV);
        if (o.xHandle || o.xAvatar || o.name || o.avatar) out[w] = o;
      }
    }
  }
  return json({ profiles: out }, 200, "public, max-age=60");
}

export async function authed(request: Request, env: Env, fetchImpl: typeof fetch) {
  const did = await verifyPrivyToken(bearer(request), env);
  if (!did) return fail(401, "Sign in again to continue.");
  const wallets = await userWallets(did, env, fetchImpl);
  if (!wallets) return fail(502, "Could not load your profile right now.");
  return { did, wallets };
}

export async function jsonBody(request: Request): Promise<Record<string, unknown> | Response> {
  const text = await readBody(request);
  if (text === null) return fail(413, "That request is too large.");
  const b = parseJson(text);
  return isRecord(b) ? b : fail(400, "Expected a JSON object.");
}

export async function pushSubscribe(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Res {
  const a = await authed(request, env, fetchImpl);
  if (a instanceof Response) return a;
  const b = await jsonBody(request);
  if (b instanceof Response) return b;
  const wallet = normAddr(b.wallet);
  if (!wallet || !a.wallets.includes(wallet)) return fail(403, "That wallet is not linked to your account.");
  const sub = b.subscription;
  if (!isRecord(sub) || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || sub.endpoint.length > 2048) {
    return fail(400, "That push subscription is not valid.");
  }
  const keys = sub.keys;
  if (!isRecord(keys) || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") {
    return fail(400, "That push subscription is missing its keys.");
  }
  await env.FEED_DB!
    .prepare(
      `INSERT INTO push_subs (endpoint, wallet, keys, prefs, updatedAt) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET wallet = excluded.wallet, keys = excluded.keys,
         prefs = excluded.prefs, updatedAt = excluded.updatedAt`,
    )
    .bind(
      sub.endpoint, wallet, JSON.stringify({ p256dh: keys.p256dh, auth: keys.auth }),
      JSON.stringify(sanitizePrefs(b.prefs)), Math.floor(Date.now() / 1000),
    )
    .run();
  return json({ ok: true });
}

export async function pushPrefs(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Res {
  const a = await authed(request, env, fetchImpl);
  if (a instanceof Response) return a;
  const b = await jsonBody(request);
  if (b instanceof Response) return b;
  const wallet = normAddr(b.wallet);
  if (!wallet || !a.wallets.includes(wallet)) return fail(403, "That wallet is not linked to your account.");
  if (typeof b.endpoint !== "string") return fail(400, "An endpoint is needed.");
  await env.FEED_DB!
    .prepare("UPDATE push_subs SET prefs = ?, updatedAt = ? WHERE endpoint = ? AND wallet = ?")
    .bind(JSON.stringify(sanitizePrefs(b.prefs)), Math.floor(Date.now() / 1000), b.endpoint, wallet)
    .run();
  return json({ ok: true });
}

export async function pushUnsubscribe(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Res {
  const a = await authed(request, env, fetchImpl);
  if (a instanceof Response) return a;
  const b = await jsonBody(request);
  if (b instanceof Response) return b;
  if (typeof b.endpoint !== "string") return fail(400, "An endpoint is needed.");
  if (a.wallets.length) {
    await env.FEED_DB!
      .prepare(`DELETE FROM push_subs WHERE endpoint = ? AND wallet IN (${placeholders(a.wallets.length)})`)
      .bind(b.endpoint, ...a.wallets)
      .run();
  }
  return json({ ok: true });
}

export async function pushTargets(request: Request, env: Env): Res {
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
      .prepare(`SELECT wallet, endpoint, keys, prefs FROM push_subs WHERE wallet IN (${placeholders(part.length)})`)
      .bind(...part)
      .all<{ wallet: string; endpoint: string; keys: string; prefs: string }>();
    for (const r of results) {
      targets.push({ wallet: r.wallet, endpoint: r.endpoint, keys: JSON.parse(r.keys), prefs: sanitizePrefs(JSON.parse(r.prefs)) });
    }
  }
  return json({ targets });
}

export async function pushPrune(request: Request, env: Env): Res {
  const s = await signedBody(request, env);
  if (s instanceof Response) return s;
  const b = parseJson(s.body);
  if (!isRecord(b) || !Array.isArray(b.endpoints)) return fail(400, "Expected an endpoints array.");
  if (b.endpoints.length > 500) return fail(400, "At most 500 endpoints per request.");
  const eps = b.endpoints.filter((e): e is string => typeof e === "string");
  for (let i = 0; i < eps.length; i += CHUNK) {
    const part = eps.slice(i, i + CHUNK);
    await env.FEED_DB!.prepare(`DELETE FROM push_subs WHERE endpoint IN (${placeholders(part.length)})`).bind(...part).run();
  }
  return json({ ok: true, removed: eps.length });
}

const DAY = 86400;
const GAS_LIVE = "('pending', 'sent')";

type GasPolicy = { network: "mainnet" | "testnet"; dailyCap: number };

const gasReply = (status: "queued" | "already" | "limit" | "not-eligible", message: string) => json({ status, message });

async function gasCount(db: D1Database, sql: string, ...args: unknown[]): Promise<number> {
  const r = await db.prepare(sql).bind(...args).first<{ n: number }>();
  return r?.n ?? 0;
}

export async function gasStarter(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Res {
  const did = await verifyPrivyToken(bearer(request), env);
  if (!did) return fail(401, "Sign in again to continue.");
  const b = await jsonBody(request);
  if (b instanceof Response) return b;
  const wallet = normAddr(b.wallet);
  if (!wallet) return fail(400, "A valid wallet is needed.");
  const profileNow = await profileFor(did, wallet, env, fetchImpl);
  if (!profileNow) return fail(502, "Could not load your profile right now.");
  if (!profileNow.wallets.includes(wallet)) return fail(403, "That wallet is not linked to your account.");
  const policy: GasPolicy =
    env.NEXT_PUBLIC_NETWORK === "mainnet" ? { network: "mainnet", dailyCap: 25 } : { network: "testnet", dailyCap: 100 };
  const db = env.FEED_DB!;
  const now = Math.floor(Date.now() / 1000);
  if (policy.network === "mainnet") {
    if (!(profileNow.embedded ?? []).includes(wallet)) {
      return gasReply("not-eligible", "Starter gas is for the wallet C0LONY made for you. Your own wallet pays its own gas.");
    }
    const prior = await gasCount(
      db,
      `SELECT COUNT(*) AS n FROM gas_requests WHERE kind = 'gas' AND network = 'mainnet' AND status IN ${GAS_LIVE} AND (did = ? OR wallet = ?)`,
      did, wallet,
    );
    if (prior > 0) return gasReply("already", "This wallet already got its starter gas.");
  } else {
    const prior = await gasCount(
      db,
      `SELECT COUNT(*) AS n FROM gas_requests WHERE kind = 'gas' AND network = 'testnet' AND wallet = ? AND status IN ${GAS_LIVE} AND createdAt > ?`,
      wallet, now - DAY,
    );
    if (prior > 0) return gasReply("already", "This wallet already got its starter gas.");
  }
  const today = await gasCount(
    db,
    `SELECT COUNT(*) AS n FROM gas_requests WHERE kind = 'gas' AND network = ? AND status IN ${GAS_LIVE} AND createdAt > ?`,
    policy.network, now - DAY,
  );
  if (today >= policy.dailyCap) return gasReply("limit", "Starter gas is busy today. Try again tomorrow.");
  await db
    .prepare("INSERT INTO gas_requests (did, wallet, network, status, tx, createdAt, updatedAt, kind) VALUES (?, ?, ?, 'pending', NULL, ?, ?, 'gas')")
    .bind(did, wallet, policy.network, now, now)
    .run();
  return gasReply("queued", "Your first gas is on its way.");
}

/**
 * Approval top-up for gas packs (docs/design/2026-11-13-wif-for-gas.md): a tiny one-time amount of ETH so a player whose
 * gas has run out can approve the Courier and then buy a pack with WIF. Only while the keeper advertises packs, only
 * for the wallet C0LONY made for the player (on mainnet), once per wallet ever, 25 a day per network. The keeper
 * skips it if the wallet can already pay for its approval.
 */
export async function gasApproval(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Res {
  const did = await verifyPrivyToken(bearer(request), env);
  if (!did) return fail(401, "Sign in again to continue.");
  const b = await jsonBody(request);
  if (b instanceof Response) return b;
  const wallet = normAddr(b.wallet);
  if (!wallet) return fail(400, "A valid wallet is needed.");
  const network = env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const db = env.FEED_DB!;
  const now = Math.floor(Date.now() / 1000);
  const keeper = await db
    .prepare("SELECT pack_wif, seen_at FROM courier_keeper WHERE network = ?")
    .bind(network)
    .first<{ pack_wif: string; seen_at: number }>()
    .catch(() => null);
  if (!keeper || keeper.pack_wif === "0" || keeper.seen_at < now - 120) {
    return gasReply("limit", "Swapping WIF for gas isn't available right now.");
  }
  const profileNow = await profileFor(did, wallet, env, fetchImpl);
  if (!profileNow) return fail(502, "Could not load your profile right now.");
  if (!profileNow.wallets.includes(wallet)) return fail(403, "That wallet is not linked to your account.");
  if (network === "mainnet" && !(profileNow.embedded ?? []).includes(wallet)) {
    return gasReply("not-eligible", "This is for the wallet C0LONY made for you. Your own wallet pays its own gas.");
  }
  const prior = await gasCount(db, `SELECT COUNT(*) AS n FROM gas_requests WHERE kind = 'approval' AND wallet = ? AND status IN ${GAS_LIVE}`, wallet);
  if (prior > 0) return gasReply("already", "This wallet already got its one-time approval gas.");
  const today = await gasCount(
    db,
    `SELECT COUNT(*) AS n FROM gas_requests WHERE kind = 'approval' AND network = ? AND status IN ${GAS_LIVE} AND createdAt > ?`,
    network, now - DAY,
  );
  if (today >= 25) return gasReply("limit", "This is busy today. Try again tomorrow.");
  await db
    .prepare("INSERT INTO gas_requests (did, wallet, network, status, tx, createdAt, updatedAt, kind) VALUES (?, ?, ?, 'pending', NULL, ?, ?, 'approval')")
    .bind(did, wallet, network, now, now)
    .run();
  return gasReply("queued", "A little gas for the approval is on its way.");
}

/**
 * Testnet WIF faucet: 10,000 test WIF to a signed-in player's wallet, at most once per wallet every 24 hours and
 * 300 times a day overall. The keeper does the minting, so the app never calls the token's open mint directly.
 */
export async function wifFaucet(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Res {
  if (env.NEXT_PUBLIC_NETWORK === "mainnet") return fail(404, "Test WIF only exists on testnet.");
  const did = await verifyPrivyToken(bearer(request), env);
  if (!did) return fail(401, "Sign in again to continue.");
  const b = await jsonBody(request);
  if (b instanceof Response) return b;
  const wallet = normAddr(b.wallet);
  if (!wallet) return fail(400, "A valid wallet is needed.");
  const profileNow = await profileFor(did, wallet, env, fetchImpl);
  if (!profileNow) return fail(502, "Could not load your profile right now.");
  if (!profileNow.wallets.includes(wallet)) return fail(403, "That wallet is not linked to your account.");
  const db = env.FEED_DB!;
  const now = Math.floor(Date.now() / 1000);
  const last = await db
    .prepare(`SELECT MAX(createdAt) AS t FROM gas_requests WHERE kind = 'wif' AND wallet = ? AND status IN ${GAS_LIVE}`)
    .bind(wallet)
    .first<{ t: number | null }>();
  if (last?.t && last.t > now - DAY) {
    return json({ status: "already", nextAt: last.t + DAY, message: "You can get more test WIF once a day." });
  }
  const today = await gasCount(db, `SELECT COUNT(*) AS n FROM gas_requests WHERE kind = 'wif' AND status IN ${GAS_LIVE} AND createdAt > ?`, now - DAY);
  if (today >= 300) return json({ status: "limit", message: "The test WIF faucet is busy today. Try again tomorrow." });
  await db
    .prepare("INSERT INTO gas_requests (did, wallet, network, status, tx, createdAt, updatedAt, kind) VALUES (?, ?, 'testnet', 'pending', NULL, ?, ?, 'wif')")
    .bind(did, wallet, now, now)
    .run();
  return json({ status: "queued", nextAt: now + DAY, message: "10,000 test WIF is on its way." });
}

export async function gasPending(request: Request, env: Env): Res {
  const s = await signedBody(request, env);
  if (s instanceof Response) return s;
  // Only this site's network: a testnet request left in the queue must never be paid by a mainnet keeper.
  const network = env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const { results } = await env.FEED_DB!
    .prepare("SELECT id, wallet, kind FROM gas_requests WHERE status = 'pending' AND network = ? ORDER BY createdAt ASC, id ASC LIMIT 50")
    .bind(network)
    .all<{ id: number; wallet: string; kind: string }>();
  return json({
    requests: results.map((r) => ({ id: r.id, wallet: r.wallet, kind: r.kind === "wif" ? "wif" : r.kind === "approval" ? "approval" : "gas" })),
  });
}

export async function gasDone(request: Request, env: Env): Res {
  const s = await signedBody(request, env);
  if (s instanceof Response) return s;
  const b = parseJson(s.body);
  if (!isRecord(b) || !Number.isInteger(b.id)) return fail(400, "An id is needed.");
  if (b.status !== "sent" && b.status !== "skipped" && b.status !== "failed") return fail(400, "That status is not valid.");
  const tx = typeof b.tx === "string" && /^0x[0-9a-fA-F]{64}$/.test(b.tx) ? b.tx.toLowerCase() : null;
  const r = await env.FEED_DB!
    .prepare("UPDATE gas_requests SET status = ?, tx = ?, updatedAt = ? WHERE id = ? AND status = 'pending'")
    .bind(b.status, tx, Math.floor(Date.now() / 1000), b.id)
    .run();
  return json({ ok: true, updated: r.meta?.changes ?? 0 });
}

export { enabled };
