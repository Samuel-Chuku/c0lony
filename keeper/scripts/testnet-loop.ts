// Plays a full Colony loop on Robinhood Chain TESTNET with two throwaway player wallets and real drand rounds:
// found (+ drip), tend, feed, build, sponsor, raid (seal → guard → reveal → settle with drand, refund checked
// against the receipt), second feed, season end, ranking, claims. Progress is saved, so re-running resumes.
//
//   node --env-file=../contracts/.env scripts/testnet-loop.ts
//
// Testnet-only settings applied by the owner: guard window 1 h and feed interval 6 h (both within the caps).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  parseEther,
  parseEventLogs,
  type Abi,
  type Address,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { JsonStore } from "../src/state.ts";
import { raidSalt } from "../src/raidSalt.ts";

const OUT = join(import.meta.dirname, "../../contracts/out");
const abi = (name: string) => JSON.parse(readFileSync(join(OUT, `${name}.sol/${name}.json`), "utf8")).abi as Abi;
const broadcast = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../contracts/broadcast/Deploy.s.sol/46630/run-latest.json"), "utf8"),
);
const addrOf = (name: string) =>
  broadcast.transactions.find((t: { contractName: string; transactionType: string }) => t.contractName === name && t.transactionType === "CREATE")
    .contractAddress as Address;

const GAME = addrOf("ColonyGame");
const POT = addrOf("SeasonPot");
const TREASURY = addrOf("Treasury");
const WIF = addrOf("MockWIF");
const gameAbi = abi("ColonyGame");
const potAbi = abi("SeasonPot");
const wifAbi = abi("MockWIF");
const treasuryAbi = abi("Treasury");

const DRAND = "https://api.drand.sh/04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3";
const chain = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ROBINHOOD_TESTNET_RPC_URL!] } },
});
const transport = http(process.env.ROBINHOOD_TESTNET_RPC_URL);
const pub = createPublicClient({ chain, transport });
const owner = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hash);
const p1 = privateKeyToAccount(process.env.PLAYER1_PRIVATE_KEY as Hash);
const p2 = privateKeyToAccount(process.env.PLAYER2_PRIVATE_KEY as Hash);
const wallet = (a: typeof owner) => createWalletClient({ account: a, chain, transport });

type Step = { at: string; what: string; tx?: Hash; note?: string };
const progress = new JsonStore<{ done: Record<string, unknown>; steps: Step[] }>(
  join(import.meta.dirname, "../state/testnet-loop.json"),
  { done: {}, steps: [] },
);
const state = progress.read();
const record = (what: string, tx?: Hash, note?: string) => {
  state.steps.push({ at: new Date().toISOString(), what, tx, note });
  progress.write(state);
  console.log(`${what}${tx ? ` · ${tx}` : ""}${note ? ` · ${note}` : ""}`);
};
const once = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  if (key in state.done) return state.done[key] as T;
  const v = await fn();
  state.done[key] = v as unknown;
  progress.write(state);
  return v;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = async () => Number((await pub.getBlock()).timestamp);
const waitUntil = async (t: number, why: string) => {
  for (;;) {
    const left = t - (await now());
    if (left <= 0) return;
    console.log(`waiting ${Math.ceil(left / 60)} min for ${why}`);
    await sleep(Math.min(left, 300) * 1000);
  }
};

async function send(who: typeof owner, address: Address, a: Abi, functionName: string, args: unknown[] = [], value?: bigint) {
  const { request } = await pub.simulateContract({ account: who, address, abi: a, functionName, args, value });
  const hash = await wallet(who).writeContract(request);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted: ${hash}`);
  return receipt;
}
const read = <T>(address: Address, a: Abi, functionName: string, args: unknown[] = []) =>
  pub.readContract({ address, abi: a, functionName, args }) as Promise<T>;

console.log({ GAME, POT, TREASURY, WIF, owner: owner.address, p1: p1.address, p2: p2.address });

// 1. Testnet-only config: 1 h guard window, 6 h feed interval
await once("config", async () => {
  const c = (await read<Record<string, unknown>>(GAME, gameAbi, "getConfig")) as Record<string, unknown>;
  const r = await send(owner, GAME, gameAbi, "setConfig", [{ ...c, guardWindow: 3600n, feedMinInterval: 21600n }]);
  record("owner set testnet config: guard window 1 h, feed interval 6 h", r.transactionHash);
  return true;
});

// 2. Fund the players with gas and mock WIF
for (const [i, p] of [p1, p2].entries()) {
  await once(`fund${i}`, async () => {
    const h = await wallet(owner).sendTransaction({ to: p.address, value: parseEther("0.002") });
    await pub.waitForTransactionReceipt({ hash: h });
    const r = await send(p, WIF, wifAbi, "mint", [p.address, parseEther("100000")]);
    const r2 = await send(p, WIF, wifAbi, "approve", [GAME, 2n ** 256n - 1n]);
    record(`player${i + 1} funded with 0.002 ETH, minted 100,000 mWIF, approved game`, r2.transactionHash, h);
    return r.transactionHash;
  });
}

// 3. Season 1 seed through sponsor()
await once("sponsor", async () => {
  await send(owner, WIF, wifAbi, "mint", [owner.address, parseEther("8600")]);
  await send(owner, WIF, wifAbi, "approve", [POT, parseEther("8600")]);
  const r = await send(owner, POT, potAbi, "sponsor", [1, parseEther("8600"), "Season 1 seed"]);
  record("owner sponsored 8,600 mWIF into Season 1", r.transactionHash);
  return true;
});

// 4. Found both colonies (founder drip expected)
const ids: bigint[] = [];
for (const [i, p] of [p1, p2].entries()) {
  ids[i] = BigInt(
    await once(`found${i}`, async () => {
      const ethBefore = await pub.getBalance({ address: p.address });
      const r = await send(p, GAME, gameAbi, "foundColony", [[]]);
      const ev = parseEventLogs({ abi: gameAbi, logs: r.logs, eventName: "ColonyFounded" })[0] as unknown as {
        args: { colonyId: bigint };
      };
      const ethAfter = await pub.getBalance({ address: p.address });
      const gasCost = r.gasUsed * r.effectiveGasPrice;
      const drip = ethAfter - ethBefore + gasCost;
      record(`player${i + 1} founded colony #${ev.args.colonyId}`, r.transactionHash, `drip received ${formatEther(drip)} ETH`);
      return ev.args.colonyId.toString();
    }),
  );
}

// 5. Tend, feed, dig
for (const [i, p] of [p1, p2].entries()) {
  await once(`day0-${i}`, async () => {
    const t = await send(p, GAME, gameAbi, "tend");
    const f = await send(p, GAME, gameAbi, "feedQueen", [[]]);
    record(`player${i + 1} tended and fed the queen`, f.transactionHash, `tend ${t.transactionHash}`);
    return Number((await pub.getBlock()).timestamp);
  });
}
await once("dig", async () => {
  const r = await send(p1, GAME, gameAbi, "digChamber");
  record("player1 dug a nest chamber", r.transactionHash);
  return true;
});

// 6. Raid: player1 seals a raid on player2's sugar; player2 guards leaves (wrong guess)
const raidId = BigInt(
  await once("launch", async () => {
    const id = await read<bigint>(GAME, gameAbi, "nextRaidId", [ids[0]]);
    const salt = await raidSalt(wallet(p1), chain.id, GAME, id);
    const commitment = await read<Hash>(GAME, gameAbi, "commitmentFor", [2, salt, id]);
    const r = await send(p1, GAME, gameAbi, "launchRaid", [ids[1], 3, commitment]);
    record(`player1 sealed raid ${id} on colony #${ids[1]} with 3 soldiers`, r.transactionHash, "target hidden");
    return id.toString();
  }),
);
await once("guard", async () => {
  const r = await send(p2, GAME, gameAbi, "guard", [raidId, 1]);
  record("player2 guarded leaves", r.transactionHash);
  return true;
});

// 7. Reveal after the 1 h guard window (salt re-derived from the wallet signature)
const raid = await read<readonly unknown[]>(GAME, gameAbi, "raids", [raidId]);
await waitUntil(Number(raid[7]) + 3600 + 5, "the guard window to close");
const round = BigInt(
  await once("reveal", async () => {
    const salt = await raidSalt(wallet(p1), chain.id, GAME, raidId);
    const r = await send(p1, GAME, gameAbi, "reveal", [raidId, 2, salt]);
    const ev = parseEventLogs({ abi: gameAbi, logs: r.logs, eventName: "Revealed" })[0] as unknown as {
      args: { round: bigint; roundTime: bigint };
    };
    record(`player1 revealed target sugar; assigned drand round ${ev.args.round}`, r.transactionHash);
    return ev.args.round.toString();
  }),
);

// 8. Settle with the real drand signature; the owner acts as keeper; refund vs actual gas
await once("settle", async () => {
  for (;;) {
    const res = await fetch(`${DRAND}/public/${round}`);
    if (res.ok) {
      const { signature } = (await res.json()) as { signature: string };
      const balBefore = await pub.getBalance({ address: owner.address });
      const r = await send(owner, GAME, gameAbi, "settle", [raidId, `0x${signature}`]);
      const ev = parseEventLogs({ abi: gameAbi, logs: r.logs, eventName: "RaidSettled" })[0] as unknown as {
        args: { outcome: number; roll: bigint; lootAmount: bigint; refund: bigint };
      };
      const paid = r.gasUsed * r.effectiveGasPrice;
      const balAfter = await pub.getBalance({ address: owner.address });
      const outcome = ["None", "RaiderWon", "RaiderLost", "Guarded"][ev.args.outcome];
      record(
        `raid settled with drand round ${round}: ${outcome}, roll ${ev.args.roll}, loot ${Number(ev.args.lootAmount) / 1e9} sugar`,
        r.transactionHash,
        `gas ${r.gasUsed} · paid ${formatEther(paid)} ETH · refunded ${formatEther(ev.args.refund)} ETH (${((Number(ev.args.refund) / Number(paid)) * 100).toFixed(1)}%) · net ${formatEther(balAfter - balBefore)} ETH`,
      );
      return true;
    }
    console.log(`drand round ${round} not published yet`);
    await sleep(10_000);
  }
});

// 9. Second feeding after the 6 h interval (both colonies then qualify)
const fedAt = Number(state.done["day0-1"]);
await waitUntil(fedAt + 21600 + 5, "the 6 h feed interval");
for (const [i, p] of [p1, p2].entries()) {
  await once(`feed2-${i}`, async () => {
    await send(p, GAME, gameAbi, "tend");
    const r = await send(p, GAME, gameAbi, "feedQueen", [[]]);
    record(`player${i + 1} fed the queen a second time`, r.transactionHash);
    return true;
  });
}

// 10. End the season: owner moves Season 1's end to 2 minutes from now, then anyone ends it
const endAt = await once("seasonEnd", async () => {
  const end = (await now()) + 120;
  const r = await send(owner, GAME, gameAbi, "setCurrentSeasonEnd", [BigInt(end)]);
  record("owner moved Season 1's end to 2 minutes from now", r.transactionHash);
  return end;
});
await waitUntil(Number(endAt) + 5, "the season to end");
await once("endSeason", async () => {
  const r = await send(owner, POT, potAbi, "endSeason", [1]);
  record("season 1 ended", r.transactionHash);
  return true;
});

// 11. Keeper-style ranking: qualifying colonies by score desc (ties: lower id), then the rest by id
await once("ranking", async () => {
  const rows = await Promise.all(
    ids.map(async (id) => {
      const [, score, fedTwice, qualifies] = await read<[number, bigint, boolean, boolean]>(GAME, gameAbi, "colonyResult", [id]);
      return { id, score, fedTwice, qualifies };
    }),
  );
  const order = rows
    .filter((r) => r.fedTwice)
    .sort((a, b) =>
      a.qualifies !== b.qualifies ? (a.qualifies ? -1 : 1) : a.qualifies && a.score !== b.score ? (a.score > b.score ? -1 : 1) : a.id < b.id ? -1 : 1,
    );
  const r = await send(owner, POT, potAbi, "submitRanking", [1, order.map((x) => x.id)]);
  record(`ranking submitted: ${order.map((x) => `#${x.id} (score ${x.score}${x.qualifies ? "" : ", not qualifying"})`).join(", ")}`, r.transactionHash);
  return true;
});

// 12. Claims
for (const [i, p] of [p1, p2].entries()) {
  await once(`claim${i}`, async () => {
    const r = await send(p, POT, potAbi, "claim", [1]);
    const ev = parseEventLogs({ abi: potAbi, logs: r.logs, eventName: "Claimed" })[0] as unknown as { args: { amount: bigint } };
    record(`player${i + 1} claimed ${formatEther(ev.args.amount)} mWIF from Season 1`, r.transactionHash);
    return true;
  });
}

const tEth = await pub.getBalance({ address: TREASURY });
console.log(`done · treasury ETH ${formatEther(tEth)} · treasury mWIF ${formatEther(await read<bigint>(WIF, wifAbi, "balanceOf", [TREASURY]))}`);
void treasuryAbi;
