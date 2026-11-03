"use client";
// Desktop-only cards for the Raids screen's right column (hidden below 1024px): what you can march with now,
// how a raid lands, and your latest raid results.
import Link from "next/link";
import { Card, Hand, ResIcon } from "../../ui";
import { fmtDuration, fmtInt } from "../../lib/format";
import { LOOT, type Profile } from "../../lib/game";
import type { FeedEvent } from "../../lib/api";
import { LiveRow } from "../live/LiveRow";

export function YourRaiders({ me, cooldownLeft, underAttack }: { me: Profile; cooldownLeft: number; underAttack: boolean }) {
  const free = Number(me.freeAnts);
  const status = underAttack ? "Not while a raid marches on you" : cooldownLeft > 0 ? `Next raid in ${fmtDuration(cooldownLeft)}` : free === 0 ? "No free ants · unassign some to raid" : "Ready to raid";
  return (
    <Card className="c0-desk c0-raiders">
      <h2 className="c0-pf__h2">Your raiders</h2>
      <div className="c0-raiders__big"><ResIcon name="ant" size={30} />{fmtInt(free)} <span>free ants march</span></div>
      <div className="c0-raiders__line">Carry home up to <b>{fmtInt(free * LOOT.perAnt)}</b> leaves or sugar</div>
      <div className={`c0-raiders__status${cooldownLeft > 0 || underAttack || free === 0 ? " c0-raiders__status--wait" : ""}`}>{status}</div>
    </Card>
  );
}

export function RaidRules() {
  return (
    <Card className="c0-desk c0-rules">
      <h2 className="c0-pf__h2">How a raid lands</h2>
      <ul>
        <li><b>No guard:</b> you win and take {LOOT.minPct} to {LOOT.maxPct}% of the target.</li>
        <li><b>Wrong guard:</b> you win and take {LOOT.wrongGuardMinPct} to {LOOT.maxPct}%.</li>
        <li><b>Right guard:</b> the raid fails and a quarter of your marching ants fall.</li>
        <li>Loot is capped at {LOOT.perAnt} per marching ant. The defender has 4 hours to guard.</li>
      </ul>
      <Link href="/how-to-play">The full rules ›</Link>
    </Card>
  );
}

const RAID_TYPES = new Set(["settled", "collected", "raid_launched", "avenge_granted", "guarded"]);

export function RecentRaids({ rows, me, now }: { rows: FeedEvent[] | undefined; me: string | null; now: number }) {
  const shown = (rows ?? []).filter((e) => RAID_TYPES.has(e.type)).slice(0, 4);
  return (
    <section className="c0-desk c0-recent" aria-label="Your recent raids">
      <div className="c0-sect">
        <h2>Your raids</h2>
        <Link href="/?tab=live">all activity ›</Link>
      </div>
      {shown.length === 0 ? (
        <Hand size={16} className="c0-recent__empty">No raids yet. Pick a neighbour with plenty of sugar.</Hand>
      ) : (
        <ul className="c0-feedlist">
          {shown.map((ev) => <li key={ev.id}><LiveRow ev={ev} me={me} now={now} /></li>)}
        </ul>
      )}
    </section>
  );
}
