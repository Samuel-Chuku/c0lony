"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Avatar, Card, StatRow, StatTile, Underway } from "../../ui";
import { Screen } from "../../shell/Screen";
import { displayName, fmtDuration, fmtInt, shortAddress } from "../../lib/format";
import { useColonies, useNow, useProfile, useSeason } from "../../lib/game";
import { useSession } from "../../lib/session";
import { useXProfile } from "../../lib/useXProfile";
import { ActivityCard } from "./ActivityCard";
import { ClaimButton } from "./ClaimButton";
import { RankCard } from "./RankCard";
import { RaidRecord } from "./RaidRecord";

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
        <Header addr={addr} xHandle={x?.xHandle} xAvatar={x?.xAvatar} />
        <Underway label="Reading the colony…" />
      </Screen>
    );
  }
  if (p.colonyId === 0n) {
    return (
      <Screen back>
        <Header addr={addr} xHandle={x?.xHandle} xAvatar={x?.xAvatar} />
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
      <Header addr={addr} xHandle={x?.xHandle} xAvatar={x?.xAvatar} founded={`founded on day ${p.foundedDay} · ${ago < 86400 ? `${fmtDuration(ago)} ago` : `${Math.floor(ago / 86400)} days ago`}`} />
      <RankCard addr={addr} profile={p} rows={colonies.data} loading={colonies.loading} pot={season.data?.pot} isMe={isMe} />
      <StatRow>
        <StatTile icon="ant" value={`${fmtInt(p.ants)}/${fmtInt(p.capacity)}`} caption="ants" />
        <StatTile icon="chamber" value={fmtInt(p.chambers)} caption="chambers" />
        <StatTile icon="leaf" value={fmtInt(p.trails)} caption="trails" />
        <StatTile icon="sugar" value={fmtInt(p.farms)} caption="farms" />
        <StatTile icon="ant-head" value={fmtInt(p.freeAnts)} caption="free ants" />
      </StatRow>
      {isMe ? <ClaimButton wallet={addr} season={season.data?.season} /> : null}
      <RaidRecord addr={addr} profile={p} me={session.address} isMe={isMe} />
      <ActivityCard addr={addr} isMe={isMe} />
    </Screen>
  );
}

function Header({ addr, xHandle, xAvatar, founded }: { addr: string; xHandle?: string | null; xAvatar?: string | null; founded?: string }) {
  const name = displayName(addr, xHandle);
  return (
    <section className="c0-pf__head" aria-label="Player">
      <Avatar size={64} src={xAvatar ?? null} address={addr} alt={xHandle ? `@${xHandle}` : shortAddress(addr)} />
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
