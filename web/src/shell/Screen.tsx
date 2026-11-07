"use client";
// The frame every app screen sits in: header (title or back link, WIF balance, the player's X picture that
// opens the Menu), the offline and update strips, the content, and the four-tab bottom nav on main screens.
// From 1024px wide the bottom nav gives way to the side rail and screens may lay out in two columns.
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { BlockedStrip, BottomNav, BrandName, Button, Header, type NavTab } from "../ui";
import { useActiveRaids, useBalances, useProfile } from "../lib/game";
import { useSession } from "../lib/session";
import { useXProfile } from "../lib/useXProfile";
import { useFeed } from "../lib/api";
import { markLiveSeen, useLiveSeen } from "../lib/liveSeen";
import { QUIET_TYPES } from "../screens/live/feedText";
import { fmtWif } from "../lib/format";
import { useShell } from "./Providers";
import { SideRail, tabHref } from "./SideRail";
import { SoundToggle } from "./SoundToggle";
import { RaidStrip, TodoBell } from "./TodoBell";

export type ScreenProps = {
  title?: ReactNode;
  sub?: ReactNode;
  /** Main screens show the bottom nav with this tab active. */
  tab?: NavTab;
  /** Sub-screens show "‹ Back" instead of the title. */
  back?: boolean;
  /** Replace the standard header entirely (the Colony screen has its own). */
  header?: ReactNode;
  children: ReactNode;
};

export { tabHref };

export function Screen({ title, sub, tab, back, header, children }: ScreenProps) {
  const router = useRouter();
  const shell = useShell();
  const session = useSession();
  const balances = useBalances(session.address);
  const me = useXProfile(session.address);
  // A red dot on the Raids tab while any raid involving the player is underway.
  const colonyId = useProfile(session.address).data?.colonyId;
  const raidsUnderway = (useActiveRaids(colonyId || null).data ?? []).length > 0;
  // ...and on Live when the feed has rows newer than the last one seen there.
  const newestLive = useFeed("all", null, 10).data?.find((e) => !QUIET_TYPES.has(e.type))?.id ?? null;
  const liveSeen = useLiveSeen();
  const liveNew = tab !== "live" && newestLive !== null && liveSeen !== null && newestLive > liveSeen;
  // Viewing Live marks everything there as seen; the very first visit just sets the starting point.
  useEffect(() => {
    if (newestLive !== null && (tab === "live" || liveSeen === null)) markLiveSeen(newestLive);
  }, [tab, newestLive, liveSeen]);
  const alerts = [...(raidsUnderway ? (["raids"] as const) : []), ...(liveNew ? (["live"] as const) : [])];
  const timeOf = (ts: number) => new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="c0-app">
      <SideRail active={tab} alerts={alerts} />
      <div className="c0-app__body">
      {header ?? (
        <Header
          title={title}
          sub={sub}
          wifBalance={balances.data ? fmtWif(balances.data.wif) : undefined}
          avatar={{ src: me?.xAvatar ?? null, address: session.address ?? undefined }}
          onOpenMenu={shell.openMenu}
          extra={<><TodoBell /><SoundToggle /></>}
          back={back ? { onClick: () => (history.length > 1 ? router.back() : router.push("/")) } : undefined}
        />
      )}
      {tab !== "raids" ? <RaidStrip /> : null}
      {!shell.online && (
        <BlockedStrip>
          Offline · showing your colony{shell.lastOnline ? ` as of ${timeOf(shell.lastOnline)}` : ""}
        </BlockedStrip>
      )}
      {shell.updateReady && (
        <div className="c0-update">
          <span>A new version of <BrandName /> is ready.</span>
          <Button variant="paper" size="compact" onClick={shell.applyUpdate}>
            Update
          </Button>
        </div>
      )}
      <main className={tab ? "c0-main" : "c0-main c0-main--narrow"}>{children}</main>
      {tab && <BottomNav active={tab} alerts={alerts} onSelect={(t) => router.push(tabHref(t))} />}
      </div>
    </div>
  );
}
