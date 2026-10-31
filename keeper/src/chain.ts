// Read-only access to ColonyGame through viem, behind small interfaces so tests can use fakes.
import { createPublicClient, defineChain, http, type Address, type PublicClient } from "viem";
import { colonyGameAbi } from "./abi.ts";
import type { Config } from "./config.ts";
import type { RaidWallets } from "./feed/decode.ts";

export const RAID_STATUS = { None: 0, Sealed: 1, Revealed: 2, Settled: 3, Failed: 4, Refunded: 5 } as const;

export type RaidInfo = { status: number; launchedAt: number; round: number };

export interface GameReader {
  raid(raidId: bigint): Promise<RaidInfo>;
  /** Guard window plus reveal window, in seconds (a sealed raid that never reveals can be collected after this). */
  sealedLifetime(): Promise<number>;
  leafForageCooldown(): Promise<number>;
  avengeAvailable(defender: string, raider: string): Promise<{ available: boolean; expiresAt: number }>;
  seasonEnd(season: number): Promise<number>;
  raidWallets(raidId: bigint): Promise<RaidWallets | undefined>;
}

export function makeChain(cfg: Config) {
  return defineChain({
    id: cfg.chainId,
    name: cfg.network === "mainnet" ? "Robinhood Chain" : "Robinhood Chain Testnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
  });
}

export function makePublicClient(cfg: Config): PublicClient {
  return createPublicClient({ chain: makeChain(cfg), transport: http(cfg.rpcUrl) });
}

export class ViemGameReader implements GameReader {
  private readonly client: PublicClient;
  private readonly address: Address;

  constructor(client: PublicClient, gameAddress: string) {
    this.client = client;
    this.address = gameAddress as Address;
  }

  async raid(raidId: bigint): Promise<RaidInfo> {
    const r = await this.client.readContract({ address: this.address, abi: colonyGameAbi, functionName: "raids", args: [raidId] });
    // (raider, defender, soldiers, status, guard, target, outcome, launchedAt, round, commitment)
    return { status: Number(r[3]), launchedAt: Number(r[7]), round: Number(r[8]) };
  }

  async sealedLifetime(): Promise<number> {
    const c = await this.client.readContract({ address: this.address, abi: colonyGameAbi, functionName: "getConfig" });
    return Number(c.guardWindow) + Number(c.revealWindow);
  }

  async leafForageCooldown(): Promise<number> {
    const c = await this.client.readContract({ address: this.address, abi: colonyGameAbi, functionName: "getConfig" });
    return Number(c.leafForageCooldown);
  }

  async avengeAvailable(defender: string, raider: string) {
    const [available, expiresAt] = await this.client.readContract({
      address: this.address, abi: colonyGameAbi, functionName: "avengeAvailable", args: [defender as Address, raider as Address],
    });
    return { available, expiresAt: Number(expiresAt) };
  }

  async seasonEnd(season: number): Promise<number> {
    return Number(await this.client.readContract({ address: this.address, abi: colonyGameAbi, functionName: "seasonEnd", args: [season] }));
  }

  async raidWallets(raidId: bigint): Promise<RaidWallets | undefined> {
    const r = await this.client.readContract({ address: this.address, abi: colonyGameAbi, functionName: "raids", args: [raidId] });
    if (Number(r[3]) === 0) return undefined;
    const owner = async (id: bigint) =>
      (await this.client.readContract({ address: this.address, abi: colonyGameAbi, functionName: "getColony", args: [id] })).data.owner.toLowerCase();
    return { raider: await owner(r[0]), defender: await owner(r[1]) };
  }
}
