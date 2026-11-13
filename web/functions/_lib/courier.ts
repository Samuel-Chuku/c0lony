// WIF gas courier: a player signs an EIP-712 "Send"; the keeper submits it and pays the ETH gas.
// Design: docs/design/2026-11-10-wif-gas-courier.md. The app queues here, the keeper polls /pending (signed) and reports /done.
import { hashTypedData, recoverTypedDataAddress } from "viem";
import type { Env } from "./env.ts";
import { fail, json, parseJson, readBody } from "./http.ts";
import { signedBody } from "./handlers.ts";
import { isRecord, normAddr } from "./validate.ts";

type Res = Promise<Response>;
type Network = "mainnet" | "testnet";

const CHAIN_ID: Record<Network, number> = { testnet: 46630, mainnet: 4663 };
const DAY = 86400;
const HEARTBEAT_SEC = 60;
const MAX_DEADLINE_SEC = 900;
const MAX_PENDING_PER_SENDER = 5;
const MAX_PER_SENDER_DAY = 30;
const MAX_PER_NETWORK_DAY = 500;
/** Gas packs: one per wallet a day, this many a day per network (the keeper enforces the same). */
const PACKS_PER_NETWORK_DAY = 15;
/** A signed pack payment must be at least 95% of the advertised price (the keeper checks again at relay time). */
const PACK_TOLERANCE_BPS = 9500n;
const MAX_UINT = (1n << 256n) - 1n;
const UINT = /^(0|[1-9][0-9]{0,77})$/;
const SIG = /^0x[0-9a-fA-F]{130}$/;
const TX = /^0x[0-9a-fA-F]{64}$/;

export const DEADLINE_SEC = 600;
export const APPROVE_AMOUNT = "10000000000000000000000"; // 10,000 WIF

const TYPES = {
  Send: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "fee", type: "uint256" },
    { name: "feeTo", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

type Heartbeat = { enabled: number; min_fee: string; fee_to: string; courier: string; seen_at: number; pack_wei: string; pack_wif: string };
type Row = {
  id: string; network: string; sender: string; receiver: string; amount: string; fee: string; fee_to: string;
  nonce: string; deadline: number; sig: string; status: string; reason: string | null; tx: string | null;
  created_at: number; purpose: string; gas_tx: string | null;
};

const now = () => Math.floor(Date.now() / 1000);

/** This site serves one network (like the starter gas queue), so a request for the other one is refused. */
const siteNetwork = (env: Env): Network => (env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet");

async function liveKeeper(env: Env, network: Network): Promise<Heartbeat | null> {
  const h = await env.FEED_DB!
    .prepare("SELECT enabled, min_fee, fee_to, courier, seen_at, pack_wei, pack_wif FROM courier_keeper WHERE network = ?")
    .bind(network)
    .first<Heartbeat>();
  return h && h.enabled === 1 && h.seen_at >= now() - HEARTBEAT_SEC ? h : null;
}

async function count(db: D1Database, sql: string, ...args: unknown[]): Promise<number> {
  const r = await db.prepare(sql).bind(...args).first<{ n: number }>();
  return r?.n ?? 0;
}

const uint = (v: unknown): bigint | null => {
  if (typeof v !== "string" || !UINT.test(v)) return null;
  const n = BigInt(v);
  return n <= MAX_UINT ? n : null;
};

export async function courierConfig(request: Request, env: Env): Res {
  const network = new URL(request.url).searchParams.get("network");
  if (network !== "testnet" && network !== "mainnet") return fail(400, "A network is needed.");
  const h = network === siteNetwork(env) ? await liveKeeper(env, network) : null;
  return json({
    enabled: !!h,
    courier: h ? h.courier : null,
    feeTo: h ? h.fee_to : null,
    fee: h ? h.min_fee : "0",
    deadlineSec: DEADLINE_SEC,
    approveAmount: APPROVE_AMOUNT,
    // Only while the keeper advertises gas packs: the pack size (wei) and its WIF price, both as strings.
    gasPack: h && h.pack_wif !== "0" && h.pack_wei !== "0" ? { wei: h.pack_wei, wif: h.pack_wif } : null,
  });
}

export async function courierSubmit(request: Request, env: Env): Res {
  const text = await readBody(request);
  if (text === null) return fail(413, "That request is too large.");
  const b = parseJson(text);
  if (!isRecord(b) || !isRecord(b.send)) return fail(400, "Expected a send to relay.");
  const network = b.network;
  if (network !== "testnet" && network !== "mainnet") return fail(400, "A network is needed.");
  if (network !== siteNetwork(env)) return fail(400, "That network is not served here.");
  const s = b.send;
  const from = normAddr(s.from);
  const to = normAddr(s.to);
  const feeTo = normAddr(s.feeTo);
  if (!from || !to || !feeTo) return fail(400, "Those addresses are not valid.");
  if (to === from) return fail(400, "You can't send to yourself.");
  const amount = uint(s.amount);
  const fee = uint(s.fee);
  const nonce = uint(s.nonce);
  const deadline = uint(s.deadline);
  if (amount === null || fee === null || nonce === null || deadline === null) return fail(400, "Those numbers are not valid.");
  if (amount === 0n) return fail(400, "The amount must be more than zero.");
  const sig = typeof b.sig === "string" && SIG.test(b.sig) ? (b.sig.toLowerCase() as `0x${string}`) : null;
  if (!sig) return fail(400, "That signature is not valid.");
  const t = now();
  if (deadline <= BigInt(t)) return fail(400, "That send has already expired. Sign it again.");
  if (deadline > BigInt(t + MAX_DEADLINE_SEC)) return fail(400, "That deadline is too far ahead.");

  const keeper = await liveKeeper(env, network);
  if (!keeper) return fail(503, "Paying gas in WIF is not available right now.");
  if (feeTo !== keeper.fee_to.toLowerCase()) return fail(400, "That fee recipient is not accepted. Reload and sign again.");
  if (fee < BigInt(keeper.min_fee)) return fail(400, "fee_too_low");
  const purpose = b.purpose === undefined || b.purpose === "send" ? "send" : b.purpose === "gas" ? "gas" : null;
  if (!purpose) return fail(400, "That purpose is not valid.");
  if (purpose === "gas") {
    if (keeper.pack_wif === "0" || keeper.pack_wei === "0") return fail(503, "gas_off");
    if (to !== keeper.fee_to.toLowerCase()) return fail(400, "That gas payment goes to the wrong wallet. Reload and try again.");
    if (amount * 10_000n < BigInt(keeper.pack_wif) * PACK_TOLERANCE_BPS) return fail(400, "price_changed");
  }

  const typed = {
    domain: {
      name: "C0LONY Courier", version: "1", chainId: CHAIN_ID[network], verifyingContract: keeper.courier as `0x${string}`,
    },
    types: TYPES,
    primaryType: "Send" as const,
    message: {
      from: from as `0x${string}`, to: to as `0x${string}`, amount, fee, feeTo: feeTo as `0x${string}`, nonce, deadline,
    },
  };
  let signer: string;
  try {
    signer = (await recoverTypedDataAddress({ ...typed, signature: sig })).toLowerCase();
  } catch {
    return fail(400, "That signature is not valid.");
  }
  if (signer !== from) return fail(400, "That signature is not from the sending wallet.");
  const id = hashTypedData(typed).toLowerCase();

  const db = env.FEED_DB!;
  const existing = await db.prepare("SELECT id, status FROM courier_requests WHERE id = ?").bind(id).first<{ id: string; status: string }>();
  if (existing) return json({ id: existing.id, status: existing.status });

  if (
    (await count(db, "SELECT COUNT(*) AS n FROM courier_requests WHERE sender = ? AND status IN ('pending', 'sending')", from)) >=
    MAX_PENDING_PER_SENDER
  ) {
    return fail(429, "Too many sends are waiting right now. Give them a moment to finish.");
  }
  if ((await count(db, "SELECT COUNT(*) AS n FROM courier_requests WHERE sender = ? AND created_at > ?", from, t - DAY)) >= MAX_PER_SENDER_DAY) {
    return fail(429, "You have reached today's limit for sends paid in WIF. Pay the gas in ETH instead.");
  }
  if ((await count(db, "SELECT COUNT(*) AS n FROM courier_requests WHERE network = ? AND created_at > ?", network, t - DAY)) >= MAX_PER_NETWORK_DAY) {
    return fail(429, "Sends paid in WIF are busy today. Pay the gas in ETH instead.");
  }
  if (purpose === "gas") {
    const live = "status NOT IN ('failed', 'expired')";
    if ((await count(db, `SELECT COUNT(*) AS n FROM courier_requests WHERE purpose = 'gas' AND sender = ? AND ${live} AND created_at > ?`, from, t - DAY)) > 0) {
      return fail(429, "gas_daily_limit");
    }
    if ((await count(db, `SELECT COUNT(*) AS n FROM courier_requests WHERE purpose = 'gas' AND network = ? AND ${live} AND created_at > ?`, network, t - DAY)) >= PACKS_PER_NETWORK_DAY) {
      return fail(429, "gas_busy");
    }
  }
  await db
    .prepare(
      `INSERT OR IGNORE INTO courier_requests
       (id, network, sender, receiver, amount, fee, fee_to, nonce, deadline, sig, status, reason, tx, created_at, updated_at, purpose)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?, ?)`,
    )
    .bind(id, network, from, to, amount.toString(), fee.toString(), feeTo, nonce.toString(), Number(deadline), sig, t, t, purpose)
    .run();
  const row = await db.prepare("SELECT id, status FROM courier_requests WHERE id = ?").bind(id).first<{ id: string; status: string }>();
  return json({ id, status: row?.status ?? "pending" });
}

export async function courierStatus(request: Request, env: Env): Res {
  const id = (new URL(request.url).searchParams.get("id") ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(id)) return fail(400, "A valid id is needed.");
  const db = env.FEED_DB!;
  const t = now();
  await db
    .prepare("UPDATE courier_requests SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'pending' AND deadline < ?")
    .bind(t, id, t)
    .run();
  const r = await db.prepare("SELECT id, status, reason, tx, purpose, gas_tx FROM courier_requests WHERE id = ?").bind(id).first<Row>();
  if (!r) return fail(404, "No send with that id.");
  return json({ id: r.id, status: r.status, reason: r.reason, tx: r.tx, purpose: r.purpose, gasTx: r.gas_tx });
}

export async function courierPending(request: Request, env: Env): Res {
  const s = await signedBody(request, env);
  if (s instanceof Response) return s;
  const b = parseJson(s.body);
  if (!isRecord(b) || (b.network !== "testnet" && b.network !== "mainnet")) return fail(400, "A network is needed.");
  const network: Network = b.network;
  // A testnet request left in the queue must never be paid by a mainnet keeper.
  if (network !== siteNetwork(env)) return fail(400, "That network is not served here.");
  const db = env.FEED_DB!;
  const t = now();
  const k = b.keeper;
  if (isRecord(k)) {
    const feeTo = normAddr(k.feeTo);
    const courier = normAddr(k.courier);
    if (typeof k.enabled !== "boolean" || !feeTo || !courier || uint(k.minFee) === null) return fail(400, "That keeper heartbeat is not valid.");
    // No pack in the heartbeat means packs are off: stored as "0".
    const pack = isRecord(k.pack) ? k.pack : null;
    const packWei = pack ? uint(pack.wei) : 0n;
    const packWif = pack ? uint(pack.wif) : 0n;
    if (packWei === null || packWif === null) return fail(400, "That keeper heartbeat is not valid.");
    await db
      .prepare(
        `INSERT INTO courier_keeper (network, enabled, min_fee, fee_to, courier, seen_at, pack_wei, pack_wif) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(network) DO UPDATE SET enabled = excluded.enabled, min_fee = excluded.min_fee,
           fee_to = excluded.fee_to, courier = excluded.courier, seen_at = excluded.seen_at,
           pack_wei = excluded.pack_wei, pack_wif = excluded.pack_wif`,
      )
      .bind(network, k.enabled ? 1 : 0, k.minFee, feeTo, courier, t, packWei.toString(), packWif.toString())
      .run();
  }
  await db
    .prepare("UPDATE courier_requests SET status = 'expired', updated_at = ? WHERE status = 'pending' AND network = ? AND deadline < ?")
    .bind(t, network, t)
    .run();
  const { results } = await db
    .prepare(
      `SELECT id, sender, receiver, amount, fee, fee_to, nonce, deadline, sig, created_at, purpose FROM courier_requests
       WHERE status = 'pending' AND network = ? ORDER BY created_at ASC, id ASC LIMIT 20`,
    )
    .bind(network)
    .all<Row>();
  return json({
    requests: results.map((r) => ({
      id: r.id, sender: r.sender, receiver: r.receiver, amount: r.amount, fee: r.fee, feeTo: r.fee_to,
      nonce: r.nonce, deadline: r.deadline, sig: r.sig, createdAt: r.created_at, purpose: r.purpose === "gas" ? "gas" : "send",
    })),
  });
}

export async function courierDone(request: Request, env: Env): Res {
  const s = await signedBody(request, env);
  if (s instanceof Response) return s;
  const b = parseJson(s.body);
  if (!isRecord(b) || typeof b.id !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(b.id)) return fail(400, "An id is needed.");
  if (b.status !== "sending" && b.status !== "sent" && b.status !== "failed") return fail(400, "That status is not valid.");
  const tx = typeof b.tx === "string" && TX.test(b.tx) ? b.tx.toLowerCase() : null;
  const reason = typeof b.reason === "string" ? b.reason.slice(0, 200) : null;
  const gasTx = typeof b.gasTx === "string" && TX.test(b.gasTx) ? b.gasTx.toLowerCase() : null;
  if (gasTx) {
    // The pack's ETH transfer for a landed gas purchase: recorded once, whatever the request's status.
    await env.FEED_DB!
      .prepare("UPDATE courier_requests SET gas_tx = ?, updated_at = ? WHERE id = ? AND purpose = 'gas' AND gas_tx IS NULL AND network = ?")
      .bind(gasTx, now(), b.id.toLowerCase(), siteNetwork(env))
      .run();
  }
  // Forward only: pending -> sending -> sent | failed (and pending -> failed). A repeated "sending" may add the tx.
  const r = await env.FEED_DB!
    .prepare(
      `UPDATE courier_requests SET status = ?, tx = COALESCE(?, tx), reason = ?, updated_at = ?
       WHERE id = ? AND status IN ('pending', 'sending') AND network = ?`,
    )
    .bind(b.status, tx, reason, now(), b.id.toLowerCase(), siteNetwork(env))
    .run();
  return json({ ok: true, updated: r.meta?.changes ?? 0 });
}
