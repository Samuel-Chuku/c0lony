import { encodeAbiParameters, encodeEventTopics, stringToHex, type Abi } from "viem";
import { colonyGameAbi, seasonPotAbi } from "../src/abi.ts";
import type { GameReader, RaidInfo } from "../src/chain.ts";
import { RaidDirectory, type DecodeDeps } from "../src/feed/decode.ts";
import type { RawLog } from "../src/intake/types.ts";
import { tmpDir } from "./helpers.ts";
import { join } from "node:path";

export const GAME = "0x00000000000000000000000000000000000000a1";
export const POT = "0x00000000000000000000000000000000000000b2";
export const ALICE = "0x1111111111111111111111111111111111111111";
export const BOB = "0x2222222222222222222222222222222222222222";
export const bytes32 = (s: string) => stringToHex(s, { size: 32 });

/** Builds a log the way the chain would emit it, from an event name and its named args. */
export function makeLog(contract: "game" | "pot", eventName: string, args: Record<string, unknown>, block = 100, index = 0): RawLog {
  const abi = (contract === "game" ? colonyGameAbi : seasonPotAbi) as Abi;
  const ev = abi.find((x) => x.type === "event" && x.name === eventName) as Extract<(typeof abi)[number], { type: "event" }>;
  const topics = encodeEventTopics({ abi, eventName, args } as never);
  const plain = ev.inputs.filter((i) => !i.indexed);
  const data = encodeAbiParameters(plain, plain.map((i) => args[i.name!]) as never);
  return {
    address: contract === "game" ? GAME : POT,
    topics: topics as string[],
    data,
    blockNumber: "0x" + block.toString(16),
    transactionHash: "0x" + (block * 1000 + index).toString(16).padStart(64, "0"),
    logIndex: "0x" + index.toString(16),
  };
}

export function decodeDeps(over: Partial<DecodeDeps> = {}): DecodeDeps {
  return {
    gameAddress: GAME,
    potAddress: POT,
    blockTime: async (b) => 1_700_000_000 + b,
    lookupRaid: async () => undefined,
    directory: new RaidDirectory(join(tmpDir(), "raids.json")),
    ...over,
  };
}

export class FakeReader implements GameReader {
  raids = new Map<string, RaidInfo>();
  reads = 0;
  avenge = new Map<string, boolean>();
  async raid(id: bigint) {
    this.reads++;
    return this.raids.get(String(id)) ?? { status: 0, launchedAt: 0, round: 0 };
  }
  async sealedLifetime() {
    return 28 * 3600;
  }
  async leafForageCooldown() {
    return 6 * 3600;
  }
  async avengeAvailable(d: string, r: string) {
    return { available: this.avenge.get(`${d}:${r}`) ?? true, expiresAt: 0 };
  }
  async seasonEnd() {
    return 2_000_000_000;
  }
  async raidWallets() {
    return undefined;
  }
}
