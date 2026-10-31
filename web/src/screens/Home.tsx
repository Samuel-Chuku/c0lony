"use client";
// The three main tabs on one static page: / (Colony), /?tab=raids, /?tab=live.
import { useSearchParams } from "next/navigation";
import { ColonyScreen } from "./colony/ColonyScreen";
import { RaidsScreen } from "./raids/RaidsScreen";
import { LiveScreen } from "./live/LiveScreen";

export function Home() {
  const tab = useSearchParams().get("tab");
  if (tab === "raids") return <RaidsScreen />;
  if (tab === "live") return <LiveScreen />;
  return <ColonyScreen />;
}
