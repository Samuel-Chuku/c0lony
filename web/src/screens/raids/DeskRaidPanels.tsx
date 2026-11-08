"use client";
// Desktop-only cards for the Raids screen's right column (hidden below 1024px): what you can march with now,
// how a raid lands, and your latest raid results.
import Link from "next/link";
import { Card, Hand, ResIcon } from "../../ui";
import { fmtDuration, fmtInt } from "../../lib/format";
import { LOOT, Status, inRange, type ColonyRow, type Profile } from "../../lib/game";
import { useFeed, type FeedEvent } from "../../lib/api";
import { Handle } from "../live/feedText";
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
  const shown = (rows ?? []).filter((e) => RAID_TYPES.has(e.type)).slice(0, 5);
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
          {shown.map((ev) => <li key={ev.id}><LiveRow ev={ev} me={me} now={now} compact /></li>)}
        </ul>
      )}
    </section>
  );
}

/** Computer only, under the neighbour list: living colonies you can't raid yet, and why. */
export function OutOfRange({ colonies, me, myAnts, now }: { colonies: ColonyRow[] | undefined; me: string | null; myAnts: number; now: number }) {
  const rows = (colonies ?? [])
    .filter((c) => c.owner !== me && c.status === Status.Alive && !inRange(myAnts, c.workers))
    .sort((a, b) => b.workers - a.workers)
    .slice(0, 6);
  if (rows.length === 0) return null;
  return (
    <section className="c0-desk c0-recent c0-oor" aria-label="Colonies out of range">
      <div className="c0-sect">
        <h2>Out of range</h2>
        <span>you can raid {Math.ceil(myAnts / 2)} to {myAnts * 2} ants</span>
      </div>
      <ul className="c0-oor__list">
        {rows.map((c) => (
          <li key={String(c.id)} className="c0-oor__row">
            <Handle addr={c.owner} />
            <span className="c0-oor__ants"><ResIcon name="ant" size={18} label="ants" /> {c.workers}</span>
            <span className="c0-oor__why">
              {c.workers > myAnts * 2 ? `grow to ${Math.ceil(c.workers / 2)} ants to raid them` : "too small to raid"}
              {c.shieldUntil > now ? " · shielded" : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Computer only: the latest raid results across the game. */
export function RaidsAround({ me, now }: { me: string | null; now: number }) {
  const feed = useFeed("raids", null, 20);
  const shown = (feed.data ?? []).filter((e) => e.type === "settled" || e.type === "raid_launched").slice(0, 5);
  if (shown.length === 0) return null;
  return (
    <section className="c0-desk c0-recent" aria-label="Raids around the game">
      <div className="c0-sect">
        <h2>Raids around you</h2>
        <Link href="/?tab=live">live feed ›</Link>
      </div>
      <ul className="c0-feedlist">
        {shown.map((ev) => <li key={ev.id}><LiveRow ev={ev} me={me} now={now} compact /></li>)}
      </ul>
    </section>
  );
}
