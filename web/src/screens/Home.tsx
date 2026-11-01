"use client";
// The four main tabs on one static page: / (Colony), /?tab=raids, /?tab=live, /?tab=season.
import { useSearchParams } from "next/navigation";
import { ColonyScreen } from "./colony/ColonyScreen";
import { RaidsScreen } from "./raids/RaidsScreen";
import { LiveScreen } from "./live/LiveScreen";
import { SeasonScreen } from "./season/SeasonScreen";

export function Home() {
  const tab = useSearchParams().get("tab");
  if (tab === "raids") return <RaidsScreen />;
  if (tab === "live") return <LiveScreen />;
  if (tab === "season") return <SeasonScreen />;
  return <ColonyScreen />;
}
