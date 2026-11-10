"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Avatar, Button, Card, StatRow, StatTile, Underway } from "../../ui";
import { Screen } from "../../shell/Screen";
import { displayName, fmtDuration, fmtInt, fmtRes } from "../../lib/format";
import { useColonies, useNow, useProfile, useSeason } from "../../lib/game";
import { useSession } from "../../lib/session";
import { useXProfile } from "../../lib/useXProfile";
import type { XProfile } from "../../lib/api";
import { ActivityCard } from "./ActivityCard";
import { ClaimButton } from "./ClaimButton";
import { RankCard } from "./RankCard";
import { RaidRecord } from "./RaidRecord";
import { SendWifSheet } from "../wallet/SendWifSheet";

export function ProfileScreen() {
  const params = useSearchParams();
  const session = useSession();
  const raw = (params.get("addr") ?? session.address ?? "").toLowerCase();
  const addr = /^0x[0-9a-f]{40}$/.test(raw) ? raw : null;
  const isMe = !!addr && addr === session.address;
  const now = useNow(60_000);
  const profile = useProfile(addr);
  const colonies = useColonies();
  const season = useSeason();
  const x = useXProfile(addr);

  if (!addr) {
    return (
      <Screen back>
        <Card><p className="c0-pf__empty">Sign in to see your colony, or open a neighbour from the Raids or Live tabs.</p></Card>
      </Screen>
    );
  }
  const p = profile.data;
  if (!p) {
    return (
      <Screen back>
        <Header addr={addr} x={x} />
        <Underway label="Reading the colony…" />
      </Screen>
    );
  }
  if (p.colonyId === 0n) {
    return (
      <Screen back>
        <Header addr={addr} x={x} />
        {!isMe && session.signedIn ? <SendWif addr={addr} /> : null}
        <Card>
          <p className="c0-pf__empty">
            {isMe
              ? "You have no colony this season. Found one on the Colony tab and your record will build up here."
              : "No colony here this season. Once they found one, their ants, raids and rank show up here."}
          </p>
          {isMe ? <Link className="c0-pf__link" href="/">Open the Colony tab ›</Link> : null}
        </Card>
        {isMe ? <ClaimButton wallet={addr} season={season.data?.season} /> : null}
      </Screen>
    );
  }

  const ago = Math.max(0, now - Number(p.foundedAt));
  return (
    <Screen back>
      <Header addr={addr} x={x} founded={`founded on day ${p.foundedDay} · ${ago < 86400 ? `${fmtDuration(ago)} ago` : `${Math.floor(ago / 86400)} days ago`}`} />
      {!isMe && session.signedIn ? <SendWif addr={addr} /> : null}
      <RankCard addr={addr} profile={p} rows={colonies.data} loading={colonies.loading} pot={season.data?.pot} isMe={isMe} />
      <StatRow>
        <StatTile res="ant" value={`${fmtInt(p.ants)}/${fmtInt(p.capacity)}`} caption="ants" />
        <StatTile res="chamber" value={fmtInt(p.chambers)} caption="chambers" />
        <StatTile res="trail" value={fmtInt(p.trails)} caption="trails" />
        <StatTile res="farm" value={fmtInt(p.farms)} caption="farms" />
        <StatTile res="ant" value={fmtInt(p.freeAnts)} caption="free ants" />
      </StatRow>
      <StatRow className="c0-statrow--store">
        <StatTile res="leaf" value={`~${fmtRes(p.leaves)}`} caption="leaves in store" />
        <StatTile res="sugar" value={`~${fmtRes(p.sugar)}`} caption="sugar in store" />
      </StatRow>
      {isMe ? <ClaimButton wallet={addr} season={season.data?.season} /> : null}
      <RaidRecord addr={addr} profile={p} me={session.address} isMe={isMe} />
      <ActivityCard addr={addr} isMe={isMe} />
    </Screen>
  );
}

/** Send WIF to the colony on this profile: opens the send sheet with them filled in. */
function SendWif({ addr }: { addr: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="wif" icon="wif" fullWidth onClick={() => setOpen(true)}>Send WIF</Button>
      <SendWifSheet open={open} onClose={() => setOpen(false)} to={addr} />
    </>
  );
}

function Header({ addr, x, founded }: { addr: string; x?: XProfile | null; founded?: string }) {
  const xHandle = x?.xHandle;
  const xAvatar = x?.xAvatar;
  const name = displayName(addr, x);
  return (
    <section className="c0-pf__head" aria-label="Player">
      <Avatar size={64} src={xAvatar ?? null} address={addr} alt={name} />
      <div className="c0-pf__who">
        <div className="c0-pf__name">{name}</div>
        {founded ? <div className="c0-pf__founded">{founded}</div> : null}
      </div>
      {xHandle ? (
        <a className="c0-pf__x" href={`https://x.com/${xHandle}`} target="_blank" rel="noreferrer" aria-label={`Open @${xHandle} on X`}>X</a>
      ) : null}
    </section>
  );
}
