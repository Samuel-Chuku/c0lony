"use client";
// Finds who "Send WIF to a colony" is for. Players type what they see in the game: a colony name, an X handle
// ("@pixy"), or a wallet address. Names are checked onchain (unique, lowercase); X handles are matched against
// the owners of this season's colonies. The caller always shows the address before sending.
import { isAddress, keccak256, stringToBytes, zeroAddress } from "viem";
import { NETWORK } from "../config";
import { colonyGameAbi } from "./abi";
import { loadProfiles } from "./api";
import { publicClient } from "./chain";
import { GAME, type ColonyRow } from "./game";

export type Recipient = { address: string; via: "address" | "name" | "x" };

const NAME_RE = /^[a-z0-9_]{3,16}$/;
const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

/** The text cleaned up: trimmed, without a leading "@". */
export const cleanQuery = (q: string) => q.trim().replace(/^@/, "");

/** Who holds a colony name onchain (null when nobody, or on a network without names). */
export async function nameOwner(name: string): Promise<string | null> {
  const n = name.toLowerCase();
  if (!NETWORK.names || !NAME_RE.test(n)) return null;
  const a = await publicClient.readContract({ address: GAME, abi: colonyGameAbi, functionName: "nameHolder", args: [keccak256(stringToBytes(n))] });
  return a === zeroAddress ? null : a.toLowerCase();
}

/** Resolves typed text to a wallet. Null when nothing matches. */
export async function findRecipient(query: string, colonies: ColonyRow[] | null | undefined): Promise<Recipient | null> {
  const q = cleanQuery(query);
  if (!q) return null;
  if (isAddress(q)) return { address: q.toLowerCase(), via: "address" };
  const byName = await nameOwner(q);
  if (byName) return { address: byName, via: "name" };
  if (!HANDLE_RE.test(q) || !colonies?.length) return null;
  const owners = colonies.map((c) => c.owner);
  const profiles = await loadProfiles(owners);
  const want = q.toLowerCase();
  for (const w of owners) {
    const p = profiles.get(w);
    if (p?.xHandle && p.xHandle.replace(/^@/, "").toLowerCase() === want) return { address: w, via: "x" };
  }
  for (const w of owners) {
    const p = profiles.get(w);
    if (p?.name && p.name.toLowerCase() === want) return { address: w, via: "name" };
  }
  return null;
}

