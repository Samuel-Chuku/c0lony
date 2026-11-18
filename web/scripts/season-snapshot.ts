// Writes public/season-data/<n>.json: everything that happened in a finished season, read from the chain.
// A finished season never changes except for claims (the page reads those live from the feed), so the
// results ship with the site as a static file. Run once after a season is finalized, then rebuild:
//   node scripts/season-snapshot.ts 1
// Reads the public Robinhood Chain RPC from src/config.ts; prints no URLs.
import { createPublicClient, http, parseEventLogs, type Log } from "viem";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { colonyGameAbi, seasonPotAbi } from "../src/lib/abi.ts";
import { NETWORKS } from "../src/config.ts";

const SEASON = Number(process.argv[2] ?? "1");
const NET = NETWORKS.mainnet;
const C = NET.contracts;
const client = createPublicClient({ transport: http(NET.rpcUrl, { timeout: 30_000, retryCount: 3 }) });

const treasuryAbi = [
  { type: "event", name: "Dripped", inputs: [{ name: "player", type: "address", indexed: true }, { name: "amount", type: "uint256", indexed: false }] },
  { type: "event", name: "SettleRefunded", inputs: [{ name: "caller", type: "address", indexed: true }, { name: "amount", type: "uint256", indexed: false }, { name: "gasUsed", type: "uint256", indexed: false }, { name: "l1Fee", type: "uint256", indexed: false }] },
] as const;

const hex = (n: bigint) => "0x" + n.toString(16);
const str = (s: unknown) => String(s);
const dec = (b: string) => Buffer.from(b.slice(2), "hex").toString("utf8").replace(/\0+$/, "");

async function allLogs(from: bigint, to: bigint): Promise<Log[]> {
  const out: Log[] = [];
  let b = from, step = 2_000_000n;
  while (b <= to) {
    const e = b + step - 1n > to ? to : b + step - 1n;
    try {
      const r = (await client.request({ method: "eth_getLogs", params: [{ address: [C.colonyGame, C.seasonPot, C.treasury], fromBlock: hex(b), toBlock: hex(e) }] } as never)) as Log[];
      out.push(...r);
      b = e + 1n;
    } catch {
      if (step < 10_000n) throw new Error("getLogs keeps failing");
      step /= 2n;
    }
  }
  return out;
}

async function main() {
  const head = await client.getBlockNumber();
  const raw = await allLogs(BigInt(NET.deployBlock), head);
  const fixed = raw.map((l) => ({ ...l, blockNumber: BigInt(l.blockNumber as never), logIndex: Number(l.logIndex) }));
  const ev = parseEventLogs({ abi: [...colonyGameAbi, ...seasonPotAbi, ...treasuryAbi] as never, logs: fixed as never, strict: false }) as unknown as {
    eventName: string; args: Record<string, unknown>; blockNumber: bigint; transactionHash: string; address: string; logIndex: number;
  }[];

  // block timestamps (the RPC leaves blockTimestamp empty)
  const blocks = [...new Set(ev.map((e) => e.blockNumber))];
  const ts = new Map<bigint, number>();
  for (let i = 0; i < blocks.length; i += 20) {
    await Promise.all(blocks.slice(i, i + 20).map(async (b) => ts.set(b, Number((await client.getBlock({ blockNumber: b })).timestamp))));
  }
  const at = (e: { blockNumber: bigint }) => ts.get(e.blockNumber)!;

  // the season's window and its colonies
  const started = ev.find((e) => e.eventName === "SeasonStarted" && Number(e.args.season) === SEASON);
  const ended = ev.find((e) => e.eventName === "SeasonEnded" && Number(e.args.season) === SEASON);
  const fin = ev.find((e) => e.eventName === "SeasonFinalized" && Number(e.args.season) === SEASON);
  if (!ended || !fin) throw new Error(`Season ${SEASON} is not finalized yet`);
  const end = Number(await client.readContract({ address: C.colonyGame, abi: colonyGameAbi, functionName: "seasonEnd", args: [SEASON] }));
  const prevEnd = SEASON > 1 ? Number(await client.readContract({ address: C.colonyGame, abi: colonyGameAbi, functionName: "seasonEnd", args: [SEASON - 1] })) : 0;
  const start = started ? Number(started.args.start) : prevEnd;

  type Col = Record<string, number | string | boolean | null>;
  const cols = new Map<string, Col>();
  for (const e of ev) {
    if (e.eventName !== "ColonyFounded" || Number(e.args.season) !== SEASON) continue;
    cols.set(str(e.args.colonyId), {
      id: Number(e.args.colonyId), owner: str(e.args.owner), name: null, foundedAt: Number(e.args.foundedAt), foundTx: e.transactionHash,
      score: 0, feeds: 0, workers: 0, born: 0, died: 0, tends: 0, leaves: 0, sugar: 0, builds: 0, chambers: 0, farms: 0, trails: 0,
      raids: 0, raidsWon: 0, raidsLost: 0, raidsGuarded: 0, loot: 0, soldiersLost: 0, raided: 0, guards: 0, lootLost: 0,
      shields: 0, speedups: 0, revives: 0, collapses: 0, wifSpent: 0, wifBurned: 0, wifToPot: 0, lastFedAt: 0, avenges: 0,
    });
  }
  const inSeason = (e: { blockNumber: bigint }) => at(e) <= end && at(e) >= start - 60;
  const names = new Map<string, string>();
  for (const e of ev) if (e.eventName === "NameSet") names.set(str(e.args.player).toLowerCase(), str(e.args.name));

  const W = (x: unknown) => Number(BigInt(x as bigint) / 10n ** 12n) / 1e6; // WIF, 6 decimals of precision
  const R = (x: unknown) => Number(BigInt(x as bigint)) / 1e9; // leaves/sugar are stored ×1e9
  const add = (id: unknown, k: string, v: number) => { const c = cols.get(str(id)); if (c) c[k] = (c[k] as number) + v; };
  const set = (id: unknown, k: string, v: number) => { const c = cols.get(str(id)); if (c) c[k] = v; };

  const txs = new Set<string>(); const wallets = new Set<string>();
  const byAction: Record<string, { count: number; wif: number }> = {};
  const spend = { total: 0, toPot: 0, burned: 0, toTreasury: 0 };
  const raids: Record<string, unknown>[] = [];
  const launched = new Map<string, { isAvenge: boolean; soldiers: number; at: number; tx: string }>();
  let refunds = 0, refundEth = 0, drips = 0, dripEth = 0;
  const timeline: { at: number; kind: string; text: string; tx: string }[] = [];

  for (const e of ev) {
    const a = e.args; const n = e.eventName;
    if (!inSeason(e) && e.address.toLowerCase() !== C.seasonPot.toLowerCase()) continue;
    const isCol = a.colonyId !== undefined ? cols.has(str(a.colonyId)) : a.raider !== undefined ? cols.has(str(a.raider)) || cols.has(str(a.defender)) : a.defender !== undefined ? cols.has(str(a.defender)) : false;
    if (e.address.toLowerCase() === C.colonyGame.toLowerCase() && isCol) {
      txs.add(e.transactionHash);
      for (const k of ["owner", "player", "raiderOwner", "defenderOwner"]) if (a[k]) wallets.add(str(a[k]).toLowerCase());
    }
    switch (n) {
      case "Paid": {
        if (!cols.has(str(a.colonyId))) break;
        const act = dec(str(a.action));
        byAction[act] ??= { count: 0, wif: 0 };
        byAction[act].count++; byAction[act].wif += W(a.amount);
        spend.total += W(a.amount); spend.toPot += W(a.toPot); spend.burned += W(a.burned); spend.toTreasury += W(a.toTreasury);
        add(a.colonyId, "wifSpent", W(a.amount)); add(a.colonyId, "wifBurned", W(a.burned)); add(a.colonyId, "wifToPot", W(a.toPot));
        break;
      }
      case "Tended": add(a.colonyId, "tends", 1); add(a.colonyId, "leaves", R(a.leavesGained)); add(a.colonyId, "sugar", R(a.sugarGained)); break;
      case "Built": {
        const b = dec(str(a.building));
        add(a.colonyId, "builds", 1);
        set(a.colonyId, b === "chamber" ? "chambers" : b === "farm" ? "farms" : "trails", Number(a.newCount));
        break;
      }
      case "QueenFed":
        add(a.colonyId, "feeds", 1); set(a.colonyId, "score", Number(a.totalScore)); set(a.colonyId, "workers", Number(a.workersAfter));
        add(a.colonyId, "born", Number(a.born)); add(a.colonyId, "died", Number(a.died)); set(a.colonyId, "lastFedAt", at(e));
        break;
      case "Shielded": add(a.colonyId, "shields", 1); break;
      case "SpedUp": add(a.colonyId, "speedups", 1); break;
      case "Revived": add(a.colonyId, "revives", 1); break;
      case "ColonyCollapsed": add(a.colonyId, "collapses", 1); break;
      case "Guarded": break; // counted from the settle outcome
      case "RaidLaunched":
        launched.set(str(a.raidId), { isAvenge: Boolean(a.isAvenge), soldiers: Number(a.soldiers), at: at(e), tx: e.transactionHash });
        if (a.isAvenge) add(a.raider, "avenges", 1);
        break;
      case "RaidSettled": {
        const outcome = Number(a.outcome); const loot = R(a.lootAmount); const l = launched.get(str(a.raidId));
        add(a.raider, "raids", 1); add(a.defender, "raided", 1); add(a.raider, "soldiersLost", Number(a.soldiersLost));
        if (outcome === 1) { add(a.raider, "raidsWon", 1); add(a.raider, "loot", loot); add(a.defender, "lootLost", loot); }
        else if (outcome === 3) { add(a.raider, "raidsGuarded", 1); add(a.defender, "guards", 1); }
        else add(a.raider, "raidsLost", 1);
        raids.push({
          id: str(a.raidId), raider: Number(a.raider), defender: Number(a.defender), raiderOwner: str(a.raiderOwner), defenderOwner: str(a.defenderOwner),
          outcome, roll: Number(a.roll), lootResource: Number(a.lootResource) === 1 ? "leaves" : "sugar", loot, soldiers: l?.soldiers ?? 0,
          soldiersLost: Number(a.soldiersLost), round: Number(a.round), isAvenge: l?.isAvenge ?? false, launchedAt: l?.at ?? 0, settledAt: at(e), tx: e.transactionHash,
        });
        break;
      }
      case "SettleRefunded": refunds++; refundEth += Number(a.amount) / 1e18; break;
      case "Dripped": drips++; dripEth += Number(a.amount) / 1e18; break;
    }
  }

  // ranking and payouts, straight from the pot
  const potSeason = (await client.readContract({ address: C.seasonPot, abi: seasonPotAbi, functionName: "seasons", args: [SEASON] })) as readonly bigint[];
  const pot = W(potSeason[0]);
  const topCount = Number(fin.args.topCount);
  const claims = ev.filter((e) => e.eventName === "Claimed" && Number(e.args.season) === SEASON);
  for (const c of cols.values()) {
    c.name = names.get(str(c.owner).toLowerCase()) ?? null;
    const rank = Number(await client.readContract({ address: C.seasonPot, abi: seasonPotAbi, functionName: "rankOf", args: [SEASON, BigInt(c.id as number)] }));
    c.rank = rank || null;
    c.top = rank > 0 && rank <= topCount;
    const cl = claims.find((x) => Number(x.args.colonyId) === c.id);
    const claimable = W(await client.readContract({ address: C.seasonPot, abi: seasonPotAbi, functionName: "claimable", args: [SEASON, BigInt(c.id as number)] }));
    c.share = cl ? W(cl.args.amount) : claimable;
    c.claimTx = cl ? cl.transactionHash : null;
    c.claimedAt = cl ? at(cl) : null;
    c.fedTwice = (c.feeds as number) >= 2;
    c.alive = (c.lastFedAt as number) > 0 && (c.lastFedAt as number) + 72 * 3600 >= end;
    c.qualifies = rank > 0;
  }

  // where the pot came from
  const sponsors = ev.filter((e) => e.eventName === "Sponsored" && Number(e.args.season) === SEASON).map((e) => ({ by: str(e.args.sponsor), name: str(e.args.name), amount: W(e.args.amount), tx: e.transactionHash, at: at(e) }));
  const endChanges = ev.filter((e) => e.eventName === "SeasonEndChanged" && Number(e.args.season) === SEASON).map((e) => ({ from: Number(e.args.oldEnd), to: Number(e.args.newEnd), tx: e.transactionHash, at: at(e) }));
  // where the winnings went next (a sponsor to a later season by a winner, e.g. genesis giving its share back)
  const winners = new Set([...cols.values()].map((c) => str(c.owner).toLowerCase()));
  const givenBack = ev.filter((e) => e.eventName === "Sponsored" && Number(e.args.season) > SEASON && winners.has(str(e.args.sponsor).toLowerCase()))
    .map((e) => ({ by: str(e.args.sponsor), toSeason: Number(e.args.season), name: str(e.args.name), amount: W(e.args.amount), tx: e.transactionHash, at: at(e) }));

  for (const c of [...cols.values()].sort((x, y) => (x.foundedAt as number) - (y.foundedAt as number))) timeline.push({ at: c.foundedAt as number, kind: "founded", text: `Colony #${c.id} founded`, tx: c.foundTx as string });
  if (raids.length) { const r = [...raids].sort((x, y) => (x.settledAt as number) - (y.settledAt as number))[0]; timeline.push({ at: r.settledAt as number, kind: "raid", text: `First raid settled by a drand round: #${r.raider} on #${r.defender}`, tx: r.tx as string }); }
  for (const x of endChanges) timeline.push({ at: x.at, kind: "end", text: "Season end moved", tx: x.tx });
  timeline.push({ at: at(ended), kind: "ended", text: "Season closed onchain", tx: ended.transactionHash });
  timeline.push({ at: at(fin), kind: "finalized", text: "Ranking verified and payouts opened", tx: fin.transactionHash });
  timeline.sort((x, y) => x.at - y.at);

  const list = [...cols.values()];
  const sum = (k: string) => list.reduce((s, c) => s + (c[k] as number), 0);
  const out = {
    season: SEASON, network: "mainnet", generatedAt: Math.floor(Date.now() / 1000),
    start, end, endedAt: at(ended), endTx: ended.transactionHash, finalizedAt: at(fin), finalizeTx: fin.transactionHash, finalizedBlock: Number(fin.blockNumber),
    endChanges,
    contracts: { colonyGame: C.colonyGame, seasonPot: C.seasonPot, treasury: C.treasury, wif: C.wif, drandVerifier: "0x2513832059bac29e5a5115634694F22B6B302Ae1" },
    pot: { total: pot, seed: sponsors.reduce((s, x) => s + x.amount, 0), fromPlay: spend.toPot, sponsors, half: pot / 2, topCount, qualified: Number(fin.args.qualified), sumAll: Number(fin.args.sumAll), sumTop: Number(fin.args.sumTop) },
    spend, byAction, givenBack,
    totals: {
      transactions: txs.size, wallets: wallets.size, colonies: list.length, qualified: Number(fin.args.qualified),
      feedings: sum("feeds"), tends: sum("tends"), builds: sum("builds"), chambers: sum("chambers"), farms: sum("farms"), trails: sum("trails"),
      antsBorn: sum("born"), antsDied: sum("died"), leaves: sum("leaves"), sugar: sum("sugar"),
      raids: raids.length, raidsWon: raids.filter((r) => r.outcome === 1).length, raidsGuarded: raids.filter((r) => r.outcome === 3).length,
      raidsLost: raids.filter((r) => r.outcome === 2).length, avenges: raids.filter((r) => r.isAvenge).length,
      loot: raids.reduce((s, r) => s + (r.loot as number), 0), soldiersLost: sum("soldiersLost"), drandRounds: raids.length,
      shields: sum("shields"), speedups: sum("speedups"), revives: sum("revives"), collapses: sum("collapses"),
      settleRefunds: refunds, settleRefundEth: refundEth, drips, dripEth,
    },
    colonies: list.sort((x, y) => ((x.rank as number) || 1e9) - ((y.rank as number) || 1e9) || (y.score as number) - (x.score as number) || (x.id as number) - (y.id as number)),
    raids: raids.sort((x, y) => (x.settledAt as number) - (y.settledAt as number)),
    timeline,
  };
  const dir = new URL("../public/season-data/", import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL(`${SEASON}.json`, dir), JSON.stringify(out, null, 1));
  const idxUrl = new URL("index.json", dir);
  const idx: { seasons: { season: number; start: number; end: number; pot: number; colonies: number; winner: number | null }[] } = existsSync(idxUrl) ? JSON.parse(readFileSync(idxUrl, "utf8")) : { seasons: [] };
  idx.seasons = idx.seasons.filter((s) => s.season !== SEASON);
  idx.seasons.push({ season: SEASON, start, end, pot, colonies: list.length, winner: (list.find((c) => c.rank === 1)?.id as number) ?? null });
  idx.seasons.sort((a, b) => b.season - a.season);
  writeFileSync(idxUrl, JSON.stringify(idx, null, 1));
  console.log(`season ${SEASON}: ${list.length} colonies, ${raids.length} raids, ${txs.size} transactions, pot ${pot}`);
}
main().catch((e) => { console.error((e as { shortMessage?: string }).shortMessage ?? String((e as Error).message ?? e).split("\n")[0].replace(/https?:\S+/g, "<rpc>")); process.exit(1); });
