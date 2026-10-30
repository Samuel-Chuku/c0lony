import { readFileSync } from "node:fs";
import { JsonStore } from "../state.ts";
import { addressTopic, logKey, type LogFilter, type RawLog } from "../intake/types.ts";

/** keccak256("Transfer(address,address,uint256)") */
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/** A vote is a transfer of at least 1 WIF (18 decimals) to a candidate wallet. */
export const MIN_VOTE_WEI = 10n ** 18n;

export type VoteWallets = { event: string; token: string; candidate_vote_wallets: string[] };

export function loadVoteWallets(file: string): VoteWallets {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as VoteWallets;
  if (!parsed.token || !Array.isArray(parsed.candidate_vote_wallets) || parsed.candidate_vote_wallets.length === 0) {
    throw new Error(`${file}: expected token and candidate_vote_wallets`);
  }
  return parsed;
}

/** eth_getLogs filter: WIF Transfer logs whose `to` is any candidate wallet. */
export function votesFilter(w: VoteWallets): LogFilter {
  return {
    addresses: [w.token],
    topics: [[TRANSFER_TOPIC], null, w.candidate_vote_wallets.map(addressTopic)],
  };
}

type Transfer = { from: string; to: string; value: string; block: number };
type VoteState = { transfers: Record<string, Transfer> };

/** Stores every WIF transfer to a candidate wallet (keyed by tx hash + log index, so re-delivery is harmless). */
export class VoteStore {
  private readonly store: JsonStore<VoteState>;
  private readonly token: string;
  private readonly wallets: Set<string>;

  constructor(file: string, w: VoteWallets) {
    this.store = new JsonStore<VoteState>(file, { transfers: {} });
    this.token = w.token.toLowerCase();
    this.wallets = new Set(w.candidate_vote_wallets.map((a) => a.toLowerCase()));
  }

  /** Adds matching transfers; returns how many were new. */
  add(logs: RawLog[]): number {
    const state = this.store.read();
    let added = 0;
    for (const log of logs) {
      if (log.address.toLowerCase() !== this.token) continue;
      if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC || log.topics.length < 3) continue;
      const to = topicAddress(log.topics[2]);
      if (!this.wallets.has(to)) continue;
      const key = logKey(log);
      if (state.transfers[key]) continue;
      state.transfers[key] = {
        from: topicAddress(log.topics[1]),
        to,
        value: BigInt(log.data === "0x" ? 0 : log.data).toString(),
        block: Number(BigInt(log.blockNumber)),
      };
      added++;
    }
    if (added > 0) this.store.write(state);
    return added;
  }

  /** Every address that sent at least 1 WIF to a candidate wallet, sorted, lowercase. */
  voters(): string[] {
    const set = new Set<string>();
    for (const t of Object.values(this.store.read().transfers)) {
      if (BigInt(t.value) >= MIN_VOTE_WEI) set.add(t.from);
    }
    return [...set].sort();
  }

  stats(): { transfers: number; oneWifTransfers: number; voters: number } {
    const all = Object.values(this.store.read().transfers);
    return {
      transfers: all.length,
      oneWifTransfers: all.filter((t) => BigInt(t.value) === MIN_VOTE_WEI).length,
      voters: this.voters().length,
    };
  }
}

export function topicAddress(topic: string): string {
  return "0x" + topic.slice(-40).toLowerCase();
}
