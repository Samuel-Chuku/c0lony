// WIF sent between players ("Send WIF to a colony" in the app) becomes a "gift" feed row.
// It is a plain ERC-20 transfer, so it is read from the WIF token's Transfer logs, not from the game. Only
// transfers where both sides have founded a colony count; swaps, game payments, pot claims and the treasury
// never match because those addresses are not players.
import { decodeEventLog, erc20Abi, toEventSelector } from "viem";
import type { RawLog } from "../intake/types.ts";
import { JsonStore } from "../state.ts";
import type { FeedEvent } from "./decode.ts";

export const TRANSFER_TOPIC = toEventSelector("Transfer(address,address,uint256)");

const lc = (a: string) => a.toLowerCase();

/** Every wallet that has founded a colony (any season). Persisted, and rebuilt from founded events on start. */
export class Players {
  private readonly store: JsonStore<string[]>;
  private readonly set: Set<string>;

  constructor(path: string) {
    this.store = new JsonStore<string[]>(path, []);
    this.set = new Set(this.store.read().map(lc));
  }

  has(wallet: string): boolean {
    return this.set.has(lc(wallet));
  }

  add(wallet: string): void {
    const w = lc(wallet);
    if (this.set.has(w)) return;
    this.set.add(w);
    this.store.write([...this.set]);
  }

  get size(): number {
    return this.set.size;
  }
}

/** A WIF Transfer log between two different players, as a feed row. Null for anything else. */
export async function decodeGift(
  log: RawLog,
  deps: { wifAddress: string; players: Players; blockTime: (block: number) => Promise<number> },
): Promise<FeedEvent | null> {
  if (log.removed || lc(log.address) !== lc(deps.wifAddress) || lc(log.topics[0] ?? "") !== lc(TRANSFER_TOPIC)) return null;
  let from: string, to: string, value: bigint;
  try {
    const d = decodeEventLog({ abi: erc20Abi, data: log.data as `0x${string}`, topics: log.topics as [`0x${string}`] });
    if (d.eventName !== "Transfer") return null;
    ({ from, to, value } = d.args as { from: string; to: string; value: bigint });
  } catch {
    return null;
  }
  from = lc(from);
  to = lc(to);
  if (from === to || value <= 0n || !deps.players.has(from) || !deps.players.has(to)) return null;
  const block = Number(BigInt(log.blockNumber));
  return {
    block,
    tx: lc(log.transactionHash),
    logIndex: Number(BigInt(log.logIndex)),
    ts: await deps.blockTime(block),
    type: "gift",
    actors: [from, to],
    data: { from, to, amount: String(value) },
  };
}
