"use client";
// Helpers shared by the Raids screen and the raid report.
import { useQuery } from "../../lib/store";
import { displayName } from "../../lib/format";
import { RaidStatus, readColony, type Raid } from "../../lib/game";
import { useXProfile } from "../../lib/useXProfile";

export const SETTLE_TIMEOUT = 48 * 3600; // matches the contract: after this a revealed raid can only be collected
export const SITE_URL = "https://app.c0lony.xyz";

/** The full colony view (owner, shield, last raid) for a colony id, read once and shared. */
export function useColonyView(id: bigint | null | undefined) {
  return useQuery(id ? `colonyview:${id}` : null, () => readColony(id!), 60_000);
}

/** Handle and avatar for a wallet: "@name" when X is linked, else the short address. */
export function useWho(wallet: string | null | undefined) {
  const x = useXProfile(wallet);
  const name = wallet ? displayName(wallet, x?.xHandle) : "…";
  return { name, avatar: x?.xAvatar ?? null, wallet: wallet ?? undefined };
}

export function xIntent(text: string, url: string) {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

export const profileUrl = (wallet: string) => `${SITE_URL}/colony?addr=${wallet}`;

export type Step = "sealed" | "marching" | "roll" | "home";
export const STEPS: { key: Step; label: string }[] = [
  { key: "sealed", label: "Sealed" },
  { key: "marching", label: "Marching" },
  { key: "roll", label: "Roll" },
  { key: "home", label: "Home" },
];

/** Where a raid is on the tracker. Sealed inside the guard window, Marching after it until revealed. */
export function stepOf(raid: Pick<Raid, "status" | "launchedAt">, now: number, guardWindow: number): Step {
  if (raid.status === RaidStatus.Revealed) return "roll";
  if (raid.status === RaidStatus.Sealed) return now < Number(raid.launchedAt) + guardWindow ? "sealed" : "marching";
  return "home";
}
