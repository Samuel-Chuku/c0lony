"use client";
// The Colony tab: resource bar, the living world, the queen, production and today's orders.
import { useEffect, useState } from "react";
import { wantAmbience } from "../../lib/sound";
import { Screen } from "../../shell/Screen";
import { useShell } from "../../shell/Providers";
import { ColonyWorld } from "../../world/ColonyWorld";
import { useFeed } from "../../lib/api";
import { useBalances, useColonies, useGameConfig, useNow, useProfile, useSeason, Status } from "../../lib/game";
import { ColonyGlance, RecentActivity } from "./DeskPanels";
import { useSession } from "../../lib/session";
import { BuildSheet } from "./BuildSheet";
import { ColonyHeader } from "./ColonyHeader";
import { FoundCard } from "./FoundCard";
import { OrdersPanel } from "./OrdersPanel";
import { ProductionCard } from "./ProductionCard";
import { QueenCard } from "./QueenCard";
import { ResourceBar } from "./ResourceBar";
import { useColonyView } from "./data";
import "./colony.css";

export function ColonyScreen() {
  const session = useSession();
  const shell = useShell();
  const now = useNow();
  const addr = session.address;
  const profile = useProfile(addr);
  const view = useColonyView(profile.data && profile.data.colonyId ? profile.data.colonyId : null);
  const cfg = useGameConfig();
  const season = useSeason();
  const balances = useBalances(addr);
  const feed = useFeed("mine", addr, 50);
  const colonies = useColonies();
  const [buildOpen, setBuildOpen] = useState(false);
  // The underground hum and the ants' footsteps play while the colony is on screen.
  useEffect(() => {
    wantAmbience(true);
    return () => wantAmbience(false);
  }, []);

  const p = profile.data;
  const hasColony = !!p && p.colonyId !== 0n && p.status >= Status.Alive && p.status <= Status.Collapsed;
  const alive = hasColony && p!.status === Status.Alive;
  const loading = !session.ready || (!!addr && !p && !profile.error);
  const failed = !!addr && !p && !!profile.error;
  const wif = balances.data?.wif;
  const openBuild = () => setBuildOpen(true);
  const ranked = [...(colonies.data ?? [])].sort((a, b) => (a.score === b.score ? (a.id < b.id ? -1 : 1) : a.score > b.score ? -1 : 1));
  const rankIdx = addr ? ranked.findIndex((r) => r.owner === addr.toLowerCase()) : -1;

  return (
    <Screen header={<ColonyHeader />} tab="colony">
      <div className="c0-colony">
        {alive ? <ResourceBar profile={p!} onOpen={openBuild} /> : null}
        <div className={alive ? "c0-world-wrap" : "c0-world-wrap c0-world-wrap--top"}>
          <ColonyWorld
            fedUntil={hasColony ? Number(p!.fedUntil) : null}
            now={now}
            collapsed={hasColony && p!.status === Status.Collapsed}
            invite={!hasColony}
            state={loading ? "loading" : failed ? "error" : "live"}
            counts={hasColony ? { chambers: p!.chambers, trails: p!.trails, farms: p!.farms, ants: p!.ants } : undefined}
            onOpenBuild={alive ? openBuild : undefined}
          />
        </div>
        {alive ? <ColonyGlance profile={p!} rank={rankIdx >= 0 ? rankIdx + 1 : null} /> : null}
        <div className="c0-colony__cards">
          {hasColony ? (
            <>
              <QueenCard
                addr={addr!}
                profile={p!}
                view={view.data}
                cfg={cfg.data}
                season={season.data}
                wif={wif}
                now={now}
                onBuy={shell.openMenu}
              />
              {alive && view.data && cfg.data ? (
                <ProductionCard view={view.data} cfg={cfg.data} now={now} wif={wif} onBuy={shell.openMenu} />
              ) : null}
              {alive ? <OrdersPanel rows={feed.data} now={now} /> : null}
              {hasColony ? <RecentActivity rows={feed.data} me={addr} now={now} /> : null}
            </>
          ) : loading || failed ? null : (
            <FoundCard addr={addr} wif={wif} onBuy={shell.openMenu} />
          )}
        </div>
      </div>
      {alive ? <BuildSheet open={buildOpen} onClose={() => setBuildOpen(false)} profile={p!} /> : null}
    </Screen>
  );
}
