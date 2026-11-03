"use client";
// Desktop-only extras for the Colony screen (hidden below 1024px): the colony at a glance under the picture,
// and the player's own recent activity beside it. Phones keep the short screen.
import Link from "next/link";
import { Hand, StatRow, StatTile } from "../../ui";
import { fmtInt } from "../../lib/format";
import { PER_ANT_PER_HOUR, type Profile } from "../../lib/game";
import type { FeedEvent } from "../../lib/api";
import { LiveRow } from "../live/LiveRow";
import { QUIET_TYPES } from "../live/feedText";

const perHour = (ants: number) => {
  const v = ants * PER_ANT_PER_HOUR;
  return v === 0 ? "0" : v < 10 ? v.toFixed(1) : fmtInt(Math.round(v));
};

export function ColonyGlance({ profile: p, rank }: { profile: Profile; rank: number | null }) {
  return (
    <section className="c0-desk c0-glance" aria-label="Your colony at a glance">
      <StatRow className="c0-glance__row">
        <StatTile res="ant" value={`${p.ants}/${fmtInt(p.capacity)}`} caption="ants · room" />
        <StatTile res="ant" value={p.freeAnts} caption="free · forage and raid" />
        <StatTile res="leaf" value={`+${perHour(p.trailWorkers)}`} caption={`leaves an hour · ${p.trails} trails`} />
        <StatTile res="sugar" value={`+${perHour(p.farmWorkers)}`} caption={`sugar an hour · ${p.farms} farms`} />
        <StatTile icon="trophy" value={fmtInt(p.score)} caption={rank ? `score · rank #${rank}` : "score"} />
        <StatTile icon="raids" value={`${p.raidsWon}–${p.raidsLost}`} caption={`raids won–lost · ${p.raidsDefended} held`} />
      </StatRow>
    </section>
  );
}

export function RecentActivity({ rows, me, now }: { rows: FeedEvent[] | undefined; me: string | null; now: number }) {
  const shown = (rows ?? []).filter((e) => !QUIET_TYPES.has(e.type)).slice(0, 5);
  return (
    <section className="c0-desk c0-recent" aria-label="Your recent activity">
      <div className="c0-sect">
        <h2>Your log</h2>
        <Link href="/?tab=live">all activity ›</Link>
      </div>
      {shown.length === 0 ? (
        <Hand size={16} className="c0-recent__empty">Nothing yet today. Feed the queen, tend, and the log fills up.</Hand>
      ) : (
        <ul className="c0-feedlist">
          {shown.map((ev) => (
            <li key={ev.id}><LiveRow ev={ev} me={me} now={now} /></li>
          ))}
        </ul>
      )}
    </section>
  );
}
