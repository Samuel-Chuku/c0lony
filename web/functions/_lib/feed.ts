import { clampInt, isRecord, normAddr } from "./validate.ts";

export const FEED_TYPES = [
  "founded", "fed", "tended", "built", "assigned", "sped_up", "shielded", "revived", "collapsed",
  "raid_launched", "guarded", "revealed", "settled", "collected", "avenge_granted", "paid",
  "sponsored", "season_ended", "season_finalized", "claimed", "unclaimed_rolled",
] as const;
export type FeedType = (typeof FEED_TYPES)[number];

export type FeedData = Record<string, string | number | boolean | null>;
export type FeedEvent = {
  block: number; tx: string; logIndex: number; ts: number; type: FeedType; actors: string[]; data: FeedData;
};

export const RAID_TYPES = ["raid_launched", "guarded", "revealed", "settled", "collected", "avenge_granted"];
export const POT_TYPES = ["sponsored", "season_ended", "season_finalized", "claimed", "unclaimed_rolled"];
export const NOISY_TYPES = ["paid", "tended", "assigned"];
export const SUMMARY_TYPES = ["settled", "raid_launched", "avenge_granted", "claimed", "season_ended"];
export const MAX_INGEST = 500;

/** Validate and normalise one event from the keeper. Returns null if malformed. */
export function normaliseEvent(raw: unknown): FeedEvent | null {
  if (!isRecord(raw)) return null;
  const { block, tx, logIndex, ts, type, actors, data } = raw;
  if (!Number.isInteger(block) || !Number.isInteger(logIndex) || !Number.isInteger(ts)) return null;
  if (typeof tx !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(tx)) return null;
  if (typeof type !== "string" || !(FEED_TYPES as readonly string[]).includes(type)) return null;
  if (!Array.isArray(actors) || !isRecord(data)) return null;
  const seen = new Set<string>();
  for (const a of actors) {
    const n = normAddr(a);
    if (!n) return null;
    seen.add(n);
  }
  const clean: FeedData = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) clean[k] = v as string | number | boolean | null;
    else return null;
  }
  // The guarded and targeted resource must never be public until the reveal.
  if (type === "raid_launched" || type === "guarded") {
    delete clean.target;
    delete clean.resource;
  }
  return {
    block: block as number, tx: tx.toLowerCase(), logIndex: logIndex as number, ts: ts as number,
    type: type as FeedType, actors: [...seen], data: clean,
  };
}

export type FeedQuery = { sql: string; args: (string | number)[] };

function placeholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(",");
}

/** Build the SELECT for GET /api/feed. Returns an error string on bad input. */
export function buildFeedQuery(params: URLSearchParams): FeedQuery | { error: string } {
  const type = params.get("type") ?? "all";
  if (!["all", "raids", "mine", "pot"].includes(type)) return { error: "Unknown feed type." };
  const walletRaw = params.get("wallet");
  const wallet = walletRaw ? normAddr(walletRaw) : null;
  if (walletRaw && !wallet) return { error: "That wallet address is not valid." };
  if (type === "mine" && !wallet) return { error: "The mine feed needs a wallet." };
  const limit = clampInt(params.get("limit"), 50, 1, 200);
  const where: string[] = [];
  const args: (string | number)[] = [];
  let join = "";
  if (wallet) {
    join = " JOIN event_actors a ON a.eventId = e.id";
    where.push("a.wallet = ?");
    args.push(wallet);
  }
  if (type === "raids" || type === "pot") {
    const list = type === "raids" ? RAID_TYPES : POT_TYPES;
    where.push(`e.type IN (${placeholders(list.length)})`);
    args.push(...list);
  } else if (type === "all") {
    where.push(`e.type NOT IN (${placeholders(NOISY_TYPES.length)})`);
    args.push(...NOISY_TYPES);
  }
  if (params.get("since") !== null) {
    where.push("e.ts >= ?");
    args.push(clampInt(params.get("since"), 0, 0, 4_102_444_800));
  }
  if (params.get("before") !== null) {
    where.push("e.id < ?");
    args.push(clampInt(params.get("before"), Number.MAX_SAFE_INTEGER, 0, Number.MAX_SAFE_INTEGER));
  }
  const sql =
    `SELECT e.id, e.block, e.tx, e.logIndex, e.ts, e.type, e.actors, e.data FROM events e${join}` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY e.id DESC LIMIT ?";
  args.push(limit);
  return { sql, args };
}

type Row = { id: number; block: number; tx: string; logIndex: number; ts: number; type: string; actors: string; data: string };
export type FeedRow = FeedEvent & { id: number };

export function rowToEvent(r: Row): FeedRow {
  return {
    id: r.id, block: r.block, tx: r.tx, logIndex: r.logIndex, ts: r.ts, type: r.type as FeedType,
    actors: JSON.parse(r.actors) as string[], data: JSON.parse(r.data) as FeedData,
  };
}

/** Sum the burned wei strings and render whole WIF with up to 2 decimals (truncated). */
export function sumBurned(weis: (string | number | null)[]): string {
  let total = 0n;
  for (const w of weis) {
    try {
      if (w !== null && w !== undefined) total += BigInt(w);
    } catch { /* skip junk */ }
  }
  const unit = 10n ** 18n;
  const whole = total / unit;
  const cents = ((total % unit) * 100n) / unit;
  return cents === 0n ? whole.toString() : `${whole}.${cents.toString().padStart(2, "0").replace(/0$/, "")}`;
}

const big = (v: unknown): bigint => {
  try { return typeof v === "string" || typeof v === "number" ? BigInt(v) : 0n; } catch { return 0n; }
};

export type Summary = {
  since: number; rows: FeedRow[]; raided: number; defended: number; raidsWon: number; raidsLost: number;
  lostLeaves: string; lostSugar: string; wonLeaves: string; wonSugar: string;
  avenge: { raider: string; expiresAt: number; raidId: string } | null;
};

/** `rows` newest first; all summary-type rows since `since` where wallet is an actor. */
export function summarise(rows: FeedRow[], wallet: string, since: number, now: number, avengeRows: FeedRow[]): Summary {
  let raided = 0, defended = 0, raidsWon = 0, raidsLost = 0;
  let lostLeaves = 0n, lostSugar = 0n, wonLeaves = 0n, wonSugar = 0n;
  for (const r of rows) {
    if (r.type !== "settled") continue;
    const d = r.data;
    const won = d.outcome === "raider_won";
    if (d.defender === wallet) {
      if (won) {
        raided++;
        if (d.lootResource === "leaves") lostLeaves += big(d.lootAmount);
        else if (d.lootResource === "sugar") lostSugar += big(d.lootAmount);
      } else defended++;
    }
    if (d.raider === wallet) {
      if (won) {
        raidsWon++;
        if (d.lootResource === "leaves") wonLeaves += big(d.lootAmount);
        else if (d.lootResource === "sugar") wonSugar += big(d.lootAmount);
      } else raidsLost++;
    }
  }
  let avenge: Summary["avenge"] = null;
  for (const r of avengeRows) {
    if (r.type === "avenge_granted" && r.data.defender === wallet && Number(r.data.expiresAt) > now) {
      avenge = { raider: String(r.data.raider), expiresAt: Number(r.data.expiresAt), raidId: String(r.data.raidId) };
      break;
    }
  }
  return {
    since, rows: rows.slice(0, 20), raided, defended, raidsWon, raidsLost,
    lostLeaves: lostLeaves.toString(), lostSugar: lostSugar.toString(),
    wonLeaves: wonLeaves.toString(), wonSugar: wonSugar.toString(), avenge,
  };
}

export { placeholders };
