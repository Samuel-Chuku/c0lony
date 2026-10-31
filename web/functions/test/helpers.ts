import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signHmac } from "../_lib/hmac.ts";
import type { Env } from "../_lib/env.ts";

export const SECRET = "test-secret";
const A = "0x" + "a".repeat(40);
const B = "0x" + "b".repeat(40);
const C = "0x" + "c".repeat(40);
export { A, B, C };

/** Minimal D1 stand-in over node:sqlite running the real migration. */
export function fakeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(join(import.meta.dirname, "../../migrations/0001_feed.sql"), "utf8"));
  const mk = (sql: string, args: unknown[]) => ({
    bind: (...a: unknown[]) => mk(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
    first: async () => db.prepare(sql).get(...(args as never[])) ?? null,
    run: async () => {
      const r = db.prepare(sql).run(...(args as never[]));
      return { meta: { changes: Number(r.changes) } };
    },
  });
  return {
    raw: db,
    prepare: (sql: string) => mk(sql, []),
    batch: async (stmts: { run: () => Promise<unknown> }[]) => {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  };
}

export function fakeKV() {
  const m = new Map<string, string>();
  return {
    m,
    put: async (k: string, v: string) => void m.set(k, v),
    get: async (k: string | string[]) => {
      const one = (key: string) => (m.has(key) ? JSON.parse(m.get(key)!) : null);
      return Array.isArray(k) ? new Map(k.map((x) => [x, one(x)])) : one(k);
    },
  };
}

export function makeEnv(extra: Record<string, unknown> = {}) {
  const d1 = fakeD1();
  const kv = fakeKV();
  const env = { FEED_DB: d1, PROFILES: kv, FEED_INGEST_SECRET: SECRET, ...extra } as unknown as Env;
  return { env, d1, kv };
}

export async function signedReq(path: string, payload: unknown, opts: { ts?: number; secret?: string } = {}) {
  const body = JSON.stringify(payload);
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const sig = await signHmac(opts.secret ?? SECRET, ts, body);
  return new Request("https://x.test" + path, {
    method: "POST", body, headers: { "x-c0-timestamp": ts, "x-c0-signature": sig },
  });
}

let n = 0;
export function ev(type: string, actors: string[], data: Record<string, unknown> = {}, ts = Math.floor(Date.now() / 1000)) {
  n++;
  return { block: n, tx: "0x" + n.toString(16).padStart(64, "0"), logIndex: 0, ts, type, actors, data };
}
