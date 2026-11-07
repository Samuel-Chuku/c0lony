"use client";
// The Menu: who you are, the wallet card, the four links, Voter's Pass status and log out.
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Avatar, Button, Card, Drawer, PixelIcon, type IconName, Wif, ResIcon } from "../ui";
import { displayName, fmtEth, fmtWif, shortAddress } from "../lib/format";
import { useStarterGas } from "../lib/starterGas";
import { NETWORK } from "../config";
import { useBalances, useColonies, useProfile } from "../lib/game";
import { useSession } from "../lib/session";
import { useShell, type Look } from "./Providers";
import { useXProfile } from "../lib/useXProfile";
import { GetWifSheet } from "../screens/wallet/GetWifSheet";
import { AddFundsSheet } from "../screens/wallet/AddFundsSheet";
import "./menu.css";

export function MenuDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useSession();
  const shell = useShell();
  const me = session.address;
  const x = useXProfile(me);
  const balances = useBalances(me);
  useStarterGas(); // asks once for a new wallet's first gas; the caption below stays
  const profile = useProfile(me);
  const colonies = useColonies();
  const path = usePathname();
  const [copied, setCopied] = useState(false);
  const [buy, setBuy] = useState(false);
  const [fund, setFund] = useState(false);

  useEffect(() => { if (open) onClose(); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  let rank: number | null = null;
  if (me && colonies.data) {
    const sorted = [...colonies.data].sort((a, b) => (a.score === b.score ? (a.id < b.id ? -1 : 1) : a.score > b.score ? -1 : 1));
    const i = sorted.findIndex((r) => r.owner.toLowerCase() === me);
    if (i >= 0) rank = i + 1;
  }

  const link = (href: string, icon: IconName, label: string, extra?: string) => (
    <Link href={href} className="c0-menu__link" onClick={onClose}>
      <PixelIcon name={icon} />
      <span>{label}</span>
      {extra ? <span className="c0-menu__rank">{extra}</span> : null}
      <span aria-hidden="true">›</span>
    </Link>
  );

  return (
    <>
      <Drawer open={open} onClose={onClose} title="Menu">
        {session.signedIn && me ? (
          <>
            <div className="c0-menu__who">
              <Avatar size={56} src={x?.xAvatar ?? null} address={me} alt="Your avatar" />
              <div>
                <span className="c0-menu__handle">{displayName(me, x?.xHandle)}</span>
                <Link href={`/colony?addr=${me}`} className="c0-menu__profile" onClick={onClose}>view your profile ›</Link>
              </div>
            </div>
            <Card className="c0-menu__card">
              <div className="c0-menu__cap"><span>WALLET</span><span>gas sponsored for new players</span></div>
              <div className="c0-menu__bal">
                <span className="c0-menu__chip"><Wif>{balances.data ? fmtWif(balances.data.wif) : "…"}</Wif></span>
                <span className="c0-menu__eth">{balances.data ? fmtEth(balances.data.eth) : "…"} ETH</span>
              </div>
              <div className="c0-menu__addr">
                <span>{shortAddress(me)}</span>
                <Button variant="paper" size="compact" onClick={() => { void navigator.clipboard?.writeText(me).then(() => setCopied(true)).catch(() => {}); }}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <div className="c0-menu__btns">
                <Button variant="wif" size="compact" icon="swap" fullWidth onClick={() => setBuy(true)}>Buy WIF</Button>
                <Button variant="paper" size="compact" fullWidth onClick={() => setFund(true)}>Add funds</Button>
              </div>
            </Card>
          </>
        ) : (
          <div className="c0-menu__who">
            <Avatar size={56} alt="Not signed in" />
            <div>
              {session.configured ? (
                <Button variant="paper" onClick={() => { onClose(); session.login(); }}>Sign in</Button>
              ) : (
                <span className="c0-menu__profile" style={{ textDecoration: "none" }}>Sign-in opens soon</span>
              )}
            </div>
          </div>
        )}
        <nav className="c0-menu__links" aria-label="Menu">
          {link("/leaderboard", "trophy", "Leaderboard", rank ? `#${rank}` : undefined)}
          {link("/invite", "invite", "Invite friends")}
          {link("/how-to-play", "book", "How to play")}
          {link("/about", "globe", "About")}
          {link("/settings", "gear", "Settings")}
        </nav>
        <div className="c0-menu__look" role="group" aria-label="Look">
          <span className="c0-menu__look-cap">LOOK · Auto follows your phone</span>
          <div className="c0-menu__look-opts">
            {(["auto", "soil", "day"] as Look[]).map((l) => (
              <button key={l} type="button" className="c0-chip" aria-pressed={shell.look === l} onClick={() => shell.setLook(l)}>
                {l === "auto" ? "Auto" : l === "soil" ? "Soil" : "Daylight"}
              </button>
            ))}
          </div>
        </div>
        {session.signedIn && me ? (
          <div className="c0-menu__assets" role="group" aria-label="Balances">
            <span className="c0-menu__look-cap">BALANCES</span>
            <div className="c0-menu__asset">
              <PixelIcon name="eth" />
              <span className="c0-menu__asset-name">ETH</span>
              <span className="c0-menu__asset-amt">{balances.data ? fmtEth(balances.data.eth) : "…"}</span>
            </div>
            <div className="c0-menu__asset">
              <ResIcon name="wif" size={20} />
              <span className="c0-menu__asset-name">WIF</span>
              <span className="c0-menu__asset-amt">{balances.data ? fmtWif(balances.data.wif) : "…"}</span>
            </div>
            <span className="c0-menu__asset-cap">on {NETWORK.name}</span>
          </div>
        ) : null}
        {session.signedIn ? (
          <div className="c0-menu__foot">
            <span>{profile.data?.hasVoterPass ? "Voter's Pass linked" : "No Voter's Pass"}</span>
            <button type="button" className="c0-menu__logout" onClick={() => { onClose(); void session.logout(); }}>Log out</button>
          </div>
        ) : null}
      </Drawer>
      <GetWifSheet open={buy} onClose={() => setBuy(false)} />
      <AddFundsSheet open={fund} onClose={() => setFund(false)} address={me} />
    </>
  );
}
