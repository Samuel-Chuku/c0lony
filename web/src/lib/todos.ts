"use client";
// Things waiting on the player right now, newest-urgent first: an unguarded raid, a raid to close, a starving or
// feedable queen, a pantry with trips to claim. The header bell counts them and lists them; each one links to
// where it is done. Everything here is read from the chain, so it stays right across devices.
import { RaidStatus, Resource, Status, useActiveRaids, useGameConfig, useNow, useProfile, type Raid } from "./game";
import { useColonyView, waitingNow } from "../screens/colony/data";

export type Todo = {
  id: string;
  kind: "guard" | "close" | "revive" | "feed" | "pantry";
  href: string;
  /** For "guard": the raid, so the row can name the raider. */
  raid?: Raid;
  /** Seconds left, where it matters (guard window). */
  left?: number;
  trips?: number;
};

export function useIncomingUnguarded(address: string | null | undefined) {
  const profile = useProfile(address).data;
  const colonyId = profile?.colonyId || null;
  const raids = useActiveRaids(colonyId).data;
  const guardWindow = Number(useGameConfig().data?.guardWindow ?? 0);
  const now = useNow(5_000);
  if (!colonyId || !raids || !guardWindow) return [];
  return raids
    .filter((r) => r.defender === colonyId && r.status === RaidStatus.Sealed && r.guard === Resource.None && now < Number(r.launchedAt) + guardWindow)
    .map((r) => ({ raid: r, left: Number(r.launchedAt) + guardWindow - now }));
}

export function useTodos(address: string | null | undefined): Todo[] {
  const profile = useProfile(address).data;
  const colonyId = profile?.colonyId || null;
  const cfg = useGameConfig().data;
  const raids = useActiveRaids(colonyId).data;
  const view = useColonyView(colonyId).data;
  const now = useNow(15_000);
  const incoming = useIncomingUnguarded(address);
  if (!profile || !colonyId || !cfg) return [];

  const out: Todo[] = incoming.map(({ raid, left }) => ({ id: `guard:${raid.id}`, kind: "guard", href: "/?tab=raids", raid, left }));

  const guardWindow = Number(cfg.guardWindow);
  const revealWindow = Number(cfg.revealWindow);
  if ((raids ?? []).some((r) => r.status === RaidStatus.Sealed && now >= Number(r.launchedAt) + guardWindow + revealWindow)) {
    out.push({ id: "close", kind: "close", href: "/?tab=raids" });
  }

  if (profile.status === Status.Starving) out.push({ id: "revive", kind: "revive", href: "/?do=feed" });
  if (profile.status === Status.Alive && view) {
    const lastFeedAt = Number(view.data.lastFeedAt);
    const nextFeed = lastFeedAt > 0 ? lastFeedAt + Number(cfg.feedMinInterval) : 0;
    if (now >= nextFeed) out.push({ id: "feed", kind: "feed", href: "/?do=feed" });
    const w = waitingNow(view, cfg, now);
    const trips = w.leafTrips + w.sugarTrips;
    if (trips > 0) out.push({ id: "pantry", kind: "pantry", href: "/?do=pantry", trips });
  }
  return out;
}
