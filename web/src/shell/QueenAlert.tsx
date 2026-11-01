"use client";
// Outside the colony picture, a hungry queen shows in two more places: the page title ("Hungry · C0LONY") and a
// badge on the installed app's home-screen icon. Both clear once she has more than 12 hours of food.
import { useEffect } from "react";
import { Status, useNow, useProfile } from "../lib/game";
import { useSession } from "../lib/session";

const HUNGRY = 12 * 3600;

export function QueenAlert() {
  const session = useSession();
  const profile = useProfile(session.address).data;
  const now = useNow(60_000);
  const hungry =
    !!profile &&
    profile.colonyId !== 0n &&
    (profile.status === Status.Starving || (profile.status === Status.Alive && Number(profile.fedUntil) - now <= HUNGRY));

  useEffect(() => {
    const base = document.title.replace(/^Hungry · /, "");
    document.title = hungry ? `Hungry · ${base}` : base;
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (hungry) nav.setAppBadge?.(1).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }, [hungry]);

  return null;
}
