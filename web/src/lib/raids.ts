"use client";
// Raid steps as wallet-client calls, used with useAction().run(fn).
// The salt comes from the raider's wallet signing the raid ID. At launch the target and salt are also timelocked
// (drand quicknet) to a round just after the guard window and posted with the raid, so the keeper reveals it and
// the raider never has to come back. Revealing by hand still works from any device: the target is recovered by
// checking both resources against the onchain commitment.
import { stringToHex, type Address, type Hash, type Hex } from "viem";
import { CONFIG } from "../config";
import { colonyGameAbi } from "./abi";
import { publicClient } from "./chain";
import { GAME, Resource } from "./game";
import { raidSalt, type walletClientFor } from "./tx";

type Client = Awaited<ReturnType<typeof walletClientFor>>;
const game = { address: GAME, abi: colonyGameAbi } as const;

async function send(client: Client, functionName: string, args: readonly unknown[]): Promise<Hash> {
  const { request } = await publicClient.simulateContract({
    account: client.account.address,
    ...game,
    functionName: functionName as never,
    args: args as never,
  });
  return client.writeContract(request as never);
}

/** Seconds after the guard window closes that the timelock opens: covers block-time drift, never earlier. */
const UNLOCK_MARGIN = 120;

/** The target and salt, timelocked so nobody (the keeper included) can read them until after the guard window. */
async function timelocked(target: number, salt: Hex): Promise<Hex> {
  const [{ timelockEncrypt, mainnetClient, roundAt, Buffer }, block, cfg] = await Promise.all([
    import("tlock-js"),
    publicClient.getBlock(),
    publicClient.readContract({ ...game, functionName: "getConfig" }),
  ]);
  // Chain time, not the phone's clock, so a slow clock can never open it during the guard window.
  const opensAt = Number(block.timestamp) + Number(cfg.guardWindow) + UNLOCK_MARGIN;
  const client = mainnetClient(); // drand quicknet
  const round = roundAt(opensAt * 1000, await client.chain().info());
  const payload = Buffer.concat([Buffer.from([target]), Buffer.from(salt.slice(2), "hex")]);
  return stringToHex(await timelockEncrypt(round, payload, client));
}

async function sealed(client: Client, colonyId: bigint, target: number) {
  const raidId = await publicClient.readContract({ ...game, functionName: "nextRaidId", args: [colonyId] });
  const salt = await raidSalt(client, raidId);
  const [commitment, lock] = await Promise.all([
    publicClient.readContract({ ...game, functionName: "commitmentFor", args: [target, salt, raidId] }),
    timelocked(target, salt),
  ]);
  return [commitment, lock] as const;
}

/** Seal a raid on `defenderId`, targeting leaves or sugar (hidden until reveal). Every free ant marches. */
export const launchRaid = (myColonyId: bigint, defenderId: bigint, target: number) => async (client: Client) =>
  send(client, "launchRaid", [defenderId, ...(await sealed(client, myColonyId, target))]);

/** Avenge: the same sealed raid, aimed at the wallet that raided you. */
export const avenge = (myColonyId: bigint, raider: string, target: number) => async (client: Client) =>
  send(client, "avenge", [raider as Address, ...(await sealed(client, myColonyId, target))]);

/** Reveal by hand after the guard window (the keeper normally does it): re-derive the salt and find which target the commitment was sealed with. */
export const reveal = (raidId: bigint, commitment: string) => async (client: Client) => {
  const salt = await raidSalt(client, raidId);
  for (const target of [Resource.Leaves, Resource.Sugar]) {
    const c = await publicClient.readContract({ ...game, functionName: "commitmentFor", args: [target, salt, raidId] });
    if (c.toLowerCase() === commitment.toLowerCase()) return send(client, "reveal", [raidId, target, salt]);
  }
  throw new Error("This raid was sealed from another wallet.");
};

export const guard = (raidId: bigint, resource: number) => (client: Client) => send(client, "guard", [raidId, resource]);
export const collect = (raidId: bigint) => (client: Client) => send(client, "collect", [raidId]);

/** The drand evmnet signature for `round`, or null if it isn't published yet. */
export async function drandSignature(round: bigint | number): Promise<`0x${string}` | null> {
  const res = await fetch(`${CONFIG.drand.apiUrl}/${CONFIG.drand.chainHash}/public/${round}`);
  if (!res.ok) return null;
  const body = (await res.json()) as { signature?: string };
  return body.signature ? (`0x${body.signature.replace(/^0x/, "")}` as const) : null;
}

export const settle = (raidId: bigint, round: bigint) => async (client: Client) => {
  const sig = await drandSignature(round);
  if (!sig) throw new Error("The drand round isn't out yet.");
  return send(client, "settle", [raidId, sig]);
};

/** Public verify link for a drand round. */
export const drandRoundUrl = (round: bigint | number | string) => `${CONFIG.drand.apiUrl}/${CONFIG.drand.chainHash}/public/${round}`;
