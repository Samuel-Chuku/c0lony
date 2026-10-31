"use client";
// The Colony tab: resource bar, the living world, the queen, production and today's orders.
import { useState } from "react";
import { Screen } from "../../shell/Screen";
import { useShell } from "../../shell/Providers";
import { ColonyWorld } from "../../world/ColonyWorld";
import { useFeed } from "../../lib/api";
import { useBalances, useGameConfig, useNow, useProfile, useSeason, Status } from "../../lib/game";
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
  const [buildOpen, setBuildOpen] = useState(false);

  const p = profile.data;
  const hasColony = !!p && p.colonyId !== 0n && p.status >= Status.Alive && p.status <= Status.Collapsed;
  const alive = hasColony && p!.status === Status.Alive;
  const loading = !session.ready || (!!addr && !p && !profile.error);
  const failed = !!addr && !p && !!profile.error;
  const wif = balances.data?.wif;
  const openBuild = () => setBuildOpen(true);

  return (
    <Screen header={<ColonyHeader />} tab="colony">
      <div className="c0-colony">
        {alive ? <ResourceBar profile={p!} onOpen={openBuild} /> : null}
        <div className={alive ? "c0-world-wrap" : "c0-world-wrap c0-world-wrap--top"}>
          <ColonyWorld
            fedUntil={hasColony ? Number(p!.fedUntil) : null}
            now={now}
            collapsed={!hasColony || p!.status === Status.Collapsed}
            state={loading ? "loading" : failed ? "error" : "live"}
            counts={hasColony ? { chambers: p!.chambers, trails: p!.trails, farms: p!.farms, ants: p!.ants } : undefined}
            onOpenBuild={alive ? openBuild : undefined}
          />
        </div>
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
