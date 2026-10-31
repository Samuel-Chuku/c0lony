"use client";
// The frame every app screen sits in: header (title or back link, WIF balance, the player's X picture that
// opens the Menu), the offline and update strips, the content, and the three-tab bottom nav on main screens.
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { BlockedStrip, BottomNav, Button, Header, type NavTab } from "../ui";
import { useBalances } from "../lib/game";
import { useSession } from "../lib/session";
import { useXProfile } from "../lib/useXProfile";
import { fmtWif } from "../lib/format";
import { useShell } from "./Providers";

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

export const tabHref = (tab: NavTab) => (tab === "colony" ? "/" : `/?tab=${tab}`);

export function Screen({ title, sub, tab, back, header, children }: ScreenProps) {
  const router = useRouter();
  const shell = useShell();
  const session = useSession();
  const balances = useBalances(session.address);
  const me = useXProfile(session.address);
  const timeOf = (ts: number) => new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="c0-app">
      {header ?? (
        <Header
          title={title}
          sub={sub}
          wifBalance={balances.data ? fmtWif(balances.data.wif) : undefined}
          avatar={{ src: me?.xAvatar ?? null, address: session.address ?? undefined }}
          onOpenMenu={shell.openMenu}
          back={back ? { onClick: () => (history.length > 1 ? router.back() : router.push("/")) } : undefined}
        />
      )}
      {!shell.online && (
        <BlockedStrip>
          Offline · showing your colony{shell.lastOnline ? ` as of ${timeOf(shell.lastOnline)}` : ""}
        </BlockedStrip>
      )}
      {shell.updateReady && (
        <div className="c0-update">
          <span>A new version of C0LONY is ready.</span>
          <Button variant="paper" size="compact" onClick={shell.applyUpdate}>
            Update
          </Button>
        </div>
      )}
      <main className="c0-main">{children}</main>
      {tab && <BottomNav active={tab} onSelect={(t) => router.push(tabHref(t))} />}
    </div>
  );
}
